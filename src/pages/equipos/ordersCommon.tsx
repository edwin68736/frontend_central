import {
  ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, SHIPMENT_STATUS_LABEL, VALIDATION_LABEL,
} from '@/services/equiposOrders.service'

export const money = (n: number | null | undefined) =>
  `S/ ${(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Fecha corta de un valor ISO; las fechas «solo día» se muestran sin desfase de zona horaria. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(iso)
  if (/T\d{2}:\d{2}/.test(iso) && !Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' })
  }
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** AAAA-MM-DD de un valor ISO (para inputs type=date). */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })

const PILL = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'

const PAY_STYLE: Record<string, string> = {
  pagado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  parcial: 'bg-amber-50 text-amber-700 border-amber-200',
  pendiente: 'bg-red-50 text-red-700 border-red-200',
  no_pago: 'bg-slate-100 text-slate-500 border-slate-200',
}
export function PaymentBadge({ value }: { value: string }) {
  return <span className={`${PILL} ${PAY_STYLE[value] ?? PAY_STYLE.no_pago}`}>{PAYMENT_STATUS_LABEL[value] ?? value}</span>
}

const VAL_STYLE: Record<string, string> = {
  validado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pendiente_validacion: 'bg-amber-50 text-amber-700 border-amber-200',
  observado: 'bg-red-50 text-red-700 border-red-200',
}
export function ValidationBadge({ value }: { value: string }) {
  return <span className={`${PILL} ${VAL_STYLE[value] ?? ''}`}>{VALIDATION_LABEL[value] ?? value}</span>
}

const STATUS_STYLE: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600 border-slate-200',
  registrado: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  anulado: 'bg-red-50 text-red-700 border-red-200',
}
export function StatusBadge({ value }: { value: string }) {
  return <span className={`${PILL} ${STATUS_STYLE[value] ?? ''}`}>{ORDER_STATUS_LABEL[value] ?? value}</span>
}

const SHIP_STYLE: Record<string, string> = {
  pendiente_envio: 'bg-amber-50 text-amber-700 border-amber-200',
  en_transito: 'bg-sky-50 text-sky-700 border-sky-200',
  en_agencia: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  entregado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  retorno: 'bg-red-50 text-red-700 border-red-200',
}
export function ShipmentBadge({ value }: { value: string }) {
  if (!value) return <span className="text-slate-300">—</span>
  return <span className={`${PILL} ${SHIP_STYLE[value] ?? ''}`}>{SHIPMENT_STATUS_LABEL[value] ?? value}</span>
}

const ALERT_STYLE: Record<string, string> = {
  verde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amarillo: 'bg-amber-50 text-amber-700 border-amber-200',
  rojo: 'bg-red-50 text-red-700 border-red-200',
  vencido: 'bg-red-600 text-white border-red-600',
}
export function AlertBadge({ alert, since, left }: { alert: string; since: number | null; left: number | null }) {
  if (!alert) return null
  const text = alert === 'vencido' ? 'Plazo vencido' : `${since ?? 0} d en agencia${left != null ? ` · quedan ${left}` : ''}`
  return <span className={`${PILL} ${ALERT_STYLE[alert] ?? ''}`}>{text}</span>
}

export const SELECT = 'border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
