import type { FiscalDocumentSummary } from '@/services/fiscal.service'

/** Atajos de rango de fechas. Los días son calendario de Perú (America/Lima), como el filtro del backend. */
export type DatePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth'

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last7', label: '7 días' },
  { id: 'thisMonth', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes anterior' },
]

const LIMA = 'America/Lima'

/** YYYY-MM-DD del día de Lima para un instante dado. */
export function limaDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LIMA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function shiftDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function rangeForPreset(preset: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const today = limaDate(now)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = shiftDays(today, -1)
      return { from: y, to: y }
    }
    case 'last7':
      return { from: shiftDays(today, -6), to: today }
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'lastMonth': {
      const firstThis = `${today.slice(0, 7)}-01`
      const lastPrev = shiftDays(firstThis, -1)
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev }
    }
  }
}

/** Si el usuario pone "desde" posterior a "hasta", se corrige en vez de devolver una lista vacía. */
export function normalizeRange(from?: string, to?: string): { from?: string; to?: string } {
  if (from && to && from > to) return { from: to, to: from }
  return { from, to }
}

/** Fecha/hora en hora de Lima (el navegador del operador puede estar en otra zona). */
export function formatLima(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: LIMA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** "hace 12 min" / "hace 3 h" / "hace 2 d" a partir de una fecha ISO. */
export function agoText(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'nunca'
  const ms = now - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  return `hace ${durationText(Math.max(0, ms / 1000))}`.replace('hace menos de 1 min', 'hace instantes')
}

/** Duración corta: "menos de 1 min", "12 min", "3 h", "2 d". */
export function durationText(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  if (min < 60 * 48) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} d`
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta',
  '07': 'Nota de crédito',
  '08': 'Nota de débito',
  '09': 'Guía',
  RC: 'Resumen diario',
  RA: 'Comunicación de baja',
}

export const docTypeLabel = (t: string) => DOC_TYPE_LABELS[t] ?? t

/**
 * Búsqueda libre → filtros del backend:
 *  - "F001-123" → serie + correlativo
 *  - 11 dígitos → RUC de la empresa; 8 o menos dígitos → correlativo
 *  - cualquier otra cosa → nombre de cliente
 */
export function parseSearchQuery(raw: string): {
  series?: string
  number?: string
  company_ruc?: string
  customer_name?: string
} {
  const q = raw.trim()
  if (!q) return {}
  const sn = /^([A-Za-z0-9]{2,4})-(\d{1,10})$/.exec(q)
  if (sn) return { series: sn[1].toUpperCase(), number: String(Number(sn[2])) }
  if (/^\d{11}$/.test(q)) return { company_ruc: q }
  if (/^\d{1,8}$/.test(q)) return { number: String(Number(q)) }
  return { customer_name: q }
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function fiscalDocsToCsv(items: FiscalDocumentSummary[]): string {
  const head = [
    'Tenant',
    'RUC empresa',
    'Tipo',
    'Serie',
    'Número',
    'Cliente',
    'Emisión (Lima)',
    'Estado técnico',
    'Tipo de error',
    'Atendido',
    'Motivo atención',
    'Proveedor',
    'Monto',
    'Email',
    'Estado email',
    'Reintentos',
    'Mensaje SUNAT/PSE',
  ]
  const rows = items.map((d) => [
    d.tenant_slug,
    d.company_ruc,
    docTypeLabel(d.document_type),
    d.series,
    d.number,
    d.customer_name,
    formatLima(d.created_at),
    d.status,
    d.error_type,
    d.attended ? 'Sí' : 'No',
    d.attended_reason,
    d.provider,
    d.total,
    d.customer_email,
    d.email_status,
    d.retry_count,
    d.sunat_message,
  ])
  // BOM para que Excel abra bien los acentos.
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}
