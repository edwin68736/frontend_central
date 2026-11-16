import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Ban, FileText, Plus, Search, Trash2, Truck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import SearchSelect from '@/components/ui/SearchSelect'
import { useAuth } from '@/contexts/AuthContext'
import { equiposService } from '@/services/equipos.service'
import { negativeStockItems } from '@/services/equiposOrders.service'
import {
  docNumber, equiposWarehouses, REQUIREMENT_STATUS_LABEL, type RequirementView, type TransferItemInput, type TransferView, type Warehouse, type WarehouseStockRow,
} from '@/services/equiposWarehouses.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { useConfirm } from './ConfirmProvider'
import { fmtDate, SELECT, todayISO } from './ordersCommon'
import { openLabel } from './shippingLabel'
import { buildRequirementDoc, buildTransferDoc } from './warehouseDocs'

type Sub = 'stock' | 'requerimientos' | 'transferencias' | 'almacenes'

const REQ_STYLE: Record<string, string> = {
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200', parcial: 'bg-sky-50 text-sky-700 border-sky-200',
  atendido: 'bg-emerald-50 text-emerald-700 border-emerald-200', anulado: 'bg-slate-100 text-slate-500 border-slate-200',
}
const Pill = ({ cls, children }: { cls: string; children: React.ReactNode }) => <span className={`text-xs rounded-full border px-2 py-0.5 whitespace-nowrap ${cls}`}>{children}</span>

const itemsText = (items: { code: string; quantity: number; sent?: number }[], showSent = false) =>
  items.map((i) => `${i.quantity} × ${i.code}${showSent && i.sent ? ` (${i.sent} enviados)` : ''}`).join(', ')

function openDoc(blob: Blob) {
  if (!openLabel(blob)) toast.error('El navegador bloqueó la ventana del documento; permite las ventanas emergentes')
}

/** Aviso de éxito con un botón para abrir el documento firmable (abrirlo solo tras la petición lo bloquearía el navegador). */
function announce(message: string, build: () => Blob) {
  toast.success(message, { duration: 15000, action: { label: 'Ver documento', onClick: () => openDoc(build()) } })
}

interface ProductOption { value: number; label: string; hint?: string }

/** Líneas producto + cantidad compartidas por el formulario de requerimiento y el de transferencia. */
function ItemLines({ lines, setLines, options, max }: {
  lines: { product_id: number | ''; quantity: string }[]
  setLines: (l: { product_id: number | ''; quantity: string }[]) => void
  options: ProductOption[]
  /** Con un requerimiento, solo se pueden enviar sus productos y hasta lo pendiente. */
  max?: Record<number, number>
}) {
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-start">
          <div className="col-span-8">
            <SearchSelect ariaLabel="Producto" value={l.product_id === '' ? null : l.product_id} placeholder="Elegir producto…" searchPlaceholder="Buscar producto…"
              options={options} onChange={(v) => setLines(lines.map((x, k) => (k === i ? { ...x, product_id: v ? Number(v) : '' } : x)))} />
          </div>
          <div className="col-span-3">
            <input type="number" min={1} step={1} aria-label="Cantidad" value={l.quantity} placeholder="Cant." className={INPUT + ' text-right'}
              onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))} />
            {max && l.product_id !== '' && max[l.product_id] != null && <p className="text-[11px] text-slate-400 text-right">pendiente {max[l.product_id]}</p>}
          </div>
          <button type="button" aria-label="Quitar línea" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, k) => k !== i))}
            className="col-span-1 pt-2.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 size={15} /></button>
        </div>
      ))}
      {!max && <button type="button" className={BTN_SECONDARY} onClick={() => setLines([...lines, { product_id: '', quantity: '' }])}><Plus size={13} /> Agregar producto</button>}
    </div>
  )
}

const toInputs = (lines: { product_id: number | ''; quantity: string }[]): TransferItemInput[] =>
  lines.filter((l) => l.product_id !== '' || l.quantity !== '').map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) }))

function validLines(lines: { product_id: number | ''; quantity: string }[]): string | null {
  const items = toInputs(lines)
  if (items.length === 0) return 'Agrega al menos un producto'
  for (const it of items) {
    if (!it.product_id) return 'Elige el producto de cada línea'
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) return 'Las cantidades deben ser enteros mayores a cero'
  }
  return null
}

export default function WarehousesTab() {
  const { hasPermission } = useAuth()
  const canTransfer = hasPermission('equipos.stock_transfer')
  const canCancel = hasPermission('equipos.stock_transfer_cancel')
  const canAdmin = hasPermission('equipos.warehouses')
  const confirm = useConfirm()
  const [sub, setSub] = useState<Sub>('stock')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((n) => n + 1)

  useEffect(() => {
    equiposWarehouses.list(true).then(setWarehouses).catch((e) => toast.error(apiError(e, 'No se pudieron cargar los almacenes')))
    equiposService.listProducts().then((r) => setProducts(r.products.filter((p) => p.active).map((p) => ({ value: p.id, label: p.code, hint: p.name !== p.code ? p.name : undefined })))).catch(() => setProducts([]))
  }, [tick])
  const active = useMemo(() => warehouses.filter((w) => w.active), [warehouses])
  const main = warehouses.find((w) => w.is_default)

  // Requerimiento que se está atendiendo (abre el formulario de transferencia con sus datos).
  const [attend, setAttend] = useState<RequirementView | null>(null)
  const [trfForm, setTrfForm] = useState(false)
  const [reqForm, setReqForm] = useState(false)

  const subs: { key: Sub; label: string }[] = [
    { key: 'stock', label: 'Stock por almacén' }, { key: 'requerimientos', label: 'Requerimientos' },
    { key: 'transferencias', label: 'Transferencias' }, { key: 'almacenes', label: 'Almacenes' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {subs.map((s) => (
          <button key={s.key} type="button" onClick={() => setSub(s.key)} aria-pressed={sub === s.key}
            className={`px-3 py-1.5 rounded-lg text-sm border ${sub === s.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{s.label}</button>
        ))}
        <p className="text-xs text-slate-400 ml-2">Solo el {main?.name ?? 'Almacén 1'} vende: lo que está en un depósito se transfiere antes de venderse.</p>
      </div>

      {sub === 'stock' && <StockPanel warehouses={active} tick={tick} />}
      {sub === 'requerimientos' && (
        <RequirementsPanel tick={tick} canTransfer={canTransfer} canCancel={canCancel} onNew={() => setReqForm(true)}
          onAttend={(r) => { setAttend(r); setTrfForm(true) }} />
      )}
      {sub === 'transferencias' && (
        <TransfersPanel tick={tick} warehouses={warehouses} products={products} canTransfer={canTransfer} canCancel={canCancel}
          onNew={() => { setAttend(null); setTrfForm(true) }} />
      )}
      {sub === 'almacenes' && <AdminPanel warehouses={warehouses} canAdmin={canAdmin} onChanged={refresh} />}

      <RequirementForm open={reqForm} onClose={() => setReqForm(false)} warehouses={active} products={products}
        onSaved={(r) => { setReqForm(false); refresh(); setSub('requerimientos'); announce(`Requerimiento ${docNumber('RQ', r.number)} registrado`, () => buildRequirementDoc(r)) }} />
      <TransferForm open={trfForm} onClose={() => { setTrfForm(false); setAttend(null) }} warehouses={active} products={products} requirement={attend} confirm={confirm}
        onSaved={(t) => { setTrfForm(false); setAttend(null); refresh(); setSub('transferencias'); announce(`Transferencia ${docNumber('TR', t.number)} registrada`, () => buildTransferDoc(t)) }} />
    </div>
  )
}

/* ───────────────────────── Stock por almacén ───────────────────────── */

function StockPanel({ warehouses, tick }: { warehouses: Warehouse[]; tick: number }) {
  const [rows, setRows] = useState<WarehouseStockRow[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    equiposWarehouses.stock().then(setRows).catch((e) => { toast.error(apiError(e, 'No se pudo cargar el stock')); setRows([]) })
  }, [tick])
  const shown = (rows ?? []).filter((r) => !q.trim() || `${r.code} ${r.name}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código o nombre…" className={INPUT + ' pl-9'} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {rows === null ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2">Código</th><th className="px-3">Producto</th>
              {warehouses.map((w) => <th key={w.id} className="px-3 text-right">{w.name}</th>)}
              <th className="px-3 text-right">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.product_id}>
                  <td className="px-3 py-1.5 font-medium">{r.code}</td>
                  <td className="px-3 text-slate-600">{r.name !== r.code ? r.name : ''}</td>
                  {warehouses.map((w) => { const n = r.by_warehouse[String(w.id)] ?? 0; return <td key={w.id} className={`px-3 text-right tabular-nums ${n < 0 ? 'text-red-600 font-medium' : n === 0 ? 'text-slate-300' : ''}`}>{n}</td> })}
                  <td className="px-3 text-right tabular-nums font-semibold">{r.total}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={warehouses.length + 3} className="px-3 py-10 text-center text-slate-400">Sin productos.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── Requerimientos ───────────────────────── */

function RequirementsPanel({ tick, canTransfer, canCancel, onNew, onAttend }: {
  tick: number; canTransfer: boolean; canCancel: boolean; onNew: () => void; onAttend: (r: RequirementView) => void
}) {
  const confirm = useConfirm()
  const [filter, setFilter] = useState('abiertos')
  const [rows, setRows] = useState<RequirementView[] | null>(null)
  const load = useCallback(() => {
    equiposWarehouses.listRequirements(filter || undefined).then(setRows).catch((e) => { toast.error(apiError(e, 'No se pudieron cargar los requerimientos')); setRows([]) })
  }, [filter])
  useEffect(() => { load() }, [load, tick])

  const cancel = async (r: RequirementView) => {
    const res = await confirm({ title: `Anular requerimiento ${docNumber('RQ', r.number)}`, message: 'Solo se puede anular un requerimiento que todavía no tiene transferencias.', danger: true, pin: true, input: { label: 'Motivo de la anulación', required: true }, confirmLabel: 'Anular' })
    if (!res) return
    try { await equiposWarehouses.cancelRequirement(r.id, res.text, res.pin); toast.success('Requerimiento anulado'); load() } catch (e) { toast.error(apiError(e, 'No se pudo anular')) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[{ k: 'abiertos', l: 'Abiertos' }, { k: 'atendido', l: 'Atendidos' }, { k: '', l: 'Todos' }].map((x) => (
          <button key={x.k} type="button" aria-pressed={filter === x.k} onClick={() => setFilter(x.k)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filter === x.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{x.l}</button>
        ))}
        {canTransfer && <button type="button" className={BTN_PRIMARY + ' ml-auto'} onClick={onNew}><Plus size={15} /> Nuevo requerimiento</button>}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {rows === null ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50"><th className="px-3 py-2">N°</th><th className="px-3">Fecha</th><th className="px-3">Solicita → abastece</th><th className="px-3">Productos</th><th className="px-3">Estado</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className={r.status === 'anulado' ? 'opacity-60' : ''}>
                  <td className="px-3 py-2 font-semibold">{docNumber('RQ', r.number)}</td>
                  <td className="px-3 whitespace-nowrap text-slate-600">{fmtDate(r.requested_at)}</td>
                  <td className="px-3">{r.requesting_name} → {r.supplying_name}<span className="block text-xs text-slate-400">{r.created_by_name}</span></td>
                  <td className="px-3 text-slate-600 max-w-sm">{itemsText(r.items, true)}{r.notes && <span className="block text-xs text-slate-400 truncate" title={r.notes}>{r.notes}</span>}</td>
                  <td className="px-3"><Pill cls={REQ_STYLE[r.status]}>{REQUIREMENT_STATUS_LABEL[r.status]}</Pill>{r.transfers.length > 0 && <span className="block text-xs text-slate-400">{r.transfers.map((n) => docNumber('TR', n)).join(', ')}</span>}</td>
                  <td className="px-3 text-right whitespace-nowrap">
                    <button type="button" className={BTN_SECONDARY} onClick={() => openDoc(buildRequirementDoc(r))}><FileText size={13} /> Documento</button>
                    {canTransfer && (r.status === 'pendiente' || r.status === 'parcial') && <button type="button" className={BTN_PRIMARY + ' ml-1'} onClick={() => onAttend(r)}><Truck size={13} /> Atender</button>}
                    {canCancel && r.status === 'pendiente' && <button type="button" className="ml-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100" onClick={() => void cancel(r)}><Ban size={12} /> Anular</button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">No hay requerimientos en esta vista.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RequirementForm({ open, onClose, warehouses, products, onSaved }: {
  open: boolean; onClose: () => void; warehouses: Warehouse[]; products: ProductOption[]; onSaved: (r: RequirementView) => void
}) {
  const depots = warehouses.filter((w) => !w.is_default)
  const [supplier, setSupplier] = useState<number | ''>('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ product_id: number | ''; quantity: string }[]>([{ product_id: '', quantity: '' }])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setSupplier(depots[0]?.id ?? ''); setDate(todayISO()); setNotes(''); setLines([{ product_id: '', quantity: '' }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const save = async () => {
    if (!supplier) return toast.error('Elige el almacén que abastece')
    const err = validLines(lines)
    if (err) return toast.error(err)
    setSaving(true)
    try { onSaved(await equiposWarehouses.createRequirement({ supplying_warehouse_id: Number(supplier), date, notes: notes.trim(), items: toInputs(lines) })) } catch (e) { toast.error(apiError(e, 'No se pudo registrar el requerimiento')) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nuevo requerimiento" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Pide al depósito los equipos que hacen falta en el Almacén 1. Se genera un documento firmable.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL}>Almacén que abastece *</label>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value ? Number(e.target.value) : '')} className={INPUT}>
              <option value="">Elegir…</option>{depots.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {depots.length === 0 && <p className="text-xs text-amber-700 mt-1">No hay depósitos: crea uno en la pestaña Almacenes.</p>}
          </div>
          <div><label className={LABEL}>Fecha</label><input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} /></div>
        </div>
        <div><label className={LABEL}>Productos *</label><ItemLines lines={lines} setLines={setLines} options={products} /></div>
        <div><label className={LABEL}>Observaciones</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} /></div>
        <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Registrar y generar documento'}</button></div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Transferencias ───────────────────────── */

function TransfersPanel({ tick, warehouses, products, canTransfer, canCancel, onNew }: {
  tick: number; warehouses: Warehouse[]; products: ProductOption[]; canTransfer: boolean; canCancel: boolean; onNew: () => void
}) {
  const confirm = useConfirm()
  const [f, setF] = useState<{ from: string; to: string; warehouse: number | ''; product: number | ''; status: string }>({ from: '', to: '', warehouse: '', product: '', status: '' })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<10 | 25 | 50 | 100>(25)
  const [data, setData] = useState<{ rows: TransferView[]; total: number } | null>(null)
  const load = useCallback(() => {
    equiposWarehouses.listTransfers({
      from: f.from || undefined, to: f.to || undefined, warehouse_id: f.warehouse || undefined, product_id: f.product || undefined,
      status: f.status || undefined, page, per_page: perPage,
    }).then((r) => setData({ rows: r.rows, total: r.total })).catch((e) => { toast.error(apiError(e, 'No se pudo cargar el historial')); setData({ rows: [], total: 0 }) })
  }, [f, page, perPage])
  useEffect(() => { load() }, [load, tick])
  const set = (patch: Partial<typeof f>) => { setPage(1); setF((x) => ({ ...x, ...patch })) }

  const cancel = async (t: TransferView) => {
    const res = await confirm({
      title: `Anular transferencia ${docNumber('TR', t.number)}`,
      message: `Lo enviado volverá a ${t.from_name}. Si ${t.to_name} ya no tiene lo recibido (por ejemplo, porque lo vendió), no se podrá anular.`,
      danger: true, pin: true, input: { label: 'Motivo de la anulación', required: true }, confirmLabel: 'Anular transferencia',
    })
    if (!res) return
    try { await equiposWarehouses.cancelTransfer(t.id, res.text, res.pin); toast.success('Transferencia anulada'); load() } catch (e) { toast.error(apiError(e, 'No se pudo anular la transferencia')) }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className={LABEL}>Desde</label><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className={SELECT} /></div>
        <div><label className={LABEL}>Hasta</label><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} className={SELECT} /></div>
        <div><label className={LABEL}>Almacén</label>
          <select value={f.warehouse} onChange={(e) => set({ warehouse: e.target.value ? Number(e.target.value) : '' })} className={SELECT}><option value="">Todos</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <div className="w-56"><label className={LABEL}>Producto</label>
          <SearchSelect ariaLabel="Producto" value={f.product === '' ? null : f.product} placeholder="Todos" searchPlaceholder="Buscar producto…" clearable options={products} onChange={(v) => set({ product: v ? Number(v) : '' })} /></div>
        <div><label className={LABEL}>Estado</label>
          <select value={f.status} onChange={(e) => set({ status: e.target.value })} className={SELECT}><option value="">Todas</option><option value="registrada">Registradas</option><option value="anulada">Anuladas</option></select></div>
        {canTransfer && <button type="button" className={BTN_PRIMARY + ' ml-auto'} onClick={onNew}><Plus size={15} /> Nueva transferencia</button>}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {data === null ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50"><th className="px-3 py-2">N°</th><th className="px-3">Fecha</th><th className="px-3">Origen → destino</th><th className="px-3">Productos</th><th className="px-3">Requerimiento</th><th className="px-3">Estado</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((t) => (
                <tr key={t.id} className={t.status === 'anulada' ? 'opacity-60' : ''}>
                  <td className="px-3 py-2 font-semibold">{docNumber('TR', t.number)}</td>
                  <td className="px-3 whitespace-nowrap text-slate-600">{fmtDate(t.transferred_at)}</td>
                  <td className="px-3">{t.from_name} → {t.to_name}<span className="block text-xs text-slate-400">{t.created_by_name}</span></td>
                  <td className="px-3 text-slate-600 max-w-sm">{itemsText(t.items)}{t.notes && <span className="block text-xs text-slate-400 truncate" title={t.notes}>{t.notes}</span>}</td>
                  <td className="px-3 text-slate-600">{t.requirement_number ? docNumber('RQ', t.requirement_number) : '—'}</td>
                  <td className="px-3"><Pill cls={t.status === 'anulada' ? REQ_STYLE.anulado : REQ_STYLE.atendido}>{t.status === 'anulada' ? 'Anulada' : 'Registrada'}</Pill>{t.status === 'anulada' && t.cancel_reason && <span className="block text-xs text-slate-400 max-w-40 truncate" title={t.cancel_reason}>{t.cancel_reason}</span>}</td>
                  <td className="px-3 text-right whitespace-nowrap">
                    <button type="button" className={BTN_SECONDARY} onClick={() => openDoc(buildTransferDoc(t))}><FileText size={13} /> Documento</button>
                    {canCancel && t.status === 'registrada' && <button type="button" className="ml-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100" onClick={() => void cancel(t)}><Ban size={12} /> Anular</button>}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">No hay transferencias con esos filtros.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {data && <PaginationBar page={page} perPage={perPage} total={data.total} totalPages={Math.max(1, Math.ceil(data.total / perPage))} onPageChange={setPage} onPerPageChange={(n) => { setPerPage(n); setPage(1) }} itemLabel="transferencias" />}
    </div>
  )
}

function TransferForm({ open, onClose, warehouses, products, requirement, confirm, onSaved }: {
  open: boolean; onClose: () => void; warehouses: Warehouse[]; products: ProductOption[]; requirement: RequirementView | null
  confirm: ReturnType<typeof useConfirm>; onSaved: (t: TransferView) => void
}) {
  const [from, setFrom] = useState<number | ''>('')
  const [to, setTo] = useState<number | ''>('')
  const [date, setDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ product_id: number | ''; quantity: string }[]>([{ product_id: '', quantity: '' }])
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    setDate(todayISO()); setNotes('')
    if (requirement) {
      setFrom(requirement.supplying_warehouse_id); setTo(requirement.requesting_warehouse_id)
      setLines(requirement.items.filter((i) => (i.pending ?? 0) > 0).map((i) => ({ product_id: i.product_id, quantity: String(i.pending) })))
    } else {
      const main = warehouses.find((w) => w.is_default)
      const depot = warehouses.find((w) => !w.is_default)
      setFrom(depot?.id ?? ''); setTo(main?.id ?? ''); setLines([{ product_id: '', quantity: '' }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requirement])
  const pendingMax = requirement ? Object.fromEntries(requirement.items.map((i) => [i.product_id, i.pending ?? 0])) : undefined
  const options = requirement ? products.filter((p) => pendingMax && pendingMax[p.value] != null) : products

  const save = async () => {
    if (!from || !to) return toast.error('Elige el origen y el destino')
    if (from === to) return toast.error('El origen y el destino deben ser distintos')
    const err = validLines(lines)
    if (err) return toast.error(err)
    const body = { from_warehouse_id: Number(from), to_warehouse_id: Number(to), requirement_id: requirement?.id, date, notes: notes.trim(), items: toInputs(lines) }
    setSaving(true)
    try {
      onSaved(await equiposWarehouses.createTransfer(body))
    } catch (e) {
      const neg = negativeStockItems(e)
      if (neg) {
        const res = await confirm({
          title: 'Stock insuficiente en el origen',
          message: `El almacén de origen quedaría en negativo: ${neg.map((n) => `${n.code} (tiene ${n.current}, envías ${n.needed})`).join(', ')}. Puedes transferir igualmente con una nota.`,
          input: { label: 'Nota que justifica el stock negativo', required: true }, confirmLabel: 'Transferir igualmente',
        })
        if (res) {
          try { onSaved(await equiposWarehouses.createTransfer({ ...body, allow_negative: true, negative_note: res.text })) } catch (e2) { toast.error(apiError(e2, 'No se pudo registrar la transferencia')) }
        }
      } else toast.error(apiError(e, 'No se pudo registrar la transferencia'))
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={requirement ? `Atender ${docNumber('RQ', requirement.number)}` : 'Nueva transferencia'} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {requirement && <p className="text-sm text-slate-500">Se envía del {requirement.supplying_name} al {requirement.requesting_name}. Puedes enviar menos de lo pendiente: el requerimiento queda atendido parcialmente.</p>}
        <div className="grid grid-cols-3 gap-3">
          <div><label className={LABEL}>Origen *</label>
            <select value={from} disabled={!!requirement} onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : '')} className={INPUT}><option value="">Elegir…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><label className={LABEL}>Destino *</label>
            <select value={to} disabled={!!requirement} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : '')} className={INPUT}><option value="">Elegir…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div><label className={LABEL}>Fecha</label><input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} /></div>
        </div>
        <div><label className={LABEL}>Productos *</label><ItemLines lines={lines} setLines={setLines} options={options} max={pendingMax} /></div>
        <div><label className={LABEL}>Observaciones</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} /></div>
        <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Transferir y generar documento'}</button></div>
      </div>
    </Modal>
  )
}

/* ───────────────────────── Administración de almacenes ───────────────────────── */

function AdminPanel({ warehouses, canAdmin, onChanged }: { warehouses: Warehouse[]; canAdmin: boolean; onChanged: () => void }) {
  const [form, setForm] = useState<{ open: boolean; id?: number; name: string; notes: string }>({ open: false, name: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    setSaving(true)
    try {
      if (form.id) await equiposWarehouses.update(form.id, { name: form.name.trim(), notes: form.notes.trim() })
      else await equiposWarehouses.create({ name: form.name.trim(), notes: form.notes.trim() })
      toast.success('Almacén guardado'); setForm({ open: false, name: '', notes: '' }); onChanged()
    } catch (e) { toast.error(apiError(e, 'No se pudo guardar el almacén')) } finally { setSaving(false) }
  }
  const toggle = async (w: Warehouse) => {
    try { await equiposWarehouses.update(w.id, { notes: w.notes, active: !w.active }); onChanged() } catch (e) { toast.error(apiError(e, 'No se pudo actualizar')) }
  }
  return (
    <div className="space-y-3">
      {canAdmin && <div className="flex"><button type="button" className={BTN_PRIMARY + ' ml-auto'} onClick={() => setForm({ open: true, name: '', notes: '' })}><Plus size={15} /> Nuevo almacén</button></div>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50"><th className="px-3 py-2">Código</th><th className="px-3">Nombre</th><th className="px-3">Rol</th><th className="px-3">Notas</th><th className="px-3">Estado</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {warehouses.map((w) => (
              <tr key={w.id} className={w.active ? '' : 'opacity-60'}>
                <td className="px-3 py-2 font-medium">{w.code}</td><td className="px-3">{w.name}</td>
                <td className="px-3 text-slate-600">{w.is_default ? 'Operativo (vende)' : 'Depósito'}</td>
                <td className="px-3 text-slate-500">{w.notes}</td>
                <td className="px-3"><Pill cls={w.active ? REQ_STYLE.atendido : REQ_STYLE.anulado}>{w.active ? 'Activo' : 'Inactivo'}</Pill></td>
                <td className="px-3 text-right whitespace-nowrap">{canAdmin && <>
                  <button type="button" className={BTN_SECONDARY} onClick={() => setForm({ open: true, id: w.id, name: w.name, notes: w.notes })}>Editar</button>
                  {!w.is_default && <button type="button" className={BTN_SECONDARY + ' ml-1'} onClick={() => void toggle(w)}>{w.active ? 'Desactivar' : 'Activar'}</button>}
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={form.open} onClose={() => setForm({ open: false, name: '', notes: '' })} title={form.id ? 'Editar almacén' : 'Nuevo almacén'}>
        <div className="space-y-3">
          <div><label className={LABEL}>Nombre *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} /></div>
          <div><label className={LABEL}>Notas</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT} /></div>
          <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => setForm({ open: false, name: '', notes: '' })}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
        </div>
      </Modal>
    </div>
  )
}
