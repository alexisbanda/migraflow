/**
 * generateMigratoryPackage — "Magic Button"
 * ─────────────────────────────────────────────────────────────────────────────
 * Trigger : onCall (llamada desde React por un lawyer o agency_admin)
 *
 * Input payload: { caseId: string, agencyId: string }
 *
 * Flujo:
 *  1. Verifica autenticación y rol (lawyer | agency_admin).
 *  2. Verifica que el agencyId del token coincide con el del expediente (RGPD).
 *  3. Lee todos los requirements en estado "validated", ordenados por merge_order.
 *  4. Descarga cada PDF desde Storage a /tmp.
 *  5. Une los PDFs con pdf-lib respetando merge_order.
 *  6. Añade una portada minimalista con metadata del expediente.
 *  7. Sube el PDF final a Storage: /{agencyId}/{caseId}/package/package_{timestamp}.pdf
 *  8. Actualiza /cases/{caseId} con la URL del paquete y timestamp.
 *
 * Output: { status: "success", file_url: string, file_size_mb: number, total_docs: number }
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue }         = require('firebase-admin/firestore')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const { db, storage }        = require('./lib/admin')
const { assertRole, throwFn } = require('./lib/errors')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

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

    if (!caseId || !requestedAgencyId) {
      throwFn('invalid-argument', 'Se requieren caseId y agencyId.')
    }

    // El llamante solo puede operar sobre expedientes de su propia agencia
    if (callerAgency !== requestedAgencyId) {
      throwFn('permission-denied', 'No tienes permisos sobre esta agencia.')
    }

    // 2. Leer el expediente
    const caseRef  = db.collection('cases').doc(caseId)
    const caseSnap = await caseRef.get()

    if (!caseSnap.exists) throwFn('not-found', `Expediente ${caseId} no encontrado.`)

    const caseData = caseSnap.data()

    if (caseData.agencyId !== callerAgency) {
      throwFn('permission-denied', 'El expediente no pertenece a tu agencia.')
    }

    // Lawyer: solo puede empaquetar si está asignado al caso.
    // Soporta tanto assignee_uids (Fase 6) como el legacy assigned_lawyer_id.
    if (request.auth.token.role === 'lawyer') {
      const isAssigned =
        caseData.assigned_lawyer_id === request.auth.uid ||
        (caseData.assignee_uids ?? []).includes(request.auth.uid)
      if (!isAssigned) throwFn('permission-denied', 'No estás asignado a este expediente.')
    }

    // 3. Obtener requirements validados ordenados por merge_order
    const reqsSnap = await db
      .collection('cases')
      .doc(caseId)
      .collection('requirements')
      .where('status', '==', 'validated')
      .orderBy('merge_order', 'asc')
      .get()

    if (reqsSnap.empty) {
      throwFn('failed-precondition', 'No hay documentos validados para empaquetar.')
    }

    const requirements = reqsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    console.log(`[Package] ${requirements.length} documentos validados para caseId=${caseId}`)

    // 4 & 5. Descargar PDFs y unirlos con pdf-lib
    const bucketName = storage.bucket().name
    const mergedPdf  = await PDFDocument.create()

    const downloadErrors = []

    for (const req of requirements) {
      if (!req.file_url) {
        console.warn(`[Package] req ${req.id} no tiene file_url. Omitido.`)
        continue
      }

      try {
        // La file_url es una URL pública o un gs:// path.
        // Guardamos el gs:// path en Firestore como storage_path para uso interno.
        const storagePath = req.storage_path   // e.g. agencyId/clientId/caseId/reqId/doc.pdf
        const pdfBytes    = await downloadToBuffer(storagePath, bucketName)

        const srcDoc  = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
        const srcPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices())
        srcPages.forEach((p) => mergedPdf.addPage(p))

        console.log(`[Package] ✓ ${req.name} (${srcDoc.getPageCount()} páginas)`)
      } catch (err) {
        console.error(`[Package] Error al procesar req ${req.id}: ${err.message}`)
        downloadErrors.push(req.name ?? req.id)
      }
    }

    if (mergedPdf.getPageCount() === 0) {
      throwFn('internal', 'No se pudo cargar ningún PDF. Verifica los archivos subidos.')
    }

    // 6. Insertar portada
    // Leer el nombre del cliente
    let clientName = 'Cliente'
    try {
      const clientSnap = await db.collection('clients').doc(caseData.clientId).get()
      const pd = clientSnap.data()?.personal_data ?? {}
      clientName = `${pd.first_name ?? ''} ${pd.last_name ?? ''}`.trim() || 'Cliente'
    } catch (_) { /* no bloqueamos si falla */ }

    await insertCoverPage(mergedPdf, {
      clientName,
      caseType:   caseData.type,
      totalDocs:  requirements.length - downloadErrors.length,
      generatedAt: new Date(),
    })

    // 7. Serializar y verificar tamaño
    const finalBytes = await mergedPdf.save()

    if (finalBytes.byteLength > MAX_SIZE_BYTES) {
      console.warn(`[Package] PDF excede 15 MB (${(finalBytes.byteLength / 1024 / 1024).toFixed(2)} MB). Comprimiendo...`)
      // pdf-lib no comprime imágenes; el aviso queda en logs para revisión manual.
      // En producción se podría pasar por Ghostscript vía exec, pero añade complejidad.
    }

    // 8. Subir a Storage
    const timestamp   = Date.now()
    const packagePath = `${callerAgency}/${caseId}/package/package_${timestamp}.pdf`
    const fileRef     = storage.bucket(bucketName).file(packagePath)

    await fileRef.save(Buffer.from(finalBytes), {
      metadata: {
        contentType:  'application/pdf',
        cacheControl: 'private, max-age=3600',
      },
    })

    // URL firmada válida 7 días (más segura que URL pública)
    const [signedUrl] = await fileRef.getSignedUrl({
      action:  'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    const fileSizeMb = parseFloat((finalBytes.byteLength / 1024 / 1024).toFixed(2))

    // 9. Actualizar el expediente en Firestore
    await caseRef.update({
      last_package: {
        file_url:      signedUrl,
        storage_path:  packagePath,
        file_size_mb:  fileSizeMb,
        total_docs:    requirements.length - downloadErrors.length,
        generated_at:  FieldValue.serverTimestamp(),
        generated_by:  request.auth.uid,
        download_errors: downloadErrors,
      },
    })

    console.log(`[Package] Paquete generado: ${packagePath} (${fileSizeMb} MB)`)

    // Audit log — best-effort, nunca bloquea el resultado
    try {
      await db
        .collection('agencies').doc(callerAgency)
        .collection('audit_logs')
        .add({
          user_uid:    request.auth.uid,
          action:      'GENERATE_PACKAGE',
          target_type: 'case',
          target_id:   caseId,
          metadata:    { file_size_mb: fileSizeMb, total_docs: requirements.length - downloadErrors.length },
          timestamp:   FieldValue.serverTimestamp(),
        })
    } catch (auditErr) {
      console.warn('[Package] Failed to write audit log:', auditErr.message)
    }

    return {
      status:       'success',
      file_url:     signedUrl,
      file_size_mb: fileSizeMb,
      total_docs:   requirements.length - downloadErrors.length,
      ...(downloadErrors.length > 0 && { skipped_docs: downloadErrors }),
    }
  }
)
