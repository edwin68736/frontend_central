import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TenantFiscalSummary from './TenantFiscalSummary'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mocks = vi.hoisted(() => ({
  getTenantSummary: vi.fn(),
  refreshTenantSummary: vi.fn(),
}))

vi.mock('@/services/fiscal-operations.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/fiscal-operations.service')>(
    '@/services/fiscal-operations.service'
  )
  return { ...actual, fiscalOperationsService: mocks }
})

const row = {
  tenant_id: 7,
  name: 'Demo SAC',
  slug: 'demo',
  ruc: '20123456789',
  tenant_status: 'active',
  emitted: 50,
  accepted: 40,
  pending: 8,
  sent: 1,
  error: 2,
  rejected: 1,
  to_send: 10,
  by_type: { '01': { emitted: 20, to_send: 4 }, '03': { emitted: 30, to_send: 6 } },
  open_to_send: 12,
  oldest_open_at: '2026-09-01T00:00:00Z',
  last_issue_at: '2026-10-05T00:00:00Z',
  scanned_at: new Date().toISOString(),
}

const response = {
  items: [row],
  total: 1,
  page: 1,
  per_page: 25,
  totals: { tenants: 1, emitted: 50, accepted: 40, pending: 8, sent: 1, error: 2, rejected: 1, to_send: 10, with_to_send: 1, scan_errors: 0 },
  oldest_scan: new Date().toISOString(),
}

describe('TenantFiscalSummary', () => {
  beforeEach(() => {
    mocks.getTenantSummary.mockReset().mockResolvedValue(response)
    mocks.refreshTenantSummary.mockReset().mockResolvedValue({ ok: true })
  })

  it('muestra emitidos, aceptados y "faltan enviar" por tenant y los totales', async () => {
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText('Demo SAC')).toBeInTheDocument())
    expect(screen.getByText('20123456789')).toBeInTheDocument()
    // pending + error de la fila = 10 (aparece en la tabla y en los totales)
    expect(screen.getAllByText('10').length).toBeGreaterThan(0)
    // "Faltan enviar" aparece en la tarjeta de totales y en la cabecera de la columna.
    expect(screen.getAllByText('Faltan enviar')).toHaveLength(2)
  })

  it('arranca con el rango "Este mes" y pide los datos con from/to y orden por pendientes', async () => {
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(mocks.getTenantSummary).toHaveBeenCalled())
    const p = mocks.getTenantSummary.mock.calls[0][0]
    expect(p.from).toMatch(/^\d{4}-\d{2}-01$/)
    expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(p.sort).toBe('to_send')
    expect(p.page).toBe(1)
  })

  it('filtrar por tipo de comprobante envía doc_type y vuelve a la página 1', async () => {
    const user = userEvent.setup()
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText('Demo SAC')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Boleta' }))
    await user.click(screen.getByRole('button', { name: 'Guía remitente' }))
    await waitFor(() =>
      expect(mocks.getTenantSummary).toHaveBeenLastCalledWith(expect.objectContaining({ doc_type: '03,09', page: 1 }))
    )
  })

  it('"Todo el historial" quita el rango de fechas y "Solo con pendientes" lo activa', async () => {
    const user = userEvent.setup()
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText('Demo SAC')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Todo el historial' }))
    await waitFor(() => {
      const p = mocks.getTenantSummary.mock.calls.at(-1)![0]
      expect(p.from).toBeUndefined()
      expect(p.to).toBeUndefined()
    })
    await user.click(screen.getByLabelText(/solo con pendientes/i))
    await waitFor(() =>
      expect(mocks.getTenantSummary).toHaveBeenLastCalledWith(expect.objectContaining({ only_pending: true }))
    )
  })

  it('el RUC solo admite dígitos y se envía con espera', async () => {
    const user = userEvent.setup()
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText('Demo SAC')).toBeInTheDocument())
    await user.type(screen.getByPlaceholderText('RUC'), '20a12')
    await waitFor(() => expect(mocks.getTenantSummary).toHaveBeenLastCalledWith(expect.objectContaining({ ruc: '2012' })))
  })

  it('"Verificar" llama al refresh de ese tenant y recarga', async () => {
    const user = userEvent.setup()
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText('Demo SAC')).toBeInTheDocument())
    const before = mocks.getTenantSummary.mock.calls.length
    await user.click(screen.getByRole('button', { name: /verificar/i }))
    await waitFor(() => expect(mocks.refreshTenantSummary).toHaveBeenCalledWith(7))
    await waitFor(() => expect(mocks.getTenantSummary.mock.calls.length).toBeGreaterThan(before))
  })

  it('el detalle por tipo se despliega con el desglose de factura y boleta', async () => {
    const user = userEvent.setup()
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText('Demo SAC')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /ver detalle por tipo/i }))
    expect(screen.getByText(/Factura/, { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText(/Boleta/, { selector: 'b' })).toBeInTheDocument()
  })

  it('avisa cuando algún tenant no pudo verificarse', async () => {
    mocks.getTenantSummary.mockResolvedValue({
      ...response,
      items: [{ ...row, scan_error: 'ventas: no such table' }],
      totals: { ...response.totals, scan_errors: 1 },
    })
    render(<TenantFiscalSummary />)
    await waitFor(() => expect(screen.getByText(/no pudieron verificarse/i)).toBeInTheDocument())
    expect(screen.getByText('Error de escaneo')).toBeInTheDocument()
  })
})
