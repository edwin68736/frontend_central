import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Printer, FileText, Plug, RefreshCw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { equiposOrders, type OrderView } from '@/services/equiposOrders.service'
import {
  clampSize, DEFAULT_LABEL_SIZE, LABEL_SIZE_MAX, LABEL_SIZE_MIN, LABEL_SIZE_PRESETS, loadLabelPrinter, loadLabelSize,
  saveLabelPrinter, saveLabelSize, type LabelPrinterChoice, type LabelSize,
} from '@/lib/labelPrint/settings'
import { getPrintServerStatus, listPrintServerPrinters, pairPrintServer, PRINT_SERVER_CHANGED_EVENT, type PrintServerStatus } from '@/lib/labelPrint/printServer'
import { printerConfigError, printerFitError, printLabelCanvases } from '@/lib/labelPrint/print'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { buildLabelSheet, openLabel, paintShippingLabel } from './shippingLabel'

export const MAX_LABELS = 60

interface Props {
  /** Pedidos a rotular; vacío = cerrado. */
  ids: number[]
  onClose: () => void
  /** Se llama tras generar o imprimir los rótulos (para refrescar la lista). */
  onDone?: () => void
}

/**
 * Impresión de rótulos de envío: tamaño ajustable (por defecto 10 × 10 cm), PDF o impresión directa a la etiquetadora (TSPL)
 * o ticketera por el Servidor de impresión Tukifac, igual que el generador de etiquetas de Tukifac.
 */
export default function LabelPrintModal({ ids, onClose, onDone }: Props) {
  const open = ids.length > 0
  const [orders, setOrders] = useState<OrderView[]>([])
  const [loading, setLoading] = useState(false)
  const [size, setSize] = useState<LabelSize>(loadLabelSize)
  const [printer, setPrinter] = useState<LabelPrinterChoice>(loadLabelPrinter)
  const [server, setServer] = useState<PrintServerStatus | null>(null)
  const [printers, setPrinters] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const preview = useRef<HTMLCanvasElement | null>(null)
  const abort = useRef<AbortController | null>(null)

  const updateSize = (patch: Partial<LabelSize>) => setSize((s) => { const n = { ...s, ...patch }; saveLabelSize({ width: clampSize(n.width), height: clampSize(n.height) }); return n })
  const updatePrinter = (patch: Partial<LabelPrinterChoice>) => setPrinter((p) => { const n = { ...p, ...patch }; saveLabelPrinter(n); return n })
  const validSize: LabelSize = { width: clampSize(size.width), height: clampSize(size.height) }

  // Carga los pedidos (solo los confirmados y con envío tienen rótulo)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    Promise.all(ids.map((id) => equiposOrders.getOrder(id)))
      .then((views) => {
        if (cancelled) return
        const ok = views.filter((v) => v.status === 'registrado' && v.shipment).sort((a, b) => a.order_number - b.order_number)
        if (ok.length < views.length) toast.warning(`${views.length - ok.length} pedido(s) sin envío confirmado se omitieron`)
        if (ok.length === 0) { toast.error('Ninguno de los pedidos elegidos tiene un envío confirmado'); onClose() }
        setOrders(ok)
      })
      .catch((e) => { if (!cancelled) { toast.error(apiError(e, 'No se pudieron cargar los pedidos')); onClose() } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids.join(',')])

  const refreshServer = useCallback(async () => {
    const st = await getPrintServerStatus()
    setServer(st)
    if (st.reachable && st.paired) listPrintServerPrinters().then(setPrinters).catch(() => setPrinters([]))
  }, [])
  useEffect(() => {
    if (!open) return
    void refreshServer()
    window.addEventListener(PRINT_SERVER_CHANGED_EVENT, refreshServer)
    return () => window.removeEventListener(PRINT_SERVER_CHANGED_EVENT, refreshServer)
  }, [open, refreshServer])

  // Vista previa del primer rótulo a la resolución de la impresora
  useEffect(() => {
    if (!open || loading || !preview.current) return
    paintShippingLabel(preview.current, orders[0] ?? null, validSize, printer.language === 'tspl' ? printer.dotsPerMm : 8)
  }, [open, loading, orders, validSize.width, validSize.height, printer.language, printer.dotsPerMm]) // eslint-disable-line react-hooks/exhaustive-deps

  const pair = async () => {
    setBusy('pair')
    try {
      toast.info('Acepta el cuadro que aparece en Windows para vincular este navegador', { duration: 8000 })
      await pairPrintServer()
      toast.success('Servidor de impresión vinculado')
      await refreshServer()
    } catch (e) { toast.error(apiError(e, 'No se pudo vincular')) } finally { setBusy(null) }
  }

  const markPrinted = async () => {
    await Promise.allSettled(orders.map((v) => equiposOrders.labelPrinted(v.id)))
    onDone?.()
  }

  const makePdf = async () => {
    if (orders.length > MAX_LABELS) return void toast.error(`Máximo ${MAX_LABELS} rótulos por impresión`)
    if (!openLabel(buildLabelSheet(orders, validSize))) return void toast.error('El navegador bloqueó la ventana del PDF; permite las ventanas emergentes')
    await markPrinted()
    toast.success(`${orders.length} rótulo(s) generado(s)`)
  }

  const fitErr = printerFitError(validSize, printer)
  const cfgErr = printerConfigError(printer)
  const canSend = server?.reachable && server.paired && !cfgErr && !fitErr

  const send = async (test: boolean) => {
    if (orders.length > MAX_LABELS) return void toast.error(`Máximo ${MAX_LABELS} rótulos por impresión`)
    abort.current = new AbortController()
    setBusy(test ? 'test' : 'print')
    setProgress(null)
    const dpm = printer.language === 'tspl' ? printer.dotsPerMm : 8
    try {
      const count = test ? 1 : orders.length
      await printLabelCanvases(count, (canvas, i) => paintShippingLabel(canvas, test ? (orders[0] ?? null) : orders[i], validSize, dpm, test), validSize, printer, {
        signal: abort.current.signal, onProgress: (d, t) => setProgress([d, t]),
      })
      if (test) toast.success('Etiqueta de prueba enviada: mide el marco con una regla para calibrar')
      else { await markPrinted(); toast.success(`${orders.length} rótulo(s) enviado(s) a la impresora`) }
    } catch (e) {
      toast.error(apiError(e, 'No se pudo imprimir'))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const sizeOk = validSize.width === size.width && validSize.height === size.height
  const SELECT_CLS = INPUT

  return (
    <Modal open={open} onClose={() => { abort.current?.abort(); onClose() }} title={`Imprimir rótulos${orders.length ? ` (${orders.length})` : ''}`} maxWidth="max-w-3xl">
      {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <div className="space-y-5">
          {/* 1. Tamaño */}
          <section>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">1. Tamaño del rótulo</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-1.5">
                {LABEL_SIZE_PRESETS.map((p) => {
                  const active = p.size.width === validSize.width && p.size.height === validSize.height
                  return <button key={p.label} type="button" aria-pressed={active} onClick={() => updateSize(p.size)} className={`px-3 py-1.5 rounded-lg text-sm border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{p.label}</button>
                })}
              </div>
              <div><label className={LABEL}>Ancho (mm)</label><input type="number" aria-label="Ancho en mm" min={LABEL_SIZE_MIN} max={LABEL_SIZE_MAX} step="1" value={size.width} onChange={(e) => updateSize({ width: Number(e.target.value) })} className={INPUT} style={{ width: '6.5rem' }} /></div>
              <div><label className={LABEL}>Alto (mm)</label><input type="number" aria-label="Alto en mm" min={LABEL_SIZE_MIN} max={LABEL_SIZE_MAX} step="1" value={size.height} onChange={(e) => updateSize({ height: Number(e.target.value) })} className={INPUT} style={{ width: '6.5rem' }} /></div>
              <button type="button" className="text-xs text-slate-500 underline pb-3" onClick={() => updateSize(DEFAULT_LABEL_SIZE)}>Restablecer 10 × 10 cm</button>
            </div>
            <p className={`text-xs mt-1 ${sizeOk ? 'text-slate-500' : 'text-amber-600'}`}>
              {sizeOk ? `Entre ${LABEL_SIZE_MIN} y ${LABEL_SIZE_MAX} mm. El contenido se adapta: los textos se reducen para caber.` : `Se usará ${validSize.width} × ${validSize.height} mm (rango permitido ${LABEL_SIZE_MIN}–${LABEL_SIZE_MAX} mm).`}
            </p>
            <div className="mt-2 rounded-lg bg-slate-100 p-3 overflow-auto max-h-80 flex justify-center">
              <canvas ref={preview} aria-label="Vista previa del rótulo" style={{ width: Math.min(320, validSize.width * 3.2), height: 'auto', aspectRatio: `${validSize.width} / ${validSize.height}`, background: '#fff', boxShadow: '0 0 0 1px #cbd5e1' }} />
            </div>
          </section>

          {/* 2. Impresión directa */}
          <section className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">2. Imprimir directo en la etiquetadora</h3>
              <button type="button" className="text-slate-400 hover:text-slate-600" title="Volver a consultar el servidor de impresión" aria-label="Actualizar estado del servidor de impresión" onClick={() => void refreshServer()}><RefreshCw size={14} /></button>
            </div>
            {server === null ? <p className="text-xs text-slate-400">Consultando el servidor de impresión…</p>
              : !server.reachable ? <p className="text-xs text-amber-700">No se encontró el Servidor de impresión Tukifac en este equipo. Instálalo y ábrelo, o usa «Generar PDF».</p>
              : !server.paired ? (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-600">El servidor de impresión está activo, pero este navegador aún no está vinculado.</p>
                  <button type="button" className={BTN_SECONDARY} disabled={busy === 'pair'} onClick={() => void pair()}><Plug size={14} /> {busy === 'pair' ? 'Esperando…' : 'Conectar'}</button>
                </div>
              ) : <p className="text-xs text-emerald-700">Servidor de impresión vinculado{server.version ? ` (v${server.version})` : ''}.</p>}

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Conexión</label>
                <select aria-label="Conexión" value={printer.connection} onChange={(e) => updatePrinter({ connection: e.target.value as 'windows' | 'network' })} className={SELECT_CLS}>
                  <option value="windows">Impresora de Windows (USB)</option>
                  <option value="network">Red (IP)</option>
                </select>
              </div>
              {printer.connection === 'windows' ? (
                <div className="sm:col-span-2">
                  <label className={LABEL}>Impresora</label>
                  <select aria-label="Impresora" value={printer.printerName} onChange={(e) => updatePrinter({ printerName: e.target.value })} className={SELECT_CLS}>
                    <option value="">Elegir impresora…</option>
                    {printers.map((p) => <option key={p} value={p}>{p}</option>)}
                    {printer.printerName && !printers.includes(printer.printerName) && <option value={printer.printerName}>{printer.printerName}</option>}
                  </select>
                </div>
              ) : (
                <>
                  <div><label className={LABEL}>IP de la impresora</label><input aria-label="IP de la impresora" value={printer.tcpHost} onChange={(e) => updatePrinter({ tcpHost: e.target.value })} placeholder="192.168.1.50" className={INPUT} /></div>
                  <div><label className={LABEL}>Puerto</label><input type="number" aria-label="Puerto" value={printer.tcpPort} onChange={(e) => updatePrinter({ tcpPort: Number(e.target.value) || 9100 })} className={INPUT} /></div>
                </>
              )}
              <div>
                <label className={LABEL}>Tipo de impresora</label>
                <select aria-label="Tipo de impresora" value={printer.language} onChange={(e) => updatePrinter({ language: e.target.value as 'tspl' | 'escpos' })} className={SELECT_CLS}>
                  <option value="tspl">Etiquetas, modo etiqueta (TSPL: Hoin, Xprinter, TSC…)</option>
                  <option value="escpos">Ticketera (ESC/POS)</option>
                </select>
              </div>
              {printer.language === 'tspl' ? (
                <>
                  <div><label className={LABEL}>Espacio entre etiquetas (mm)</label><input type="number" aria-label="Espacio entre etiquetas" min={0} max={10} step="0.5" value={printer.rollGapMm} onChange={(e) => updatePrinter({ rollGapMm: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })} className={INPUT} /></div>
                  <div>
                    <label className={LABEL}>Resolución</label>
                    <select aria-label="Resolución" value={printer.dotsPerMm} onChange={(e) => updatePrinter({ dotsPerMm: Number(e.target.value) })} className={SELECT_CLS}>
                      <option value={8}>203 dpi (la mayoría)</option>
                      <option value={12}>300 dpi</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={LABEL}>Ancho del rollo</label>
                    <select aria-label="Ancho del rollo" value={printer.paperWidthMm} onChange={(e) => updatePrinter({ paperWidthMm: Number(e.target.value) === 58 ? 58 : 80 })} className={SELECT_CLS}>
                      <option value={80}>80 mm</option><option value={58}>58 mm</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Al terminar cada etiqueta</label>
                    <select aria-label="Al terminar" value={printer.after} onChange={(e) => updatePrinter({ after: e.target.value as LabelPrinterChoice['after'] })} className={SELECT_CLS}>
                      <option value="cut">Cortar</option><option value="feed">Avanzar</option><option value="gap">Ir a la siguiente etiqueta</option><option value="none">Nada</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            {fitErr && <p className="text-xs text-amber-700">{fitErr}</p>}
            {!fitErr && printer.language === 'tspl' && <p className="text-xs text-slate-500">Se imprimirán etiquetas de {validSize.width} × {validSize.height} mm (la impresora debe estar en modo etiqueta). Si no sale bien, usa «Etiqueta de prueba» para calibrar.</p>}
            {progress && <p className="text-xs text-slate-600">Enviando… {progress[0]} de {progress[1]}</p>}
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => { abort.current?.abort(); onClose() }}>Cerrar</button>
            <button type="button" className={BTN_SECONDARY} disabled={busy !== null || orders.length === 0} onClick={() => void makePdf()}><FileText size={14} /> Generar PDF</button>
            <button type="button" className={BTN_SECONDARY} disabled={busy !== null || !canSend || orders.length === 0} onClick={() => void send(true)}>{busy === 'test' ? 'Enviando…' : 'Etiqueta de prueba'}</button>
            <button type="button" className={BTN_PRIMARY} disabled={busy !== null || !canSend || orders.length === 0} onClick={() => void send(false)}><Printer size={14} /> {busy === 'print' ? 'Imprimiendo…' : `Imprimir (${orders.length})`}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
