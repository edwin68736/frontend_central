import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { readXlsx, writeXlsx } from 'hucre'
import Modal from '@/components/ui/Modal'
import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { equiposService, EQUIP_KIND_LABEL, type CatalogImportResult, type CatalogImportRow } from '@/services/equipos.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY } from './common'

const HEADERS = ['Código *', 'Nombre *', 'Tipo', 'Precio de referencia', 'Umbral amarillo', 'Umbral verde', 'Activo', 'Notas']
const FIELDS = ['code', 'name', 'kind', 'reference_price', 'yellow_threshold', 'green_threshold', 'active', 'notes'] as const
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
// Alias aceptados por columna (ya sin tildes ni símbolos).
const ALIASES: Record<string, string[]> = {
  code: ['codigo', 'code', 'sku'],
  name: ['nombre', 'name', 'descripcion'],
  kind: ['tipo', 'kind'],
  reference_price: ['precio de referencia', 'precio referencia', 'precio'],
  yellow_threshold: ['umbral amarillo', 'amarillo'],
  green_threshold: ['umbral verde', 'verde'],
  active: ['activo', 'estado'],
  notes: ['notas', 'nota', 'observaciones'],
}
const ACTION_LABEL: Record<string, string> = { crear: 'Nuevo', actualizar: 'Actualiza', sin_cambios: 'Sin cambios', error: 'Error' }
const ACTION_STYLE: Record<string, string> = {
  crear: 'bg-emerald-50 text-emerald-700',
  actualizar: 'bg-blue-50 text-blue-700',
  sin_cambios: 'bg-slate-100 text-slate-500',
  error: 'bg-red-50 text-red-700',
}

export async function downloadCatalogTemplate() {
  const kinds = Object.keys(EQUIP_KIND_LABEL).join(', ')
  const bytes = await writeXlsx({
    sheets: [
      { name: 'Productos', rows: [HEADERS, ['TK-E583', 'Impresora térmica 80mm', 'equipo', 350, 2, 5, 'SI', 'Ejemplo: borra o reemplaza esta fila']] },
      {
        name: 'Instrucciones',
        rows: [
          ['Plantilla de catálogo de equipos'],
          [''],
          ['Llena la hoja «Productos», una fila por producto, y súbela con «Importar Excel». Verás una vista previa antes de guardar.'],
          [''],
          ['Código *', 'Obligatorio, único (máx. 60). Si ya existe en el catálogo (sin distinguir mayúsculas) se ACTUALIZA ese producto.'],
          ['Nombre *', 'Obligatorio (máx. 150).'],
          ['Tipo', `Uno de: ${kinds}. Vacío = «equipo» en productos nuevos; en existentes se conserva el actual.`],
          ['Precio de referencia', 'Número ≥ 0 (acepta 12.50 o 12,50). Vacío = sin cambio.'],
          ['Umbral amarillo / verde', 'Enteros ≥ 0 del semáforo de stock; el amarillo no puede superar al verde.'],
          ['Activo', 'SI o NO. Vacío = activo en nuevos; en existentes se conserva.'],
          ['Notas', 'Texto libre (máx. 255). Vacío = sin cambio.'],
          [''],
          ['Reglas', 'Las celdas vacías de un producto existente NO borran su valor. Nunca se eliminan productos ni se toca el stock. Reimportar el mismo archivo no duplica nada.'],
          ['Combos', 'Los combos no se importan por esta plantilla: se crean desde «Nuevo combo».'],
        ],
      },
    ],
  })
  downloadXlsxBytes(bytes, 'plantilla-catalogo-equipos.xlsx')
}

const cell = (v: unknown): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

async function readCatalogRows(file: File): Promise<CatalogImportRow[]> {
  const wb = await readXlsx(new Uint8Array(await file.arrayBuffer()))
  const sh = wb.sheets.find((s) => fold(s.name).includes('producto')) ?? wb.sheets.find((s) => !fold(s.name).includes('instruc')) ?? wb.sheets[0]
  const all = ((sh?.rows ?? []) as unknown[][]).map((r) => r.map(cell))
  const hi = all.findIndex((r) => r.some((c) => ALIASES.code.includes(fold(c))))
  if (hi < 0) throw new Error('No encontré la columna «Código». Usa la plantilla descargable.')
  const idx: Record<string, number> = {}
  all[hi].forEach((h, i) => {
    const f = fold(h)
    for (const [field, names] of Object.entries(ALIASES)) if (idx[field] == null && names.includes(f)) idx[field] = i
  })
  if (idx.name == null) throw new Error('No encontré la columna «Nombre». Usa la plantilla descargable.')
  const get = (r: string[], f: string) => (idx[f] == null ? '' : r[idx[f]] ?? '')
  const out: CatalogImportRow[] = []
  all.slice(hi + 1).forEach((r, i) => {
    if (r.every((c) => c === '')) return
    out.push({ row: hi + i + 2, ...(Object.fromEntries(FIELDS.map((f) => [f, get(r, f)])) as Omit<CatalogImportRow, 'row'>) })
  })
  return out
}

export default function CatalogImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<CatalogImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<CatalogImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    setRows([]); setPreview(null); setFileName('')
    onClose()
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const parsed = await readCatalogRows(file)
      if (parsed.length === 0) throw new Error('El archivo no trae productos.')
      setRows(parsed)
      setFileName(file.name)
      setPreview(await equiposService.importCatalog(parsed, false))
    } catch (err) {
      setRows([]); setPreview(null)
      toast.error(apiError(err, err instanceof Error ? err.message : 'No se pudo leer el archivo'))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    setBusy(true)
    try {
      const r = await equiposService.importCatalog(rows, true)
      toast.success(`Catálogo importado: ${r.created} nuevos, ${r.updated} actualizados${r.errors ? `, ${r.errors} omitidos por error` : ''}`)
      onDone()
      close()
    } catch (err) {
      toast.error(apiError(err, 'No se pudo importar el catálogo'))
    } finally {
      setBusy(false)
    }
  }

  const writable = preview ? preview.created + preview.updated : 0
  const sorted = preview ? [...preview.items].sort((a, b) => Number(b.action === 'error') - Number(a.action === 'error')) : []

  return (
    <Modal open={open} onClose={close} title="Importar catálogo desde Excel" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => void downloadCatalogTemplate()}><Download size={14} /> Descargar plantilla</button>
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void onFile(e)} />
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={15} /> {fileName ? 'Elegir otro archivo' : 'Elegir archivo'}</button>
          {fileName && <span className="text-xs text-slate-500 flex items-center gap-1"><FileSpreadsheet size={13} /> {fileName}</span>}
        </div>
        {!preview && <p className="text-xs text-slate-500">Descarga la plantilla, complétala y súbela. Se mostrará una vista previa y solo se guardará al confirmar. Un código que ya existe se actualiza (sin borrar ni tocar stock); las celdas vacías conservan el valor actual.</p>}
        {preview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
              <div className="rounded-lg bg-emerald-50 text-emerald-700 py-2"><b className="block text-lg">{preview.created}</b>nuevos</div>
              <div className="rounded-lg bg-blue-50 text-blue-700 py-2"><b className="block text-lg">{preview.updated}</b>actualizan</div>
              <div className="rounded-lg bg-slate-100 text-slate-600 py-2"><b className="block text-lg">{preview.unchanged}</b>sin cambios</div>
              <div className="rounded-lg bg-red-50 text-red-700 py-2"><b className="block text-lg">{preview.errors}</b>con error</div>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase sticky top-0">
                  <tr><th className="px-3 py-2 text-left">Fila</th><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Resultado</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((it) => (
                    <tr key={it.row}>
                      <td className="px-3 py-1.5 text-slate-500 tabular-nums">{it.row}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800">{it.code || '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{it.name || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ACTION_STYLE[it.action]}`}>{ACTION_LABEL[it.action]}</span>
                        {it.error && <span className="block text-xs text-red-600 mt-0.5">{it.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.errors > 0 && <p className="text-xs text-amber-700">Las filas con error se omiten; corrígelas en el Excel y vuelve a importar si las necesitas.</p>}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN_SECONDARY} onClick={close}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy || writable === 0} onClick={() => void commit()}>
            {busy ? 'Procesando…' : writable ? `Confirmar e importar (${writable})` : 'Nada que importar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
