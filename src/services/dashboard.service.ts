import { api } from './api'

export interface SAStats {
  total: number
  active: number
  inactive: number
  /** Conteo por plan real de la suscripción vigente: claves "plan_<nombre>" (dinámicas). */
  [key: string]: number
}

export interface RecentTenant {
  id: number
  name: string
  slug: string
  email: string
  plan: string
  status: string
  created_at: string
}

export interface DashboardData {
  stats: SAStats
  recent_tenants: RecentTenant[]
}

export const dashboardService = {
  async getStats(): Promise<DashboardData> {
    const { data } = await api.get<DashboardData>('/superadmin/stats')
    return data
  },
}
