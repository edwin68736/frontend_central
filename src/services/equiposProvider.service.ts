import { api } from './api'
import type { OrderView } from './equiposOrders.service'

const base = '/superadmin/equipos'

/** Configuración de la integración con Shalom. La API key NUNCA llega al navegador: solo si existe y sus 4 últimos caracteres. */
export interface ShalomSettings {
  provider: string
  enabled: boolean
  base_url: string
  api_key_set: boolean
  api_key_hint: string
  pro_email: string
  pro_password_set: boolean
  encryption_ready: boolean
  webhook_url: string
  webhook_secret_set: boolean
  webhook_verified: boolean
  last_agencies_sync_at: string | null
  last_agencies_sync_count: number
  last_locations_sync_at: string | null
  agency_count: number
}

export interface ShalomSettingsInput {
  api_key?: string
  clear_api_key?: boolean
  base_url?: string
  enabled?: boolean
  webhook_url?: string
  pro_email?: string
  pro_password?: string
  clear_pro?: boolean
}

export interface SyncAgenciesResult { skipped: boolean; total: number; created: number; updated: number }
export interface SyncShipmentsResult { checked: number; changed: number; failed: number; skipped: number }
export interface ProviderLocation { id: number; kind: string; dep_id: number; prov_id: number; external_id: number; name: string; ubigeo: string }

export interface TariffQuote {
  currency: string
  aereo: boolean
  breakdown: Record<string, number>
  origin: string
  destination: string
  from_cache: boolean
}

export interface PanelNotification {
  id: number
  kind: string
  severity: string
  title: string
  message: string
  order_id: number
  order_number: number
  read_at: string | null
  created_at: string
}

export interface ShipmentEvent {
  id: number
  source: 'webhook' | 'consulta'
  type: string
  status: string
  at: string
  note: string
  timeline: { milestone: string; fecha: string; completo: boolean }[]
}

interface OrderResponse { data: OrderView; warnings?: string[] }
const unwrap = (r: { data: OrderResponse }) => ({ order: r.data.data, warnings: r.data.warnings ?? [] })

export const equiposProvider = {
  getSettings: () => api.get<{ data: ShalomSettings }>(`${base}/provider/shalom`).then((r) => r.data.data),
  saveSettings: (body: ShalomSettingsInput) => api.put<{ data: ShalomSettings }>(`${base}/provider/shalom`, body).then((r) => r.data.data),
  syncAgencies: () => api.post<{ data: SyncAgenciesResult }>(`${base}/provider/shalom/sync-agencies`, {}, { timeout: 180_000 }).then((r) => r.data.data),
  registerWebhook: () => api.post<{ data: ShalomSettings }>(`${base}/provider/shalom/webhook`, {}, { timeout: 180_000 }).then((r) => r.data.data),
  rotateWebhook: () => api.post<{ data: ShalomSettings }>(`${base}/provider/shalom/webhook/rotate`, {}, { timeout: 180_000 }).then((r) => r.data.data),
  syncShipments: () => api.post<{ data: SyncShipmentsResult }>(`${base}/provider/shalom/sync-shipments`, {}, { timeout: 180_000 }).then((r) => r.data.data),

  // Ubicaciones: salen de la BD; la primera vez que se elige un departamento se sincroniza con Shalom.
  departments: () => api.get<{ data: ProviderLocation[] }>(`${base}/provider/shalom/departments`, { timeout: 180_000 }).then((r) => r.data.data ?? []),
  provinces: (depId: number) => api.get<{ data: ProviderLocation[] }>(`${base}/provider/shalom/departments/${depId}/provinces`, { timeout: 180_000 }).then((r) => r.data.data ?? []),
  districts: (depId: number, provId: number) => api.get<{ data: ProviderLocation[] }>(`${base}/provider/shalom/departments/${depId}/provinces/${provId}/districts`).then((r) => r.data.data ?? []),

  linkTracking: (orderId: number, code: string) => api.post<OrderResponse>(`${base}/orders/${orderId}/provider/link`, { code }, { timeout: 180_000 }).then(unwrap),
  quoteTariff: (orderId: number, aereo = false) =>
    api.post<{ data: TariffQuote }>(`${base}/orders/${orderId}/provider/tariff`, { aereo }, { timeout: 180_000 }).then((r) => r.data.data),
  events: (orderId: number) => api.get<{ data: ShipmentEvent[] }>(`${base}/orders/${orderId}/provider/events`).then((r) => r.data.data ?? []),
  notifications: () => api.get<{ data: PanelNotification[]; unread: number }>(`${base}/notifications`).then((r) => ({ items: r.data.data ?? [], unread: r.data.unread ?? 0 })),
  markNotificationsRead: (body: { ids?: number[]; all?: boolean }) => api.post(`${base}/notifications/read`, body).then(() => undefined),
  refreshTracking: (orderId: number) => api.post<OrderResponse>(`${base}/orders/${orderId}/provider/refresh`, {}, { timeout: 180_000 }).then(unwrap),
}
