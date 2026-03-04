import { useState, useEffect } from 'react'
import {
  doc, collection, onSnapshot, updateDoc, setDoc, addDoc, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

export function useBilling(caseId) {
  const [billing, setBilling] = useState(null)
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!caseId) return

    const billingRef = collection(db, 'cases', caseId, 'billing')
    const unsubBilling = onSnapshot(billingRef, (snap) => {
      if (!snap.empty) {
        setBilling({ id: snap.docs[0].id, ...snap.docs[0].data() })
      } else {
        setBilling(null)
      }
      setLoading(false)
    })

    const milestonesRef = query(
      collection(db, 'cases', caseId, 'billing_milestones'),
      orderBy('due_date', 'asc')
    )
    const unsubMilestones = onSnapshot(milestonesRef, (snap) => {
      setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => {
      unsubBilling()
      unsubMilestones()
    }
  }, [caseId])

  // Denormaliza billing_status al doc del expediente para queries del dashboard
  const syncCaseStatus = async (status) => {
    await updateDoc(doc(db, 'cases', caseId), { billing_status: status })
  }

  const initBilling = async (data) => {
    const billingRef = collection(db, 'cases', caseId, 'billing')
    const newDocRef = doc(billingRef)
    const status = data.payment_status || 'pending'
    await setDoc(newDocRef, {
      total_amount: data.total_amount || 0,
      paid_amount: 0,
      currency: data.currency || 'EUR',
      payment_status: status,
      block_generation_on_debt: true,
      created_at: serverTimestamp(),
      ...data,
    })
    await syncCaseStatus(status)
  }

  const updateBilling = async (billingId, data) => {
    const docRef = doc(db, 'cases', caseId, 'billing', billingId)
    await updateDoc(docRef, data)
    if (data.payment_status !== undefined) {
      await syncCaseStatus(data.payment_status)
    }
  }

  const addMilestone = async (data) => {
    const milestonesRef = collection(db, 'cases', caseId, 'billing_milestones')
    await addDoc(milestonesRef, {
      ...data,
      status: data.status || 'pending',
      created_at: serverTimestamp(),
    })
  }

  const recordPayment = async (milestoneId, amount) => {
    const mRef = doc(db, 'cases', caseId, 'billing_milestones', milestoneId)
    await updateDoc(mRef, {
      status: 'paid',
      paid_at: serverTimestamp(),
    })

    if (billing) {
      const newPaid = (billing.paid_amount || 0) + amount
      const isFull = newPaid >= billing.total_amount
      const newStatus = isFull ? 'paid' : 'partial'
      await updateBilling(billing.id, {
        paid_amount: newPaid,
        payment_status: newStatus,
      })
    }
  }

  return {
    billing,
    milestones,
    loading,
    initBilling,
    updateBilling,
    addMilestone,
    recordPayment,
  }
}
