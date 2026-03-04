import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  doc, collection, onSnapshot, updateDoc, getDoc, query, where, orderBy,
  arrayUnion, Timestamp, addDoc, serverTimestamp,
} from 'firebase/firestore'
import {
  ref, uploadBytesResumable, getDownloadURL,
} from 'firebase/storage'
import { useDropzone } from 'react-dropzone'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { useGeneratePackage } from '@/hooks/useGeneratePackage'
import { useBilling } from '@/hooks/useBilling'
import BillingTab from './BillingTab'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:    { label: 'Pendiente',  color: 'bg-slate-800 text-slate-400 border-slate-700',               dot: 'bg-slate-500' },
  reviewing:  { label: 'Revisando', color: 'bg-amber-900/50 text-amber-300 border-amber-800/60',           dot: 'bg-amber-400' },
  validated:  { label: 'Validado',  color: 'bg-military-900/50 text-military-300 border-military-800/60', dot: 'bg-military-400' },
  rejected:   { label: 'Rechazado', color: 'bg-red-900/50 text-red-300 border-red-800/60',                dot: 'bg-red-400' },
}

const CASE_STATUS_OPTIONS = ['open', 'in_review', 'approved', 'rejected', 'closed']
const CASE_STATUS_LABEL   = { open: 'Abierto', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', closed: 'Cerrado' }
const REQ_STATUS_OPTIONS  = ['pending', 'reviewing', 'validated', 'rejected']
const TYPE_LABEL = {
  nomada_digital: 'Visa Nómada Digital', residencia_no_lucrativa: 'No Lucrativa',
  cuenta_ajena: 'Cuenta Ajena', reagrupacion_familiar: 'Reagrupación Familiar',
}
const INTERNAL_ROLES = {
  lead_lawyer: 'Abogado principal',
  paralegal:   'Paralegal',
  partner:     'Socio',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addTimelineEvent(caseId, event) {
  try {
    await updateDoc(doc(db, 'cases', caseId), {
      timeline: arrayUnion({ event, timestamp: Timestamp.now() }),
    })
  } catch (err) {
    console.error('Failed to add timeline event', err)
  }
}

function StatusBadge({ status, meta }) {
  const m = meta[status] ?? meta.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

function Skeleton({ className }) {
  return <div className={`bg-slate-800 rounded animate-pulse ${className}`} />
}

// ─── CaseTimeline (sidebar) ───────────────────────────────────────────────────

function CaseTimeline({ timeline }) {
  if (!timeline?.length) return null

  const events = [...timeline].sort((a, b) =>
    (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0)
  )

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-slate-100 mb-4">Historial</h3>
      <ol className="space-y-3">
        {events.map((ev, i) => {
          const date    = ev.timestamp?.toDate?.()
          const dateStr = date
            ? date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : '—'
          return (
            <li key={i} className="flex gap-3 items-start">
              <span className="w-1.5 h-1.5 rounded-full bg-military-500 mt-1.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-300 leading-snug">{ev.event}</p>
                <p className="text-xs text-slate-600 mt-0.5">{dateStr}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── TeamWidget ───────────────────────────────────────────────────────────────

function TeamWidget({ caseData, caseId, lawyers, isAdmin }) {
  const [adding,  setAdding]  = useState(false)
  const [newUid,  setNewUid]  = useState('')
  const [newRole, setNewRole] = useState('paralegal')
  const [saving,  setSaving]  = useState(false)

  const assignees = caseData.assignees ?? []
  const available = lawyers.filter((l) => !assignees.some((a) => a.uid === (l.uid ?? l.id)))

  const handleAdd = async () => {
    if (!newUid || saving) return
    const selected = lawyers.find((l) => (l.uid ?? l.id) === newUid)
    if (!selected) return
    const entry = {
      uid:           newUid,
      internal_role: newRole,
      name:          selected.profile?.display_name || selected.email,
    }
    const updated = [...assignees, entry]
    setSaving(true)
    try {
      await updateDoc(doc(db, 'cases', caseId), {
        assignees:     updated,
        assignee_uids: updated.map((a) => a.uid),
      })
      await addTimelineEvent(caseId, `${INTERNAL_ROLES[newRole]} añadido: ${entry.name}`)
      setNewUid('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (uid) => {
    const removed = assignees.find((a) => a.uid === uid)
    const updated = assignees.filter((a) => a.uid !== uid)
    await updateDoc(doc(db, 'cases', caseId), {
      assignees:     updated,
      assignee_uids: updated.map((a) => a.uid),
    })
    await addTimelineEvent(caseId, `${removed?.name ?? uid} eliminado del equipo`)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-100">Equipo</h3>
        {isAdmin && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="text-xs text-military-400 hover:text-military-300 transition-colors"
          >
            {adding ? 'Cancelar' : '+ Añadir'}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {assignees.length === 0 && (
          <p className="text-xs text-slate-600">Sin equipo asignado.</p>
        )}
        {assignees.map((a) => (
          <div key={a.uid} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-300 font-semibold flex-shrink-0">
              {(a.name ?? 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-200 font-medium truncate">{a.name}</p>
              <p className="text-xs text-slate-500">{INTERNAL_ROLES[a.internal_role] ?? a.internal_role}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => handleRemove(a.uid)}
                className="text-slate-700 hover:text-red-400 transition-colors text-xs"
                title="Eliminar del equipo"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && isAdmin && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
          <select
            value={newUid}
            onChange={(e) => setNewUid(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-military-600"
          >
            <option value="">Seleccionar persona...</option>
            {available.map((l) => (
              <option key={l.id} value={l.uid ?? l.id}>
                {l.profile?.display_name || l.email}
              </option>
            ))}
          </select>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-military-600"
          >
            {Object.entries(INTERNAL_ROLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!newUid || saving}
            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-military-700 hover:bg-military-600 text-white transition-all disabled:opacity-40"
          >
            {saving ? 'Añadiendo...' : 'Añadir al equipo'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── InternalNotesTab ─────────────────────────────────────────────────────────

function InternalNotesTab({ caseId, user }) {
  const [notes,   setNotes]   = useState([])
  const [text,    setText]    = useState('')
  const [posting, setPosting] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    const q = query(
      collection(db, 'cases', caseId, 'internal_notes'),
      orderBy('created_at', 'asc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
    return unsub
  }, [caseId])

  const handlePost = async () => {
    if (!text.trim() || posting) return
    setPosting(true)
    try {
      await addDoc(collection(db, 'cases', caseId, 'internal_notes'), {
        author_uid:  user.uid,
        author_name: user.displayName || user.email,
        content:     text.trim(),
        created_at:  serverTimestamp(),
        attachments: [],
      })
      setText('')
    } catch (err) {
      console.error('Failed to post note', err)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col">
      <div className="overflow-y-auto space-y-4 mb-5 max-h-96 pr-1">
        {notes.length === 0 && (
          <p className="text-center text-xs text-slate-600 py-10">
            Sin notas internas. Solo el equipo del despacho puede leer esto.
          </p>
        )}
        {notes.map((note) => {
          const isOwn   = note.author_uid === user?.uid
          const date    = note.created_at?.toDate?.()
          const dateStr = date
            ? date.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : '—'
          return (
            <div key={note.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-300 font-semibold flex-shrink-0">
                {(note.author_name ?? 'U')[0].toUpperCase()}
              </div>
              <div className={`max-w-sm flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 ${
                    isOwn
                      ? 'bg-military-800/50 border border-military-700/40 rounded-tr-sm'
                      : 'bg-slate-800 border border-slate-700 rounded-tl-sm'
                  }`}
                >
                  <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                </div>
                <p className="text-xs text-slate-600 mt-1 px-1">{note.author_name} · {dateStr}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 pt-4 border-t border-slate-800">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost() }}
          placeholder="Nota interna... (Ctrl+Enter para enviar)"
          rows={2}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-military-600 resize-none"
        />
        <button
          onClick={handlePost}
          disabled={!text.trim() || posting}
          className="px-4 rounded-xl bg-military-700 hover:bg-military-600 text-white text-xs font-semibold transition-all disabled:opacity-40 self-end py-2"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}

// ─── Upload dropzone por requisito ────────────────────────────────────────────

function ReqDropzone({ req, caseId, agencyId, clientId, onUploaded }) {
  const [progress, setProgress] = useState(null)
  const [error, setError]       = useState(null)

  const uploadFile = useCallback(async (file) => {
    setError(null)
    const storagePath = `${agencyId}/${clientId}/${caseId}/${req.id}/${file.name}`
    const storageRef  = ref(storage, storagePath)
    const uploadTask  = uploadBytesResumable(storageRef, file)

    uploadTask.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err)  => { setError(err.message); setProgress(null) },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref)
        const reqRef = doc(db, 'cases', caseId, 'requirements', req.id)
        await updateDoc(reqRef, {
          file_url:     url,
          storage_path: storagePath,
          status:       'reviewing',
        })
        setProgress(null)
        onUploaded?.()
      }
    )
  }, [agencyId, clientId, caseId, req.id, onUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: ([file]) => file && uploadFile(file),
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: progress !== null,
  })

  return (
    <div className="mt-3">
      <div
        {...getRootProps()}
        className={`border border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-all text-xs
          ${isDragActive ? 'border-military-500 bg-military-900/20' : 'border-slate-700 hover:border-slate-500'}`}
      >
        <input {...getInputProps()} />
        {progress !== null ? (
          <div className="space-y-1.5">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-military-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-slate-500">Subiendo... {progress}%</p>
          </div>
        ) : (
          <p className="text-slate-500">
            {isDragActive ? 'Suelta el archivo' : 'Arrastra un PDF o imagen aquí · máx. 10 MB'}
          </p>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

// ─── Fila de requisito ────────────────────────────────────────────────────────

function RequirementRow({ req, caseId, agencyId, clientId, isStaff }) {
  const [open,   setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)

  const canUpload = ['pending', 'rejected'].includes(req.status)

  const handleStatusChange = async (newStatus) => {
    setSaving(true)
    await updateDoc(doc(db, 'cases', caseId, 'requirements', req.id), { status: newStatus })
    await addTimelineEvent(caseId, `Requisito "${req.name}" → ${STATUS_META[newStatus]?.label ?? newStatus}`)
    setSaving(false)
  }

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-800/40 transition-colors"
      >
        <span className="text-slate-500 text-xs w-5 text-center font-mono">{req.merge_order}</span>
        <span className="flex-1 text-sm text-slate-200 font-medium truncate">{req.name}</span>
        <StatusBadge status={req.status} meta={STATUS_META} />
        <svg
          className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800 bg-slate-900/50 space-y-3">
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

          {req.file_url && (
            <a
              href={req.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-military-400 hover:text-military-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Ver documento
            </a>
          )}

          {canUpload && (
            <ReqDropzone
              req={req}
              caseId={caseId}
              agencyId={agencyId}
              clientId={clientId}
              onUploaded={() => setOpen(false)}
            />
          )}

          {isStaff && (
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-slate-500 self-center">Cambiar estado:</span>
              {REQ_STATUS_OPTIONS.filter((s) => s !== req.status).map((s) => (
                <button
                  key={s}
                  disabled={saving}
                  onClick={() => handleStatusChange(s)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-700
                             text-slate-400 hover:text-slate-100 hover:border-slate-500
                             disabled:opacity-40 transition-all"
                >
                  → {STATUS_META[s]?.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CasePage() {
  const { caseId }     = useParams()
  const { user, claims } = useAuth()
  const { generate, loading: pkgLoading, result: pkgResult, error: pkgError } = useGeneratePackage()

  const [activeTab,    setActiveTab]    = useState('checklist')
  const [caseData,     setCaseData]     = useState(null)
  const [clientData,   setClientData]   = useState(null)
  const [reqs,         setReqs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [lawyers,      setLawyers]      = useState([])

  const { billing } = useBilling(caseId)

  const isStaff = ['agency_admin', 'lawyer'].includes(claims?.role)
  const isAdmin = claims?.role === 'agency_admin'
  const isBlocked = billing?.payment_status === 'debt' && billing?.block_generation_on_debt !== false

  // Listener expediente
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'cases', caseId), async (snap) => {
      if (!snap.exists()) { setLoading(false); return }
      const data = { id: snap.id, ...snap.data() }
      setCaseData(data)
      if (data.clientId) {
        const clientSnap = await getDoc(doc(db, 'clients', data.clientId))
        if (clientSnap.exists()) setClientData(clientSnap.data())
      }
      setLoading(false)
    })
    return unsub
  }, [caseId])

  // Listener requirements (tiempo real)
  useEffect(() => {
    const q = collection(db, 'cases', caseId, 'requirements')
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (a.merge_order ?? 99) - (b.merge_order ?? 99))
      setReqs(docs)
    })
    return unsub
  }, [caseId])

  // Lista de abogados de la agencia (para TeamWidget)
  useEffect(() => {
    if (!claims?.agencyId) return
    const q = query(
      collection(db, 'users'),
      where('agencyId', '==', claims.agencyId),
      where('role', '==', 'lawyer'),
      orderBy('created_at', 'asc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setLawyers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [claims?.agencyId])

  const handleStatusChange = async (newStatus) => {
    setStatusSaving(true)
    await updateDoc(doc(db, 'cases', caseId), { status: newStatus })
    await addTimelineEvent(caseId, `Estado del expediente → ${CASE_STATUS_LABEL[newStatus]}`)
    setStatusSaving(false)
  }

  const handleGeneratePackage = () =>
    generate({ caseId, agencyId: claims?.agencyId })

  const prevPkgResult = useRef(null)
  useEffect(() => {
    if (pkgResult && pkgResult !== prevPkgResult.current) {
      prevPkgResult.current = pkgResult
      addTimelineEvent(caseId, `Paquete migratorio generado (${pkgResult.total_docs} docs · ${pkgResult.file_size_mb} MB)`)
    }
  }, [pkgResult, caseId])

  const validatedCount = reqs.filter((r) => r.status === 'validated').length
  const canGenerate    = isStaff && validatedCount > 0 && !pkgLoading && !isBlocked

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="mt-6 space-y-3">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Expediente no encontrado.</p>
        <Link to="/dashboard" className="text-military-400 text-sm mt-2 inline-block hover:underline">
          ← Volver al dashboard
        </Link>
      </div>
    )
  }

  const pd          = clientData?.personal_data ?? {}
  const clientName  = `${pd.first_name ?? ''} ${pd.last_name ?? ''}`.trim() || 'Cliente'
  const createdAt   = caseData.created_at?.toDate?.()
  const dateStr     = createdAt?.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) ?? '—'

  const tabs = [
    { id: 'checklist', label: 'Checklist' },
    ...(isStaff ? [
      { id: 'notes', label: 'Notas internas' },
      { id: 'billing', label: 'Facturación' },
    ] : []),
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Breadcrumb */}
      <Link to="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition-colors mb-6 inline-block">
        ← Expedientes
      </Link>

      {/* Header expediente */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-100">{clientName}</h1>
            <p className="text-sm text-military-400 font-medium mt-0.5">
              {TYPE_LABEL[caseData.type] ?? caseData.type}
            </p>
            <p className="text-xs text-slate-500 mt-1">Abierto el {dateStr}</p>
          </div>

          {isStaff ? (
            <select
              value={caseData.status}
              disabled={statusSaving}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-military-600 disabled:opacity-50 cursor-pointer"
            >
              {CASE_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>
              ))}
            </select>
          ) : (
            <StatusBadge status={caseData.status} meta={
              Object.fromEntries(CASE_STATUS_OPTIONS.map((s) => [s, {
                label: CASE_STATUS_LABEL[s],
                color: 'bg-slate-800 text-slate-300 border-slate-700',
                dot: 'bg-slate-500',
              }]))
            } />
          )}
        </div>

        {clientData && (
          <div className="mt-5 pt-5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              ['Email', pd.email],
              ['Teléfono', pd.phone],
              ['Nacionalidad', pd.nationality],
              ['Pasaporte', pd.passport_number],
              ['Expiración', pd.passport_expiry],
            ].map(([label, val]) => val ? (
              <div key={label}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-xs text-slate-300 font-medium mt-0.5">{val}</p>
              </div>
            ) : null)}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">

          {/* Tab bar */}
          <div className="flex border-b border-slate-800 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-military-500 text-military-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Checklist ── */}
          {activeTab === 'checklist' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-300">
                  Documentación requerida
                  <span className="ml-2 text-slate-500 font-normal">
                    {validatedCount}/{reqs.length} validados
                  </span>
                </h2>
                <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-military-600 rounded-full transition-all duration-500"
                    style={{ width: reqs.length ? `${(validatedCount / reqs.length) * 100}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Grouped Requirements */}
              {[
                { id: caseData.clientId, name: clientName, role: 'Titular' },
                ...(caseData.beneficiaries || []).map(b => ({ id: b.clientId, name: b.name, role: b.relationship === 'spouse' ? 'Cónyuge' : 'Dependiente' }))
              ].map((client) => {
                const clientReqs = reqs.filter(r => {
                  // Si no tiene el campo, asumimos que es del titular para compatibilidad
                  const ownerId = r.belongs_to_client_id || caseData.clientId
                  return ownerId === client.id
                })
                if (clientReqs.length === 0) return null

                return (
                  <div key={client.id} className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Documentos de {client.name}
                      </h3>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-500 font-bold uppercase">
                        {client.role}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {clientReqs.map((req) => (
                        <RequirementRow
                          key={req.id}
                          req={req}
                          caseId={caseId}
                          agencyId={caseData.agencyId}
                          clientId={client.id}
                          isStaff={isStaff}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {reqs.length === 0 && (
                <p className="text-center text-slate-600 text-sm py-8">No hay requisitos definidos.</p>
              )}

              {/* Magic Button */}
              {isStaff && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">
                  {isBlocked && (
                    <div className="flex items-start gap-3 bg-red-950/20 border border-red-900/40 rounded-xl px-4 py-3 mb-5">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <div>
                        <p className="text-xs font-bold text-red-400 uppercase tracking-tight">Generación bloqueada por deuda</p>
                        <p className="text-[11px] text-red-300/70 mt-0.5 leading-relaxed">
                          Registra el pago en la pestaña <strong className="text-red-300">Facturación</strong> para desbloquear.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">Paquete Migratorio</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Genera un PDF único con todos los documentos validados, listo para presentar.
                        {validatedCount === 0 && ' Necesitas al menos 1 documento validado.'}
                      </p>
                    </div>
                    <button
                      onClick={handleGeneratePackage}
                      disabled={!canGenerate}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                                 bg-military-600 hover:bg-military-500 text-white transition-all
                                 disabled:opacity-40 disabled:cursor-not-allowed
                                 shadow-lg shadow-military-900/30"
                    >
                      {pkgLoading ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Generando...
                        </>
                      ) : isBlocked ? (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Bloqueado
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Generar paquete ({validatedCount} docs)
                        </>
                      )}
                    </button>
                  </div>

                  {pkgResult && (
                    <div className="mt-4 flex items-center justify-between bg-military-900/30 border border-military-800/60 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-xs text-military-300 font-medium">✓ Paquete generado correctamente</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {pkgResult.total_docs} documentos · {pkgResult.file_size_mb} MB
                        </p>
                      </div>
                      <a
                        href={pkgResult.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-military-400 hover:text-military-300 font-medium underline underline-offset-2"
                      >
                        Descargar Paquete ({pkgResult.file_type?.toUpperCase() || 'PDF'})
                      </a>
                    </div>
                  )}

                  {pkgError && (
                    <div className="mt-4 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
                      <p className="text-xs text-red-400">{pkgError}</p>
                    </div>
                  )}

                  {!pkgResult && caseData.last_package?.file_url && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4">
                      <p className="text-xs text-slate-500">Último paquete generado</p>
                      <a
                        href={caseData.last_package.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
                      >
                        Descargar · {caseData.last_package.file_size_mb} MB
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Notas Internas ── */}
          {activeTab === 'notes' && isStaff && (
            <InternalNotesTab caseId={caseId} user={user} />
          )}

          {/* ── Tab: Facturación ── */}
          {activeTab === 'billing' && isStaff && (
            <BillingTab caseId={caseId} isStaff={isStaff} />
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="w-72 flex-shrink-0 space-y-4">
          {isStaff && (
            <TeamWidget
              caseData={caseData}
              caseId={caseId}
              lawyers={lawyers}
              isAdmin={isAdmin}
            />
          )}
          {caseData.timeline?.length > 0 && (
            <CaseTimeline timeline={caseData.timeline} />
          )}
        </div>

      </div>
    </div>
  )
}
