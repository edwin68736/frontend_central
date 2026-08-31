import { api } from './api'

/**
 * Role vs. RoleID (Fase 9 §9 — NUNCA mezclar):
 *   - `role`    = rol de SISTEMA ("admin" | "superadmin"), el bypass total. Solo se cambia con
 *                 PUT /users/:id/system-role, protegido por RequireSuperAdminOnly() en backend.
 *   - `role_id` = rol GRANULAR (sa_roles: Admin, Soporte, Finanzas, personalizados), o null si el
 *                 usuario todavía no tiene uno asignado. Se cambia con PUT /users/:id/role.
 */
export type SAUserRow = {
  id: number
  name: string
  email: string
  role: 'admin' | 'superadmin'
  role_id: number | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export type CreateSAUserInput = {
  name: string
  email: string
  password: string
  /** Rol granular opcional al crear — NUNCA incluye `role`: POST /users no puede crear
   *  superadmins bajo ninguna circunstancia (ver Fase 7 §4, decisión confirmada). */
  role_id?: number
}

/** PUT /users/:id — SOLO datos básicos. Role/RoleID/Active/Password tienen sus propios
 *  endpoints dedicados (ver abajo) — nunca se envían aquí, ni aunque el backend los ignorara. */
export type UpdateSAUserInput = {
  name?: string
  email?: string
}

export const saUsersService = {
  async list(): Promise<SAUserRow[]> {
    const { data } = await api.get<{ data: SAUserRow[] }>('/superadmin/users')
    return data.data ?? []
  },

  async create(input: CreateSAUserInput): Promise<SAUserRow> {
    const { data } = await api.post<{ success: boolean; data: SAUserRow }>('/superadmin/users', input)
    return data.data
  },

  async update(id: number, input: UpdateSAUserInput): Promise<void> {
    await api.put(`/superadmin/users/${id}`, input)
  },

  /** Asigna el rol granular (RoleID). El backend valida el techo de delegación
   *  (CanDelegateAll) — el frontend NUNCA decide si el actor puede asignar este rol, solo
   *  propaga el 403 si el backend lo rechaza (Fase 9 §8). */
  async changeRole(id: number, roleId: number): Promise<void> {
    await api.put(`/superadmin/users/${id}/role`, { role_id: roleId })
  },

  /** Cambia el rol de SISTEMA (admin ↔ superadmin) — únicamente alcanzable por un superadmin
   *  real; el backend lo exige con RequireSuperAdminOnly() sin importar lo que diga el frontend. */
  async changeSystemRole(id: number, role: 'admin' | 'superadmin'): Promise<void> {
    await api.put(`/superadmin/users/${id}/system-role`, { role })
  },

  async changeStatus(id: number, active: boolean): Promise<void> {
    await api.patch(`/superadmin/users/${id}/status`, { active })
  },

  async resetPassword(id: number, input: { new_password: string }): Promise<void> {
    await api.post(`/superadmin/users/${id}/password`, input)
  },

  async destroy(id: number): Promise<void> {
    await api.delete(`/superadmin/users/${id}`)
  },
}
