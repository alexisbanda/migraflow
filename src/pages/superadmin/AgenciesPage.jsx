import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { httpsCallable } from 'firebase/functions'
import { getDocs, collection } from 'firebase/firestore'
import { functions, db } from '@/lib/firebase'
import { useAgencies } from '@/hooks/useAgencies'
import Button from '@/components/ui/Button'
import Modal  from '@/components/ui/Modal'
import Badge  from '@/components/ui/Badge'

// ─── Validation schema ────────────────────────────────────────────────────────

const agencySchema = z.object({
  name: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres'),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Introduce un color hex válido (ej. #4b5320)'),
  adminEmail: z
    .string()
    .email('Introduce un email válido')
    .or(z.literal(''))
    .optional(),
  templateId: z.string().optional(),
})

// ─── Local helpers ────────────────────────────────────────────────────────────

function FormField({ label, hint, error, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-slate-400 font-normal text-xs ml-1">— {hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

const inputCls = (hasError) =>
  `w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-800
   placeholder-slate-400 transition-all outline-none
   focus:ring-2 focus:ring-military-500/30 focus:border-military-600
   ${hasError ? 'border-red-400 bg-red-50/30' : 'border-slate-300'}`

function formatDate(timestamp) {
  if (!timestamp) return '—'
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AgenciesPage() {
  const { agencies, loading, error, createAgency, toggleActive, changePlan } = useAgencies()

  const [isCreateOpen,    setIsCreateOpen]    = useState(false)
  const [credentialsData, setCredentialsData] = useState(null)  // { email, tempPassword }
  const [detailAgency,    setDetailAgency]    = useState(null)  // agency object
  const [search,          setSearch]          = useState('')
  const [actionLoading,   setActionLoading]   = useState(null)  // agencyId being toggled/plan-changed
  const [templates,       setTemplates]       = useState([])

  useEffect(() => {
    getDocs(collection(db, 'global_templates')).then((snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }).catch(() => {})
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(agencySchema),
    defaultValues: { name: '', brandColor: '#4b5320', adminEmail: '', templateId: '' },
  })

  const brandColorValue = watch('brandColor')
  const isValidHex      = /^#[0-9A-Fa-f]{6}$/.test(brandColorValue)

  // ── Create agency ──────────────────────────────────────────────────────────

  const onSubmit = async (data) => {
    const agencyId = await createAgency({
      name:              data.name,
      brandColor:        data.brandColor,
      adminEmail:        data.adminEmail || '',
      defaultTemplateId: data.templateId || null,
    })

    // Si se proporcionó email, crear el usuario admin via Cloud Function
    if (data.adminEmail) {
      try {
        const fn     = httpsCallable(functions, 'createAgencyAdmin')
        const result = await fn({ agencyId, email: data.adminEmail, displayName: 'Administrador' })
        setCredentialsData({
          email:       result.data.email,
          tempPassword: result.data.tempPassword,
        })
      } catch (fnErr) {
        // La agencia se creó; el admin falla pero no es bloqueante
        console.error('createAgencyAdmin error:', fnErr)
        setCredentialsData({
          email:        data.adminEmail,
          tempPassword: null,
          error:        fnErr.message,
        })
      }
    }

    reset()
    setIsCreateOpen(false)
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  const handleToggleActive = async (agency) => {
    setActionLoading(agency.id + '_active')
    try {
      await toggleActive(agency)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Change plan ────────────────────────────────────────────────────────────

  const handleChangePlan = async (agencyId, newPlan) => {
    setActionLoading(agencyId + '_plan')
    try {
      await changePlan(agencyId, newPlan)
    } finally {
      setActionLoading(null)
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = agencies.filter(
    (a) =>
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.id?.toLowerCase().includes(search.toLowerCase()) ||
      a.settings?.notifications_email?.toLowerCase().includes(search.toLowerCase())
  )

  const stats = {
    total:  agencies.length,
    active: agencies.filter((a) => a.active !== false).length,
    pro:    agencies.filter((a) => a.subscription_tier === 'pro').length,
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 p-8 max-w-[1200px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestión de despachos de abogados (tenants del SaaS)
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Agencia
        </Button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-6 flex gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
          </svg>
          <span>Error al cargar agencias: {error}. Verifica que las reglas de Firestore estén desplegadas.</span>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        {[
          { label: 'Total agencias', value: stats.total },
          { label: 'Activas',        value: stats.active },
          { label: 'Plan Pro',       value: stats.pro, accent: true },
        ].map((s) => (
          <div key={s.label}
               className={`bg-white rounded-xl border p-4 shadow-sm
                           ${s.accent ? 'border-military-200/60' : 'border-slate-200'}`}>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">{s.label}</p>
            {loading
              ? <div className="h-7 w-10 bg-slate-100 rounded animate-pulse mt-1" />
              : <p className={`text-2xl font-bold ${s.accent ? 'text-military-700' : 'text-slate-900'}`}>
                  {s.value}
                </p>
            }
          </div>
        ))}
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar agencia, ID o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200
                         rounded-lg text-slate-800 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-military-500/30 focus:border-military-600"
            />
          </div>
          <span className="text-xs text-slate-400 ml-auto">
            {loading ? '...' : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Agencia</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Fecha Alta</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">

              {/* Loading skeletons */}
              {loading && [1, 2, 3].map((i) => (
                <tr key={i}>
                  {[5, 4, 4, 4, 4, 4].map((px, j) => (
                    <td key={j} className={`px-${px} py-4`}>
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}

              {/* Real rows */}
              {!loading && filtered.map((agency) => {
                const isActive    = agency.active !== false
                const planLoading = actionLoading === agency.id + '_plan'
                const actLoading  = actionLoading === agency.id + '_active'

                return (
                  <tr key={agency.id} className="hover:bg-slate-50/60 transition-colors group">

                    {/* Name + color swatch */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex-shrink-0 ring-1 ring-black/5"
                          style={{ backgroundColor: agency.settings?.primary_color ?? '#e2e8f0' }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{agency.name}</p>
                          {agency.settings?.notifications_email && (
                            <p className="text-xs text-slate-400 truncate">
                              {agency.settings.notifications_email}
                            </p>
                          )}
                          {agency.admin_email_pending && (
                            <span className="text-xs text-amber-600">Admin pendiente</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* ID */}
                    <td className="px-4 py-4">
                      <code className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {agency.id}
                      </code>
                    </td>

                    {/* Plan — clickable to toggle */}
                    <td className="px-4 py-4">
                      {planLoading ? (
                        <div className="h-5 w-14 bg-slate-100 rounded-full animate-pulse" />
                      ) : (
                        <button
                          title={`Cambiar a ${agency.subscription_tier === 'pro' ? 'Básico' : 'Pro'}`}
                          onClick={() =>
                            handleChangePlan(agency.id, agency.subscription_tier === 'pro' ? 'basic' : 'pro')
                          }
                          className="focus:outline-none"
                        >
                          <Badge variant={agency.subscription_tier === 'pro' ? 'blue' : 'gray'}
                                 className="cursor-pointer hover:opacity-80 transition-opacity">
                            {agency.subscription_tier === 'pro' ? 'Pro' : 'Básico'}
                          </Badge>
                        </button>
                      )}
                    </td>

                    {/* Created at */}
                    <td className="px-4 py-4 text-slate-500 text-xs">
                      {formatDate(agency.created_at)}
                    </td>

                    {/* Status — clickable to toggle */}
                    <td className="px-4 py-4">
                      {actLoading ? (
                        <div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" />
                      ) : (
                        <button
                          title={isActive ? 'Desactivar agencia' : 'Activar agencia'}
                          onClick={() => handleToggleActive(agency)}
                          className="focus:outline-none"
                        >
                          <Badge variant={isActive ? 'green' : 'gray'}
                                 className="cursor-pointer hover:opacity-80 transition-opacity">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                                             ${isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
                            {isActive ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setDetailAgency(agency)}
                        className="text-xs text-slate-400 hover:text-military-600 transition-colors
                                   font-medium opacity-0 group-hover:opacity-100"
                      >
                        Ver →
                      </button>
                    </td>
                  </tr>
                )
              })}

              {/* Empty */}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <p className="text-sm text-slate-400">
                      {search ? 'No se encontraron agencias.' : 'Todavía no hay agencias. Crea la primera.'}
                    </p>
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="text-xs text-military-600 hover:text-military-700 mt-1.5"
                      >
                        Limpiar búsqueda
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer hint */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">
              Haz clic en el badge de <strong>Plan</strong> o <strong>Estado</strong> para cambiarlo directamente.
            </p>
          </div>
        )}
      </div>

      {/* ══ Modals ══════════════════════════════════════════════════════════ */}

      {/* Create Agency Modal */}
      <Modal
        open={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); reset() }}
        title="Nueva Agencia"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setIsCreateOpen(false); reset() }}>
              Cancelar
            </Button>
            <Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
              Crear Agencia
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Nombre de la Agencia" error={errors.name?.message} required>
            <input
              {...register('name')}
              type="text"
              placeholder="ej. Despacho Migración S.L."
              autoFocus
              className={inputCls(!!errors.name)}
            />
          </FormField>

          <FormField
            label="Color de Marca"
            hint="Hexadecimal"
            error={errors.brandColor?.message}
            required
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl border border-slate-200 flex-shrink-0 ring-1 ring-black/5"
                style={{ backgroundColor: isValidHex ? brandColorValue : '#e2e8f0' }}
              />
              <input
                {...register('brandColor')}
                type="text"
                placeholder="#4b5320"
                maxLength={7}
                className={`flex-1 ${inputCls(!!errors.brandColor)}`}
              />
              <input
                type="color"
                value={isValidHex ? brandColorValue : '#4b5320'}
                onChange={(e) => setValue('brandColor', e.target.value, { shouldValidate: true })}
                className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer p-0.5 flex-shrink-0"
                title="Elegir color"
              />
            </div>
          </FormField>

          <FormField
            label="Email del Administrador"
            hint="Opcional — se creará el acceso automáticamente"
            error={errors.adminEmail?.message}
          >
            <input
              {...register('adminEmail')}
              type="email"
              placeholder="admin@despacho.es"
              className={inputCls(!!errors.adminEmail)}
            />
          </FormField>

          <FormField
            label="Plantilla por defecto"
            hint="Opcional — asigna una plantilla de requisitos inicial"
          >
            <select {...register('templateId')} className={inputCls(false)}>
              <option value="">Sin plantilla</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name ?? t.id}</option>
              ))}
            </select>
          </FormField>

          <div className="flex gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13 16h-1v-4h-1m1-4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
            </svg>
            <span>
              Si indicas el email del admin, se creará su acceso y recibirás una contraseña temporal
              para compartirle. La agencia se crea en plan <strong>Básico</strong>.
            </span>
          </div>
        </form>
      </Modal>

      {/* Credentials Modal — aparece tras crear la agencia con admin */}
      <Modal
        open={!!credentialsData}
        onClose={() => setCredentialsData(null)}
        title="Agencia creada"
        size="sm"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setCredentialsData(null)}>Entendido</Button>
          </div>
        }
      >
        {credentialsData?.error ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-700">
              La agencia se creó correctamente, pero hubo un error al crear el usuario administrador:
            </p>
            <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
              {credentialsData.error}
            </p>
            <p className="text-slate-500 text-xs">
              Puedes crear el usuario admin manualmente desde la ficha de la agencia.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Agencia y usuario creados
            </div>
            <p className="text-xs text-slate-500">
              Comparte estas credenciales con el administrador de la agencia:
            </p>
            <div className="space-y-2">
              <CredentialRow label="Email" value={credentialsData?.email} />
              <CredentialRow label="Contraseña temporal" value={credentialsData?.tempPassword} secret />
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Esta contraseña no se volverá a mostrar. Guárdala antes de cerrar.
            </p>
          </div>
        )}
      </Modal>

      {/* Agency Detail Modal */}
      <Modal
        open={!!detailAgency}
        onClose={() => setDetailAgency(null)}
        title="Detalle de Agencia"
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setDetailAgency(null)}>Cerrar</Button>
          </div>
        }
      >
        {detailAgency && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl ring-1 ring-black/5 flex-shrink-0"
                style={{ backgroundColor: detailAgency.settings?.primary_color ?? '#e2e8f0' }}
              />
              <div>
                <p className="font-semibold text-slate-900 text-base">{detailAgency.name}</p>
                <code className="text-xs text-slate-500">{detailAgency.id}</code>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Plan" value={
                <Badge variant={detailAgency.subscription_tier === 'pro' ? 'blue' : 'gray'}>
                  {detailAgency.subscription_tier === 'pro' ? 'Pro' : 'Básico'}
                </Badge>
              } />
              <DetailRow label="Estado" value={
                <Badge variant={detailAgency.active !== false ? 'green' : 'gray'}>
                  {detailAgency.active !== false ? 'Activa' : 'Inactiva'}
                </Badge>
              } />
              <DetailRow label="Email admin" value={
                detailAgency.settings?.notifications_email ?? '—'
              } />
              <DetailRow label="Alta" value={formatDate(detailAgency.created_at)} />
              <DetailRow label="Color" value={
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block w-4 h-4 rounded ring-1 ring-black/10"
                    style={{ backgroundColor: detailAgency.settings?.primary_color ?? '#e2e8f0' }}
                  />
                  {detailAgency.settings?.primary_color ?? '—'}
                </span>
              } />
              <DetailRow label="Admin UID" value={
                detailAgency.admin_uid
                  ? <code className="text-xs">{detailAgency.admin_uid.slice(0, 12)}…</code>
                  : <span className="text-amber-600">Pendiente</span>
              } />
              <DetailRow label="Plantilla por defecto" value={
                detailAgency.default_template_id
                  ? <code className="text-xs">{detailAgency.default_template_id}</code>
                  : <span className="text-slate-400">—</span>
              } />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────

function CredentialRow({ label, value, secret = false }) {
  const [visible, setVisible] = useState(!secret)
  const [copied,  setCopied]  = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(value ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200
                    rounded-lg px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-sm font-mono font-medium text-slate-900 truncate">
          {visible ? (value ?? '—') : '••••••••••••'}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {secret && (
          <button onClick={() => setVisible((v) => !v)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            {visible
              ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            }
          </button>
        )}
        <button onClick={copy}
                className="text-slate-400 hover:text-military-600 transition-colors p-1">
          {copied
            ? <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
          }
        </button>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  )
}
