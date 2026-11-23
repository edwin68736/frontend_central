/** Codificación de una imagen (RGBA) a comandos de impresora: ESC/POS (ticketera) y TSPL (impresora de etiquetas). */

const RASTER_STRIP_ROWS = 128

export type LabelAfter = 'cut' | 'feed' | 'gap' | 'none'

/** Comandos que se envían tras cada etiqueta en modo ticketera. */
export function afterLabelBytes(after: LabelAfter): number[] {
  switch (after) {
    case 'cut':
      return [0x1d, 0x56, 0x41, 0x10]
    case 'feed':
      return [0x1b, 0x64, 0x03]
    case 'gap':
      return [0x0c]
    default:
      return []
  }
}

function luminance(rgba: Uint8ClampedArray | Uint8Array, i: number): number {
  const alpha = rgba[i + 3] / 255
  return (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha)
}

/** RGBA → GS v 0 (blanco y negro), centrado en `targetDots` y en franjas de 128 filas. */
export function rgbaToEscPosRaster(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, targetDots: number, threshold = 160): Uint8Array {
  const dotsW = Math.max(8, Math.ceil(targetDots / 8) * 8)
  if (width > dotsW) throw new Error(`La imagen (${width} puntos) no cabe en el ancho imprimible (${dotsW})`)
  const left = Math.floor((dotsW - width) / 2)
  const bytesPerRow = dotsW / 8
  const out: number[] = []
  for (let y0 = 0; y0 < height; y0 += RASTER_STRIP_ROWS) {
    const rows = Math.min(RASTER_STRIP_ROWS, height - y0)
    out.push(0x1d, 0x76, 0x30, 0, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff)
    for (let y = 0; y < rows; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit - left
          if (x < 0 || x >= width) continue
          if (luminance(rgba, ((y0 + y) * width + x) * 4) < threshold) byte |= 1 << (7 - bit)
        }
        out.push(byte)
      }
    }
  }
  return Uint8Array.from(out)
}

/** TSPL: una etiqueta de `widthMm × heightMm` con la imagen en BITMAP (en TSPL el bit 1 es blanco y el 0 es tinta). */
export function tsplLabelCommand(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, widthMm: number, heightMm: number, gapMm: number, threshold = 160): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8)
  const bitmap = new Uint8Array(bytesPerRow * height).fill(0xff)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (luminance(rgba, (y * width + x) * 4) < threshold) bitmap[y * bytesPerRow + (x >> 3)] &= ~(1 << (7 - (x & 7)))
    }
  }
  const mm = (n: number) => String(Math.round(n * 10) / 10)
  const head = new TextEncoder().encode(
    ['SIZE ' + mm(widthMm) + ' mm,' + mm(heightMm) + ' mm', 'GAP ' + mm(gapMm) + ' mm,0 mm', 'DIRECTION 0', 'CLS', `BITMAP 0,0,${bytesPerRow},${height},0,`].join('\r\n'),
  )
  const tail = new TextEncoder().encode('\r\nPRINT 1,1\r\n')
  const out = new Uint8Array(head.length + bitmap.length + tail.length)
  out.set(head, 0)
  out.set(bitmap, head.length)
  out.set(tail, head.length + bitmap.length)
  return out
}
