/**
 * ClientOnboarding — Compound Component Wizard
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const OnboardingCtx = createContext(null)

function useOnboarding() {
  const ctx = useContext(OnboardingCtx)
  if (!ctx) throw new Error('useOnboarding must be used inside <ClientOnboarding>')
  return ctx
}

function ClientOnboarding({ children, onComplete, initialData = {} }) {
  const stepIds = useRef([])
  const [current, setCurrent] = useState(0)
  const [formData, setFormData] = useState(initialData)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const registerStep = useCallback((id) => {
    if (!stepIds.current.includes(id)) stepIds.current.push(id)
  }, [])

  const totalSteps = stepIds.current.length

  const updateField = useCallback((key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }, [])

  const validateForStep = (stepId, values) => {
    const errs = {}
    if (!stepId) return errs
    const isEmail = (v) => /\S+@\S+\.\S+/.test(v || '')

    if (stepId === 'personal') {
      if (!values.first_name) errs.first_name = 'El nombre es obligatorio.'
      if (!values.last_name) errs.last_name = 'Los apellidos son obligatorios.'
      if (!values.email) errs.email = 'El email es obligatorio.'
      else if (!isEmail(values.email)) errs.email = 'Email inválido.'
      if (!values.nationality) errs.nationality = 'Selecciona una nacionalidad.'
    }

    if (stepId === 'passport') {
      if (!values.passport_number) errs.passport_number = 'Número de pasaporte obligatorio.'
      if (!values.passport_expiry) errs.passport_expiry = 'Fecha de expiración obligatoria.'
    }

    if (stepId === 'case_type') {
      if (!values.case_type) errs.case_type = 'Selecciona el tipo de expediente.'
    }

    return errs
  }

  const goNext = useCallback(() => {
    const currentId = stepIds.current[current]
    const stepErrors = validateForStep(currentId, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...stepErrors }))
      // focus first invalid field for better UX
      const firstKey = Object.keys(stepErrors)[0]
      focusFirstError(firstKey)
      return
    }
    if (current < totalSteps - 1) setCurrent((c) => c + 1)
  }, [current, totalSteps, formData])

  const goPrev = useCallback(() => {
    if (current > 0) setCurrent((c) => c - 1)
  }, [current])

  const submit = useCallback(async () => {
    setLoading(true)
    try {
      const allErrors = {}
      stepIds.current.forEach((id) => {
        Object.assign(allErrors, validateForStep(id, formData))
      })
      if (Object.keys(allErrors).length > 0) {
        setErrors(allErrors)
        // focus first invalid field globally
        const firstKey = Object.keys(allErrors)[0]
        focusFirstError(firstKey)
        setLoading(false)
        return
      }
      await onComplete?.(formData)
    } finally {
      setLoading(false)
    }
  }, [formData, onComplete])

  // Focus helper: focus first element with matching name attribute
  function focusFirstError(fieldName) {
    if (!fieldName) return
    setTimeout(() => {
      const el = document.querySelector(`[name="${fieldName}"]`)
      if (el && typeof el.focus === 'function') {
        el.focus()
        if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 50)
  }

  const ctx = useMemo(
    () => ({
      current,
      totalSteps,
      stepIds: stepIds.current,
      formData,
      errors,
      loading,
      registerStep,
      updateField,
      setErrors,
      goNext,
      goPrev,
      submit,
    }),
    [current, totalSteps, formData, errors, loading, registerStep, updateField, goNext, goPrev, submit]
  )

  return (
    <OnboardingCtx.Provider value={ctx}>
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
          {children}
        </div>
      </div>
    </OnboardingCtx.Provider>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function Progress() {
  const { current, totalSteps, stepIds } = useOnboarding()

  const labels = {
    personal: 'Datos personales',
    passport: 'Pasaporte',
    case_type: 'Tipo de expediente',
  }

  return (
    <div className="px-8 pt-8 pb-4">
      <div className="flex justify-between mb-3">
        {stepIds.map((id, idx) => (
          <span
            key={id}
            className={`text-xs font-medium transition-colors ${idx <= current ? 'text-emerald-400' : 'text-slate-500'}`}>
            {labels[id] ?? id}
          </span>
        ))}
      </div>

      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-military-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${((current + 1) / Math.max(totalSteps, 1)) * 100}%` }}
        />
      </div>

      <p className="text-right text-xs text-slate-500 mt-2">Paso {current + 1} de {totalSteps}</p>
    </div>
  )
}

// ─── Step wrapper ─────────────────────────────────────────────────────────────

function Step({ id, title, children }) {
  const { current, stepIds, registerStep } = useOnboarding()

  // Ensure the step is registered synchronously so validation and progress
  // logic can rely on the `stepIds` order when Next is pressed.
  // registerStep is idempotent.
  registerStep(id)

  const myIndex = stepIds.indexOf(id)
  if (myIndex !== current) return null

  return (
    <div className="px-8 pb-4 animate-fade-in">
      {title && (
        <h2 className="text-xl font-semibold text-slate-100 mb-6 border-b border-slate-800 pb-4">{title}</h2>
      )}
      {children}
    </div>
  )
}

// ─── Navigation buttons ───────────────────────────────────────────────────────

function Nav() {
  const { current, totalSteps, loading, goPrev, goNext, submit } = useOnboarding()

  const isLast = current === totalSteps - 1
  const isFirst = current === 0

  return (
    <div className="flex items-center justify-between px-8 py-6 border-t border-slate-800">
      <button
        onClick={goPrev}
        disabled={isFirst || loading}
        className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        ← Anterior
      </button>

      {isLast ? (
        <button
          onClick={submit}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-military-600 hover:bg-military-500 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-military-900/40"
        >
          {loading ? <Spinner /> : 'Crear expediente →'}
        </button>
      ) : (
        <button
          onClick={goNext}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-military-600 hover:bg-military-500 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-military-900/40"
        >
          Siguiente →
        </button>
      )}
    </div>
  )
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white inline-block"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

// ─── Field primitives (re-usables por los Steps hijos) ────────────────────────

export function Field({ label, name, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function Input({ name, value, onChange, placeholder, type = 'text', ...rest }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5
                 text-sm text-slate-100 placeholder-slate-500
                 focus:outline-none focus:ring-2 focus:ring-military-600 focus:border-transparent
                 transition-all"
      {...rest}
    />
  )
}

export function Select({ name, value, onChange, options = [], placeholder }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5
                 text-sm text-slate-100
                 focus:outline-none focus:ring-2 focus:ring-military-600 focus:border-transparent
                 transition-all appearance-none"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(({ value: v, label }) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )
}

// ─── Attach sub-components ────────────────────────────────────────────────────

ClientOnboarding.Progress = Progress
ClientOnboarding.Step     = Step
ClientOnboarding.Nav      = Nav

export { useOnboarding }
export default ClientOnboarding
