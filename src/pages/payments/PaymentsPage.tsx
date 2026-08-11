import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, CheckCircle, XCircle, Eye, Upload, FileText, CreditCard, AlertTriangle } from 'lucide-react'
import { paymentsService, type SaasPayment } from '../../services/payments.service'
import { plansService, type SaasPlan } from '../../services/plans.service'
import { tenantsService, type Tenant } from '../../services/tenants.service'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'
import TenantSearchSelect from '../../components/TenantSearchSelect'
import { invoicesService, type SaasInvoice, type RenewalPreview } from '../../services/invoices.service'
import { saasAssetUrl } from '../../services/saasSettings.service'

const STATUS_CONFIG = {
  // pending_review: lo envía el tenant con su comprobante. Es el caso más frecuente y el
  // que faltaba aquí: sin entrada caía a un variant inexistente y salía sin estilo.
  pending_review: { label: 'Por validar', variant: 'yellow' as const },
  pending: { label: 'Pendiente', variant: 'yellow' as const },
  approved: { label: 'Aprobado', variant: 'green' as const },
  rejected: { label: 'Rechazado', variant: 'red' as const },
}

/** Estados que aún requieren decisión del administrador. */
const REVIEWABLE_STATUSES = ['pending', 'pending_review']

const INVOICE_STATUS_CONFIG: Record<string, { label: string; variant: 'green' | 'red' | 'yellow' | 'gray' }> = {
  pending: { label: 'Por cobrar', variant: 'yellow' },
  overdue: { label: 'Vencido', variant: 'red' },
  paid: { label: 'Pagado', variant: 'green' },
  rejected: { label: 'Anulado', variant: 'gray' },
}

/**
 * El cobro no lleva fechas: se derivan de la suscripción del tenant. Solo se elige por
 * cuántos meses cobrar (vacío = el ciclo del plan) y, si hace falta, un importe distinto
 * al del plan.
 */
function emptyPaymentForm() {
  return {
    tenant_id: 0,
    amount: '',
    currency: 'PEN',
    period_months: 1,
    notes: '',
    file: null as File | null,
    payment_method: 'efectivo',
    billing_cycle_id: 0,
  }
}

function emptyInvoiceForm() {
  return { tenant_id: 0, months: 0, amount: '', notes: '' }
}

function fmtDay(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Texto de tooltip con el QR/cuenta bancaria que se le mostró al tenant al pagar (ver
 *  payment_details_json en el backend, pkg/saas/payment_method_snapshot.go). */
function paymentDetailsTooltip(p: SaasPayment): string | undefined {
  if (!p.payment_details_json) return undefined
  try {
    const parsed = JSON.parse(p.payment_details_json)
    if (p.payment_method_kind === 'qr' && parsed?.qr_url) return `QR: ${parsed.qr_url}`
    if (p.payment_method_kind === 'bank_account' && Array.isArray(parsed)) {
      return parsed
        .map((b: { bank?: string; account_number?: string }) => `${b.bank ?? ''} ${b.account_number ?? ''}`.trim())
        .filter(Boolean)
        .join(' | ')
    }
  } catch {
    return undefined
  }
  return undefined
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<SaasPayment[]>([])
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<SaasPayment | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewPlanId, setReviewPlanId] = useState(0)
  const [reviewPeriodMonths, setReviewPeriodMonths] = useState(0)
  const [reviewNotes, setReviewNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [newPaymentForm, setNewPaymentForm] = useState(emptyPaymentForm())
  /** Cobro que se va a anular; abre la confirmación con sus advertencias. */
  const [cancelTarget, setCancelTarget] = useState<SaasInvoice | null>(null)
  /** Cobros que este pago puede cancelar (los que siguen por cobrar). */
  const [payableInvoices, setPayableInvoices] = useState<SaasInvoice[]>([])
  /** Pestaña activa: pagos recibidos o cobros emitidos. */
  const [tab, setTab] = useState<'payments' | 'invoices'>('payments')
  const [issuedInvoices, setIssuedInvoices] = useState<SaasInvoice[]>([])
  const [invoiceFilter, setInvoiceFilter] = useState('')
  /** Pago al que se le va a adjuntar la boleta/factura. */
  const [fiscalTarget, setFiscalTarget] = useState<SaasPayment | null>(null)
  const fiscalFileRef = useRef<HTMLInputElement>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm())
  /** Cobros del tenant elegido en el modal, para no emitir uno duplicado sin darse cuenta. */
  const [tenantInvoices, setTenantInvoices] = useState<SaasInvoice[]>([])
  const [preview, setPreview] = useState<RenewalPreview | null>(null)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    if (!showInvoiceModal || !invoiceForm.tenant_id) {
      setTenantInvoices([])
      setPreview(null)
      setPreviewError('')
      return
    }
    invoicesService
      .listByTenant(invoiceForm.tenant_id)
      .then(setTenantInvoices)
      .catch(() => setTenantInvoices([]))
  }, [showInvoiceModal, invoiceForm.tenant_id])

  // El backend es quien calcula período, vencimiento e importe a partir de la suscripción:
  // se consulta en vez de replicar aquí esa lógica y arriesgar que diverjan.
  useEffect(() => {
    if (!showInvoiceModal || !invoiceForm.tenant_id) return
    const amount = parseFloat(invoiceForm.amount)
    setPreviewError('')
    invoicesService
      .preview({
        tenant_id: invoiceForm.tenant_id,
        months: invoiceForm.months,
        amount: Number.isFinite(amount) ? amount : 0,
      })
      .then(p => setPreview(p))
      .catch((e: any) => {
        setPreview(null)
        setPreviewError(e.response?.data?.error ?? 'No se pudo calcular el cobro')
      })
  }, [showInvoiceModal, invoiceForm.tenant_id, invoiceForm.months, invoiceForm.amount])

  const handleCreateInvoice = async () => {
    if (!invoiceForm.tenant_id) {
      toast.error('Seleccione la empresa')
      return
    }
    if (!preview) {
      toast.error(previewError || 'No se pudo calcular el cobro')
      return
    }
    if (preview.already_issued) {
      toast.error('Ya existe un cobro emitido para ese período')
      return
    }
    const amount = parseFloat(invoiceForm.amount)
    setSaving(true)
    try {
      await invoicesService.create({
        tenant_id: invoiceForm.tenant_id,
        months: invoiceForm.months,
        amount: Number.isFinite(amount) ? amount : 0,
        notes: invoiceForm.notes,
      })
      toast.success('Cobro emitido — el tenant ya puede pagarlo desde su panel')
      setShowInvoiceModal(false)
      // Salta a la pestaña de cobros: emitir uno y no verlo en ningún lado desorienta.
      setTab('invoices')
      setInvoiceFilter('')
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error emitiendo el cobro')
    } finally {
      setSaving(false)
    }
  }

  const handleUploadFiscalDoc = async (file: File) => {
    if (!fiscalTarget) return
    setSaving(true)
    try {
      await paymentsService.uploadFiscalDoc(fiscalTarget.id, file)
      toast.success('Comprobante adjuntado — el cliente ya puede descargarlo')
      setFiscalTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo adjuntar el comprobante')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Cobra un cobro concreto: abre el registro de pago ya apuntando a ese ciclo y con su
   * importe, para no tener que buscarlo a mano y arriesgar aplicarlo al equivocado.
   */
  const handlePayInvoice = (inv: SaasInvoice) => {
    setNewPaymentForm({
      ...emptyPaymentForm(),
      tenant_id: inv.tenant_id,
      billing_cycle_id: inv.id,
      amount: String(inv.amount),
      currency: inv.currency || 'PEN',
    })
    setShowCreateModal(true)
  }

  /** Anular desde el listado de cobros emitidos (recarga para reflejar el filtro). */
  const handleCancelIssued = async () => {
    if (!cancelTarget) return
    setSaving(true)
    try {
      await invoicesService.cancel(cancelTarget.id)
      toast.success('Cobro anulado')
      setCancelTarget(null)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo anular el cobro')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelInvoice = async (inv: SaasInvoice) => {
    try {
      await invoicesService.cancel(inv.id)
      toast.success('Cobro anulado')
      setTenantInvoices(list => list.map(i => (i.id === inv.id ? { ...i, status: 'rejected' } : i)))
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'No se pudo anular el cobro')
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const [p, pl, t, inv] = await Promise.all([
        paymentsService.list(filterStatus),
        plansService.list(),
        tenantsService.list({ page: 1, per_page: 100 }),
        invoicesService.list(invoiceFilter),
      ])
      setPayments(p)
      setPlans(pl.filter(p => p.active))
      setTenants(t.data)
      setIssuedInvoices(inv)
    } catch { toast.error('Error cargando pagos') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus, invoiceFilter])

  // Cobros por cancelar de la empresa elegida en el registro manual.
  useEffect(() => {
    if (!showCreateModal || !newPaymentForm.tenant_id) {
      setPayableInvoices([])
      return
    }
    invoicesService
      .listByTenant(newPaymentForm.tenant_id)
      .then(list => setPayableInvoices(list.filter(i => i.status === 'pending' || i.status === 'overdue')))
      .catch(() => setPayableInvoices([]))
  }, [showCreateModal, newPaymentForm.tenant_id])

  const handleCreate = async () => {
    if (!newPaymentForm.tenant_id || !newPaymentForm.amount) {
      toast.error('Empresa y monto son requeridos'); return
    }
    const fd = new FormData()
    fd.append('tenant_id', String(newPaymentForm.tenant_id))
    fd.append('amount', newPaymentForm.amount)
    fd.append('currency', newPaymentForm.currency)
    fd.append('period_months', String(newPaymentForm.period_months))
    fd.append('notes', newPaymentForm.notes)
    fd.append('payment_method', newPaymentForm.payment_method)
    if (newPaymentForm.billing_cycle_id) {
      fd.append('billing_cycle_id', String(newPaymentForm.billing_cycle_id))
    }
    if (newPaymentForm.file) fd.append('receipt', newPaymentForm.file)

    setSaving(true)
    try {
      await paymentsService.create(fd)
      toast.success('Pago registrado y aplicado — suscripción actualizada')
      setShowCreateModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error registrando pago')
    } finally { setSaving(false) }
  }

  const openReview = (payment: SaasPayment, action: 'approve' | 'reject') => {
    setSelectedPayment(payment)
    setReviewAction(action)
    setReviewNotes('')
    // Preseleccionar el plan que el tenant pidió (solicitud de renovación/cambio de plan sin
    // billing_cycle previo): aprobar sin tocar el dropdown debe respetar lo que pidió, no
    // quedarse callado con el plan viejo. El admin sigue pudiendo cambiarlo antes de confirmar.
    setReviewPlanId(payment.requested_plan_id ?? 0)
    // Precargado con lo que pidió el tenant (period_months, seteado desde la Fase B); el admin
    // lo puede corregir antes de confirmar. 0 en el payment (pagos viejos, previos a esta
    // mejora) deja el campo en 0 = "usar lo que ya venga calculado" (fallback del backend).
    setReviewPeriodMonths(payment.period_months || 0)
    setShowReviewModal(true)
  }

  const handleReview = async () => {
    if (!selectedPayment) return
    setSaving(true)
    try {
      if (reviewAction === 'approve') {
        await paymentsService.approve(selectedPayment.id, reviewPlanId, reviewNotes, reviewPeriodMonths)
        toast.success('Pago aprobado — suscripción actualizada')
      } else {
        await paymentsService.reject(selectedPayment.id, reviewNotes)
        toast.success('Pago rechazado')
      }
      setShowReviewModal(false)
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error procesando pago')
    } finally { setSaving(false) }
  }

  const getTenantName = (id: number) => tenants.find(t => t.id === id)?.name ?? `Tenant #${id}`

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pagos</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona los comprobantes de pago y aprueba renovaciones</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setInvoiceForm(emptyInvoiceForm())
              setShowInvoiceModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <FileText size={16} /> Emitir cobro
          </button>
          <button
            onClick={() => { setNewPaymentForm({ tenant_id: 0, amount: '', currency: 'PEN', period_months: 1, notes: '', file: null, payment_method: 'efectivo', billing_cycle_id: 0 }); setShowCreateModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Registrar pago
          </button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        {([
          ['payments', 'Pagos recibidos'],
          ['invoices', `Cobros emitidos${issuedInvoices.length ? ` (${issuedInvoices.length})` : ''}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'payments' ? (
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', ''] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
            >
              {s === '' ? 'Todos' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label ?? s}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          {([['', 'Por cobrar'], ['paid', 'Pagados'], ['rejected', 'Anulados'], ['all', 'Todos']] as const).map(
            ([value, label]) => (
              <button
                key={value}
                onClick={() => setInvoiceFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${invoiceFilter === value ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Empresa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Período</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vence</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Monto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {issuedInvoices.map(inv => {
                  const cfg = INVOICE_STATUS_CONFIG[inv.status] ?? { label: inv.status, variant: 'gray' as const }
                  return (
                    <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {inv.tenant_name || `Empresa #${inv.tenant_id}`}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {fmtDay(inv.period_start)} → {fmtDay(inv.period_end)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{fmtDay(inv.due_date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">
                        S/ {inv.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        {inv.status !== 'paid' && inv.status !== 'rejected' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handlePayInvoice(inv)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              <CreditCard size={14} />
                              Pagar
                            </button>
                            <button
                              onClick={() => setCancelTarget(inv)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Anular
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {issuedInvoices.length === 0 && (
            <div className="text-center py-14">
              <FileText className="mx-auto text-slate-300" size={32} />
              <p className="mt-2 font-medium text-slate-700">No hay cobros en este estado</p>
              <p className="text-sm text-slate-500 mt-1">
                Use «Emitir cobro» para generar el próximo pago de una empresa
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'payments' && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Empresa</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Período</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Método</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Comprobante</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => {
              const cfg = STATUS_CONFIG[p.status] ?? { label: p.status, variant: 'gray' as const }
              return (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{p.tenant_name || getTenantName(p.tenant_id)}</div>
                    {p.notes && <div className="text-xs text-slate-500 truncate max-w-xs">{p.notes}</div>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {p.currency} {p.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.period_months} {p.period_months === 1 ? 'mes' : 'meses'}
                  </td>
                  <td className="px-4 py-3" title={paymentDetailsTooltip(p)}>
                    {p.payment_method_label || p.payment_method ? (
                      <span className="text-slate-700">{p.payment_method_label || p.payment_method}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.receipt_url ? (
                      <button
                        onClick={() => { setSelectedPayment(p); setShowReceiptModal(true) }}
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        <Eye size={12} /> Ver comprobante
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Sin comprobante</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.variant as 'green' | 'red' | 'yellow' | 'blue' | 'gray'}>{cfg.label}</Badge>
                    {p.admin_notes && <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{p.admin_notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-3">
                    {REVIEWABLE_STATUSES.includes(p.status) && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openReview(p, 'approve')}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Aprobar"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={() => openReview(p, 'reject')}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Rechazar"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    )}
                    {/* Solo tras aprobar: es el comprobante que se le entrega al cliente
                        por el pago, y él lo descarga desde su panel. */}
                    {p.status === 'approved' && (
                      <div className="flex items-center gap-2">
                        {p.fiscal_doc_url ? (
                          <a
                            href={saasAssetUrl(p.fiscal_doc_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                            title="Ver comprobante entregado"
                          >
                            <FileText size={14} /> Comprobante
                          </a>
                        ) : (
                          <button
                            onClick={() => setFiscalTarget(p)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                            title="Adjuntar boleta o factura para el cliente"
                          >
                            <Upload size={14} /> Adjuntar comprobante
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {payments.length === 0 && (
          <div className="text-center py-12 text-slate-500">No hay pagos en este estado</div>
        )}
      </div>
      )}

      {/* Modal registrar pago */}
      <Modal
        open={cancelTarget !== null}
        onClose={() => !saving && setCancelTarget(null)}
        title="Anular cobro"
      >
        {cancelTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Empresa</span>
                <span className="font-medium text-slate-800">
                  {cancelTarget.tenant_name || `Empresa #${cancelTarget.tenant_id}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Período</span>
                <span className="text-slate-700">
                  {fmtDay(cancelTarget.period_start)} → {fmtDay(cancelTarget.period_end)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Monto</span>
                <span className="font-semibold text-slate-800">S/ {cancelTarget.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Anular el cobro del período que el cliente está usando le regala ese tramo:
                conserva el acceso y deja de figurar la deuda. */}
            {cancelTarget.covers_active_period ? (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-medium">Este cobro cubre el período que el cliente está usando</p>
                  <p className="text-xs mt-0.5">
                    Al anularlo conserva el servicio hasta el {fmtDay(cancelTarget.period_end)} sin deuda
                    registrada. Si lo que quieres es cortarle el acceso, suspende su suscripción o ajusta
                    la vigencia desde <strong>Suscripciones</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                El cobro dejará de figurar como deuda. Esta acción no se puede deshacer.
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCancelIssued}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Anulando...' : 'Anular cobro'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Registrar pago manual">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empresa *</label>
            {/* Con búsqueda remota: el select plano solo traía las primeras 100 empresas. */}
            <TenantSearchSelect
              value={newPaymentForm.tenant_id}
              onChange={id => setNewPaymentForm(f => ({ ...f, tenant_id: id, billing_cycle_id: 0 }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={newPaymentForm.amount}
                onChange={e => setNewPaymentForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={newPaymentForm.currency}
                onChange={e => setNewPaymentForm(f => ({ ...f, currency: e.target.value }))}
              >
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meses a cubrir</label>
              <input
                type="number" min={1} max={24}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={newPaymentForm.period_months}
                onChange={e => setNewPaymentForm(f => ({ ...f, period_months: +e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Método de pago</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={newPaymentForm.payment_method}
                onChange={e => setNewPaymentForm(f => ({ ...f, payment_method: e.target.value }))}
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="deposito">Depósito</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {/* Vincular el pago al cobro que cancela: si no, la factura queda pendiente
              aunque la suscripción sí se extienda. */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cobro que cancela</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={newPaymentForm.billing_cycle_id}
              onChange={e => setNewPaymentForm(f => ({ ...f, billing_cycle_id: +e.target.value }))}
              disabled={!newPaymentForm.tenant_id}
            >
              <option value={0}>
                {payableInvoices.length === 0 ? 'Sin cobros pendientes' : 'No aplicar a ningún cobro'}
              </option>
              {payableInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {fmtDay(inv.period_start)} → {fmtDay(inv.period_end)} · S/ {inv.amount.toFixed(2)}
                </option>
              ))}
            </select>
            {payableInvoices.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Al aplicarlo, ese cobro queda marcado como pagado.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
            Este pago se aplica de inmediato: no requiere aprobación porque lo registra un
            administrador. La suscripción se extenderá al guardarlo.
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Comprobante (imagen/PDF)</label>
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,.webp"
                className="hidden"
                onChange={e => setNewPaymentForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))}
              />
              {newPaymentForm.file ? (
                <div className="flex items-center justify-center gap-2 text-indigo-600 text-sm font-medium">
                  <Upload size={14} /> {newPaymentForm.file.name}
                </div>
              ) : (
                <div className="text-slate-500 text-sm">
                  <Upload size={16} className="mx-auto mb-1" />
                  Click para subir comprobante
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={newPaymentForm.notes}
              onChange={e => setNewPaymentForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving ? 'Registrando...' : 'Registrar pago'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal revisar pago */}
      <Modal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title={reviewAction === 'approve' ? '✓ Aprobar pago' : '✗ Rechazar pago'}
      >
        <div className="space-y-4">
          {selectedPayment && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm border border-slate-200">
              <div className="text-slate-700">
                <span className="text-slate-500">Empresa:</span> {selectedPayment.tenant_name || getTenantName(selectedPayment.tenant_id)}
              </div>
              <div className="text-slate-700">
                <span className="text-slate-500">Monto:</span> {selectedPayment.currency} {selectedPayment.amount.toFixed(2)}
              </div>
              <div className="text-slate-700">
                <span className="text-slate-500">Período:</span> {selectedPayment.period_months} mes(es)
              </div>
              {selectedPayment.requested_plan_id ? (
                <div className="text-slate-700">
                  <span className="text-slate-500">Plan pedido por el tenant:</span>{' '}
                  <span className="font-semibold">
                    {plans.find(p => p.id === selectedPayment.requested_plan_id)?.name ?? `#${selectedPayment.requested_plan_id}`}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {reviewAction === 'approve' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan a asignar (opcional)</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={reviewPlanId}
                  onChange={e => setReviewPlanId(+e.target.value)}
                >
                  <option value={0}>Usar plan actual del tenant</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Meses a aplicar {(selectedPayment?.period_months ?? 0) > 0 && '(precargado con lo que pidió el tenant)'}
                </label>
                <input
                  type="number" min={0} max={24}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={reviewPeriodMonths}
                  onChange={e => setReviewPeriodMonths(+e.target.value)}
                  placeholder="0 = usar lo que ya venga calculado"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas del admin</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder={reviewAction === 'approve' ? 'Ej: Transferencia verificada en cuenta BCP' : 'Ej: Comprobante ilegible'}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowReviewModal(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleReview}
              disabled={saving}
              className={`flex-1 px-4 py-2 text-white rounded-lg text-sm transition-colors disabled:opacity-50 ${
                reviewAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {saving ? 'Procesando...' : reviewAction === 'approve' ? 'Aprobar pago' : 'Rechazar pago'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal ver comprobante */}
      <Modal open={showReceiptModal} onClose={() => setShowReceiptModal(false)} title="Comprobante de pago">
        {selectedPayment?.receipt_url && (
          <div className="space-y-3">
            {selectedPayment.receipt_url.endsWith('.pdf') ? (
              <a
                href={saasAssetUrl(selectedPayment.receipt_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center py-8 border border-slate-200 rounded-lg text-indigo-600 hover:bg-indigo-50 font-medium"
              >
                <Eye size={32} className="mx-auto mb-2" />
                Abrir PDF en nueva pestaña
              </a>
            ) : (
              <img
                src={saasAssetUrl(selectedPayment.receipt_url)}
                alt="Comprobante"
                className="w-full rounded-lg border border-slate-200 max-h-96 object-contain bg-slate-50"
                onError={e => { (e.target as HTMLImageElement).src = '' }}
              />
            )}
            <a
              href={saasAssetUrl(selectedPayment.receipt_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-slate-500 hover:text-slate-600"
            >
              {selectedPayment.receipt_url}
            </a>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(fiscalTarget)}
        onClose={() => setFiscalTarget(null)}
        title="Adjuntar comprobante del pago"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Suba la boleta o factura (PDF) que se le emite a{' '}
            <span className="font-medium text-slate-800">
              {fiscalTarget?.tenant_name || getTenantName(fiscalTarget?.tenant_id ?? 0)}
            </span>{' '}
            por este pago. El cliente podrá descargarla desde su panel.
          </p>
          <div
            className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
            onClick={() => fiscalFileRef.current?.click()}
          >
            <input
              ref={fiscalFileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void handleUploadFiscalDoc(file)
              }}
            />
            <Upload className="mx-auto text-slate-400" size={24} />
            <p className="mt-2 text-sm text-slate-600">
              {saving ? 'Subiendo…' : 'Haga clic para elegir el PDF'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Solo PDF, máximo 10 MB</p>
          </div>
        </div>
      </Modal>

      <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="Emitir cobro">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Genera un cobro pendiente para la empresa. Aparecerá en su panel como monto por pagar y
            podrá subir su comprobante. No modifica la vigencia: eso ocurre al aprobar el pago.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empresa *</label>
            <TenantSearchSelect
              value={invoiceForm.tenant_id}
              onChange={id => setInvoiceForm(f => ({ ...f, tenant_id: id }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Meses a cobrar</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={invoiceForm.months}
                onChange={e => setInvoiceForm(f => ({ ...f, months: Number(e.target.value) }))}
              >
                <option value={0}>Ciclo del plan</option>
                {[1, 2, 3, 6, 12].map(m => (
                  <option key={m} value={m}>{m === 1 ? '1 mes' : `${m} meses`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto (S/)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={preview ? preview.amount.toFixed(2) : 'Precio del plan'}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={invoiceForm.amount}
                onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">Vacío = precio del plan.</p>
            </div>
          </div>

          {previewError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {previewError}
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">
                Se cobrará · plan {preview.plan_name}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-slate-600">Vence su suscripción</dt>
                <dd className="text-right font-medium text-slate-800">{fmtDay(preview.current_end)}</dd>
                {/* Si ya hay cobros por delante, el siguiente arranca donde terminan. */}
                {preview.covered_until !== preview.current_end && (
                  <>
                    <dt className="text-slate-600">Ya cobrado hasta</dt>
                    <dd className="text-right font-medium text-amber-700">{fmtDay(preview.covered_until)}</dd>
                  </>
                )}
                <dt className="text-slate-600">Período cobrado</dt>
                <dd className="text-right font-medium text-slate-800">
                  {fmtDay(preview.period_start)} → {fmtDay(preview.period_end)}
                </dd>
                <dt className="text-slate-600">Nuevo vencimiento si paga</dt>
                <dd className="text-right font-medium text-emerald-700">{fmtDay(preview.period_end)}</dd>
                <dt className="text-slate-600">Importe</dt>
                <dd className="text-right font-bold text-slate-900">S/ {preview.amount.toFixed(2)}</dd>
              </dl>
              {preview.already_issued && (
                <p className="text-xs text-red-700 font-medium">
                  Ya existe un cobro emitido para este período. Anúlelo antes de emitir otro.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo / nota</label>
            <textarea
              rows={2}
              placeholder="Queda en la auditoría de la empresa"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={invoiceForm.notes}
              onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {tenantInvoices.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Cobros existentes
              </p>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {tenantInvoices.map(inv => {
                  const cfg = INVOICE_STATUS_CONFIG[inv.status] ?? { label: inv.status, variant: 'gray' as const }
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-600">
                        {inv.period_start} → {inv.period_end}
                        <span className="text-slate-400"> · vence {inv.due_date}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-slate-800 tabular-nums">
                          S/ {inv.amount.toFixed(2)}
                        </span>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        {inv.status !== 'paid' && inv.status !== 'rejected' && (
                          <button
                            onClick={() => handleCancelInvoice(inv)}
                            className="text-red-600 hover:underline"
                            title="Anular cobro"
                          >
                            Anular
                          </button>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowInvoiceModal(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateInvoice}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Emitiendo...' : 'Emitir cobro'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
