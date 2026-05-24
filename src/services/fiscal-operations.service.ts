import { api } from './api'

export type FiscalHealthStatus = 'healthy' | 'degraded' | 'critical'

export interface FiscalHealth {
  status: FiscalHealthStatus
  queue_status: { emit: number; retry: number; audit: number }
  redis_connected: boolean
  pending_jobs: number
  failed_jobs: number
  worker_count: number
  worker_heartbeat_age_sec: number | null
  provider_status: Record<string, { connected: number; disconnected: number; total: number }>
  sunat_connectivity: { connected: number; total: number; ratio: number | null }
  db_status: string
  open_alerts: number
  critical_alerts: number
  checked_at: string
}

export interface FiscalOperationsSummary {
  cards: {
    documents_today: number
    pending: number
    errors_today: number
    retries_today: number
    avg_duration_ms: number | null
    tenants_connected: number
    tenants_with_error: number
    open_alerts: number
  }
  charts: {
    emissions_by_hour: Array<{ hour_bucket: string; total: number }>
    errors_by_provider: Array<{ provider: string; errors: number }>
    avg_duration_by_provider: Array<{ provider: string; avg_ms: number; samples: number }>
  }
}

export interface FiscalTenantOperation {
  tenant_id: number | null
  tenant_slug: string
  empresa: string
  ruc: string
  send_mode: string
  provider: string | null
  connection_status: string
  connection_error: string | null
  pending: number
  last_emit_at: string | null
  last_error: string | null
  retries_24h: number
  errors_24h: number
  avg_duration_ms: number | null
}

export interface FiscalQueueItem {
  document_uuid: string
  tenant_slug: string
  document_type: string
  series: string
  number: string
  status: string
  provider: string | null
  send_mode: string | null
  retry_count: number
  sunat_message: string | null
  pse_message?: string | null
  pse_response?: {
    isSuccess?: boolean | null
    estado?: number | string | null
    mensaje?: string | null
    codigo_hash?: string | null
    external_id?: string | null
  } | null
  display_message?: string | null
  queued_at: string | null
  next_retry_at: string | null
  created_at: string
}

export interface FiscalQueueMonitor {
  queued: FiscalQueueItem[]
  queued_count: number
  processing: FiscalQueueItem[]
  processing_count: number
  failed: FiscalQueueItem[]
  failed_count: number
  retrying: FiscalQueueItem[]
  retrying_count: number
  redis: { emit_queue: number; retry_scheduled: number }
}

export interface FiscalAlertItem {
  id: number
  tenant_slug: string | null
  ruc: string | null
  alert_type: string
  severity: string
  message: string
  created_at: string
}

export interface FiscalAuditTimeline {
  document_uuid: string
  tenant_slug: string
  timeline: Array<Record<string, unknown>>
  merged_timeline?: Array<Record<string, unknown>>
}

const qs = (params: Record<string, string | boolean | undefined>) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    p.set(k, String(v))
  })
  return p.toString()
}

export const fiscalOperationsService = {
  getHealth: () => api.get<FiscalHealth>('/superadmin/fiscal/health').then((r) => r.data),

  getSummary: () =>
    api.get<FiscalOperationsSummary>('/superadmin/fiscal/operations/summary').then((r) => r.data),

  getTenants: (filters: {
    tenant_slug?: string
    provider?: string
    send_mode?: string
    connection_status?: string
    errors_only?: boolean
    pending_only?: boolean
    q?: string
  } = {}) =>
    api
      .get<{ items: FiscalTenantOperation[]; total: number }>(
        `/superadmin/fiscal/operations/tenants?${qs(filters)}`
      )
      .then((r) => r.data),

  getQueue: () => api.get<FiscalQueueMonitor>('/superadmin/fiscal/operations/queue').then((r) => r.data),

  getAlerts: () =>
    api.get<{ open_count: number; items: FiscalAlertItem[] }>('/superadmin/fiscal/alerts').then((r) => r.data),

  getAuditTimeline: (uuid: string) =>
    api.get<FiscalAuditTimeline>(`/superadmin/fiscal/documents/${uuid}/audit-timeline`).then((r) => r.data),

  retryDocument: (uuid: string) => api.post(`/superadmin/fiscal/documents/${uuid}/retry`),

  cancelDocument: (uuid: string) => api.post(`/superadmin/fiscal/documents/${uuid}/cancel`),
}
