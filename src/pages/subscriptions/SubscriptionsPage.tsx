import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, Search, PauseCircle, PlayCircle, Clock, CalendarClock, AlertTriangle, Ban,
  FileSpreadsheet, Loader2, ChevronDown,
} from 'lucide-react'
import { saasSettingsService } from '../../services/saasSettings.service'
import {
  subscriptionsService,
  type SaasSubscription,
  type CreateSubscriptionInput,
} from '../../services/subscriptions.service'
import { plansService, type SaasPlan } from '../../services/plans.service'
import { paymentsService } from '../../services/payments.service'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import Badge from '../../components/ui/Badge'
import PaginationBar from '../../components/ui/PaginationBar'
import TenantSearchSelect from '../../components/TenantSearchSelect'
import type { PerPageOption } from '../../services/pagination'
import { exportTableToExcel, type ExportColumn } from '../../utils/exportExcel'
import { cycleLabelFromMonths, CYCLE_MONTHS_OPTIONS } from '../../utils/billingCycle'

const STATUS_CONFIG = {
  active: { label: 'Activa', variant: 'green' as const },
  trial: { label: 'Trial', variant: 'blue' as const },
  expired: { label: 'Vencida', variant: 'red' as const },
  suspended: { label: 'Suspendida', variant: 'yellow' as const },
  grace_period: { label: 'En gracia', variant: 'yellow' as const },
  overdue: { label: 'En mora', variant: 'red' as const },
  cancelled: { label: 'Cancelada', variant: 'gray' as const },
  provisional_active: { label: 'Provisional', variant: 'blue' as const },
  blocked: { label: 'Bloqueada', variant: 'red' as const },
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysLeft(end: string): number {
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)
}

function toInputDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<SaasSubscription[]>([])
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [loading, setLoading] = useState(true)
  // Arranca en activas: es la lista sobre la que se opera. Las históricas y vencidas siguen a
  // un clic, pero dejaron de ser lo primero que se ve.
  const [filterStatus, setFilterStatus] = useState('active')
  const [search, setSearch] = useState('')
  /** Ciclo (billed_months): 1 mensual, 3 trimestral, 6 semestral, 12 anual. '' = todos. */
  const [billedMonthsFilter, setBilledMonthsFilter] = useState<number | ''>('')
  /**
   * Rango de vencimiento (end_date, YYYY-MM-DD). Cubre los 3 casos que pide el panel:
   * "por vencer" (endDateTo = hoy + N días), "vence en tal mes" (primer/último día del mes,
   * tecleado a mano) y "ya vencieron" (endDateTo = ayer, o combinado con filterStatus=expired).
   */
  const [endDateFromFilter, setEndDateFromFilter] = useState('')
  const [endDateToFilter, setEndDateToFilter] = useState('')
  const [exportingExcel, setExportingExcel] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [paymentWindowDays, setPaymentWindowDays] = useState(3)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSuspendModal, setShowSuspendModal] = useState(false)
  const [selectedSub, setSelectedSub] = useState<SaasSubscription | null>(null)
  const [form, setForm] = useState<CreateSubscriptionInput>({
    tenant_id: 0,
    plan_id: 0,
    months: 1,
    notes: '',
    start_date: '',
    discount_type: '',
    discount_value: 0,
  })
  const [suspendReason, setSuspendReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  // Cobro en el mismo paso del alta. Opcional: apagado, la suscripción se crea igual.
  const [payNow, setPayNow] = useState(false)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('transfer')
  const [payReference, setPayReference] = useState('')
  const [payReceipt, setPayReceipt] = useState<File | null>(null)

  const resetPaymentFields = () => {
    setPayNow(false)
    setPayAmount(0)
    setPayMethod('transfer')
    setPayReference('')
    setPayReceipt(null)
  }

  /**
   * Importe del alta: precio MENSUAL del plan × meses, menos el descuento. Debe replicar
   * ComputeCycleAmounts del backend; si divergen, el pago no cuadraría con el cobro emitido.
   */
  const grossAmount = (() => {
    const plan = plans.find(p => p.id === form.plan_id)
    if (!plan) return 0
    return +(plan.price * Math.max(1, form.months)).toFixed(2)
  })()

  const discountAmount = (() => {
    if (!form.discount_value || form.discount_value <= 0) return 0
    if (form.discount_type === 'percent') {
      return +Math.min(grossAmount, (grossAmount * form.discount_value) / 100).toFixed(2)
    }
    if (form.discount_type === 'fixed') return +Math.min(grossAmount, form.discount_value).toFixed(2)
    return 0
  })()

  const expectedAmount = +(grossAmount - discountAmount).toFixed(2)

  /** Preview de vigencia: mismo cálculo que el backend (inicio + meses), solo para mostrar. No
   * aplica si el tenant elegido ya tiene una suscripción vigente con este plan (esa renueva en
   * sitio encadenando desde su propio vencimiento, ignora start_date) — el preview igual sirve de
   * referencia aproximada en ese caso. */
  const datesPreview = (() => {
    const months = Math.max(1, form.months || 1)
    const start = form.start_date ? new Date(`${form.start_date}T00:00:00`) : new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setMonth(end.getMonth() + months)
    const fmt = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    return { startLabel: fmt(start), endLabel: fmt(end) }
  })()
  const [saving, setSaving] = useState(false)
  const [checkingExpired, setCheckingExpired] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustConfirm, setAdjustConfirm] = useState(false)
  const [adjustEndDate, setAdjustEndDate] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, p] = await Promise.all([
        subscriptionsService.list({
          status: filterStatus,
          billed_months: billedMonthsFilter || undefined,
          q: search,
          end_date_from: endDateFromFilter,
          end_date_to: endDateToFilter,
          page,
          per_page: perPage,
        }),
        plansService.list(),
      ])
      setSubs(res.data)
      setTotal(res.total)
      setTotalPages(res.total_pages)
      setPlans(p.filter(plan => plan.active))
    } catch {
      toast.error('Error cargando suscripciones')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, billedMonthsFilter, search, endDateFromFilter, endDateToFilter, page, perPage])

  // Plazo de pago configurado, para que el aviso del alta diga el número real.
  useEffect(() => {
    saasSettingsService
      .get()
      .then(s => setPaymentWindowDays(s.payment_window_days || 3))
      .catch(() => setPaymentWindowDays(3))
  }, [])

  // El monto a cobrar sigue al plan, los meses y el descuento mientras el pago esté activo:
  // si no, cambiar la duración después de marcarlo dejaba un importe que ya no cuadraba.
  useEffect(() => {
    if (payNow) setPayAmount(expectedAmount)
  }, [payNow, expectedAmount])

  useEffect(() => {
    setPage(1)
  }, [filterStatus, billedMonthsFilter, search, endDateFromFilter, endDateToFilter, perPage])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async () => {
    if (!form.tenant_id || !form.plan_id) {
      toast.error('Selecciona empresa y plan')
      return
    }
    if (payNow && payAmount <= 0) {
      toast.error('Indica el monto del pago')
      return
    }
    setSaving(true)
    try {
      const { billingCycleId } = await subscriptionsService.create(form)
      toast.success('Suscripción creada y módulos sincronizados')

      // El pago es opcional y va DESPUÉS del alta: si falla, el tenant ya quedó activo con su
      // cobro pendiente, que es justo lo que se espera. Nunca debe tumbar la suscripción.
      if (payNow) {
        try {
          const fd = new FormData()
          fd.append('tenant_id', String(form.tenant_id))
          fd.append('amount', String(payAmount))
          fd.append('period_months', String(form.months))
          fd.append('payment_method', payMethod)
          fd.append('notes', payReference ? `Pago del alta · ${payReference}` : 'Pago del alta')
          if (billingCycleId) fd.append('billing_cycle_id', String(billingCycleId))
          if (payReceipt) fd.append('receipt', payReceipt)
          await paymentsService.create(fd)
          toast.success('Pago registrado y aplicado')
        } catch (e: unknown) {
          const msg =
            e && typeof e === 'object' && 'response' in e
              ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
              : undefined
          toast.error(
            `${msg ?? 'No se pudo registrar el pago'} — la suscripción quedó creada con el cobro pendiente`,
          )
        }
      }

      setShowCreateModal(false)
      resetPaymentFields()
      load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      toast.error(msg ?? 'Error creando suscripción')
    } finally {
      setSaving(false)
    }
  }

  const handleSuspend = async () => {
    if (!selectedSub) return
    setSaving(true)
    try {
      await subscriptionsService.suspend(selectedSub.id, suspendReason)
      toast.success('Suscripción suspendida — tenant desactivado')
      setShowSuspendModal(false)
      load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      toast.error(msg ?? 'Error suspendiendo')
    } finally {
      setSaving(false)
    }
  }

  const handleReactivate = async (sub: SaasSubscription) => {
    try {
      await subscriptionsService.reactivate(sub.id, 0)
      toast.success('Suscripción reactivada — tenant activo')
      load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      toast.error(msg ?? 'Error reactivando')
    }
  }

  const handleCancel = async () => {
    if (!selectedSub) return
    if (!cancelReason.trim()) {
      toast.error('El motivo es obligatorio')
      return
    }
    setSaving(true)
    try {
      await subscriptionsService.cancel(selectedSub.id, cancelReason.trim())
      toast.success('Suscripción anulada')
      setShowCancelModal(false)
      load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      toast.error(msg ?? 'Error anulando la suscripción')
    } finally {
      setSaving(false)
    }
  }

  const handleCheckExpirations = async () => {
    setCheckingExpired(true)
    try {
      const r = await subscriptionsService.checkExpirations()
      toast.success(`Verificación completada — ${r.suspended} suspendida(s)`)
      load()
    } catch {
      toast.error('Error verificando vencimientos')
    } finally {
      setCheckingExpired(false)
    }
  }

  const openAdjustModal = (sub: SaasSubscription) => {
    setSelectedSub(sub)
    setAdjustEndDate(toInputDate(sub.end_date))
    setAdjustReason('')
    setAdjustConfirm(false)
    setShowAdjustModal(true)
  }

  const closeAdjustModal = () => {
    if (saving) return
    setShowAdjustModal(false)
    setAdjustConfirm(false)
    setSelectedSub(null)
  }

  const handleAdjustSubmit = () => {
    if (!adjustEndDate) {
      toast.error('Selecciona la nueva fecha de vencimiento')
      return
    }
    if (!adjustReason.trim()) {
      toast.error('El motivo es obligatorio')
      return
    }
    setAdjustConfirm(true)
  }

  const handleAdjustConfirm = async () => {
    if (!selectedSub) return
    setSaving(true)
    try {
      await subscriptionsService.adjustValidity(selectedSub.id, {
        end_date: adjustEndDate,
        reason: adjustReason.trim(),
      })
      toast.success('Ajuste de vigencia realizado correctamente.')
      closeAdjustModal()
      load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      toast.error(msg || 'Error al ajustar vigencia')
    } finally {
      setSaving(false)
    }
  }

  const tenantLabel = (sub: SaasSubscription) =>
    sub.tenant_name || `Tenant #${sub.tenant_id}`

  /**
   * Exporta TODAS las suscripciones que matchean los filtros activos (no solo la página
   * visible): pagina el mismo endpoint con per_page=100 hasta agotar total_pages.
   */
  const exportExcel = async () => {
    setExportingExcel(true)
    try {
      const all: SaasSubscription[] = []
      const perPageExport = 100
      let p = 1
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await subscriptionsService.list({
          status: filterStatus,
          billed_months: billedMonthsFilter || undefined,
          q: search,
          end_date_from: endDateFromFilter,
          end_date_to: endDateToFilter,
          page: p,
          per_page: perPageExport,
        })
        all.push(...res.data)
        if (res.data.length === 0 || p >= res.total_pages) break
        p += 1
      }
      if (all.length === 0) {
        toast.error('No hay suscripciones para exportar con estos filtros')
        return
      }
      const columns: ExportColumn<SaasSubscription>[] = [
        { key: 'id', label: 'Empresa', format: (_v, row) => tenantLabel(row) },
        { key: 'plan_name', label: 'Plan' },
        { key: 'billed_months', label: 'Ciclo', format: (v) => cycleLabelFromMonths(v as number) },
        { key: 'start_date', label: 'Vigencia desde', format: (v) => fmtDate(v as string) },
        { key: 'end_date', label: 'Vigencia hasta', format: (v) => fmtDate(v as string) },
        {
          key: 'status',
          label: 'Estado',
          format: (v) => STATUS_CONFIG[v as keyof typeof STATUS_CONFIG]?.label ?? (v as string),
        },
        { key: 'modules', label: 'Módulos', format: (v) => ((v as string[]) ?? []).join(', ') },
      ]
      await exportTableToExcel(
        'Suscripciones',
        columns,
        all,
        `suscripciones-tukifac-${new Date().toISOString().slice(0, 10)}.xlsx`,
      )
      toast.success(`${all.length} suscripción(es) exportadas`)
    } catch {
      toast.error('Error al exportar')
    } finally {
      setExportingExcel(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Suscripciones</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona el acceso de los tenants al sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckExpirations}
            disabled={checkingExpired}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Clock size={14} /> {checkingExpired ? 'Verificando...' : 'Verificar vencidos'}
          </button>
          <button
            onClick={() => void exportExcel()}
            disabled={exportingExcel || loading}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Exportar a Excel las suscripciones que matchean los filtros actuales"
          >
            {exportingExcel ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Exportar Excel
          </button>
          <button
            onClick={() => {
              setForm({ tenant_id: 0, plan_id: 0, months: 1, notes: '', start_date: '' })
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nueva suscripción
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar empresa por nombre o RUC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['', 'active', 'trial', 'expired', 'suspended'] as const).map(s => (
            <button
              key={s || 'all'}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {s === '' ? 'Todas' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative">
          <select
            value={billedMonthsFilter}
            onChange={e => setBilledMonthsFilter(e.target.value ? Number(e.target.value) : '')}
            className="appearance-none pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Todos los ciclos</option>
            {CYCLE_MONTHS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 whitespace-nowrap" htmlFor="subs-end-date-from">
            Vencimiento
          </label>
          <input
            id="subs-end-date-from"
            type="date"
            value={endDateFromFilter}
            onChange={e => setEndDateFromFilter(e.target.value)}
            max={endDateToFilter || undefined}
            className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <span className="text-xs text-slate-400">a</span>
          <input
            type="date"
            value={endDateToFilter}
            onChange={e => setEndDateToFilter(e.target.value)}
            min={endDateFromFilter || undefined}
            className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const today = new Date()
            const in30 = new Date(today)
            in30.setDate(in30.getDate() + 30)
            const toISO = (d: Date) => d.toISOString().slice(0, 10)
            setFilterStatus('active')
            setEndDateFromFilter(toISO(today))
            setEndDateToFilter(toISO(in30))
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap"
          title="Activas que vencen en los próximos 30 días"
        >
          Por vencer (30 días)
        </button>
        {(billedMonthsFilter !== '' || endDateFromFilter || endDateToFilter) && (
          <button
            type="button"
            onClick={() => {
              setBilledMonthsFilter('')
              setEndDateFromFilter('')
              setEndDateToFilter('')
            }}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Limpiar ciclo/vencimiento
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Empresa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ciclo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vigencia</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Módulos</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {subs.map(sub => {
                  const days = daysLeft(sub.end_date)
                  const cfg = STATUS_CONFIG[sub.status as keyof typeof STATUS_CONFIG] ?? {
                    label: sub.status,
                    variant: 'gray' as const,
                  }
                  return (
                    <tr
                      key={sub.id}
                      className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                        sub.is_current === false ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{tenantLabel(sub)}</td>
                      <td className="px-4 py-3 text-slate-600">{sub.plan_name}</td>
                      <td className="px-4 py-3 text-slate-600">{cycleLabelFromMonths(sub.billed_months)}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-600">
                          {fmtDate(sub.start_date)} → {fmtDate(sub.end_date)}
                        </div>
                        {sub.is_current === false && (
                          <div className="text-xs mt-0.5 text-slate-400">
                            Histórico · reemplazada por una renovación
                          </div>
                        )}
                        {sub.is_current !== false && sub.status === 'active' && (
                          <div
                            className={`text-xs mt-0.5 ${
                              days <= 7 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-slate-500'
                            }`}
                          >
                            {days > 0 ? `${days} días restantes` : 'Vencida hoy'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={cfg.variant as 'green' | 'red' | 'yellow' | 'blue' | 'gray'}>
                          {cfg.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(sub.modules ?? []).slice(0, 3).map(m => (
                            <span key={m} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {m}
                            </span>
                          ))}
                          {(sub.modules ?? []).length > 3 && (
                            <span className="text-xs text-slate-500">+{(sub.modules ?? []).length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {/* Las acciones afectan al tenant, no a la fila: sobre una suscripción
                            histórica suspenderían o renovarían al tenant por error. */}
                        <div className="flex items-center gap-1 justify-end">
                          {sub.is_current === false && (
                            <span className="text-xs text-slate-400 pr-1">Solo lectura</span>
                          )}
                          {sub.is_current !== false && (
                          <>
                          <button
                            onClick={() => openAdjustModal(sub)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Ajustar vigencia"
                          >
                            <CalendarClock size={16} />
                          </button>
                          {(sub.status === 'active' || sub.status === 'trial') && (
                            <button
                              onClick={() => {
                                setSelectedSub(sub)
                                setSuspendReason('')
                                setShowSuspendModal(true)
                              }}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Suspender"
                            >
                              <PauseCircle size={16} />
                            </button>
                          )}
                          {(sub.status === 'suspended' || sub.status === 'expired') && (
                            <button
                              onClick={() => handleReactivate(sub)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Reactivar"
                            >
                              <PlayCircle size={16} />
                            </button>
                          )}
                          {sub.status !== 'cancelled' && (
                            <button
                              onClick={() => {
                                setSelectedSub(sub)
                                setCancelReason('')
                                setShowCancelModal(true)
                              }}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Anular suscripción"
                            >
                              <Ban size={16} />
                            </button>
                          )}
                          </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {subs.length === 0 && (
              <div className="text-center py-12 text-slate-500">No hay suscripciones</div>
            )}
            <PaginationBar
              page={page}
              perPage={perPage}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              itemLabel="suscripciones"
            />
          </>
        )}
      </div>

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nueva suscripción">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empresa *</label>
            <TenantSearchSelect
              value={form.tenant_id}
              onChange={tenantId => setForm(f => ({ ...f, tenant_id: tenantId }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan *</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.plan_id}
              onChange={e => setForm(f => ({ ...f, plan_id: +e.target.value }))}
            >
              <option value={0}>Selecciona plan...</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — S/ {p.price}/{p.billing_cycle === 'monthly' ? 'mes' : 'año'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duración (meses)</label>
            <input
              type="number"
              min={1}
              max={24}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.months}
              onChange={e => setForm(f => ({ ...f, months: +e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha de inicio (opcional)
            </label>
            <input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.start_date ?? ''}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">
              Vacío = arranca hoy. Sin efecto si el tenant ya tiene una suscripción vigente con
              este plan (esa renueva encadenando desde su propio vencimiento). Vigencia:{' '}
              <strong>{datesPreview.startLabel}</strong> → <strong>{datesPreview.endLabel}</strong>
            </p>
          </div>
          {/* Descuento: el caso típico es contratar 6 meses o un año a cambio de rebaja. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descuento</label>
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={form.discount_type ?? ''}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    discount_type: e.target.value as '' | 'percent' | 'fixed',
                    discount_value: e.target.value === '' ? 0 : f.discount_value,
                  }))
                }
              >
                <option value="">Sin descuento</option>
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {form.discount_type === 'percent' ? 'Porcentaje' : 'Monto'}
              </label>
              <input
                type="number"
                min={0}
                max={form.discount_type === 'percent' ? 100 : undefined}
                step="0.01"
                disabled={!form.discount_type}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={form.discount_value ?? 0}
                onChange={e => setForm(f => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>

          {grossAmount > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>
                  Plan × {form.months} mes(es)
                </span>
                <span>S/ {grossAmount.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento</span>
                  <span>− S/ {discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1">
                <span>Total a cobrar</span>
                <span>S/ {expectedAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {/* Suscribir da acceso inmediato pero no cobra: el cobro nace pendiente. Decirlo
              aquí evita altas que nadie recuerda perseguir. */}
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-medium">El cliente queda activo con el pago pendiente</p>
              <p className="text-xs mt-0.5">
                Se emitirá el cobro del plan y tendrá {paymentWindowDays} día(s) para pagarlo. Si no
                paga en plazo, aparecerá en la campana de cobranza para suspenderlo o anularlo.
              </p>
            </div>
          </div>

          {/* Cobro en el mismo paso. Opcional a propósito: el alta no depende de esto. */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={payNow}
                onChange={e => {
                  setPayNow(e.target.checked)
                  if (e.target.checked && payAmount <= 0) setPayAmount(expectedAmount)
                }}
              />
              <span>
                <span className="text-sm font-medium text-slate-700">Registrar el pago ahora</span>
                <span className="block text-xs text-slate-500">
                  Opcional. Si ya te pagó, queda saldado de una vez; si no, deja esto sin marcar y el
                  cobro sigue pendiente.
                </span>
              </span>
            </label>

            {payNow && (
              <div className="space-y-3 pl-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Monto (S/) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white"
                      value={payAmount}
                      onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                    />
                    {expectedAmount > 0 && Math.abs(payAmount - expectedAmount) > 0.009 && (
                      <p className="text-[11px] text-amber-700 mt-1">
                        El cobro del plan es S/ {expectedAmount.toFixed(2)}. Un monto menor será
                        rechazado.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Método</label>
                    <select
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white"
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value)}
                    >
                      <option value="transfer">Transferencia</option>
                      <option value="deposit">Depósito</option>
                      <option value="yape">Yape</option>
                      <option value="plin">Plin</option>
                      <option value="cash">Efectivo</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Referencia (opcional)
                  </label>
                  <input
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white"
                    placeholder="N.° de operación"
                    value={payReference}
                    onChange={e => setPayReference(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Comprobante (opcional)
                  </label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.webp"
                    className="w-full text-xs text-slate-600"
                    onChange={e => setPayReceipt(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear suscripción'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showSuspendModal} onClose={() => setShowSuspendModal(false)} title="Suspender suscripción">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Suspender esta suscripción desactivará el acceso del tenant al sistema.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo (opcional)</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={2}
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowSuspendModal(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSuspend}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Suspendiendo...' : 'Suspender'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showCancelModal} onClose={() => !saving && setShowCancelModal(false)} title="Anular suscripción">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <div>
              <p className="font-medium">
                {selectedSub ? tenantLabel(selectedSub) : ''} quedará sin acceso
              </p>
              <p className="text-xs mt-0.5">
                La suscripción se cierra y sus cobros pendientes se anulan. Los datos de la empresa
                se conservan: si vuelve, se le crea una suscripción nueva.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
            <textarea
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              rows={2}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Ej. no concretó el pago del alta"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              disabled={saving}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || !cancelReason.trim()}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Anulando...' : 'Anular suscripción'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showAdjustModal}
        onClose={closeAdjustModal}
        title="Ajustar vigencia"
        maxWidth="max-w-md"
      >
        {!adjustConfirm ? (
          <div className="space-y-4">
            {selectedSub && (
              <p className="text-sm text-slate-600">
                Empresa: <strong className="text-slate-800">{tenantLabel(selectedSub)}</strong>
                {' · '}
                Vencimiento actual: <strong>{fmtDate(selectedSub.end_date)}</strong>
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nueva fecha de vencimiento *</label>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={adjustEndDate}
                onChange={e => setAdjustEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                placeholder="Ej. Pago confirmado fuera de fecha"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeAdjustModal}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAdjustSubmit}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 leading-relaxed space-y-2">
              <p>Esta acción modificará la fecha de vencimiento de la suscripción.</p>
              <p>No cambia el plan contratado, los módulos asignados ni los ciclos de facturación.</p>
              <p>Todas las acciones serán registradas en la auditoría.</p>
              <p className="font-medium text-slate-800">¿Desea continuar?</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAdjustConfirm(false)}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleAdjustConfirm}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Confirmar ajuste'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
