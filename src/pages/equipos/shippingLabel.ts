import { jsPDF } from 'jspdf'
import type { OrderView } from '@/services/equiposOrders.service'
import { DELIVERY_MODE_LABEL } from '@/services/equiposOrders.service'

/** Tamaño del rótulo: 12 cm de ancho × 6 cm de alto. */
export const LABEL_W = 120
export const LABEL_H = 60

const moneyText = (n: number) => `S/ ${n.toFixed(2)}`

/** Dibuja un rótulo de 120×60 mm con su esquina superior izquierda en (x, y). */
function drawLabel(doc: jsPDF, o: OrderView, x: number, y: number) {
  const sh = o.shipment
  const pad = 3.5
  const colSplit = 70 // ancho de la columna izquierda
  doc.setDrawColor(0)
  doc.setTextColor(0)
  doc.setLineWidth(0.35)
  doc.rect(x + 0.5, y + 0.5, LABEL_W - 1, LABEL_H - 1)

  const text = (t: string, tx: number, ty: number, size: number, bold = false, maxW?: number, maxLines = 1) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const parts = maxW ? (doc.splitTextToSize(t, maxW) as string[]).slice(0, maxLines) : [t]
    doc.text(parts, tx, ty)
    return parts.length * size * 0.38
  }

  // Cabecera
  text(`PEDIDO N° ${o.order_number}`, x + pad, y + 7, 10, true)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text((sh?.carrier_name ?? '').toUpperCase(), x + LABEL_W - pad, y + 7, { align: 'right' })
  doc.setLineWidth(0.2)
  doc.line(x + pad, y + 9, x + LABEL_W - pad, y + 9)

  // Columna izquierda: destinatario y destino
  let cy = y + 13.5
  doc.setTextColor(110)
  text('DESTINATARIO', x + pad, cy, 6)
  doc.setTextColor(0)
  cy += 4.2
  cy += text(o.customer_name.toUpperCase(), x + pad, cy, 10, true, colSplit - pad - 2, 2) + 1.4
  const ids = [o.customer_doc_type && o.customer_doc_number ? `${o.customer_doc_type}: ${o.customer_doc_number}` : '', o.customer_phone ? `Cel.: ${o.customer_phone}` : '']
    .filter(Boolean).join('   ')
  if (ids) cy += text(ids, x + pad, cy, 8, false, colSplit - pad - 2, 1) + 1.4
  doc.setTextColor(110)
  text('DESTINO', x + pad, cy + 0.6, 6)
  doc.setTextColor(0)
  cy += 4.6
  const place = [sh?.destination_district, sh?.destination_province, sh?.destination_department].filter(Boolean).join(' - ')
  if (place) cy += text(place.toUpperCase(), x + pad, cy, 9, true, colSplit - pad - 2, 2) + 1
  if (sh?.destination_agency) text(sh.destination_agency, x + pad, cy, 7.5, false, colSplit - pad - 2, 2)

  // Columna derecha: guía, quién recoge y contenido
  doc.setLineWidth(0.2)
  doc.line(x + colSplit, y + 11, x + colSplit, y + 45)
  const rx = x + colSplit + 3
  const rw = LABEL_W - colSplit - pad - 3
  doc.setTextColor(110)
  text(sh?.guide_label ? sh.guide_label.toUpperCase() : 'GUÍA', rx, y + 13.5, 6)
  doc.setTextColor(0)
  text(sh?.guide_number || '—', rx, y + 18.5, 12, true, rw, 1)
  if (sh) text(DELIVERY_MODE_LABEL[sh.delivery_mode] ?? sh.delivery_mode, rx, y + 22.5, 7, false, rw, 1)
  if (o.contact_dni) text(`Recoge DNI ${o.contact_dni}`, rx, y + 26, 7, false, rw, 1)
  doc.setTextColor(110)
  text('CONTENIDO', rx, y + 30.5, 6)
  doc.setTextColor(0)
  const packing = (o.packing ?? []).map((p) => `${p.quantity} x ${p.code}`)
  text(packing.length ? packing.join('\n') : '—', rx, y + 34.5, 8, false, rw, 3)

  // Saldo / pagado
  const bh = 9
  const by = y + LABEL_H - bh - 2.5
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

/** PDF de un rótulo de 12 × 6 cm (rollo térmico). */
export function buildShippingLabel(o: OrderView): Blob {
  const doc = new jsPDF({ unit: 'mm', format: [LABEL_W, LABEL_H], orientation: 'landscape' })
  drawLabel(doc, o, 0, 0)
  return doc.output('blob')
}

/**
 * PDF A4 horizontal con varios rótulos de 12 × 6 cm: 2 columnas × 3 filas (6 por hoja) y salto de página cuando se llena.
 */
export function buildLabelSheet(orders: OrderView[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = 297
  const pageH = 210
  const gap = 4
  const cols = Math.max(1, Math.floor((pageW + gap) / (LABEL_W + gap)))
  const rows = Math.max(1, Math.floor((pageH + gap) / (LABEL_H + gap)))
  const x0 = (pageW - (cols * LABEL_W + (cols - 1) * gap)) / 2
  const y0 = (pageH - (rows * LABEL_H + (rows - 1) * gap)) / 2
  const perPage = cols * rows
  orders.forEach((o, i) => {
    if (i > 0 && i % perPage === 0) doc.addPage('a4', 'landscape')
    const k = i % perPage
    drawLabel(doc, o, x0 + (k % cols) * (LABEL_W + gap), y0 + Math.floor(k / cols) * (LABEL_H + gap))
  })
  return doc.output('blob')
}

export function openLabel(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) URL.revokeObjectURL(url)
  else setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return !!win
}
