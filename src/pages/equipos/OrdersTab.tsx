import { useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, Eye, MoreVertical, Pencil, Plus, Printer, Search } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { PerPageOption } from '@/services/pagination'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposOrders, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, type OrderFilter, type OrderListResult, type OrderRow,
} from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, INPUT } from './common'
import OrderDetail from './OrderDetail'
import { useDebounced } from './hooks'
import { printLabelsFor } from './printLabels'
import OrderEditor from './OrderEditor'
import ShippingDataModal from './ShippingDataModal'
import PaymentModal from './PaymentModal'
import { fmtDate, money, PaymentBadge, SELECT, ShipmentBadge, UserBadge } from './ordersCommon'

/** Menú de tres puntos de una fila: abre un panel fijo junto al botón (la tabla tiene scroll horizontal y recortaría uno absoluto). */
function RowMenu({ label, items }: { label: string; items: { key: string; label: string; icon: React.ReactNode; onClick: () => void }[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); window.removeEventListener('keydown', onKey) }
  }, [pos])
  return (
    <>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={pos !== null}
        onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setPos(pos ? null : { top: b.bottom + 4, right: window.innerWidth - b.right }) }}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <MoreVertical size={16} />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div role="menu" style={{ top: pos.top, right: pos.right }} className="fixed z-50 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {items.map((it) => (
              <button key={it.key} type="button" role="menuitem" onClick={() => { setPos(null); it.onClick() }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">{it.icon}{it.label}</button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export default function OrdersTab() {
  const { hasPermission, user } = useAuth()
  const isSuper = (user?.role ?? '').toLowerCase() === 'superadmin'
  const canCreate = hasPermission('equipos.create')
  const canUpdate = hasPermission('equipos.update')
  const canPay = hasPermission('equipos.payments')
  const canSeeMoney = hasPermission('equipos.payments_view')
  const [filter, setFilter] = useState<OrderFilter>({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [printing, setPrinting] = useState(false)
  const dq = useDebounced(q, 450)
  const canShip = hasPermission('equipos.shipments')
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  const [assignable, setAssignable] = useState<{ id: number; name: string }[]>([])
  const [usersTick, setUsersTick] = useState(0)
  const [assigning, setAssigning] = useState<number | null>(null)
  const [data, setData] = useState<OrderListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<number | null>(null)
  // Enlace desde la campana de envíos: /equipos?tab=pedidos&order=ID abre el detalle de ese pedido.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const id = Number(params.get('order'))
    if (id > 0) {
      setDetailId(id)
      const next = new URLSearchParams(params)
      next.delete('order')
      setParams(next, { replace: true })
    }
  }, [params, setParams])
  const [editor, setEditor] = useState<{ open: boolean; id?: number }>({ open: false })
  const [shipEdit, setShipEdit] = useState<OrderRow | null>(null)
  const [payFor, setPayFor] = useState<OrderRow | null>(null)

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
  useEffect(() => { equiposOrders.listOrderUsers().then(setUsers).catch(() => setUsers([])) }, [data?.total, usersTick])
  // Solo el superadmin puede asignar usuario a pedidos sin usuario (el servidor lo vuelve a exigir).
  useEffect(() => { if (isSuper) equiposOrders.listAssignableUsers().then(setAssignable).catch(() => setAssignable([])) }, [isSuper])
  const assign = async (orderId: number, userId: number) => {
    setAssigning(orderId)
    try {
      const r = await equiposOrders.assignOrderCreator(orderId, userId)
      toast.success(`Pedido asignado a ${r.created_by_name}`)
      setUsersTick((n) => n + 1)
      await load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo asignar el usuario'))
      await load()
    } finally {
      setAssigning(null)
    }
  }

  const setF = (patch: Partial<OrderFilter>) => { setPage(1); setFilter((f) => ({ ...f, ...patch })) }
  const pages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1
  // Si al asignar se vació la última página de una lista filtrada, vuelve a una página válida.
  useEffect(() => { if (data && page > pages) setPage(pages) }, [data, page, pages])
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
        <select aria-label="Pago" value={filter.payment_status ?? ''} onChange={(e) => setF({ payment_status: e.target.value || undefined })} className={SELECT}>
          <option value="">Todo pago</option>
          {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Envío" value={filter.shipment_status ?? ''} onChange={(e) => setF({ shipment_status: e.target.value || undefined })} className={SELECT}>
          <option value="">Todo envío</option>
          {Object.entries(SHIPMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Usuario" value={String(filter.created_by ?? '')} onChange={(e) => setF({ created_by: e.target.value === 'none' ? 'none' : e.target.value ? Number(e.target.value) : undefined })} className={SELECT}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          <option value="none">Sin usuario</option>
        </select>
        <input type="date" aria-label="Desde" value={filter.from ?? ''} onChange={(e) => setF({ from: e.target.value || undefined })} className={SELECT} />
        <input type="date" aria-label="Hasta" value={filter.to ?? ''} onChange={(e) => setF({ to: e.target.value || undefined })} className={SELECT} />
        {canShip && selected.size > 0 && <button type="button" className={BTN_PRIMARY} disabled={printing} onClick={() => void printSelected()}><Printer size={16} /> {printing ? 'Generando…' : `Imprimir rótulos (${selected.size})`}</button>}
        {canCreate && <button type="button" className={BTN_PRIMARY} onClick={() => setEditor({ open: true })}><Plus size={16} /> Nuevo pedido</button>}
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
                {canSeeMoney && <th className="px-3 text-right">Total</th>}{canSeeMoney && <th className="px-3 text-right">Adelanto</th>}{canSeeMoney && <th className="px-3 text-right">Saldo</th>}
                <th className="px-3">Agencia</th><th className="px-3">Usuario</th><th className="px-3">Pago</th><th className="px-3">Envío</th><th className="px-2 w-10"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} className={`cursor-pointer hover:bg-slate-50 ${r.status === 'anulado' ? 'opacity-50' : ''}`}>
                  {canShip && <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>{r.status === 'registrado' && <input type="checkbox" aria-label={`Seleccionar pedido ${r.order_number}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="rounded" />}</td>}
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    {r.order_number}
                    {r.status !== 'registrado' && <span className={`block mt-0.5 w-fit rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.status === 'anulado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{ORDER_STATUS_LABEL[r.status] ?? r.status}</span>}
                  </td>
                  <td className="px-3 whitespace-nowrap text-slate-600">{fmtDate(r.order_date)}</td>
                  <td className="px-3"><span className="text-slate-800">{r.customer_name}</span><span className="block text-xs text-slate-400">{r.customer_doc_type} {r.customer_doc_number}{r.department ? ` · ${r.department}` : ''}</span></td>
                  <td className="px-3 text-slate-600 max-w-xs truncate" title={r.summary}>{r.summary}{r.is_gift && <span className="ml-1 text-xs text-emerald-700">(obsequio)</span>}</td>
                  {canSeeMoney && <td className="px-3 text-right whitespace-nowrap">{money(r.total_amount)}</td>}
                  {canSeeMoney && <td className="px-3 text-right whitespace-nowrap text-slate-600">{money(r.paid_amount)}</td>}
                  {canSeeMoney && <td className={`px-3 text-right whitespace-nowrap ${r.balance_amount > 0 ? 'text-red-700 font-medium' : 'text-slate-400'}`}>{money(r.balance_amount)}</td>}
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const office = r.delivery_mode === 'oficina' || r.delivery_mode === 'pendiente_recojo'
                      const place = r.destination_agency || r.carrier_name
                      const text = office ? (
                        <span className="text-slate-800">Recojo en Oficina</span>
                      ) : (
                        <>
                          <span className="text-slate-800">{place || <span className="text-slate-300">Sin agencia</span>}</span>
                          {r.destination_agency && r.carrier_name && <span className="block text-xs text-slate-400">{r.carrier_name}</span>}
                          <span className="block text-xs text-slate-500">{r.guide_number ? `Guía ${r.guide_number}` : 'Sin guía'}</span>
                        </>
                      )
                      const reason = r.status === 'anulado' ? 'Pedido anulado' : r.shipment_status === 'entregado' ? 'Envío entregado' : r.shipment_status === 'retorno' ? 'Envío en retorno' : ''
                      if (!canShip || office) return <div>{text}</div>
                      if (reason) return <div title={reason}>{text}<span className="block text-[11px] text-slate-400">{reason}: solo lectura</span></div>
                      return (
                        <button type="button" onClick={() => setShipEdit(r)} title="Editar guía, flete y despacho" aria-label={`Editar datos de envío del pedido ${r.order_number}`} className="group flex items-start gap-1.5 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-100">
                          <span>{text}</span><Pencil size={13} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-indigo-600" />
                        </button>
                      )
                    })()}
                  </td>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    {isSuper && r.created_by == null ? (
                      <select aria-label={`Asignar usuario al pedido ${r.order_number}`} value="" disabled={assigning === r.id || assignable.length === 0}
                        onChange={(e) => e.target.value && void assign(r.id, Number(e.target.value))}
                        className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 cursor-pointer max-w-36">
                        <option value="">{assigning === r.id ? 'Asignando…' : 'Sin usuario · Asignar'}</option>
                        {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    ) : <UserBadge id={r.created_by} name={r.created_by_name} />}
                  </td>
                  <td className="px-3"><PaymentBadge value={r.payment_status} /></td>
                  <td className="px-3"><ShipmentBadge value={r.shipment_status} /></td>
                  <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <RowMenu label={`Acciones del pedido ${r.order_number}`} items={[
                      { key: 'view', label: 'Ver detalle', icon: <Eye size={14} />, onClick: () => setDetailId(r.id) },
                      ...(canUpdate && r.status !== 'anulado' ? [{ key: 'edit', label: 'Editar pedido', icon: <Pencil size={14} />, onClick: () => setEditor({ open: true, id: r.id }) }] : []),
                      ...(canPay && r.status === 'registrado' && r.balance_amount > 0 && r.customer_id ? [{ key: 'pay', label: 'Registrar cobro', icon: <Banknote size={14} />, onClick: () => setPayFor(r) }] : []),
                    ]} />
                  </td>
                </tr>
              ))}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={13} className="text-center text-slate-400 py-12">No hay pedidos con esos filtros.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && <PaginationBar page={page} perPage={perPage} total={data.total} totalPages={pages} onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1) }} itemLabel="pedidos" />}

      <PaymentModal
        open={payFor !== null} onClose={() => setPayFor(null)} onSaved={() => void load()}
        customerId={payFor?.customer_id ?? null} customerName={payFor?.customer_name ?? ''} orderId={payFor?.id}
        suggestedAmount={payFor && payFor.balance_amount > 0 ? payFor.balance_amount : undefined}
      />
      <ShippingDataModal order={shipEdit} onClose={() => setShipEdit(null)} onSaved={() => void load()} />
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
