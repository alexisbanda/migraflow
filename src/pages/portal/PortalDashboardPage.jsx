/**
 * PortalDashboardPage — Vista principal del portal cliente
 * Ruta: /portal  (index route dentro del layout ClientPortalPage)
 *
 * Muestra:
 *  - Saludo personalizado + resumen global de progreso
 *  - Banner de acciones urgentes (requisitos rechazados)
 *  - Tarjeta por expediente: progreso, estado, chips de resumen,
 *    enlace al detalle y descarga del paquete si existe
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} aria-hidden="true" />
}

// Hook que suscribe en tiempo real al resumen de requisitos de un expediente
function useCaseSummary(caseId) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cases', caseId, 'requirements'),
      (snap) => {
        const reqs = snap.docs.map((d) => d.data())
        setSummary({
          total:     reqs.length,
          validated: reqs.filter((r) => r.status === 'validated').length,
          reviewing: reqs.filter((r) => r.status === 'reviewing').length,
          rejected:  reqs.filter((r) => r.status === 'rejected').length,
          pending:   reqs.filter((r) => r.status === 'pending').length,
          mandatoryPending: reqs.filter((r) => r.is_mandatory && r.status === 'pending').length,
        })
      }
    )
    return unsub
  }, [caseId])

  return summary
}

// ─── CaseCard ─────────────────────────────────────────────────────────────────

function CaseCard({ caseDoc }) {
  const summary = useCaseSummary(caseDoc.id)
  const meta    = CASE_STATUS_META[caseDoc.status] ?? CASE_STATUS_META.open
  const progress = summary?.total ? Math.round((summary.validated / summary.total) * 100) : 0
  const complete = summary && summary.total > 0 && summary.validated === summary.total

  return (
    <article
      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden"
      aria-label={`Expediente: ${TYPE_LABEL[caseDoc.type] ?? caseDoc.type}`}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {TYPE_LABEL[caseDoc.type] ?? caseDoc.type}
            </h2>
            {caseDoc.created_at?.toDate && (
              <p className="text-xs text-slate-600 mt-0.5">
                Abierto el{' '}
                {caseDoc.created_at.toDate().toLocaleDateString('es-ES', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </p>
            )}
          </div>

          {/* Badge estado */}
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            text-xs font-medium ${meta.bg} ${meta.color}`}
                aria-label={`Estado: ${meta.label}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
        </div>

        {/* Barra de progreso */}
        <div className="mt-4" aria-label={`Progreso: ${progress}%`}>
          {summary ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-500">
                  {summary.validated} de {summary.total} documentos validados
                </span>
                <span className="text-xs font-semibold text-slate-400">{progress}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden" role="progressbar"
                   aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    complete ? 'bg-emerald-500' : 'bg-military-600'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <Skeleton className="h-2 w-full mt-1" />
          )}
        </div>

        {/* Chips de resumen */}
        {summary && summary.total > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3" aria-live="polite">
            {summary.rejected > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-900/50 font-medium">
                {summary.rejected} rechazado{summary.rejected > 1 ? 's' : ''} — acción requerida
              </span>
            )}
            {summary.mandatoryPending > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/20 text-amber-400 border border-amber-900/40">
                {summary.mandatoryPending} obligatorio{summary.mandatoryPending > 1 ? 's' : ''} pendiente{summary.mandatoryPending > 1 ? 's' : ''}
              </span>
            )}
            {summary.pending > 0 && summary.mandatoryPending === 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {summary.pending} pendiente{summary.pending > 1 ? 's' : ''}
              </span>
            )}
            {complete && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-900/50">
                ✓ Documentación completa
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer de acciones */}
      <div className="px-5 py-3 border-t border-slate-800/70 flex items-center justify-between gap-3 flex-wrap">
        {caseDoc.last_package?.file_url ? (
          <a
            href={caseDoc.last_package.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200
                       transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-military-500 rounded"
            aria-label="Descargar paquete de documentación"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Descargar paquete
          </a>
        ) : (
          <span />
        )}

        <Link
          to={`/portal/caso/${caseDoc.id}`}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold
                     text-military-400 hover:text-military-300 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-military-500 rounded"
          aria-label={`Ver documentos del expediente ${TYPE_LABEL[caseDoc.type] ?? caseDoc.type}`}
        >
          Ver documentos
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </article>
  )
}

// ─── Banners de acciones urgentes ─────────────────────────────────────────────
// Se muestra un aviso global si algún expediente tiene docs rechazados.
// Aprovechamos los summaries ya cargados por los CaseCard (no cargamos de nuevo).

function UrgentBanner({ cases }) {
  const [rejectedCases, setRejectedCases] = useState([])

  useEffect(() => {
    if (!cases.length) return
    const unsubs = []

    // Cargamos una sola vez (getDocs) para el banner; no en tiempo real
    const loadRejected = async () => {
      const { getDocs: _getDocs } = await import('firebase/firestore')
      const results = await Promise.all(
        cases.map(async (c) => {
          const snap = await _getDocs(collection(db, 'cases', c.id, 'requirements'))
          const hasRejected = snap.docs.some((d) => d.data().status === 'rejected')
          return hasRejected ? c : null
        })
      )
      setRejectedCases(results.filter(Boolean))
    }

    loadRejected()
    return () => unsubs.forEach((u) => u?.())
  }, [cases])

  if (!rejectedCases.length) return null

  return (
    <div
      role="alert"
      className="flex gap-3 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3.5"
      aria-label="Acción urgente requerida"
    >
      <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-red-300">Acción requerida</p>
        <p className="text-xs text-red-400/80 mt-0.5">
          {rejectedCases.length === 1
            ? 'Tienes documentos rechazados en un expediente.'
            : `Tienes documentos rechazados en ${rejectedCases.length} expedientes.`}
          {' '}Revisa cada expediente y sube la versión corregida.
        </p>
        {rejectedCases.map((c) => (
          <Link
            key={c.id}
            to={`/portal/caso/${c.id}`}
            className="inline-block mt-1.5 text-xs text-red-300 underline underline-offset-2 hover:text-red-200"
          >
            {TYPE_LABEL[c.type] ?? c.type} →
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortalDashboardPage() {
  const { clientDoc, cases, loading } = usePortal()
  const pd = clientDoc?.personal_data ?? {}

  return (
    <div className="space-y-6">

      {/* Saludo */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">
          {loading
            ? <Skeleton className="h-7 w-44 inline-block" />
            : `Hola, ${pd.first_name || 'cliente'}`
          }
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Aquí puedes consultar el estado de tu documentación y subir los archivos pendientes.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando expedientes">
          <Skeleton className="h-52" />
          <Skeleton className="h-36" />
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-20 text-slate-600" role="status">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-sm">No tienes ningún expediente activo aún.</p>
          <p className="text-xs mt-1 text-slate-700">
            Contacta con tu abogado para que cree tu expediente.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Banner urgente global */}
          <UrgentBanner cases={cases} />

          {/* Tarjetas por expediente */}
          {cases.map((c) => (
            <CaseCard key={c.id} caseDoc={c} />
          ))}
        </div>
      )}

    </div>
  )
}
