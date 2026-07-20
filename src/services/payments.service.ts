import { api } from './api'

export interface SaasPayment {
  id: number
  tenant_id: number
  tenant_name: string
  tenant_slug: string
  subscription_id: number | null
  amount: number
  currency: string
  period_months: number
  receipt_url: string
  /**
   * pending_review = enviado por el tenant (espera validación).
   * pending = registrado por un admin desde este panel.
   * Ambos requieren aprobación; omitir pending_review de esta unión fue lo que impidió
   * que el compilador detectara que los botones de aprobar/rechazar no se renderizaban.
   */
  status: 'pending' | 'pending_review' | 'approved' | 'rejected'
  notes: string
  admin_notes: string
  /** Boleta/factura emitida al cliente por este pago (PDF). */
  fiscal_doc_url?: string
  reviewed_by: number | null
  reviewed_at: string | null
  created_at: string
}

export const paymentsService = {
  async list(status = ''): Promise<SaasPayment[]> {
    const r = await api.get('/superadmin/payments', { params: { status } })
    return r.data.data ?? []
  },

  async get(id: number): Promise<SaasPayment> {
    const r = await api.get(`/superadmin/payments/${id}`)
    return r.data
  },

  async create(formData: FormData): Promise<SaasPayment> {
    const r = await api.post('/superadmin/payments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return r.data.data
  },

  async approve(id: number, planId: number, adminNotes: string): Promise<void> {
    await api.patch(`/superadmin/payments/${id}/approve`, {
      plan_id: planId,
      admin_notes: adminNotes,
    })
  },

  async reject(id: number, adminNotes: string): Promise<void> {
    await api.patch(`/superadmin/payments/${id}/reject`, { admin_notes: adminNotes })
  },

  /** Adjunta la boleta/factura (PDF) que se le emite al cliente por este pago. */
  async uploadFiscalDoc(id: number, file: File): Promise<string> {
    const fd = new FormData()
    fd.append('document', file)
    const r = await api.post(`/superadmin/payments/${id}/fiscal-document`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return r.data.fiscal_doc_url
  },
}
