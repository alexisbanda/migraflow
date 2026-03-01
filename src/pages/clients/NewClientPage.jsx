/**
 * NewClientPage — Página que monta el wizard de alta de cliente.
 * Solo accesible por agency_admin y lawyer (protegido en el router).
 */
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import ClientOnboarding from '@/components/onboarding/ClientOnboarding'
import PersonalDataStep from '@/components/onboarding/steps/PersonalDataStep'
import PassportStep     from '@/components/onboarding/steps/PassportStep'
import FamilyStep       from '@/components/onboarding/steps/FamilyStep'
import CaseTypeStep     from '@/components/onboarding/steps/CaseTypeStep'
import { injectRequirements } from '@/lib/caseHelpers'

export default function NewClientPage() {
  const { claims } = useAuth()
  const navigate   = useNavigate()

  const handleComplete = async (formData) => {
    const { agencyId } = claims

    // 1. Crear documento cliente en Firestore (Titular)
    const clientRef = await addDoc(collection(db, 'clients'), {
      agencyId,
      personal_data: {
        first_name:  formData.first_name,
        last_name:   formData.last_name,
        email:       formData.email,
        phone:       formData.phone,
        dob:         formData.dob,
        nationality: formData.nationality,
        passport_number: formData.passport_number,
        passport_expiry: formData.passport_expiry,
      },
      created_at: serverTimestamp(),
    })

    // 2. Crear beneficiarios si aplica
    const beneficiariesDocs = []
    if (formData.is_family && formData.beneficiaries?.length > 0) {
      for (const ben of formData.beneficiaries) {
        const benRef = await addDoc(collection(db, 'clients'), {
          agencyId,
          personal_data: {
            first_name:  ben.first_name,
            last_name:   ben.last_name,
            relationship: ben.relationship,
          },
          created_at: serverTimestamp(),
          is_beneficiary: true,
          parent_client_id: clientRef.id,
        })
        beneficiariesDocs.push({ 
          clientId: benRef.id, 
          relationship: ben.relationship, 
          name: `${ben.first_name} ${ben.last_name}`.trim() 
        })
      }
    }

    // 3. Subir pasaporte a Storage (Titular)
    let passport_url = null
    if (formData.passport_file) {
      const storagePath = `${agencyId}/${clientRef.id}/passport/${formData.passport_file.name}`
      const storageRef  = ref(storage, storagePath)
      await uploadBytes(storageRef, formData.passport_file)
      passport_url = await getDownloadURL(storageRef)
    }

    // 4. Crear el expediente (case)
    const caseRef = await addDoc(collection(db, 'cases'), {
      agencyId,
      clientId:           clientRef.id,
      beneficiaries:      beneficiariesDocs,
      assigned_lawyer_id: null,
      type:               formData.case_type,
      status:             'open',
      passport_url,
      timeline:           [{ event: 'case_created', timestamp: serverTimestamp() }],
      created_at:         serverTimestamp(),
    })

    // 5. Inyectar requisitos para titular y beneficiarios
    const clientsToInject = [
      { id: clientRef.id, role: 'titular' },
      ...beneficiariesDocs.map(b => ({ id: b.clientId, role: b.relationship }))
    ]
    await injectRequirements(caseRef.id, formData.case_type, clientsToInject)

    navigate(`/cases/${caseRef.id}`)
  }

  return (
    <ClientOnboarding onComplete={handleComplete}>
      <ClientOnboarding.Progress />
      <PersonalDataStep />
      <PassportStep />
      <FamilyStep />
      <CaseTypeStep />
      <ClientOnboarding.Nav />
    </ClientOnboarding>
  )
}
