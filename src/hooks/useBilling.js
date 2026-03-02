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

    // 1. Billing summary listener
    // Note: We use the first doc of a subcollection for flexibility, 
    // or a single doc if we prefer. Given the README, /billing/{id}
    const billingRef = collection(db, 'cases', caseId, 'billing')
    const unsubBilling = onSnapshot(billingRef, (snap) => {
      if (!snap.empty) {
        setBilling({ id: snap.docs[0].id, ...snap.docs[0].data() })
      } else {
        setBilling(null)
      }
      setLoading(false)
    })

    // 2. Milestones listener
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

  const initBilling = async (data) => {
    const billingRef = collection(db, 'cases', caseId, 'billing')
    const newDoc = doc(billingRef)
    await setDoc(newDoc, {
      total_amount: data.total_amount || 0,
      paid_amount: 0,
      currency: data.currency || 'EUR',
      payment_status: 'pending',
      block_generation_on_debt: true,
      created_at: serverTimestamp(),
      ...data
    })
  }

  const updateBilling = async (billingId, data) => {
    const docRef = doc(db, 'cases', caseId, 'billing', billingId)
    await updateDoc(docRef, data)
  }

  const addMilestone = async (data) => {
    const milestonesRef = collection(db, 'cases', caseId, 'billing_milestones')
    await addDoc(milestonesRef, {
      ...data,
      status: data.status || 'pending',
      created_at: serverTimestamp()
    })
  }

  const recordPayment = async (milestoneId, amount) => {
    // 1. Update milestone
    const mRef = doc(db, 'cases', caseId, 'billing_milestones', milestoneId)
    await updateDoc(mRef, {
      status: 'paid',
      paid_at: serverTimestamp()
    })

    // 2. Update billing summary
    if (billing) {
      const newPaid = (billing.paid_amount || 0) + amount
      const isFull = newPaid >= billing.total_amount
      await updateBilling(billing.id, {
        paid_amount: newPaid,
        payment_status: isFull ? 'paid' : 'partial'
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
    recordPayment
  }
}
