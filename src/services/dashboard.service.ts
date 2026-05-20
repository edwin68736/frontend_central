import { api } from './api'

export interface SAStats {
  total: number
  active: number
  inactive: number
  trial: number
  basic: number
  pro: number
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
