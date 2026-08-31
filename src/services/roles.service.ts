import { api } from './api'

/** Rol granular del RBAC central (sa_roles) — NUNCA confundir con SAUser.role (Role de sistema,
 *  admin/superadmin) — ver Fase 9 §9 y saUsers.service.ts. */
export type SARole = {
  id: number
  name: string
  description: string
  is_system: boolean
  created_at?: string
  updated_at?: string
}

/** Entrada del catálogo de permisos (GET /permissions) — sa_permissions. */
export type SAPermission = {
  id: number
  module: string
  action: string
  label: string
}

export type CreateRoleInput = { name: string; description: string }
export type UpdateRoleInput = { name: string; description: string }

export const rolesService = {
  async list(): Promise<SARole[]> {
    const { data } = await api.get<{ data: SARole[] }>('/superadmin/roles')
    return data.data ?? []
  },

  async get(id: number): Promise<SARole> {
    const { data } = await api.get<{ data: SARole }>(`/superadmin/roles/${id}`)
    return data.data
  },

  async create(input: CreateRoleInput): Promise<SARole> {
    const { data } = await api.post<{ success: boolean; data: SARole }>('/superadmin/roles', input)
    return data.data
  },

  async update(id: number, input: UpdateRoleInput): Promise<void> {
    await api.put(`/superadmin/roles/${id}`, input)
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/superadmin/roles/${id}`)
  },

  /** IDs de permiso asignados a un rol (RolePermissions del backend retorna []uint). */
  async getRolePermissionIds(id: number): Promise<number[]> {
    const { data } = await api.get<{ data: number[] }>(`/superadmin/roles/${id}/permissions`)
    return data.data ?? []
  },

  /** Reemplaza TODO el conjunto de permisos del rol — el backend ya valida el techo de
   *  delegación (CanDelegateAll) del actor; el frontend nunca decide esto por su cuenta. */
  async setRolePermissions(id: number, permissionIds: number[]): Promise<void> {
    await api.put(`/superadmin/roles/${id}/permissions`, { permission_ids: permissionIds })
  },

  async listPermissionsCatalog(): Promise<SAPermission[]> {
    const { data } = await api.get<{ data: SAPermission[] }>('/superadmin/permissions')
    return data.data ?? []
  },
}

/** Agrupa el catálogo de permisos por módulo, para renderizar la matriz (Fase 9 §7) — nunca
 *  inventa módulos/acciones: solo reorganiza lo que el backend ya devolvió. */
export function groupPermissionsByModule(permissions: SAPermission[]): Map<string, SAPermission[]> {
  const grouped = new Map<string, SAPermission[]>()
  for (const p of permissions) {
    const list = grouped.get(p.module) ?? []
    list.push(p)
    grouped.set(p.module, list)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.action.localeCompare(b.action))
  }
  return grouped
}

/** "superadmin" (cualquier variación de mayúsculas) es un nombre reservado — el backend ya lo
 *  rechaza (ErrSAReservedRoleName), esto es solo para dar feedback inmediato en el formulario. */
export function isReservedRoleName(name: string): boolean {
  return name.trim().toLowerCase() === 'superadmin'
}
