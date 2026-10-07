import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Printer, Search } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { PerPageOption } from '@/services/pagination'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposOrders, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, VALIDATION_LABEL, type OrderFilter, type OrderListResult,
} from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, INPUT } from './common'
import OrderDetail from './OrderDetail'
import { useDebounced } from './hooks'
import { printLabelsFor } from './printLabels'
import OrderEditor from './OrderEditor'
import { fmtDate, money, PaymentBadge, SELECT, ShipmentBadge, StatusBadge, ValidationBadge } from './ordersCommon'

export default function OrdersTab() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('equipos.create')
  const canSeeMoney = hasPermission('equipos.payments_view')
  const [filter, setFilter] = useState<OrderFilter>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [printing, setPrinting] = useState(false)
  const dq = useDebounced(q, 450)
  const canShip = hasPermission('equipos.shipments')
  const [data, setData] = useState<OrderListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editor, setEditor] = useState<{ open: boolean; id?: number }>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await equiposOrders.listOrders({ ...filter, q: dq.trim() || undefined, page, per_page: perPage }))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los pedidos'))
    } finally {
      setLoading(false)
    }
  }, [filter, dq, page, perPage])

  useEffect(() => { void load() }, [load])

  const setF = (patch: Partial<OrderFilter>) => { setPage(1); setFilter((f) => ({ ...f, ...patch })) }
  const pages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1
  const pageIds = (data?.rows ?? []).filter((r) => r.status === 'registrado').map((r) => r.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const togglePage = () => setSelected((s) => { const n = new Set(s); if (allOnPage) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id)); return n })
  const printSelected = async () => {
    setPrinting(true)
    try { if (await printLabelsFor([...selected])) setSelected(new Set()) } catch (e) { toast.error(apiError(e, 'No se pudieron generar los rótulos')) } finally { setPrinting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-52">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value) }} placeholder="Buscar por cliente, documento, N° de pedido o guía…" className={INPUT + ' pl-9'} />
        </div>
        <select aria-label="Estado del pedido" value={filter.status ?? ''} onChange={(e) => setF({ status: e.target.value || undefined })} className={SELECT}>
          <option value="">Todos los estados</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Validación" value={filter.validation_status ?? ''} onChange={(e) => setF({ validation_status: e.target.value || undefined })} className={SELECT}>
          <option value="">Toda validación</option>
          {Object.entries(VALIDATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Pago" value={filter.payment_status ?? ''} onChange={(e) => setF({ payment_status: e.target.value || undefined })} className={SELECT}>
          <option value="">Todo pago</option>
          {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Envío" value={filter.shipment_status ?? ''} onChange={(e) => setF({ shipment_status: e.target.value || undefined })} className={SELECT}>
          <option value="">Todo envío</option>
          {Object.entries(SHIPMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" aria-label="Desde" value={filter.from ?? ''} onChange={(e) => setF({ from: e.target.value || undefined })} className={SELECT} />
        <input type="date" aria-label="Hasta" value={filter.to ?? ''} onChange={(e) => setF({ to: e.target.value || undefined })} className={SELECT} />
        {canShip && selected.size > 0 && <button type="button" className={BTN_PRIMARY} disabled={printing} onClick={() => void printSelected()}><Printer size={16} /> {printing ? 'Generando…' : `Imprimir rótulos (${selected.size})`}</button>}
        {canCreate && <button type="button" className={BTN_PRIMARY} onClick={() => setEditor({ open: true })}><Plus size={16} /> Nuevo pedido</button>}
      </div>

      <div className="flex gap-2">
        {[{ k: 'pendiente_validacion', l: 'Por validar' }, { k: 'observado', l: 'Observados' }].map((c) => (
          <button key={c.k} type="button" aria-pressed={filter.validation_status === c.k} onClick={() => setF({ validation_status: filter.validation_status === c.k ? undefined : c.k, status: filter.validation_status === c.k ? undefined : 'registrado' })}
            className={`px-3 py-1 rounded-full text-xs border ${filter.validation_status === c.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{c.l}</button>
        ))}
      </div>

      {data && canSeeMoney && (
        <p className="text-sm text-slate-500">
          {data.total} pedidos · Vendido <span className="font-semibold text-slate-700">{money(data.sum_total)}</span> · Por cobrar <span className="font-semibold text-red-700">{money(data.sum_balance)}</span>
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                {canShip && <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="Seleccionar la página" checked={allOnPage} onChange={togglePage} className="rounded" /></th>}<th className="px-3 py-2">N°</th><th className="px-3">Fecha</th><th className="px-3">Cliente</th><th className="px-3">Detalle</th>
                {canSeeMoney && <th className="px-3 text-right">Total</th>}{canSeeMoney && <th className="px-3 text-right">Saldo</th>}
                <th className="px-3">Estado</th><th className="px-3">Pago</th><th className="px-3">Envío</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} className={`cursor-pointer hover:bg-slate-50 ${r.status === 'anulado' ? 'opacity-50' : ''}`}>
                  {canShip && <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>{r.status === 'registrado' && <input type="checkbox" aria-label={`Seleccionar pedido ${r.order_number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="rounded" />}</td>}
                  <td className="px-3 py-2 font-semibold text-slate-800">{r.order_number}</td>
                  <td className="px-3 whitespace-nowrap text-slate-600">{fmtDate(r.order_date)}</td>
                  <td className="px-3"><span className="text-slate-800">{r.customer_name}</span><span className="block text-xs text-slate-400">{r.customer_doc_type} {r.customer_doc_number}{r.department ? ` · ${r.department}` : ''}</span></td>
                  <td className="px-3 text-slate-600 max-w-xs truncate" title={r.summary}>{r.summary}{r.is_gift && <span className="ml-1 text-xs text-emerald-700">(obsequio)</span>}</td>
                  {canSeeMoney && <td className="px-3 text-right whitespace-nowrap">{money(r.total_amount)}</td>}
                  {canSeeMoney && <td className={`px-3 text-right whitespace-nowrap ${r.balance_amount > 0 ? 'text-red-700 font-medium' : 'text-slate-400'}`}>{money(r.balance_amount)}</td>}
                  <td className="px-3"><div className="flex flex-col gap-1 items-start"><StatusBadge value={r.status} />{r.status === 'registrado' && <ValidationBadge value={r.validation_status} />}</div></td>
                  <td className="px-3"><PaymentBadge value={r.payment_status} /></td>
                  <td className="px-3"><ShipmentBadge value={r.shipment_status} />{r.carrier_name && <span className="block text-xs text-slate-400">{r.carrier_name}{r.guide_number ? ` · ${r.guide_number}` : ''}</span>}</td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={10} className="text-center text-slate-400 py-12">No hay pedidos con esos filtros.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && <PaginationBar page={page} perPage={perPage} total={data.total} totalPages={pages} onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1) }} itemLabel="pedidos" />}

      <OrderDetail
        orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()}
        onEdit={(id) => { setDetailId(null); setEditor({ open: true, id }) }}
      />
      <OrderEditor
        open={editor.open} orderId={editor.id} onClose={() => setEditor({ open: false })}
        onSaved={(o) => { void load(); setDetailId(o.id) }}
      />
    </div>
  )
}
