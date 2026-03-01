/**
 * PortalCasePage — Vista de detalle de un expediente
 * Ruta: /portal/caso/:caseId  (subruta dentro de ClientPortalPage)
 *
 * Secciones:
 *  1. Header con estado, tipo y progreso de documentación
 *  2. Banner de acciones urgentes (docs rechazados)
 *  3. Lista de requisitos con subida de archivos
 *  4. Línea de tiempo del expediente
 *  5. Descarga de paquetes generados
 *  6. Contacto con el despacho
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import {
  collection, onSnapshot, doc, updateDoc,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { useDropzone } from 'react-dropzone'
import { db, storage } from '@/lib/firebase'
import { usePortal } from './ClientPortalPage'

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPE_LABEL = {
  nomada_digital:          'Visa Nómada Digital',
  residencia_no_lucrativa: 'Residencia No Lucrativa',
  cuenta_ajena:            'Residencia y Trabajo por Cuenta Ajena',
  reagrupacion_familiar:   'Reagrupación Familiar',
  estancia_estudios:       'Estancia por Estudios',
  visa_estudios:           'Visa de Estudios',
  regularizacion_masiva_2026: 'Regularización Masiva 2026',
}

const CASE_STATUS_META = {
  open:      { label: 'Abierto',      color: 'text-sky-300',     bg: 'bg-sky-900/30',     dot: 'bg-sky-400' },
  in_review: { label: 'En revisión',  color: 'text-amber-300',   bg: 'bg-amber-900/30',   dot: 'bg-amber-400' },
  approved:  { label: 'Aprobado',     color: 'text-emerald-300', bg: 'bg-emerald-900/30', dot: 'bg-emerald-400' },
  rejected:  { label: 'Rechazado',    color: 'text-red-300',     bg: 'bg-red-900/30',     dot: 'bg-red-400' },
  closed:    { label: 'Cerrado',      color: 'text-slate-400',   bg: 'bg-slate-800',      dot: 'bg-slate-500' },
}

const REQ_STATUS_META = {
  pending:   { label: 'Pendiente',   color: 'text-slate-400',   bg: 'bg-slate-800',       dot: 'bg-slate-500' },
  reviewing: { label: 'En revisión', color: 'text-amber-300',   bg: 'bg-amber-900/40',    dot: 'bg-amber-400' },
  validated: { label: 'Validado',    color: 'text-emerald-300', bg: 'bg-emerald-900/30',  dot: 'bg-emerald-400' },
  rejected:  { label: 'Rechazado',   color: 'text-red-300',     bg: 'bg-red-900/30',      dot: 'bg-red-400' },
}

const EVENT_LABELS = {
  case_created:       'Expediente creado',
  status_open:        'Expediente abierto',
  status_in_review:   'Documentación en revisión',
  status_approved:    'Expediente aprobado',
  status_rejected:    'Expediente rechazado',
  status_closed:      'Expediente cerrado',
  package_generated:  'Paquete de documentación generado',
  document_uploaded:  'Documento subido',
  document_validated: 'Documento validado',
  document_rejected:  'Documento rechazado',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} aria-hidden="true" />
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
      {children}
    </h2>
  )
}

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatDateTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function elapsedLabel(ts) {
  if (!ts) return ''
  const d  = ts.toDate ? ts.toDate() : new Date(ts)
  const ms = Date.now() - d.getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1)   return 'hoy'
  if (days === 1)  return 'ayer'
  if (days < 30)  return `hace ${days} días`
  const months = Math.floor(days / 30)
  if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`
  return `hace ${Math.floor(months / 12)} año${Math.floor(months / 12) > 1 ? 's' : ''}`
}

// ─── UploadZone ───────────────────────────────────────────────────────────────

function UploadZone({ req, caseId, agencyId, clientId }) {
  const [progress, setProgress] = useState(null)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState(null)

  const upload = useCallback(async (file) => {
    setError(null)
    setDone(false)
    const storagePath = `${agencyId}/${clientId}/${caseId}/${req.id}/${file.name}`
    const task        = uploadBytesResumable(ref(storage, storagePath), file)

    task.on(
      'state_changed',
      (s) => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      (err) => { setError(err.message); setProgress(null) },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        await updateDoc(doc(db, 'cases', caseId, 'requirements', req.id), {
          file_url:     url,
          storage_path: storagePath,
          status:       'reviewing',
        })
        setProgress(null)
        setDone(true)
      }
    )
  }, [agencyId, clientId, caseId, req.id])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop:   ([f]) => f && upload(f),
    accept:   { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    maxSize:  10 * 1024 * 1024,
    disabled: progress !== null || done,
  })

  if (done) {
    return (
      <p className="text-xs text-emerald-400 mt-2" role="status">
        ✓ Documento enviado — el equipo lo revisará pronto.
      </p>
    )
  }

  return (
    <div className="mt-3">
      <div
        {...getRootProps()}
        className={`border border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-all
          ${isDragActive
            ? 'border-military-500 bg-military-900/20'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'
          } ${progress !== null ? 'pointer-events-none' : ''}`}
        aria-label="Zona de subida de documento"
      >
        <input {...getInputProps()} aria-label="Seleccionar archivo" />
        {progress !== null ? (
          <div className="space-y-2">
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden"
                 role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-military-600 rounded-full transition-all duration-200"
                   style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500">Subiendo... {progress}%</p>
          </div>
        ) : (
          <div className="space-y-1">
            <svg className="w-6 h-6 text-slate-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-slate-500">
              {isDragActive
                ? 'Suelta aquí'
                : 'Arrastra tu documento o haz clic · PDF/imagen · máx. 10 MB'}
            </p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1" role="alert">{error}</p>}
    </div>
  )
}

// ─── RequirementCard ──────────────────────────────────────────────────────────

function RequirementCard({ req, caseId, agencyId, clientId }) {
  const [open, setOpen] = useState(req.status === 'rejected')
  const meta      = REQ_STATUS_META[req.status] ?? REQ_STATUS_META.pending
  const canUpload = ['pending', 'rejected'].includes(req.status)
  const isRejected = req.status === 'rejected'

  return (
    <div className={`rounded-xl border transition-all ${
      isRejected ? 'border-red-900/50 bg-red-950/10' : 'border-slate-800 bg-slate-900/40'
    }`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-military-500 rounded-xl"
        aria-expanded={open}
        aria-controls={`req-${req.id}`}
      >
        {/* Número de orden */}
        <span className="text-xs text-slate-600 font-mono w-5 shrink-0 text-center" aria-hidden="true">
          {req.merge_order}
        </span>

        {/* Nombre + obligatorio */}
        <span className="flex-1 text-sm text-slate-200 text-left">
          {req.name}
          {req.is_mandatory && (
            <span className="ml-1.5 text-xs text-red-400/70" aria-label="obligatorio">*</span>
          )}
        </span>

        {/* Badge estado */}
        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                          text-xs font-medium ${meta.bg} ${meta.color}`}
              aria-label={`Estado: ${meta.label}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
          {meta.label}
        </span>

        <svg className={`w-4 h-4 text-slate-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div id={`req-${req.id}`} className="px-4 pb-4 pt-1 border-t border-slate-800/60 space-y-3">

          {/* Instrucciones del documento */}
          {req.client_instructions && (
            <p className="text-xs text-slate-400 bg-slate-800/50 rounded-lg px-3 py-2 leading-relaxed">
              {req.client_instructions}
            </p>
          )}

          {/* Aviso de rechazo */}
          {isRejected && (
            <div className="flex gap-2 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5"
                 role="alert">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="text-xs text-red-300">
                Documento rechazado. Por favor sube una versión corregida.
              </p>
            </div>
          )}

          {/* Avisos de IA */}
          {req.ai_warnings?.length > 0 && (
            <div className="space-y-1.5" role="list" aria-label="Avisos automáticos">
              {req.ai_warnings.map((w, i) => (
                <div key={i} role="listitem"
                     className="flex gap-2 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
                  </svg>
                  <p className="text-xs text-amber-300">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ver documento enviado */}
          {req.file_url && !isRejected && (
            <a href={req.file_url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 text-xs text-military-400
                          hover:text-military-300 transition-colors
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-military-500 rounded"
               aria-label="Ver documento enviado (abre en nueva pestaña)">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5
                     c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7
                     -4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Ver documento enviado
            </a>
          )}

          {/* Validado */}
          {req.status === 'validated' && (
            <p className="text-xs text-emerald-400" role="status">
              ✓ Documento validado por el equipo.
            </p>
          )}

          {/* En revisión */}
          {req.status === 'reviewing' && !req.ai_warnings?.length && (
            <p className="text-xs text-amber-300/70">
              Tu documento está siendo revisado. Te avisaremos cuando esté listo.
            </p>
          )}

          {/* Zona de subida */}
          {canUpload && (
            <UploadZone
              req={req}
              caseId={caseId}
              agencyId={agencyId}
              clientId={clientId}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── CaseTimeline ─────────────────────────────────────────────────────────────

function CaseTimeline({ timeline }) {
  if (!timeline?.length) return null

  const events = [...timeline].sort((a, b) => {
    const ta = a.timestamp?.seconds ?? 0
    const tb = b.timestamp?.seconds ?? 0
    return ta - tb
  })

  return (
    <div className="relative" aria-label="Línea de tiempo del expediente">
      {/* Línea vertical */}
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-800" aria-hidden="true" />

      <ol className="space-y-0">
        {events.map((ev, i) => {
          const isLast = i === events.length - 1
          const label  = EVENT_LABELS[ev.event] ?? ev.event
          return (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              {/* Punto en la línea */}
              <div className={`relative z-10 w-7 h-7 rounded-full border flex items-center justify-center shrink-0
                ${isLast
                  ? 'bg-military-600 border-military-500'
                  : 'bg-slate-900 border-slate-700'
                }`}
                   aria-hidden="true">
                <div className={`w-2 h-2 rounded-full ${isLast ? 'bg-white' : 'bg-slate-600'}`} />
              </div>

              {/* Contenido */}
              <div className="pt-0.5 pb-1">
                <p className={`text-sm font-medium ${isLast ? 'text-slate-100' : 'text-slate-300'}`}>
                  {label}
                </p>
                {ev.timestamp && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    <time dateTime={ev.timestamp?.toDate?.()?.toISOString()}>
                      {formatDate(ev.timestamp)}
                    </time>
                    {' · '}
                    <span className="text-slate-700">{elapsedLabel(ev.timestamp)}</span>
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── PackageSection ───────────────────────────────────────────────────────────

function PackageSection({ pkg }) {
  if (!pkg?.file_url) return null

  const date      = pkg.timestamp ? formatDateTime(pkg.timestamp) : null
  const sizeLabel = pkg.file_size_mb ? `${pkg.file_size_mb.toFixed(1)} MB` : null

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-military-900/40 border border-military-800/50
                      flex items-center justify-center shrink-0" aria-hidden="true">
        <svg className="w-5 h-5 text-military-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7
               a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-100">Paquete de documentación</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {[date, sizeLabel].filter(Boolean).join(' · ')}
        </p>
      </div>
      <a
        href={pkg.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-military-600 hover:bg-military-500 text-white transition-colors
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-military-400"
        aria-label="Descargar paquete de documentación (abre en nueva pestaña)"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Descargar
      </a>
    </div>
  )
}

// ─── ContactSection ───────────────────────────────────────────────────────────

function ContactSection() {
  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl px-5 py-4 space-y-2">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949
               L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          ¿Tienes alguna duda?
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        Si tienes preguntas sobre tu expediente o los documentos requeridos,
        contacta directamente con tu abogado asignado. Ellos podrán orientarte
        y actualizar el estado de tu tramitación.
      </p>
      <p className="text-xs text-slate-600">
        Puedes responder al correo que recibiste al inicio del proceso o
        llamar al número facilitado por el despacho.
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortalCasePage() {
  const { caseId }          = useParams()
  const { cases, clientDoc, loading } = usePortal()
  const [reqs, setReqs]     = useState([])
  const [loadingReqs, setLoadingReqs] = useState(true)

  const caseDoc = cases.find((c) => c.id === caseId)

  // Cargar requisitos en tiempo real
  useEffect(() => {
    if (!caseId) return
    setLoadingReqs(true)
    const unsub = onSnapshot(
      collection(db, 'cases', caseId, 'requirements'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        docs.sort((a, b) => (a.merge_order ?? 99) - (b.merge_order ?? 99))
        setReqs(docs)
        setLoadingReqs(false)
      }
    )
    return unsub
  }, [caseId])

  // Esperar a que el contexto cargue
  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Cargando expediente">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  // Expediente no encontrado o no pertenece a este cliente
  if (!caseDoc) {
    return <Navigate to="/portal" replace />
  }

  const meta      = CASE_STATUS_META[caseDoc.status] ?? CASE_STATUS_META.open
  const validated = reqs.filter((r) => r.status === 'validated').length
  const reviewing = reqs.filter((r) => r.status === 'reviewing').length
  const rejected  = reqs.filter((r) => r.status === 'rejected').length
  const pending   = reqs.filter((r) => r.status === 'pending').length
  const progress  = reqs.length ? Math.round((validated / reqs.length) * 100) : 0
  const mandatory = reqs.filter((r) => r.is_mandatory)
  const mandatoryDone = mandatory.filter((r) => r.status === 'validated').length

  const hasRejected = rejected > 0
  const complete    = reqs.length > 0 && validated === reqs.length

  return (
    <div className="space-y-8">

      {/* ── Navegación de vuelta ──────────────────────────────────────── */}
      <div>
        <Link
          to="/portal"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300
                     transition-colors focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-military-500 rounded"
          aria-label="Volver al panel principal"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Mis expedientes
        </Link>

        {/* Título + estado */}
        <div className="flex items-start justify-between gap-3 mt-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-100">
              {TYPE_LABEL[caseDoc.type] ?? caseDoc.type}
            </h1>
            {caseDoc.created_at?.toDate && (
              <p className="text-xs text-slate-600 mt-0.5">
                Abierto el {formatDate(caseDoc.created_at)}
              </p>
            )}
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                            text-xs font-medium ${meta.bg} ${meta.color}`}
                aria-label={`Estado: ${meta.label}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
        </div>
      </div>

      {/* ── Stats globales de progreso ────────────────────────────────── */}
      {!loadingReqs && reqs.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 space-y-3">
          {/* Barra de progreso */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-200">Progreso de documentación</span>
              <span className="text-sm font-bold text-slate-100">{progress}%</span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden"
                 role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
                 aria-label={`${progress}% de documentación completada`}>
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  complete ? 'bg-emerald-500' : 'bg-military-600'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Cuadrícula de contadores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {[
              { label: 'Validados',   count: validated, color: 'text-emerald-400' },
              { label: 'En revisión', count: reviewing, color: 'text-amber-400'   },
              { label: 'Rechazados',  count: rejected,  color: 'text-red-400'     },
              { label: 'Pendientes',  count: pending,   color: 'text-slate-400'   },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center">
                <p className={`text-2xl font-bold ${color}`} aria-label={`${count} ${label}`}>
                  {count}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Obligatorios */}
          {mandatory.length > 0 && (
            <p className="text-xs text-slate-500 border-t border-slate-800 pt-2.5">
              Obligatorios: {' '}
              <span className={mandatoryDone === mandatory.length ? 'text-emerald-400' : 'text-amber-400'}>
                {mandatoryDone}/{mandatory.length} validados
              </span>
            </p>
          )}
        </div>
      )}

      {/* ── Banner de acciones urgentes ───────────────────────────────── */}
      {hasRejected && (
        <div className="flex gap-3 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3.5"
             role="alert" aria-label="Acción urgente requerida">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-300">Acción requerida</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              {rejected === 1
                ? 'Tienes 1 documento rechazado.'
                : `Tienes ${rejected} documentos rechazados.`}
              {' '}Revisa los documentos marcados en rojo y sube la versión corregida.
            </p>
          </div>
        </div>
      )}

      {/* ── Requisitos ────────────────────────────────────────────────── */}
      <section aria-labelledby="reqs-title">
        <SectionTitle>
          <span id="reqs-title">Documentos requeridos</span>
        </SectionTitle>

        {loadingReqs ? (
          <div className="space-y-2" aria-busy="true">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : reqs.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-8" role="status">
            No hay documentos requeridos aún.
          </p>
        ) : (
          <div className="space-y-2">
            {reqs.map((req) => (
              <RequirementCard
                key={req.id}
                req={req}
                caseId={caseDoc.id}
                agencyId={caseDoc.agencyId}
                clientId={clientDoc?.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Línea de tiempo ───────────────────────────────────────────── */}
      {caseDoc.timeline?.length > 0 && (
        <section aria-labelledby="timeline-title">
          <SectionTitle>
            <span id="timeline-title">Historial del expediente</span>
          </SectionTitle>
          <CaseTimeline timeline={caseDoc.timeline} />
        </section>
      )}

      {/* ── Paquete de documentación ──────────────────────────────────── */}
      {caseDoc.last_package?.file_url && (
        <section aria-labelledby="package-title">
          <SectionTitle>
            <span id="package-title">Paquete generado</span>
          </SectionTitle>
          <PackageSection pkg={caseDoc.last_package} />
        </section>
      )}

      {/* ── Contacto ──────────────────────────────────────────────────── */}
      <section aria-labelledby="contact-title">
        <SectionTitle>
          <span id="contact-title">Contacto</span>
        </SectionTitle>
        <ContactSection />
      </section>

    </div>
  )
}
