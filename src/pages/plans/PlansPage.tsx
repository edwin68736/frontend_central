import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, CheckCircle2 } from 'lucide-react'
import { plansService, type SaasPlan, type SaasModule, type CreatePlanInput } from '../../services/plans.service'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  yearly: 'Anual',
  lifetime: 'Vitalicio',
}

export default function PlansPage() {
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [modules, setModules] = useState<SaasModule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SaasPlan | null>(null)
  const [form, setForm] = useState<CreatePlanInput>({
    name: '', description: '', price: 0, billing_cycle: 'monthly', modules: [],
    is_unlimited_documents: false, monthly_documents_limit: 50,
  })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, m] = await Promise.all([plansService.list(), plansService.listModules()])
      setPlans(p)
      setModules(m)
    } catch { toast.error('Error cargando datos') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', price: 0, billing_cycle: 'monthly', modules: [], is_unlimited_documents: false, monthly_documents_limit: 50 })
    setShowModal(true)
  }

  const openEdit = (plan: SaasPlan) => {
    setEditing(plan)
    setForm({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      billing_cycle: plan.billing_cycle,
      modules: plan.modules ?? [],
      is_unlimited_documents: plan.is_unlimited_documents ?? false,
      monthly_documents_limit: plan.monthly_documents_limit ?? 0,
    })
    setShowModal(true)
  }

  const toggleModule = (key: string) => {
    setForm(f => ({
      ...f,
      modules: f.modules.includes(key)
        ? f.modules.filter(k => k !== key)
        : [...f.modules, key],
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      if (editing) {
        await plansService.update(editing.id, form)
        toast.success('Plan actualizado')
      } else {
        await plansService.create(form)
        toast.success('Plan creado')
      }
      setShowModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error guardando plan')
    } finally { setSaving(false) }
  }

  const handleToggle = async (plan: SaasPlan) => {
    try {
      await plansService.toggle(plan.id)
      toast.success(plan.active ? 'Plan desactivado' : 'Plan activado')
      load()
    } catch { toast.error('Error cambiando estado') }
  }

  const handleDelete = async (plan: SaasPlan) => {
    if (!confirm(`¿Eliminar plan "${plan.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await plansService.delete(plan.id)
      toast.success('Plan eliminado')
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se puede eliminar el plan')
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Planes</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona los planes de suscripción disponibles</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nuevo plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map(plan => (
          <div key={plan.id} className={`bg-gray-800 border rounded-xl p-5 flex flex-col gap-4 transition-opacity ${plan.active ? 'border-gray-700' : 'border-gray-700 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-white">{plan.name}</span>
                  {!plan.active && <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-400 rounded-full">Inactivo</span>}
                </div>
                <p className="text-sm text-gray-400 mt-1">{plan.description || 'Sin descripción'}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-indigo-400">
                  {plan.price === 0 ? 'Gratis' : `S/ ${plan.price.toFixed(2)}`}
                </div>
                <div className="text-xs text-gray-500">{CYCLE_LABELS[plan.billing_cycle] ?? plan.billing_cycle}</div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Docs electrónicos:{' '}
              {plan.is_unlimited_documents ? 'Ilimitados' : `${plan.monthly_documents_limit ?? 0} / mes`}
            </p>

            <div className="flex flex-wrap gap-1">
              {(plan.modules ?? []).map(k => (
                <span key={k} className="text-xs px-2 py-0.5 bg-indigo-900/50 text-indigo-300 rounded-full border border-indigo-700/50">
                  {k}
                </span>
              ))}
              {(plan.modules ?? []).length === 0 && (
                <span className="text-xs text-gray-600">Sin módulos asignados</span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
              <button onClick={() => openEdit(plan)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => handleToggle(plan)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                {plan.active ? <ToggleLeft size={12} /> : <ToggleRight size={12} />}
                {plan.active ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => handleDelete(plan)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-lg transition-colors ml-auto">
                <Trash2 size={12} /> Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {plans.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <p className="text-lg font-medium text-slate-700">No hay planes registrados</p>
          <p className="text-sm mt-1 text-slate-500">Crea el primer plan para comenzar</p>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar plan' : 'Nuevo plan'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Plan Pro"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Precio (S/)</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ciclo de facturación</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={form.billing_cycle}
                onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))}
              >
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
                <option value="lifetime">Vitalicio</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_unlimited_documents ?? false}
                onChange={e => setForm(f => ({ ...f, is_unlimited_documents: e.target.checked }))}
              />
              Documentos electrónicos ilimitados
            </label>
            {!form.is_unlimited_documents && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Límite mensual de documentos
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={form.monthly_documents_limit ?? 0}
                  onChange={e => setForm(f => ({ ...f, monthly_documents_limit: parseInt(e.target.value, 10) || 0 }))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Se renueva cada mes, aunque el cliente pague varios meses por adelantado.
                  Un plan semestral con 200 da 200 documentos en cada uno de los 6 meses.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Módulos incluidos</label>
            <div className="grid grid-cols-2 gap-2">
              {modules.filter(m => m.active).map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleModule(m.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    form.modules.includes(m.key)
                      ? 'bg-indigo-100 border-indigo-400 text-indigo-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <CheckCircle2 size={14} className={form.modules.includes(m.key) ? 'text-indigo-600' : 'text-slate-400'} />
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear plan')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
