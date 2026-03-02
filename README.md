# MigraFlow

SaaS multi-tenant para agencias de extranjería en España. Digitaliza la gestión de expedientes migratorios con triaje de documentos por IA, empaquetado automático de expedientes y gobernanza colaborativa del equipo jurídico.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 · Vite · React Router v6 |
| Estilos | Tailwind CSS (paleta dark: slate-950, acento: `military-600` `#4b5320`) |
| Formularios | react-hook-form · zod · @hookform/resolvers |
| Auth | Firebase Authentication (Email/Password) |
| Base de datos | Cloud Firestore (multi-tenant por `agencyId`) |
| Almacenamiento | Firebase Storage |
| Backend | Firebase Cloud Functions (Node.js 20, region: `europe-west1`) |
| IA / OCR | Google Cloud Vision API |
| PDF | pdf-lib |
| Deploy frontend | Netlify |

---

## Estructura del proyecto

```
migraflow/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.jsx          # Layout para agency_admin / lawyer
│   │   │   ├── Sidebar.jsx           # Navegación de agencia
│   │   │   └── SuperAdminLayout.jsx  # Layout para superadmin (split dark)
│   │   ├── ui/                       # Primitivos compartidos
│   │   │   ├── Button.jsx            # 5 variants, 4 sizes, loading state
│   │   │   ├── Modal.jsx             # createPortal, footer slot, scroll-lock
│   │   │   └── Badge.jsx             # 6 variants de color
│   │   └── onboarding/
│   │       ├── ClientOnboarding.jsx  # Compound Component (wizard 3 pasos)
│   │       └── steps/               # PersonalDataStep, PassportStep, CaseTypeStep
│   ├── context/
│   │   └── AuthContext.jsx          # AuthProvider, useAuth, login, logout
│   ├── hooks/
│   │   ├── useGeneratePackage.js    # Hook para el Magic Button
│   │   └── useAgencies.js          # onSnapshot agencies + CRUD
│   ├── lib/
│   │   └── firebase.js             # Init Auth, Firestore, Storage, Functions
│   ├── pages/
│   │   ├── auth/                   # LoginPage, AuthCallbackPage
│   │   ├── clients/                # NewClientPage (wizard de alta)
│   │   ├── cases/                  # CasePage (Fase 6: tabs + equipo + notas internas)
│   │   ├── dashboard/              # DashboardPage (lista de expedientes)
│   │   ├── portal/
│   │   │   ├── ClientPortalPage.jsx       # Layout + PortalCtx provider
│   │   │   ├── PortalDashboardPage.jsx    # Resumen de expedientes
│   │   │   └── PortalCasePage.jsx         # Detalle: requisitos, timeline, paquete
│   │   └── superadmin/
│   │       ├── SuperAdminDashboardPage.jsx  # Stats en tiempo real del SaaS
│   │       ├── AgenciesPage.jsx             # CRUD de agencias (tenants)
│   │       ├── TemplateBuilderPage.jsx      # Constructor visual de flujos
│   │       └── SettingsPage.jsx             # Configuración global
│   └── routes/
│       └── index.jsx               # Router + guards por rol (4 roles)
├── functions/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── admin.js                    # Firebase Admin SDK (idempotente)
│   │   │   └── errors.js                   # throwFn, assertRole, assertSuperAdmin
│   │   ├── processDocumentOCR.js           # Trigger Storage: triaje IA
│   │   ├── generateMigratoryPackage.js     # onCall: Magic Button (PDF) + audit log
│   │   └── createAgencyAdmin.js            # onCall: crea usuario agency_admin
│   └── index.js
├── scripts/
│   ├── seed.js                 # Carga toda la estructura demo
│   ├── fix-superadmin.js       # Asigna claims a superadmin existente
│   └── create-superadmin.js    # Crea superadmin nuevo desde cero
├── firestore.rules             # RBAC completo: internal_notes, audit_logs, assignee_uids
├── storage.rules               # Protección por path + límite 15 MB
├── firestore.indexes.json
└── firebase.json
```

---

## Esquema de base de datos (Firestore)

```
/agencies/{agencyId}
  name, subscription_tier, active, settings { primary_color, notifications_email, logo_url }
  default_template_id, admin_uid, admin_email_pending, created_at

/agencies/{agencyId}/audit_logs/{logId}         ← Fase 6
  user_uid, action, target_type, target_id, metadata {}, timestamp
  — Escritura solo vía Admin SDK (Cloud Functions). Lectura: agency_admin.

/users/{uid}
  uid, email, role, agencyId, profile { display_name, avatar_url }, created_at

/clients/{clientId}
  agencyId, userId, personal_data { first_name, last_name, email,
  phone, dob, nationality, passport_number, passport_expiry }

/cases/{caseId}
  agencyId, clientId, type, status,
  assignees[]  { uid, internal_role, name }      ← Fase 6 (reemplaza assigned_lawyer_id)
  assignee_uids[]                                 ← campo plano para reglas y queries
  assigned_lawyer_id                              ← legacy (backward compat)
  last_package { file_url, file_size_mb, generated_at }, timeline[]

/cases/{caseId}/requirements/{reqId}
  name, status, merge_order, type, client_instructions, is_mandatory,
  ai_rules { max_age_months, required_keywords[], requires_apostille,
             requires_sworn_translation }, file_url, storage_path,
  ai_warnings[], ocr_processed_at

/cases/{caseId}/internal_notes/{noteId}          ← Fase 6
  author_uid, author_name, content, created_at, attachments[]
  — El rol 'client' NUNCA puede leer esta subcolección. Notas inmutables.

/global_templates/{templateId}
  name, case_type, estimated_resolution_days,
  requirements_blueprint[] { id, name, type, client_instructions,
    is_mandatory, merge_order, ai_rules { ... } },
  created_at, updated_at

/settings/global
  default_plan, allow_new_agencies, ocr_max_file_size_mb,
  platform_status, maintenance_message, updated_at
```

---

## Roles y permisos (RBAC via Custom Claims)

| Rol | Acceso |
|-----|--------|
| `superadmin` | Panel completo del SaaS. **Sin acceso a datos de clientes** (RGPD) |
| `agency_admin` | Lee/escribe todo dentro de su `agencyId`. Gestiona el equipo de cada expediente |
| `lawyer` | Solo expedientes donde aparece en `assignee_uids` o `assigned_lawyer_id` |
| `client` | Solo su portal. Sube archivos solo en requisitos `pending`/`rejected`. **Sin acceso a `internal_notes` ni `audit_logs`** |

---

## Rutas

| Ruta | Rol | Descripción |
|------|-----|-------------|
| `/login` | Público | Login con email y contraseña |
| `/dashboard` | agency_admin, lawyer | Lista de expedientes con filtros y stats |
| `/cases/:caseId` | agency_admin, lawyer | Expediente: tabs (Checklist / Notas internas), equipo asignado, Magic Button |
| `/clients/new` | agency_admin, lawyer | Wizard de alta de cliente (3 pasos) |
| `/portal` | client | Dashboard: tarjetas de expediente con progreso y acciones urgentes |
| `/portal/caso/:caseId` | client | Detalle: requisitos, línea de tiempo, descarga de paquete |
| `/superadmin` | superadmin | Dashboard: stats del SaaS en tiempo real |
| `/superadmin/agencies` | superadmin | CRUD de agencias + creación de admins |
| `/superadmin/templates` | superadmin | Constructor visual de flujos migratorios |
| `/superadmin/settings` | superadmin | Configuración global de la plataforma |

---

## Cloud Functions

### `processDocumentOCR`
- **Trigger:** `onObjectFinalized` (Storage)
- **Ruta esperada:** `/{agencyId}/{clientId}/{caseId}/{reqId}/{filename}`
- **Proceso:** Descarga el archivo → Google Cloud Vision OCR → aplica `ai_rules` → actualiza Firestore
- **Output en Firestore:** `status: "reviewing"`, `ai_warnings[]`, `ocr_text_excerpt`

| Campo `ai_rules` | Tipo | Descripción |
|-------|------|-------------|
| `max_age_months` | number | Antigüedad máxima del documento |
| `required_keywords` | string[] | Palabras que DEBEN aparecer |
| `forbidden_keywords` | string[] | Palabras que NO deben aparecer |
| `requires_apostille` | boolean | Flag semántico (futuro uso en OCR) |
| `requires_sworn_translation` | boolean | Flag semántico (futuro uso en OCR) |

### `generateMigratoryPackage` (Magic Button)
- **Trigger:** `onCall` — roles: `agency_admin`, `lawyer`
- **Payload:** `{ caseId, agencyId }`
- **Proceso:** Verifica permisos → descarga PDFs validados → une con pdf-lib → portada dark → sube a Storage → URL firmada 7 días
- **Check de asignación (Fase 6):** comprueba `assignee_uids` (nuevo) y `assigned_lawyer_id` (legacy) para compatibilidad
- **Audit log (Fase 6):** escribe en `/agencies/{agencyId}/audit_logs` con `action: 'GENERATE_PACKAGE'` al finalizar con éxito
- **Output:** `{ status, file_url, file_size_mb, total_docs }`
- **Límite:** 15 MB · Cada `requirement` debe tener `storage_path` (ruta sin `gs://bucket/`)

### `createAgencyAdmin`
- **Trigger:** `onCall` — rol: `superadmin`
- **Payload:** `{ agencyId, email, displayName }`
- **Proceso:** Verifica que la agencia existe → crea usuario en Firebase Auth → asigna claims `{ role: 'agency_admin', agencyId }` → crea `/users/{uid}` → actualiza `admin_uid` en la agencia
- **Output:** `{ uid, email, tempPassword }`

---

## Panel de Agencia (CasePage — Fase 6)

La `CasePage` (`/cases/:caseId`) es la vista central del despacho para gestionar un expediente. Tras la Fase 6 adopta un layout de dos columnas:

### Columna principal — Tabs
| Tab | Visible para | Contenido |
|-----|-------------|-----------|
| **Checklist** | agency_admin, lawyer, client | Lista de requisitos con accordion, upload drag-and-drop, avisos IA y Magic Button |
| **Notas internas** | agency_admin, lawyer | Chat de hilo en tiempo real (`onSnapshot`). Inmutables. El rol `client` no ve este tab |

### Sidebar
- **Widget "Equipo":** lista de `assignees` con rol (`Abogado principal / Paralegal / Socio`). `agency_admin` puede añadir y quitar miembros. Al guardar escribe tanto `assignees[]` (objetos con `uid`, `internal_role`, `name`) como `assignee_uids[]` (array plano para las Security Rules)
- **Historial:** timeline de eventos del expediente en tiempo real

---

## Panel Superadmin

### Dashboard (`/superadmin`)
Stats en tiempo real vía `onSnapshot`: total de agencias, activas, plan Pro, plantillas globales. Lista de agencias recientes con barras de distribución de planes.

### Gestión de Agencias (`/superadmin/agencies`)
- Tabla con búsqueda en tiempo real
- **Cambiar plan:** clic directo en el badge Plan (Pro ↔ Básico)
- **Activar/desactivar:** clic directo en el badge Estado
- **Crear agencia:** modal con nombre, color de marca (picker + hex), email del admin y plantilla por defecto
  - Si se introduce email → llama `createAgencyAdmin` → muestra contraseña temporal con botón de copia
  - Si se selecciona plantilla → guarda `default_template_id` en el documento de la agencia
- Modal de detalle con toda la información de la agencia (incluye plantilla asignada)

### Constructor de Plantillas (`/superadmin/templates`)
Interfaz de pantalla dividida (split screen):
- **Izquierda:** lista de plantillas con acciones de creación/eliminación
- **Derecha:** editor visual con:
  - Campos base: nombre, `case_type` (con sugerencias vía `<datalist>`), días de resolución estimados
  - **Array de requisitos dinámico** (`useFieldArray`): añadir, eliminar, reordenar (↑↓)
  - Cada requisito (accordion): nombre, tipo (`client_upload`/`auto_generated`), instrucciones al cliente, toggle obligatorio
  - **Reglas de IA por requisito:** `max_age_months`, `required_keywords` (comma-sep), `requires_apostille`, `requires_sworn_translation`
- Guarda con `setDoc` en Firestore; aviso de cambios sin guardar al cambiar de plantilla

### Ajustes del SaaS (`/superadmin/settings`)
Lee/escribe `/settings/global` en Firestore: estado de la plataforma, plan por defecto, límite OCR, toggle de nuevas agencias.

---

## Portal Cliente

El portal del cliente es una vista independiente (sin sidebar de agencia) accesible solo con el rol `client`.

### Dashboard (`/portal`)
- Tarjeta por expediente con barra de progreso, estado y chips de resumen
- Banner de acciones urgentes si hay documentos rechazados en cualquier expediente
- Botón de descarga del paquete migratorio si ya fue generado por el despacho

### Detalle de expediente (`/portal/caso/:caseId`)
- **Grid de progreso**: contadores de validados / en revisión / rechazados / pendientes y porcentaje total
- **Indicador de obligatorios**: muestra cuántos requisitos marcados como `is_mandatory` están pendientes de validación
- **Lista de requisitos**: acordeón expandible con instrucciones del despacho (`client_instructions`), avisos del análisis automático (IA) y zona de subida drag-and-drop
- **Línea de tiempo**: historial de eventos (`cases.timeline`) con fecha y tiempo transcurrido
- **Paquete de documentación**: descarga del PDF generado si está disponible
- **Contacto**: sección informativa para contactar con el abogado asignado

### Contexto compartido (`usePortal`)
`ClientPortalPage` actúa como layout y proveedor de datos: carga el documento del cliente y sus expedientes en tiempo real. Las subrutas acceden a los datos mediante el hook `usePortal()`.

### Seguridad (Firestore)
Las reglas corrigen el bug donde `cases.clientId` (ID de doc Firestore) se comparaba incorrectamente con `request.auth.uid`. Ahora se usa un `get()` cross-documento:
```
// cases
get(/databases/.../clients/{clientId}).data.userId == request.auth.uid

// requirements (get anidado)
get(/databases/.../clients/{get(.../cases/{caseId}).data.clientId}).data.userId == request.auth.uid
```

---

## Configuración inicial

### 1. Variables de entorno

Crea `.env.local` en la raíz:

```env
FIREBASE_ENV_VARIABLES
```

### 2. Firebase Console (una sola vez)

- Authentication → Sign-in method → habilitar **Email/Password**
- Firestore Database → crear en modo producción
- Storage → activar
- GCP Console → habilitar **Cloud Vision API**
- Plan **Blaze** obligatorio para Cloud Functions

### 3. Instalar dependencias

```bash
npm install                       # Frontend (incluye react-hook-form, zod)
cd functions && npm install       # Cloud Functions
cd scripts && npm install         # Scripts de utilidad
```

### 4. Desplegar reglas y funciones

```bash
firebase deploy --only firestore:rules,storage
firebase deploy --only firestore:indexes
firebase deploy --only functions
```

### 5. Crear el superadmin

Descarga la **Service Account Key** (Firebase Console → Configuración → Cuentas de servicio → Generar clave privada) y guárdala como `scripts/serviceAccountKey.json`.

```bash
# Crea un superadmin nuevo con credenciales por defecto:
cd scripts && node create-superadmin.js

# O con credenciales propias:
node create-superadmin.js tu@email.com TuContraseña123!

# Si el usuario ya existe en Auth pero le faltan los claims:
node fix-superadmin.js
```

Credenciales por defecto: `superadmin@migraflow.app` / `MigraFlowAdmin2025!`

### 6. Seed de datos de prueba (opcional)

```bash
cd scripts && node seed.js
```

---

## Desarrollo local

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Emuladores Firebase (opcional)
firebase emulators:start --only auth,firestore,storage,functions
```

---

## Deploy a producción

```bash
# 1. Reglas + índices
firebase deploy --only firestore:rules,storage,firestore:indexes

# 2. Cloud Functions
firebase deploy --only functions

# 3. Frontend
npm run build
# Conectar carpeta dist/ a Netlify o CI/CD vía GitHub
```

Variables de entorno en Netlify: **Site settings → Environment variables** → mismas `VITE_FIREBASE_*`.

---

## Usuarios de prueba (tras ejecutar seed)

| Rol | Email | Contraseña |
|-----|-------|-----------|
| **Super Admin** | `superadmin@migraflow.app` | `MigraFlowAdmin2025!` |
| Agency Admin | `admin@despacho-demo.es` | `MigraFlow2025!` |
| Abogado | `abogado@despacho-demo.es` | `MigraFlow2025!` |
| Cliente 1 | `ana.martinez@correo.com` | `MigraFlow2025!` |
| Cliente 2 | `carlos.rg@correo.com` | `MigraFlow2025!` |
| Cliente 3 | `fatima.b@correo.com` | `MigraFlow2025!` |

---

## Roadmap

### ✅ Fase 1 — Core backend y estructura base
- [x] Autenticación Email/Password con custom claims (role, agencyId)
- [x] Guards de ruta por rol (`RequireAuth`)
- [x] Wizard de alta de cliente (ClientOnboarding — Compound Component)
- [x] Cloud Function: triaje de documentos con OCR (Vision API)
- [x] Cloud Function: empaquetado PDF (Magic Button)
- [x] Reglas Firestore RBAC completas
- [x] Reglas Storage por path + límite de tamaño
- [x] Seed de datos de prueba

### ✅ Fase 2 — Panel Superadmin
- [x] Layout SuperAdmin (sidebar slate-950, contenido slate-50)
- [x] Librería de componentes UI (`Button`, `Modal`, `Badge`)
- [x] Dashboard con stats en tiempo real (Firestore `onSnapshot`)
- [x] Gestión de Agencias: CRUD, toggle plan/estado, credenciales de admin
- [x] Cloud Function `createAgencyAdmin` (crea usuario Auth + claims + doc Firestore)
- [x] Constructor de Plantillas: split screen, `useFieldArray`, acordeones, reglas de IA
- [x] Ajustes del SaaS: estado de plataforma, plan por defecto, límite OCR
- [x] Scripts `create-superadmin.js` y `fix-superadmin.js`

### ✅ Fase 3 — Panel de Agencia
- [x] DashboardPage: lista de expedientes con filtros, KPIs, skeletons y exportación a CSV
- [x] CasePage: checklist de requisitos, upload, Magic Button e historial de cambios (timeline)
- [x] Validación de steps en wizard de alta (antes de avanzar)
- [x] Asignación de abogado desde la CasePage
- [x] SkeletonLoaders para listas de clientes/expedientes

### ✅ Fase 4 — Experiencia avanzada
- [x] Historial de cambios (`CasePage`): timeline en tiempo real
- [x] Exportación a CSV (`DashboardPage`): BOM UTF-8, compatible con Excel
- [x] Plantilla por defecto al crear agencia

### ✅ Fase 5 — Portal Cliente
- [x] Dashboard (`/portal`): tarjetas con progreso, estado y descarga de paquete
- [x] Banner de acciones urgentes: expedientes con documentos rechazados
- [x] Detalle de expediente: grid de contadores, subida drag-and-drop, instrucciones, avisos IA
- [x] Línea de tiempo: `cases.timeline[]` con tiempo transcurrido
- [x] Descarga del paquete migratorio generado
- [x] Fix crítico en Firestore rules: `clientId` vs `userId` (cross-doc `get()`)

### ✅ Fase 6 — Gobernanza, Colaboración y Auditoría
- [x] **Modelo colaborativo:** `assignees[]` por expediente con roles (`lead_lawyer`, `paralegal`, `partner`). Campo `assignee_uids[]` para reglas y queries. Backward compat con `assigned_lawyer_id`
- [x] **Notas internas** (`/cases/{caseId}/internal_notes`): chat de hilo en tiempo real, solo visible para el equipo del despacho. Notas inmutables (sin edición ni borrado). El rol `client` bloqueado a nivel de Security Rules
- [x] **Audit logs** (`/agencies/{agencyId}/audit_logs`): registro inmutable de acciones. `generateMigratoryPackage` escribe una entrada al generar cada paquete. Lectura exclusiva para `agency_admin`
- [x] **CasePage rediseñada:** layout 2 columnas (main + sidebar `w-72`). Tab "Checklist" + tab "Notas internas". Widget "Equipo" en sidebar con add/remove de miembros
- [x] **Firestore rules actualizadas:** `assignedToCase()` comprueba `assignee_uids` + `assigned_lawyer_id`; nuevas reglas para `internal_notes` y `audit_logs`

### 🔲 Fase 7 — Control Financiero y Bloqueo de Hitos
- [ ] Subcolección `/cases/{caseId}/billing`: `total_amount`, `paid_amount`, `currency`, `payment_status`, `next_due_date`
- [ ] Subcolección `/cases/{caseId}/billing_milestones`: hitos de pago con descripción, importe y fecha
- [ ] Cloud Function `generateMigratoryPackage`: validación de pago (`block_generation_on_debt`)
- [ ] CasePage: tab "Facturación" con registro manual de pagos y progreso financiero
- [ ] Magic Button deshabilitado con candado si hay deuda pendiente
- [ ] DashboardPage: widget de expedientes con pagos vencidos

### 🔲 Fase 8 — Inteligencia de Negocio (Analytics)
- [ ] Colección `/agencies/{agencyId}/analytics/current_stats` con documento de métricas agregadas
- [ ] Cloud Function programada (`onSchedule`, 2 AM) que recalcula: distribución por tipo, tiempo medio de resolución, cuellos de botella por requisito, productividad por abogado
- [ ] Ruta `/dashboard/analytics` visible solo para `agency_admin`
- [ ] Gráfico de pastel: distribución de expedientes por tipo
- [ ] Gráfico de barras: tiempo promedio de validación por documento
- [ ] Tabla de rendimiento del equipo: abogados vs. expedientes cerrados vs. tasa de rechazos IA
