/**
 * MigraFlow — Create Superadmin
 * ─────────────────────────────────────────────────────────────────────────────
 * Crea un usuario superadmin completamente nuevo en Firebase Auth,
 * le asigna los custom claims y crea su documento en /users.
 *
 * Uso:
 *   cd scripts && node create-superadmin.js
 *
 * Opcional — sobrescribir email/contraseña por argumentos:
 *   node create-superadmin.js admin@tudominio.com MiContraseña123!
 *
 * Prerrequisito: scripts/serviceAccountKey.json
 */

const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db   = admin.firestore()
const auth = admin.auth()

// ─── Configura email y contraseña ─────────────────────────────────────────────
const EMAIL    = process.argv[2] ?? 'superadmin@migraflow.app'
const PASSWORD = process.argv[3] ?? 'MigraFlowAdmin2025!'

async function createSuperadmin() {
  console.log('\n🚀  MigraFlow — Create Superadmin\n')
  console.log(`Email     : ${EMAIL}`)
  console.log(`Contraseña: ${PASSWORD}\n`)

  // ── 1. Crear o recuperar el usuario en Firebase Auth ──────────────────────
  let firebaseUser
  try {
    firebaseUser = await auth.getUserByEmail(EMAIL)
    console.log(`  ↩ Ya existe un usuario con ese email. Actualizando contraseña y claims...`)
    await auth.updateUser(firebaseUser.uid, { password: PASSWORD, emailVerified: true })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      firebaseUser = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: 'Super Admin',
        emailVerified: true,
      })
      console.log(`✓ Usuario creado en Firebase Auth`)
    } else {
      throw err
    }
  }

  console.log(`  UID: ${firebaseUser.uid}`)

  // ── 2. Asignar custom claims ───────────────────────────────────────────────
  const claims = { role: 'superadmin', agencyId: null }
  await auth.setCustomUserClaims(firebaseUser.uid, claims)
  console.log(`✓ Custom claims asignados: ${JSON.stringify(claims)}`)

  // ── 3. Crear / actualizar documento en /users ──────────────────────────────
  const userRef  = db.collection('users').doc(firebaseUser.uid)
  const snapshot = await userRef.get()

  const userDoc = {
    uid:      firebaseUser.uid,
    email:    EMAIL,
    role:     'superadmin',
    agencyId: null,
    profile:  { display_name: 'Super Admin', avatar_url: null },
    created_at: admin.firestore.Timestamp.now(),
  }

  if (snapshot.exists) {
    await userRef.update({ role: 'superadmin', agencyId: null })
    console.log(`✓ Documento /users/${firebaseUser.uid} actualizado`)
  } else {
    await userRef.set(userDoc)
    console.log(`✓ Documento /users/${firebaseUser.uid} creado`)
  }

  // ── 4. Verificar claims en Auth ────────────────────────────────────────────
  const updated = await auth.getUser(firebaseUser.uid)
  console.log(`✓ Claims verificados: ${JSON.stringify(updated.customClaims)}`)

  // ── 5. Resumen ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('✅  Superadmin listo\n')
  console.log(`  URL    : http://localhost:5173/login`)
  console.log(`  Email  : ${EMAIL}`)
  console.log(`  Pass   : ${PASSWORD}`)
  console.log(`  UID    : ${firebaseUser.uid}`)
  console.log('═══════════════════════════════════════════════════════\n')

  process.exit(0)
}

createSuperadmin().catch((err) => {
  console.error('\n❌  Error:', err.message)

  if (err.code === 'MODULE_NOT_FOUND') {
    console.error('\n  → serviceAccountKey.json no encontrado.')
    console.error('    Firebase Console → Configuración del proyecto')
    console.error('    → Cuentas de servicio → Generar clave privada')
    console.error('    → Guardar como scripts/serviceAccountKey.json\n')
  }

  process.exit(1)
})
