import { api } from './api'
import type { PaginatedResponse } from './pagination'

export interface TenantListParams {
  q?: string
  status?: string
  region_id?: string
  provincia_id?: string
  page?: number
  per_page?: number
}

export interface Tenant {
  id: number
  name: string
  slug: string
  root_domain?: string
  tenant_host?: string
  tenant_url?: string
  email: string
  phone: string
  ruc: string
  address: string
  ubigeo: string
  /** Nombre del plan guardado en el tenant (texto). Para identificarlo use `plan_id`. */
  plan: string
  /**
   * Plan resuelto contra el catálogo SaaS, priorizando la suscripción vigente (fuente de
   * verdad). 0 o ausente = el plan guardado no existe en el catálogo (dato heredado).
   */
  plan_id?: number
  plan_name?: string
  status: string
  rubro?: string
  /** general | nrus — régimen tributario del contribuyente (Nuevo RUS no emite facturas) */
  taxpayer_regime?: 'general' | 'nrus'
  db_name: string
  admin_email: string
  sunat_env_mode?: string
  billing_enabled?: boolean
  created_at: string
  updated_at: string
}

export interface TenantModule {
  id: number
  tenant_id: number
  module_key: string
  enabled: boolean
  /** 'plan' = heredado del plan (se recalcula al reconciliar) | 'manual' = cortesía del superadmin. */
  source?: 'plan' | 'manual'
}

export interface CreateTenantInput {
  name: string
  email: string
  phone: string
  ruc: string
  plan: string
  slug: string
  address?: string
  ubigeo?: string
  admin_email: string
  admin_password: string
  /** general | gastronomico */
  rubro?: 'general' | 'gastronomico'
  /** general | nrus — régimen tributario del contribuyente */
  taxpayer_regime?: 'general' | 'nrus'
  /** Duración en meses de la suscripción al crear la empresa (0 = no crear suscripción). Por defecto 1. */
  subscription_months?: number
  /** YYYY-MM-DD opcional: la suscripción/primer cobro arranca esta fecha en vez de hoy (debe ser
   * hoy o futura). Útil cuando se registra la empresa hoy pero recién va a operar/pagar más
   * adelante. Vacío = arranca hoy, como siempre. */
  start_date?: string
  /** Descuento opcional sobre el cobro inicial (precio del plan × meses). */
  discount_type?: '' | 'percent' | 'fixed'
  discount_value?: number
}

export interface UpdateTenantInput {
  name: string
  email: string
  phone: string
  ruc: string
  plan: string
  status: string
  address?: string
  ubigeo?: string
  /** general | nrus — régimen tributario del contribuyente */
  taxpayer_regime?: 'general' | 'nrus'
}

/**
 * Emoji cosmético por módulo para el panel central. NO es un catálogo de módulos (la lista real
 * viene del backend `/superadmin/saas-modules`); es solo decoración con fallback para keys nuevas.
 */
const MODULE_EMOJI: Record<string, string> = {
  sales: '🛒', purchases: '🚚', inventory: '📦', cashbank: '🏦', contacts: '📋',
  products: '🏷️', billing: '🧾', restaurant: '🍽️', ecommerce: '🛍️', hotel: '🏨',
  clinic: '⚕️', transport: '🚛', manufacturing: '🏭', memberships: '💳', hr: '👥',
  accounting: '📒', bi: '📊', fixedassets: '📚', documents: '📁', support: '🎫',
}

export function moduleEmoji(key: string): string {
  return MODULE_EMOJI[key] ?? '🧩'
}

export interface TenantConectadoFacturador {
  id: number
  name: string
  slug: string
  ruc: string
  sunat_connected_at: string | null
  en_lycet: boolean
  ambiente_lycet?: string
  send_mode?: string
  provider?: string
  conexion_tipo: 'SUNAT' | 'PSE'
  connection_status?: string
  pse_configured?: boolean
  enabled?: boolean
}

export interface SunatConfigResponse {
  sunat_enabled: boolean
  sunat_env_mode: string
  tax_rate: number
  igv_regime: string
  tax_benefit_zone: boolean
  ruc?: string
  business_name?: string
  send_mode?: 'sunat_direct' | 'pse' | string
  pse_provider?: string
  fiscal_provider?: string
  connection_type?: 'bearer' | 'basic_auth' | 'custom' | string
  connection_status?: string
  fiscal_last_sync_at?: string | null
  sunat_connected?: boolean
  pse_base_url_configured?: boolean
  pse_token_configured?: boolean
  sol_configured?: boolean
  certificate_configured?: boolean
  /** Usuario SOL registrado en facturador (no incluye clave). */
  sunat_sol_user?: string
  /** Usuario PSE registrado en facturador. */
  pse_user?: string
  /** Nombre del archivo PEM de certificado en facturador, ej. 20123456789-cert.pem */
  certificate_file?: string
  /** Nombre del logo en facturador, ej. 20123456789-logo.png */
  logo_file?: string
  logo_configured?: boolean
  pse_base_url?: string
  gre_client_configured?: boolean
  gre_client_id?: string
}

export const tenantsService = {
  async list(params: TenantListParams = {}): Promise<PaginatedResponse<Tenant>> {
    const searchParams = new URLSearchParams()
    if (params.q) searchParams.set('q', params.q)
    if (params.status) searchParams.set('status', params.status)
    if (params.region_id) searchParams.set('region_id', params.region_id)
    if (params.provincia_id) searchParams.set('provincia_id', params.provincia_id)
    if (params.page) searchParams.set('page', String(params.page))
    if (params.per_page) searchParams.set('per_page', String(params.per_page))
    const { data } = await api.get<PaginatedResponse<Tenant>>(`/superadmin/tenants?${searchParams}`)
    return {
      data: data.data ?? [],
      page: data.page ?? 1,
      per_page: data.per_page ?? 25,
      total: data.total ?? 0,
      total_pages: data.total_pages ?? 0,
    }
  },

  async get(id: number): Promise<{ data: Tenant; modules: TenantModule[] }> {
    const { data } = await api.get<{ data: Tenant; modules: TenantModule[] }>(`/superadmin/tenants/${id}`)
    return data
  },

  /**
   * Crea la empresa y devuelve, además, el cobro que quedó emitido, para poder registrar el
   * pago en el mismo paso sin una consulta extra.
   */
  async create(input: CreateTenantInput): Promise<{ tenant: Tenant; billingCycleId: number | null }> {
    const { data } = await api.post<{ data: Tenant; billing_cycle?: { id: number } | null }>(
      '/superadmin/tenants',
      input,
    )
    return { tenant: data.data, billingCycleId: data.billing_cycle?.id ?? null }
  },

  async update(id: number, input: UpdateTenantInput): Promise<void> {
    await api.put(`/superadmin/tenants/${id}`, input)
  },

  async setStatus(id: number, status: string): Promise<void> {
    await api.patch(`/superadmin/tenants/${id}/status`, { status })
  },

  /** Acceso maestro al ERP web del tenant (solo superadmin). */
  async masterAccess(id: number): Promise<{ tenant_url: string; token: string }> {
    const { data } = await api.post<{ tenant_url: string; token: string }>(
      `/superadmin/tenants/${id}/master-access`,
    )
    return data
  },

  async getModules(id: number): Promise<TenantModule[]> {
    const { data } = await api.get<{ data: TenantModule[] }>(`/superadmin/tenants/${id}/modules`)
    return data.data ?? []
  },

  async setModule(tenantId: number, module_key: string, enabled: boolean): Promise<void> {
    await api.post(`/superadmin/tenants/${tenantId}/modules`, { module_key, enabled })
  },

  /** Elimina por completo tenant, BD MySQL y archivos locales (no toca Lycet/SUNAT). */
  async destroyComplete(
    id: number,
    body: { operations_key: string; confirm_slug: string },
  ): Promise<{
    success: boolean
    message: string
    result: {
      tenant_id: number
      slug: string
      db_name: string
      db_dropped: boolean
      central_purged: boolean
      paths_removed: string[]
      file_errors?: string[]
    }
  }> {
    const { data } = await api.post(`/superadmin/tenants/${id}/destroy-complete`, body)
    return data
  },

  /** Empresas registradas en facturador (SUNAT + PSE). */
  async getSunatConfig(tenantId: number): Promise<SunatConfigResponse> {
    const { data } = await api.get<SunatConfigResponse>(`/superadmin/tenants/${tenantId}/sunat-config`)
    return data
  },

  async updateSunatConfig(tenantId: number, body: SunatConfigUpdate): Promise<void> {
    await api.put(`/superadmin/tenants/${tenantId}/sunat-config`, body)
  },

  async testFiscalConnection(tenantId: number) {
    const { data } = await api.post(`/superadmin/tenants/${tenantId}/fiscal-test-connection`)
    return data
  },

  async setSunatEnv(tenantId: number, sunat_env_mode: 'demo' | 'production'): Promise<void> {
    await api.patch(`/superadmin/tenants/${tenantId}/sunat-env`, { sunat_env_mode })
  },

  async syncFacturador(
    tenantId: number,
    body?: {
      certificate_base64?: string
      private_key_base64?: string
      pfx_base64?: string
      certificate_password?: string
      logo_base64?: string
      sol_user?: string
      sol_pass?: string
    }
  ): Promise<{ success: boolean; message?: string }> {
    const { data } = await api.post<{ success: boolean; message?: string }>(
      `/superadmin/tenants/${tenantId}/sync-facturador`,
      body ?? {}
    )
    return data
  },

  /** Empresas registradas en facturador (SUNAT + PSE). */
  async listConectadosFacturador(): Promise<TenantConectadoFacturador[]> {
    const { data } = await api.get<{ data: TenantConectadoFacturador[] }>(
      '/superadmin/tenants/conectados-facturador'
    )
    return data.data ?? []
  },

  /** Habilita/deshabilita en el facturador (Lycet) la empresa por RUC (campo enabled). */
  async setFacturadorEnabled(ruc: string, enabled: boolean): Promise<void> {
    await api.patch('/superadmin/tenants/facturador-enabled', { ruc, enabled })
  },
}

export interface SunatConfigUpdate {
  sunat_enabled: boolean
  sunat_sol_user?: string
  sunat_sol_pass?: string
  certificate?: string
  sunat_env_mode?: string
  tax_rate?: number
  igv_regime?: string
  tax_benefit_zone?: boolean
  send_mode?: 'sunat_direct' | 'pse' | string
  pse_provider?: string
  fiscal_provider?: string
  connection_type?: 'bearer' | 'basic_auth' | 'custom' | string
  pse_base_url?: string
  pse_token?: string
  pse_user?: string
  pse_password?: string
  gre_client_id?: string
  gre_client_secret?: string
}
