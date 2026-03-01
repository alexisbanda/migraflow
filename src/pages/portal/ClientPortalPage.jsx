/**
 * ClientPortalPage — Layout del portal cliente
 *
 * Actúa como wrapper de las subrutas del portal (/portal, /portal/caso/:id).
 * Carga en tiempo real el documento del cliente y sus expedientes,
 * y los expone a las subrutas mediante PortalCtx.
 *
 * Exporta: usePortal() hook para que las subrutas accedan al contexto.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'

// ─── Contexto ─────────────────────────────────────────────────────────────────

const PortalCtx = createContext(null)

export const usePortal = () => useContext(PortalCtx)

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [clientDoc, setClientDoc] = useState(null)
  const [cases, setCases]         = useState([])
  const [loading, setLoading]     = useState(true)

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  useEffect(() => {
    if (!user?.uid) return

    let unsubCases

    async function load() {
      // 1. Buscar el doc /clients donde userId == auth.uid
      const snap = await getDocs(
        query(collection(db, 'clients'), where('userId', '==', user.uid))
      )
      if (snap.empty) { setLoading(false); return }

      const clientData = { id: snap.docs[0].id, ...snap.docs[0].data() }
      setClientDoc(clientData)

      // 2. Expedientes en tiempo real
      unsubCases = onSnapshot(
        query(collection(db, 'cases'), where('clientId', '==', clientData.id)),
        (casesSnap) => {
          const docs = casesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
          docs.sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
          setCases(docs)
          setLoading(false)
        }
      )
    }

    load()
    return () => unsubCases?.()
  }, [user?.uid])

  const pd         = clientDoc?.personal_data ?? {}
  const clientName = `${pd.first_name ?? ''} ${pd.last_name ?? ''}`.trim() || user?.email

  return (
    <PortalCtx.Provider value={{ clientDoc, cases, loading }}>
      <div className="min-h-screen bg-slate-950">

        {/* ── Header sticky ─────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-slate-800/80">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">

            {/* Logo — vuelve al dashboard */}
            <button
              onClick={() => navigate('/portal')}
              className="flex items-center gap-2.5 group"
              aria-label="Ir al inicio del portal"
            >
              <div className="w-6 h-6 rounded-md bg-military-600 flex items-center justify-center
                              group-hover:bg-military-500 transition-colors">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04
                       A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622
                       0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-slate-100">MigraFlow</span>
            </button>

            {/* User info + logout */}
            <div className="flex items-center gap-3">
              {clientName && (
                <span className="text-xs text-slate-500 hidden sm:block" aria-label="Usuario actual">
                  {clientName}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                aria-label="Cerrar sesión"
              >
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <main className="max-w-2xl mx-auto px-4 py-8">
          <Outlet />

          {/* RGPD footer */}
          <p className="text-center text-xs text-slate-700 pt-8 mt-4 border-t border-slate-900">
            Tus documentos se almacenan de forma cifrada conforme al RGPD.
            Solo tu abogado asignado tiene acceso a ellos.
          </p>
        </main>

      </div>
    </PortalCtx.Provider>
  )
}
