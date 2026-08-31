import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import RolesPage from './RolesPage'
import { hasPermission as realHasPermission } from '@/lib/permissions'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/services/roles.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/roles.service')>('@/services/roles.service')
  return {
    ...actual,
    rolesService: {
      list: vi.fn().mockResolvedValue([
        { id: 1, name: 'Admin', description: 'Rol de sistema', is_system: true },
        { id: 2, name: 'Soporte Extra', description: 'Personalizado', is_system: false },
      ]),
      listPermissionsCatalog: vi.fn().mockResolvedValue([
        { id: 10, module: 'empresas', action: 'view', label: 'Ver empresas' },
      ]),
      getRolePermissionIds: vi.fn().mockResolvedValue([10]),
    },
  }
})

let mockPermissions: string[] = []

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (permission: string) => realHasPermission('admin', mockPermissions, permission),
  }),
}))

describe('RolesPage — acciones según permisos', () => {
  beforeEach(() => {
    mockPermissions = []
  })

  it('roles.view permite consultar la lista de roles', async () => {
    mockPermissions = ['roles.view']
    render(<RolesPage />)
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument())
    expect(screen.getByText('Soporte Extra')).toBeInTheDocument()
  })

  it('sin ningún permiso de escritura no aparece ninguna acción de administración', async () => {
    mockPermissions = ['roles.view']
    render(<RolesPage />)
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument())
    expect(screen.queryByText('Nuevo rol')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /permisos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('roles.create muestra el botón de crear', async () => {
    mockPermissions = ['roles.view', 'roles.create']
    render(<RolesPage />)
    await waitFor(() => expect(screen.getByText('Nuevo rol')).toBeInTheDocument())
  })

  it('roles.update muestra "Editar" en cada fila', async () => {
    mockPermissions = ['roles.view', 'roles.update']
    render(<RolesPage />)
    await waitFor(() => expect(screen.getAllByText('Editar').length).toBe(2))
  })

  it('roles.manage permite administrar permisos (botón "Permisos" visible por fila)', async () => {
    mockPermissions = ['roles.view', 'roles.manage']
    render(<RolesPage />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /permisos/i }).length).toBe(2))
  })

  it('roles.delete NUNCA muestra "Eliminar" sobre un rol de sistema (Admin)', async () => {
    mockPermissions = ['roles.view', 'roles.delete']
    render(<RolesPage />)
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument())
    // Solo 1 "Eliminar" (el rol personalizado) — el de sistema (Admin) queda protegido.
    expect(screen.getAllByText('Eliminar').length).toBe(1)
  })
})
