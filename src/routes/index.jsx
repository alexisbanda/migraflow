import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

import AppShell                 from '@/components/layout/AppShell'
import SuperAdminLayout         from '@/components/layout/SuperAdminLayout'
import LoginPage                from '@/pages/auth/LoginPage'
import DashboardPage            from '@/pages/dashboard/DashboardPage'
import NewClientPage            from '@/pages/clients/NewClientPage'
import CasePage                 from '@/pages/cases/CasePage'
import ClientPortalPage         from '@/pages/portal/ClientPortalPage'
import SuperAdminDashboardPage  from '@/pages/superadmin/SuperAdminDashboardPage'
import AgenciesPage             from '@/pages/superadmin/AgenciesPage'
import SettingsPage             from '@/pages/superadmin/SettingsPage'
import TemplateBuilderPage      from '@/pages/superadmin/TemplateBuilderPage'

// ─── Unauthorized ─────────────────────────────────────────────────────────────

function UnauthorizedPage() {
  const { user, claims, logout } = useAuth()
  const handleLogout = async () => { await logout(); window.location.href = '/login' }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-red-950/50 border border-red-900/60 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-100">Sin permisos</h1>
          <p className="text-xs text-slate-500 mt-1">
            Tu cuenta (<span className="text-slate-400">{user?.email}</span>) no tiene rol asignado.
          </p>
          {claims?.role && (
            <p className="text-xs text-amber-400 mt-1">Rol detectado: <strong>{claims.role}</strong></p>
          )}
        </div>
        <p className="text-xs text-slate-600">
          Solicita al administrador que ejecute el seed o asigne permisos a tu cuenta.
        </p>
        <button
          onClick={handleLogout}
          className="w-full py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700
                     text-slate-300 transition-all"
        >
          Cerrar sesión e intentar con otra cuenta
        </button>
      </div>
    </div>
  )
}

// ─── Role redirect (landing "/" según rol) ────────────────────────────────────

function RoleRedirect() {
  const { user, claims, loading } = useAuth()
  if (loading) return <FullPageSkeleton />
  if (!user)   return <Navigate to="/login" replace />
  if (claims?.role === 'client')     return <Navigate to="/portal"     replace />
  if (claims?.role === 'superadmin') return <Navigate to="/superadmin" replace />
  return <Navigate to="/dashboard" replace />
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function RequireAuth({ allowedRoles }) {
  const { user, claims, loading } = useAuth()

  if (loading) return <FullPageSkeleton />
  if (!user)   return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(claims?.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}

function FullPageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center gap-3">
      <div className="h-2 w-32 bg-slate-800 rounded animate-pulse" />
      <div className="h-2 w-20 bg-slate-800 rounded animate-pulse" />
    </div>
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Públicas
  { path: '/login', element: <LoginPage /> },

  // Protegidas — agency_admin y lawyer (con AppShell)
  {
    element: <RequireAuth allowedRoles={['agency_admin', 'lawyer']} />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard',     element: <DashboardPage /> },
          { path: '/clients/new',   element: <NewClientPage /> },
          { path: '/cases/:caseId', element: <CasePage /> },
        ],
      },
    ],
  },

  // Portal del cliente (rol: client)
  {
    element: <RequireAuth allowedRoles={['client']} />,
    children: [
      { path: '/portal', element: <ClientPortalPage /> },
    ],
  },

  // Superadmin
  {
    element: <RequireAuth allowedRoles={['superadmin']} />,
    children: [
      {
        element: <SuperAdminLayout />,
        children: [
          { path: '/superadmin',           element: <SuperAdminDashboardPage /> },
          { path: '/superadmin/agencies',  element: <AgenciesPage /> },
          { path: '/superadmin/settings',   element: <SettingsPage /> },
          { path: '/superadmin/templates',  element: <TemplateBuilderPage /> },
        ],
      },
    ],
  },

  // Fallbacks
  { path: '/', element: <RoleRedirect /> },
  { path: '/unauthorized', element: <UnauthorizedPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
