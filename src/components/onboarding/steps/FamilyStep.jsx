import { useState } from 'react'
import ClientOnboarding, { Field, Input, Select, useOnboarding } from '../ClientOnboarding'

const RELATIONSHIPS = [
  { value: 'spouse', label: 'Cónyuge / Pareja de hecho' },
  { value: 'child',  label: 'Hijo / Dependiente' },
]

export default function FamilyStep() {
  const { formData, updateField } = useOnboarding()
  const [isFamily, setIsFamily] = useState(formData.is_family ?? false)

  const beneficiaries = formData.beneficiaries || []

  const handleToggleFamily = (val) => {
    setIsFamily(val)
    updateField('is_family', val)
    if (!val) updateField('beneficiaries', [])
  }

  const addBeneficiary = () => {
    const newBen = {
      id: Date.now(),
      first_name: '',
      last_name: '',
      relationship: 'spouse',
    }
    updateField('beneficiaries', [...beneficiaries, newBen])
  }

  const updateBeneficiary = (id, field, value) => {
    const updated = beneficiaries.map(b => b.id === id ? { ...b, [field]: value } : b)
    updateField('beneficiaries', updated)
  }

  const removeBeneficiary = (id) => {
    const updated = beneficiaries.filter(b => b.id !== id)
    updateField('beneficiaries', updated)
  }

  return (
    <ClientOnboarding.Step id="family" title="Configuración del expediente">
      <div className="space-y-6">
        {/* Toggle Individual/Familiar */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleToggleFamily(false)}
            className={`flex-1 p-4 rounded-xl border text-left transition-all
              ${!isFamily 
                ? 'border-military-600 bg-military-900/30 ring-1 ring-military-600' 
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
          >
            <p className="text-sm font-semibold text-slate-100">Trámite Individual</p>
            <p className="text-xs text-slate-500 mt-1">Solo el titular del expediente.</p>
          </button>

          <button
            type="button"
            onClick={() => handleToggleFamily(true)}
            className={`flex-1 p-4 rounded-xl border text-left transition-all
              ${isFamily 
                ? 'border-military-600 bg-military-900/30 ring-1 ring-military-600' 
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
          >
            <p className="text-sm font-semibold text-slate-100">Trámite Familiar</p>
            <p className="text-xs text-slate-500 mt-1">Incluye cónyuge o hijos dependientes.</p>
          </button>
        </div>

        {isFamily && (
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">Beneficiarios</h3>
              <button
                type="button"
                onClick={addBeneficiary}
                className="text-xs text-military-400 hover:text-military-300 transition-colors font-medium"
              >
                + Añadir beneficiario
              </button>
            </div>

            {beneficiaries.length === 0 && (
              <p className="text-xs text-slate-600 italic">No has añadido beneficiarios aún.</p>
            )}

            <div className="space-y-3">
              {beneficiaries.map((b, idx) => (
                <div key={b.id} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 relative group animate-fade-in">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Nombre">
                      <Input
                        name={`ben_first_${b.id}`}
                        value={b.first_name}
                        onChange={(n, v) => updateBeneficiary(b.id, 'first_name', v)}
                        placeholder="Nombre"
                      />
                    </Field>
                    <Field label="Apellidos">
                      <Input
                        name={`ben_last_${b.id}`}
                        value={b.last_name}
                        onChange={(n, v) => updateBeneficiary(b.id, 'last_name', v)}
                        placeholder="Apellidos"
                      />
                    </Field>
                    <Field label="Relación" className="col-span-2">
                      <Select
                        name={`ben_rel_${b.id}`}
                        value={b.relationship}
                        onChange={(n, v) => updateBeneficiary(b.id, 'relationship', v)}
                        options={RELATIONSHIPS}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBeneficiary(b.id)}
                    className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ClientOnboarding.Step>
  )
}
