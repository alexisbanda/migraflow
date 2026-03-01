import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

const AuthContext = createContext(null)

async function readClaims(firebaseUser) {
  // forceRefresh: true → siempre obtiene el token más reciente del servidor,
  // ignorando la caché local. Necesario para que los custom claims del seed
  // se reflejen sin que el usuario tenga que cerrar sesión y volver a entrar.
  const result = await firebaseUser.getIdTokenResult(true)
  return {
    role:     result.claims.role     ?? null,
    agencyId: result.claims.agencyId ?? null,
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [claims,  setClaims]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const c = await readClaims(firebaseUser)
        setUser(firebaseUser)
        setClaims(c)
      } else {
        setUser(null)
        setClaims(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Tras el login forzamos también un refresh explícito para que
  // los claims queden sincronizados en el mismo ciclo de render.
  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const c    = await readClaims(cred.user)
    setUser(cred.user)
    setClaims(c)
    return cred
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, claims, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
