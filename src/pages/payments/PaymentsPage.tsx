import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, CheckCircle, XCircle, Eye, Upload } from 'lucide-react'
import { paymentsService, type SaasPayment } from '../../services/payments.service'
import { plansService, type SaasPlan } from '../../services/plans.service'
import { tenantsService, type Tenant } from '../../services/tenants.service'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', variant: 'yellow' as const },
  approved: { label: 'Aprobado', variant: 'green' as const },
  rejected: { label: 'Rechazado', variant: 'red' as const },
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') ?? 'http://localhost:3000'

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
  const [reviewNotes, setReviewNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [newPaymentForm, setNewPaymentForm] = useState({
    tenant_id: 0, amount: '', currency: 'PEN', period_months: 1, notes: '', file: null as File | null,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [p, pl, t] = await Promise.all([
        paymentsService.list(filterStatus),
        plansService.list(),
        tenantsService.list({ page: 1, per_page: 100 }),
      ])
      setPayments(p)
      setPlans(pl.filter(p => p.active))
      setTenants(t.data)
    } catch { toast.error('Error cargando pagos') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterStatus])

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
    if (newPaymentForm.file) fd.append('receipt', newPaymentForm.file)

    setSaving(true)
    try {
      await paymentsService.create(fd)
      toast.success('Pago registrado')
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
    setReviewPlanId(0)
    setShowReviewModal(true)
  }

  const handleReview = async () => {
    if (!selectedPayment) return
    setSaving(true)
    try {
      if (reviewAction === 'approve') {
        await paymentsService.approve(selectedPayment.id, reviewPlanId, reviewNotes)
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
        <button
          onClick={() => { setNewPaymentForm({ tenant_id: 0, amount: '', currency: 'PEN', period_months: 1, notes: '', file: null }); setShowCreateModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Registrar pago
        </button>
      </div>

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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Empresa</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Monto</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Período</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Comprobante</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => {
              const cfg = STATUS_CONFIG[p.status] ?? { label: p.status, variant: 'default' as const }
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
                    {p.status === 'pending' && (
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

      {/* Modal registrar pago */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Registrar pago manual">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empresa *</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={newPaymentForm.tenant_id}
              onChange={e => setNewPaymentForm(f => ({ ...f, tenant_id: +e.target.value }))}
            >
              <option value={0}>Selecciona empresa...</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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
            </div>
          )}

          {reviewAction === 'approve' && (
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
                href={`${API_BASE}${selectedPayment.receipt_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center py-8 border border-slate-200 rounded-lg text-indigo-600 hover:bg-indigo-50 font-medium"
              >
                <Eye size={32} className="mx-auto mb-2" />
                Abrir PDF en nueva pestaña
              </a>
            ) : (
              <img
                src={`${API_BASE}${selectedPayment.receipt_url}`}
                alt="Comprobante"
                className="w-full rounded-lg border border-slate-200 max-h-96 object-contain bg-slate-50"
                onError={e => { (e.target as HTMLImageElement).src = '' }}
              />
            )}
            <a
              href={`${API_BASE}${selectedPayment.receipt_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-slate-500 hover:text-slate-600"
            >
              {selectedPayment.receipt_url}
            </a>
          </div>
        )}
      </Modal>
    </div>
  )
}
