# MigraFlow

SaaS multi-tenant para agencias de extranjería en España. Digitaliza la gestión de expedientes migratorios con triaje de documentos por IA y empaquetado automático de expedientes.

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
│   │   ├── cases/                  # CasePage (expediente + checklist + Magic Button)
│   │   ├── dashboard/              # DashboardPage (lista de expedientes)
│   │   ├── portal/                 # ClientPortalPage (vista del cliente)
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
│   │   ├── generateMigratoryPackage.js     # onCall: Magic Button (PDF)
│   │   └── createAgencyAdmin.js            # onCall: crea usuario agency_admin
│   └── index.js
├── scripts/
│   ├── seed.js                 # Carga toda la estructura demo
│   ├── fix-superadmin.js       # Asigna claims a superadmin existente
│   └── create-superadmin.js    # Crea superadmin nuevo desde cero
├── firestore.rules             # RBAC completo por rol + /settings
├── storage.rules               # Protección por path + límite 15 MB
├── firestore.indexes.json
└── firebase.json
```

---

## Esquema de base de datos (Firestore)

```
/agencies/{agencyId}
  name, subscription_tier, active, settings { primary_color, notifications_email, logo_url }
  admin_uid, admin_email_pending, created_at

/users/{uid}
  uid, email, role, agencyId, profile { display_name, avatar_url }, created_at

/clients/{clientId}
  agencyId, userId, personal_data { first_name, last_name, email,
  phone, dob, nationality, passport_number, passport_expiry }

/cases/{caseId}
  agencyId, clientId, assigned_lawyer_id, type, status,
  last_package { file_url, file_size_mb, generated_at }, timeline[]

/cases/{caseId}/requirements/{reqId}
  name, status, merge_order, type, client_instructions, is_mandatory,
  ai_rules { max_age_months, required_keywords[], requires_apostille,
             requires_sworn_translation }, file_url, storage_path,
  ai_warnings[], ocr_processed_at

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
| `agency_admin` | Lee/escribe todo dentro de su `agencyId` |
| `lawyer` | Solo expedientes asignados a él dentro de su agencia |
| `client` | Solo su portal. Sube archivos solo en requisitos `pending`/`rejected` |

---

## Rutas

| Ruta | Rol | Descripción |
|------|-----|-------------|
| `/login` | Público | Login con email y contraseña |
| `/dashboard` | agency_admin, lawyer | Lista de expedientes con filtros y stats |
| `/cases/:caseId` | agency_admin, lawyer | Expediente: checklist, upload, Magic Button |
| `/clients/new` | agency_admin, lawyer | Wizard de alta de cliente (3 pasos) |
| `/portal` | client | Portal del cliente: ver y subir documentos |
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
- **Output:** `{ status, file_url, file_size_mb, total_docs }`
- **Límite:** 15 MB · Cada `requirement` debe tener `storage_path` (ruta sin `gs://bucket/`)

### `createAgencyAdmin`
- **Trigger:** `onCall` — rol: `superadmin`
- **Payload:** `{ agencyId, email, displayName }`
- **Proceso:** Verifica que la agencia existe → crea usuario en Firebase Auth → asigna claims `{ role: 'agency_admin', agencyId }` → crea `/users/{uid}` → actualiza `admin_uid` en la agencia
- **Output:** `{ uid, email, tempPassword }`

---

## Panel Superadmin

### Dashboard (`/superadmin`)
Stats en tiempo real vía `onSnapshot`: total de agencias, activas, plan Pro, plantillas globales. Lista de agencias recientes con barras de distribución de planes.

### Gestión de Agencias (`/superadmin/agencies`)
- Tabla con búsqueda en tiempo real
- **Cambiar plan:** clic directo en el badge Plan (Pro ↔ Básico)
- **Activar/desactivar:** clic directo en el badge Estado
- **Crear agencia:** modal con nombre, color de marca (picker + hex) y email del admin
  - Si se introduce email → llama `createAgencyAdmin` → muestra contraseña temporal con botón de copia
- Modal de detalle con toda la información de la agencia

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

## Configuración inicial

### 1. Variables de entorno

Crea `.env.local` en la raíz:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
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

### 🔲 Fase 3 — Panel de Agencia (en progreso)
- [x] DashboardPage: lista de expedientes con filtros, KPIs y skeletons (implementado)
- [x] CasePage: checklist de requisitos, upload y Magic Button (existente y verificado)
- [x] Validación de steps en wizard de alta (antes de avanzar) — `ClientOnboarding` ahora valida por paso y en submit
- [x] Asignación de abogado desde la CasePage (implementado)
- [x] SkeletonLoaders para listas de clientes/expedientes (implementados en Dashboard y CasePage)

### 🔲 Fase 4 — Notificaciones y experiencia avanzada (pendiente)
- [ ] Migrar autenticación a Magic Link (cuando haya dominio propio)
- [ ] Notificaciones por email al cliente cuando un documento es rechazado/validado
- [ ] Historial de cambios (timeline del expediente)
- [ ] Exportación de listado de expedientes a CSV
- [ ] Panel de superadmin: asignar plantilla a agencia al crearla

### 🔲 Fase 5 — Panel Cliente (pendiente)
- [ ] Dashboard cliente: vista dedicada donde el cliente pueda ver el estado general de su expediente, documentación pendiente y lo que falta.
- [ ] Timeline y tiempos: hitos claros con fechas estimadas y tiempo transcurrido/estimado hasta resolución.
- [ ] Pendientes y progreso: indicadores por requisito (porcentaje completado, requisitos obligatorios pendientes, orden de prioridad).
- [ ] Descargas y accesos: acceso a paquetes generados, historial de PDFs y enlaces firmados temporales.
- [ ] Comunicación y notificaciones dentro del panel: avisos de rechazos/validaciones y opción de contacto con el despacho.
- [ ] Seguridad y permisos: asegurar que el rol `client` sólo vea su `clientId` y archivos permitidos por las reglas de Firestore/Storage.
- [ ] Movilidad y accesibilidad: vista móvil optimizada y pruebas básicas de accesibilidad (a11y).
