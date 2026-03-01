/**
 * ClientPortalPage — Portal del cliente
 * Ruta: /portal  (solo rol: client)
 *
 * Flujo de datos:
 *  1. Busca el documento /clients donde userId == user.uid
 *  2. Busca los expedientes /cases donde clientId == clientDoc.id
 *  3. Para cada expediente carga sus /requirements en tiempo real
 */

import { useEffect, useState, useCallback } from 'react'
import {
  collection, query, where, getDocs,
  onSnapshot, doc, updateDoc,
} from 'firebase/firestore'
import {
  ref, uploadBytesResumable, getDownloadURL,
} from 'firebase/storage'
import { useDropzone } from 'react-dropzone'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:   { label: 'Pendiente',   color: 'text-slate-400',   bg: 'bg-slate-800',              dot: 'bg-slate-500' },
  reviewing: { label: 'En revisión', color: 'text-amber-300',   bg: 'bg-amber-900/40',            dot: 'bg-amber-400' },
  validated: { label: 'Validado',    color: 'text-emerald-300', bg: 'bg-emerald-900/30',          dot: 'bg-emerald-400' },
  rejected:  { label: 'Rechazado',   color: 'text-red-300',     bg: 'bg-red-900/30',              dot: 'bg-red-400' },
}

const TYPE_LABEL = {
  nomada_digital:          'Visa Nómada Digital',
  residencia_no_lucrativa: 'Residencia No Lucrativa',
  cuenta_ajena:            'Residencia y Trabajo por Cuenta Ajena',
  reagrupacion_familiar:   'Reagrupación Familiar',
}

const CASE_STATUS_LABEL = {
  open:      'Abierto',
  in_review: 'En revisión',
  approved:  'Aprobado',
  rejected:  'Rechazado',
  closed:    'Cerrado',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} />
}

// ─── Dropzone de subida ───────────────────────────────────────────────────────

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
    onDrop: ([f]) => f && upload(f),
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: progress !== null || done,
  })

  if (done) {
    return (
      <p className="text-xs text-emerald-400 mt-2">
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
      >
        <input {...getInputProps()} />
        {progress !== null ? (
          <div className="space-y-2">
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-military-600 rounded-full transition-all duration-200"
                   style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-slate-500">Subiendo... {progress}%</p>
          </div>
        ) : (
          <div className="space-y-1">
            <svg className="w-6 h-6 text-slate-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-slate-500">
              {isDragActive ? 'Suelta aquí' : 'Arrastra tu documento o haz clic · PDF/imagen · máx. 10 MB'}
            </p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

// ─── Tarjeta de requisito ─────────────────────────────────────────────────────

function RequirementCard({ req, caseId, agencyId, clientId }) {
  const [open, setOpen] = useState(req.status === 'rejected') // abrir auto si rechazado
  const meta = STATUS_META[req.status] ?? STATUS_META.pending
  const canUpload = ['pending', 'rejected'].includes(req.status)

  return (
    <div className={`rounded-xl border transition-all ${
      req.status === 'rejected'
        ? 'border-red-900/50 bg-red-950/10'
        : 'border-slate-800 bg-slate-900/40'
    }`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Número de orden */}
        <span className="text-xs text-slate-600 font-mono w-5 flex-shrink-0 text-center">
          {req.merge_order}
        </span>

        {/* Nombre */}
        <span className="flex-1 text-sm text-slate-200">{req.name}</span>

        {/* Badge estado */}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>

        <svg className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800/60 space-y-3">

          {/* Aviso de rechazo */}
          {req.status === 'rejected' && (
            <div className="flex gap-2 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="text-xs text-red-300">
                Documento rechazado. Por favor sube una versión corregida.
              </p>
            </div>
          )}

          {/* Avisos de IA */}
          {req.ai_warnings?.length > 0 && (
            <div className="space-y-1.5">
              {req.ai_warnings.map((w, i) => (
                <div key={i} className="flex gap-2 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
                  </svg>
                  <p className="text-xs text-amber-300">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ver documento actual */}
          {req.file_url && req.status !== 'rejected' && (
            <a href={req.file_url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 text-xs text-military-400 hover:text-military-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Ver documento enviado
            </a>
          )}

          {/* Validado — sin acciones */}
          {req.status === 'validated' && (
            <p className="text-xs text-emerald-400">
              ✓ Documento validado por el equipo.
            </p>
          )}

          {/* Upload */}
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

// ─── Tarjeta de expediente ────────────────────────────────────────────────────

function CaseSection({ caseDoc, clientId }) {
  const [reqs, setReqs] = useState([])
  const [loadingReqs, setLoadingReqs] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cases', caseDoc.id, 'requirements'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        docs.sort((a, b) => (a.merge_order ?? 99) - (b.merge_order ?? 99))
        setReqs(docs)
        setLoadingReqs(false)
      }
    )
    return unsub
  }, [caseDoc.id])

  const validated = reqs.filter((r) => r.status === 'validated').length
  const pending   = reqs.filter((r) => r.status === 'pending').length
  const rejected  = reqs.filter((r) => r.status === 'rejected').length
  const progress  = reqs.length ? Math.round((validated / reqs.length) * 100) : 0

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header del expediente */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {TYPE_LABEL[caseDoc.type] ?? caseDoc.type}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {CASE_STATUS_LABEL[caseDoc.status] ?? caseDoc.status}
              {caseDoc.created_at?.toDate && (
                <> · Abierto el {caseDoc.created_at.toDate().toLocaleDateString('es-ES', {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}</>
              )}
            </p>
          </div>

          {/* Progreso */}
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-1">
              {validated}/{reqs.length} validados
            </p>
            <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-military-600 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Chips de resumen */}
        {!loadingReqs && reqs.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {rejected > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-900/50">
                {rejected} rechazado{rejected > 1 ? 's' : ''} — acción requerida
              </span>
            )}
            {pending > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {pending} pendiente{pending > 1 ? 's' : ''}
              </span>
            )}
            {validated === reqs.length && reqs.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-900/50">
                ✓ Documentación completa
              </span>
            )}
          </div>
        )}
      </div>

      {/* Lista de requisitos */}
      <div className="p-4 space-y-2">
        {loadingReqs ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)
        ) : reqs.length === 0 ? (
          <p className="text-center text-slate-600 text-sm py-6">
            No hay documentos requeridos aún.
          </p>
        ) : (
          reqs.map((req) => (
            <RequirementCard
              key={req.id}
              req={req}
              caseId={caseDoc.id}
              agencyId={caseDoc.agencyId}
              clientId={clientId}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const { user, logout }          = useAuth()
  const [clientDoc, setClientDoc] = useState(null)
  const [cases, setCases]         = useState([])
  const [loading, setLoading]     = useState(true)

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  useEffect(() => {
    if (!user?.uid) return

    async function load() {
      // 1. Buscar documento del cliente por userId
      const clientSnap = await getDocs(
        query(collection(db, 'clients'), where('userId', '==', user.uid))
      )
      if (clientSnap.empty) { setLoading(false); return }

      const clientData = { id: clientSnap.docs[0].id, ...clientSnap.docs[0].data() }
      setClientDoc(clientData)

      // 2. Suscribirse a los expedientes del cliente en tiempo real
      const unsub = onSnapshot(
        query(collection(db, 'cases'), where('clientId', '==', clientData.id)),
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          docs.sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
          setCases(docs)
          setLoading(false)
        }
      )
      return unsub
    }

    let unsub
    load().then((u) => { unsub = u })
    return () => unsub?.()
  }, [user?.uid])

  const pd          = clientDoc?.personal_data ?? {}
  const clientName  = `${pd.first_name ?? ''} ${pd.last_name ?? ''}`.trim() || user?.email

  return (
    <div className="min-h-screen bg-slate-950">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-military-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-100">MigraFlow</span>
          </div>

          <div className="flex items-center gap-3">
            {clientName && (
              <span className="text-xs text-slate-500 hidden sm:block">{clientName}</span>
            )}
            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Saludo */}
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            {loading ? <Skeleton className="h-6 w-48 inline-block" /> : `Hola, ${pd.first_name || 'cliente'}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Aquí puedes ver el estado de tu documentación y subir los archivos pendientes.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <p className="text-sm">No tienes ningún expediente activo aún.</p>
            <p className="text-xs mt-1">Contacta con tu abogado para que cree tu expediente.</p>
          </div>
        ) : (
          cases.map((c) => (
            <CaseSection
              key={c.id}
              caseDoc={c}
              clientId={clientDoc?.id}
            />
          ))
        )}

        {/* Footer RGPD */}
        <p className="text-center text-xs text-slate-700 pt-4">
          Tus documentos se almacenan de forma cifrada conforme al RGPD.
          Solo tu abogado asignado tiene acceso a ellos.
        </p>
      </main>
    </div>
  )
}
