import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, Lock, Unlock } from 'lucide-react'
import { writeXlsx, type CellValue } from 'hucre'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposControl, type ClosedPeriod, type Collections, type ProfitReport, type ReplenishRow, type SalesReport, type Summary,
} from '@/services/equiposControl.service'
import { METHOD_LABEL, SALE_TYPE_LABEL } from '@/services/equiposOrders.service'
import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, currentPeriod, formatDateTime } from './common'
import { fmtDate, money, SELECT } from './ordersCommon'

type Section = 'resumen' | 'ventas' | 'cobranza' | 'reposicion' | 'utilidad' | 'cierre'
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'resumen', label: 'Resumen mensual' }, { key: 'ventas', label: 'Ventas por producto' }, { key: 'cobranza', label: 'Por cobrar' },
  { key: 'reposicion', label: 'Reposición sugerida' }, { key: 'utilidad', label: 'Utilidad' }, { key: 'cierre', label: 'Cierre mensual' },
]
const typeName = (t: string) => (t === 'total' ? 'Total' : SALE_TYPE_LABEL[t] ?? t)

const TH = 'px-3 py-2 text-left text-xs text-slate-500'
const TABLE = 'bg-white rounded-xl border border-slate-200 overflow-x-auto'

async function saveSheets(name: string, sheets: { name: string; rows: CellValue[][] }[]) {
  const bytes = await writeXlsx({ sheets: sheets.map((s) => ({ name: s.name.slice(0, 31), rows: s.rows })) })
  downloadXlsxBytes(bytes, name)
}

export default function ReportsTab() {
  const { hasPermission } = useAuth()
  const canClose = hasPermission('equipos.settings')
  const [section, setSection] = useState<Section>('resumen')
  const [period, setPeriod] = useState(currentPeriod())
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [coll, setColl] = useState<Collections | null>(null)
  const [rep, setRep] = useState<ReplenishRow[] | null>(null)
  const [profit, setProfit] = useState<ProfitReport | null>(null)
  const [closed, setClosed] = useState<ClosedPeriod[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (section === 'resumen') setSummary(await equiposControl.summary(period))
      if (section === 'ventas') setSales(await equiposControl.sales(period))
      if (section === 'cobranza') setColl(await equiposControl.collections())
      if (section === 'reposicion') setRep(await equiposControl.replenishment())
      if (section === 'utilidad') setProfit(await equiposControl.profit(period))
      if (section === 'cierre') setClosed(await equiposControl.periods())
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el reporte'))
    } finally {
      setLoading(false)
    }
  }, [section, period])

  useEffect(() => { void load() }, [load])

  const exportCurrent = async () => {
    try {
      if (section === 'resumen' && summary) {
        await saveSheets(`equipos-resumen-${period}.xlsx`, [{ name: 'Resumen', rows: [
          ['Tipo de salida', 'Pedidos', 'Vendido', 'Cobrado', 'Por cobrar'],
          ...[...summary.by_type, summary.total].map((t) => [typeName(t.sale_type), t.orders, t.sales, t.paid, t.balance] as CellValue[]),
          [], ['Cobros del mes por medio'], ['Medio', 'Cobros', 'Total'],
          ...summary.payments_by_method.map((m) => [METHOD_LABEL[m.method] ?? m.method, m.count, m.total] as CellValue[]),
          [], ['Retornos', summary.returns, 'Costo', summary.return_cost, 'Saldo no cobrado', summary.return_unpaid],
        ] }])
      } else if (section === 'ventas' && sales) {
        await saveSheets(`equipos-ventas-${period}.xlsx`, [
          { name: 'Ventas', rows: [['Tipo', 'Código', 'Nombre', 'Cantidad', 'Importe'], ...sales.lines.map((l) => [l.kind, l.code, l.name, l.quantity, l.amount] as CellValue[])] },
          { name: 'Unidades', rows: [['Código', 'Directo independiente', 'Directo Promo TK', 'Combo independiente', 'Combo Promo TK', 'Total'], ...sales.units.map((u) => [u.code, u.direct_independiente, u.direct_promo_tk, u.combo_independiente, u.combo_promo_tk, u.total] as CellValue[])] },
        ])
      } else if (section === 'cobranza' && coll) {
        await saveSheets('equipos-por-cobrar.xlsx', [{ name: 'Por cobrar', rows: [
          ['Cliente', 'Celular', '0-15 días', '16-30 días', '31-60 días', '+60 días', 'Total', 'Más antiguo (días)'],
          ...coll.customers.map((c) => [c.customer_name, c.customer_phone, c.b0_15, c.b16_30, c.b31_60, c.b60_plus, c.balance, c.oldest_days] as CellValue[]),
          ['TOTAL', '', coll.b0_15, coll.b16_30, coll.b31_60, coll.b60_plus, coll.total, ''],
        ] }])
      } else if (section === 'reposicion' && rep) {
        await saveSheets('equipos-reposicion.xlsx', [{ name: 'Reposición', rows: [
          ['Código', 'Producto', 'Stock', 'Consumo mensual', 'Días de cobertura', 'Objetivo', 'Sugerido', 'Urgencia'],
          ...rep.map((r) => [r.code, r.name, r.stock, r.monthly_avg, r.cover_days ?? '', r.target, r.suggested, r.urgency] as CellValue[]),
        ] }])
      } else if (section === 'utilidad' && profit) {
        await saveSheets(`equipos-utilidad-${period}.xlsx`, [{ name: 'Utilidad', rows: [
          ['Tipo de salida', 'Ventas', 'Costo de lo vendido', 'Flete', 'Utilidad', 'Margen'],
          ...[...profit.rows, profit.total].map((r) => [typeName(r.sale_type), r.revenue, r.cogs, r.freight, r.profit, r.margin] as CellValue[]),
          [], ['Costo de retornos', profit.return_cost], ['Cobertura de costos', profit.cost_coverage],
        ] }])
      } else return
      toast.success('Reporte exportado')
    } catch {
      toast.error('No se pudo exportar el reporte')
    }
  }

  const closePeriod = async (p: string) => {
    if (!window.confirm(`¿Cerrar ${p}? Congela su stock inicial y final y bloquea movimientos manuales con fecha en ese mes.`)) return
    try { await equiposControl.closePeriod(p); toast.success(`${p} cerrado`); void load() } catch (e) { toast.error(apiError(e, 'No se pudo cerrar el período')) }
  }
  const reopen = async (p: string) => {
    if (!window.confirm(`¿Reabrir ${p}?`)) return
    try { await equiposControl.reopenPeriod(p); toast.success(`${p} reabierto`); void load() } catch (e) { toast.error(apiError(e, 'No se pudo reabrir')) }
  }

  const needsPeriod = section === 'resumen' || section === 'ventas' || section === 'utilidad'
  const prevPeriod = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} aria-pressed={section === s.key}
            className={`px-3 py-1.5 rounded-lg text-sm border ${section === s.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{s.label}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {needsPeriod && <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={SELECT} aria-label="Mes" />}
          {section !== 'cierre' && <button type="button" className={BTN_SECONDARY} onClick={() => void exportCurrent()}><Download size={13} /> Exportar a Excel</button>}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <>
          {section === 'resumen' && summary && (
            <div className="space-y-4">
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50"><th className={TH}>Tipo de salida</th><th className={TH + ' text-right'}>Pedidos</th><th className={TH + ' text-right'}>Vendido</th><th className={TH + ' text-right'}>Cobrado</th><th className={TH + ' text-right'}>Por cobrar</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...summary.by_type, summary.total].map((t) => (
                      <tr key={t.sale_type} className={t.sale_type === 'total' ? 'font-semibold bg-slate-50' : ''}><td className="px-3 py-2">{typeName(t.sale_type)}</td><td className="px-3 text-right">{t.orders}</td><td className="px-3 text-right">{money(t.sales)}</td><td className="px-3 text-right">{money(t.paid)}</td><td className="px-3 text-right text-red-700">{money(t.balance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className={TABLE}>
                  <p className="px-3 pt-3 text-sm font-semibold text-slate-800">Cobros del mes por medio · {money(summary.collected)}</p>
                  <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
                    {summary.payments_by_method.map((m) => <tr key={m.method}><td className="px-3 py-1.5">{METHOD_LABEL[m.method] ?? m.method}</td><td className="px-3 text-right text-slate-500">{m.count}</td><td className="px-3 text-right">{money(m.total)}</td></tr>)}
                    {summary.payments_by_method.length === 0 && <tr><td className="px-3 py-4 text-slate-400">Sin cobros en el mes.</td></tr>}
                  </tbody></table>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-1">
                  <p className="font-semibold text-slate-800">Otros datos</p>
                  <p className="text-slate-600">Pedidos obsequio: {summary.gift_orders}</p>
                  <p className="text-slate-600">Retornos solicitados: {summary.returns} · costo {money(summary.return_cost)} · saldo no cobrado {money(summary.return_unpaid)}</p>
                </div>
              </div>
            </div>
          )}

          {section === 'ventas' && sales && (
            <div className="grid xl:grid-cols-2 gap-4">
              <div className={TABLE}>
                <p className="px-3 pt-3 text-sm font-semibold text-slate-800">Importe vendido</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200"><th className={TH}>Concepto</th><th className={TH + ' text-right'}>Cant.</th><th className={TH + ' text-right'}>Importe</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {sales.lines.map((l, i) => <tr key={i}><td className="px-3 py-1.5">{l.code || l.name}<span className="ml-2 text-xs text-slate-400">{l.kind}</span></td><td className="px-3 text-right">{l.quantity}</td><td className="px-3 text-right">{money(l.amount)}</td></tr>)}
                    {sales.lines.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Sin ventas en el mes.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className={TABLE}>
                <p className="px-3 pt-3 text-sm font-semibold text-slate-800">Unidades que salieron (como el Stock Maestro)</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200"><th className={TH}>Producto</th><th className={TH + ' text-right'}>Directo</th><th className={TH + ' text-right'}>Directo Promo</th><th className={TH + ' text-right'}>Combo</th><th className={TH + ' text-right'}>Combo Promo</th><th className={TH + ' text-right'}>Total</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {sales.units.map((u) => <tr key={u.code}><td className="px-3 py-1.5 font-medium">{u.code}</td><td className="px-3 text-right">{u.direct_independiente}</td><td className="px-3 text-right">{u.direct_promo_tk}</td><td className="px-3 text-right">{u.combo_independiente}</td><td className="px-3 text-right">{u.combo_promo_tk}</td><td className="px-3 text-right font-semibold">{u.total}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section === 'cobranza' && coll && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[['Total por cobrar', coll.total], ['0–15 días', coll.b0_15], ['16–30 días', coll.b16_30], ['31–60 días', coll.b31_60], ['Más de 60', coll.b60_plus]].map(([l, v]) => (
                  <div key={l as string} className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{l}</p><p className="text-lg font-bold text-slate-800">{money(v as number)}</p></div>
                ))}
              </div>
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50"><th className={TH}>Cliente</th><th className={TH + ' text-right'}>0–15</th><th className={TH + ' text-right'}>16–30</th><th className={TH + ' text-right'}>31–60</th><th className={TH + ' text-right'}>+60</th><th className={TH + ' text-right'}>Total</th><th className={TH}>Pedidos</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {coll.customers.map((c, i) => (
                      <tr key={i}><td className="px-3 py-2">{c.customer_name}<span className="block text-xs text-slate-400">{c.customer_phone} · el más antiguo: {c.oldest_days} días</span></td>
                        <td className="px-3 text-right">{c.b0_15 ? money(c.b0_15) : '—'}</td><td className="px-3 text-right">{c.b16_30 ? money(c.b16_30) : '—'}</td><td className="px-3 text-right">{c.b31_60 ? money(c.b31_60) : '—'}</td><td className="px-3 text-right text-red-700">{c.b60_plus ? money(c.b60_plus) : '—'}</td>
                        <td className="px-3 text-right font-semibold">{money(c.balance)}</td><td className="px-3 text-xs text-slate-500">{c.orders.map((o) => `N° ${o.order_number} (${fmtDate(o.order_date)})`).join(', ')}</td></tr>
                    ))}
                    {coll.customers.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No hay saldos por cobrar.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section === 'reposicion' && rep && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Consumo de los últimos 3 meses cerrados. Objetivo: cubrir 6 semanas (consumo mensual × 1,5) y nunca menos que el umbral verde del producto.</p>
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50"><th className={TH}>Producto</th><th className={TH + ' text-right'}>Stock</th><th className={TH + ' text-right'}>Consumo/mes</th><th className={TH + ' text-right'}>Cobertura</th><th className={TH + ' text-right'}>Objetivo</th><th className={TH + ' text-right'}>Reponer</th><th className={TH}>Urgencia</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rep.map((r) => (
                      <tr key={r.product_id}><td className="px-3 py-1.5 font-medium">{r.code}</td><td className="px-3 text-right">{r.stock}</td><td className="px-3 text-right">{r.monthly_avg}{r.months_of_data === 0 && <span className="text-xs text-slate-400"> sin historial</span>}</td>
                        <td className="px-3 text-right">{r.cover_days != null ? `${r.cover_days} d` : '—'}</td><td className="px-3 text-right">{r.target}</td><td className="px-3 text-right font-semibold">{r.suggested || '—'}</td>
                        <td className="px-3"><span className={`text-xs rounded-full border px-2 py-0.5 ${r.urgency === 'alta' ? 'bg-red-50 text-red-700 border-red-200' : r.urgency === 'media' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{r.urgency === 'ok' ? 'Suficiente' : r.urgency === 'alta' ? 'Urgente' : 'Pronto'}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section === 'utilidad' && profit && (
            <div className="space-y-3">
              {profit.cost_coverage < 1 && (
                <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
                  Solo el {Math.round(profit.cost_coverage * 100)} % de las unidades vendidas tiene costo de compra cargado; la utilidad está sobrestimada.
                  {profit.missing_cost_products.length > 0 && <> Sin costo: {profit.missing_cost_products.join(', ')}. Registra el costo unitario al ingresar mercadería (Stock → Ingreso).</>}
                </p>
              )}
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50"><th className={TH}>Tipo de salida</th><th className={TH + ' text-right'}>Ventas</th><th className={TH + ' text-right'}>Costo de lo vendido</th><th className={TH + ' text-right'}>Flete</th><th className={TH + ' text-right'}>Utilidad</th><th className={TH + ' text-right'}>Margen</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...profit.rows, profit.total].map((r) => (
                      <tr key={r.sale_type} className={r.sale_type === 'total' ? 'font-semibold bg-slate-50' : ''}><td className="px-3 py-2">{typeName(r.sale_type)}</td><td className="px-3 text-right">{money(r.revenue)}</td><td className="px-3 text-right">{money(r.cogs)}</td><td className="px-3 text-right">{money(r.freight)}</td><td className={`px-3 text-right ${r.profit < 0 ? 'text-red-700' : ''}`}>{money(r.profit)}</td><td className="px-3 text-right">{(r.margin * 100).toFixed(1)} %</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">La utilidad total descuenta además el costo de retornos del mes ({money(profit.return_cost)}). El flete se registra por envío; el costo de compra, al ingresar stock.</p>
            </div>
          )}

          {section === 'cierre' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Cerrar un mes congela el stock inicial y final de cada producto y bloquea los movimientos manuales con fecha en ese mes (reábrelo si necesitas corregir).</p>
              {canClose && (
                <button type="button" className={BTN_PRIMARY} disabled={closed.some((c) => c.period === prevPeriod)} onClick={() => void closePeriod(prevPeriod)}><Lock size={14} /> Cerrar {prevPeriod}</button>
              )}
              <div className={TABLE}>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50"><th className={TH}>Mes</th><th className={TH}>Cerrado</th><th className={TH + ' text-right'}>Productos</th><th /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {closed.map((c) => <tr key={c.period}><td className="px-3 py-2 font-medium">{c.period}</td><td className="px-3 text-slate-500">{formatDateTime(c.closed_at)}</td><td className="px-3 text-right">{c.products}</td><td className="px-3 text-right">{canClose && <button type="button" className={BTN_SECONDARY} onClick={() => void reopen(c.period)}><Unlock size={12} /> Reabrir</button>}</td></tr>)}
                    {closed.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Aún no hay meses cerrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
