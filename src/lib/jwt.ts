/**
 * Decodificación de JWT SOLO del lado del cliente, SIN verificar firma — nunca debe usarse para
 * autorizar nada por sí sola. Su único propósito es leer el payload (permissions/role/exp) que el
 * backend ya firmó, para poder mostrar/ocultar UI (gating de UX). El backend sigue siendo la
 * única autoridad real: cualquier acción que este payload sugiera como "permitida" puede seguir
 * siendo rechazada con 403 si el token fue manipulado o quedó desactualizado — RequireSAPermission
 * en el backend es quien decide de verdad (ver Fase 9 §15, `frontend NO reemplaza al backend`).
 *
 * POST /superadmin/login no devuelve `permissions` en el body de la respuesta (solo dentro del
 * JWT firmado) — decodificar el token aquí evita tener que tocar el backend para exponerlas de
 * nuevo en JSON plano.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64url = parts[1]
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json) as T
  } catch {
    return null
  }
}
