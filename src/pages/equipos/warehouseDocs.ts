import { jsPDF } from 'jspdf'
import { docNumber, type ProductLine, type RequirementView, type TransferView } from '@/services/equiposWarehouses.service'
import { fmtDate } from './ordersCommon'

/**
 * Documentos firmables del control de almacenes (PDF A4): el requerimiento que el Almacén 1 le pide al depósito y la
 * transferencia con la que el depósito lo envía. Cada uno lleva sus recuadros de firma para llevar el control en papel.
 */

const MARGIN = 15
const W = 210
const H = 297

interface DocSpec {
  title: string
  number: string
  /** Pares etiqueta/valor de la cabecera. */
  meta: [string, string][]
  columns: { label: string; width: number; align?: 'left' | 'right' }[]
  rows: string[][]
  notes: string
  signatures: string[]
  footer?: string
}

function buildDoc(spec: DocSpec): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('TUKIFAC', MARGIN, y + 4)
  doc.setFontSize(12)
  doc.text(spec.title.toUpperCase(), W - MARGIN, y + 4, { align: 'right' })
  doc.setFontSize(13)
  doc.text(`N° ${spec.number}`, W - MARGIN, y + 10.5, { align: 'right' })
  y += 15
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y, W - MARGIN, y)
  y += 6

  doc.setFontSize(10)
  for (const [label, value] of spec.meta) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(value || '—', W - MARGIN * 2 - 38) as string[]
    doc.text(lines, MARGIN + 38, y)
    y += Math.max(1, lines.length) * 5.2
  }
  y += 3

  // Tabla de productos (con salto de página si hace falta).
  const tableW = W - MARGIN * 2
  const fixed = spec.columns.filter((c) => c.width > 0).reduce((s, c) => s + c.width, 0)
  const widths = spec.columns.map((c) => (c.width > 0 ? c.width : tableW - fixed))
  const header = () => {
    doc.setFillColor(235, 235, 235)
    doc.rect(MARGIN, y, tableW, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    let x = MARGIN
    spec.columns.forEach((c, i) => {
      doc.text(c.label, c.align === 'right' ? x + widths[i] - 2 : x + 2, y + 4.8, { align: c.align === 'right' ? 'right' : 'left' })
      x += widths[i]
    })
    y += 7
  }
  header()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  for (const row of spec.rows) {
    const cellLines = row.map((v, i) => doc.splitTextToSize(v, widths[i] - 4) as string[])
    const rowH = Math.max(...cellLines.map((l) => l.length)) * 4.6 + 2.4
    if (y + rowH > H - 70) {
      doc.addPage()
      y = MARGIN
      header()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
    }
    let x = MARGIN
    cellLines.forEach((l, i) => {
      doc.text(l, spec.columns[i].align === 'right' ? x + widths[i] - 2 : x + 2, y + 4.4, { align: spec.columns[i].align === 'right' ? 'right' : 'left' })
      x += widths[i]
    })
    y += rowH
    doc.setDrawColor(200)
    doc.setLineWidth(0.15)
    doc.line(MARGIN, y, W - MARGIN, y)
  }
  doc.setDrawColor(0)

  if (spec.notes.trim()) {
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('Observaciones:', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(spec.notes, tableW - 30) as string[]
    doc.text(lines, MARGIN + 30, y)
    y += lines.length * 4.8
  }

  // Firmas: siempre al pie de la última página, en recuadros iguales.
  if (y > H - 62) {
    doc.addPage()
    y = MARGIN
  }
  const boxH = 38
  const top = H - MARGIN - boxH - (spec.footer ? 8 : 0)
  const gap = 6
  const bw = (tableW - gap * (spec.signatures.length - 1)) / spec.signatures.length
  spec.signatures.forEach((label, i) => {
    const x = MARGIN + i * (bw + gap)
    doc.setLineWidth(0.3)
    doc.rect(x, top, bw, boxH)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(label.toUpperCase(), x + bw / 2, top + 5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.line(x + 6, top + 23, x + bw - 6, top + 23)
    doc.text('Firma', x + bw / 2, top + 26.5, { align: 'center' })
    doc.text('Nombre: ______________________', x + 4, top + 31.5)
    doc.text('DNI: ____________   Fecha: ___/___/_____', x + 4, top + 35.5)
  })
  if (spec.footer) {
    doc.setFontSize(7.5)
    doc.setTextColor(120)
    doc.text(spec.footer, W / 2, H - MARGIN + 1, { align: 'center' })
    doc.setTextColor(0)
  }
  return doc.output('blob')
}

const lineCode = (l: ProductLine) => l.code
const lineName = (l: ProductLine) => (l.name && l.name !== l.code ? l.name : '')

export function buildRequirementDoc(r: RequirementView): Blob {
  return buildDoc({
    title: 'Requerimiento de equipos',
    number: docNumber('RQ', r.number),
    meta: [
      ['Fecha', fmtDate(r.requested_at)],
      ['Solicita', r.requesting_name],
      ['Abastece', r.supplying_name],
      ['Registrado por', r.created_by_name],
    ],
    columns: [{ label: 'Código', width: 38 }, { label: 'Producto', width: 0 }, { label: 'Cant. pedida', width: 28, align: 'right' }],
    rows: r.items.map((it) => [lineCode(it), lineName(it), String(it.quantity)]),
    notes: r.notes,
    signatures: ['Solicitado por', 'Autorizado por'],
    footer: 'Documento de control interno. Conservar firmado junto con la transferencia que lo atiende.',
  })
}

export function buildTransferDoc(t: TransferView): Blob {
  return buildDoc({
    title: 'Transferencia entre almacenes',
    number: docNumber('TR', t.number),
    meta: [
      ['Fecha', fmtDate(t.transferred_at)],
      ['Origen', t.from_name],
      ['Destino', t.to_name],
      ...(t.requirement_number ? ([['Atiende', `Requerimiento ${docNumber('RQ', t.requirement_number)}`]] as [string, string][]) : []),
      ['Registrado por', t.created_by_name],
      ...(t.status === 'anulada' ? ([['Estado', `ANULADA${t.cancel_reason ? ` — ${t.cancel_reason}` : ''}`]] as [string, string][]) : []),
    ],
    columns: [{ label: 'Código', width: 38 }, { label: 'Producto', width: 0 }, { label: 'Cant. enviada', width: 28, align: 'right' }],
    rows: t.items.map((it) => [lineCode(it), lineName(it), String(it.quantity)]),
    notes: t.notes,
    signatures: ['Despacha (almacén de origen)', 'Recibe (almacén de destino)'],
    footer: 'Documento de control interno. Conservar firmado por quien despacha y por quien recibe.',
  })
}
