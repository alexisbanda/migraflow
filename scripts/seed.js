/**
 * MigraFlow — Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Crea toda la estructura de datos dummy para testing.
 *
 * Prerrequisito: service account key en scripts/serviceAccountKey.json
 * (Firebase Console → Configuración del proyecto → Cuentas de servicio → Generar clave privada)
 *
 * Uso:
 *   cd scripts && npm install && node seed.js
 */

const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db      = admin.firestore()
const auth    = admin.auth()

// ─── IDs fijos para reproducibilidad ─────────────────────────────────────────
const AGENCY_ID       = 'agencia-demo-001'
const SUPERADMIN_UID  = 'dr5rVzxezRZEyc9lF0hjRJSTpPQ2'

// ─────────────────────────────────────────────────────────────────────────────
// 1. CUSTOM CLAIMS
// ─────────────────────────────────────────────────────────────────────────────

async function setCustomClaims(uid, claims) {
  await auth.setCustomUserClaims(uid, claims)
  console.log(`✓ Claims set [${uid}]:`, claims)
}

const DEMO_PASSWORD = 'MigraFlow2025!'

async function createAuthUser(email, displayName, claims) {
  let user
  try {
    user = await auth.getUserByEmail(email)
    // Actualizar contraseña por si cambió
    await auth.updateUser(user.uid, { password: DEMO_PASSWORD })
    console.log(`  ↩ Auth user already exists: ${email}`)
  } catch {
    user = await auth.createUser({
      email,
      displayName,
      password: DEMO_PASSWORD,
      emailVerified: true,
    })
    console.log(`✓ Auth user created: ${email} (${user.uid})`)
  }
  await auth.setCustomUserClaims(user.uid, claims)
  return user
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ESTRUCTURA DE DATOS
// ─────────────────────────────────────────────────────────────────────────────

const now = admin.firestore.Timestamp.now()
const daysAgo = (n) => admin.firestore.Timestamp.fromDate(
  new Date(Date.now() - n * 24 * 60 * 60 * 1000)
)

// ── Global Templates ──────────────────────────────────────────────────────────

const TEMPLATES = {
  nomada_digital: {
    id: 'tpl-nomada-digital',
    name: 'Visa Nómada Digital',
    case_type: 'nomada_digital',
    requirements_blueprint: [
      {
        id: 'req-tpl-01',
        name: 'Pasaporte vigente (copia completa)',
        merge_order: 1,
        ai_rules: { required_keywords: ['passport', 'pasaporte'], max_age_months: 120 },
      },
      {
        id: 'req-tpl-02',
        name: 'Contrato de trabajo remoto apostillado',
        merge_order: 2,
        ai_rules: { required_keywords: ['apostille', 'apostilla', 'remote', 'trabajo remoto'] },
      },
      {
        id: 'req-tpl-03',
        name: 'Seguro médico internacional',
        merge_order: 3,
        ai_rules: { required_keywords: ['seguro', 'insurance', 'cobertura'], max_age_months: 12 },
      },
      {
        id: 'req-tpl-04',
        name: 'Extracto bancario (últimos 3 meses)',
        merge_order: 4,
        ai_rules: { max_age_months: 3, required_keywords: ['saldo', 'balance', 'bank', 'banco'] },
      },
      {
        id: 'req-tpl-05',
        name: 'Modelo 790 Código 052 (tasa abonada)',
        merge_order: 5,
        ai_rules: { required_keywords: ['790', '052', 'tasa', 'ministerio'] },
      },
    ],
    created_at: now,
  },

  residencia_no_lucrativa: {
    id: 'tpl-no-lucrativa',
    name: 'Residencia No Lucrativa',
    case_type: 'residencia_no_lucrativa',
    requirements_blueprint: [
      {
        id: 'req-tpl-nl-01',
        name: 'Pasaporte vigente (copia completa)',
        merge_order: 1,
        ai_rules: { required_keywords: ['passport', 'pasaporte'], max_age_months: 120 },
      },
      {
        id: 'req-tpl-nl-02',
        name: 'Certificado de antecedentes penales apostillado',
        merge_order: 2,
        ai_rules: { required_keywords: ['apostille', 'penales', 'antecedentes'] },
      },
      {
        id: 'req-tpl-nl-03',
        name: 'Certificado médico oficial',
        merge_order: 3,
        ai_rules: { required_keywords: ['médico', 'salud', 'certificado'], max_age_months: 3 },
      },
      {
        id: 'req-tpl-nl-04',
        name: 'Justificante de medios económicos suficientes',
        merge_order: 4,
        ai_rules: { required_keywords: ['ingresos', 'patrimonio', 'saldo'], max_age_months: 3 },
      },
    ],
    created_at: now,
  },
}

// ── Agency ────────────────────────────────────────────────────────────────────

const AGENCY = {
  id: AGENCY_ID,
  name: 'Despacho Migración España S.L.',
  subscription_tier: 'pro',
  settings: {
    logo_url: null,
    primary_color: '#4b5320',
    notifications_email: 'admin@despacho-demo.es',
  },
  created_at: daysAgo(90),
}

// ── Users (Firestore mirrors) — se populan después de crear Auth users ────────

function buildUserDoc(uid, email, role, agencyId = null, name) {
  return {
    uid,
    email,
    role,
    agencyId,
    profile: { display_name: name, avatar_url: null },
    created_at: daysAgo(60),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLIENTES + EXPEDIENTES + REQUISITOS
// ─────────────────────────────────────────────────────────────────────────────

function buildClientDoc(agencyId, userId, data) {
  return { agencyId, userId, personal_data: data, created_at: daysAgo(30) }
}

function buildCaseDoc({ agencyId, clientId, lawyerId, type, status, daysOld = 20 }) {
  return {
    agencyId,
    clientId,
    assigned_lawyer_id: lawyerId,
    type,
    status,
    last_package: null,
    timeline: [
      { event: 'case_created', timestamp: daysAgo(daysOld) },
    ],
    created_at: daysAgo(daysOld),
  }
}

function buildReqDocs(reqs) {
  // reqs: array de { name, status, merge_order, ai_rules?, file_url?, storage_path?, ai_warnings? }
  return reqs.map((r) => ({
    name:         r.name,
    status:       r.status,
    merge_order:  r.merge_order,
    ai_rules:     r.ai_rules ?? {},
    file_url:     r.file_url ?? null,
    storage_path: r.storage_path ?? null,
    ai_warnings:  r.ai_warnings ?? [],
    ocr_processed_at: r.ocr_processed_at ?? null,
    updated_at:   now,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  MigraFlow Seed — iniciando...\n')
  const batch = db.batch()

  // ── 4.1 Superadmin claims (usuario ya existe en Auth) ─────────────────────
  console.log('── Autenticación ──────────────────────────────────────')
  await setCustomClaims(SUPERADMIN_UID, { role: 'superadmin', agencyId: null })

  // ── 4.2 Crear usuarios Auth para la demo ─────────────────────────────────
  const adminUser  = await createAuthUser('admin@despacho-demo.es',   'Laura Gómez',    { role: 'agency_admin', agencyId: AGENCY_ID })
  const lawyerUser = await createAuthUser('abogado@despacho-demo.es', 'Marcos Herrera',  { role: 'lawyer',       agencyId: AGENCY_ID })
  const client1User = await createAuthUser('ana.martinez@correo.com', 'Ana Martínez',    { role: 'client',       agencyId: null })
  const client2User = await createAuthUser('carlos.rg@correo.com',    'Carlos Rodríguez',{ role: 'client',       agencyId: null })
  const client3User = await createAuthUser('fatima.b@correo.com',     'Fátima Benali',   { role: 'client',       agencyId: null })

  // ── 4.3 Agency ────────────────────────────────────────────────────────────
  console.log('\n── Firestore ──────────────────────────────────────────')
  const agencyRef = db.collection('agencies').doc(AGENCY.id)
  batch.set(agencyRef, { name: AGENCY.name, subscription_tier: AGENCY.subscription_tier, settings: AGENCY.settings, created_at: AGENCY.created_at })
  console.log(`✓ agencies/${AGENCY.id}`)

  // ── 4.4 Users (mirrors) ───────────────────────────────────────────────────
  const usersToMirror = [
    { uid: SUPERADMIN_UID,    email: 'superadmin@migraflow.app', role: 'superadmin',  agencyId: null,      name: 'Super Admin' },
    { uid: adminUser.uid,     email: adminUser.email,            role: 'agency_admin', agencyId: AGENCY_ID, name: 'Laura Gómez' },
    { uid: lawyerUser.uid,    email: lawyerUser.email,           role: 'lawyer',       agencyId: AGENCY_ID, name: 'Marcos Herrera' },
    { uid: client1User.uid,   email: client1User.email,          role: 'client',       agencyId: null,      name: 'Ana Martínez' },
    { uid: client2User.uid,   email: client2User.email,          role: 'client',       agencyId: null,      name: 'Carlos Rodríguez' },
    { uid: client3User.uid,   email: client3User.email,          role: 'client',       agencyId: null,      name: 'Fátima Benali' },
  ]

  for (const u of usersToMirror) {
    const ref = db.collection('users').doc(u.uid)
    batch.set(ref, buildUserDoc(u.uid, u.email, u.role, u.agencyId, u.name))
    console.log(`✓ users/${u.uid} (${u.role})`)
  }

  // ── 4.5 Global Templates ──────────────────────────────────────────────────
  for (const tpl of Object.values(TEMPLATES)) {
    const ref = db.collection('global_templates').doc(tpl.id)
    batch.set(ref, tpl)
    console.log(`✓ global_templates/${tpl.id}`)
  }

  // ── 4.6 Clientes ──────────────────────────────────────────────────────────
  const clientRef1 = db.collection('clients').doc()
  const clientRef2 = db.collection('clients').doc()
  const clientRef3 = db.collection('clients').doc()

  batch.set(clientRef1, buildClientDoc(AGENCY_ID, client1User.uid, {
    first_name: 'Ana', last_name: 'Martínez López', email: 'ana.martinez@correo.com',
    phone: '+34 612 345 678', dob: '1990-05-14', nationality: 'VE',
    passport_number: 'C12345678', passport_expiry: '2028-05-14',
  }))

  batch.set(clientRef2, buildClientDoc(AGENCY_ID, client2User.uid, {
    first_name: 'Carlos', last_name: 'Rodríguez Pérez', email: 'carlos.rg@correo.com',
    phone: '+34 698 765 432', dob: '1985-11-22', nationality: 'CO',
    passport_number: 'BE789012', passport_expiry: '2027-11-22',
  }))

  batch.set(clientRef3, buildClientDoc(AGENCY_ID, client3User.uid, {
    first_name: 'Fátima', last_name: 'Benali', email: 'fatima.b@correo.com',
    phone: '+34 655 111 222', dob: '1978-03-08', nationality: 'MA',
    passport_number: 'MA456789', passport_expiry: '2026-03-08',
  }))

  console.log(`✓ clients/${clientRef1.id} (Ana)`)
  console.log(`✓ clients/${clientRef2.id} (Carlos)`)
  console.log(`✓ clients/${clientRef3.id} (Fátima)`)

  // ── 4.7 Expedientes ───────────────────────────────────────────────────────
  const caseRef1 = db.collection('cases').doc()
  const caseRef2 = db.collection('cases').doc()
  const caseRef3 = db.collection('cases').doc()

  // Caso 1: Ana — Nómada Digital — en progreso (mix de estados)
  batch.set(caseRef1, buildCaseDoc({
    agencyId: AGENCY_ID, clientId: clientRef1.id,
    lawyerId: lawyerUser.uid, type: 'nomada_digital', status: 'open', daysOld: 20,
  }))

  // Caso 2: Carlos — Cuenta Ajena — casi listo (mayoría validated)
  batch.set(caseRef2, buildCaseDoc({
    agencyId: AGENCY_ID, clientId: clientRef2.id,
    lawyerId: lawyerUser.uid, type: 'cuenta_ajena', status: 'in_review', daysOld: 45,
  }))

  // Caso 3: Fátima — Reagrupación Familiar — recién abierto (todo pending)
  batch.set(caseRef3, buildCaseDoc({
    agencyId: AGENCY_ID, clientId: clientRef3.id,
    lawyerId: null, type: 'reagrupacion_familiar', status: 'open', daysOld: 3,
  }))

  console.log(`✓ cases/${caseRef1.id} (Ana — nómada digital)`)
  console.log(`✓ cases/${caseRef2.id} (Carlos — cuenta ajena)`)
  console.log(`✓ cases/${caseRef3.id} (Fátima — reagrupación)`)

  // ── 4.8 Commit del batch principal ────────────────────────────────────────
  await batch.commit()
  console.log('\n✓ Batch principal committed\n')

  // ── 4.9 Requirements (escritura separada por límite de 500 ops/batch) ─────
  // Caso 1 — Ana (nómada digital): mezcla de estados para mostrar el flujo
  const batch2 = db.batch()

  const reqs1 = buildReqDocs([
    {
      name: 'Pasaporte vigente (copia completa)', merge_order: 1,
      status: 'validated', file_url: 'https://placeholder.pdf',
      storage_path: `${AGENCY_ID}/${clientRef1.id}/${caseRef1.id}/req-001/pasaporte.pdf`,
      ai_rules: { required_keywords: ['passport', 'pasaporte'] },
      ai_warnings: [],
    },
    {
      name: 'Contrato de trabajo remoto apostillado', merge_order: 2,
      status: 'reviewing', file_url: 'https://placeholder.pdf',
      storage_path: `${AGENCY_ID}/${clientRef1.id}/${caseRef1.id}/req-002/contrato.pdf`,
      ai_rules: { required_keywords: ['apostille', 'apostilla', 'remote'] },
      ai_warnings: ['Palabras clave requeridas no encontradas: "apostille".'],
      ocr_processed_at: daysAgo(1),
    },
    {
      name: 'Seguro médico internacional', merge_order: 3,
      status: 'rejected', file_url: 'https://placeholder.pdf',
      storage_path: `${AGENCY_ID}/${clientRef1.id}/${caseRef1.id}/req-003/seguro.pdf`,
      ai_rules: { required_keywords: ['seguro', 'insurance'], max_age_months: 12 },
      ai_warnings: ['Documento con fecha detectada (15/01/2024) fuera del límite de 12 meses.'],
      ocr_processed_at: daysAgo(2),
    },
    {
      name: 'Extracto bancario (últimos 3 meses)', merge_order: 4,
      status: 'pending',
      ai_rules: { max_age_months: 3, required_keywords: ['banco', 'saldo'] },
    },
    {
      name: 'Modelo 790 Código 052 (tasa abonada)', merge_order: 5,
      status: 'pending',
      ai_rules: { required_keywords: ['790', '052', 'tasa'] },
    },
  ])

  for (const req of reqs1) {
    batch2.set(caseRef1.collection('requirements').doc(), req)
  }

  // Caso 2 — Carlos (cuenta ajena): mayoría validados → listo para empaquetar
  const reqs2 = buildReqDocs([
    {
      name: 'Pasaporte vigente', merge_order: 1, status: 'validated',
      storage_path: `${AGENCY_ID}/${clientRef2.id}/${caseRef2.id}/req-001/pasaporte.pdf`,
      ai_rules: { required_keywords: ['passport'] }, ai_warnings: [],
    },
    {
      name: 'Oferta de trabajo firmada', merge_order: 2, status: 'validated',
      storage_path: `${AGENCY_ID}/${clientRef2.id}/${caseRef2.id}/req-002/oferta.pdf`,
      ai_rules: { required_keywords: ['contrato', 'trabajo', 'firma'] }, ai_warnings: [],
    },
    {
      name: 'Vida laboral apostillada', merge_order: 3, status: 'validated',
      storage_path: `${AGENCY_ID}/${clientRef2.id}/${caseRef2.id}/req-003/vida_laboral.pdf`,
      ai_rules: { required_keywords: ['apostille'] }, ai_warnings: [],
    },
    {
      name: 'Titulación académica apostillada', merge_order: 4, status: 'validated',
      storage_path: `${AGENCY_ID}/${clientRef2.id}/${caseRef2.id}/req-004/titulo.pdf`,
      ai_rules: { required_keywords: ['apostille', 'título', 'universidad'] }, ai_warnings: [],
    },
    {
      name: 'Modelo 790 Código 052', merge_order: 5, status: 'reviewing',
      storage_path: `${AGENCY_ID}/${clientRef2.id}/${caseRef2.id}/req-005/790.pdf`,
      ai_rules: { required_keywords: ['790', '052', 'tasa'] }, ai_warnings: [],
      ocr_processed_at: daysAgo(0),
    },
  ])

  for (const req of reqs2) {
    batch2.set(caseRef2.collection('requirements').doc(), req)
  }

  // Caso 3 — Fátima (reagrupación): todo pendiente, recién abierto
  const reqs3 = buildReqDocs([
    { name: 'Pasaporte vigente',                 merge_order: 1, status: 'pending', ai_rules: {} },
    { name: 'Libro de familia apostillado',      merge_order: 2, status: 'pending', ai_rules: { required_keywords: ['apostille', 'familia'] } },
    { name: 'Certificado de empadronamiento',    merge_order: 3, status: 'pending', ai_rules: { max_age_months: 3 } },
    { name: 'Contrato de alquiler o escritura',  merge_order: 4, status: 'pending', ai_rules: {} },
    { name: 'Medios económicos suficientes',     merge_order: 5, status: 'pending', ai_rules: { max_age_months: 3 } },
  ])

  for (const req of reqs3) {
    batch2.set(caseRef3.collection('requirements').doc(), req)
  }

  await batch2.commit()
  console.log('✓ Requirements committed\n')

  // ── 4.10 Resumen ──────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════')
  console.log('✅  Seed completado con éxito\n')
  console.log(`📋  Credenciales de acceso (contraseña: ${DEMO_PASSWORD}):`)
  console.log(`    Agency Admin : admin@despacho-demo.es`)
  console.log(`    Abogado      : abogado@despacho-demo.es`)
  console.log(`    Cliente 1    : ana.martinez@correo.com`)
  console.log(`    Cliente 2    : carlos.rg@correo.com`)
  console.log(`    Cliente 3    : fatima.b@correo.com`)
  console.log('\n🏢  Agencia:', AGENCY.name, `(ID: ${AGENCY_ID})`)
  console.log(`📁  Expedientes creados: 3`)
  console.log(`       [OPEN]      Ana Martínez     — Nómada Digital (case: ${caseRef1.id})`)
  console.log(`       [IN_REVIEW] Carlos Rodríguez — Cuenta Ajena   (case: ${caseRef2.id})`)
  console.log(`       [OPEN]      Fátima Benali     — Reagrupación  (case: ${caseRef3.id})`)
  console.log('═══════════════════════════════════════════════════════\n')

  process.exit(0)
}

seed().catch((err) => {
  console.error('\n❌  Error en el seed:', err)
  process.exit(1)
})
