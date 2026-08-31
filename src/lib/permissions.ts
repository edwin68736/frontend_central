/**
 * Único punto de verdad de la lógica de permisos en el frontend — replica EXACTAMENTE las reglas
 * de pkg/middleware/sa_permissions.go (HasSAPermission/saHasPermission) del backend:
 *   1. Role === "superadmin" (comparación exacta, case-insensitive) → bypass total.
 *   2. "*" en el conjunto de permisos → concede cualquier cosa.
 *   3. Coincidencia exacta del permiso pedido.
 *   4. Expansión de ".manage" — SOLO para los módulos y acciones de MANAGE_IMPLIED_ACTIONS abajo.
 *
 * Esta es SOLO la capa de UX (mostrar/ocultar botones y rutas) — nunca reemplaza la autorización
 * real del backend (RequireSAPermission/CanDelegateAll). Ver Fase 9 §15.
 *
 * IMPORTANTE: si el catálogo de permisos ".manage" cambia en el backend
 * (pkg/middleware/sa_permissions.go, saManageImpliedActions), este mapa debe actualizarse junto
 * con él — no hay ningún endpoint que exponga esta expansión dinámicamente.
 */
export const MANAGE_IMPLIED_ACTIONS: Record<string, string[]> = {
  facturador: ['view', 'sync'],
  documentos: ['view'],
  ajustes: ['view'],
  roles: ['view', 'create', 'update', 'delete'],
}

export function hasPermission(
  role: string | null | undefined,
  permissions: string[] | null | undefined,
  required: string
): boolean {
  if (!required) return false
  if ((role ?? '').trim().toLowerCase() === 'superadmin') return true

  const set = new Set(permissions ?? [])
  if (set.has('*')) return true
  if (set.has(required)) return true

  const dot = required.indexOf('.')
  if (dot < 0) return false
  const module = required.slice(0, dot)
  const action = required.slice(dot + 1)

  if (set.has(`${module}.manage`)) {
    return MANAGE_IMPLIED_ACTIONS[module]?.includes(action) ?? false
  }
  return false
}
