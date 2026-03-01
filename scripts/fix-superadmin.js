/**
 * MigraFlow — Fix Superadmin
 * ─────────────────────────────────────────────────────────────────────────────
 * Asigna los custom claims de superadmin y crea (o repara) el documento
 * /users/{uid} en Firestore para el usuario superadmin existente.
 *
 * Úsalo cuando:
 *   - El usuario existe en Firebase Auth pero no tiene rol asignado.
 *   - El documento /users/{uid} no existe en Firestore.
 *   - El seed completo no se puede (o no se quiere) ejecutar.
 *
 * Prerrequisito: scripts/serviceAccountKey.json
 *
 * Uso:
 *   cd scripts && node fix-superadmin.js
 */

const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db   = admin.firestore()
const auth = admin.auth()

// ─── Configura el UID del superadmin ──────────────────────────────────────────
// (es el UID que aparece en Firebase Console → Authentication)
const SUPERADMIN_UID = 'dr5rVzxezRZEyc9lF0hjRJSTpPQ2'

async function fixSuperadmin() {
  console.log('\n🔧  MigraFlow — Fix Superadmin\n')
  console.log(`UID objetivo: ${SUPERADMIN_UID}\n`)

  // ── 1. Verificar que el usuario existe en Firebase Auth ────────────────────
  let firebaseUser
  try {
    firebaseUser = await auth.getUser(SUPERADMIN_UID)
    console.log(`✓ Usuario encontrado en Firebase Auth`)
    console.log(`  email       : ${firebaseUser.email}`)
    console.log(`  displayName : ${firebaseUser.displayName ?? '(sin nombre)'}`)
    console.log(`  claims prev : ${JSON.stringify(firebaseUser.customClaims ?? {})}`)
  } catch (err) {
    console.error(`\n❌  No se encontró ningún usuario con UID "${SUPERADMIN_UID}" en Firebase Auth.`)
    console.error('    Verifica el UID en Firebase Console → Authentication.')
    process.exit(1)
  }

  // ── 2. Asignar custom claims ───────────────────────────────────────────────
  const newClaims = { role: 'superadmin', agencyId: null }
  await auth.setCustomUserClaims(SUPERADMIN_UID, newClaims)
  console.log(`\n✓ Custom claims asignados: ${JSON.stringify(newClaims)}`)
  console.log('  (El token se actualizará en el próximo login o al refrescar la sesión)')

  // ── 3. Crear / actualizar documento en /users/{uid} ────────────────────────
  const userRef = db.collection('users').doc(SUPERADMIN_UID)
  const existingSnap = await userRef.get()

  if (existingSnap.exists) {
    console.log('\n  ↩ /users/{uid} ya existe — actualizando role y agencyId...')
    await userRef.update({ role: 'superadmin', agencyId: null })
    console.log('✓ Documento actualizado')
  } else {
    const userDoc = {
      uid:      SUPERADMIN_UID,
      email:    firebaseUser.email,
      role:     'superadmin',
      agencyId: null,
      profile: {
        display_name: firebaseUser.displayName ?? 'Super Admin',
        avatar_url:   null,
      },
      created_at: admin.firestore.Timestamp.now(),
    }
    await userRef.set(userDoc)
    console.log(`\n✓ Documento /users/${SUPERADMIN_UID} creado en Firestore`)
    console.log(`  email: ${userDoc.email}`)
  }

  // ── 4. Verificación final ──────────────────────────────────────────────────
  const updatedUser = await auth.getUser(SUPERADMIN_UID)
  console.log(`\n✓ Claims confirmados: ${JSON.stringify(updatedUser.customClaims)}`)

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('✅  Superadmin reparado con éxito\n')
  console.log(`    Email  : ${firebaseUser.email}`)
  console.log(`    UID    : ${SUPERADMIN_UID}`)
  console.log(`    Role   : superadmin`)
  console.log('\n    ⚠  Si el usuario tiene sesión activa, debe cerrar sesión')
  console.log('       y volver a entrar para que los nuevos claims surtan efecto.')
  console.log('═══════════════════════════════════════════════════════\n')

  process.exit(0)
}

fixSuperadmin().catch((err) => {
  console.error('\n❌  Error:', err.message)
  process.exit(1)
})
