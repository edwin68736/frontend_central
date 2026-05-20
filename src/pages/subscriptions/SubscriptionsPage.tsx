import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, RefreshCw, PauseCircle, PlayCircle, Clock } from 'lucide-react'
import { subscriptionsService, type SaasSubscription, type CreateSubscriptionInput } from '../../services/subscriptions.service'
import { plansService, type SaasPlan } from '../../services/plans.service'
import { tenantsService, type Tenant } from '../../services/tenants.service'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

const STATUS_CONFIG = {
  active: { label: 'Activa', variant: 'green' as const },
  trial: { label: 'Trial', variant: 'blue' as const },
  expired: { label: 'Vencida', variant: 'red' as const },
  suspended: { label: 'Suspendida', variant: 'yellow' as const },
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysLeft(end: string): number {
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<SaasSubscription[]>([])
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSuspendModal, setShowSuspendModal] = useState(false)
  const [selectedSub, setSelectedSub] = useState<SaasSubscription | null>(null)
  const [form, setForm] = useState<CreateSubscriptionInput>({ tenant_id: 0, plan_id: 0, months: 1, notes: '' })
  const [suspendReason, setSuspendReason] = useState('')
  const [extraMonths, setExtraMonths] = useState(1)
  const [saving, setSaving] = useState(false)
  const [checkingExpired, setCheckingExpired] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [s, p, t] = await Promise.all([
        subscriptionsService.list(filterStatus),
        plansService.list(),
        tenantsService.list(),
      ])
      setSubs(s)
      setPlans(p.filter(p => p.active))
      setTenants(t)
    } catch { toast.error('Error cargando suscripciones') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus])

  const handleCreate = async () => {
    if (!form.tenant_id || !form.plan_id) { toast.error('Selecciona empresa y plan'); return }
    setSaving(true)
    try {
      await subscriptionsService.create(form)
      toast.success('Suscripción creada y módulos sincronizados')
      setShowCreateModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error creando suscripción')
    } finally { setSaving(false) }
  }

  const handleSuspend = async () => {
    if (!selectedSub) return
    setSaving(true)
    try {
      await subscriptionsService.suspend(selectedSub.id, suspendReason)
      toast.success('Suscripción suspendida — tenant desactivado')
      setShowSuspendModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error suspendiendo')
    } finally { setSaving(false) }
  }

  const handleReactivate = async (sub: SaasSubscription) => {
    try {
      await subscriptionsService.reactivate(sub.id, 0)
      toast.success('Suscripción reactivada — tenant activo')
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error reactivando')
    }
  }

  const handleCheckExpirations = async () => {
    setCheckingExpired(true)
    try {
      const r = await subscriptionsService.checkExpirations()
      toast.success(`Verificación completada — ${r.suspended} suspendida(s)`)
      load()
    } catch { toast.error('Error verificando vencimientos') }
    finally { setCheckingExpired(false) }
  }

  const getTenantName = (id: number) => tenants.find(t => t.id === id)?.name ?? `Tenant #${id}`

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Suscripciones</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona el acceso de los tenants al sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckExpirations}
            disabled={checkingExpired}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Clock size={14} /> {checkingExpired ? 'Verificando...' : 'Verificar vencidos'}
          </button>
          <button
            onClick={() => { setForm({ tenant_id: 0, plan_id: 0, months: 1, notes: '' }); setShowCreateModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nueva suscripción
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['', 'active', 'trial', 'expired', 'suspended']).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            {s === '' ? 'Todas' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label ?? s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Empresa</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vigencia</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Módulos</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {subs.map(sub => {
              const days = daysLeft(sub.end_date)
              const cfg = STATUS_CONFIG[sub.status] ?? { label: sub.status, variant: 'default' as const }
              return (
                <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{getTenantName(sub.tenant_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{sub.plan_name}</td>
                  <td className="px-4 py-3">
                    <div className="text-slate-600">{fmtDate(sub.start_date)} → {fmtDate(sub.end_date)}</div>
                    {sub.status === 'active' && (
                      <div className={`text-xs mt-0.5 ${days <= 7 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {days > 0 ? `${days} días restantes` : 'Vencida hoy'}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.variant as 'green' | 'red' | 'yellow' | 'blue' | 'gray'}>{cfg.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(sub.modules ?? []).slice(0, 3).map(m => (
                        <span key={m} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{m}</span>
                      ))}
                      {(sub.modules ?? []).length > 3 && (
                        <span className="text-xs text-slate-500">+{(sub.modules ?? []).length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {(sub.status === 'active' || sub.status === 'trial') && (
                        <button
                          onClick={() => { setSelectedSub(sub); setSuspendReason(''); setShowSuspendModal(true) }}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Suspender"
                        >
                          <PauseCircle size={16} />
                        </button>
                      )}
                      {(sub.status === 'suspended' || sub.status === 'expired') && (
                        <button
                          onClick={() => handleReactivate(sub)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Reactivar"
                        >
                          <PlayCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {subs.length === 0 && (
          <div className="text-center py-12 text-slate-500">No hay suscripciones</div>
        )}
      </div>

      {/* Modal nueva suscripción */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nueva suscripción">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empresa *</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.tenant_id}
              onChange={e => setForm(f => ({ ...f, tenant_id: +e.target.value }))}
            >
              <option value={0}>Selecciona empresa...</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan *</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.plan_id}
              onChange={e => setForm(f => ({ ...f, plan_id: +e.target.value }))}
            >
              <option value={0}>Selecciona plan...</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name} — S/ {p.price}/{p.billing_cycle === 'monthly' ? 'mes' : 'año'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duración (meses)</label>
            <input
              type="number" min={1} max={24}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.months}
              onChange={e => setForm(f => ({ ...f, months: +e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving ? 'Creando...' : 'Crear suscripción'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal suspender */}
      <Modal open={showSuspendModal} onClose={() => setShowSuspendModal(false)} title="Suspender suscripción">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Suspender esta suscripción desactivará el acceso del tenant al sistema.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo (opcional)</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowSuspendModal(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleSuspend} disabled={saving} className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors disabled:opacity-50">
              {saving ? 'Suspendiendo...' : 'Suspender'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
