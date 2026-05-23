import { api } from './api'

export type MigrationRow = {
  tenant_id: number
  tenant_slug: string
  company_name: string
  current_version: number
  target_version: number
  status: string
  attempts: number
  last_error: string | null
  last_migrated_at: string | null
  outdated: boolean
}

export type MigrationSummary = {
  total: number
  completed: number
  pending: number
  failed: number
  running: number
  paused: number
  blocked: number
  outdated: number
  schema_target_version: number
  without_registry: number
  circuit_open: boolean
  circuit_reason?: string
}

export const migrationsService = {
  summary: () =>
    api.get<MigrationSummary>('/superadmin/migrations/summary').then((r) => r.data),

  list: (params: Record<string, string | number | boolean>) =>
    api
      .get<{ data: MigrationRow[]; total: number; page: number; per_page: number }>(
        '/superadmin/migrations',
        { params },
      )
      .then((r) => r.data),

  retry: (tenantId: number) =>
    api.post(`/superadmin/migrations/${tenantId}/retry`).then((r) => r.data),

  migrate: (tenantId: number) =>
    api.post(`/superadmin/migrations/${tenantId}/migrate`).then((r) => r.data),

  pause: (tenantId: number) =>
    api.post(`/superadmin/migrations/${tenantId}/pause`).then((r) => r.data),

  resume: (tenantId: number) =>
    api.post(`/superadmin/migrations/${tenantId}/resume`).then((r) => r.data),

  resumeFleet: () =>
    api.post('/superadmin/migrations/resume-fleet').then((r) => r.data),
}
