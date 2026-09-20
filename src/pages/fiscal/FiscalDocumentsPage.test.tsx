import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FiscalDocumentsPage from './FiscalDocumentsPage'

/**
 * Fase 3 del Panel Central Fiscal: la UI debe consumir status/error_type/retryable tal cual
 * los manda el backend (Fase 2) y ofrecer/ocultar acciones en consecuencia — nunca reclasificar
 * por sunat_message/pse_message. Ver backend_go/docs/AUDITORIA-PANEL-CENTRAL-FISCAL-FASE0-PLAN.md.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/services/tenants.service', () => ({
  tenantsService: {
    list: vi.fn().mockResolvedValue({ data: [], page: 1, per_page: 100, total: 0, total_pages: 0 }),
  },
}))

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  documentAction: vi.fn(),
  bulkAction: vi.fn(),
}))

vi.mock('@/services/fiscal.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/fiscal.service')>('@/services/fiscal.service')
  return {
    ...actual,
    downloadFiscalFile: vi.fn(),
    fiscalService: mocks,
  }
})

const emptyStats = {
  total: 1,
  documents_today: 1,
  pending: 0,
  in_queue: 0,
  processing: 0,
  sent: 0,
  accepted: 1,
  rejected: 0,
  errors: 0,
  retries: 0,
  emails_pending: 0,
  by_status: {},
  tenants: [],
}

const acceptedDoc = {
  document_uuid: 'uuid-accepted',
  tenant_id: 1,
  tenant_slug: 'tenant-accepted',
  sale_id: 1,
  document_type: '03',
  series: 'B001',
  number: '1',
  status: 'accepted',
  send_mode: 'sunat',
  provider: 'sunat',
  sunat_mode: 'production',
  sunat_code: '0',
  sunat_message: 'Aceptado',
  customer_name: null,
  company_ruc: '20000000001',
  total: 100,
  customer_email: null,
  email_status: null,
  retry_count: 0,
  error_type: null,
  retryable: true,
  created_at: '2026-09-19T00:00:00+00:00',
  accepted_at: '2026-09-19T00:05:00+00:00',
}

const transientDoc = {
  ...acceptedDoc,
  document_uuid: 'uuid-transient',
  tenant_slug: 'tenant-transient',
  status: 'error',
  sunat_code: null,
  sunat_message: 'El sistema no puede responder su solicitud. Intente nuevamente.',
  error_type: 'transient',
  retryable: true,
  retry_count: 2,
  accepted_at: null,
}

function detailFor(doc: typeof acceptedDoc) {
  return {
    document: doc,
    snapshot_json: {},
    pse_response: null,
    attempts: [],
    email_logs: [],
    webhook_events: [],
    timeline: [],
    download_urls: {},
  }
}

async function openDetailFor(tenantSlug: string) {
  const user = userEvent.setup()
  await waitFor(() => expect(screen.getByText(tenantSlug)).toBeInTheDocument())
  await user.click(screen.getByText(tenantSlug))
  await waitFor(() => expect(screen.getByText('UUID:')).toBeInTheDocument())
  return user
}

describe('FiscalDocumentsPage — Fase 3', () => {
  beforeEach(() => {
    mocks.getStats.mockReset().mockResolvedValue(emptyStats)
    mocks.listDocuments.mockReset()
    mocks.getDocument.mockReset()
    mocks.documentAction.mockReset()
    mocks.bulkAction.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('Test 5: status=accepted no presenta send/retry normal como acción disponible', async () => {
    mocks.listDocuments.mockResolvedValue({ items: [acceptedDoc], counts: {}, has_more: false, next_cursor: null })
    mocks.getDocument.mockResolvedValue(detailFor(acceptedDoc))

    render(<FiscalDocumentsPage />)
    await openDetailFor('tenant-accepted')

    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(screen.getByText(/send\/retry normal no disponible/i)).toBeInTheDocument()
  })

  it('Test 6: force sigue disponible sobre un documento accepted, con confirmación explícita', async () => {
    mocks.listDocuments.mockResolvedValue({ items: [acceptedDoc], counts: {}, has_more: false, next_cursor: null })
    mocks.getDocument.mockResolvedValue(detailFor(acceptedDoc))
    mocks.documentAction.mockResolvedValue({ status: 'force_queued' })

    render(<FiscalDocumentsPage />)
    const user = await openDetailFor('tenant-accepted')

    const forceBtn = screen.getByRole('button', { name: 'Forzar' })
    expect(forceBtn).toBeInTheDocument()
    await user.click(forceBtn)

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(mocks.documentAction).toHaveBeenCalledWith('uuid-accepted', 'force'))
  })

  it('transient con retryable=true SÍ presenta retry como acción normal disponible', async () => {
    mocks.listDocuments.mockResolvedValue({ items: [transientDoc], counts: {}, has_more: false, next_cursor: null })
    mocks.getDocument.mockResolvedValue(detailFor(transientDoc))

    render(<FiscalDocumentsPage />)
    await openDetailFor('tenant-transient')

    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    // Aparece tanto en la fila de la tabla como en el badge del modal de detalle.
    expect(screen.getAllByText('En proceso').length).toBeGreaterThan(0)
  })

  it('Test 7: un 409 del backend (guard fiscal) muestra error + hint reales, sin mensaje paralelo inventado', async () => {
    mocks.listDocuments.mockResolvedValue({ items: [transientDoc], counts: {}, has_more: false, next_cursor: null })
    mocks.getDocument.mockResolvedValue(detailFor(transientDoc))
    mocks.documentAction.mockRejectedValue({
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

    const { toast } = await import('sonner')
    render(<FiscalDocumentsPage />)
    const user = await openDetailFor('tenant-transient')

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Usar la acción "force" para forzar el reenvío de todas formas')
      )
    )
    // También debe incluir el `error` original del backend, no solo el hint.
    expect((toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      'no admite reenvío/reintento normal'
    )
  })

  it('Test 3/negocio: business (status=rejected) se identifica como rechazo de negocio en la tabla', async () => {
    const businessDoc = { ...acceptedDoc, document_uuid: 'uuid-business', tenant_slug: 'tenant-business', status: 'rejected', error_type: 'business', retryable: false }
    mocks.listDocuments.mockResolvedValue({ items: [businessDoc], counts: {}, has_more: false, next_cursor: null })

    render(<FiscalDocumentsPage />)
    await waitFor(() => expect(screen.getByText('tenant-business')).toBeInTheDocument())
    expect(screen.getByText(/rechazado \(negocio\)/i)).toBeInTheDocument()
  })
})
