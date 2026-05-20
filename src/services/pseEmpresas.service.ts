import { api } from './api'

export interface PSEEmpresaTenantMatch {
  id: number
  name: string
  slug: string
}

export interface PSEEmpresa {
  id: number
  ruc: string
  razon_social: string
  servidor: string
  estado: string
  fecha_inicio: string
  fecha_fin: string
  sin_limite_fecha: boolean
  firmas_usadas: number
  ose_activo: boolean
  tenant: PSEEmpresaTenantMatch | null
}

export type PSEEmpresasListParams = {
  page?: number
  per_page?: number
  search?: string
  estado?: 'ACTIVO' | 'INACTIVO' | string
  servidor?: 'DEMO' | 'PRODUCCIÓN' | 'PRODUCCION' | string
}

export type PSEEmpresasListResponse = {
  data: PSEEmpresa[]
  meta?: any
}

export const pseEmpresasService = {
  async list(params: PSEEmpresasListParams = {}): Promise<PSEEmpresasListResponse> {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.per_page) q.set('per_page', String(params.per_page))
    if (params.search) q.set('search', params.search)
    if (params.estado) q.set('estado', params.estado)
    if (params.servidor) q.set('servidor', params.servidor)
    const { data } = await api.get<PSEEmpresasListResponse>(`/superadmin/pse/empresas?${q}`)
    return { data: data.data ?? [], meta: data.meta }
  },
}

