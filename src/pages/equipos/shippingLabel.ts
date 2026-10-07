import { jsPDF } from 'jspdf'
import type { OrderView } from '@/services/equiposOrders.service'
import { DELIVERY_MODE_LABEL } from '@/services/equiposOrders.service'

export type LabelFormat = 'thermal' | 'a4'

const moneyText = (n: number) => `S/ ${n.toFixed(2)}`

/** Dibuja un rótulo dentro del recuadro (x, y, w, h) en mm. */
function drawLabel(doc: jsPDF, o: OrderView, x: number, y: number, w: number, h: number) {
  const sh = o.shipment
  const pad = 5
  const inner = w - pad * 2
  let cy = y + pad

  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.rect(x + 1.5, y + 1.5, w - 3, h - 3)

  const block = (title: string) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(110)
    doc.text(title, x + pad, cy + 2)
    doc.setTextColor(0)
    cy += 4.5
  }
  const lines = (text: string, size: number, bold = false, maxLines = 3) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const parts = doc.splitTextToSize(text, inner) as string[]
    const used = parts.slice(0, maxLines)
    doc.text(used, x + pad, cy + size * 0.35)
    cy += used.length * size * 0.42 + 1.5
  }

  // Cabecera
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`PEDIDO N° ${o.order_number}`, x + pad, cy + 3)
  const carrier = sh?.carrier_name ?? ''
  doc.text(carrier.toUpperCase(), x + w - pad, cy + 3, { align: 'right' })
  cy += 7
  doc.setLineWidth(0.2)
  doc.line(x + pad, cy, x + w - pad, cy)
  cy += 3

  block('DESTINATARIO')
  lines(o.customer_name.toUpperCase(), 14, true, 2)
  const doc1 = [o.customer_doc_type && o.customer_doc_number ? `${o.customer_doc_type}: ${o.customer_doc_number}` : '', o.contact_dni ? `DNI contacto: ${o.contact_dni}` : '']
    .filter(Boolean).join('   ')
  if (doc1) lines(doc1, 9)
  if (o.customer_phone) lines(`Cel.: ${o.customer_phone}`, 10, true, 1)

  cy += 1
  block('DESTINO')
  const place = [sh?.destination_district, sh?.destination_province, sh?.destination_department].filter(Boolean).join(' - ')
  if (place) lines(place.toUpperCase(), 12, true, 2)
  if (sh?.destination_agency) lines(`Agencia: ${sh.destination_agency}`, 10, false, 2)
  if (sh) lines(`Entrega: ${DELIVERY_MODE_LABEL[sh.delivery_mode] ?? sh.delivery_mode}`, 9, false, 1)
  if (sh?.guide_number) lines(`${sh.guide_label || 'Guía'}: ${sh.guide_number}`, 11, true, 1)

  cy += 1
  block('CONTENIDO')
  const packing = (o.packing ?? []).map((p) => `${p.quantity} x ${p.code}`).join('   ')
  lines(packing || '—', 9, false, 4)

  // Saldo / pagado: bloque inferior destacado
  const boxH = 13
  const by = y + h - boxH - 4
  const pending = o.balance_amount > 0.005
  doc.setLineWidth(0.6)
  if (pending) doc.rect(x + pad, by, inner, boxH)
  else {
    doc.setFillColor(0, 0, 0)
    doc.rect(x + pad, by, inner, boxH, 'F')
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(pending ? 13 : 16)
  doc.setTextColor(pending ? 0 : 255)
  doc.text(pending ? `SALDO PENDIENTE: ${moneyText(o.balance_amount)}` : 'PAGADO', x + w / 2, by + boxH / 2 + 2, { align: 'center' })
  doc.setTextColor(0)
}

/** Genera el PDF del rótulo: térmico 100×150 mm o A4 con dos rótulos por hoja. Devuelve el blob para abrir/imprimir. */
export function buildShippingLabel(o: OrderView, format: LabelFormat): Blob {
  if (format === 'thermal') {
    const doc = new jsPDF({ unit: 'mm', format: [100, 150], orientation: 'portrait' })
    drawLabel(doc, o, 0, 0, 100, 150)
    return doc.output('blob')
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  drawLabel(doc, o, 0, 0, 148.5, 210)
  drawLabel(doc, o, 148.5, 0, 148.5, 210)
  return doc.output('blob')
}

export function openLabel(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) URL.revokeObjectURL(url)
  else setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return !!win
}
