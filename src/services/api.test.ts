import { describe, it, expect } from 'vitest'
import { shouldRedirectToLogin } from './api'

describe('shouldRedirectToLogin (Fase 9 §13 — 401 vs 403)', () => {
  it('401 en una ruta protegida → true (sesión inválida, debe ir a login)', () => {
    expect(shouldRedirectToLogin(401, '/superadmin/users')).toBe(true)
  })

  it('401 en el propio endpoint de login → false (credenciales incorrectas, no una sesión caída)', () => {
    expect(shouldRedirectToLogin(401, '/superadmin/login')).toBe(false)
  })

  it('403 en cualquier ruta → false: NUNCA redirige a login (sesión válida, solo falta el permiso)', () => {
    expect(shouldRedirectToLogin(403, '/superadmin/users')).toBe(false)
    expect(shouldRedirectToLogin(403, '/superadmin/roles/1/permissions')).toBe(false)
  })

  it('otros códigos de error no disparan la redirección', () => {
    expect(shouldRedirectToLogin(400, '/superadmin/users')).toBe(false)
    expect(shouldRedirectToLogin(404, '/superadmin/users')).toBe(false)
    expect(shouldRedirectToLogin(500, '/superadmin/users')).toBe(false)
    expect(shouldRedirectToLogin(undefined, '/superadmin/users')).toBe(false)
  })
})
