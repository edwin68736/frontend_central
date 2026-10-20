import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import PaginationBar from '@/components/ui/PaginationBar'
import type { PerPageOption } from '@/services/pagination'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { equiposOrders, type OrderFilter, type OrderListResult } from '@/services/equiposOrders.service'
import { apiError, INPUT } from './common'
import OrderDetail from './OrderDetail'
import { useDebounced } from './hooks'
import { AgencyBadge, AgencyDays, fmtDate, money, PaymentBadge, SELECT, UserBadge } from './ordersCommon'

/**
 * Pedido-agencia: gestión de los paquetes que llegaron a la agencia. Regla de negocio: a los 15 días en agencia
 * corresponde el retorno (umbrales del semáforo en el servidor, service/agency.go). Mismo listado y filtros que Pedidos.
 */
export default function AgencyOrdersTab() {
  const canSeeMoney = useAuth().hasPermission('equipos.payments_view') // igual que Pedidos: Total y Saldo solo con ese permiso
  const [filter, setFilter] = useState<OrderFilter>({})
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)
  const dq = useDebounced(q, 450)
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  const [data, setData] = useState<OrderListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const scope: OrderFilter = showAll ? {} : { shipment_status: 'en_agencia', agency: 'con_llegada' }
      setData(await equiposOrders.listOrders({ ...filter, ...scope, status: 'registrado', sort: 'agency_days', q: dq.trim() || undefined, page, per_page: perPage }))
    } catch (e) {
      setFailed(true)
      toast.error(apiError(e, 'No se pudieron cargar los pedidos en agencia'))
    } finally {
      setLoading(false)
    }
  }, [filter, showAll, dq, page, perPage])

  useEffect(() => { void load() }, [load])
  useEffect(() => { equiposOrders.listOrderUsers().then(setUsers).catch(() => setUsers([])) }, [])

  const setF = (patch: Partial<OrderFilter>) => { setPage(1); setFilter((f) => ({ ...f, ...patch })) }
  const pages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1
  useEffect(() => { if (data && page > pages) setPage(pages) }, [data, page, pages])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-52">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value) }} placeholder="Buscar por cliente, documento, N° de pedido o guía…" className={INPUT + ' pl-9'} />
        </div>
        <select aria-label="Usuario" value={String(filter.created_by ?? '')} onChange={(e) => setF({ created_by: e.target.value === 'none' ? 'none' : e.target.value ? Number(e.target.value) : undefined })} className={SELECT}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          <option value="none">Sin usuario</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 px-2 py-2">
          <input type="checkbox" checked={showAll} onChange={(e) => { setPage(1); setShowAll(e.target.checked) }} className="rounded" /> Ver todos los pedidos
        </label>
      </div>
      <p className="text-sm text-slate-500">
        {showAll ? 'Todos los pedidos registrados, los que están en agencia primero.' : 'Pedidos en agencia con fecha de llegada, de más a menos días.'} A los 15 días en agencia corresponde el retorno: abre el pedido para registrarlo.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2">Pedido</th><th className="px-3">Cliente</th><th className="px-3">Agencia / transportista</th><th className="px-3">Usuario</th>
                <th className="px-3">Llegada</th><th className="px-3 text-right">Días/agencia</th><th className="px-3 text-right">Días para el retorno</th>
                {canSeeMoney && <th className="px-3 text-right">Total</th>}{canSeeMoney && <th className="px-3 text-right">Saldo</th>}<th className="px-3">Pago</th><th className="px-3">Semáforo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-800">{r.order_number}</td>
                  <td className="px-3"><span className="text-slate-800">{r.customer_name}</span><span className="block text-xs text-slate-400">{r.customer_doc_type} {r.customer_doc_number}</span></td>
                  <td className="px-3 text-slate-600">{r.carrier_name || '—'}{r.destination_agency && <span className="block text-xs text-slate-400">{r.destination_agency}{r.guide_number ? ` · ${r.guide_number}` : ''}</span>}</td>
                  <td className="px-3"><UserBadge id={r.created_by} name={r.created_by_name} /></td>
                  <td className="px-3 whitespace-nowrap text-slate-600">{r.arrived_at ? fmtDate(r.arrived_at) : '—'}</td>
                  <td className="px-3 text-right"><AgencyDays days={r.days_in_agency} level={r.agency_level} /></td>
                  <td className="px-3 text-right tabular-nums">{r.days_left ?? '—'}</td>
                  {canSeeMoney && <td className="px-3 text-right whitespace-nowrap">{money(r.total_amount)}</td>}
                  {canSeeMoney && <td className={`px-3 text-right whitespace-nowrap ${r.balance_amount > 0 ? 'text-red-700 font-medium' : 'text-slate-400'}`}>{money(r.balance_amount)}</td>}
                  <td className="px-3"><PaymentBadge value={r.payment_status} /></td>
                  <td className="px-3"><AgencyBadge level={r.agency_level} label={r.agency_label} /></td>
                </tr>
              ))}
              {failed && !data && <tr><td colSpan={canSeeMoney ? 11 : 9} className="text-center text-red-600 py-12">No se pudieron cargar los pedidos. <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></td></tr>}
              {data && data.rows.length === 0 && (
                <tr><td colSpan={canSeeMoney ? 11 : 9} className="text-center text-slate-400 py-12">{showAll ? 'No hay pedidos con esos filtros.' : 'No hay pedidos en agencia con esos filtros.'}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && <PaginationBar page={page} perPage={perPage} total={data.total} totalPages={pages} onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1) }} itemLabel="pedidos" />}

      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} onEdit={() => setDetailId(null)} />
    </div>
  )
}
