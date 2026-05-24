import { api } from './api'

export interface FiscalStats {
  total: number
  documents_today: number
  pending: number
  in_queue: number
  processing: number
  sent: number
  accepted: number
  rejected: number
  errors: number
  retries: number
  emails_pending: number
  by_status: Record<string, number>
  tenants: Array<{ tenant_slug: string; total: number }>
}

export interface FiscalDocumentSummary {
  document_uuid: string
  tenant_id: number
  tenant_slug: string
  sale_id: number
  document_type: string
  series: string
  number: string
  status: string
  send_mode: string
  provider: string
  sunat_mode: string
  sunat_code: string | null
  sunat_message: string | null
  customer_name: string | null
  company_ruc: string | null
  total: number | string | null
  customer_email: string | null
  email_status: string | null
  retry_count: number
  created_at: string
  accepted_at: string | null
}

export interface FiscalDocumentsResponse {
  items: FiscalDocumentSummary[]
  counts?: Record<string, number>
  total?: number
  offset?: number
  limit?: number
  next_cursor?: string | null
  has_more?: boolean
}

export interface FiscalDocumentDetail {
  document: FiscalDocumentSummary & Record<string, unknown>
  snapshot_json: Record<string, unknown> | null
  pse_response: Record<string, unknown> | null
  attempts: Array<Record<string, unknown>>
  email_logs: Array<Record<string, unknown>>
  webhook_events: Array<Record<string, unknown>>
  timeline: Array<Record<string, unknown>>
  download_urls: Record<string, string>
}

export interface FiscalFilters {
  tenant_slug?: string
  company_ruc?: string
  from?: string
  to?: string
  document_type?: string
  status?: string
  send_mode?: string
  provider?: string
  series?: string
  number?: string
  customer_name?: string
  customer_email?: string
  errors_only?: boolean
  pending_only?: boolean
  retry_only?: boolean
  email_sent?: boolean
  limit?: number
  offset?: number
  cursor?: string
  include_total?: boolean
}

const qs = (filters: FiscalFilters) => {
  const p = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    p.set(k, String(v))
  })
  return p.toString()
}

export const fiscalService = {
  getStats: (filters: Pick<FiscalFilters, 'tenant_slug' | 'from' | 'to'> = {}) =>
    api.get<FiscalStats>(`/superadmin/fiscal/stats?${qs(filters)}`).then((r) => r.data),

  listDocuments: (filters: FiscalFilters = {}) =>
    api
      .get<FiscalDocumentsResponse>(`/superadmin/fiscal/documents?${qs(filters)}`)
      .then((r) => r.data),

  getDocument: (uuid: string) =>
    api.get<FiscalDocumentDetail>(`/superadmin/fiscal/documents/${uuid}`).then((r) => r.data),

  documentAction: (uuid: string, action: 'send' | 'retry' | 'force' | 'email' | 'poll') =>
    api.post(`/superadmin/fiscal/documents/${uuid}/${action}`).then((r) => r.data),

  bulkAction: (
    action: 'send' | 'retry' | 'force' | 'email' | 'poll',
    payload: { document_uuids?: string[]; filters?: Record<string, unknown>; max?: number }
  ) => api.post(`/superadmin/fiscal/documents/bulk/${action}`, payload).then((r) => r.data),

  downloadUrl: (uuid: string, type: 'xml' | 'signed_xml' | 'cdr' | 'pdf' | 'unsigned_xml') => {
    const base = api.defaults.baseURL || '/api'
    const token = localStorage.getItem('sa_token')
    return `${base}/superadmin/fiscal/documents/${uuid}/download/${type}?token=${encodeURIComponent(token || '')}`
  },
}

// Descarga autenticada vía fetch + blob
export async function downloadFiscalFile(
  uuid: string,
  type: 'xml' | 'signed_xml' | 'cdr' | 'pdf' | 'unsigned_xml',
  filename: string
) {
  const res = await api.get(`/superadmin/fiscal/documents/${uuid}/download/${type}`, {
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}
