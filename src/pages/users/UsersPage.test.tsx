import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import UsersPage from './UsersPage'
import { hasPermission as realHasPermission } from '@/lib/permissions'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// vi.mock() se hoistea sobre CUALQUIER const de nivel de módulo — los datos de fixture van
// declarados dentro de la factory (o vía vi.hoisted) para no referenciar algo "antes de
// inicializarse".
vi.mock('@/services/saUsers.service', () => ({
  saUsersService: {
    list: vi.fn().mockResolvedValue([
      { id: 1, name: 'Yo Mismo', email: 'me@example.com', role: 'admin', role_id: null, active: true },
      { id: 2, name: 'Otro Admin', email: 'other@example.com', role: 'admin', role_id: 5, active: true },
    ]),
  },
}))

vi.mock('@/services/roles.service', () => ({
  rolesService: {
    list: vi.fn().mockResolvedValue([{ id: 5, name: 'Soporte', description: '', is_system: true }]),
  },
}))

let mockUser: { id: number; email: string; role: string } = { id: 1, email: 'me@example.com', role: 'admin' }
let mockPermissions: string[] = []

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    hasPermission: (permission: string) => realHasPermission(mockUser.role, mockPermissions, permission),
  }),
}))

describe('UsersPage — acciones según permisos', () => {
  beforeEach(() => {
    mockUser = { id: 1, email: 'me@example.com', role: 'admin' }
    mockPermissions = ['usuarios_central.view']
  })

  it('sin ningún permiso de escritura: no aparece "Nuevo usuario", ni "Rol", "Contraseña", "Eliminar" para OTRO usuario', async () => {
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText('other@example.com')).toBeInTheDocument())

    expect(screen.queryByText('Nuevo usuario')).not.toBeInTheDocument()
    // "Editar" SÍ debe aparecer para la fila propia (autoservicio) aunque no haya permiso.
    const rows = screen.getAllByRole('row')
    const ownRow = rows.find((r) => r.textContent?.includes('me@example.com'))
    const otherRow = rows.find((r) => r.textContent?.includes('other@example.com'))
    expect(ownRow?.textContent).toContain('Editar')
    expect(otherRow?.textContent).not.toContain('Editar')
    expect(screen.queryByText('Contraseña')).not.toBeInTheDocument()
    expect(screen.queryByText('Eliminar')).not.toBeInTheDocument()
  })

  it('con usuarios_central.create: aparece "Nuevo usuario"', async () => {
    mockPermissions = ['usuarios_central.view', 'usuarios_central.create']
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText('Nuevo usuario')).toBeInTheDocument())
  })

  it('con usuarios_central.destroy: aparece "Eliminar" en cada fila', async () => {
    mockPermissions = ['usuarios_central.view', 'usuarios_central.destroy']
    render(<UsersPage />)
    await waitFor(() => expect(screen.getAllByText('Eliminar').length).toBe(2))
  })

  it('con usuarios_central.reset_password: aparece "Contraseña"', async () => {
    mockPermissions = ['usuarios_central.view', 'usuarios_central.reset_password']
    render(<UsersPage />)
    await waitFor(() => expect(screen.getAllByText('Contraseña').length).toBe(2))
  })

  it('sin ser superadmin real: nunca aparece el botón "Sistema" (cambio de system-role)', async () => {
    mockUser = { id: 1, email: 'me@example.com', role: 'admin' }
    mockPermissions = ['*'] // incluso con TODOS los permisos granulares, sigue sin ser superadmin real
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText('other@example.com')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /sistema/i })).not.toBeInTheDocument()
  })

  it('siendo superadmin real: aparece "Sistema" para otros usuarios (no para uno mismo)', async () => {
    mockUser = { id: 1, email: 'me@example.com', role: 'superadmin' }
    mockPermissions = []
    render(<UsersPage />)
    await waitFor(() => expect(screen.getByText('other@example.com')).toBeInTheDocument())
    // Solo para la fila de "other" (id=2) — nunca para la propia (id=1, el superadmin logueado).
    expect(screen.getAllByRole('button', { name: /sistema/i }).length).toBe(1)
  })
})
