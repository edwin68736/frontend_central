import { jsPDF } from 'jspdf'
import type { OrderView } from '@/services/equiposOrders.service'
import { DELIVERY_MODE_LABEL } from '@/services/equiposOrders.service'

/** Tamaño base del rótulo: 12 cm de ancho × 6 cm de alto. La altura crece si el contenido necesita más líneas. */
export const LABEL_W = 120
export const LABEL_H = 60

// Geometría del cuadro CONTENIDO (y del cuadro DESTINO, que lo acompaña): alto base y paso de línea.
const BOX_BOTTOM_Y = 30
const BOX_BASE_H = 16.5
const CONTENT_FIRST_BASELINE = 37.6
const CONTENT_FONT = 8
const CONTENT_LINE_H = CONTENT_FONT * 0.3528 * 1.15 // 8 pt con el interlineado 1.15 de jsPDF
const CONTENT_BOTTOM_PAD = 2.5
/** Tope de líneas de contenido para que un rótulo siempre quepa en una hoja A4 horizontal. */
const MAX_CONTENT_LINES = 40

const PAD = 3.5
const COL_SPLIT = 70 // ancho de la columna izquierda
const contentColumnWidth = () => LABEL_W - PAD - COL_SPLIT - 1 - 3.6

const moneyText = (n: number) => `S/ ${n.toFixed(2)}`

/** Líneas del cuadro CONTENIDO ya ajustadas al ancho de la columna (con tope y aviso de "+N más"). */
function contentLines(doc: jsPDF, o: OrderView): string[] {
  const packing = (o.packing ?? []).map((p) => `${p.quantity} x ${p.code}`)
  if (packing.length === 0) return ['—']
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(CONTENT_FONT)
  const lines = doc.splitTextToSize(packing.join('\n'), contentColumnWidth()) as string[]
  if (lines.length <= MAX_CONTENT_LINES) return lines
  return [...lines.slice(0, MAX_CONTENT_LINES - 1), `… y ${lines.length - MAX_CONTENT_LINES + 1} línea(s) más`]
}

/** Altura (mm) que necesita el rótulo: 60 mm como mínimo y más si el contenido tiene muchas líneas. */
function labelHeight(doc: jsPDF, o: OrderView): number {
  const n = contentLines(doc, o).length
  const needed = CONTENT_FIRST_BASELINE - BOX_BOTTOM_Y + (n - 1) * CONTENT_LINE_H + CONTENT_BOTTOM_PAD
  return LABEL_H + Math.max(0, Math.ceil((needed - BOX_BASE_H) * 10) / 10)
}

/**
 * Dibuja un rótulo de 120 mm de ancho con su esquina superior izquierda en (x, y). La altura es la que
 * pide el contenido; `height` permite estirarlo (los rótulos de una misma fila igualan su altura).
 */
function drawLabel(doc: jsPDF, o: OrderView, x: number, y: number, height = labelHeight(doc, o)) {
  const sh = o.shipment
  const pad = PAD
  const colSplit = COL_SPLIT
  const extra = height - LABEL_H // alto que se suma a los cuadros inferiores
  doc.setDrawColor(0)
  doc.setTextColor(0)
  doc.setLineWidth(0.35)
  doc.rect(x + 0.5, y + 0.5, LABEL_W - 1, height - 1)

  const text = (t: string, tx: number, ty: number, size: number, bold = false, maxW?: number, maxLines = 1) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const parts = maxW ? (doc.splitTextToSize(t, maxW) as string[]).slice(0, maxLines) : [t]
    doc.text(parts, tx, ty)
    return parts.length * size * 0.38
  }

  // Cabecera: marca + número de pedido, y el transportista a la derecha
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('TUKIFAC', x + pad, y + 7.5)
  const brandW = doc.getTextWidth('TUKIFAC')
  doc.setFontSize(10)
  if (sh?.carrier_name) doc.text(`|  ${sh.carrier_name.toUpperCase()}`, x + pad + brandW + 2, y + 7.5)
  doc.text(`PEDIDO N° ${o.order_number}`, x + LABEL_W - pad, y + 7.5, { align: 'right' })
  doc.setLineWidth(0.2)
  doc.line(x + pad, y + 9.5, x + LABEL_W - pad, y + 9.5)

  // Cada sección va en su propio recuadro
  const lx = x + pad
  const lw = colSplit - pad - 1
  const rx0 = x + colSplit + 1
  const rw0 = LABEL_W - pad - colSplit - 1
  doc.setLineWidth(0.25)
  doc.rect(lx, y + 11.5, lw, 17.5) // destinatario
  doc.rect(lx, y + BOX_BOTTOM_Y, lw, BOX_BASE_H + extra) // destino
  doc.rect(rx0, y + 11.5, rw0, 17.5) // guía
  doc.rect(rx0, y + BOX_BOTTOM_Y, rw0, BOX_BASE_H + extra) // contenido

  const tag = (t: string, tx: number, ty: number) => {
    doc.setTextColor(110)
    text(t, tx, ty, 6)
    doc.setTextColor(0)
  }
  const ix = lx + 1.8
  const iw = lw - 3.6

  // Destinatario
  tag('DESTINATARIO', ix, y + 14.7)
  const pickup = o.contact_name?.trim()
  const name = (pickup || o.customer_name).toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const oneLine = doc.getTextWidth(name) <= iw
  if (oneLine) text(name, ix, y + 19.5, 10, true)
  else text(name, ix, y + 18.8, 8.5, true, iw, 2)
  const docLine = pickup ? (o.contact_dni ? `DNI: ${o.contact_dni}` : '') : o.customer_doc_type && o.customer_doc_number ? `${o.customer_doc_type}: ${o.customer_doc_number}` : ''
  const ids = [docLine, o.customer_phone ? `Cel.: ${o.customer_phone}` : '']
    .filter(Boolean).join('   ')
  if (ids) text(ids, ix, oneLine ? y + 24.6 : y + 26.6, 7.5, false, iw, 1)

  // Destino
  tag('DESTINO', ix, y + 33.2)
  const place = [sh?.destination_district, sh?.destination_province, sh?.destination_department].filter(Boolean).join(' - ')
  let py = y + 37.8
  if (place) py += text(place.toUpperCase(), ix, py, 9, true, iw, 2) + 1.2
  if (sh?.destination_agency) text(sh.destination_agency, ix, py + 2.2, 7.5, false, iw, 1)

  // Guía y quién recoge
  const gx = rx0 + 1.8
  const gw = rw0 - 3.6
  tag(sh?.guide_label ? sh.guide_label.toUpperCase() : 'GUÍA', gx, y + 14.7)
  text(sh?.guide_number || '—', gx, y + 20.5, 12, true, gw, 1)
  if (sh) text(DELIVERY_MODE_LABEL[sh.delivery_mode] ?? sh.delivery_mode, gx, y + 24.7, 7, false, gw, 1)
  if (o.contact_dni && !pickup) text(`Recoge DNI ${o.contact_dni}`, gx, y + 27.6, 7, false, gw, 1)

  // Contenido: todas las líneas, el cuadro crece según la cantidad de productos
  tag('CONTENIDO', gx, y + 33.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(CONTENT_FONT)
  doc.text(contentLines(doc, o), gx, y + CONTENT_FIRST_BASELINE)

  // Saldo / pagado
  const bh = 9
  const by = y + height - bh - 2.5
  const pending = o.balance_amount > 0.005
  doc.setLineWidth(0.5)
  if (pending) doc.rect(x + pad, by, LABEL_W - pad * 2, bh)
  else {
    doc.setFillColor(0, 0, 0)
    doc.rect(x + pad, by, LABEL_W - pad * 2, bh, 'F')
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(pending ? 13 : 15)
  doc.setTextColor(pending ? 0 : 255)
  doc.text(pending ? `SALDO PENDIENTE: ${moneyText(o.balance_amount)}` : 'PAGADO', x + LABEL_W / 2, by + bh / 2 + (pending ? 2 : 2.4), { align: 'center' })
  doc.setTextColor(0)
}

/** PDF de un rótulo de 12 cm de ancho (rollo térmico); el alto es de 6 cm o más si hay muchos productos. */
export function buildShippingLabel(o: OrderView): Blob {
  const probe = new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: 'landscape' })
  const h = labelHeight(probe, o)
  // La página mide lo mismo que el rótulo: en el rollo la etiqueta crece hacia abajo.
  const doc = new jsPDF({ unit: 'mm', format: [LABEL_W, h], orientation: 'landscape' })
  drawLabel(doc, o, 0, 0, h)
  return doc.output('blob')
}

/**
 * PDF A4 horizontal con varios rótulos de 12 cm de ancho: 2 columnas, en orden ascendente por número
 * de pedido (de izquierda a derecha y de arriba abajo). Cada rótulo mide lo que pide su contenido y los
 * de una misma fila igualan su altura; cuando la siguiente fila ya no cabe, se pasa a otra hoja.
 */
export function buildLabelSheet(orders: OrderView[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = 297
  const pageH = 210
  const gap = 4
  const margin = 10
  const cols = Math.max(1, Math.floor((pageW + gap) / (LABEL_W + gap)))
  const x0 = (pageW - (cols * LABEL_W + (cols - 1) * gap)) / 2
  const sorted = [...orders].sort((a, b) => a.order_number - b.order_number)
  let y = margin
  for (let i = 0; i < sorted.length; i += cols) {
    const row = sorted.slice(i, i + cols)
    const rowH = Math.max(...row.map((o) => labelHeight(doc, o)))
    if (i > 0 && y + rowH > pageH - margin) {
      doc.addPage('a4', 'landscape')
      y = margin
    }
    row.forEach((o, k) => drawLabel(doc, o, x0 + k * (LABEL_W + gap), y, rowH))
    y += rowH + gap
  }
  return doc.output('blob')
}

export function openLabel(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) URL.revokeObjectURL(url)
  else setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return !!win
}
