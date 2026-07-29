import { api } from './api'
import type { PaginatedResponse, PerPageOption } from './pagination'

export interface SaasSubscription {
  id: number
  tenant_id: number
  tenant_name?: string
  plan_id: number
  plan_name: string
  start_date: string
  end_date: string
  status: 'active' | 'expired' | 'suspended' | 'trial' | 'grace_period' | 'overdue' | 'provisional' | 'provisional_active' | 'cancelled'
  status_label?: string // traducción al español: "Vigente", "Mora", etc.
  days_overdue?: number // días de mora (0 si vigente)
  days_in_grace?: number // días restantes de gracia (0 si fuera de gracia)
  notes: string
  modules: string[]
  created_at: string
}

export interface CreateSubscriptionInput {
  tenant_id: number
  plan_id: number
  months: number
  notes?: string
}

export interface SubscriptionListParams {
  status?: string
  q?: string
  page?: number
  per_page?: PerPageOption
}

export const subscriptionsService = {
  async list(params: SubscriptionListParams = {}): Promise<PaginatedResponse<SaasSubscription>> {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.q) searchParams.set('q', params.q)
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

  async create(input: CreateSubscriptionInput): Promise<SaasSubscription> {
    const r = await api.post('/superadmin/subscriptions', input)
    return r.data.data
  },

  async suspend(id: number, reason = ''): Promise<void> {
    await api.patch(`/superadmin/subscriptions/${id}/suspend`, { reason })
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
