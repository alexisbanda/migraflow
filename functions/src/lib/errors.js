const { HttpsError } = require('firebase-functions/v2/https')

/**
 * Lanza un HttpsError tipado para onCall functions.
 * @param {'permission-denied'|'not-found'|'invalid-argument'|'internal'} code
 * @param {string} message
 */
function throwFn(code, message) {
  throw new HttpsError(code, message)
}

/**
 * Verifica que el llamante tiene el role esperado y el agencyId correcto.
 * Para usuarios de agencia (agency_admin, lawyer) — no válido para superadmin.
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 * @param {string[]} allowedRoles
 */
function assertRole(request, allowedRoles) {
  const { role, agencyId } = request.auth?.token ?? {}
  if (!role || !allowedRoles.includes(role)) {
    throwFn('permission-denied', `Se requiere uno de los roles: ${allowedRoles.join(', ')}`)
  }
  if (!agencyId) {
    throwFn('permission-denied', 'El token no contiene agencyId.')
  }
  return { role, agencyId }
}

/**
 * Verifica que el llamante es superadmin.
 * @param {import('firebase-functions/v2/https').CallableRequest} request
 */
function assertSuperAdmin(request) {
  if (!request.auth || request.auth.token?.role !== 'superadmin') {
    throwFn('permission-denied', 'Se requiere rol superadmin.')
  }
}

module.exports = { throwFn, assertRole, assertSuperAdmin }
