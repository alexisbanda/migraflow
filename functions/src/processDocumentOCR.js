/**
 * processDocumentOCR
 * ─────────────────────────────────────────────────────────────────────────────
 * Trigger : onObjectFinalized (Firebase Storage)
 * Ruta    : /{agencyId}/{clientId}/{caseId}/{reqId}/{filename}
 *
 * Flujo:
 *  1. Valida que la ruta tiene el formato esperado (5 segmentos).
 *  2. Solo procesa archivos PDF o imagen (evita bucles con ZIPs generados).
 *  3. Descarga el archivo desde Storage a /tmp.
 *  4. Llama a Google Cloud Vision (DOCUMENT_TEXT_DETECTION).
 *  5. Lee las ai_rules del requisito en Firestore.
 *  6. Aplica las reglas: fechas, palabras clave obligatorias/prohibidas.
 *  7. Actualiza requirements/{reqId}:
 *     - status  → "reviewing"
 *     - ai_warnings → array de avisos (vacío = sin problemas detectados)
 *     - ocr_processed_at → timestamp
 */

const { onObjectFinalized } = require('firebase-functions/v2/storage')
const { ImageAnnotatorClient } = require('@google-cloud/vision')
const { FieldValue } = require('firebase-admin/firestore')
const { db, storage } = require('./lib/admin')
const path  = require('path')
const fs    = require('fs')
const os    = require('os')

const vision = new ImageAnnotatorClient()

// ─── Tipos de archivo que procesamos ─────────────────────────────────────────
const PROCESSABLE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/webp',
])

// ─── Helpers de validación ────────────────────────────────────────────────────

/**
 * Comprueba que un documento no tenga más de maxAgeMonths meses de antigüedad.
 * Busca en el texto OCR patrones de fecha (dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy).
 * @param {string} text
 * @param {number} maxAgeMonths
 * @returns {{ valid: boolean, foundDate: string|null }}
 */
function checkDocumentAge(text, maxAgeMonths) {
  const patterns = [
    /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g,   // dd/mm/yyyy o dd-mm-yyyy
    /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/g,   // yyyy-mm-dd
  ]

  const now    = new Date()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - maxAgeMonths)

  let latestDate = null

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      let parsed
      if (match[0].length === 10 && match[1].length === 4) {
        // yyyy-mm-dd
        parsed = new Date(`${match[1]}-${match[2]}-${match[3]}`)
      } else {
        // dd/mm/yyyy o dd-mm-yyyy
        parsed = new Date(`${match[3]}-${match[2]}-${match[1]}`)
      }
      if (!isNaN(parsed) && parsed <= now) {
        if (!latestDate || parsed > latestDate) latestDate = parsed
      }
    }
  }

  if (!latestDate) return { valid: true, foundDate: null } // no fecha → no bloqueamos

  return {
    valid:     latestDate >= cutoff,
    foundDate: latestDate.toLocaleDateString('es-ES'),
  }
}

/**
 * Comprueba que todas las palabras clave requeridas aparecen en el texto (case-insensitive).
 * @param {string} text
 * @param {string[]} keywords
 * @returns {string[]} keywords que faltan
 */
function checkRequiredKeywords(text, keywords = []) {
  const lower = text.toLowerCase()
  return keywords.filter((kw) => !lower.includes(kw.toLowerCase()))
}

/**
 * Comprueba que ninguna palabra clave prohibida aparece en el texto.
 * @param {string} text
 * @param {string[]} keywords
 * @returns {string[]} keywords prohibidas encontradas
 */
function checkForbiddenKeywords(text, keywords = []) {
  const lower = text.toLowerCase()
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()))
}

// ─── Función principal ────────────────────────────────────────────────────────

exports.processDocumentOCR = onObjectFinalized(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (event) => {
    const { name: filePath, contentType, bucket: bucketName } = event.data

    // 1. Validar formato de ruta: agencyId/clientId/caseId/reqId/filename
    const segments = filePath.split('/')
    if (segments.length !== 5) {
      console.log(`[OCR] Ruta ignorada (${segments.length} segmentos): ${filePath}`)
      return
    }

    const [agencyId, clientId, caseId, reqId, filename] = segments
    console.log(`[OCR] Procesando: caseId=${caseId} reqId=${reqId} file=${filename}`)

    // 2. Solo archivos procesables (evita bucles con paquetes ZIP generados)
    if (!PROCESSABLE_TYPES.has(contentType)) {
      console.log(`[OCR] ContentType ignorado: ${contentType}`)
      return
    }

    // 3. Descargar archivo a /tmp
    const tmpPath = path.join(os.tmpdir(), filename)
    const bucket  = storage.bucket(bucketName)

    await bucket.file(filePath).download({ destination: tmpPath })
    console.log(`[OCR] Archivo descargado a ${tmpPath}`)

    let fullText = ''

    try {
      // 4. OCR con Google Cloud Vision
      const gcsUri = `gs://${bucketName}/${filePath}`

      if (contentType === 'application/pdf') {
        // Para PDFs usamos la API asyncBatchAnnotateFiles (maneja multipágina)
        const outputPrefix = `ocr-tmp/${agencyId}/${caseId}/${reqId}/`
        const outputBucket = bucket.name

        const [operation] = await vision.asyncBatchAnnotateFiles({
          requests: [
            {
              inputConfig: {
                gcsSource: { uri: gcsUri },
                mimeType:  'application/pdf',
              },
              features:    [{ type: 'DOCUMENT_TEXT_DETECTION' }],
              outputConfig: {
                gcsDestination: { uri: `gs://${outputBucket}/${outputPrefix}` },
                batchSize: 10,
              },
            },
          ],
        })

        await operation.promise()

        // Leer resultados JSON del bucket
        const [files] = await bucket.getFiles({ prefix: outputPrefix })
        for (const f of files) {
          const [content]  = await f.download()
          const parsed     = JSON.parse(content.toString())
          const pageTexts  = parsed.responses?.map((r) => r.fullTextAnnotation?.text ?? '') ?? []
          fullText += pageTexts.join('\n')
          await f.delete()  // limpiar temporales
        }
      } else {
        // Para imágenes usamos la API síncrona
        const [result] = await vision.documentTextDetection(gcsUri)
        fullText = result.fullTextAnnotation?.text ?? ''
      }
    } finally {
      // Limpiar /tmp siempre
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    }

    console.log(`[OCR] Texto extraído: ${fullText.length} caracteres`)

    // 5. Leer ai_rules del requisito en Firestore
    const reqRef = db
      .collection('cases')
      .doc(caseId)
      .collection('requirements')
      .doc(reqId)

    const reqSnap = await reqRef.get()
    if (!reqSnap.exists) {
      console.warn(`[OCR] requirements/${reqId} no encontrado. Abortando.`)
      return
    }

    const aiRules = reqSnap.data().ai_rules ?? {}
    /*
      Estructura ai_rules esperada en Firestore:
      {
        max_age_months: 6,                         // antigüedad máxima del doc
        required_keywords: ["apostille", "hague"], // palabras que DEBEN aparecer
        forbidden_keywords: ["provisional"],       // palabras que NO deben aparecer
      }
    */

    // 6. Aplicar reglas
    const warnings = []

    if (aiRules.max_age_months) {
      const { valid, foundDate } = checkDocumentAge(fullText, aiRules.max_age_months)
      if (!valid) {
        warnings.push(
          `Documento con fecha detectada (${foundDate ?? 'desconocida'}) fuera del límite ` +
          `de ${aiRules.max_age_months} meses.`
        )
      }
    }

    const missingKeywords = checkRequiredKeywords(fullText, aiRules.required_keywords)
    if (missingKeywords.length > 0) {
      warnings.push(
        `Palabras clave requeridas no encontradas: ${missingKeywords.map((k) => `"${k}"`).join(', ')}.`
      )
    }

    const foundForbidden = checkForbiddenKeywords(fullText, aiRules.forbidden_keywords)
    if (foundForbidden.length > 0) {
      warnings.push(
        `Palabras clave prohibidas detectadas: ${foundForbidden.map((k) => `"${k}"`).join(', ')}.`
      )
    }

    // 7. Actualizar Firestore
    await reqRef.update({
      status:            'reviewing',
      ai_warnings:       warnings,
      ocr_processed_at:  FieldValue.serverTimestamp(),
      // Guardamos un extracto del texto (primeros 1000 chars) para auditoría
      ocr_text_excerpt:  fullText.slice(0, 1000),
    })

    console.log(
      `[OCR] Completado. reqId=${reqId} warnings=${warnings.length}`,
      warnings.length ? warnings : '(ninguno)'
    )
  }
)
