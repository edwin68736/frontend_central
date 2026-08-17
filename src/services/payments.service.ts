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
  payment_method?: string
  /** Snapshot de lo que se le mostró al tenant al pagar (nombre del método, si era QR o cuenta
   *  bancaria, y el detalle vigente en ese momento) — ver PaymentMethodConfig en
   *  saasSettings.service.ts. Vacío en pagos registrados antes de este campo. */
  payment_method_label?: string
  payment_method_kind?: 'qr' | 'bank_account'
  payment_details_json?: string
  /**
   * pending_review = enviado por el tenant (espera validación).
   * pending = registrado por un admin desde este panel.
   * Ambos requieren aprobación; omitir pending_review de esta unión fue lo que impidió
   * que el compilador detectara que los botones de aprobar/rechazar no se renderizaban.
   * reversed = SE HABÍA aprobado y luego se anuló (ver revert) — deshizo la extensión de
   * suscripción/ciclo que esa aprobación había producido.
   */
  status: 'pending' | 'pending_review' | 'approved' | 'rejected' | 'reversed'
  reversed_at?: string | null
  reversed_by?: number | null
  reversal_reason?: string | null
  /**
   * Plan que el TENANT pidió al enviar este pago (elegir plan / renovar sin billing_cycle
   * previo, ver POST /api/subscription/renewal-request). null cuando el pago es contra un
   * billing_cycle ya emitido (no hubo elección: ese ciclo ya trae su plan).
   */
  requested_plan_id?: number | null
  notes: string
  admin_notes: string
  /** Boleta/factura emitida al cliente por este pago (PDF). */
  fiscal_doc_url?: string
  reviewed_by: number | null
  reviewed_at: string | null
  created_at: string
}

/** Cobro que necesita atención del usuario central (campana del header). */
export interface CollectionAlert {
  tenant_id: number
  tenant_name: string
  subscription_id?: number
  billing_cycle_id?: number
  payment_id?: number
  plan_name?: string
  amount: number
  due_date?: string
  days_overdue?: number
  /** El tenant nunca pagó ningún ciclo: es un alta que no se concretó. */
  never_paid?: boolean
  tenant_suspended?: boolean
}

export interface CollectionAlerts {
  /** Comprobantes que subieron los tenants y esperan validación. */
  pending_review: CollectionAlert[]
  /** Cobros que agotaron su ventana de pago sin pagarse. */
  overdue: CollectionAlert[]
  never_paid_count: number
  total: number
}

export const paymentsService = {
  async alerts(): Promise<CollectionAlerts> {
    const r = await api.get('/superadmin/payments/alerts')
    return r.data
  },

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

  /** periodMonths opcional: 0/omitido deja que el backend use lo que pidió el tenant
   * (payment.period_months) en vez de forzar 1 mes. */
  async approve(id: number, planId: number, adminNotes: string, periodMonths = 0): Promise<void> {
    await api.patch(`/superadmin/payments/${id}/approve`, {
      plan_id: planId,
      admin_notes: adminNotes,
      period_months: periodMonths,
    })
  },

  async reject(id: number, adminNotes: string): Promise<void> {
    await api.patch(`/superadmin/payments/${id}/reject`, { admin_notes: adminNotes })
  },

  /** Anula un pago YA APROBADO: deshace la extensión de suscripción/ciclo que produjo (el ciclo
   * vuelve a pending, o se borra si esta aprobación lo había creado) para que el tenant pueda
   * repetir el pago/la renovación desde cero. El pago no se borra, queda 'reversed'. */
  async revert(id: number, reason: string): Promise<void> {
    await api.patch(`/superadmin/payments/${id}/revert`, { reason })
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
