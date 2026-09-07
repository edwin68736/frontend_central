import { api } from './api'
import type { PaginatedResponse, PerPageOption } from './pagination'

export interface SaasSubscription {
  id: number
  tenant_id: number
  tenant_name?: string
  plan_id: number
  plan_name: string
  /**
   * Billing_cycle ESTÁTICO del plan (monthly | yearly | lifetime, casi siempre "monthly" en el
   * catálogo actual) — NO refleja cuántos meses se contrataron en esta suscripción puntual. Para
   * eso ver `billed_months`.
   */
  billing_cycle?: string
  /** Meses VENDIDOS en esta suscripción/renovación (1 mensual, 3 trimestral, 6 semestral, 12
   *  anual...) — es lo que realmente se cobró. Usar esto para mostrar/filtrar el "ciclo". */
  billed_months?: number
  start_date: string
  end_date: string
  status: 'active' | 'expired' | 'suspended' | 'trial' | 'grace_period' | 'overdue' | 'provisional' | 'provisional_active' | 'cancelled'
  status_label?: string // traducción al español: "Vigente", "Mora", etc.
  days_overdue?: number // días de mora (0 si vigente)
  days_in_grace?: number // días restantes de gracia (0 si fuera de gracia)
  /** Es la suscripción que gobierna hoy al tenant; las demás son histórico de renovaciones. */
  is_current?: boolean
  notes: string
  modules: string[]
  created_at: string
}

export interface CreateSubscriptionInput {
  tenant_id: number
  plan_id: number
  months: number
  notes?: string
  /** YYYY-MM-DD opcional: arranca esta fecha en vez de hoy (debe ser hoy o futura). Solo tiene
   * efecto si el tenant no tiene ya una suscripción vigente con este plan (esa siempre encadena
   * sola desde su propio vencimiento). */
  start_date?: string
  /** Descuento opcional sobre el cobro (precio del plan × meses). */
  discount_type?: '' | 'percent' | 'fixed'
  discount_value?: number
}

export interface SubscriptionListParams {
  status?: string
  /** Filtro por ciclo: 1 mensual, 3 trimestral, 6 semestral, 12 anual (billed_months). */
  billed_months?: number
  q?: string
  /**
   * Filtro por vencimiento (YYYY-MM-DD, inclusive): "por vencer" (end_date_to = hoy + N días),
   * "vence en tal mes" (primer/último día del mes) o "ya vencieron" (end_date_to = ayer).
   */
  end_date_from?: string
  end_date_to?: string
  page?: number
  per_page?: PerPageOption
}

export const subscriptionsService = {
  async list(params: SubscriptionListParams = {}): Promise<PaginatedResponse<SaasSubscription>> {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.billed_months) searchParams.set('billed_months', String(params.billed_months))
    if (params.q) searchParams.set('q', params.q)
    if (params.end_date_from) searchParams.set('end_date_from', params.end_date_from)
    if (params.end_date_to) searchParams.set('end_date_to', params.end_date_to)
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const r = await api.get<PaginatedResponse<SaasSubscription>>(`/superadmin/subscriptions?${searchParams}`)
    return {
      data: r.data.data ?? [],
      page: r.data.page ?? 1,
      per_page: r.data.per_page ?? 25,
      total: r.data.total ?? 0,
      total_pages: r.data.total_pages ?? 0,
    }
  },

  async getByTenant(tenantId: number): Promise<SaasSubscription | null> {
    try {
      const r = await api.get(`/superadmin/tenants/${tenantId}/subscription`)
      return r.data
    } catch {
      return null
    }
  },

  /**
   * Crea la suscripción y devuelve, además, el cobro que quedó emitido, para poder
   * registrar el pago en el mismo paso sin una consulta extra.
   */
  async create(
    input: CreateSubscriptionInput,
  ): Promise<{ subscription: SaasSubscription; billingCycleId: number | null }> {
    const r = await api.post('/superadmin/subscriptions', input)
    return {
      subscription: r.data.data,
      billingCycleId: r.data.billing_cycle?.id ?? null,
    }
  },

  async suspend(id: number, reason = ''): Promise<void> {
    await api.patch(`/superadmin/subscriptions/${id}/suspend`, { reason })
  },

  /** Anula la suscripción (alta no concretada o baja). Conserva los datos del tenant. */
  async cancel(id: number, reason: string): Promise<void> {
    await api.patch(`/superadmin/subscriptions/${id}/cancel`, { reason })
  },

  async reactivate(id: number, extraMonths = 0): Promise<void> {
    await api.patch(`/superadmin/subscriptions/${id}/reactivate`, { extra_months: extraMonths })
  },

  async adjustValidity(id: number, body: { end_date: string; reason: string }): Promise<SaasSubscription> {
    const r = await api.patch(`/superadmin/subscriptions/${id}/adjust-validity`, body)
    return r.data.data
  },

  async checkExpirations(): Promise<{ suspended: number }> {
    const r = await api.post('/superadmin/cron/check-expirations')
    return r.data
  },
}
