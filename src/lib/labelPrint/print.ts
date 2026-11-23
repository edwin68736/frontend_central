import { afterLabelBytes, rgbaToEscPosRaster, tsplLabelCommand } from './encode'
import { printViaPrintServer } from './printServer'
import type { LabelPrinterChoice, LabelSize } from './settings'

/** Ancho útil de una ticketera (mm): 58 mm ≈ 48 mm imprimibles; 80 mm ≈ 72 mm. */
export const escposPrintableMm = (paper: 58 | 80): number => (paper === 58 ? 48 : 72)

/** Mensaje si el rótulo no cabe en la impresora elegida (null = cabe). */
export function printerFitError(size: LabelSize, c: LabelPrinterChoice): string | null {
  if (c.language === 'escpos' && size.width > escposPrintableMm(c.paperWidthMm) + 0.01) {
    return `El rótulo mide ${size.width} mm y el rollo de ${c.paperWidthMm} mm imprime hasta ${escposPrintableMm(c.paperWidthMm)} mm: usa una impresora de etiquetas (TSPL) o reduce el ancho.`
  }
  return null
}

/** Impresora lista para enviar, o el motivo por el que no lo está. */
export function printerConfigError(c: LabelPrinterChoice): string | null {
  if (c.connection === 'windows' && !c.printerName.trim()) return 'Elige la impresora de etiquetas.'
  if (c.connection === 'network' && !c.tcpHost.trim()) return 'Indica la IP de la impresora.'
  return null
}

export interface PrintCanvasOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Imprime `count` etiquetas de `size`. `paint` dibuja la etiqueta i en el canvas dado (a la resolución de la impresora).
 * Envía por tandas (~120 KB) para no mandar de golpe cientos de imágenes por la red o por USB.
 */
export async function printLabelCanvases(
  count: number,
  paint: (canvas: HTMLCanvasElement, index: number) => void,
  size: LabelSize,
  c: LabelPrinterChoice,
  opts: PrintCanvasOptions = {},
): Promise<number> {
  const cfgErr = printerConfigError(c)
  if (cfgErr) throw new Error(cfgErr)
  const fitErr = printerFitError(size, c)
  if (fitErr) throw new Error(fitErr)
  const tspl = c.language === 'tspl'
  const dpm = tspl ? c.dotsPerMm : 8
  const dots = tspl ? Math.ceil((size.width * dpm) / 8) * 8 : escposPrintableMm(c.paperWidthMm) * 8
  const after = tspl ? [] : afterLabelBytes(c.after)
  const rowBytes = (dots / 8) * Math.round(size.height * dpm)
  const perChunk = Math.max(1, Math.floor(120_000 / Math.max(1, rowBytes)))
  const cfg = { printerName: c.printerName, tcpHost: c.tcpHost, tcpPort: c.tcpPort }

  let done = 0
  for (let i = 0; i < count; i += perChunk) {
    if (opts.signal?.aborted) throw new Error('Impresión cancelada')
    const parts: Uint8Array[] = tspl ? [] : [Uint8Array.from([0x1b, 0x40])]
    for (let k = i; k < Math.min(count, i + perChunk); k++) {
      const canvas = document.createElement('canvas')
      paint(canvas, k)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo preparar la etiqueta para imprimir')
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      parts.push(
        tspl
          ? tsplLabelCommand(img.data, canvas.width, canvas.height, size.width, size.height, c.rollGapMm)
          : rgbaToEscPosRaster(img.data, canvas.width, canvas.height, dots),
      )
      if (after.length) parts.push(Uint8Array.from(after))
    }
    const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
    let off = 0
    for (const p of parts) {
      bytes.set(p, off)
      off += p.length
    }
    await printViaPrintServer(c.connection, cfg, bytes, 'Rótulos')
    done = Math.min(count, i + perChunk)
    opts.onProgress?.(done, count)
  }
  return done
}
