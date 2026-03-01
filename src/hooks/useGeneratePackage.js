/**
 * useGeneratePackage
 * Hook que encapsula la llamada a la Cloud Function generateMigratoryPackage.
 *
 * Uso:
 *   const { generate, loading, result, error } = useGeneratePackage()
 *   await generate({ caseId, agencyId })
 */

import { useState, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

const generateFn = httpsCallable(functions, 'generateMigratoryPackage', {
  timeout: 310_000,  // 310s — ligeramente por encima del timeout de la función (300s)
})

export function useGeneratePackage() {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)   // { file_url, file_size_mb, total_docs }
  const [error,   setError]   = useState(null)

  const generate = useCallback(async ({ caseId, agencyId }) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data } = await generateFn({ caseId, agencyId })
      setResult(data)
      return data
    } catch (err) {
      const message = err?.message ?? 'Error desconocido al generar el paquete.'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { generate, loading, result, error }
}
