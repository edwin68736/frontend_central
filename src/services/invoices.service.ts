import { api } from './api'

/** Cobro emitido a un tenant (saas_billing_cycles). */
export interface SaasInvoice {
  id: number
  tenant_id: number
  /** Solo presente en el listado global de cobros. */
  tenant_name?: string
  period_start: string
  period_end: string
  due_date: string
  amount: number
  currency: string
  /** pending | overdue | paid | rejected (rejected = anulado) */
  status: string
  paid_at: string
}

/**
 * Lo que se cobraría al tenant. Todo se deriva de su suscripción vigente: el período
 * arranca cuando vence la actual y el importe sale del plan que tiene contratado.
 */
export interface RenewalPreview {
  tenant_id: number
  plan_id: number
  plan_name: string
  /** Vencimiento actual de la suscripción. */
  current_end: string
  /** Hasta dónde llega lo ya cobrado (incluye renovaciones emitidas sin pagar). */
  covered_until: string
  period_start: string
  /** Hasta cuándo quedará cubierto si paga. */
  period_end: string
  /** Fecha límite de pago (= vencimiento actual). */
  due_date: string
  months: number
  amount: number
  currency: string
  /** Ya existe un cobro emitido para ese período. */
  already_issued: boolean
}

export interface IssueRenewalInput {
  tenant_id: number
  /** 0 o ausente = los meses del ciclo del plan. */
  months?: number
  /** 0 o ausente = precio del plan por los meses cobrados. */
  amount?: number
  notes?: string
}

export const invoicesService = {
  /** Cobros de todas las empresas. Sin status: solo los que siguen por cobrar. */
  list: async (status = ''): Promise<SaasInvoice[]> => {
    const { data } = await api.get<{ data: SaasInvoice[] }>('/superadmin/billing-cycles', {
      params: status ? { status } : undefined,
    })
    return data.data ?? []
  },

  listByTenant: async (tenantId: number): Promise<SaasInvoice[]> => {
    const { data } = await api.get<{ data: SaasInvoice[] }>(`/superadmin/tenants/${tenantId}/billing-cycles`)
    return data.data ?? []
  },

  preview: async (input: IssueRenewalInput): Promise<RenewalPreview> => {
    const { data } = await api.get<{ data: RenewalPreview }>('/superadmin/billing-cycles/preview', {
      params: { tenant_id: input.tenant_id, months: input.months ?? 0, amount: input.amount ?? 0 },
    })
    return data.data
  },

  create: async (input: IssueRenewalInput): Promise<SaasInvoice> => {
    const { data } = await api.post<{ data: SaasInvoice }>('/superadmin/billing-cycles', input)
    return data.data
  },

  cancel: async (id: number): Promise<void> => {
    await api.patch(`/superadmin/billing-cycles/${id}/cancel`)
  },
}
