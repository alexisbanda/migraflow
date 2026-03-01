import { useState, useEffect } from 'react'
import {
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** Convierte el nombre de la agencia en un ID legible para Firestore. */
function nameToSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // elimina diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/**
 * Hook para la gestión de agencias (superadmin).
 * Devuelve el listado en tiempo real + métodos CRUD.
 */
export function useAgencies() {
  const [agencies, setAgencies] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'agencies'),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        // Ordenar por created_at descendente (más recientes primero)
        data.sort((a, b) => {
          const ta = a.created_at?.toMillis?.() ?? 0
          const tb = b.created_at?.toMillis?.() ?? 0
          return tb - ta
        })
        setAgencies(data)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  /**
   * Crea una agencia nueva en Firestore.
   * @returns {string} agencyId generado
   */
  const createAgency = async ({ name, brandColor, adminEmail, defaultTemplateId }) => {
    const slug     = nameToSlug(name)
    const agencyId = `${slug}-${Date.now().toString(36)}`

    await setDoc(doc(db, 'agencies', agencyId), {
      name,
      subscription_tier:   'basic',
      active:              true,
      settings: {
        primary_color:         brandColor,
        notifications_email:   adminEmail || null,
        logo_url:              null,
      },
      default_template_id: defaultTemplateId || null,
      admin_email_pending: adminEmail || null,
      admin_uid:           null,
      created_at:          serverTimestamp(),
    })

    return agencyId
  }

  /** Actualiza campos de una agencia existente. */
  const updateAgency = async (agencyId, updates) => {
    await updateDoc(doc(db, 'agencies', agencyId), updates)
  }

  /** Alterna el estado activo/inactivo de una agencia. */
  const toggleActive = async (agency) => {
    await updateDoc(doc(db, 'agencies', agency.id), {
      active: !(agency.active ?? true),
    })
  }

  /** Cambia el plan de suscripción de una agencia. */
  const changePlan = async (agencyId, plan) => {
    await updateDoc(doc(db, 'agencies', agencyId), {
      subscription_tier: plan,
    })
  }

  return {
    agencies,
    loading,
    error,
    createAgency,
    updateAgency,
    toggleActive,
    changePlan,
  }
}
