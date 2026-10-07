import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload, XCircle } from 'lucide-react'
import { readXlsx } from 'hucre'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import { useConfirm } from './ConfirmProvider'
import { usePaging } from './hooks'
import {
  equiposService,
  type ImportBatch,
  type ImportIssue,
  type ImportPayload,
  type ImportPreview,
  type ImportStockCols,
} from '@/services/equipos.service'
import { apiError, BTN_PRIMARY, formatDateTime } from './common'

type SheetKey = keyof ImportPayload['sheets']

/** Cómo se reconoce cada hoja del libro por su nombre (sin tildes ni emojis). */
const SHEET_MATCH: Record<SheetKey, string> = {
  catalogo: 'catalogo',
  combos: 'composicion',
  detalle: 'detalle',
  envios: 'control de envios',
  retornos: 'retornos',
  stock: 'stock maestro',
}

const SHEET_LABEL: Record<SheetKey, string> = {
  catalogo: 'Catálogo',
  combos: 'Composición de Combos',
  detalle: 'Detalle de Pedidos',
  envios: 'Control de Envíos',
  retornos: 'Retornos',
  stock: 'Stock Maestro',
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Valor de celda → JSON: las fechas viajan como texto ISO; el backend las interpreta. */
function toJson(v: unknown): unknown {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return String(v)
  return v
}

async function readWorkbook(file: File): Promise<{ payload: ImportPayload; missing: SheetKey[] }> {
  const wb = await readXlsx(new Uint8Array(await file.arrayBuffer()))
  const sheets = {} as ImportPayload['sheets']
  const missing: SheetKey[] = []
  ;(Object.keys(SHEET_MATCH) as SheetKey[]).forEach((key) => {
    const sh = wb.sheets.find((s) => fold(s.name).includes(SHEET_MATCH[key]))
    if (!sh) {
      missing.push(key)
      sheets[key] = []
      return
    }
    const rows = (sh.rows ?? []).map((r) => (r as unknown[]).map(toJson))
    while (rows.length && rows[rows.length - 1].every((c) => c == null || c === '')) rows.pop()
    sheets[key] = rows
  })
  return { payload: { file_name: file.name, sheets }, missing }
}

const SEVERITY_STYLE: Record<ImportIssue['severity'], string> = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-slate-50 border-slate-200 text-slate-600',
}

function SeverityIcon({ s }: { s: ImportIssue['severity'] }) {
  if (s === 'error') return <XCircle size={14} className="shrink-0 mt-0.5 text-red-600" />
  if (s === 'warning') return <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
  return <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
}

const COLS: { key: keyof ImportStockCols; label: string }[] = [
  { key: 'opening', label: 'Inicial' },
  { key: 'direct_independiente', label: 'Dir. Indep.' },
  { key: 'direct_promo_tk', label: 'Dir. Promo' },
  { key: 'combo_independiente', label: 'Combo Indep.' },
  { key: 'combo_promo_tk', label: 'Combo Promo' },
  { key: 'total_out', label: 'Total sal.' },
  { key: 'reingresos', label: 'Reingr.' },
  { key: 'current', label: 'Actual' },
]

export default function ImportTab() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [payload, setPayload] = useState<ImportPayload | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState<'' | 'leer' | 'importar'>('')
  const [sevFilter, setSevFilter] = useState<'' | ImportIssue['severity']>('')
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const confirm = useConfirm()
  const [done, setDone] = useState<ImportBatch | null>(null)

  const loadBatches = useCallback(() => {
    void equiposService.importBatches().then(setBatches).catch(() => undefined)
  }, [])
  useEffect(loadBatches, [loadBatches])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('leer')
    setPreview(null)
    setDone(null)
    try {
      const { payload: p, missing } = await readWorkbook(file)
      if (missing.length > 0) {
        toast.error(`Faltan hojas en el libro: ${missing.map((m) => SHEET_LABEL[m]).join(', ')}`)
        return
      }
      setPayload(p)
      setPreview(await equiposService.importPreview(p))
    } catch (err) {
      toast.error(apiError(err, 'No se pudo leer el archivo. ¿Es el libro «CONTROL DE EQUIPOS» (.xlsx)?'))
    } finally {
      setBusy('')
    }
  }

  const commit = async () => {
    if (!payload || !preview?.can_commit) return
    if (!(await confirm({ title: `Importar ${preview.period}`, message: `Se importarán ${preview.counts.orders} pedidos, ${preview.counts.payments} cobros y ${preview.counts.movements} movimientos de stock. La importación es definitiva para este mes.`, confirmLabel: 'Importar' }))) return
    setBusy('importar')
    try {
      const r = await equiposService.importCommit(payload)
      setDone(r.batch)
      setPreview(null)
      setPayload(null)
      toast.success(`Período ${r.batch.period} importado`)
      loadBatches()
    } catch (err) {
      toast.error(apiError(err, 'No se pudo importar el libro'))
    } finally {
      setBusy('')
    }
  }

  const shown = (preview?.issues ?? []).filter((i) => !sevFilter || i.severity === sevFilter)
  const issuesP = usePaging(shown, 25)
  const batchesP = usePaging(batches, 10)
  const mismatches = preview?.reconciliation.filter((r) => !r.match) ?? []

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-800">Importar el Excel de control</h2>
            <p className="text-sm text-slate-500 mt-1">
              Sube el libro mensual «CONTROL DE EQUIPOS». Se revisa todo primero (nada se guarda) y solo se puede importar si el stock que calcula el sistema
              <strong> coincide exactamente</strong> con el Stock Maestro del Excel. Cada mes se importa una sola vez.
            </p>
          </div>
          <div>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void onFile(e)} />
            <button type="button" className={BTN_PRIMARY} disabled={busy !== ''} onClick={() => inputRef.current?.click()}>
              {busy === 'leer' ? <Spinner /> : <Upload size={16} />} {payload ? 'Elegir otro archivo' : 'Elegir archivo .xlsx'}
            </button>
          </div>
        </div>
      </section>

      {done && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Período {done.period} importado</p>
            <p>{done.orders} pedidos · {done.payments} cobros · {done.returns} retornos · {done.movements} movimientos de stock · {done.products} productos y {done.combos} combos.</p>
          </div>
        </div>
      )}

      {preview && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Período', preview.period],
              ['Pedidos', `${preview.counts.orders} (${preview.counts.items} ítems)`],
              ['Ventas', `S/ ${preview.sales_total.toFixed(2)}`],
              ['Cobrado', `S/ ${preview.collected_total.toFixed(2)}`],
              ['Productos / combos', `${preview.counts.products} (${preview.counts.new_products} nuevos) / ${preview.counts.combos}`],
              ['Clientes nuevos', `${preview.counts.new_customers} · ${preview.counts.orders_without_customer} sin documento`],
              ['Retornos', String(preview.counts.returns)],
              ['Movimientos de stock', String(preview.counts.movements)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">{k}</p>
                <p className="text-base font-semibold text-slate-800 tabular-nums">{v}</p>
              </div>
            ))}
          </section>

          <section className={`rounded-xl border p-4 ${preview.can_commit ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-sm">
                {preview.can_commit ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" /> : <XCircle size={18} className="text-red-600 mt-0.5" />}
                <div>
                  <p className={`font-semibold ${preview.can_commit ? 'text-emerald-800' : 'text-red-800'}`}>
                    {preview.can_commit ? 'Listo para importar: el stock coincide con el Stock Maestro' : 'No se puede importar todavía'}
                  </p>
                  {!preview.can_commit && <ul className="list-disc ml-5 text-red-700">{(preview.blocked_by ?? []).map((b) => <li key={b}>{b}</li>)}</ul>}
                </div>
              </div>
              <button type="button" className={BTN_PRIMARY} disabled={!preview.can_commit || busy !== ''} onClick={() => void commit()}>
                {busy === 'importar' ? <Spinner /> : <FileSpreadsheet size={16} />} Importar {preview.period}
              </button>
            </div>
          </section>

          {mismatches.length > 0 && (
            <section className="bg-white rounded-xl border border-red-200 overflow-x-auto">
              <h3 className="px-4 py-3 text-sm font-semibold text-red-800 border-b border-red-100">Productos que no coinciden con el Stock Maestro ({mismatches.length})</h3>
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2" />{COLS.map((c) => <th key={c.key} className="px-3 py-2 text-right">{c.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mismatches.flatMap((r) => [
                    <tr key={`${r.code}-x`}><td rowSpan={2} className="px-3 py-1.5 font-medium">{r.code}</td><td className="px-3 py-1 text-slate-400">Excel</td>{COLS.map((c) => <td key={c.key} className="px-3 py-1 text-right">{r.excel[c.key]}</td>)}</tr>,
                    <tr key={`${r.code}-s`}><td className="px-3 py-1 text-slate-400">Sistema</td>{COLS.map((c) => <td key={c.key} className={`px-3 py-1 text-right ${r.excel[c.key] !== r.system[c.key] ? 'font-semibold text-red-600' : ''}`}>{r.system[c.key]}</td>)}</tr>,
                  ])}
                </tbody>
              </table>
            </section>
          )}

          <section className="bg-white rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mr-2">Hallazgos de la lectura</h3>
              {([['', `Todos (${preview.issues.length})`], ['error', `Errores (${preview.severity_counts.error ?? 0})`], ['warning', `Advertencias (${preview.severity_counts.warning ?? 0})`], ['info', `Normalizaciones (${preview.severity_counts.info ?? 0})`]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setSevFilter(v)} className={`px-2.5 py-1 rounded-full text-xs border ${sevFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
            <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {issuesP.rows.map((i, idx) => (
                <li key={idx} className={`flex gap-2 px-4 py-2 text-sm border-l-4 ${SEVERITY_STYLE[i.severity]}`}>
                  <SeverityIcon s={i.severity} />
                  <span className="flex-1">{i.message}</span>
                  {i.sheet && <span className="text-xs text-slate-400 whitespace-nowrap">{SHEET_LABEL[i.sheet as SheetKey] ?? i.sheet}{i.row ? ` · fila ${i.row}` : ''}</span>}
                </li>
              ))}
              {shown.length === 0 && <li className="px-4 py-8 text-center text-slate-400 text-sm">Sin hallazgos en esta categoría.</li>}
            </ul>
            {shown.length > 0 && <PaginationBar {...issuesP.barProps} itemLabel="hallazgos" />}
            {preview.issues_truncated && <p className="px-4 py-2 text-xs text-slate-400">Se muestran los primeros hallazgos (los errores van primero).</p>}
          </section>
        </>
      )}

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100">Meses ya importados</h3>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr><th className="px-4 py-2 text-left">Período</th><th className="px-4 py-2 text-left">Archivo</th><th className="px-4 py-2 text-right">Pedidos</th><th className="px-4 py-2 text-right">Cobros</th><th className="px-4 py-2 text-right">Movimientos</th><th className="px-4 py-2 text-left">Fecha</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batchesP.rows.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2 font-medium">{b.period}</td>
                <td className="px-4 py-2 text-slate-500">{b.file_name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.orders}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.payments}</td>
                <td className="px-4 py-2 text-right tabular-nums">{b.movements}</td>
                <td className="px-4 py-2 text-slate-500">{formatDateTime(b.created_at)}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Aún no se importó ningún mes.</td></tr>}
          </tbody>
        </table>
        {batches.length > 0 && <PaginationBar {...batchesP.barProps} itemLabel="meses" />}
      </section>
    </div>
  )
}
