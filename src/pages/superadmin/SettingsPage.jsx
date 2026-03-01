import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import Button from '@/components/ui/Button'
import Badge  from '@/components/ui/Badge'

const SETTINGS_DOC = 'global'

const DEFAULT_SETTINGS = {
  default_plan:             'basic',
  allow_new_agencies:       true,
  ocr_max_file_size_mb:     15,
  platform_status:          'operational',
  maintenance_message:      '',
}

const STATUS_OPTIONS = [
  { value: 'operational',        label: 'Operacional',          variant: 'green'  },
  { value: 'degraded',           label: 'Rendimiento degradado', variant: 'amber'  },
  { value: 'maintenance',        label: 'En mantenimiento',      variant: 'gray'   },
  { value: 'partial_outage',     label: 'Interrupción parcial',  variant: 'red'    },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100">
      {children}
    </h2>
  )
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-military-500
                  ${checked ? 'bg-military-600' : 'bg-slate-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform
                    duration-200 mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState(null)

  // Load settings from Firestore
  useEffect(() => {
    getDoc(doc(db, 'settings', SETTINGS_DOC))
      .then((snap) => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...snap.data() })
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const update = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await setDoc(doc(db, 'settings', SETTINGS_DOC), {
        ...settings,
        updated_at: serverTimestamp(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === settings.platform_status)
    ?? STATUS_OPTIONS[0]

  if (loading) {
    return (
      <div className="flex-1 p-8 max-w-[900px] w-full mx-auto">
        <div className="mb-8">
          <div className="h-7 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-slate-100 rounded animate-pulse mt-2" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 h-64 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 max-w-[900px] w-full mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ajustes del SaaS</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configuración global de la plataforma MigraFlow
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Guardado
            </span>
          )}
          <Button loading={saving} onClick={handleSave}>
            Guardar cambios
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M12 3C6.477 3 2 7.477 2 12s4.477 9 10 9 10-4.477 10-9S17.523 3 12 3z" />
          </svg>
          {error}
        </div>
      )}

      <div className="space-y-6">

        {/* ── Estado de la plataforma ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 pt-5 pb-2">
          <SectionTitle>Estado de la plataforma</SectionTitle>

          <SettingRow
            label="Estado actual"
            description="Visible en el panel de agencias y en la página de login."
          >
            <div className="flex items-center gap-2">
              <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
            </div>
          </SettingRow>

          <SettingRow label="Cambiar estado">
            <div className="flex gap-2 flex-wrap justify-end">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update('platform_status', opt.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all
                    ${settings.platform_status === opt.value
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            label="Mensaje de mantenimiento"
            description="Se muestra cuando el estado es 'En mantenimiento'."
          >
            <input
              type="text"
              value={settings.maintenance_message}
              onChange={(e) => update('maintenance_message', e.target.value)}
              placeholder="ej. Estaremos de vuelta en 30 minutos."
              className="w-64 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white
                         text-slate-800 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-military-500/30 focus:border-military-600"
            />
          </SettingRow>
        </div>

        {/* ── Agencias ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 pt-5 pb-2">
          <SectionTitle>Agencias</SectionTitle>

          <SettingRow
            label="Plan por defecto"
            description="Plan asignado automáticamente al crear una nueva agencia."
          >
            <div className="flex gap-2">
              {['basic', 'pro'].map((plan) => (
                <button
                  key={plan}
                  onClick={() => update('default_plan', plan)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize
                    ${settings.default_plan === plan
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                >
                  {plan === 'basic' ? 'Básico' : 'Pro'}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow
            label="Permitir nuevas agencias"
            description="Desactívalo para bloquear el onboarding de nuevos clientes temporalmente."
          >
            <Toggle
              checked={settings.allow_new_agencies}
              onChange={(v) => update('allow_new_agencies', v)}
            />
          </SettingRow>
        </div>

        {/* ── OCR / IA ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 pt-5 pb-2">
          <SectionTitle>Procesamiento de documentos (OCR)</SectionTitle>

          <SettingRow
            label="Tamaño máximo de archivo"
            description="Límite global para la subida de documentos. La Cloud Function también lo controla."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={settings.ocr_max_file_size_mb}
                onChange={(e) => update('ocr_max_file_size_mb', Number(e.target.value))}
                className="w-20 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-center
                           focus:outline-none focus:ring-2 focus:ring-military-500/30 focus:border-military-600"
              />
              <span className="text-sm text-slate-500">MB</span>
            </div>
          </SettingRow>
        </div>

        {/* ── Información técnica ── */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 px-6 pt-5 pb-5">
          <SectionTitle>Información técnica</SectionTitle>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Cloud Functions región', value: 'europe-west1' },
              { label: 'Firestore región',       value: 'europe-west1' },
              { label: 'Auth provider',          value: 'Email / Password' },
              { label: 'Versión de la app',      value: '0.1.0 (beta)' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg border border-slate-200 px-3 py-2.5">
                <p className="text-slate-400 mb-0.5">{label}</p>
                <p className="font-medium text-slate-700 font-mono">{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
