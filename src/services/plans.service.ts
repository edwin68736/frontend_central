import { api } from './api'

export interface SaasModule {
  id: number
  key: string
  name: string
  description: string
  icon: string
  category: string
  /** El módulo existe en código y es usable. Los no implementados NO se muestran al tenant,
   *  pero el superadmin sí los ve para pre-asignarlos a un plan. */
  implemented: boolean
  /** Keys de módulos de los que depende (CSV). Ej. "cashbank" para sales. */
  requires: string
  sort_order: number
  active: boolean
}

/** "" = sin descuento (precio pleno para ese ciclo). */
export type DiscountType = '' | 'percent' | 'fixed'

/** Ciclo fijo del plan (1/3/6/12 meses — nada más, ver backend saas.FixedPlanCycleMonths) con su
 *  precio ya calculado. gross_amount/net_amount vienen del backend — nunca se recalculan acá. */
export interface PlanCycle {
  months: number
  discount_type: DiscountType
  discount_value: number
  enabled: boolean
  gross_amount: number
  net_amount: number
}

export interface SaasPlan {
  id: number
  name: string
  description: string
  price: number
  billing_cycle: 'monthly' | 'yearly' | 'lifetime'
  active: boolean
  modules: string[]
  is_unlimited_documents?: boolean
  monthly_documents_limit?: number
  /** Cuotas del plan (0 = ilimitado). */
  max_users?: number
  max_branches?: number
  max_products?: number
  /** Los 4 ciclos fijos del plan con su descuento — siempre 4, ver backend saas.LoadPlanCycles. */
  cycles: PlanCycle[]
  created_at: string
}

/** Lo que se manda para un ciclo al crear/editar un plan — sin gross_amount/net_amount, eso lo
 *  calcula el backend. */
export interface PlanCycleInput {
  months: number
  discount_type: DiscountType
  discount_value: number
  enabled: boolean
}

export interface CreatePlanInput {
  name: string
  description: string
  price: number
  billing_cycle: string
  modules: string[]
  is_unlimited_documents?: boolean
  monthly_documents_limit?: number
  max_users?: number
  max_branches?: number
  max_products?: number
  cycles: PlanCycleInput[]
}

export interface ModuleInput {
  key: string
  name: string
  description: string
  icon: string
  category: string
  sort_order: number
}

/** Separa el CSV `requires` en keys. */
export function moduleRequires(m: Pick<SaasModule, 'requires'>): string[] {
  return (m.requires ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const plansService = {
  async listModules(): Promise<SaasModule[]> {
    const r = await api.get('/superadmin/saas-modules')
    return r.data.data ?? []
  },

  async createModule(input: ModuleInput): Promise<SaasModule> {
    const r = await api.post('/superadmin/saas-modules', input)
    return r.data.data
  },

  async updateModule(id: number, input: ModuleInput): Promise<void> {
    await api.put(`/superadmin/saas-modules/${id}`, input)
  },

  async toggleModule(id: number): Promise<void> {
    await api.patch(`/superadmin/saas-modules/${id}/toggle`)
  },

  async deleteModule(id: number): Promise<void> {
    await api.delete(`/superadmin/saas-modules/${id}`)
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
