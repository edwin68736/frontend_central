import { jsPDF } from 'jspdf'
import type { OrderView } from '@/services/equiposOrders.service'
import { DELIVERY_MODE_LABEL } from '@/services/equiposOrders.service'
import { loadLabelSize, type LabelSize } from '@/lib/labelPrint/settings'

/**
 * Rótulo de envío de tamaño AJUSTABLE (por defecto 10 × 10 cm). Se dibuja con un «pen» abstracto, así que el mismo diseño sale
 * en PDF (jsPDF), en la vista previa y en el canvas que se manda a la impresora de etiquetas (TSPL) o a la ticketera.
 * El contenido se adapta al tamaño: los textos se reducen para caber y, si aun así no caben, se cortan con «…».
 */

export interface TextOpts {
  size: number // pt
  bold?: boolean
  gray?: boolean
  align?: 'left' | 'right'
}

export interface Pen {
  /** `y` es la línea base del texto. */
  text(str: string, x: number, y: number, o: TextOpts): void
  width(str: string, o: TextOpts): number
  rect(x: number, y: number, w: number, h: number, lineMm: number): void
  line(x1: number, y1: number, x2: number, y2: number, lineMm: number): void
}

const PT = 25.4 / 72 // mm por punto
const LINE_K = 1.18 // interlineado

/** Parte `str` en líneas que caben en `maxW` (respeta saltos de línea y corta las palabras más largas que el ancho). */
export function wrapText(pen: Pen, str: string, maxW: number, o: TextOpts): string[] {
  const out: string[] = []
  for (const para of str.split('\n')) {
    let line = ''
    const push = () => {
      out.push(line)
      line = ''
    }
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word
      if (pen.width(cand, o) <= maxW) {
        line = cand
        continue
      }
      if (line) push()
      if (pen.width(word, o) <= maxW) {
        line = word
        continue
      }
      let chunk = ''
      for (const ch of word) {
        if (pen.width(chunk + ch, o) > maxW && chunk) {
          out.push(chunk)
          chunk = ''
        }
        chunk += ch
      }
      line = chunk
    }
    push()
  }
  return out.length ? out : ['']
}

interface Fitted {
  lines: string[]
  size: number
  lineH: number
  height: number
}

/** Elige el mayor cuerpo (entre `maxPt` y `minPt`) con el que el texto cabe en `w × h`; si no cabe ni al mínimo, lo corta con «…». */
export function fitText(pen: Pen, str: string, w: number, h: number, maxPt: number, minPt: number, bold = false): Fitted {
  let size = maxPt
  for (;;) {
    const lines = wrapText(pen, str, w, { size, bold })
    const lineH = size * PT * LINE_K
    if (lines.length * lineH <= h + 0.01 || size <= minPt) {
      const fit = Math.max(1, Math.floor((h + 0.01) / lineH))
      if (lines.length > fit) {
        const kept = lines.slice(0, fit)
        let last = kept[fit - 1]
        while (last.length > 1 && pen.width(last + '…', { size, bold }) > w) last = last.slice(0, -1)
        kept[fit - 1] = last.replace(/\s+$/, '') + '…'
        return { lines: kept, size, lineH, height: kept.length * lineH }
      }
      return { lines, size, lineH, height: lines.length * lineH }
    }
    size = Math.max(minPt, size - 0.5)
  }
}

function drawLines(pen: Pen, f: Fitted, x: number, top: number, o: Omit<TextOpts, 'size'>) {
  f.lines.forEach((t, i) => pen.text(t, x, top + f.size * PT * 0.82 + i * f.lineH, { ...o, size: f.size }))
}

const docLabel = (t: string | undefined) => (t === 'CE' ? 'C.E.' : 'DNI')

/** Dibuja el rótulo del pedido en un área de `W × H` mm con la esquina superior izquierda en (0, 0). */
export function drawShippingLabel(pen: Pen, o: OrderView, W: number, H: number): void {
  const sh = o.shipment
  const sc = Math.min(1.8, Math.max(0.6, Math.sqrt(W * H) / 100)) // escala de tipografía y espacios según el tamaño
  const pad = 3 * sc
  const gap = 1.5 * sc
  pen.rect(0.4, 0.4, W - 0.8, H - 0.8, 0.35)

  // Cabecera: marca, transportista y número de pedido
  const hy = 7.2 * sc
  pen.text('TUKIFAC', pad, hy, { size: 12 * sc, bold: true })
  const brandW = pen.width('TUKIFAC', { size: 12 * sc, bold: true })
  const orderTxt = `PEDIDO N° ${o.order_number}`
  const orderW = pen.width(orderTxt, { size: 10 * sc, bold: true })
  pen.text(orderTxt, W - pad, hy, { size: 10 * sc, bold: true, align: 'right' })
  if (sh?.carrier_name) {
    const room = W - 2 * pad - brandW - orderW - 6
    const f = fitText(pen, `|  ${sh.carrier_name.toUpperCase()}`, Math.max(room, 8), 5 * sc, 10 * sc, 6, true)
    pen.text(f.lines[0], pad + brandW + 2, hy, { size: f.size, bold: true })
  }
  pen.line(pad, 9.5 * sc, W - pad, 9.5 * sc, 0.2)

  const top = 11.5 * sc
  const avail = H - pad - top
  const wide = W / H >= 1.35

  const box = (x: number, y: number, w: number, h: number, title: string) => {
    pen.rect(x, y, w, h, 0.25)
    pen.text(title, x + 1.8, y + 3.4 * sc, { size: 6 * sc, gray: true })
    const tagH = 4.2 * sc
    return { x: x + 1.8, y: y + tagH, w: w - 3.6, h: h - tagH - 1.2 }
  }

  // Posición de los cuatro recuadros según la forma del rótulo (apaisado: 2 columnas; cuadrado o alto: apilado)
  let rDest: [number, number, number, number]
  let rPlace: [number, number, number, number]
  let rMode: [number, number, number, number]
  let rContent: [number, number, number, number]
  if (wide) {
    const lw = (W - 2 * pad - gap) * 0.58
    const rw = W - 2 * pad - gap - lw
    const h1 = (avail - gap) * 0.42
    rDest = [pad, top, lw, h1]
    rPlace = [pad, top + h1 + gap, lw, avail - h1 - gap]
    rMode = [pad + lw + gap, top, rw, h1]
    rContent = [pad + lw + gap, top + h1 + gap, rw, avail - h1 - gap]
  } else {
    const fw = W - 2 * pad
    const h1 = avail * 0.2
    const h2 = avail * 0.32
    const h3 = avail - h1 - h2 - 2 * gap
    const ew = fw * 0.36
    rDest = [pad, top, fw, h1]
    rPlace = [pad, top + h1 + gap, fw, h2]
    rMode = [pad, top + h1 + h2 + 2 * gap, ew, h3]
    rContent = [pad + ew + gap, top + h1 + h2 + 2 * gap, fw - ew - gap, h3]
  }

  // Destinatario
  {
    const b = box(...rDest, 'DESTINATARIO')
    const pickup = o.contact_name?.trim()
    const name = (pickup || o.customer_name || '').toUpperCase()
    const docLine = pickup
      ? o.contact_dni ? `${docLabel(o.contact_doc_type)}: ${o.contact_dni}` : ''
      : o.customer_doc_type && o.customer_doc_number ? `${o.customer_doc_type}: ${o.customer_doc_number}` : ''
    const ids = [docLine, o.customer_phone ? `Cel.: ${o.customer_phone}` : ''].filter(Boolean).join('   ')
    const idsF = ids ? fitText(pen, ids, b.w, 9 * sc * PT * LINE_K, 9 * sc, 5, false) : null
    const nameF = fitText(pen, name, b.w, b.h - (idsF ? idsF.height + 0.6 : 0), 14 * sc, 6, true)
    drawLines(pen, nameF, b.x, b.y, { bold: true })
    if (idsF) drawLines(pen, idsF, b.x, b.y + nameF.height + 0.6, {})
  }

  // Destino: zona y nombre/dirección completos de la agencia
  {
    const b = box(...rPlace, 'DESTINO')
    const place = [sh?.destination_district, sh?.destination_province, sh?.destination_department].filter(Boolean).join(' - ').toUpperCase()
    let y = b.y
    let left = b.h
    if (place) {
      const f = fitText(pen, place, b.w, Math.min(left * 0.45, 2 * 12 * sc * PT * LINE_K), 12 * sc, 6, true)
      drawLines(pen, f, b.x, y, { bold: true })
      y += f.height + 1.2 * sc
      left -= f.height + 1.2 * sc
    }
    if (sh?.destination_agency && left > 2) {
      const f = fitText(pen, sh.destination_agency, b.w, left, 11 * sc, 4.5, false)
      drawLines(pen, f, b.x, y, {})
    }
  }

  // Modalidad de entrega (el N° de guía no va en el rótulo) y quién recoge
  {
    const b = box(...rMode, 'ENTREGA')
    const mode = sh ? (DELIVERY_MODE_LABEL[sh.delivery_mode] ?? sh.delivery_mode) : '—'
    const f = fitText(pen, mode, b.w, Math.min(b.h, 2 * 14 * sc * PT * LINE_K), 14 * sc, 6, true)
    drawLines(pen, f, b.x, b.y, { bold: true })
    if (o.contact_dni && !o.contact_name?.trim() && b.h - f.height > 2) {
      const r = fitText(pen, `Recoge ${docLabel(o.contact_doc_type)} ${o.contact_dni}`, b.w, b.h - f.height - 0.6, 9 * sc, 4.5, false)
      drawLines(pen, r, b.x, b.y + f.height + 0.6, {})
    }
  }

  // Contenido: lo que se empaca
  {
    const b = box(...rContent, 'CONTENIDO')
    const packing = (o.packing ?? []).map((p) => `${p.quantity} x ${p.code}`)
    const f = fitText(pen, packing.length ? packing.join('\n') : '—', b.w, b.h, 11 * sc, 4.5, false)
    drawLines(pen, f, b.x, b.y, {})
  }
}

/* ───────────────────────── PDF ───────────────────────── */

function jsPdfPen(doc: jsPDF, dx = 0, dy = 0): Pen {
  const set = (o: TextOpts) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal')
    doc.setFontSize(o.size)
  }
  return {
    text(str, x, y, o) {
      set(o)
      doc.setTextColor(o.gray ? 110 : 0)
      doc.text(str, x + dx, y + dy, o.align === 'right' ? { align: 'right' } : undefined)
      doc.setTextColor(0)
    },
    width(str, o) {
      set(o)
      return doc.getTextWidth(str)
    },
    rect(x, y, w, h, lw) {
      doc.setDrawColor(0)
      doc.setLineWidth(lw)
      doc.rect(x + dx, y + dy, w, h)
    },
    line(x1, y1, x2, y2, lw) {
      doc.setDrawColor(0)
      doc.setLineWidth(lw)
      doc.line(x1 + dx, y1 + dy, x2 + dx, y2 + dy)
    },
  }
}

const orientationOf = (s: LabelSize): 'landscape' | 'portrait' => (s.width >= s.height ? 'landscape' : 'portrait')

/** PDF de un rótulo: la página mide lo mismo que la etiqueta (por defecto 10 × 10 cm). */
export function buildShippingLabel(o: OrderView, size: LabelSize = loadLabelSize()): Blob {
  const doc = new jsPDF({ unit: 'mm', format: [size.width, size.height], orientation: orientationOf(size) })
  drawShippingLabel(jsPdfPen(doc), o, size.width, size.height)
  return doc.output('blob')
}

/**
 * PDF A4 con varios rótulos del tamaño elegido, en orden ascendente por número de pedido (de izquierda a derecha y de
 * arriba abajo). Usa la orientación del A4 en la que caben más rótulos por hoja.
 */
export function buildLabelSheet(orders: OrderView[], size: LabelSize = loadLabelSize()): Blob {
  const gap = 4
  const margin = 8
  const fit = (pw: number, ph: number) => ({
    cols: Math.max(1, Math.floor((pw - 2 * margin + gap) / (size.width + gap))),
    rows: Math.max(1, Math.floor((ph - 2 * margin + gap) / (size.height + gap))),
  })
  const land = fit(297, 210)
  const port = fit(210, 297)
  const useLand = land.cols * land.rows >= port.cols * port.rows
  const [pageW, pageH] = useLand ? [297, 210] : [210, 297]
  const { cols, rows } = useLand ? land : port
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: useLand ? 'landscape' : 'portrait' })
  const x0 = Math.max(margin, (pageW - (cols * size.width + (cols - 1) * gap)) / 2)
  const y0 = Math.max(margin, (pageH - (rows * size.height + (rows - 1) * gap)) / 2)
  const sorted = [...orders].sort((a, b) => a.order_number - b.order_number)
  const perPage = cols * rows
  sorted.forEach((o, i) => {
    if (i > 0 && i % perPage === 0) doc.addPage('a4', useLand ? 'landscape' : 'portrait')
    const k = i % perPage
    drawShippingLabel(jsPdfPen(doc, x0 + (k % cols) * (size.width + gap), y0 + Math.floor(k / cols) * (size.height + gap)), o, size.width, size.height)
  })
  return doc.output('blob')
}

export function openLabel(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) URL.revokeObjectURL(url)
  else window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return !!win
}

/* ───────────────────────── Canvas (vista previa e impresión) ───────────────────────── */

function canvasPen(ctx: CanvasRenderingContext2D, ppm: number, minLinePx: number): Pen {
  const font = (o: TextOpts) => `${o.bold ? 'bold ' : ''}${o.size * PT * ppm}px Helvetica, Arial, sans-serif`
  return {
    text(str, x, y, o) {
      ctx.font = font(o)
      ctx.textAlign = o.align === 'right' ? 'right' : 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = o.gray ? '#6e6e6e' : '#000'
      ctx.fillText(str, x * ppm, y * ppm)
    },
    width(str, o) {
      ctx.font = font(o)
      return ctx.measureText(str).width / ppm
    },
    rect(x, y, w, h, lw) {
      ctx.strokeStyle = '#000'
      ctx.lineWidth = Math.max(lw * ppm, minLinePx)
      ctx.strokeRect(x * ppm, y * ppm, w * ppm, h * ppm)
    },
    line(x1, y1, x2, y2, lw) {
      ctx.strokeStyle = '#000'
      ctx.lineWidth = Math.max(lw * ppm, minLinePx)
      ctx.beginPath()
      ctx.moveTo(x1 * ppm, y1 * ppm)
      ctx.lineTo(x2 * ppm, y2 * ppm)
      ctx.stroke()
    },
  }
}

/**
 * Pinta el rótulo en un canvas de `dotsPerMm` puntos por mm (203 dpi ≈ 8). Dibuja a 3× y promedia cada bloque: así el texto
 * y las líneas finas salen limpios al pasar luego a blanco y negro. `frame` añade una cruz y un marco para calibrar.
 */
export function paintShippingLabel(canvas: HTMLCanvasElement, o: OrderView | null, size: LabelSize, dotsPerMm: number, frame = false): void {
  const SS = 3
  const W = Math.max(1, Math.round(size.width * dotsPerMm))
  const H = Math.max(1, Math.round(size.height * dotsPerMm))
  const hi = document.createElement('canvas')
  hi.width = W * SS
  hi.height = H * SS
  const hctx = hi.getContext('2d')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!hctx || !ctx) return
  hctx.fillStyle = '#fff'
  hctx.fillRect(0, 0, hi.width, hi.height)
  const pen = canvasPen(hctx, dotsPerMm * SS, SS)
  if (o) drawShippingLabel(pen, o, size.width, size.height)
  if (frame) {
    // Calibración: marco al borde exacto de la etiqueta y marcas cada 10 mm.
    const ppm = dotsPerMm * SS
    hctx.fillStyle = '#000'
    const t = Math.max(2, SS)
    hctx.fillRect(0, 0, hi.width, t)
    hctx.fillRect(0, hi.height - t, hi.width, t)
    hctx.fillRect(0, 0, t, hi.height)
    hctx.fillRect(hi.width - t, 0, t, hi.height)
    for (let mm = 10; mm * ppm < hi.width; mm += 10) hctx.fillRect(mm * ppm, 0, t, 2.5 * ppm)
    for (let mm = 10; mm * ppm < hi.height; mm += 10) hctx.fillRect(0, mm * ppm, 2.5 * ppm, t)
  }
  const src = hctx.getImageData(0, 0, hi.width, hi.height).data
  const dst = ctx.createImageData(W, H)
  const hw = hi.width
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0
      for (let dy = 0; dy < SS; dy++) {
        const row = (y * SS + dy) * hw
        for (let dx = 0; dx < SS; dx++) sum += src[(row + x * SS + dx) * 4]
      }
      const v = Math.round(sum / (SS * SS))
      const i = (y * W + x) * 4
      dst.data[i] = dst.data[i + 1] = dst.data[i + 2] = v
      dst.data[i + 3] = 255
    }
  }
  ctx.putImageData(dst, 0, 0)
}
