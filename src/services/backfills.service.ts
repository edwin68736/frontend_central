import { api } from './api'

/** Backfill run-once: corrección de datos idempotente aplicable por tenant o en masa. */
export interface BackfillInfo {
  version: number
  name: string
  /** Qué corrige, en castellano. Puede faltar en los backfills antiguos. */
  description?: string
}

export interface BackfillFleetResult {
  success: boolean
  aplicado: number
  failed: number
  failed_tenants?: string[]
}

export const backfillsService = {
  list: async (): Promise<BackfillInfo[]> => {
    const { data } = await api.get<{ data: BackfillInfo[] }>('/superadmin/backfills')
    return data.data ?? []
  },

  /** version 0/ausente = todos los backfills registrados. */
  runForTenant: async (tenantId: number, version = 0): Promise<void> => {
    await api.post(`/superadmin/tenants/${tenantId}/backfill`, null, {
      params: version ? { version } : undefined,
    })
  },

  runForAll: async (version = 0): Promise<BackfillFleetResult> => {
    const { data } = await api.post<BackfillFleetResult>('/superadmin/backfills/run-all', null, {
      params: version ? { version } : undefined,
    })
    return data
  },

  /**
   * Cancela ventas rápidas abandonadas (open, sin mesa, sin venta, de días anteriores) y saca
   * sus comandas de la cocina. Re-ejecutable: es mantenimiento recurrente, no un backfill.
   */
  cleanupAbandonedOrders: async (tenantId: number): Promise<number> => {
    const { data } = await api.post<{ cancelled: number }>(
      `/superadmin/tenants/${tenantId}/cleanup-abandoned-orders`,
    )
    return data.cancelled ?? 0
  },

  cleanupAbandonedOrdersAll: async (): Promise<{ cancelled: number; failed: number; failed_tenants?: string[] }> => {
    const { data } = await api.post('/superadmin/maintenance/cleanup-abandoned-orders')
    return data
  },
}
