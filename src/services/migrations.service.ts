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
  migrations_applied: number
  migrations_pending: number
}

export type MigrationSummary = {
  total: number
  completed: number
  pending: number
  failed: number
  running: number
  paused: number
  blocked: number
  drifted: number
  outdated: number
  schema_target_version: number
  without_registry: number
  circuit_open: boolean
  circuit_reason?: string
  avg_migration_duration_ms?: number
  last_fleet_run_at?: string | null
}

export type MigrationHistoryItem = {
  id: number
  version: number
  name: string
  type: string
  success: boolean
  applied_at: string
  duration_ms: number
  error?: string | null
  checksum?: string | null
}

export type DriftReport = {
  tenant_id: number
  tenant_slug: string
  declared_version: number
  proven_version: number
  drift_detected: boolean
  issues: string[]
}

export type RepairResult = {
  tenant_id: number
  tenant_slug: string
  drift_detected: boolean
  declared_before: number
  proven_before: number
  proven_after: number
  invalidated_from?: number
  rows_invalidated?: number
  issues?: string[]
  migrated: boolean
  error?: string
}

export type MigrationJob = {
  id: number
  kind: string
  status: string
  total: number
  processed: number
  succeeded: number
  failed: number
  payload?: string
  results?: string
  error?: string
  created_by: number
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export type MigrationListParams = {
  page?: number
  per_page?: number
  status?: string
  current_version?: number
  target_version?: number
  outdated?: boolean
  failed?: boolean
  pending?: boolean
  drifted?: boolean
  tenant_slug?: string
  tenant_name?: string
  last_migrated_from?: string
  last_migrated_to?: string
}

export const migrationsService = {
  summary: () =>
    api.get<MigrationSummary>('/superadmin/migrations/summary').then((r) => r.data),

  list: (params: MigrationListParams) =>
    api
      .get<{ data: MigrationRow[]; total: number; page: number; per_page: number }>(
        '/superadmin/migrations',
        { params },
      )
      .then((r) => r.data),

  history: (tenantId: number, limit = 200) =>
    api
      .get<{ data: MigrationHistoryItem[] }>(`/superadmin/migrations/${tenantId}/history`, {
        params: { limit },
      })
      .then((r) => r.data.data),

  drift: (tenantId: number) =>
    api.get<DriftReport>(`/superadmin/migrations/${tenantId}/drift`).then((r) => r.data),

  driftScan: (body: { tenant_id?: number; limit?: number; async?: boolean }) =>
    api.post<{ data?: DriftReport[]; count?: number; job?: MigrationJob }>(
      '/superadmin/migrations/drift-scan',
      body,
    ).then((r) => r.data),

  repair: (tenantId: number, opts?: { dry_run?: boolean; reconcile_only?: boolean }) =>
    api.post<RepairResult>(`/superadmin/migrations/${tenantId}/repair`, opts ?? {}).then((r) => r.data),

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

  bulkRepair: (tenantIds: number[]) =>
    api.post<{ job: MigrationJob }>('/superadmin/migrations/bulk/repair', { tenant_ids: tenantIds }).then((r) => r.data),

  bulkRepairDrifted: (limit = 50) =>
    api.post<{ job: MigrationJob }>('/superadmin/migrations/bulk/repair-drifted', { limit }).then((r) => r.data),

  bulkRetryFailed: (limit = 50) =>
    api.post<{ job: MigrationJob }>('/superadmin/migrations/bulk/retry-failed', { limit }).then((r) => r.data),

  listJobs: (limit = 10) =>
    api.get<{ data: MigrationJob[] }>('/superadmin/migrations/jobs', { params: { limit } }).then((r) => r.data.data),

  getJob: (jobId: number) =>
    api.get<MigrationJob>(`/superadmin/migrations/jobs/${jobId}`).then((r) => r.data),
}
