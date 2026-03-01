import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const ERROR_MESSAGES = {
  'auth/invalid-credential':     'Email o contraseña incorrectos.',
  'auth/user-not-found':         'No existe una cuenta con ese email.',
  'auth/wrong-password':         'Contraseña incorrecta.',
  'auth/too-many-requests':      'Demasiados intentos. Espera unos minutos.',
  'auth/user-disabled':          'Esta cuenta ha sido desactivada.',
}

export default function LoginPage() {
  const { login }    = useAuth()
  const navigate     = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [busy,     setBusy]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const cred = await login(email, password)
      const result = await cred.user.getIdTokenResult()
      const role   = result.claims.role
      const dest   = role === 'client'     ? '/portal'
                   : role === 'superadmin' ? '/superadmin'
                   : '/dashboard'
      navigate(dest, { replace: true })
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] ?? 'Error al iniciar sesión. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-8">

        {/* Brand */}
        <div className="mb-8 text-center">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold
                           bg-military-900/50 text-military-300 border border-military-800 mb-4">
            MigraFlow
          </span>
          <h1 className="text-2xl font-bold text-slate-100">Acceso al panel</h1>
          <p className="text-sm text-slate-500 mt-1">Gestión de expedientes de extranjería</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@despacho.es"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5
                         text-sm text-slate-100 placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-military-600 focus:border-transparent
                         transition-all"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-300 block mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5
                         text-sm text-slate-100 placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-military-600 focus:border-transparent
                         transition-all"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
              </svg>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg text-sm font-semibold
                       bg-military-600 hover:bg-military-500 text-white
                       disabled:opacity-60 disabled:cursor-not-allowed transition-all
                       shadow-lg shadow-military-900/30"
          >
            {busy ? 'Iniciando sesión...' : 'Entrar'}
          </button>
        </form>

      </div>
    </div>
  )
}
