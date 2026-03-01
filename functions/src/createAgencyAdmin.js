/**
 * createAgencyAdmin — onCall (superadmin only)
 * ─────────────────────────────────────────────────────────────────────────────
 * Crea un usuario agency_admin para una agencia existente:
 *   1. Crea el usuario en Firebase Auth (con contraseña temporal)
 *   2. Asigna custom claims { role: 'agency_admin', agencyId }
 *   3. Crea el documento /users/{uid} en Firestore
 *
 * Input:  { agencyId, email, displayName }
 * Output: { uid, email, tempPassword }
 */

const { onCall } = require('firebase-functions/v2/https')
const { db, auth } = require('./lib/admin')
const { throwFn, assertSuperAdmin } = require('./lib/errors')

/** Genera una contraseña temporal segura (12 chars). */
function genTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let pass = ''
  for (let i = 0; i < 10; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)]
  }
  return pass + 'A1!'   // garantiza mayúscula + dígito + especial
}

exports.createAgencyAdmin = onCall(
  { region: 'europe-west1', memory: '128MiB' },
  async (request) => {
    assertSuperAdmin(request)

    const { agencyId, email, displayName = 'Administrador' } = request.data

    if (!agencyId || !email) {
      throwFn('invalid-argument', 'Se requieren agencyId y email.')
    }

    // ── 1. Verificar que la agencia existe ────────────────────────────────────
    const agencySnap = await db.collection('agencies').doc(agencyId).get()
    if (!agencySnap.exists) {
      throwFn('not-found', `Agencia "${agencyId}" no encontrada.`)
    }

    // ── 2. Crear o recuperar el usuario en Firebase Auth ──────────────────────
    let firebaseUser
    const tempPassword = genTempPassword()

    try {
      firebaseUser = await auth.getUserByEmail(email)
      // Ya existe: solo actualizamos la contraseña
      await auth.updateUser(firebaseUser.uid, { password: tempPassword })
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        firebaseUser = await auth.createUser({
          email,
          displayName,
          password: tempPassword,
          emailVerified: false,
        })
      } else {
        throwFn('internal', `Error de Auth: ${err.message}`)
      }
    }

    // ── 3. Asignar custom claims ───────────────────────────────────────────────
    await auth.setCustomUserClaims(firebaseUser.uid, {
      role: 'agency_admin',
      agencyId,
    })

    // ── 4. Crear / actualizar documento en /users ──────────────────────────────
    const userRef  = db.collection('users').doc(firebaseUser.uid)
    const existing = await userRef.get()

    if (existing.exists) {
      await userRef.update({ role: 'agency_admin', agencyId })
    } else {
      await userRef.set({
        uid:      firebaseUser.uid,
        email,
        role:     'agency_admin',
        agencyId,
        profile:  { display_name: displayName, avatar_url: null },
        created_at: require('firebase-admin/firestore').FieldValue.serverTimestamp(),
      })
    }

    // ── 5. Marcar admin_email_pending como resuelto en la agencia ─────────────
    await db.collection('agencies').doc(agencyId).update({
      admin_uid:           firebaseUser.uid,
      admin_email_pending: null,
    })

    return {
      uid:          firebaseUser.uid,
      email,
      tempPassword,
    }
  }
)
