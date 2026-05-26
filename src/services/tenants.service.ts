import { api } from './api'

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
  plan: string
  status: string
  rubro?: string
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
  /** Duración en meses de la suscripción al crear la empresa (0 = no crear suscripción). Por defecto 1. */
  subscription_months?: number
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
}

/** Catálogo de módulos del ERP por tenant (flags en tenant_modules). Opcional: nota para operadores del panel central. */
export interface ModuleCatalogItem {
  key: string
  name: string
  icon: string
  /** Texto breve bajo el nombre en el modal de módulos (evitar confusiones con el plan Tukifac–tenant). */
  centralNote?: string
}

export const ALL_MODULES: ModuleCatalogItem[] = [
  { key: 'sales', name: 'Ventas / POS', icon: '🛒' },
  { key: 'purchases', name: 'Compras', icon: '🚚' },
  { key: 'inventory', name: 'Inventario', icon: '📦' },
  { key: 'cashbank', name: 'Caja y Bancos', icon: '🏦' },
  { key: 'contacts', name: 'Clientes y Proveedores', icon: '📋' },
  { key: 'products', name: 'Productos', icon: '🏷️' },
  { key: 'billing', name: 'Facturación Electrónica', icon: '🧾' },
  { key: 'restaurant', name: 'Restaurante', icon: '🍽️' },
  { key: 'ecommerce', name: 'Ecommerce', icon: '🛍️' },
  { key: 'hotel', name: 'Hotel', icon: '🏨' },
  { key: 'clinic', name: 'Clínica / Consultorio', icon: '⚕️' },
  { key: 'transport', name: 'Transporte / logística', icon: '🚛' },
  { key: 'manufacturing', name: 'Producción / manufactura', icon: '🏭' },
  {
    key: 'memberships',
    name: 'Cuotas y membresías (clientes del tenant)',
    icon: '💳',
    centralNote:
      'Funcionalidad dentro del ERP para socios, alumnos, mensualidades, etc. No es el contrato del tenant con Tukifac (eso es el plan y Suscripciones/Pagos en este panel).',
  },
  { key: 'hr', name: 'Recursos Humanos (HR)', icon: '👥' },
  { key: 'accounting', name: 'Contabilidad', icon: '📒' },
  { key: 'bi', name: 'Business Intelligence', icon: '📊' },
  { key: 'fixedassets', name: 'Activos fijos', icon: '📚' },
  { key: 'documents', name: 'Documentos', icon: '📁' },
  { key: 'support', name: 'Soporte / Tickets', icon: '🎫' },
]

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
}

export const tenantsService = {
  async list(q = '', status = '', regionId = '', provinciaId = ''): Promise<Tenant[]> {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status) params.set('status', status)
    if (regionId) params.set('region_id', regionId)
    if (provinciaId) params.set('provincia_id', provinciaId)
    const { data } = await api.get<{ data: Tenant[] }>(`/superadmin/tenants?${params}`)
    return data.data ?? []
  },

  async get(id: number): Promise<{ data: Tenant; modules: TenantModule[] }> {
    const { data } = await api.get<{ data: Tenant; modules: TenantModule[] }>(`/superadmin/tenants/${id}`)
    return data
  },

  async create(input: CreateTenantInput): Promise<Tenant> {
    const { data } = await api.post<{ data: Tenant }>('/superadmin/tenants', input)
    return data.data
  },

  async update(id: number, input: UpdateTenantInput): Promise<void> {
    await api.put(`/superadmin/tenants/${id}`, input)
  },

  async setStatus(id: number, status: string): Promise<void> {
    await api.patch(`/superadmin/tenants/${id}/status`, { status })
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
}
