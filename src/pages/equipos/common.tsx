export const INPUT =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500'
export const LABEL = 'block text-sm font-medium text-slate-700 mb-1'
export const BTN_PRIMARY =
  'inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const BTN_SECONDARY =
  'inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50'

/** Mensaje de error del backend (o uno genérico). */
export function apiError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } }
  return err?.response?.data?.error ?? fallback
}

const SEMAPHORE_STYLES: Record<string, string> = {
  suficiente: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  moderado: 'bg-amber-50 text-amber-700 border-amber-200',
  bajo: 'bg-red-50 text-red-700 border-red-200',
}
const SEMAPHORE_LABEL: Record<string, string> = { suficiente: 'Suficiente', moderado: 'Moderado', bajo: 'Bajo' }

export function SemaphoreBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300">—</span>
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEMAPHORE_STYLES[value] ?? ''}`}>
      {SEMAPHORE_LABEL[value] ?? value}
    </span>
  )
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
        active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
      }`}
    >
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

export const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
]

export function formatDays(csv: string): string {
  if (!csv) return 'Sin definir'
  return csv
    .split(',')
    .map((d) => DAYS.find((x) => String(x.value) === d.trim())?.label ?? d)
    .join(' · ')
}

/** Período AAAA-MM del mes en curso (hora local). */
export function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
