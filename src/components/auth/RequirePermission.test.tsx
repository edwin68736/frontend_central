import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RequirePermission from './RequirePermission'

const mockHasPermission = vi.fn()
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: mockHasPermission }),
}))

describe('RequirePermission', () => {
  it('ruta permitida → renderiza el contenido protegido', () => {
    mockHasPermission.mockReturnValue(true)
    render(
      <RequirePermission permission="pagos.view">
        <div>Contenido de pagos</div>
      </RequirePermission>
    )
    expect(screen.getByText('Contenido de pagos')).toBeInTheDocument()
    expect(mockHasPermission).toHaveBeenCalledWith('pagos.view')
  })

  it('ruta sin permiso → muestra la pantalla de acceso denegado (403), no el contenido', () => {
    mockHasPermission.mockReturnValue(false)
    render(
      <RequirePermission permission="pagos.view">
        <div>Contenido de pagos</div>
      </RequirePermission>
    )
    expect(screen.queryByText('Contenido de pagos')).not.toBeInTheDocument()
    expect(screen.getByText('Acceso denegado')).toBeInTheDocument()
  })

  it('403 NO redirige al login — no hay ningún elemento de navegación, solo el mensaje en el propio lugar', () => {
    mockHasPermission.mockReturnValue(false)
    const { container } = render(
      <RequirePermission permission="pagos.view">
        <div>Contenido de pagos</div>
      </RequirePermission>
    )
    // RequirePermission no importa react-router en absoluto: estructuralmente no puede redirigir.
    // Se confirma además que el DOM renderizado es exactamente la pantalla de Forbidden.
    expect(container.querySelector('a[href="/login"]')).toBeNull()
    expect(screen.getByText(/no tienes permisos/i)).toBeInTheDocument()
  })

  it('acepta un mensaje de fallback personalizado', () => {
    mockHasPermission.mockReturnValue(false)
    render(
      <RequirePermission permission="pagos.view" fallbackMessage="Mensaje personalizado de prueba">
        <div>Contenido</div>
      </RequirePermission>
    )
    expect(screen.getByText('Mensaje personalizado de prueba')).toBeInTheDocument()
  })
})
