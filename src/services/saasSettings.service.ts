import { api } from './api'

export interface PaymentMethodConfig {
  key: string
  label: string
  enabled: boolean
}

export interface BankAccountConfig {
  bank: string
  account_number: string
  cci: string
  holder: string
  currency: string
  enabled: boolean
}

export interface SupportConfig {
  whatsapp: string
  email: string
  phone: string
}

export interface SaasPlatformSettings {
  reminder_days: number[]
  grace_period_days: number
  reconnection_fee: number
  auto_suspend_enabled: boolean
  provisional_reactivation_enabled: boolean
  provisional_hours: number
  strike_max: number
  cron_eval_hour: number
  cron_eval_minute: number
  timezone: string
  payment_methods: PaymentMethodConfig[]
  bank_accounts: BankAccountConfig[]
  yape_qr_url: string
  plin_qr_url: string
  portal_url_override: string
  support: SupportConfig
  operations_key_configured?: boolean
  updated_at?: string
}

/** Origen del backend sin sufijo /api (assets estáticos viven en /storage, /uploads). */
const API_ORIGIN = (): string => {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv && String(fromEnv).startsWith('http')) {
    return String(fromEnv).replace(/\/$/, '').replace(/\/api$/, '')
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'app.tukifac.com') return 'https://api.tukifac.com'
    if (host === 'app.tukifac.cloud') return 'https://api.tukifac.cloud'
  }
  // Dev con proxy Vite: /storage se proxea al backend
  return ''
}

export function saasAssetUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const origin = API_ORIGIN()
  const normalized = path.startsWith('/') ? path : `/${path}`
  return origin ? `${origin}${normalized}` : normalized
}

/** URL de preview con bust de caché (nombre qr_yape_1738….png o updated_at del settings). */
export function saasQrPreviewUrl(path: string, cacheToken?: string | number): string {
  const base = saasAssetUrl(path)
  if (!base) return ''
  const stampFromPath = path.match(/_(\d{10,})\.(jpe?g|png|webp)$/i)?.[1]
  const token = stampFromPath ?? (cacheToken != null && cacheToken !== '' ? String(cacheToken) : '')
  if (!token) return base
  return `${base}${base.includes('?') ? '&' : '?'}v=${token}`
}

export const saasSettingsService = {
  get: (): Promise<SaasPlatformSettings> =>
    api.get('/superadmin/saas-settings').then(r => {
      const d = r.data as SaasPlatformSettings & { portal_url?: string }
      return {
        ...d,
        portal_url_override: d.portal_url_override ?? d.portal_url ?? '',
        support: d.support ?? { whatsapp: '', email: '', phone: '' },
        bank_accounts: d.bank_accounts ?? [],
        payment_methods: d.payment_methods ?? [],
      }
    }),

  save: (data: SaasPlatformSettings): Promise<{ success: boolean }> =>
    api.put('/superadmin/saas-settings', data).then(r => r.data),

  uploadQr: (kind: 'yape' | 'plin', file: File): Promise<{ success: boolean; url: string }> => {
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('file', file)
    return api.post('/superadmin/saas-settings/upload-qr', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  runJobs: (): Promise<{
    reminders: number
    notifications: number
    status_updates: number
    suspended: number
    overdue_cycles: number
  }> => api.post('/superadmin/cron/saas-jobs').then(r => r.data),

  setOperationsKey: (body: {
    new_operations_key: string
    current_operations_key?: string
  }): Promise<{ success: boolean; operations_key_configured: boolean }> =>
    api.put('/superadmin/saas-settings/operations-key', body).then(r => r.data),
}
