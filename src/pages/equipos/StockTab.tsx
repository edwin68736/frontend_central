import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { History, PackagePlus, SlidersHorizontal, PackageMinus, Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposService,
  EQUIP_KIND_LABEL,
  type EquipKind,
  type EquipMovement,
  type EquipStockRow,
  type MovementKind,
} from '@/services/equipos.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, currentPeriod, formatDateTime, INPUT, LABEL, SemaphoreBadge } from './common'

const MOVEMENT_LABEL: Record<string, string> = {
  apertura: 'Stock inicial',
  ingreso: 'Ingreso',
  salida_pedido: 'Salida por pedido',
  salida_reenvio: 'Salida por reenvío',
  reingreso_retorno: 'Reingreso por retorno',
  ajuste: 'Ajuste',
  baja: 'Baja',
}

const num = (n: number) => (n === 0 ? <span className="text-slate-300">0</span> : n)

export default function StockTab() {
  const { hasPermission } = useAuth()
  const canAdjust = hasPermission('equipos.stock_adjust')
  const [period, setPeriod] = useState(currentPeriod())
  const [rows, setRows] = useState<EquipStockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'' | EquipKind>('')
  const [onlyLow, setOnlyLow] = useState(false)

  const [kardex, setKardex] = useState<EquipStockRow | null>(null)
  const [moves, setMoves] = useState<EquipMovement[]>([])
  const [movesLoading, setMovesLoading] = useState(false)

  const [form, setForm] = useState<{ open: boolean; productId: number | ''; type: MovementKind; qty: string; date: string; note: string; cost: string }>({
    open: false, productId: '', type: 'ingreso', qty: '', date: '', note: '', cost: '',
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await equiposService.stock(period)
      setRows(r.rows)
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el stock'))
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!term || r.code.toLowerCase().includes(term) || r.name.toLowerCase().includes(term)) &&
        (!kind || r.kind === kind) &&
        (!onlyLow || r.semaphore === 'bajo'),
    )
  }, [rows, q, kind, onlyLow])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => ({
          opening: a.opening + r.opening,
          ing: a.ing + r.ingresos,
          adj: a.adj + r.adjustments,
          di: a.di + r.direct_independiente,
          dp: a.dp + r.direct_promo_tk,
          ci: a.ci + r.combo_independiente,
          cp: a.cp + r.combo_promo_tk,
          out: a.out + r.total_out,
          re: a.re + r.reingresos,
          cur: a.cur + r.current,
        }),
        { opening: 0, ing: 0, adj: 0, di: 0, dp: 0, ci: 0, cp: 0, out: 0, re: 0, cur: 0 },
      ),
    [filtered],
  )
  const lowCount = rows.filter((r) => r.semaphore === 'bajo').length

  const openKardex = async (r: EquipStockRow) => {
    setKardex(r)
    setMoves([])
    setMovesLoading(true)
    try {
      setMoves(await equiposService.movements(r.product_id))
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el kardex'))
    } finally {
      setMovesLoading(false)
    }
  }

  const openForm = (type: MovementKind, productId?: number) =>
    setForm({ open: true, productId: productId ?? '', type, qty: '', date: '', note: '', cost: '' })

  const submit = async () => {
    const qty = Number(form.qty)
    if (!form.productId) return toast.error('Elige el producto')
    if (!Number.isInteger(qty) || qty === 0) return toast.error('La cantidad debe ser un entero distinto de cero')
    if (form.type !== 'ajuste' && qty < 0) return toast.error('Ingresa la cantidad en positivo')
    if (!form.note.trim()) return toast.error('La nota es obligatoria (ej. «Reposición 2026-09-03»)')
    setSaving(true)
    try {
      await equiposService.addMovement({
        product_id: Number(form.productId),
        movement_type: form.type,
        quantity: qty,
        occurred_at: form.date ? new Date(`${form.date}T12:00:00`).toISOString() : undefined,
        note: form.note.trim(),
        unit_cost: form.type === 'ingreso' && form.cost !== '' ? Number(form.cost) : undefined,
      })
      toast.success('Movimiento registrado')
      setForm((f) => ({ ...f, open: false }))
      void load()
      if (kardex && kardex.product_id === Number(form.productId)) void openKardex(kardex)
    } catch (e) {
      toast.error(apiError(e, 'No se pudo registrar el movimiento'))
    } finally {
      setSaving(false)
    }
  }

  const typeTitle = { ingreso: 'Ingreso de mercadería', ajuste: 'Ajuste de stock', baja: 'Baja de stock', apertura: 'Stock inicial' }[form.type]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={LABEL}>Mes</label>
          <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={INPUT + ' w-44'} />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <label className={LABEL}>Buscar</label>
          <Search size={15} className="absolute left-3 top-[2.35rem] text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o nombre…" className={INPUT + ' pl-9'} />
        </div>
        <div>
          <label className={LABEL}>Tipo</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as '' | EquipKind)} className={INPUT + ' w-44'}>
            <option value="">Todos</option>
            {(Object.keys(EQUIP_KIND_LABEL) as EquipKind[]).map((k) => (
              <option key={k} value={k}>{EQUIP_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2 cursor-pointer">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="rounded" />
          Solo stock bajo{lowCount > 0 && <span className="text-red-600 font-medium">({lowCount})</span>}
        </label>
        {canAdjust && (
          <div className="flex gap-2 ml-auto">
            <button type="button" className={BTN_PRIMARY} onClick={() => openForm('ingreso')}><PackagePlus size={16} /> Ingreso</button>
            <button type="button" className={BTN_SECONDARY} onClick={() => openForm('ajuste')}><SlidersHorizontal size={14} /> Ajuste</button>
            <button type="button" className={BTN_SECONDARY} onClick={() => openForm('baja')}><PackageMinus size={14} /> Baja</button>
          </div>
        )}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-left">Producto</th>
                  <th rowSpan={2} className="px-3 py-2 text-right">Inicial</th>
                  <th rowSpan={2} className="px-3 py-2 text-right" title="Reposiciones del mes">Ingresos</th>
                  <th colSpan={2} className="px-3 py-1 text-center border-l border-slate-200">Salidas directas</th>
                  <th colSpan={2} className="px-3 py-1 text-center border-l border-slate-200">Salidas por combos</th>
                  <th rowSpan={2} className="px-3 py-2 text-right border-l border-slate-200">Total sal.</th>
                  <th rowSpan={2} className="px-3 py-2 text-right">Reingr.</th>
                  <th rowSpan={2} className="px-3 py-2 text-right" title="Ajustes y bajas del mes (con signo)">Ajustes</th>
                  <th rowSpan={2} className="px-3 py-2 text-right border-l border-slate-200">Stock actual</th>
                  <th rowSpan={2} className="px-3 py-2 text-center">Semáforo</th>
                  <th rowSpan={2} className="px-3 py-2" />
                </tr>
                <tr>
                  <th className="px-3 py-1 text-right border-l border-slate-200 normal-case font-medium">Indep.</th>
                  <th className="px-3 py-1 text-right normal-case font-medium">Promo TK</th>
                  <th className="px-3 py-1 text-right border-l border-slate-200 normal-case font-medium">Indep.</th>
                  <th className="px-3 py-1 text-right normal-case font-medium">Promo TK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filtered.map((r) => (
                  <tr key={r.product_id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{r.code}</p>
                      <p className="text-xs text-slate-400">{EQUIP_KIND_LABEL[r.kind]} · umbrales {r.yellow_threshold}/{r.green_threshold}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{num(r.opening)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{num(r.ingresos)}</td>
                    <td className="px-3 py-2 text-right border-l border-slate-100">{num(r.direct_independiente)}</td>
                    <td className="px-3 py-2 text-right">{num(r.direct_promo_tk)}</td>
                    <td className="px-3 py-2 text-right border-l border-slate-100">{num(r.combo_independiente)}</td>
                    <td className="px-3 py-2 text-right">{num(r.combo_promo_tk)}</td>
                    <td className="px-3 py-2 text-right font-medium border-l border-slate-100">{num(r.total_out)}</td>
                    <td className="px-3 py-2 text-right">{num(r.reingresos)}</td>
                    <td className="px-3 py-2 text-right">{num(r.adjustments)}</td>
                    <td className={`px-3 py-2 text-right font-semibold border-l border-slate-100 ${r.current < 0 ? 'text-red-600' : 'text-slate-800'}`}>{r.current}</td>
                    <td className="px-3 py-2 text-center"><SemaphoreBadge value={r.semaphore} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" className={BTN_SECONDARY} onClick={() => void openKardex(r)} title="Ver kardex del producto">
                        <History size={13} /> Kardex
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-400">No hay productos para mostrar</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-slate-50 font-semibold text-slate-700 tabular-nums">
                  <tr>
                    <td className="px-3 py-2">Totales ({filtered.length})</td>
                    <td className="px-3 py-2 text-right">{totals.opening}</td>
                    <td className="px-3 py-2 text-right">{totals.ing}</td>
                    <td className="px-3 py-2 text-right border-l border-slate-200">{totals.di}</td>
                    <td className="px-3 py-2 text-right">{totals.dp}</td>
                    <td className="px-3 py-2 text-right border-l border-slate-200">{totals.ci}</td>
                    <td className="px-3 py-2 text-right">{totals.cp}</td>
                    <td className="px-3 py-2 text-right border-l border-slate-200">{totals.out}</td>
                    <td className="px-3 py-2 text-right">{totals.re}</td>
                    <td className="px-3 py-2 text-right">{totals.adj}</td>
                    <td className="px-3 py-2 text-right border-l border-slate-200">{totals.cur}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-400">
        El stock sale del kardex de cada producto (no de fórmulas): inicial + ingresos + reingresos + ajustes − salidas = stock actual (al cierre del mes elegido). Las salidas
        vienen de los pedidos y de los componentes de los combos, separadas por tipo de salida.
      </p>

      <Modal open={!!kardex} onClose={() => setKardex(null)} title={kardex ? `Kardex — ${kardex.code}` : ''} maxWidth="max-w-3xl">
        {kardex && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Stock del mes: <strong className="text-slate-800">{kardex.current}</strong> <SemaphoreBadge value={kardex.semaphore} /></span>
              {canAdjust && (
                <div className="flex gap-2">
                  <button type="button" className={BTN_SECONDARY} onClick={() => openForm('ingreso', kardex.product_id)}><PackagePlus size={13} /> Ingreso</button>
                  <button type="button" className={BTN_SECONDARY} onClick={() => openForm('ajuste', kardex.product_id)}><SlidersHorizontal size={13} /> Ajuste</button>
                </div>
              )}
            </div>
            {movesLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : (
              <div className="max-h-[55vh] overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Movimiento</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-left">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {moves.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{formatDateTime(m.occurred_at)}</td>
                        <td className="px-3 py-1.5">{MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                        <td className="px-3 py-1.5 text-slate-500 text-xs">
                          {[
                            m.order_number != null ? `Pedido ${m.order_number}` : '',
                            m.combo_code ? `vía ${m.combo_code}` : '',
                            m.sale_type_snapshot === 'promo_tk' ? 'Promo TK' : '',
                            m.note,
                          ].filter(Boolean).join(' · ')}
                        </td>
                      </tr>
                    ))}
                    {moves.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Sin movimientos</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} title={typeTitle}>
        <div className="space-y-3">
          <div>
            <label className={LABEL}>Producto *</label>
            <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value ? Number(e.target.value) : '' }))} className={INPUT}>
              <option value="">Selecciona…</option>
              {rows.map((r) => <option key={r.product_id} value={r.product_id}>{r.code}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Cantidad * {form.type === 'ajuste' && <span className="text-slate-400 font-normal">(− resta)</span>}</label>
              <input type="number" step={1} value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Fecha (opcional)</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={INPUT} />
            </div>
          </div>
          {form.type === 'ingreso' && (
            <div>
              <label className={LABEL}>Costo unitario de compra (opcional)</label>
              <input type="number" min={0} step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} placeholder="Para calcular la utilidad" className={INPUT} />
            </div>
          )}
          <div>
            <label className={LABEL}>Nota * <span className="text-slate-400 font-normal">(queda en el kardex y en auditoría)</span></label>
            <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Ej. Reposición 2026-09-03" className={INPUT} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setForm((f) => ({ ...f, open: false }))}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void submit()}>{saving ? 'Guardando…' : 'Registrar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
