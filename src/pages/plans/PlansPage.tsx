import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, CheckCircle2, Blocks } from 'lucide-react'
import {
  plansService,
  moduleRequires,
  type SaasPlan,
  type SaasModule,
  type CreatePlanInput,
  type ModuleInput,
  type PlanCycleInput,
  type DiscountType,
} from '../../services/plans.service'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  yearly: 'Anual',
  lifetime: 'Vitalicio',
}

/** Ciclos fijos que puede elegir un tenant al renovar por autoservicio — ver backend
 *  saas.FixedPlanCycleMonths. Deliberadamente fijo acá también, no se agregan ni quitan. */
const FIXED_CYCLE_MONTHS = [1, 3, 6, 12]

function emptyCycles(): PlanCycleInput[] {
  return FIXED_CYCLE_MONTHS.map(months => ({ months, discount_type: '', discount_value: 0, enabled: true }))
}

/** Bruto/neto en vivo mientras el admin edita — el backend recalcula igual al guardar
 *  (pricing.ComputeCycleAmounts), esto es solo para que vea el resultado sin tener que guardar. */
function previewCycleAmounts(price: number, months: number, discountType: DiscountType, discountValue: number) {
  const gross = +(price * months).toFixed(2)
  let discount = 0
  if (discountType === 'percent' && discountValue > 0) discount = Math.min(gross, (gross * discountValue) / 100)
  else if (discountType === 'fixed' && discountValue > 0) discount = Math.min(gross, discountValue)
  return { gross, net: Math.max(0, +(gross - discount).toFixed(2)) }
}

export default function PlansPage() {
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [modules, setModules] = useState<SaasModule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<SaasPlan | null>(null)
  const emptyForm: CreatePlanInput = {
    name: '', description: '', price: 0, billing_cycle: 'monthly', modules: [],
    is_unlimited_documents: false, monthly_documents_limit: 50,
    max_users: 0, max_branches: 0, max_products: 0,
    cycles: emptyCycles(),
  }
  const [form, setForm] = useState<CreatePlanInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Gestor del catálogo de módulos (CRUD).
  const emptyModuleForm: ModuleInput = { key: '', name: '', description: '', icon: '', category: 'core', sort_order: 0 }
  const [showModulesMgr, setShowModulesMgr] = useState(false)
  const [editingModule, setEditingModule] = useState<SaasModule | null>(null)
  const [moduleForm, setModuleForm] = useState<ModuleInput>(emptyModuleForm)
  const [savingModule, setSavingModule] = useState(false)

  const openModuleCreate = () => { setEditingModule(null); setModuleForm(emptyModuleForm) }
  const openModuleEdit = (m: SaasModule) => {
    setEditingModule(m)
    setModuleForm({ key: m.key, name: m.name, description: m.description, icon: m.icon, category: m.category, sort_order: m.sort_order })
  }
  const saveModule = async () => {
    if (!moduleForm.name.trim() || (!editingModule && !moduleForm.key.trim())) {
      toast.error('Key y nombre son requeridos'); return
    }
    setSavingModule(true)
    try {
      if (editingModule) {
        await plansService.updateModule(editingModule.id, moduleForm)
        toast.success('Módulo actualizado')
      } else {
        await plansService.createModule(moduleForm)
        toast.success('Módulo creado')
      }
      setEditingModule(null); setModuleForm(emptyModuleForm)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error guardando módulo')
    } finally { setSavingModule(false) }
  }
  const toggleModuleActive = async (m: SaasModule) => {
    try { await plansService.toggleModule(m.id); load() }
    catch { toast.error('Error cambiando estado') }
  }
  const deleteModuleItem = async (m: SaasModule) => {
    if (!confirm(`¿Eliminar módulo "${m.name}"?`)) return
    try { await plansService.deleteModule(m.id); toast.success('Módulo eliminado'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'No se puede eliminar') }
  }

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
    setForm(emptyForm)
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
      max_users: plan.max_users ?? 0,
      max_branches: plan.max_branches ?? 0,
      max_products: plan.max_products ?? 0,
      cycles: FIXED_CYCLE_MONTHS.map(months => {
        const existing = (plan.cycles ?? []).find(c => c.months === months)
        return existing
          ? { months, discount_type: existing.discount_type, discount_value: existing.discount_value, enabled: existing.enabled }
          : { months, discount_type: '', discount_value: 0, enabled: true }
      }),
    })
    setShowModal(true)
  }

  // Al activar un módulo se incluyen también sus dependencias (el backend igual las expande al
  // guardar; aquí es solo para que el superadmin las vea marcadas). Al desactivar solo se quita él.
  const toggleModule = (key: string) => {
    setForm(f => {
      if (f.modules.includes(key)) {
        return { ...f, modules: f.modules.filter(k => k !== key) }
      }
      const mod = modules.find(m => m.key === key)
      const deps = mod ? moduleRequires(mod) : []
      const toAdd = [key, ...deps].filter(k => !f.modules.includes(k))
      return { ...f, modules: [...f.modules, ...toAdd] }
    })
  }

  const updateCycle = (months: number, patch: Partial<PlanCycleInput>) => {
    setForm(f => ({
      ...f,
      cycles: f.cycles.map(c => (c.months === months ? { ...c, ...patch } : c)),
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowModulesMgr(true); openModuleCreate() }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Blocks size={16} /> Catálogo de módulos
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nuevo plan
          </button>
        </div>
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
            <p className="text-xs text-gray-400">
              Límites — Usuarios: {plan.max_users ? plan.max_users : '∞'} · Sucursales: {plan.max_branches ? plan.max_branches : '∞'} · Productos: {plan.max_products ? plan.max_products : '∞'}
            </p>

            {plan.billing_cycle !== 'lifetime' && (plan.cycles ?? []).some(c => c.enabled) && (
              <div className="flex flex-wrap gap-1.5">
                {(plan.cycles ?? []).filter(c => c.enabled).map(c => (
                  <span key={c.months} className="text-[10px] px-2 py-0.5 bg-emerald-900/30 text-emerald-300 rounded-full border border-emerald-700/40">
                    {c.months}m: S/ {c.net_amount.toFixed(2)}
                    {c.net_amount !== c.gross_amount && <span className="line-through opacity-60 ml-1">S/ {c.gross_amount.toFixed(2)}</span>}
                  </span>
                ))}
              </div>
            )}

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

          {form.billing_cycle !== 'lifetime' && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Descuento por ciclo</label>
                <p className="text-xs text-slate-500 mt-0.5">
                  El tenant elige uno de estos 4 ciclos al renovar por autoservicio (Tukifac/Tukichef). Sin
                  descuento, ese ciclo cobra precio pleno (precio × meses).
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {form.cycles.map(c => {
                  const { gross, net } = previewCycleAmounts(form.price, c.months, c.discount_type, c.discount_value)
                  return (
                    <div key={c.months} className={`rounded-lg border p-2.5 space-y-2 ${c.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={c.enabled}
                            onChange={e => updateCycle(c.months, { enabled: e.target.checked })}
                          />
                          {c.months} {c.months === 1 ? 'mes' : 'meses'}
                        </label>
                        <span className="text-xs text-slate-500">
                          {net === gross ? `S/ ${gross.toFixed(2)}` : (
                            <>
                              <span className="line-through text-slate-400">S/ {gross.toFixed(2)}</span>{' '}
                              <span className="font-semibold text-emerald-700">S/ {net.toFixed(2)}</span>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                          value={c.discount_type}
                          onChange={e => updateCycle(c.months, { discount_type: e.target.value as DiscountType, discount_value: e.target.value ? c.discount_value : 0 })}
                        >
                          <option value="">Sin descuento</option>
                          <option value="percent">% Porcentaje</option>
                          <option value="fixed">S/ Monto fijo</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          step={c.discount_type === 'percent' ? 1 : 0.01}
                          disabled={!c.discount_type}
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-slate-100"
                          value={c.discount_value}
                          onChange={e => updateCycle(c.months, { discount_value: parseFloat(e.target.value) || 0 })}
                          placeholder={c.discount_type === 'percent' ? '% ej. 15' : 'S/ ej. 10'}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">Límites del plan</label>
            <p className="text-xs text-slate-500 mb-2">0 = ilimitado. Al superar un tope, el tenant ve un aviso para mejorar su plan (no se borra nada).</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Usuarios</label>
                <input type="number" min={0}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  value={form.max_users ?? 0}
                  onChange={e => setForm(f => ({ ...f, max_users: parseInt(e.target.value, 10) || 0 }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Sucursales</label>
                <input type="number" min={0}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  value={form.max_branches ?? 0}
                  onChange={e => setForm(f => ({ ...f, max_branches: parseInt(e.target.value, 10) || 0 }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Productos</label>
                <input type="number" min={0}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                  value={form.max_products ?? 0}
                  onChange={e => setForm(f => ({ ...f, max_products: parseInt(e.target.value, 10) || 0 }))} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Módulos incluidos</label>
            <p className="text-xs text-slate-500 mb-2">Al elegir un módulo se incluyen sus dependencias. Los "Próximamente" aún no están implementados pero puedes pre-asignarlos.</p>
            <div className="grid grid-cols-2 gap-2">
              {modules.filter(m => m.active).map(m => {
                const selected = form.modules.includes(m.key)
                const deps = moduleRequires(m)
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleModule(m.key)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-sm border text-left transition-colors ${
                      selected
                        ? 'bg-indigo-100 border-indigo-400 text-indigo-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className={selected ? 'text-indigo-600' : 'text-slate-400'} />
                      {m.name}
                      {!m.implemented && (
                        <span className="text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-slate-200 text-slate-500">Próximamente</span>
                      )}
                    </span>
                    {deps.length > 0 && (
                      <span className="text-[10px] text-slate-400 ml-6">incluye: {deps.join(', ')}</span>
                    )}
                  </button>
                )
              })}
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

      <Modal open={showModulesMgr} onClose={() => setShowModulesMgr(false)} title="Catálogo de módulos">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Los módulos "Próximamente" no están implementados en código: no se muestran al tenant, pero puedes
            pre-asignarlos a un plan. El estado <em>implementado</em> y las dependencias los define el sistema.
          </p>

          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-700">{editingModule ? `Editar: ${editingModule.name}` : 'Nuevo módulo'}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-100"
                placeholder="key (ej. crm)"
                value={moduleForm.key}
                disabled={!!editingModule}
                onChange={e => setModuleForm(f => ({ ...f, key: e.target.value }))}
              />
              <input
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                placeholder="Nombre"
                value={moduleForm.name}
                onChange={e => setModuleForm(f => ({ ...f, name: e.target.value }))}
              />
              <input
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                placeholder="Categoría (core/vertical/avanzado)"
                value={moduleForm.category}
                onChange={e => setModuleForm(f => ({ ...f, category: e.target.value }))}
              />
              <input
                type="number"
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                placeholder="Orden"
                value={moduleForm.sort_order}
                onChange={e => setModuleForm(f => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
              />
            </div>
            <input
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              placeholder="Descripción"
              value={moduleForm.description}
              onChange={e => setModuleForm(f => ({ ...f, description: e.target.value }))}
            />
            <div className="flex gap-2">
              {editingModule && (
                <button type="button" onClick={openModuleCreate} className="text-xs px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                  Cancelar edición
                </button>
              )}
              <button type="button" onClick={saveModule} disabled={savingModule} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 ml-auto">
                {savingModule ? 'Guardando…' : (editingModule ? 'Actualizar módulo' : 'Crear módulo')}
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {modules.map(m => (
              <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    {m.name}
                    {!m.implemented && <span className="text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-slate-200 text-slate-500">Próximamente</span>}
                    {!m.active && <span className="text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-red-100 text-red-500">Inactivo</span>}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{m.key}{m.requires ? ` · req: ${m.requires}` : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => openModuleEdit(m)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg" title="Editar"><Pencil size={13} /></button>
                  <button onClick={() => toggleModuleActive(m)} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg" title={m.active ? 'Desactivar' : 'Activar'}>{m.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}</button>
                  <button onClick={() => deleteModuleItem(m)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
