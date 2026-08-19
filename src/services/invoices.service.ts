import { api } from './api'
import type { PagedResult } from './payments.service'

export interface InvoiceListParams {
  status?: string
  /** Busca por nombre de empresa, RUC o subdominio (mismo criterio que Pagos/Suscripciones). */
  q?: string
  /** AAAA-MM-DD, inclusive. Filtra por vencimiento del cobro (due_date). */
  date_from?: string
  date_to?: string
  page?: number
  per_page?: number
}

/** Cobro emitido a un tenant (saas_billing_cycles). */
export interface SaasInvoice {
  id: number
  tenant_id: number
  /** Solo presente en el listado global de cobros. */
  tenant_name?: string
  tenant_ruc?: string
  period_start: string
  period_end: string
  due_date: string
  amount: number
  currency: string
  /** pending | overdue | paid | rejected (rejected = anulado) */
  status: string
  paid_at: string
  /**
   * El período que cubre este cobro está en curso: el cliente lo está usando. Anularlo le deja
   * el servicio hasta esa fecha sin deuda registrada, así que se advierte antes de confirmar.
   */
  covers_active_period?: boolean
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
  list: async (params: InvoiceListParams = {}): Promise<PagedResult<SaasInvoice>> => {
    const { data } = await api.get('/superadmin/billing-cycles', { params })
    return {
      data: data.data ?? [],
      page: data.page ?? 1,
      per_page: data.per_page ?? 25,
      total: data.total ?? 0,
      total_pages: data.total_pages ?? 0,
    }
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
