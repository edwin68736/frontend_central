import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Truck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { equiposService, type EquipCarrier, type EquipCarrierInput } from '@/services/equipos.service'
import { useConfirm } from './ConfirmProvider'
import { ActiveBadge, apiError, BTN_PRIMARY, BTN_SECONDARY, DAYS, formatDays, INPUT, LABEL } from './common'

const EMPTY: EquipCarrierInput = {
  code: '', name: '', dispatch_days: '', pickup_days: 15, guide_label: 'N° de guía', guide_format: '',
  tracking_url_template: '', label_template: '', is_default: false, active: true, sort_order: 0,
}

export default function CarriersTab() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('equipos.carriers')
  const [rows, setRows] = useState<EquipCarrier[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ open: boolean; id?: number; data: EquipCarrierInput }>({ open: false, data: EMPTY })
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await equiposService.listCarriers(true))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los transportistas'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = (c?: EquipCarrier) =>
    setForm({
      open: true,
      id: c?.id,
      data: c ? { code: c.code, name: c.name, dispatch_days: c.dispatch_days, pickup_days: c.pickup_days, guide_label: c.guide_label, guide_format: c.guide_format, tracking_url_template: c.tracking_url_template, label_template: c.label_template, is_default: c.is_default, active: c.active, sort_order: c.sort_order } : EMPTY,
    })

  const selectedDays = new Set(form.data.dispatch_days.split(',').map((d) => d.trim()).filter(Boolean))
  // Se calcula sobre el estado más reciente (no sobre el render anterior) para que dos clics seguidos no se pisen.
  const toggleDay = (value: number) =>
    setForm((f) => {
      const next = new Set(f.data.dispatch_days.split(',').map((d) => d.trim()).filter(Boolean))
      const k = String(value)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return { ...f, data: { ...f.data, dispatch_days: [...next].sort().join(',') } }
    })

  const save = async () => {
    const d = form.data
    if (!d.code.trim() || !d.name.trim()) return toast.error('Código y nombre son obligatorios')
    if (!(await confirm({ title: form.id ? 'Guardar cambios del transportista' : 'Crear transportista', message: `${d.name.trim()} · plazo de recojo ${d.pickup_days} días`, confirmLabel: 'Guardar' }))) return
    setSaving(true)
    try {
      if (form.id) await equiposService.updateCarrier(form.id, d)
      else await equiposService.createCarrier(d)
      toast.success('Transportista guardado')
      setForm((f) => ({ ...f, open: false }))
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el transportista'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 max-w-2xl">
          Cada transportista tiene sus propios días de despacho, plazo para que el cliente recoja y formato de guía. El plazo de recojo marca cuándo vence un paquete en agencia.
        </p>
        {canEdit && <button type="button" className={BTN_PRIMARY} onClick={() => open()}><Plus size={16} /> Nuevo transportista</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Truck size={18} /></span>
                <div>
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.code}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ActiveBadge active={c.active} />
                {c.is_default && <span className="text-[11px] font-medium text-indigo-600">Por defecto</span>}
              </div>
            </div>
            <dl className="mt-3 text-sm space-y-1 text-slate-600">
              <div className="flex justify-between"><dt className="text-slate-400">Despacha</dt><dd>{formatDays(c.dispatch_days)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Plazo de recojo</dt><dd>{c.pickup_days} días</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Guía</dt><dd>{c.guide_label}{c.guide_format && <span className="text-xs text-slate-400"> · valida formato</span>}</dd></div>
            </dl>
            {canEdit && <div className="mt-3 text-right"><button type="button" className={BTN_SECONDARY} onClick={() => open(c)}><Pencil size={12} /> Editar</button></div>}
          </div>
        ))}
        {rows.length === 0 && <p className="col-span-full text-center text-slate-400 py-10">Aún no hay transportistas. Se crea «Shalom» al importar el Excel, o agrégalos aquí.</p>}
      </div>

      <Modal open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} title={form.id ? 'Editar transportista' : 'Nuevo transportista'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Nombre *</label><input value={form.data.name} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, name: e.target.value } }))} placeholder="Olva Courier" className={INPUT} /></div>
            <div><label className={LABEL}>Código *</label><input value={form.data.code} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, code: e.target.value.toLowerCase() } }))} placeholder="olva" className={INPUT} /></div>
          </div>
          <div>
            <label className={LABEL}>Días de despacho</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button
                  key={d.value} type="button" onClick={() => toggleDay(d.value)} aria-pressed={selectedDays.has(String(d.value))}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedDays.has(String(d.value)) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">Si la fecha de despacho de un pedido cae en otro día, solo se avisa (no se bloquea).</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Plazo de recojo (días)</label><input type="number" min={1} max={90} value={form.data.pickup_days} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, pickup_days: Number(e.target.value) } }))} className={INPUT} /></div>
            <div><label className={LABEL}>Nombre del N° de guía</label><input value={form.data.guide_label} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, guide_label: e.target.value } }))} className={INPUT} /></div>
          </div>
          <div><label className={LABEL}>Formato de guía (expresión regular, opcional)</label><input value={form.data.guide_format} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, guide_format: e.target.value } }))} placeholder="^\d{8}$" className={INPUT + ' font-mono'} /></div>
          <div><label className={LABEL}>Enlace de seguimiento (opcional)</label><input value={form.data.tracking_url_template} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, tracking_url_template: e.target.value } }))} placeholder="https://…/{guia}" className={INPUT} /></div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.data.is_default} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, is_default: e.target.checked } }))} className="rounded" /> Transportista por defecto</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.data.active} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, active: e.target.checked } }))} className="rounded" /> Activo</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setForm((f) => ({ ...f, open: false }))}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
