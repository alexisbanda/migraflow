import { db } from './firebase'
import { collection, query, where, getDocs, addDoc, serverTimestamp, limit } from 'firebase/firestore'

/**
 * Inyecta los requisitos de una plantilla en un expediente.
 * Soporta múltiples clientes (titular + beneficiarios).
 * 
 * @param {string} caseId - ID del expediente
 * @param {string} caseType - Tipo de expediente (slug)
 * @param {Array} clients - Lista de { id, role } involucrados
 */
export async function injectRequirements(caseId, caseType, clients) {
  try {
    // 1. Buscar la plantilla por case_type
    const tplQuery = query(
      collection(db, 'global_templates'), 
      where('case_type', '==', caseType),
      limit(1)
    )
    const tplSnap = await getDocs(tplQuery)
    
    if (tplSnap.empty) {
      console.warn(`[injectRequirements] No se encontró plantilla para tipo: ${caseType}`)
      return
    }

    const tplData = tplSnap.docs[0].data()
    const blueprint = tplData.requirements_blueprint || {}

    // Si la plantilla es antigua (array), la tratamos como titular
    const normalizedBlueprint = Array.isArray(blueprint) 
      ? { titular: blueprint, spouse: [], child: [] }
      : blueprint

    const reqsRef = collection(db, 'cases', caseId, 'requirements')

    // 2. Iterar por cada cliente e inyectar sus requisitos específicos
    for (const client of clients) {
      const role = client.role || 'titular'
      const roleReqs = normalizedBlueprint[role] || []

      for (const req of roleReqs) {
        await addDoc(reqsRef, {
          name:                req.name,
          status:              'pending',
          merge_order:         req.merge_order || 0,
          type:                req.type || 'client_upload',
          client_instructions: req.client_instructions || '',
          is_mandatory:        req.is_mandatory ?? true,
          ai_rules:            req.ai_rules || {},
          belongs_to_client_id: client.id,
          created_at:          serverTimestamp(),
        })
      }
    }
    
    console.log(`[injectRequirements] Inyectados requisitos para ${clients.length} clientes en case ${caseId}`)
  } catch (err) {
    console.error('[injectRequirements] Error:', err)
    throw err
  }
}
