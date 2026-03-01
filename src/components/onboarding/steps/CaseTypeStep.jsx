import ClientOnboarding, { useOnboarding } from '../ClientOnboarding'

// Tipos de expediente configurables — idealmente vendrían de /global_templates en Firestore
const CASE_TYPES = [
  {
    id: 'nomada_digital',
    label: 'Nómada Digital',
    description: 'Visa para trabajadores remotos en España. Requiere acreditar ingresos mínimos.',
    icon: '💻',
    badge: 'Popular',
  },
  {
    id: 'residencia_no_lucrativa',
    label: 'Residencia No Lucrativa',
    description: 'Para quienes no ejercen actividad laboral en España y tienen medios económicos suficientes.',
    icon: '🏠',
    badge: null,
  },
  {
    id: 'cuenta_ajena',
    label: 'Cuenta Ajena',
    description: 'Autorización de residencia y trabajo por cuenta ajena.',
    icon: '🏢',
    badge: null,
  },
  {
    id: 'reagrupacion_familiar',
    label: 'Reagrupación Familiar',
    description: 'Para familiares de residentes legales en España.',
    icon: '👨‍👩‍👧',
    badge: null,
  },
]

function CaseTypeCard({ type, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(type.id)}
      className={`w-full text-left rounded-xl border p-4 transition-all group
        ${
          selected
            ? 'border-military-600 bg-military-900/30 shadow-lg shadow-military-900/20'
            : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
        }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{type.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${
                selected ? 'text-military-300' : 'text-slate-200'
              }`}
            >
              {type.label}
            </span>
            {type.badge && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-military-600/30 text-military-300 rounded-full">
                {type.badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">{type.description}</p>
        </div>
        {/* Radio indicator */}
        <div
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all
            ${selected ? 'border-military-500 bg-military-500' : 'border-slate-600'}`}
        />
      </div>
    </button>
  )
}

export default function CaseTypeStep() {
  const { formData, errors, updateField } = useOnboarding()

  return (
    <ClientOnboarding.Step id="case_type" title="Tipo de expediente migratorio">
      <div className="space-y-3">
        {CASE_TYPES.map((type) => (
          <CaseTypeCard
            key={type.id}
            type={type}
            selected={formData.case_type === type.id}
            onSelect={(id) => updateField('case_type', id)}
          />
        ))}
        {errors.case_type && (
          <p className="text-xs text-red-400 pt-1">{errors.case_type}</p>
        )}
      </div>
    </ClientOnboarding.Step>
  )
}
