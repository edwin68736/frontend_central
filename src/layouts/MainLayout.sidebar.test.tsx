import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import MainLayout from './MainLayout'
import { hasPermission as realHasPermission } from '@/lib/permissions'

vi.mock('@/services/payments.service', () => ({
  paymentsService: { alerts: vi.fn().mockResolvedValue(null) },
}))

let mockUser: { email: string; role: string } = { email: 'admin@example.com', role: 'admin' }
let mockPermissions: string[] = []

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    hasPermission: (permission: string) => realHasPermission(mockUser.role, mockPermissions, permission),
  }),
}))

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route path="dashboard" element={<div>Dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('MainLayout sidebar', () => {
  it('solo aparecen los módulos para los que el usuario tiene permiso', () => {
    mockUser = { email: 'admin@example.com', role: 'admin' }
    mockPermissions = ['dashboard.view', 'empresas.view']
    renderLayout()

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Empresas')).toBeInTheDocument()
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument()
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
    expect(screen.queryByText('Pagos')).not.toBeInTheDocument()
  })

  it('un admin sin ningún permiso no ve ningún módulo', () => {
    mockUser = { email: 'nadie@example.com', role: 'admin' }
    mockPermissions = []
    renderLayout()

    ;['Dashboard', 'Empresas', 'Usuarios', 'Roles', 'Pagos', 'Configuración'].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    })
  })

  it('superadmin ve TODOS los módulos, sin necesitar permissions explícitos', () => {
    mockUser = { email: 'root@example.com', role: 'superadmin' }
    mockPermissions = []
    renderLayout()

    ;['Dashboard', 'Empresas', 'Usuarios', 'Roles', 'Pagos', 'Configuración'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('usuarios_central.view muestra "Usuarios" pero NO "Roles"', () => {
    mockUser = { email: 'admin@example.com', role: 'admin' }
    mockPermissions = ['usuarios_central.view']
    renderLayout()

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
  })
})
