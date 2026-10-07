import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, PackageCheck, Search, Truck } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { equiposService, type EquipCarrier } from '@/services/equipos.service'
import { equiposOrders, SHIPMENT_STATUS_LABEL, type ShipmentRow } from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT } from './common'
import OrderDetail from './OrderDetail'
import OrderEditor from './OrderEditor'
import { AlertBadge, fmtDate, money, PaymentBadge, SELECT, ValidationBadge } from './ordersCommon'

const FILTERS = [
  { key: 'pendiente_envio', label: 'Por despachar' },
  { key: 'en_transito', label: 'En tránsito' },
  { key: 'en_agencia', label: 'En agencia' },
  { key: 'entregado', label: 'Recogidos' },
  { key: '', label: 'Abiertos' },
]

/** Tablero de envíos: la cola «por despachar» con la lista de empaque, lo que viaja y lo que espera en agencia. */
export default function ShipmentsTab() {
  const { hasPermission } = useAuth()
  const canShip = hasPermission('equipos.shipments')
  const canSeeMoney = hasPermission('equipos.payments_view')
  const [status, setStatus] = useState('pendiente_envio')
  const [carrierId, setCarrierId] = useState('')
  const [q, setQ] = useState('')
  const [carriers, setCarriers] = useState<EquipCarrier[]>([])
  const [rows, setRows] = useState<ShipmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => { equiposService.listCarriers(false).then(setCarriers).catch(() => undefined) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await equiposOrders.listShipments({ status: status || undefined, carrier_id: carrierId ? Number(carrierId) : undefined, q: q.trim() || undefined }))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los envíos'))
    } finally {
      setLoading(false)
    }
  }, [status, carrierId, q])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  const run = async (orderId: number, fn: () => Promise<{ warnings: string[] }>, ok: string) => {
    setBusy(orderId)
    try {
      const r = await fn()
      r.warnings.forEach((w) => toast.warning(w, { duration: 8000 }))
      toast.success(ok)
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo completar la acción'))
    } finally {
      setBusy(null)
    }
  }

  const readyCount = rows.filter((r) => r.ready_to_dispatch).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setStatus(f.key)} aria-pressed={status === f.key}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${status === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
        <select aria-label="Transportista" value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className={SELECT + ' ml-auto'}>
          <option value="">Todos los transportistas</option>
          {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="relative w-56">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, N° o guía…" className={INPUT + ' pl-9'} />
        </div>
      </div>

      {status === 'pendiente_envio' && !loading && (
        <p className="text-sm text-slate-500">{rows.length} por despachar · <span className="text-emerald-700 font-medium">{readyCount} listos</span> (validados) · {rows.length - readyCount} esperando validación o datos.</p>
      )}

      {loading && rows.length === 0 ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="text-left" onClick={() => setDetailId(r.order_id)}>
                  <p className="font-semibold text-slate-800">N° {r.order_number} · {r.customer_name}</p>
                  <p className="text-xs text-slate-500">{r.customer_phone && `Cel. ${r.customer_phone} · `}{[r.destination_province, r.destination_department].filter(Boolean).join(', ') || 'Sin destino'}</p>
                </button>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-slate-500">{SHIPMENT_STATUS_LABEL[r.status]}</span>
                  <AlertBadge alert={r.alert} since={r.days_since_arrival} left={r.days_left} />
                </div>
              </div>
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Truck size={14} className="text-slate-400" /> {r.carrier_name || 'Sin transportista'}
                {r.guide_number ? <> · {r.guide_label || 'Guía'} <span className="font-medium text-slate-800">{r.guide_number}</span></> : <span className="text-amber-700"> · sin guía</span>}
                {r.tracking_url && <a href={r.tracking_url} target="_blank" rel="noreferrer" className="text-indigo-600"><ExternalLink size={12} /></a>}
              </p>
              {r.status === 'pendiente_envio' && (r.packing ?? []).length > 0 && (
                <p className="text-sm bg-slate-50 rounded-lg px-3 py-1.5 text-slate-700 flex items-center gap-2">
                  <PackageCheck size={15} className="text-slate-400 shrink-0" /> {(r.packing ?? []).map((p) => `${p.quantity} × ${p.code}`).join('  ·  ')}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <ValidationBadge value={r.validation_status} />
                {canSeeMoney && <PaymentBadge value={r.payment_status} />}
                {canSeeMoney && r.balance_amount > 0 && <span className="text-red-700 font-medium">Saldo {money(r.balance_amount)}</span>}
                {r.status === 'pendiente_envio' && <span className="text-slate-500">Programado {fmtDate(r.scheduled_dispatch_date)}</span>}
                {r.pickup_deadline && r.status === 'en_agencia' && <span className="text-slate-500">Vence {fmtDate(r.pickup_deadline)}</span>}
              </div>
              {r.dispatch_day_notice && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> {r.dispatch_day_notice}</p>}
              {canShip && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.status === 'pendiente_envio' && (
                    <button type="button" className={BTN_PRIMARY + ' !py-1.5 !text-xs'} disabled={busy === r.order_id || !r.ready_to_dispatch}
                      title={r.ready_to_dispatch ? '' : 'Falta validar el pedido'} onClick={() => void run(r.order_id, () => equiposOrders.dispatch(r.order_id), 'Pedido despachado')}>
                      <Truck size={13} /> Despachar
                    </button>
                  )}
                  {r.status === 'en_transito' && (
                    <button type="button" className={BTN_PRIMARY + ' !py-1.5 !text-xs'} disabled={busy === r.order_id} onClick={() => void run(r.order_id, () => equiposOrders.arrived(r.order_id), 'Llegada registrada')}>Llegó a agencia</button>
                  )}
                  {(r.status === 'en_agencia' || r.status === 'en_transito') && (
                    <button type="button" className={BTN_SECONDARY} disabled={busy === r.order_id} onClick={() => void run(r.order_id, () => equiposOrders.pickedUp(r.order_id), 'Recojo registrado')}>Cliente recogió</button>
                  )}
                  <button type="button" className={BTN_SECONDARY} onClick={() => setDetailId(r.order_id)}>Ver pedido</button>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="col-span-full text-center text-slate-400 py-12">No hay envíos en esta vista.</p>}
        </div>
      )}

      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} onEdit={(id) => { setDetailId(null); setEditId(id) }} />
      <OrderEditor open={editId != null} orderId={editId ?? undefined} onClose={() => setEditId(null)} onSaved={() => void load()} />
    </div>
  )
}
