import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection, query, where, orderBy, onSnapshot, getDoc, doc, updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_META = {
  open:      { label: 'Abierto',     color: 'bg-sky-900/50 text-sky-300 border-sky-800/60' },
  in_review: { label: 'En revisión', color: 'bg-amber-900/50 text-amber-300 border-amber-800/60' },
  approved:  { label: 'Aprobado',    color: 'bg-military-900/50 text-military-300 border-military-800/60' },
  rejected:  { label: 'Rechazado',   color: 'bg-red-900/50 text-red-300 border-red-800/60' },
  closed:    { label: 'Cerrado',     color: 'bg-slate-800 text-slate-400 border-slate-700' },
}

const CASE_STATUS_OPTIONS = ['open', 'in_review', 'approved', 'rejected', 'closed']

const TYPE_LABEL = {
  nomada_digital:          'Nómada Digital',
  residencia_no_lucrativa: 'No Lucrativa',
  cuenta_ajena:            'Cuenta Ajena',
  reagrupacion_familiar:   'Reagrupación Familiar',
}

const FILTERS = ['all', 'open', 'in_review', 'approved', 'rejected']

function exportCSV(cases) {
  const headers = ['ID', 'Cliente', 'Tipo', 'Estado', 'Fecha apertura', 'Abogado asignado']
  const rows = cases.map((c) => {
    const date = c.created_at?.toDate?.()?.toLocaleDateString('es-ES') ?? '—'
    return [
      c.id,
      c.client_name ?? 'Cliente',
      TYPE_LABEL[c.type] ?? c.type,
      STATUS_META[c.status]?.label ?? c.status,
      date,
      c.assigned_lawyer_name ?? '',
    ]
  })
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `expedientes_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
  return (
    <div className={`bg-slate-900 border rounded-xl p-5 ${accent ?? 'border-slate-800'}`}>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-100">{value}</p>
    </div>
  )
}

function OverdueWidget({ cases }) {
  return (
    <div className="mb-8 bg-red-950/20 border border-red-900/40 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <div>
          <h2 className="text-sm font-semibold text-red-400">
            {cases.length} expediente{cases.length !== 1 ? 's' : ''} con deuda pendiente
          </h2>
          <p className="text-[11px] text-red-300/60 mt-0.5">La generación del paquete migratorio está bloqueada hasta regularizar el pago.</p>
        </div>
      </div>
      <div className="space-y-2">
        {cases.map((c) => (
          <Link
            key={c.id}
            to={`/cases/${c.id}`}
            className="flex items-center justify-between bg-red-950/20 border border-red-900/30 rounded-xl px-4 py-2.5
                       hover:border-red-800/60 hover:bg-red-950/30 transition-all group"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-red-300 transition-colors">
                {c.client_name ?? 'Cliente'}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">{TYPE_LABEL[c.type] ?? c.type}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="px-2 py-0.5 bg-red-950/50 border border-red-900/50 text-red-400 text-[10px] font-bold rounded-full uppercase tracking-wide">
                Deuda
              </span>
              <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function CaseSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="h-3 w-32 bg-slate-800 rounded" />
        <div className="h-3 w-16 bg-slate-800 rounded" />
      </div>
      <div className="h-2 w-48 bg-slate-800 rounded" />
      <div className="h-2 w-24 bg-slate-800 rounded" />
    </div>
  )
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.open
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function CaseCard({ caseDoc }) {
  const [saving, setSaving] = useState(false)
  const createdAt = caseDoc.created_at?.toDate?.()
  const dateStr   = createdAt
    ? createdAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    : '—'

  const assignees = caseDoc.assignees ?? []

  const handleStatusChange = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const newStatus = e.target.value
    if (newStatus === caseDoc.status) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'cases', caseDoc.id), { status: newStatus })
    } catch (err) {
      console.error('Failed to update status', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Link
      to={`/cases/${caseDoc.id}`}
      className="block bg-slate-900 border border-slate-800 rounded-xl p-4
                 hover:border-slate-600 hover:bg-slate-800/50 transition-all group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {/* Status Dot */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            caseDoc.status === 'approved' ? 'bg-military-500' :
            caseDoc.status === 'rejected' ? 'bg-red-500' :
            caseDoc.status === 'in_review' ? 'bg-amber-500' :
            'bg-sky-500'
          }`} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-100 truncate group-hover:text-military-300 transition-colors">
                {caseDoc.client_name ?? 'Cliente'}
              </p>
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-tighter bg-slate-800/50 px-1 rounded">
                {caseDoc.id.slice(-6)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>{TYPE_LABEL[caseDoc.type] ?? caseDoc.type}</span>
              <span className="w-1 h-1 rounded-full bg-slate-800" />
              <span>Abierto el {dateStr}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Team */}
          {assignees.length > 0 && (
            <div className="hidden sm:flex -space-x-2">
              {assignees.slice(0, 3).map((a, i) => (
                <div 
                  key={i}
                  title={a.name}
                  className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] text-slate-400 font-bold"
                >
                  {(a.name ?? 'U')[0].toUpperCase()}
                </div>
              ))}
              {assignees.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] text-slate-500 font-bold">
                  +{assignees.length - 3}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              <select
                value={caseDoc.status}
                disabled={saving}
                onChange={handleStatusChange}
                className={`bg-transparent border-none text-xs font-medium cursor-pointer focus:ring-0 p-0 pr-6 ${
                  STATUS_META[caseDoc.status]?.color?.split(' ')[1] ?? 'text-slate-400'
                }`}
              >
                {CASE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-300">
                    {STATUS_META[s]?.label ?? s}
                  </option>
                ))}
              </select>
            </div>
            <svg className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, claims }     = useAuth()
  const [cases,   setCases]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter] = useState('all')
  const [search,  setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [lawyerFilter, setLawyerFilter] = useState('all')
  const [lawyers, setLawyers] = useState([])
  const [sortBy, setSortBy] = useState('newest')

  const isAdmin = claims?.role === 'agency_admin'

  useEffect(() => {
    if (!claims?.agencyId || !user?.uid) return

    setLoading(true)

    // Fetch lawyers if admin
    if (isAdmin) {
      const qL = query(
        collection(db, 'users'),
        where('agencyId', '==', claims.agencyId),
        where('role', '==', 'lawyer')
      )
      onSnapshot(qL, (snap) => {
        setLawyers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      })
    }

    const constraints = [where('agencyId', '==', claims.agencyId)]
    // Lawyer solo ve sus casos asignados
    if (claims.role === 'lawyer') {
      constraints.push(where('assigned_lawyer_id', '==', user.uid))
    }
    constraints.push(orderBy('created_at', 'desc'))

    const q = query(collection(db, 'cases'), ...constraints)

    // Cache client names to avoid repeated reads
    const clientNameCache = new Map()

    const unsub = onSnapshot(q, (snap) => {
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

      ;(async () => {
        try {
          const enriched = await Promise.all(raw.map(async (c) => {
            if (c.client_name) return c
            const clientId = c.clientId || c.client_id || c.client || null
            if (!clientId) return { ...c, client_name: 'Cliente' }

            if (clientNameCache.has(clientId)) {
              return { ...c, client_name: clientNameCache.get(clientId) }
            }

            try {
              const snapCl = await getDoc(doc(db, 'clients', clientId))
              const data = snapCl.exists() ? snapCl.data() : null
              const pd = data?.personal_data ?? data
              const name = pd ? `${pd.first_name ?? ''} ${pd.last_name ?? ''}`.trim() : ''
              const clientName = name || data?.display_name || 'Cliente'
              clientNameCache.set(clientId, clientName)
              return { ...c, client_name: clientName }
            } catch (err) {
              console.error('Failed to load client', clientId, err)
              return { ...c, client_name: 'Cliente' }
            }
          }))

          setCases(enriched)
        } catch (err) {
          console.error('Failed to enrich cases with client names:', err)
          setCases(raw)
        } finally {
          setLoading(false)
        }
      })()
    }, (err) => {
      console.error('Failed to subscribe cases:', err)
      setLoading(false)
    })

    return unsub
  }, [claims, user, isAdmin])

  const filtered = cases.filter((c) => {
    const matchesStatus = filter === 'all' || c.status === filter
    const matchesType   = typeFilter === 'all' || c.type === typeFilter
    const matchesSearch = !search || 
      (c.client_name?.toLowerCase().includes(search.toLowerCase())) ||
      (c.id.toLowerCase().includes(search.toLowerCase()))
    const matchesLawyer = lawyerFilter === 'all' || 
      (c.assignee_uids?.includes(lawyerFilter)) || 
      (c.assigned_lawyer_id === lawyerFilter)

    return matchesStatus && matchesType && matchesSearch && matchesLawyer
  }).sort((a, b) => {
    if (sortBy === 'newest') return (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0)
    if (sortBy === 'oldest') return (a.created_at?.seconds ?? 0) - (b.created_at?.seconds ?? 0)
    if (sortBy === 'client') return (a.client_name ?? '').localeCompare(b.client_name ?? '')
    return 0
  })

  // Stats
  const stats = {
    total:     cases.length,
    open:      cases.filter((c) => c.status === 'open').length,
    in_review: cases.filter((c) => c.status === 'in_review').length,
    approved:  cases.filter((c) => c.status === 'approved').length,
  }

  const overdueCases = cases.filter((c) => c.billing_status === 'debt')

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Expedientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '...' : `${cases.length} expediente${cases.length !== 1 ? 's' : ''} en total`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cases.length > 0 && (
            <button
              onClick={() => exportCSV(cases)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                         border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500
                         transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar
            </button>
          )}
          <Link
            to="/clients/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
                       bg-military-600 hover:bg-military-500 text-white transition-all
                       shadow-lg shadow-military-900/30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo cliente
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total"      value={stats.total} />
        <StatCard label="Abiertos"   value={stats.open} accent="border-sky-900/40" />
        <StatCard label="En revisión" value={stats.in_review} accent="border-amber-900/40" />
        <StatCard label="Aprobados"  value={stats.approved} accent="border-military-800/60" />
      </div>

      {/* Widget expedientes con deuda */}
      {!loading && overdueCases.length > 0 && (
        <OverdueWidget cases={overdueCases} />
      )}

      {/* Filtros y Buscador */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por cliente o ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-military-600"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-military-600 cursor-pointer"
            >
              <option value="all">Todos los procesos</option>
              {Object.entries(TYPE_LABEL).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-military-600 cursor-pointer"
            >
              <option value="newest">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="client">Cliente (A-Z)</option>
            </select>

            {isAdmin && (
              <select
                value={lawyerFilter}
                onChange={(e) => setLawyerFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-military-600 cursor-pointer"
              >
                <option value="all">Cualquier gestor</option>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.profile?.display_name || l.email}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border whitespace-nowrap ${
                filter === f
                  ? 'bg-military-900/50 text-military-300 border-military-800/60'
                  : 'text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {f === 'all' ? 'Todos' : (STATUS_META[f]?.label ?? f)}
              {f !== 'all' && (
                <span className="ml-1.5 text-slate-600">
                  {cases.filter((c) => c.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <CaseSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-600 bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-sm">
            {filter === 'all' && typeFilter === 'all' && !search 
              ? 'No hay expedientes aún.' 
              : 'No se encontraron expedientes con estos filtros.'}
          </p>
          {(filter !== 'all' || typeFilter !== 'all' || search) && (
            <button 
              onClick={() => { setFilter('all'); setTypeFilter('all'); setSearch(''); setLawyerFilter('all'); }}
              className="text-military-400 text-sm mt-2 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => <CaseCard key={c.id} caseDoc={c} />)}
        </div>
      )}
    </div>
  )
}

