import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function AuthCallbackPage() {
  const { completeMagicLink } = useAuth()
  const navigate              = useNavigate()
  const [error, setError]     = useState(null)

  useEffect(() => {
    completeMagicLink(window.location.href)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch((err) => setError(err.message))
  }, [completeMagicLink, navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-slate-400 hover:text-slate-200 underline"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        {/* Skeleton loader en lugar de spinner */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-3 w-40 bg-slate-800 rounded animate-pulse" />
          <div className="h-2 w-24 bg-slate-800 rounded animate-pulse" />
        </div>
        <p className="text-sm text-slate-500">Verificando tu acceso...</p>
      </div>
    </div>
  )
}
