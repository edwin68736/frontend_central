import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, MessageCircle } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import { equiposControl, type AlertItem, type Dashboard } from '@/services/equiposControl.service'
import { apiError, currentPeriod } from './common'
import OrderDetail from './OrderDetail'
import { usePaging } from './hooks'
import OrderEditor from './OrderEditor'
import { money, SELECT } from './ordersCommon'
import { waLink, waText, type WaKind } from './whatsapp'

const KIND_LABEL: Record<string, string> = {
  agencia_vencido: 'Plazo vencido', agencia_rojo: 'Por vencer', agencia_amarillo: 'En agencia', transito_seguimiento: 'Sin llegar',
  recogido_con_saldo: 'Recogido con saldo', observado: 'Observado',
}
const KIND_WA: Record<string, WaKind | undefined> = {
  agencia_vencido: 'recordatorio', agencia_rojo: 'vence_pronto', agencia_amarillo: 'recordatorio', recogido_con_saldo: 'saldo',
}
const SEV: Record<string, string> = { alta: 'bg-red-50 text-red-700 border-red-200', media: 'bg-amber-50 text-amber-700 border-amber-200', baja: 'bg-slate-100 text-slate-600 border-slate-200' }

function Kpi({ label, value, tone = 'slate', hint }: { label: string; value: string | number; tone?: 'slate' | 'red' | 'amber' | 'emerald' | 'indigo'; hint?: string }) {
  const color = { slate: 'text-slate-800', red: 'text-red-700', amber: 'text-amber-700', emerald: 'text-emerald-700', indigo: 'text-indigo-700' }[tone]
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function DashboardTab() {
  const [period, setPeriod] = useState(currentPeriod())
  const [d, setD] = useState<Dashboard | null>(null)
  const [money_, setMoney] = useState(true)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const paging = usePaging(alerts, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dash, al] = await Promise.all([equiposControl.dashboard(period), equiposControl.alerts()])
      setD(dash.d); setMoney(dash.money); setAlerts(al)
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el panel'))
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { void load() }, [load])

  if (loading && !d) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!d) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-500">Mes</label>
        <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={SELECT} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Pedidos del mes" value={d.orders} tone="indigo" />
        {money_ && <Kpi label="Vendido" value={money(d.sales_total)} />}
        {money_ && <Kpi label="Cobrado en el mes" value={money(d.collected)} tone="emerald" />}
        {money_ && <Kpi label="Por cobrar (total)" value={money(d.receivable)} tone={d.receivable > 0 ? 'red' : 'slate'} />}
        <Kpi label="Listos para despachar" value={d.ready_to_dispatch} tone="emerald" hint={`${d.waiting_dispatch} esperando validación o datos`} />
        <Kpi label="Por validar" value={d.pending_validation} tone={d.pending_validation > 0 ? 'amber' : 'slate'} hint={d.observed ? `${d.observed} observados` : undefined} />
        <Kpi label="En tránsito" value={d.in_transit} hint={d.in_transit_follow_up ? `${d.in_transit_follow_up} con seguimiento pendiente` : undefined} tone={d.in_transit_follow_up ? 'amber' : 'slate'} />
        <Kpi label="En agencia" value={d.in_agency} hint={`${d.agency_yellow} amarillo · ${d.agency_red} rojo · ${d.agency_expired} vencidos`} tone={d.agency_expired + d.agency_red > 0 ? 'red' : 'slate'} />
        <Kpi label="Retornos abiertos" value={d.open_returns} tone={d.open_returns ? 'amber' : 'slate'} />
        {money_ && <Kpi label="Costo de retornos" value={money(d.return_cost)} hint={`Saldo no cobrado ${money(d.return_unpaid)}`} />}
        <Kpi label="Recogidos con saldo" value={d.picked_up_with_debt} tone={d.picked_up_with_debt ? 'red' : 'slate'} />
      </div>

      {d.stock_visible && (d.stock_red.length > 0 || d.negative_stock.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800 mb-2">Stock bajo</p>
          <div className="flex flex-wrap gap-2">
            {d.stock_red.map((s) => (
              <span key={s.code} className="inline-flex items-center gap-1 text-xs rounded-full border border-red-200 bg-red-50 text-red-700 px-2 py-1">{s.code}: {s.current}</span>
            ))}
          </div>
          {d.negative_stock.length > 0 && <p className="text-xs text-red-700 mt-2 flex items-center gap-1"><AlertTriangle size={12} /> En negativo: {d.negative_stock.map((s) => `${s.code} (${s.current})`).join(', ')}</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200">
        <p className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100">Requiere acción ({alerts.length})</p>
        {alerts.length === 0 ? <p className="text-center text-slate-400 py-8 text-sm">Nada pendiente. 🎉</p> : (
          <ul className="divide-y divide-slate-100">
            {paging.rows.map((a, i) => {
              const kind = KIND_WA[a.kind]
              const link = kind ? waLink(a.customer_phone, waText(kind, { customer: a.customer_name, orderNumber: a.order_number, carrier: a.carrier_name, guide: a.guide_number, balance: a.balance_amount })) : null
              return (
                <li key={`${a.kind}-${a.order_id}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`text-xs rounded-full border px-2 py-0.5 whitespace-nowrap ${SEV[a.severity]}`}>{KIND_LABEL[a.kind] ?? a.kind}</span>
                  <button type="button" className="font-medium text-slate-800 hover:underline text-left" onClick={() => setDetailId(a.order_id)}>N° {a.order_number} · {a.customer_name}</button>
                  <span className="text-slate-500 flex-1 min-w-48">{a.message}{a.balance_amount > 0 ? ` · saldo ${money(a.balance_amount)}` : ''}</span>
                  {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1"><MessageCircle size={13} /> WhatsApp</a>}
                </li>
              )
            })}
          </ul>
        )}
        {alerts.length > 0 && <PaginationBar {...paging.barProps} itemLabel="alertas" />}
      </div>

      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} onEdit={(id) => { setDetailId(null); setEditId(id) }} />
      <OrderEditor open={editId != null} orderId={editId ?? undefined} onClose={() => setEditId(null)} onSaved={() => void load()} />
    </div>
  )
}
