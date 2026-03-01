import { useEffect, useState } from 'react'
import { collection, getCountFromServer } from 'firebase/firestore'
import { NavLink } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { useAgencies } from '@/hooks/useAgencies'
import Badge from '@/components/ui/Badge'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = false, loading = false }) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm
                     ${accent ? 'border-military-200/60' : 'border-slate-200'}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      {loading ? (
        <div className="h-8 w-12 bg-slate-100 rounded animate-pulse mt-1" />
      ) : (
        <p className={`text-3xl font-bold ${accent ? 'text-military-700' : 'text-slate-900'}`}>
          {value}
        </p>
      )}
      {sub && !loading && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function formatDate(timestamp) {
  if (!timestamp) return '—'
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminDashboardPage() {
  const { agencies, loading } = useAgencies()
  const [templateCount, setTemplateCount] = useState(null)

  useEffect(() => {
    getCountFromServer(collection(db, 'global_templates'))
      .then((snap) => setTemplateCount(snap.data().count))
      .catch(() => setTemplateCount(0))
  }, [])

  const stats = {
    total:     agencies.length,
    active:    agencies.filter((a) => a.active !== false).length,
    pro:       agencies.filter((a) => a.subscription_tier === 'pro').length,
    templates: templateCount,
  }

  const recentAgencies = agencies.slice(0, 4)

  return (
    <div className="flex-1 p-8 max-w-[1200px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Vista global del SaaS en tiempo real</p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total agencias"
          value={stats.total}
          sub={`${stats.total - stats.active} inactiva${stats.total - stats.active !== 1 ? 's' : ''}`}
          loading={loading}
        />
        <StatCard
          label="Activas"
          value={stats.active}
          loading={loading}
        />
        <StatCard
          label="Plan Pro"
          value={stats.pro}
          sub={`${stats.total - stats.pro} en plan Básico`}
          accent
          loading={loading}
        />
        <StatCard
          label="Plantillas globales"
          value={stats.templates ?? '—'}
          loading={templateCount === null}
        />
      </div>

      {/* ── Grid principal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Agencias recientes */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Agencias recientes</h2>
            <NavLink
              to="/superadmin/agencies"
              className="text-xs text-military-600 hover:text-military-700 font-medium"
            >
              Ver todas →
            </NavLink>
          </div>

          {loading ? (
            <div className="px-6 py-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 bg-slate-100 rounded animate-pulse" />
                    <div className="h-2.5 w-32 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentAgencies.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              No hay agencias aún.{' '}
              <NavLink to="/superadmin/agencies" className="text-military-600 hover:underline">
                Crear la primera
              </NavLink>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentAgencies.map((agency) => (
                <div key={agency.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/60">
                  {/* Color swatch */}
                  <div
                    className="w-9 h-9 rounded-lg flex-shrink-0 ring-1 ring-black/5"
                    style={{ backgroundColor: agency.settings?.primary_color ?? '#e2e8f0' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{agency.name}</p>
                    <p className="text-xs text-slate-400">{formatDate(agency.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={agency.subscription_tier === 'pro' ? 'blue' : 'gray'}>
                      {agency.subscription_tier === 'pro' ? 'Pro' : 'Básico'}
                    </Badge>
                    <Badge variant={agency.active !== false ? 'green' : 'gray'}>
                      {agency.active !== false ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accesos rápidos */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Accesos rápidos</h2>
            <div className="space-y-2">
              <QuickLink
                to="/superadmin/agencies"
                label="Gestionar Agencias"
                description="Crear, editar y activar despachos"
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
              />
              <QuickLink
                to="/superadmin/templates"
                label="Constructor de Plantillas"
                description="Flujos de visados y residencias"
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
              <QuickLink
                to="/superadmin/settings"
                label="Ajustes del SaaS"
                description="Configuración global de la plataforma"
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              />
            </div>
          </div>

          {/* Plan overview */}
          {!loading && stats.total > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Distribución de planes</h2>
              <div className="space-y-3">
                <PlanBar
                  label="Pro"
                  count={stats.pro}
                  total={stats.total}
                  color="bg-blue-500"
                />
                <PlanBar
                  label="Básico"
                  count={stats.total - stats.pro}
                  total={stats.total}
                  color="bg-slate-300"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuickLink({ to, label, description, icon }) {
  return (
    <NavLink
      to={to}
      className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-slate-50
                 border border-transparent hover:border-slate-200 transition-all group"
    >
      <span className="text-slate-400 group-hover:text-military-600 transition-colors mt-0.5 flex-shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
    </NavLink>
  )
}

function PlanBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span className="font-medium">{count} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
