import { api } from './api'

export interface SaasModule {
  id: number
  key: string
  name: string
  description: string
  icon: string
  active: boolean
}

export interface SaasPlan {
  id: number
  name: string
  description: string
  price: number
  billing_cycle: 'monthly' | 'yearly' | 'lifetime'
  active: boolean
  modules: string[]
  created_at: string
}

export interface CreatePlanInput {
  name: string
  description: string
  price: number
  billing_cycle: string
  modules: string[]
}

export const plansService = {
  async listModules(): Promise<SaasModule[]> {
    const r = await api.get('/superadmin/saas-modules')
    return r.data.data ?? []
  },

  async list(): Promise<SaasPlan[]> {
    const r = await api.get('/superadmin/plans')
    return r.data.data ?? []
  },

  async get(id: number): Promise<SaasPlan> {
    const r = await api.get(`/superadmin/plans/${id}`)
    return r.data
  },

  async create(input: CreatePlanInput): Promise<SaasPlan> {
    const r = await api.post('/superadmin/plans', input)
    return r.data.data
  },

  async update(id: number, input: CreatePlanInput): Promise<void> {
    await api.put(`/superadmin/plans/${id}`, input)
  },

  async toggle(id: number): Promise<void> {
    await api.patch(`/superadmin/plans/${id}/toggle`)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/superadmin/plans/${id}`)
  },
}
