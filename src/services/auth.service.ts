import { api } from './api'
import { decodeJwtPayload } from '@/lib/jwt'

export interface SAUser {
  id: number
  email: string
  role: 'admin' | 'superadmin'
  /** Permisos efectivos ("module.action"), o ["*"] para superadmin real. Ver hasPermission en
   *  src/lib/permissions.ts — nunca se lee esto como fuente de autorización real, solo de UX. */
  permissions: string[]
}

/** Forma cruda del body que hoy devuelve POST /superadmin/login — NO incluye `permissions`
 *  (esas solo viajan dentro del JWT firmado, ver decodeLoginToken). */
interface RawLoginUser {
  id: number
  email: string
  role: string
}

interface RawLoginResponse {
  token: string
  expires_in: number
  user: RawLoginUser
}

export interface LoginResponse {
  token: string
  expires_in: number
  user: SAUser
}

/** Claims del JWT central (ver pkg/middleware/auth.go SuperAdminClaims) — solo los campos que
 *  interesan en frontend. */
interface SuperAdminJWTClaims {
  role: string
  permissions?: string[]
}

function decodeLoginToken(token: string): { role: string; permissions: string[] } {
  const claims = decodeJwtPayload<SuperAdminJWTClaims>(token)
  return {
    role: claims?.role ?? 'admin',
    permissions: claims?.permissions ?? [],
  }
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<RawLoginResponse>('/superadmin/login', { email, password })
    // El body de /superadmin/login no trae `permissions` — se decodifican del propio JWT (ver
    // src/lib/jwt.ts). El `role` del token es la misma fuente que ya usa el backend para el
    // bypass, así que se prefiere sobre el `role` del body por si alguna vez difirieran.
    const { role, permissions } = decodeLoginToken(data.token)
    return {
      token: data.token,
      expires_in: data.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: (role as SAUser['role']) ?? (data.user.role as SAUser['role']),
        permissions,
      },
    }
  },

  async changeMyPassword(input: { current_password: string; new_password: string }): Promise<{ success: boolean }> {
    const { data } = await api.post<{ success: boolean }>('/superadmin/me/password', input)
    return data
  },
}
