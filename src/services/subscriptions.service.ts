import { api } from './api'

export interface SaasSubscription {
  id: number
  tenant_id: number
  plan_id: number
  plan_name: string
  start_date: string
  end_date: string
  status: 'active' | 'expired' | 'suspended' | 'trial'
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

export const subscriptionsService = {
  async list(status = ''): Promise<SaasSubscription[]> {
    const r = await api.get('/superadmin/subscriptions', { params: { status } })
    return r.data.data ?? []
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

  async checkExpirations(): Promise<{ suspended: number }> {
    const r = await api.post('/superadmin/cron/check-expirations')
    return r.data
  },
}
