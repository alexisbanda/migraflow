import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection, query, where, orderBy, onSnapshot, getDoc, doc,
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

const TYPE_LABEL = {
  nomada_digital:          'Nómada Digital',
  residencia_no_lucrativa: 'No Lucrativa',
  cuenta_ajena:            'Cuenta Ajena',
  reagrupacion_familiar:   'Reagrupación Familiar',
}

const FILTERS = ['all', 'open', 'in_review', 'approved', 'rejected']

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
  return (
    <div className={`bg-slate-900 border rounded-xl p-5 ${accent ?? 'border-slate-800'}`}>
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-100">{value}</p>
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
  const createdAt = caseDoc.created_at?.toDate?.()
  const dateStr   = createdAt
    ? createdAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  return (
    <Link
      to={`/cases/${caseDoc.id}`}
      className="block bg-slate-900 border border-slate-800 rounded-xl p-5
                 hover:border-slate-600 hover:bg-slate-800/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate group-hover:text-military-300 transition-colors">
            {caseDoc.client_name ?? 'Cliente'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {TYPE_LABEL[caseDoc.type] ?? caseDoc.type}
          </p>
        </div>
        <StatusBadge status={caseDoc.status} />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Abierto el {dateStr}</span>
        <span className="flex items-center gap-1 text-slate-500 group-hover:text-slate-400 transition-colors">
          Ver expediente
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
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

  useEffect(() => {
    if (!claims?.agencyId || !user?.uid) return

    setLoading(true)

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
  }, [claims, user])

  const filtered = filter === 'all' ? cases : cases.filter((c) => c.status === filter)

  // Stats
  const stats = {
    total:     cases.length,
    open:      cases.filter((c) => c.status === 'open').length,
    in_review: cases.filter((c) => c.status === 'in_review').length,
    approved:  cases.filter((c) => c.status === 'approved').length,
  }

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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total"      value={stats.total} />
        <StatCard label="Abiertos"   value={stats.open} accent="border-sky-900/40" />
        <StatCard label="En revisión" value={stats.in_review} accent="border-amber-900/40" />
        <StatCard label="Aprobados"  value={stats.approved} accent="border-military-800/60" />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
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

      {/* Lista */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <CaseSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-600">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-sm">
            {filter === 'all' ? 'No hay expedientes aún.' : `No hay expedientes con estado "${STATUS_META[filter]?.label}".`}
          </p>
          {filter === 'all' && (
            <Link to="/clients/new" className="text-military-400 text-sm mt-2 inline-block hover:underline">
              Crear el primero →
            </Link>
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
