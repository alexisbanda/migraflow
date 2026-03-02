const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue }         = require('firebase-admin/firestore')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const { db, storage }        = require('./lib/admin')
const { assertRole, throwFn } = require('./lib/errors')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const archiver = require('archiver')

const MAX_SIZE_BYTES = 15 * 1024 * 1024  // 15 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Descarga un archivo de Storage a /tmp y devuelve el Buffer.
 * @param {string} gsPath  Ruta en el bucket (sin gs://bucket/)
 * @param {string} bucketName
 * @returns {Promise<Buffer>}
 */
async function downloadToBuffer(gsPath, bucketName) {
  const tmpPath = path.join(os.tmpdir(), `migraflow_${Date.now()}_${path.basename(gsPath)}`)
  await storage.bucket(bucketName).file(gsPath).download({ destination: tmpPath })
  const buf = fs.readFileSync(tmpPath)
  fs.unlinkSync(tmpPath)
  return buf
}

/**
 * Genera la portada del paquete migratorio.
 * @param {PDFDocument} mergedPdf
 * @param {{ clientName: string, caseType: string, totalDocs: number, generatedAt: Date }} meta
 */
async function insertCoverPage(mergedPdf, meta) {
  const coverPage = mergedPdf.insertPage(0)           // insertar al principio
  const { width, height } = coverPage.getSize()

  const fontBold    = await mergedPdf.embedFont(StandardFonts.HelveticaBold)
  const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica)

  const dark  = rgb(0.07, 0.09, 0.11)  // ~slate-950
  const green = rgb(0.29, 0.33, 0.12)  // ~military-600 #4b5320
  const grey  = rgb(0.45, 0.49, 0.54)  // ~slate-500

  // Fondo oscuro
  coverPage.drawRectangle({ x: 0, y: 0, width, height, color: dark })

  // Banda de acento superior
  coverPage.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: green })

  // Título
  coverPage.drawText('PAQUETE MIGRATORIO', {
    x: 50, y: height - 100,
    size: 28, font: fontBold, color: rgb(0.95, 0.96, 0.97),
  })

  // Subtítulo — tipo de expediente
  const caseLabel = {
    nomada_digital:         'Visa Nómada Digital',
    residencia_no_lucrativa: 'Residencia No Lucrativa',
    cuenta_ajena:           'Residencia y Trabajo por Cuenta Ajena',
    reagrupacion_familiar:  'Reagrupación Familiar',
  }[meta.caseType] ?? meta.caseType

  coverPage.drawText(caseLabel, {
    x: 50, y: height - 140,
    size: 14, font: fontRegular, color: green,
  })

  // Línea divisoria
  coverPage.drawLine({
    start: { x: 50, y: height - 165 },
    end:   { x: width - 50, y: height - 165 },
    thickness: 1,
    color: rgb(0.15, 0.18, 0.22),
  })

  // Datos
  const rows = [
    ['Cliente',          meta.clientName],
    ['Documentos',       `${meta.totalDocs} archivos validados`],
    ['Generado el',      meta.generatedAt.toLocaleDateString('es-ES', {
                           day: '2-digit', month: 'long', year: 'numeric',
                         })],
  ]

  rows.forEach(([label, value], i) => {
    const y = height - 220 - i * 36
    coverPage.drawText(`${label}:`, { x: 50,  y, size: 11, font: fontBold,    color: grey })
    coverPage.drawText(value,       { x: 180, y, size: 11, font: fontRegular, color: rgb(0.85, 0.87, 0.90) })
  })

  // Footer
  coverPage.drawText('Generado por MigraFlow · Documento confidencial', {
    x: 50, y: 40,
    size: 8, font: fontRegular, color: grey,
  })
}

/**
 * Crea un PDF unificado para un cliente específico.
 * @param {Array} requirements 
 * @param {Object} meta 
 * @param {string} bucketName 
 * @returns {Promise<Buffer>}
 */
async function generateClientPdf(requirements, meta, bucketName) {
  const mergedPdf = await PDFDocument.create()
  const downloadErrors = []

  for (const req of requirements) {
    if (!req.file_url || !req.storage_path) continue
    try {
      const pdfBytes = await downloadToBuffer(req.storage_path, bucketName)
      const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
      const srcPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices())
      srcPages.forEach((p) => mergedPdf.addPage(p))
    } catch (err) {
      console.error(`[Package] Error req ${req.id}: ${err.message}`)
      downloadErrors.push(req.name ?? req.id)
    }
  }

  if (mergedPdf.getPageCount() === 0) return null

  await insertCoverPage(mergedPdf, {
    clientName:  meta.clientName,
    caseType:    meta.caseType,
    totalDocs:   requirements.length - downloadErrors.length,
    generatedAt: new Date(),
  })

  return Buffer.from(await mergedPdf.save())
}

// ─── Función principal ────────────────────────────────────────────────────────

exports.generateMigratoryPackage = onCall(
  {
    region:         'europe-west1',
    timeoutSeconds: 300,
    memory:         '1GiB',
  },
  async (request) => {
    // 1. Verificar autenticación y rol
    const { agencyId: callerAgency } = assertRole(request, ['agency_admin', 'lawyer'])
    const { caseId, agencyId: requestedAgencyId } = request.data ?? {}

    if (!caseId || !requestedAgencyId) throwFn('invalid-argument', 'Faltan parámetros.')
    if (callerAgency !== requestedAgencyId) throwFn('permission-denied', 'Sin permisos.')

    // 2. Leer expediente y beneficiarios
    const caseRef  = db.collection('cases').doc(caseId)
    const caseSnap = await caseRef.get()
    if (!caseSnap.exists) throwFn('not-found', 'Expediente no encontrado.')
    const caseData = caseSnap.data()

    // 2.5 Validar deuda financiera
    const billingSnap = await caseRef.collection('billing').limit(1).get()
    if (!billingSnap.empty) {
      const billing = billingSnap.docs[0].data()
      if (billing.payment_status === 'debt' && billing.block_generation_on_debt !== false) {
        throwFn('failed-precondition', 'Generación bloqueada por deuda pendiente. Registra el pago para continuar.')
      }
    }

    // 3. Leer clientes (Titular + Beneficiarios)
    const titularSnap = await db.collection('clients').doc(caseData.clientId).get()
    const tpd = titularSnap.data()?.personal_data ?? {}
    const titularName = `${tpd.first_name ?? ''} ${tpd.last_name ?? ''}`.trim() || 'Titular'
    clientMap[caseData.clientId] = titularName

    // Beneficiarios
    for (const ben of (caseData.beneficiaries || [])) {
      clientMap[ben.clientId] = ben.name || 'Beneficiario'
    }

    // 3. Obtener requirements validados
    const reqsSnap = await caseRef.collection('requirements')
      .where('status', '==', 'validated')
      .orderBy('merge_order', 'asc')
      .get()

    if (reqsSnap.empty) throwFn('failed-precondition', 'No hay documentos validados.')

    const requirements = reqsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    
    // 4. Agrupar por cliente
    const groups = {}
    requirements.forEach(req => {
      const cid = req.belongs_to_client_id || caseData.clientId
      if (!groups[cid]) groups[cid] = []
      groups[cid].push(req)
    })

    const bucketName = storage.bucket().name
    const clientsInCase = Object.keys(groups)
    const isMulti = clientsInCase.length > 1
    const timestamp = Date.now()

    let finalBuffer
    let fileType = 'pdf'
    let packagePath

    if (!isMulti) {
      // Un solo cliente: PDF directo
      const cid = clientsInCase[0]
      finalBuffer = await generateClientPdf(groups[cid], { 
        clientName: clientMap[cid] || titularName, 
        caseType: caseData.type 
      }, bucketName)
      
      if (!finalBuffer) throwFn('internal', 'Error generando PDF.')
      packagePath = `${callerAgency}/${caseId}/package/package_${timestamp}.pdf`
    } else {
      // Varios clientes: Generar ZIP
      fileType = 'zip'
      packagePath = `${callerAgency}/${caseId}/package/package_${timestamp}.zip`
      
      const zipPath = path.join(os.tmpdir(), `migraflow_${timestamp}.zip`)
      const output = fs.createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      const zipPromise = new Promise((resolve, reject) => {
        output.on('close', resolve)
        archive.on('error', reject)
      })

      archive.pipe(output)

      for (const cid of clientsInCase) {
        const clientPdf = await generateClientPdf(groups[cid], { 
          clientName: clientMap[cid], 
          caseType: caseData.type 
        }, bucketName)
        
        if (clientPdf) {
          const safeName = (clientMap[cid] || cid).replace(/[^a-z0-9]/gi, '_').toLowerCase()
          archive.append(clientPdf, { name: `Expediente_${safeName}.pdf` })
        }
      }

      await archive.finalize()
      await zipPromise
      finalBuffer = fs.readFileSync(zipPath)
      fs.unlinkSync(zipPath)
    }

    // 5. Subir a Storage
    const fileRef = storage.bucket(bucketName).file(packagePath)
    await fileRef.save(finalBuffer, {
      metadata: {
        contentType: fileType === 'zip' ? 'application/zip' : 'application/pdf',
        cacheControl: 'private, max-age=3600',
      },
    })

    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    const fileSizeMb = parseFloat((finalBuffer.byteLength / 1024 / 1024).toFixed(2))

    // 6. Actualizar Firestore
    const packageInfo = {
      file_url:      signedUrl,
      file_type:     fileType,
      storage_path:  packagePath,
      file_size_mb:  fileSizeMb,
      total_docs:    requirements.length,
      generated_at:  FieldValue.serverTimestamp(),
      generated_by:  request.auth.uid,
    }

    await caseRef.update({ last_package: packageInfo })

    // Audit Log
    try {
      await db.collection('agencies').doc(callerAgency).collection('audit_logs').add({
        user_uid: request.auth.uid,
        action: 'GENERATE_PACKAGE',
        target_type: 'case',
        target_id: caseId,
        metadata: { file_size_mb: fileSizeMb, total_docs: requirements.length, file_type: fileType },
        timestamp: FieldValue.serverTimestamp(),
      })
    } catch (e) { console.warn('[Audit] Fail:', e.message) }

    return {
      status: 'success',
      file_url: signedUrl,
      file_type: fileType,
      file_size_mb: fileSizeMb,
      total_docs: requirements.length,
    }
  }
)

