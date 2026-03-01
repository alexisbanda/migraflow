import { useState, useEffect } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  collection, onSnapshot, setDoc, deleteDoc,
  doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Button from '@/components/ui/Button'
import Badge  from '@/components/ui/Badge'
import Modal  from '@/components/ui/Modal'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const aiRulesSchema = z.object({
  max_age_months:             z.number().nullable().optional(),
  requires_apostille:         z.boolean(),
  requires_sworn_translation: z.boolean(),
  required_keywords:          z.string(),   // comma-sep en el form → array al guardar
})

const reqSchema = z.object({
  reqId:               z.string(),
  name:                z.string().min(1, 'El nombre es obligatorio'),
  type:                z.enum(['client_upload', 'auto_generated']),
  client_instructions: z.string(),
  is_mandatory:        z.boolean(),
  ai_rules:            aiRulesSchema,
})

const templateSchema = z.object({
  name:                      z.string().min(2, 'El nombre es obligatorio'),
  case_type:                 z.string().min(1, 'Introduce el tipo de expediente'),
  estimated_resolution_days: z.number({ invalid_type_error: 'Introduce un número' })
                               .int().min(1).max(730),
  requirements_blueprint:    z.object({
    titular: z.array(reqSchema),
    spouse:  z.array(reqSchema),
    child:   z.array(reqSchema),
  }),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nameToSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

const BLANK_REQ = () => ({
  reqId:               '',
  name:                '',
  type:                'client_upload',
  client_instructions: '',
  is_mandatory:        true,
  ai_rules: {
    max_age_months:             null,
    requires_apostille:         false,
    requires_sworn_translation: false,
    required_keywords:          '',
  },
})

function mapReqsToForm(reqs) {
  return (reqs ?? []).map((req) => ({
    reqId:               req.id ?? '',
    name:                req.name ?? '',
    type:                req.type ?? 'client_upload',
    client_instructions: req.client_instructions ?? '',
    is_mandatory:        req.is_mandatory ?? true,
    ai_rules: {
      max_age_months:             req.ai_rules?.max_age_months ?? null,
      requires_apostille:         req.ai_rules?.requires_apostille ?? false,
      requires_sworn_translation: req.ai_rules?.requires_sworn_translation ?? false,
      required_keywords:          (req.ai_rules?.required_keywords ?? []).join(', '),
    },
  }))
}

function toFormValues(tpl) {
  const rb = tpl.requirements_blueprint ?? {}
  
  // Backward compatibility: if requirements_blueprint is an array, put it in 'titular'
  if (Array.isArray(rb)) {
    return {
      name:                      tpl.name ?? '',
      case_type:                 tpl.case_type ?? '',
      estimated_resolution_days: tpl.estimated_resolution_days ?? 30,
      requirements_blueprint: {
        titular: mapReqsToForm(rb),
        spouse:  [],
        child:   [],
      },
    }
  }

  return {
    name:                      tpl.name ?? '',
    case_type:                 tpl.case_type ?? '',
    estimated_resolution_days: tpl.estimated_resolution_days ?? 30,
    requirements_blueprint: {
      titular: mapReqsToForm(rb.titular),
      spouse:  mapReqsToForm(rb.spouse),
      child:   mapReqsToForm(rb.child),
    },
  }
}

function mapReqsToFirestore(reqs) {
  return (reqs ?? []).map((req, i) => ({
    id:                  req.reqId || `req-${Date.now()}-${i}`,
    name:                req.name,
    type:                req.type,
    client_instructions: req.client_instructions,
    is_mandatory:        req.is_mandatory,
    merge_order:         i + 1,
    ai_rules: {
      max_age_months:             req.ai_rules.max_age_months || null,
      requires_apostille:         req.ai_rules.requires_apostille,
      requires_sworn_translation: req.ai_rules.requires_sworn_translation,
      required_keywords: req.ai_rules.required_keywords
        ? req.ai_rules.required_keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [],
    },
  }))
}

function toFirestoreData(formData) {
  return {
    name:                      formData.name,
    case_type:                 formData.case_type,
    estimated_resolution_days: formData.estimated_resolution_days,
    requirements_blueprint: {
      titular: mapReqsToFirestore(formData.requirements_blueprint.titular),
      spouse:  mapReqsToFirestore(formData.requirements_blueprint.spouse),
      child:   mapReqsToFirestore(formData.requirements_blueprint.child),
    },
    updated_at: serverTimestamp(),
  }
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors duration-200
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-military-500
                    ${checked ? 'bg-military-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow ring-0 mt-0.5
                          transition-transform duration-200
                          ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </label>
  )
}

// ─── RequirementCard ──────────────────────────────────────────────────────────

const inputCls = (err) =>
  `w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-800
   placeholder-slate-400 transition-all outline-none
   focus:ring-2 focus:ring-military-500/30 focus:border-military-600
   ${err ? 'border-red-400 bg-red-50/30' : 'border-slate-300'}`

function RequirementCard({
  role, index, control, register, watch, errors,
  isFirst, isLast, expanded,
  onToggleExpand, onRemove, onMoveUp, onMoveDown,
}) {
  const basePath = `requirements_blueprint.${role}.${index}`
  const name = watch(`${basePath}.name`)
  const type = watch(`${basePath}.type`)
  const reqErr = errors?.requirements_blueprint?.[role]?.[index]

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-shadow
                     ${expanded ? 'border-military-300/60 shadow-sm' : 'border-slate-200'}`}>

      {/* ── Header (always visible) ── */}
      <div
        className={`flex items-center gap-2 px-4 py-3 cursor-pointer select-none
                    ${expanded ? 'bg-military-50/60' : 'bg-slate-50/60 hover:bg-slate-100/60'}`}
        onClick={onToggleExpand}
      >
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
        </svg>

        {/* Drag number */}
        <span className="text-xs text-slate-400 font-mono w-5 text-center flex-shrink-0">
          {index + 1}
        </span>

        {/* Name */}
        <span className={`flex-1 text-sm font-medium truncate ${name ? 'text-slate-800' : 'text-slate-400 italic'}`}>
          {name || 'Sin nombre'}
        </span>

        {/* Type badge */}
        <Badge variant={type === 'auto_generated' ? 'purple' : 'blue'} className="text-xs flex-shrink-0">
          {type === 'auto_generated' ? 'Auto' : 'Cliente'}
        </Badge>

        {/* Reorder buttons */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveUp() }}
          disabled={isFirst}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-400
                     hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition-all"
          title="Subir"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveDown() }}
          disabled={isLast}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-400
                     hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition-all"
          title="Bajar"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-300
                     hover:text-red-500 hover:bg-red-50 transition-all ml-1"
          title="Eliminar requisito"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="px-5 py-5 space-y-5 border-t border-slate-100">

          {/* Row 1: Name + Type + Mandatory */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-start">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Nombre del requisito <span className="text-red-500">*</span>
              </label>
              <input
                {...register(`${basePath}.name`)}
                type="text"
                placeholder="ej. Pasaporte vigente (copia completa)"
                className={inputCls(!!reqErr?.name)}
              />
              {reqErr?.name && <p className="text-xs text-red-500">{reqErr.name.message}</p>}
            </div>

            <div className="space-y-1.5 min-w-[180px]">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tipo</label>
              <select
                {...register(`${basePath}.type`)}
                className={inputCls(false)}
              >
                <option value="client_upload">Subida por cliente</option>
                <option value="auto_generated">Generado automáticamente</option>
              </select>
            </div>

            <div className="space-y-1.5 pt-0.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide block">
                Obligatorio
              </label>
              <div className="pt-2">
                <Controller
                  control={control}
                  name={`${basePath}.is_mandatory`}
                  render={({ field }) => (
                    <Toggle checked={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Client instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Instrucciones para el cliente
            </label>
            <textarea
              {...register(`${basePath}.client_instructions`)}
              rows={2}
              placeholder="ej. Sube una copia escaneada de todas las páginas del pasaporte, incluyendo la hoja de datos."
              className={`${inputCls(false)} resize-none leading-relaxed`}
            />
          </div>

          {/* AI Rules */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Reglas de validación IA (OCR)
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* max_age_months */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Antigüedad máxima del documento
                </label>
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name={`${basePath}.ai_rules.max_age_months`}
                    render={({ field }) => (
                      <input
                        type="number"
                        min={1}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : Number(e.target.value))
                        }
                        placeholder="Sin límite"
                        className="w-28 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white
                                   focus:outline-none focus:ring-2 focus:ring-military-500/30 focus:border-military-600"
                      />
                    )}
                  />
                  <span className="text-sm text-slate-500">meses</span>
                </div>
              </div>

              {/* required_keywords */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">
                  Palabras clave requeridas <span className="text-slate-400">(separadas por coma)</span>
                </label>
                <input
                  {...register(`${basePath}.ai_rules.required_keywords`)}
                  type="text"
                  placeholder="ej. apostilla, pasaporte, seguro"
                  className={inputCls(false)}
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  {...register(`${basePath}.ai_rules.requires_apostille`)}
                  className="w-4 h-4 rounded border-slate-300 text-military-600
                             focus:ring-military-500 accent-military-600 cursor-pointer"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">
                  Requiere apostilla
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  {...register(`${basePath}.ai_rules.requires_sworn_translation`)}
                  className="w-4 h-4 rounded border-slate-300 text-military-600
                             focus:ring-military-500 accent-military-600 cursor-pointer"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900">
                  Requiere traducción jurada
                </span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyEditor({ onNew }) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-military-50 border border-military-200/60
                        flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-military-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-700">Selecciona una plantilla</p>
        <p className="text-sm text-slate-400 mt-1 mb-5">
          Elige una plantilla del panel izquierdo para editarla,<br />o crea una nueva.
        </p>
        <Button onClick={onNew} variant="outline">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Plantilla
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: '',
  case_type: '',
  estimated_resolution_days: 30,
  requirements_blueprint: {
    titular: [],
    spouse:  [],
    child:   [],
  },
}

const CASE_TYPE_SUGGESTIONS = [
  'nomada_digital',
  'residencia_no_lucrativa',
  'cuenta_ajena',
  'reagrupacion_familiar',
  'estancia_estudios',
  'autorizacion_residencia',
  'renovacion_residencia',
]

const ROLES = [
  { id: 'titular', label: 'Titular', icon: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )},
  { id: 'spouse', label: 'Cónyuge', icon: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )},
  { id: 'child', label: 'Dependiente', icon: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )},
]

export default function TemplateBuilderPage() {
  const [templates,      setTemplates]      = useState([])
  const [loadingList,    setLoadingList]     = useState(true)
  const [selectedId,     setSelectedId]      = useState(null)
  const [isNew,          setIsNew]           = useState(false)
  const [expandedIdx,    setExpandedIdx]     = useState(null)
  const [activeRole,     setActiveRole]      = useState('titular')
  const [deleteConfirm,  setDeleteConfirm]   = useState(null)   // template to confirm delete
  const [saveError,      setSaveError]       = useState(null)

  // ── Firestore listener ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'global_templates'),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es'))
        setTemplates(data)
        setLoadingList(false)
      },
      () => setLoadingList(false)
    )
    return unsub
  }, [])

  // ── Form ─────────────────────────────────────────────────────────────────
  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(templateSchema),
    defaultValues: BLANK_FORM,
  })

  // We need three useFieldArray instances
  const titularFA = useFieldArray({ control, name: 'requirements_blueprint.titular' })
  const spouseFA  = useFieldArray({ control, name: 'requirements_blueprint.spouse' })
  const childFA   = useFieldArray({ control, name: 'requirements_blueprint.child' })

  const getActiveFA = () => {
    if (activeRole === 'titular') return titularFA
    if (activeRole === 'spouse')  return spouseFA
    return childFA
  }

  const { fields, append, remove, move } = getActiveFA()

  // ── Selection ─────────────────────────────────────────────────────────────
  const confirmDirty = () => {
    if (!isDirty) return true
    return window.confirm('Tienes cambios sin guardar. ¿Descartar y continuar?')
  }

  const handleSelectTemplate = (tpl) => {
    if (tpl.id === selectedId) return
    if (!confirmDirty()) return
    setSelectedId(tpl.id)
    setIsNew(false)
    setExpandedIdx(null)
    setActiveRole('titular')
    reset(toFormValues(tpl))
    setSaveError(null)
  }

  const handleNew = () => {
    if (!confirmDirty()) return
    setSelectedId(null)
    setIsNew(true)
    setExpandedIdx(null)
    setActiveRole('titular')
    reset(BLANK_FORM)
    setSaveError(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const onSave = async (formData) => {
    setSaveError(null)
    try {
      const firestoreData = toFirestoreData(formData)

      if (isNew) {
        const slug = nameToSlug(formData.name)
        const newId = `tpl-${slug}-${Date.now().toString(36)}`
        await setDoc(doc(db, 'global_templates', newId), {
          ...firestoreData,
          created_at: serverTimestamp(),
        })
        setSelectedId(newId)
        setIsNew(false)
      } else {
        await setDoc(doc(db, 'global_templates', selectedId), firestoreData, { merge: true })
      }

      reset(formData)   // limpia isDirty sin perder los valores del form
    } catch (err) {
      setSaveError(err.message)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteDoc(doc(db, 'global_templates', deleteConfirm.id))
      if (selectedId === deleteConfirm.id) {
        setSelectedId(null)
        setIsNew(false)
        reset(BLANK_FORM)
      }
    } finally {
      setDeleteConfirm(null)
    }
  }

  // ── Req actions ───────────────────────────────────────────────────────────
  const appendReq = () => {
    append(BLANK_REQ())
    setExpandedIdx(fields.length)   // abre el nuevo
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedTemplate = templates.find((t) => t.id === selectedId)
  const showEditor       = isNew || !!selectedId

  // ─────────────────────────────────────────────────────────────────────────

  return (
    /* Full-viewport split screen (sidebar is fixed, so inset-0 ml-64 fills the rest) */
    <div className="fixed inset-0 ml-64 flex bg-slate-50 overflow-hidden">

      {/* ══ LEFT PANEL — template list ══════════════════════════════════════ */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Plantillas</h2>
            <p className="text-xs text-slate-400">
              {loadingList ? '...' : `${templates.length} plantilla${templates.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Button size="sm" onClick={handleNew}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loadingList && templates.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-400">
              No hay plantillas. Crea la primera.
            </div>
          )}

          {!loadingList && templates.map((tpl) => {
            const active = tpl.id === selectedId
            const rb = tpl.requirements_blueprint ?? {}
            const totalReqs = Array.isArray(rb) 
              ? rb.length 
              : (rb.titular?.length ?? 0) + (rb.spouse?.length ?? 0) + (rb.child?.length ?? 0)

            return (
              <div key={tpl.id} className="relative group">
                <button
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`w-full text-left px-4 py-3.5 transition-all border-r-2 ${
                    active
                      ? 'bg-military-50 border-r-military-600'
                      : 'border-r-transparent hover:bg-slate-50'
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${active ? 'text-military-700' : 'text-slate-800'}`}>
                    {tpl.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <code className="text-[10px] text-slate-400">{tpl.case_type}</code>
                    <span>·</span>
                    <span>{totalReqs} reqs</span>
                    {tpl.estimated_resolution_days && (
                      <>
                        <span>·</span>
                        <span>{tpl.estimated_resolution_days}d</span>
                      </>
                    )}
                  </p>
                </button>

                {/* Delete button (hover) */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(tpl) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md
                             flex items-center justify-center
                             text-slate-300 hover:text-red-500 hover:bg-red-50
                             opacity-0 group-hover:opacity-100 transition-all"
                  title="Eliminar plantilla"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ══ RIGHT PANEL — editor ════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!showEditor ? (
          <EmptyEditor onNew={handleNew} />
        ) : (
          <form
            onSubmit={handleSubmit(onSave)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* ── Editor header ── */}
            <div className="px-8 py-5 border-b border-slate-200 bg-white flex items-start justify-between flex-shrink-0">
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  {isNew ? 'Nueva Plantilla' : (selectedTemplate?.name ?? '…')}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isNew
                    ? 'Define el nombre, tipo de expediente y requisitos documentales.'
                    : `ID: ${selectedId}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isDirty && (
                  <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
                    </svg>
                    Cambios sin guardar
                  </span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!confirmDirty()) return
                    setSelectedId(null)
                    setIsNew(false)
                    reset(BLANK_FORM)
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={isSubmitting} size="sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  {isNew ? 'Crear Plantilla' : 'Guardar cambios'}
                </Button>
              </div>
            </div>

            {/* ── Scrollable editor body ── */}
            <div className="flex-1 overflow-y-auto px-8 py-7 space-y-8">

              {/* Save error */}
              {saveError && (
                <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
                  </svg>
                  {saveError}
                </div>
              )}

              {/* ── Basic fields ── */}
              <section className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-6 space-y-5">
                <h2 className="text-sm font-semibold text-slate-700 border-b border-slate-100 pb-3">
                  Datos de la plantilla
                </h2>

                <div className="grid grid-cols-3 gap-5">
                  {/* Nombre */}
                  <div className="col-span-3 md:col-span-1 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      {...register('name')}
                      type="text"
                      placeholder="ej. Visa Nómada Digital"
                      className={inputCls(!!errors.name)}
                    />
                    {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                  </div>

                  {/* Tipo de expediente */}
                  <div className="col-span-3 md:col-span-1 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Tipo de expediente <span className="text-red-500">*</span>
                    </label>
                    <input
                      {...register('case_type')}
                      list="case-type-suggestions"
                      type="text"
                      placeholder="ej. nomada_digital"
                      className={inputCls(!!errors.case_type)}
                    />
                    <datalist id="case-type-suggestions">
                      {CASE_TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                    </datalist>
                    {errors.case_type && (
                      <p className="text-xs text-red-500">{errors.case_type.message}</p>
                    )}
                    <p className="text-xs text-slate-400">
                      Snake_case · Se usa al crear expedientes de este tipo
                    </p>
                  </div>

                  {/* Días resolución */}
                  <div className="col-span-3 md:col-span-1 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Días estimados de resolución
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        {...register('estimated_resolution_days', { valueAsNumber: true })}
                        type="number"
                        min={1}
                        max={730}
                        placeholder="90"
                        className={`flex-1 ${inputCls(!!errors.estimated_resolution_days)}`}
                      />
                      <span className="text-sm text-slate-500 flex-shrink-0">días</span>
                    </div>
                    {errors.estimated_resolution_days && (
                      <p className="text-xs text-red-500">{errors.estimated_resolution_days.message}</p>
                    )}
                  </div>
                </div>
              </section>

              {/* ── Requirements builder ── */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">
                      Requisitos documentales
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configura los documentos requeridos por cada rol.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={appendReq}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Añadir requisito
                  </Button>
                </div>

                {/* Role Tabs */}
                <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl w-fit">
                  {ROLES.map((r) => {
                    const active = activeRole === r.id
                    const count = watch(`requirements_blueprint.${r.id}`)?.length ?? 0
                    const hasError = !!errors.requirements_blueprint?.[r.id]
                    
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setActiveRole(r.id)
                          setExpandedIdx(null)
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                                    ${active 
                                      ? 'bg-white text-military-700 shadow-sm' 
                                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                      >
                        {r.icon}
                        {r.label}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full 
                                          ${active ? 'bg-military-100 text-military-700' : 'bg-slate-200 text-slate-500'}`}>
                          {count}
                        </span>
                        {hasError && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                      </button>
                    )
                  })}
                </div>

                {fields.length === 0 && (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-300
                                  px-6 py-10 text-center">
                    <p className="text-sm text-slate-400">
                      No hay requisitos para el rol <strong className="text-slate-600">{ROLES.find(r => r.id === activeRole)?.label}</strong>.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Pulsa «Añadir requisito» para comenzar.
                    </p>
                  </div>
                )}

                <div className="space-y-2.5">
                  {fields.map((field, index) => (
                    <RequirementCard
                      key={field.id}
                      role={activeRole}
                      index={index}
                      control={control}
                      register={register}
                      watch={watch}
                      errors={errors}
                      isFirst={index === 0}
                      isLast={index === fields.length - 1}
                      expanded={expandedIdx === index}
                      onToggleExpand={() =>
                        setExpandedIdx((prev) => (prev === index ? null : index))
                      }
                      onRemove={() => {
                        remove(index)
                        if (expandedIdx === index) setExpandedIdx(null)
                        else if (expandedIdx > index) setExpandedIdx((p) => p - 1)
                      }}
                      onMoveUp={() => {
                        move(index, index - 1)
                        if (expandedIdx === index)      setExpandedIdx(index - 1)
                        else if (expandedIdx === index - 1) setExpandedIdx(index)
                      }}
                      onMoveDown={() => {
                        move(index, index + 1)
                        if (expandedIdx === index)      setExpandedIdx(index + 1)
                        else if (expandedIdx === index + 1) setExpandedIdx(index)
                      }}
                    />
                  ))}
                </div>

                {/* Bottom save shortcut */}
                {fields.length > 2 && (
                  <div className="flex justify-end pt-2">
                    <Button type="submit" loading={isSubmitting} size="sm">
                      {isNew ? 'Crear Plantilla' : 'Guardar cambios'}
                    </Button>
                  </div>
                )}
              </section>

            </div>
          </form>
        )}
      </main>

      {/* ══ Delete confirmation modal ════════════════════════════════════════ */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Eliminar plantilla"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete}>Eliminar</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          ¿Eliminar la plantilla{' '}
          <strong className="text-slate-900">"{deleteConfirm?.name}"</strong>?
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Esta acción no se puede deshacer. Los expedientes existentes basados en esta
          plantilla no se verán afectados.
        </p>
      </Modal>
    </div>
  )
}
