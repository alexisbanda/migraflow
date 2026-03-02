import { useState } from 'react'
import { useBilling } from '@/hooks/useBilling'

function SummaryCard({ label, value, currency, accent }) {
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 ${accent ?? 'border-slate-800'}`}>
      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-100">{value.toLocaleString()} <span className="text-xs font-normal text-slate-500">{currency}</span></p>
    </div>
  )
}

export default function BillingTab({ caseId, isStaff }) {
  const { billing, milestones, loading, initBilling, addMilestone, recordPayment, updateBilling } = useBilling(caseId)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTotal, setNewTotal] = useState('')
  const [mDesc, setMDesc] = useState('')
  const [mAmount, setMAmount] = useState('')
  const [mDate, setMDate] = useState('')

  if (loading) return <div className="p-8 text-center text-slate-500 text-xs">Cargando facturación...</div>

  // Initialize billing if not exists
  if (!billing && isStaff) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Configurar facturación</h3>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">Establece el importe total de los honorarios para este expediente para habilitar el control de pagos.</p>
        <div className="flex gap-2">
          <input 
            type="number" 
            placeholder="Importe total (EUR)" 
            value={newTotal}
            onChange={(e) => setNewTotal(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-military-600"
          />
          <button 
            onClick={() => initBilling({ total_amount: parseFloat(newTotal) })}
            disabled={!newTotal}
            className="px-4 py-2 bg-military-700 hover:bg-military-600 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-40"
          >
            Configurar
          </button>
        </div>
      </div>
    )
  }

  if (!billing) return <div className="p-8 text-center text-slate-500 text-xs">No hay información de facturación configurada.</div>

  const pending = billing.total_amount - billing.paid_amount
  const hasDebt = pending > 0 && billing.payment_status === 'debt'

  const handleAddMilestone = async (e) => {
    e.preventDefault()
    if (!mDesc || !mAmount || !mDate) return
    await addMilestone({
      description: mDesc,
      amount: parseFloat(mAmount),
      due_date: new Date(mDate),
      status: 'pending'
    })
    setMDesc(''); setMAmount(''); setMDate(''); setShowAddForm(false)
  }

  const toggleDebtStatus = async () => {
    const nextStatus = billing.payment_status === 'debt' ? (billing.paid_amount > 0 ? 'partial' : 'pending') : 'debt'
    await updateBilling(billing.id, { payment_status: nextStatus })
  }

  const toggleBlocking = async () => {
    await updateBilling(billing.id, { block_generation_on_debt: !billing.block_generation_on_debt })
  }

  return (
    <div className="space-y-6">
      
      {/* Financial Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Honorarios" value={billing.total_amount} currency={billing.currency} />
        <SummaryCard label="Pagado" value={billing.paid_amount} currency={billing.currency} accent="border-military-900/40" />
        <SummaryCard 
          label="Pendiente" 
          value={pending} 
          currency={billing.currency} 
          accent={pending > 0 ? "border-amber-900/40" : "border-slate-800"} 
        />
      </div>

      {/* Control Panel (Staff only) */}
      {isStaff && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-slate-300">Gestión de Cobros</h3>
            <div className="flex gap-4">
               <button 
                onClick={toggleBlocking}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  billing.block_generation_on_debt 
                    ? 'bg-amber-950/20 border-amber-900/40 text-amber-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}
              >
                {billing.block_generation_on_debt ? 'Bloqueo Activo' : 'Bloqueo Inactivo'}
              </button>
              <button 
                onClick={toggleDebtStatus}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  billing.payment_status === 'debt' 
                    ? 'bg-red-950/20 border-red-900/40 text-red-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${billing.payment_status === 'debt' ? 'bg-red-500' : 'bg-slate-600'}`} />
                {billing.payment_status === 'debt' ? 'Marcar como Al Día' : 'Marcar con Deuda'}
              </button>
            </div>
          </div>

          {/* Milestones List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Hitos de pago</p>
              {!showAddForm && (
                <button onClick={() => setShowAddForm(true)} className="text-xs text-military-400 hover:text-military-300">+ Nuevo hito</button>
              )}
            </div>

            {showAddForm && (
              <form onSubmit={handleAddMilestone} className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 grid grid-cols-2 gap-3 mb-4">
                <input 
                  type="text" placeholder="Descripción (ej. Inicio de trámite)" 
                  className="col-span-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  value={mDesc} onChange={e => setMDesc(e.target.value)}
                />
                <input 
                  type="number" placeholder="Importe (€)" 
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  value={mAmount} onChange={e => setMAmount(e.target.value)}
                />
                <input 
                  type="date" 
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  value={mDate} onChange={e => setMDate(e.target.value)}
                />
                <div className="col-span-2 flex gap-2 justify-end mt-2">
                  <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs text-slate-500">Cancelar</button>
                  <button type="submit" className="px-4 py-1.5 bg-military-700 text-white text-xs font-semibold rounded-lg">Añadir</button>
                </div>
              </form>
            )}

            {milestones.length === 0 && !showAddForm && (
              <p className="text-center py-6 text-slate-600 text-xs border border-dashed border-slate-800 rounded-xl">No hay hitos de pago definidos.</p>
            )}

            {milestones.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-slate-800/20 border border-slate-800/60 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">{m.description}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Vencimiento: {m.due_date?.toDate?.().toLocaleDateString('es-ES')}</p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm font-bold text-slate-100">{m.amount.toLocaleString()} €</p>
                  {m.status === 'paid' ? (
                    <span className="px-2 py-0.5 bg-military-900/40 border border-military-800/60 text-military-400 text-[10px] font-bold rounded-full uppercase">Pagado</span>
                  ) : (
                    <button 
                      onClick={() => recordPayment(m.id, m.amount)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition-all"
                    >
                      Registrar pago
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {billing.block_generation_on_debt && billing.payment_status === 'debt' && (
             <div className="mt-6 flex items-start gap-3 bg-red-950/20 border border-red-900/40 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-xs font-bold text-red-400 uppercase tracking-tight">Generación bloqueada</p>
                <p className="text-[11px] text-red-300 opacity-80 mt-0.5 leading-relaxed">Este expediente tiene una deuda activa y el bloqueo financiero está habilitado. No se podrá generar el paquete migratorio hasta que se regularice la situación.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
