import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/Modal'
import { equiposOrders, type OrderRow } from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { toDateInput } from './ordersCommon'

/** Edición rápida de guía, costo del flete y despacho programado (sin abrir el pedido; no pide PIN). */
export default function ShippingDataModal({ order, onClose, onSaved }: {
  order: OrderRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [guide, setGuide] = useState('')
  const [freight, setFreight] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!order) return
    setGuide(order.guide_number ?? '')
    setFreight(order.freight_cost ? String(order.freight_cost) : '')
    setDate(toDateInput(order.scheduled_dispatch_date))
    setError('')
  }, [order])

  const save = async () => {
    if (!order) return
    const cost = freight.trim() === '' ? 0 : Number(freight)
    if (!Number.isFinite(cost) || cost < 0) return setError('El costo del flete debe ser un monto válido (0 o más).')
    setSaving(true)
    setError('')
    try {
      const r = await equiposOrders.updateShippingData(order.id, { guide_number: guide.trim(), freight_cost: cost, scheduled_dispatch_date: date })
      r.warnings.forEach((w) => toast.warning(w, { duration: 8000 }))
      toast.success('Datos de envío guardados')
      onClose()
      onSaved()
    } catch (e) {
      setError(apiError(e, 'No se pudieron guardar los datos de envío'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={order != null} onClose={onClose} title="Datos de envío">
      {order && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Pedido N° <span className="font-semibold text-slate-800">{order.order_number}</span> · {order.customer_name}</p>
          <div>
            <label htmlFor="sd-guide" className={LABEL}>N° de guía</label>
            <input id="sd-guide" value={guide} maxLength={40} onChange={(e) => setGuide(e.target.value)} placeholder="Ej. T001-123456" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sd-freight" className={LABEL}>Costo del flete (S/)</label>
              <input id="sd-freight" type="number" inputMode="decimal" min={0} step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0.00" className={INPUT} />
            </div>
            <div>
              <label htmlFor="sd-date" className={LABEL}>Despacho programado</label>
              <input id="sd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
