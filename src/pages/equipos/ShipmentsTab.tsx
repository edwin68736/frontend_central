import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, PackageCheck, Printer, Search, Truck } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import SearchSelect from '@/components/ui/SearchSelect'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { equiposService, type EquipCarrier } from '@/services/equipos.service'
import { equiposOrders, SHIPMENT_STATUS_LABEL, type ShipmentRow } from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT } from './common'
import OrderDetail from './OrderDetail'
import { useConfirm } from './ConfirmProvider'
import { useDebounced, usePaging } from './hooks'
import { printLabelsFor } from './printLabels'
import OrderEditor from './OrderEditor'
import { AlertBadge, fmtDate, money, PaymentBadge, ValidationBadge } from './ordersCommon'

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
  const [carrierId, setCarrierId] = useState<number | null>(null)
  const confirm = useConfirm()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [printing, setPrinting] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 450)
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
      setRows(await equiposOrders.listShipments({ status: status || undefined, carrier_id: carrierId ?? undefined, q: dq.trim() || undefined }))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los envíos'))
    } finally {
      setLoading(false)
    }
  }, [status, carrierId, dq])

  useEffect(() => { void load() }, [load])
  const paging = usePaging(rows)

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

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allShown = paging.rows.length > 0 && paging.rows.every((r) => selected.has(r.order_id))
  const toggleShown = () => setSelected((s) => { const n = new Set(s); paging.rows.forEach((r) => (allShown ? n.delete(r.order_id) : n.add(r.order_id))); return n })
  const printSelected = async () => {
    setPrinting(true)
    try { if (await printLabelsFor([...selected])) { setSelected(new Set()); void load() } } catch (e) { toast.error(apiError(e, 'No se pudieron generar los rótulos')) } finally { setPrinting(false) }
  }
  const confirmRun = async (title: string, message: string, label: string, orderId: number, fn: () => Promise<{ warnings: string[] }>, ok: string) => {
    if (await confirm({ title, message, confirmLabel: label })) await run(orderId, fn, ok)
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
        <SearchSelect className="ml-auto w-56" ariaLabel="Transportista" value={carrierId} placeholder="Todos los transportistas" searchPlaceholder="Buscar transportista…" clearable
          options={carriers.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => setCarrierId(v ? Number(v) : null)} />
        <div className="relative w-56">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, N° o guía…" className={INPUT + ' pl-9'} />
        </div>
        {canShip && rows.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={allShown} onChange={toggleShown} className="rounded" /> Seleccionar página</label>
        )}
        {canShip && selected.size > 0 && (
          <button type="button" className={BTN_PRIMARY} disabled={printing} onClick={() => void printSelected()}><Printer size={15} /> {printing ? 'Generando…' : `Imprimir rótulos (${selected.size})`}</button>
        )}
      </div>

      {status === 'pendiente_envio' && !loading && (
        <p className="text-sm text-slate-500">{rows.length} por despachar · <span className="text-emerald-700 font-medium">{readyCount} listos</span> (validados) · {rows.length - readyCount} esperando validación o datos.</p>
      )}

      {loading && rows.length === 0 ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {paging.rows.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                {canShip && <input type="checkbox" aria-label={`Seleccionar pedido ${r.order_number}`} checked={selected.has(r.order_id)} onChange={() => toggle(r.order_id)} className="rounded mt-1" />}
                <button type="button" className="text-left flex-1" onClick={() => setDetailId(r.order_id)}>
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
                      title={r.ready_to_dispatch ? '' : 'Falta validar el pedido'} onClick={() => void confirmRun('Despachar pedido', `El pedido N° ${r.order_number} de ${r.customer_name} saldrá por ${r.carrier_name || 'el transportista'}.`, 'Despachar', r.order_id, () => equiposOrders.dispatch(r.order_id), 'Pedido despachado')}>
                      <Truck size={13} /> Despachar
                    </button>
                  )}
                  {r.status === 'en_transito' && (
                    <button type="button" className={BTN_PRIMARY + ' !py-1.5 !text-xs'} disabled={busy === r.order_id} onClick={() => void confirmRun('Registrar llegada', `El pedido N° ${r.order_number} llegó a la agencia; desde hoy corre el plazo de recojo.`, 'Registrar llegada', r.order_id, () => equiposOrders.arrived(r.order_id), 'Llegada registrada')}>Llegó a agencia</button>
                  )}
                  {(r.status === 'en_agencia' || r.status === 'en_transito') && (
                    <button type="button" className={BTN_SECONDARY} disabled={busy === r.order_id} onClick={() => void confirmRun('Cliente recogió', r.balance_amount > 0 ? `El cliente aún debe ${money(r.balance_amount)}. Se registrará el recojo igualmente.` : `${r.customer_name} recogió el pedido N° ${r.order_number}.`, 'Registrar recojo', r.order_id, () => equiposOrders.pickedUp(r.order_id), 'Recojo registrado')}>Cliente recogió</button>
                  )}
                  <button type="button" className={BTN_SECONDARY} onClick={() => setDetailId(r.order_id)}>Ver pedido</button>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="col-span-full text-center text-slate-400 py-12">No hay envíos en esta vista.</p>}
        </div>
      )}

      {rows.length > 0 && <PaginationBar {...paging.barProps} itemLabel="envíos" />}

      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} onEdit={(id) => { setDetailId(null); setEditId(id) }} />
      <OrderEditor open={editId != null} orderId={editId ?? undefined} onClose={() => setEditId(null)} onSaved={() => void load()} />
    </div>
  )
}
