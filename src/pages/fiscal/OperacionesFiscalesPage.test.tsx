import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OperacionesFiscalesPage from './OperacionesFiscalesPage'

/**
 * Fase 4 del Panel Central Fiscal: OperacionesFiscalesPage debe reflejar el mismo bucket que
 * FiscalDocumentsPage (misma fuente: src/lib/fiscalStatus.ts) y el botón "Reprocesar" debe
 * respetar error_type/retryable, no solo status. Matriz D/E/F/B/C de la auditoría de Fase 4.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mocks = vi.hoisted(() => ({
  getHealth: vi.fn(),
  getSummary: vi.fn(),
  getTenants: vi.fn(),
  getTenantSummary: vi.fn(),
  refreshTenantSummary: vi.fn(),
  getQueue: vi.fn(),
  getAlerts: vi.fn(),
  getAuditTimeline: vi.fn(),
  retryDocument: vi.fn(),
  cancelDocument: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}))

vi.mock('@/services/fiscal-operations.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/fiscal-operations.service')>(
    '@/services/fiscal-operations.service'
  )
  return { ...actual, fiscalOperationsService: mocks }
})

const baseItem = {
  document_uuid: 'uuid-1',
  tenant_slug: 'tenant-x',
  document_type: '03',
  series: 'B001',
  number: '1',
  status: 'error',
  provider: 'sunat',
  send_mode: 'sunat',
  retry_count: 0,
  sunat_message: 'algún mensaje SUNAT',
  queued_at: null,
  next_retry_at: null,
  created_at: '2026-09-19T00:00:00+00:00',
}

// Fase 8: getQueue() ahora se pide UN bucket a la vez (group/limit/offset) — el mock responde
// según el group solicitado, igual que el backend real (items solo si coincide, counts siempre
// completos para las 4 pestañas).
function queueResponseFor(group: string, items: Array<Record<string, unknown>>) {
  const matches = group === 'stuck'
  return {
    group,
    items: matches ? items : [],
    total: matches ? items.length : 0,
    limit: 25,
    offset: 0,
    counts: { queued: 0, processing: 0, retrying: 0, stuck: items.length, needs_action: 17 },
    redis: { emit_queue: 0, retry_scheduled: 0 },
  }
}

async function setup(items: Array<Record<string, unknown>>) {
  mocks.getHealth.mockResolvedValue({
    status: 'healthy',
    queue_status: { emit: 0, retry: 0, audit: 0 },
    redis_connected: true,
    pending_jobs: 0,
    failed_jobs: 0,
    worker_count: 1,
    worker_heartbeat_age_sec: 1,
    provider_status: {},
    sunat_connectivity: { connected: 1, total: 1, ratio: 1 },
    db_status: 'ok',
    open_alerts: 0,
    critical_alerts: 0,
    checked_at: '2026-09-19T00:00:00+00:00',
  })
  mocks.getSummary.mockResolvedValue({
    cards: {
      documents_today: 0,
      pending: 0,
      errors_today: 0,
      retries_today: 0,
      avg_duration_ms: null,
      tenants_connected: 0,
      tenants_with_error: 0,
      open_alerts: 0,
    },
    charts: { emissions_by_hour: [], errors_by_provider: [], avg_duration_by_provider: [] },
  })
  mocks.getTenants.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
  mocks.getQueue.mockImplementation(async ({ group }: { group: string }) => queueResponseFor(group, items))
  mocks.getAlerts.mockResolvedValue({ open_count: 0, items: [] })

  const user = userEvent.setup()
  render(<OperacionesFiscalesPage />)
  await waitFor(() => expect(screen.getByText(/monitor de cola/i)).toBeInTheDocument())
  // Las filas se renderizan igual en cualquier pestaña en vivo; se usa "Atascados" (traducida).
  const stuckTab = screen.getByRole('button', { name: /^atascados/i })
  await user.click(stuckTab)
  await waitFor(() => expect(screen.getByText('tenant-x')).toBeInTheDocument())
  return user
}

describe('OperacionesFiscalesPage — Fase 4', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
  })

  it('Matriz E: manual_only no presenta "Reprocesar" y explica que requiere acción administrativa', async () => {
    await setup([{ ...baseItem, error_type: 'manual_only', retryable: false }])

    expect(screen.queryByRole('button', { name: /reprocesar/i })).not.toBeInTheDocument()
    expect(screen.getByText('Requiere acción manual')).toBeInTheDocument()
    expect(screen.getByText(/requiere acción administrativa/i)).toBeInTheDocument()
  })

  it('Matriz F: permanent no presenta "Reprocesar"', async () => {
    await setup([{ ...baseItem, error_type: 'permanent', retryable: false }])

    expect(screen.queryByRole('button', { name: /reprocesar/i })).not.toBeInTheDocument()
    expect(screen.getByText('Error permanente')).toBeInTheDocument()
  })

  it('Matriz D: business (status=rejected) no presenta "Reprocesar"', async () => {
    await setup([{ ...baseItem, status: 'rejected', error_type: 'business', retryable: false }])

    expect(screen.queryByRole('button', { name: /reprocesar/i })).not.toBeInTheDocument()
    expect(screen.getByText('Rechazado (negocio)')).toBeInTheDocument()
  })

  it('Matriz B: transient retryable=true SÍ presenta "Reprocesar" y se muestra "En proceso"', async () => {
    await setup([{ ...baseItem, error_type: 'transient', retryable: true, retry_count: 2 }])

    expect(screen.getByRole('button', { name: /reprocesar/i })).toBeInTheDocument()
    expect(screen.getByText('En proceso')).toBeInTheDocument()
  })

  it('Matriz C: transient agotado (retryable=false) SIGUE presentando "Reprocesar" (retry manual permitido) y nunca dice "imposible"', async () => {
    await setup([{ ...baseItem, error_type: 'transient', retryable: false, retry_count: 5 }])

    expect(screen.getByRole('button', { name: /reprocesar/i })).toBeInTheDocument()
    expect(screen.getByText('Automático agotado (reintento manual)')).toBeInTheDocument()
    expect(screen.queryByText(/imposible/i)).not.toBeInTheDocument()
  })

  it('documento histórico sin error_type se renderiza sin crash (fallback genérico)', async () => {
    await setup([{ ...baseItem, error_type: null, retryable: undefined }])

    expect(screen.getByText('tenant-x')).toBeInTheDocument()
    expect(screen.getByText('Requiere acción')).toBeInTheDocument()
  })

  it('Reprocesar sobre transient dispara retryDocument; un 409 del backend muestra error+hint reales', async () => {
    mocks.retryDocument.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 409',
      response: {
        status: 409,
        data: {
          error: 'Este documento no admite reenvío/reintento normal en su estado actual',
          status: 'error',
          error_type: 'manual_only',
          retryable: false,
          hint: 'Usar la acción "force" para forzar el reenvío de todas formas (override administrativo).',
        },
      },
    })
    const user = await setup([{ ...baseItem, error_type: 'transient', retryable: true, retry_count: 1 }])
    const { toast } = await import('sonner')

    await user.click(screen.getByRole('button', { name: /reprocesar/i }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Usar la acción "force" para forzar el reenvío de todas formas')
      )
    )
  })
})

describe('OperacionesFiscalesPage — Fase 8 (paginación)', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
    mocks.getHealth.mockResolvedValue({
      status: 'healthy',
      queue_status: { emit: 0, retry: 0, audit: 0 },
      redis_connected: true,
      pending_jobs: 0,
      failed_jobs: 0,
      worker_count: 1,
      worker_heartbeat_age_sec: 1,
      provider_status: {},
      sunat_connectivity: { connected: 1, total: 1, ratio: 1 },
      db_status: 'ok',
      open_alerts: 0,
      critical_alerts: 0,
      checked_at: '2026-09-19T00:00:00+00:00',
    })
    mocks.getSummary.mockResolvedValue({
      cards: {
        documents_today: 0,
        pending: 0,
        errors_today: 0,
        retries_today: 0,
        avg_duration_ms: null,
        tenants_connected: 0,
        tenants_with_error: 0,
        open_alerts: 0,
      },
      charts: { emissions_by_hour: [], errors_by_provider: [], avg_duration_by_provider: [] },
    })
    mocks.getAlerts.mockResolvedValue({ open_count: 0, items: [] })
    mocks.getQueue.mockResolvedValue({
      group: 'queued',
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
      counts: { queued: 0, processing: 0, failed: 0, retrying: 0 },
      redis: { emit_queue: 0, retry_scheduled: 0 },
    })
  })

  it('cambiar de pestaña en la cola reinicia el offset a 0 y vuelve a pedir con el group nuevo', async () => {
    mocks.getTenants.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })

    const user = userEvent.setup()
    render(<OperacionesFiscalesPage />)
    await waitFor(() => expect(screen.getByText(/monitor de cola/i)).toBeInTheDocument())

    mocks.getQueue.mockClear()
    const stuckTab = screen.getByRole('button', { name: /^atascados/i })
    await user.click(stuckTab)

    await waitFor(() =>
      expect(mocks.getQueue).toHaveBeenCalledWith(expect.objectContaining({ group: 'stuck', offset: 0 }))
    )
  })

  it('la cola muestra "Mostrando X-Y de Z" cuando hay más documentos que el tamaño de página', async () => {
    mocks.getTenants.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    mocks.getQueue.mockResolvedValue({
      group: 'queued',
      items: [baseItem],
      total: 40,
      limit: 25,
      offset: 0,
      counts: { queued: 40, processing: 0, retrying: 0, stuck: 0, needs_action: 0 },
      redis: { emit_queue: 0, retry_scheduled: 0 },
    })

    render(<OperacionesFiscalesPage />)

    await waitFor(() => expect(screen.getByText('Mostrando 1-25 de 40')).toBeInTheDocument())
  })
})

describe('OperacionesFiscalesPage — cola en vivo y alertas', () => {
  const alertBase = {
    id: 1,
    tenant_slug: 'demo',
    ruc: null,
    alert_type: 'tenant_disconnected',
    severity: 'warning',
    message: 'Tenant desconectado: credenciales inválidas',
    created_at: '2026-10-05T10:00:00+00:00',
    acknowledged_at: null,
    resolved_at: null,
  }

  async function renderWith(alerts: Array<Record<string, unknown>>, queueItems: Array<Record<string, unknown>> = []) {
    mocks.getHealth.mockResolvedValue({
      status: 'degraded', queue_status: { emit: 0, retry: 0, audit: 0 }, redis_connected: true, pending_jobs: 0, failed_jobs: 0,
      worker_count: 1, worker_heartbeat_age_sec: 5, provider_status: {}, sunat_connectivity: { connected: 1, total: 1, ratio: 1 },
      db_status: 'ok', open_alerts: alerts.length, critical_alerts: 0, checked_at: '2026-10-06T00:00:00+00:00',
    })
    mocks.getSummary.mockResolvedValue({
      cards: { documents_today: 0, pending: 3, errors_today: 0, retries_today: 0, avg_duration_ms: null, tenants_connected: 1, tenants_with_error: 0, open_alerts: alerts.length, stuck: 2, needs_action: 17 },
      charts: { emissions_by_hour: [], errors_by_provider: [], avg_duration_by_provider: [] },
    })
    mocks.getAlerts.mockResolvedValue({ open_count: alerts.length, items: alerts })
    mocks.getQueue.mockResolvedValue({
      group: 'queued', items: queueItems, total: queueItems.length, limit: 25, offset: 0,
      counts: { queued: queueItems.length, processing: 0, retrying: 0, stuck: 2, needs_action: 17 },
      redis: { emit_queue: 0, retry_scheduled: 0 },
    })
    mocks.acknowledgeAlert.mockResolvedValue({})
    mocks.resolveAlert.mockResolvedValue({})
    const user = userEvent.setup()
    render(<OperacionesFiscalesPage />)
    await waitFor(() => expect(screen.getByText(/monitor de cola/i)).toBeInTheDocument())
    return user
  }

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
  })

  it('la cola ofrece En cola, Procesando, Reintentando y Atascados — ya no "Con error"', async () => {
    await renderWith([])
    for (const name of [/^en cola/i, /^procesando/i, /^reintentando/i, /^atascados/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /^con error/i })).not.toBeInTheDocument()
  })

  it('enlaza a Documentos fiscales con el conteo de lo que requiere acción', async () => {
    await renderWith([])
    const links = screen.getAllByRole('link', { name: /con error o rechazados por atender/i })
    expect(links[0]).toHaveAttribute('href', '/fiscal?view=needs_action')
    expect(links[0]).toHaveTextContent('17')
  })

  it('las tarjetas Por atender y Pendientes ahora son enlaces a la vista filtrada', async () => {
    await renderWith([])
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/fiscal?view=needs_action')
    expect(hrefs).toContain('/fiscal?view=processing')
    expect(screen.getByRole('link', { name: /pendientes ahora/i })).toHaveAttribute('href', '/fiscal?view=processing')
  })

  it('una fila atascada muestra cuánto lleva y la marca "atascado"', async () => {
    const user = await renderWith([], [
      { ...baseItem, document_uuid: 'u-stuck', status: 'queued', age_seconds: 3600, stuck: true, updated_at: '2026-10-06T10:00:00+00:00' },
    ])
    await user.click(screen.getByRole('button', { name: /^en cola/i }))
    await waitFor(() => expect(screen.getByText(/1 h · atascado/)).toBeInTheDocument())
  })

  it('"Reconocer" y "Resolver" llaman al backend con el id de la alerta', async () => {
    const user = await renderWith([alertBase])
    await waitFor(() => expect(screen.getByText(/credenciales inválidas/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Reconocer' }))
    await waitFor(() => expect(mocks.acknowledgeAlert).toHaveBeenCalledWith(1))

    await user.click(screen.getByRole('button', { name: 'Resolver' }))
    await waitFor(() => expect(mocks.resolveAlert).toHaveBeenCalledWith(1))
  })

  it('las alertas reconocidas salen de "por revisar" y quedan en un bloque aparte', async () => {
    const acked = { ...alertBase, id: 2, message: 'Otra ya vista', acknowledged_at: '2026-10-06T09:00:00+00:00' }
    const user = await renderWith([alertBase, acked])
    await waitFor(() => expect(screen.getByText(/credenciales inválidas/)).toBeInTheDocument())
    expect(screen.queryByText('Otra ya vista')).not.toBeInTheDocument()
    expect(screen.getByText(/1 por revisar · 1 reconocidas/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ver reconocidas/i }))
    expect(screen.getByText('Otra ya vista')).toBeInTheDocument()
  })

  it('sin alertas lo dice y explica que las que se normalizan se cierran solas', async () => {
    await renderWith([])
    expect(screen.getByText(/no hay alertas activas/i)).toBeInTheDocument()
  })

  it('cancelar pide confirmación y avisa que el documento queda atendido', async () => {
    const user = await renderWith([], [{ ...baseItem, document_uuid: 'u-cancel', status: 'queued' }])
    await waitFor(() => expect(screen.getByText('tenant-x')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByText(/queda marcado como/i)).toBeInTheDocument()
    expect(mocks.cancelDocument).not.toHaveBeenCalled()

    mocks.cancelDocument.mockResolvedValue({})
    await user.click(screen.getByRole('button', { name: 'Cancelar documento' }))
    await waitFor(() => expect(mocks.cancelDocument).toHaveBeenCalledWith('u-cancel'))
  })

  it('volver en el modal de cancelar no cancela nada', async () => {
    const user = await renderWith([], [{ ...baseItem, document_uuid: 'u-keep', status: 'queued' }])
    await waitFor(() => expect(screen.getByText('tenant-x')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(mocks.cancelDocument).not.toHaveBeenCalled()
  })
})
