import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Search, RefreshCw, Edit, Power, Layers, ChevronDown, Shield, SearchCheck, Trash2, AlertTriangle, LogIn, Loader2,
  Upload,
} from 'lucide-react'
import {
  tenantsService,
  Tenant,
  TenantModule,
  CreateTenantInput,
  UpdateTenantInput,
  moduleEmoji,
  type SunatConfigResponse,
  type SunatConfigUpdate,
  type TenantConectadoFacturador,
} from '@/services/tenants.service'
import { consultaService } from '@/services/consulta.service'
import { plansService, type SaasPlan, type SaasModule } from '@/services/plans.service'
import { paymentsService } from '@/services/payments.service'
import { saasSettingsService, type PaymentMethodConfig } from '@/services/saasSettings.service'
import { subscriptionsService, type SaasSubscription } from '@/services/subscriptions.service'
import { getRootDomain, getTenantHost, resolveTenantUrl, buildMasterAccessUrl } from '@/utils/tenantUrl'
import { fileToBase64Binary, fileToBase64Text } from '@/utils/fileBase64'
import { ubigeoService } from '@/services/ubigeo.service'
import { UbigeoSelects, ubigeoToIds } from '@/components/UbigeoSelects'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import ActionMenu from '@/components/ui/ActionMenu'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import type { PerPageOption } from '@/services/pagination'

/* ─── helpers ─────────────────────────────────────────────── */
const statusVariant = (s: string) =>
  s === 'active' ? 'green' : s === 'inactive' ? 'red' : 'yellow'
const statusLabel = (s: string) =>
  s === 'active' ? 'Activo' : s === 'inactive' ? 'Suspendido' : s

const subscriptionStatusVariant = (status?: string, daysOverdue?: number) => {
  if (daysOverdue && daysOverdue > 0) return 'red'
  switch (status) {
    case 'active': return 'green'
    case 'grace_period': return 'yellow'
    case 'overdue': return 'red'
    case 'suspended': return 'red'
    default: return 'gray'
  }
}

function SubscriptionStatusCell({ sub }: { sub?: SaasSubscription }) {
  if (!sub) {
    return <span className="text-slate-400 text-xs">—</span>
  }
  const label = sub.status_label || sub.status
  const isOverdue = (sub.days_overdue ?? 0) > 0
  const moraDays = isOverdue ? ` (${sub.days_overdue}d mora)` : ''
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={subscriptionStatusVariant(sub.status, sub.days_overdue)}>
        {label}
      </Badge>
      {moraDays && (
        <span className="text-xs text-red-600 font-medium">{moraDays}</span>
      )}
      {(sub.days_in_grace ?? 0) > 0 && (
        <span className="text-xs text-amber-600">
          ({sub.days_in_grace}d gracia)
        </span>
      )}
    </div>
  )
}

/** Fuerza minúsculas y solo caracteres válidos para subdominio (a-z, 0-9). */
function normalizeSlugInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const isProduction = (mode?: string) =>
  (mode ?? '').toLowerCase() === 'production'

function normalizeSunatEnvMode(mode?: string): 'demo' | 'production' {
  return isProduction(mode) ? 'production' : 'demo'
}

function SunatEnvCell({ tenant, onUpdated }: { tenant: Tenant; onUpdated: () => void }) {
  const [updating, setUpdating] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const mode = normalizeSunatEnvMode(tenant.sunat_env_mode)
  const prod = mode === 'production'

  const switchToProduction = async () => {
    setUpdating(true)
    setShowConfirm(false)
    try {
      await tenantsService.setSunatEnv(tenant.id, 'production')
      toast.success('Ambiente cambiado a Producción')
      onUpdated()
    } catch (e: unknown) {
      const errMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(errMsg ?? 'Error al cambiar modo')
    } finally {
      setUpdating(false)
    }
  }

  if (!tenant.billing_enabled) {
    return <span className="text-slate-400 text-xs">—</span>
  }
  if (!tenant.sunat_env_mode || tenant.sunat_env_mode === '') {
    return <span className="text-slate-400 text-xs">—</span>
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${prod ? 'text-emerald-600' : 'text-amber-600'}`}>
          {prod ? 'Producción' : 'Pruebas'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={prod}
          aria-label={prod ? 'Ambiente producción (bloqueado)' : 'Pasar a producción'}
          disabled={updating || prod}
          onClick={() => setShowConfirm(true)}
          title={prod ? 'En producción no se puede volver a pruebas' : 'Pasar a producción'}
          className={`relative inline-flex rounded-full transition-colors flex-shrink-0 ${
            prod ? 'bg-emerald-600 cursor-not-allowed opacity-90' : 'bg-amber-400 hover:bg-amber-500'
          } disabled:opacity-60`}
          style={{ height: '20px', width: '36px' }}
        >
          <span
            className={`absolute top-0.5 bg-white rounded-full shadow transition-transform ${
              prod ? 'translate-x-[17px]' : 'translate-x-0.5'
            }`}
            style={{ width: '16px', height: '16px' }}
          />
        </button>
      </div>
      <Modal
        open={showConfirm}
        onClose={() => !updating && setShowConfirm(false)}
        title="Pasar a Producción SUNAT"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <p>
              Los comprobantes se enviarán al <strong>SUNAT real</strong> de <strong>{tenant.name}</strong>.
              Este cambio es <strong>irreversible</strong>: no podrá volver a pruebas desde el panel.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={updating}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={switchToProduction}
              disabled={updating}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {updating ? 'Cambiando...' : 'Sí, pasar a Producción'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}


/* ─── schemas ─────────────────────────────────────────────── */
const createSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z
    .string()
    .transform((s) => s.toLowerCase().trim())
    .pipe(
      z
        .string()
        .min(2, 'Mínimo 2 caracteres')
        .max(63, 'Máximo 63 caracteres')
        .regex(/^[a-z0-9]+$/, 'Solo letras minúsculas y números, sin guiones ni espacios')
    ),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  ruc: z.string().optional(),
  plan: z.string().min(1, 'Seleccione un plan'),
  rubro: z.enum(['general', 'gastronomico']),
  taxpayer_regime: z.enum(['general', 'nrus']),
  admin_email: z.string().email('Email inválido'),
  admin_password: z.string().min(6, 'Mínimo 6 caracteres'),
  // Obligatorios: si quedan vacíos, el backend caía en un default "Arequipa" pensado solo para
  // tenants de prueba — terminaba impreso como domicilio fiscal real en el comprobante de
  // empresas de otras regiones. El departamento/provincia/distrito (createUbigeo, fuera de este
  // schema porque UbigeoSelects no es un input de react-hook-form) se valida aparte en
  // onCreateSubmit.
  address: z.string().min(1, 'La dirección es obligatoria'),
  ubigeo: z.string().optional(),
  // Toda empresa nace con suscripción (las gratuitas, con el plan gratis). Restringido a los
  // mismos 4 ciclos fijos del plan (1/3/6/12 meses, ver saas.FixedPlanCycleMonths) — son los
  // únicos que pueden traer descuento configurado; fuera de estos no hay nada que aplicar.
  subscription_months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).optional(),
  // Vacío = arranca hoy (default de siempre). Si se elige, no puede ser una fecha pasada — el
  // backend vuelve a validar esto igual, nunca confiar solo en el frontend.
  start_date: z
    .string()
    .optional()
    .refine((v) => {
      if (!v) return true
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return new Date(`${v}T00:00:00`) >= today
    }, 'No puede ser una fecha pasada'),
  // Sin campos de descuento: el backend lo calcula solo desde el ciclo configurado en el plan
  // para `subscription_months` (ver createChargePreview, que muestra ese mismo cálculo).
})

const editSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  ruc: z.string().optional(),
  // Abierto como en createSchema: el catálogo de planes lo define el superadmin en /plans,
  // no puede estar clavado a trial/basic/pro.
  plan: z.string().min(1, 'Seleccione un plan'),
  status: z.enum(['active', 'inactive', 'trial']),
  taxpayer_regime: z.enum(['general', 'nrus']),
  address: z.string().optional(),
  ubigeo: z.string().optional(),
})

/**
 * Valor que debe quedar seleccionado en el `<select>` de plan para un tenant.
 *
 * Se resuelve contra el catálogo (primero por `plan_id`, que viene de la suscripción
 * vigente; si no, por nombre sin distinguir mayúsculas) y se devuelve el nombre canónico
 * del plan. Si no hay coincidencia devuelve '' para que el select quede vacío en lugar de
 * caer al primer option: antes eso mostraba "Trial" y al guardar pisaba el plan real.
 */
function resolveTenantPlanValue(t: Tenant, plans: SaasPlan[]): string {
  if (t.plan_id) {
    const byId = plans.find(p => p.id === t.plan_id)
    if (byId) return byId.name
  }
  const raw = String(t.plan_name ?? t.plan ?? '').trim().toLowerCase()
  if (!raw) return ''
  return plans.find(p => p.name.trim().toLowerCase() === raw)?.name ?? ''
}

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>

/* ─── component ────────────────────────────────────────────── */
export default function TenantsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  /** Valor tal cual lo tipea el usuario; controla el input, no dispara fetch directamente. */
  const [searchInput, setSearchInput] = useState('')
  /** Valor debounced (300ms): es el que usa fetchTenants. Antes cada tecla disparaba un fetch,
   * y tipear rápido llegaba a chocar con el rate limit global del backend (300 req/min por IP,
   * compartido con el resto de la API) — "demasiadas solicitudes, intente de nuevo en un
   * momento". */
  const [search, setSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])
  const [statusFilter, setStatusFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [provinciaFilter, setProvinciaFilter] = useState('')
  const [regionesFilter, setRegionesFilter] = useState<{ id: string; nombre: string }[]>([])
  const [provinciasFilter, setProvinciasFilter] = useState<{ id: string; nombre: string }[]>([])

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [destroyTenant, setDestroyTenant] = useState<Tenant | null>(null)
  const [destroyOpsKey, setDestroyOpsKey] = useState('')
  const [destroyConfirmSlug, setDestroyConfirmSlug] = useState('')
  const [destroying, setDestroying] = useState(false)
  const [moduleTenant, setModuleTenant] = useState<{ tenant: Tenant; modules: TenantModule[] } | null>(null)
  const [loadingModules, setLoadingModules] = useState(false)
  const [sunatTenant, setSunatTenant] = useState<{ tenant: Tenant; config: SunatConfigResponse } | null>(null)
  const [loadingSunat, setLoadingSunat] = useState(false)
  const [savingSunat, setSavingSunat] = useState(false)
  const [sunatForm, setSunatForm] = useState<SunatConfigUpdate & { sunat_sol_pass?: string }>({ sunat_enabled: false })
  const [psePasswordInput, setPsePasswordInput] = useState('')
  const [greClientSecretInput, setGreClientSecretInput] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [masterAccessTenant, setMasterAccessTenant] = useState<Tenant | null>(null)
  const [masterAccessLoading, setMasterAccessLoading] = useState(false)

  const sendMode = (cfg?: { send_mode?: string }) => cfg?.send_mode ?? 'sunat_direct'
  const [syncCertBase64, setSyncCertBase64] = useState<string>('')
  const [syncPrivateKeyBase64, setSyncPrivateKeyBase64] = useState<string>('')
  const [syncPfxBase64, setSyncPfxBase64] = useState<string>('')
  const [certPasswordInput, setCertPasswordInput] = useState('')
  const [certInputMode, setCertInputMode] = useState<'pfx' | 'pem'>('pfx')
  const [syncLogoBase64, setSyncLogoBase64] = useState<string>('')
  const [consultandoRuc, setConsultandoRuc] = useState<'create' | 'edit' | null>(null)
  const [saasPlans, setSaasPlans] = useState<SaasPlan[]>([])
  const [moduleCatalog, setModuleCatalog] = useState<SaasModule[]>([])
  const [subscriptionsByTenantId, setSubscriptionsByTenantId] = useState<Record<number, any>>({})
  /** ¿El plan del tenant en edición existe en el catálogo? Si no, se pide elegir uno. */
  const editPlanMatched = Boolean(editTenant && resolveTenantPlanValue(editTenant, saasPlans))
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  // Estado "enabled" de cada empresa en el facturador (Lycet), indexado por RUC.
  const [facturadorByRuc, setFacturadorByRuc] = useState<Record<string, TenantConectadoFacturador>>({})
  const [togglingRuc, setTogglingRuc] = useState<string | null>(null)

  const fetchFacturadorEmpresas = useCallback(async () => {
    try {
      const data = await tenantsService.listConectadosFacturador()
      const map: Record<string, TenantConectadoFacturador> = {}
      for (const e of data) {
        if (e.ruc) map[e.ruc.trim()] = e
      }
      setFacturadorByRuc(map)
    } catch {
      setFacturadorByRuc({})
    }
  }, [])

  useEffect(() => {
    fetchFacturadorEmpresas()
  }, [fetchFacturadorEmpresas])

  const handleToggleFacturador = async (t: Tenant) => {
    const ruc = (t.ruc || '').trim()
    if (ruc.length !== 11) {
      toast.error('El tenant no tiene RUC válido.')
      return
    }
    const entry = facturadorByRuc[ruc]
    if (!entry) {
      toast.error('Empresa no registrada en el facturador. Usa "SUNAT" → Sincronizar primero.')
      return
    }
    const currentlyEnabled = entry.enabled !== false
    const next = !currentlyEnabled
    if (!next && !window.confirm(`¿Deshabilitar la empresa ${ruc} en el facturador? Dejará de poder emitir comprobantes.`)) {
      return
    }
    setTogglingRuc(ruc)
    try {
      await tenantsService.setFacturadorEnabled(ruc, next)
      setFacturadorByRuc((prev) => ({ ...prev, [ruc]: { ...prev[ruc], enabled: next } }))
      toast.success(next ? 'Empresa habilitada en el facturador' : 'Empresa deshabilitada en el facturador')
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo cambiar el estado en el facturador.')
    } finally {
      setTogglingRuc(null)
    }
  }

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    try {
      const res = await tenantsService.list({
        q: search,
        status: statusFilter,
        region_id: regionFilter,
        provincia_id: provinciaFilter,
        page,
        per_page: perPage,
      })
      setTenants(res.data)
      setTotal(res.total)
      setTotalPages(res.total_pages)
    } catch {
      toast.error('Error cargando empresas')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, regionFilter, provinciaFilter, page, perPage])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, regionFilter, provinciaFilter, perPage])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  // Cargar suscripciones para tenants que tengan billing habilitado
  useEffect(() => {
    const loadSubscriptions = async () => {
      const subs: Record<number, any> = {}
      const promises = tenants
        .filter(t => t.billing_enabled)
        .map(async (t) => {
          const sub = await subscriptionsService.getByTenant(t.id)
          if (sub) {
            subs[t.id] = sub
          }
        })
      await Promise.all(promises)
      setSubscriptionsByTenantId(subs)
    }
    if (tenants.length > 0) {
      loadSubscriptions().catch(() => {})
    }
  }, [tenants])

  useEffect(() => {
    ubigeoService.getRegiones().then(setRegionesFilter)
  }, [])
  useEffect(() => {
    plansService
      .list()
      .then(plans => setSaasPlans(plans.filter(p => p.active)))
      .catch(() => {})
  }, [])
  // Catálogo dinámico de módulos (fuente única, backend). Reemplaza al antiguo ALL_MODULES.
  useEffect(() => {
    plansService
      .listModules()
      .then(mods => setModuleCatalog(mods.filter(m => m.active)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!regionFilter) {
      setProvinciasFilter([])
      setProvinciaFilter('')
      return
    }
    ubigeoService.getProvincias(regionFilter).then(setProvinciasFilter)
  }, [regionFilter])

  // Abrir modal SUNAT si se navegó desde Empresas SUNAT con openSunatId
  const openSunatId = (location.state as { openSunatId?: number })?.openSunatId
  useEffect(() => {
    if (!openSunatId) return
    const tenant = tenants.find((t) => t.id === openSunatId)
    if (tenant) {
      openSunat(tenant)
      navigate('/tenants', { replace: true, state: {} })
      return
    }
    tenantsService
      .get(openSunatId)
      .then(({ data }) => {
        openSunat(data)
        navigate('/tenants', { replace: true, state: {} })
      })
      .catch(() => {})
  }, [openSunatId, tenants])

  /* ── Create form ─────────────── */
  const [createUbigeo, setCreateUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      plan: '',
      subscription_months: 1,
      rubro: 'general',
      taxpayer_regime: 'general',
    },
  })

  // Cobro en el mismo paso del alta. Opcional: apagado, la empresa se crea igual.
  const [payNow, setPayNow] = useState(false)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('')
  // Métodos de pago tal como los configuró el superadmin (los mismos que ve el tenant al subir
  // su comprobante en su panel, ver PaymentMethodsPanel) — nada de opciones hardcodeadas que
  // puedan no coincidir con lo que realmente está habilitado.
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([])
  useEffect(() => {
    saasSettingsService
      .get()
      .then(cfg => {
        const enabled = cfg.payment_methods.filter(m => m.enabled)
        setPaymentMethods(enabled)
        setPayMethod(prev => prev || enabled[0]?.key || '')
      })
      .catch(() => {})
  }, [])
  const [payReference, setPayReference] = useState('')
  const [payReceipt, setPayReceipt] = useState<File | null>(null)

  const payReceiptRef = useRef<HTMLInputElement>(null)

  const resetPaymentFields = () => {
    setPayNow(false)
    setPayAmount(0)
    setPayMethod('transfer')
    setPayReference('')
    setPayReceipt(null)
  }

  const createPlanValue = createForm.watch('plan')
  const createMonths = createForm.watch('subscription_months')
  const createStartDate = createForm.watch('start_date')

  /** Preview de vigencia: mismo cálculo que el backend (inicio + meses), solo para mostrar. */
  const createDatesPreview = useMemo(() => {
    const months = Math.max(1, Number(createMonths) || 1)
    const start = createStartDate ? new Date(`${createStartDate}T00:00:00`) : new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setMonth(end.getMonth() + months)
    const fmt = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    return { startLabel: fmt(start), endLabel: fmt(end) }
  }, [createMonths, createStartDate])

  /**
   * Desglose del cobro inicial. Ya no se calcula a mano: se lee directo del ciclo que el plan
   * tiene configurado para `months` (saasPlans[].cycles, los mismos 4 fijos — 1/3/6/12 — que ya
   * usa el autoservicio del tenant) — es EXACTAMENTE lo que el backend va a cobrar
   * (PlanCycleDiscount), no una aproximación. Si el plan no tiene ese ciclo habilitado, se cobra
   * el precio pleno sin descuento.
   */
  const createChargePreview = useMemo(() => {
    const plan = saasPlans.find(p => p.name.toLowerCase() === (createPlanValue ?? '').toLowerCase())
    const months = Math.max(1, Number(createMonths) || 1)
    const cycle = plan?.cycles.find(c => c.months === months && c.enabled)
    if (plan && cycle) {
      return {
        gross: cycle.gross_amount,
        discount: +(cycle.gross_amount - cycle.net_amount).toFixed(2),
        net: cycle.net_amount,
        discountType: cycle.discount_type,
        discountValue: cycle.discount_value,
        hasConfiguredCycle: true,
      }
    }
    const gross = plan ? +(plan.price * months).toFixed(2) : 0
    return { gross, discount: 0, net: gross, discountType: '' as const, discountValue: 0, hasConfiguredCycle: false }
  }, [saasPlans, createPlanValue, createMonths])
  // El monto de "Registrar el pago ahora" sigue al cobro real del plan+meses elegidos — si el
  // admin cambia la duración (o el plan) con el pago ya marcado, el monto se recalcula solo en
  // vez de quedarse con el de la duración anterior (que el backend rechazaría por no cubrir la
  // deuda). Solo se dispara cuando el cobro CAMBIA, así que si el admin lo edita a mano por
  // alguna razón, no se lo pisa en cada render — solo al cambiar meses/plan de nuevo.
  useEffect(() => {
    if (payNow) setPayAmount(createChargePreview.net)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payNow, createChargePreview.net])

  const createRubroValue = createForm.watch('rubro')

  const createPlanPreview = useMemo(() => {
    const planKey = (createPlanValue ?? '').toLowerCase()
    const matched = saasPlans.find(p => p.name.toLowerCase() === planKey)
    const moduleKeys = new Set(matched?.modules ?? [])
    const restaurantFromRubro = createRubroValue === 'gastronomico'
    if (restaurantFromRubro) moduleKeys.add('restaurant')
    const modules = moduleCatalog.filter(m => moduleKeys.has(m.key))
    const restaurantExtra =
      restaurantFromRubro && matched && !matched.modules.includes('restaurant')
    return { matched, modules, moduleKeys, restaurantExtra }
  }, [saasPlans, moduleCatalog, createPlanValue, createRubroValue])

  const onCreateSubmit = async (data: CreateForm) => {
    // createUbigeo vive fuera de react-hook-form (UbigeoSelects no es un input estándar), así
    // que no lo valida el resolver de Zod — se valida acá antes de enviar. Sin esto, un tenant
    // podía quedar con el default "Arequipa" del backend como domicilio fiscal aunque estuviera
    // en otra región, porque nada obligaba a completar el departamento/provincia/distrito.
    if (!createUbigeo.distritoId) {
      toast.error('Seleccione departamento, provincia y distrito')
      return
    }
    try {
      const months = (() => {
        const m = Number((data as CreateForm & { subscription_months?: number }).subscription_months)
        return Number.isFinite(m) && m >= 1 ? m : 1
      })()
      const { tenant, billingCycleId } = await tenantsService.create({
        ...(data as CreateTenantInput),
        address: data.address ?? '',
        ubigeo: createUbigeo.distritoId || undefined,
        subscription_months: months,
      })
      toast.success('Empresa creada correctamente')

      // El pago es opcional y va DESPUÉS del alta: si falla, la empresa ya quedó creada con su
      // cobro pendiente. Nunca debe impedir dar de alta al cliente.
      if (payNow) {
        try {
          const fd = new FormData()
          fd.append('tenant_id', String(tenant.id))
          fd.append('amount', String(payAmount))
          fd.append('period_months', String(months))
          fd.append('payment_method', payMethod)
          fd.append('notes', payReference ? `Pago del alta · ${payReference}` : 'Pago del alta')
          if (billingCycleId) fd.append('billing_cycle_id', String(billingCycleId))
          if (payReceipt) fd.append('receipt', payReceipt)
          await paymentsService.create(fd)
          toast.success('Pago registrado y aplicado')
        } catch (e: unknown) {
          const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          toast.error(
            `${msg ?? 'No se pudo registrar el pago'} — la empresa quedó creada con el cobro pendiente`,
          )
        }
      }

      setShowCreate(false)
      createForm.reset()
      resetPaymentFields()
      setCreateUbigeo({ regionId: '', provinciaId: '', distritoId: '' })
      fetchTenants()
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al crear'
      )
    }
  }

  /* ── Edit form ───────────────── */
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  // El catálogo se carga async: si el modal de edición se abrió antes de que llegara, la
  // preselección se recalcula aquí en lugar de quedarse vacía.
  useEffect(() => {
    if (!editTenant || saasPlans.length === 0) return
    const value = resolveTenantPlanValue(editTenant, saasPlans)
    if (value) editForm.setValue('plan', value)
  }, [saasPlans, editTenant, editForm])
  const [editUbigeo, setEditUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })

  const openEdit = (t: Tenant) => {
    setEditTenant(t)
    const ids = ubigeoToIds(t.ubigeo ?? '')
    editForm.reset({
      name: t.name,
      email: t.email,
      phone: t.phone,
      ruc: t.ruc,
      plan: resolveTenantPlanValue(t, saasPlans),
      status: t.status as EditForm['status'],
      taxpayer_regime: (t.taxpayer_regime as EditForm['taxpayer_regime']) ?? 'general',
      address: t.address ?? '',
      ubigeo: t.ubigeo ?? '',
    })
    setEditUbigeo({ regionId: ids.regionId, provinciaId: ids.provinciaId, distritoId: ids.distritoId })
  }

  const onEditSubmit = async (data: EditForm) => {
    if (!editTenant) return
    try {
      await tenantsService.update(editTenant.id, {
        ...(data as UpdateTenantInput),
        address: data.address ?? '',
        ubigeo: editUbigeo.distritoId || undefined,
      })
      toast.success('Empresa actualizada')
      setEditTenant(null)
      fetchTenants()
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al actualizar'
      )
    }
  }

  /** Consulta RUC en SUNAT (apiperu.dev) y rellena nombre, dirección y ubigeo. */
  const handleConsultaRucCreate = async () => {
    const ruc = createForm.getValues('ruc')?.trim()
    if (!ruc || ruc.length !== 11) {
      toast.error('Ingrese un RUC de 11 dígitos')
      return
    }
    setConsultandoRuc('create')
    try {
      const res = await consultaService.ruc(ruc)
      if (!res.success || !res.razon_social) {
        toast.error('No se encontró el RUC o el servicio no está disponible')
        return
      }
      createForm.setValue('name', res.razon_social)
      createForm.setValue('address', res.direccion ?? '')
      if (res.ubigeo && res.ubigeo.length >= 6) {
        setCreateUbigeo({
          regionId: res.ubigeo.slice(0, 2),
          provinciaId: res.ubigeo.slice(0, 4),
          distritoId: res.ubigeo,
        })
      }
      toast.success('Datos obtenidos de SUNAT')
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al consultar RUC')
    } finally {
      setConsultandoRuc(null)
    }
  }

  const handleConsultaRucEdit = async () => {
    const ruc = editForm.getValues('ruc')?.trim()
    if (!ruc || ruc.length !== 11) {
      toast.error('Ingrese un RUC de 11 dígitos')
      return
    }
    setConsultandoRuc('edit')
    try {
      const res = await consultaService.ruc(ruc)
      if (!res.success || !res.razon_social) {
        toast.error('No se encontró el RUC o el servicio no está disponible')
        return
      }
      editForm.setValue('name', res.razon_social)
      editForm.setValue('address', res.direccion ?? '')
      if (res.ubigeo && res.ubigeo.length >= 6) {
        setEditUbigeo({
          regionId: res.ubigeo.slice(0, 2),
          provinciaId: res.ubigeo.slice(0, 4),
          distritoId: res.ubigeo,
        })
      }
      toast.success('Datos obtenidos de SUNAT')
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al consultar RUC')
    } finally {
      setConsultandoRuc(null)
    }
  }

  /* ── Toggle status ───────────── */
  const handleToggle = async (t: Tenant) => {
    const newStatus = t.status === 'active' ? 'inactive' : 'active'
    try {
      await tenantsService.setStatus(t.id, newStatus)
      toast.success(`Empresa ${newStatus === 'active' ? 'activada' : 'suspendida'}`)
      fetchTenants()
    } catch {
      toast.error('Error cambiando estado')
    }
  }

  /* ── Acceso maestro ──────────── */
  const confirmMasterAccess = async () => {
    if (!masterAccessTenant) return
    setMasterAccessLoading(true)
    try {
      const { token } = await tenantsService.masterAccess(masterAccessTenant.id)
      const url = buildMasterAccessUrl(masterAccessTenant, token)
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.success(`Acceso maestro abierto para ${masterAccessTenant.name}`)
      setMasterAccessTenant(null)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      toast.error(msg || 'No se pudo generar el acceso maestro')
    } finally {
      setMasterAccessLoading(false)
    }
  }

  /* ── Modules ─────────────────── */
  const openModules = async (t: Tenant) => {
    setLoadingModules(true)
    try {
      const mods = await tenantsService.getModules(t.id)
      // Completar con todo el catálogo dinámico (los que no existen en BD = disabled).
      const existing = new Map(mods.map(m => [m.module_key, m]))
      const full: TenantModule[] = moduleCatalog.map(m =>
        existing.get(m.key) ?? { id: 0, tenant_id: t.id, module_key: m.key, enabled: false }
      )
      setModuleTenant({ tenant: t, modules: full })
    } catch {
      toast.error('Error cargando módulos')
    } finally {
      setLoadingModules(false)
    }
  }

  const handleToggleModule = async (moduleKey: string, enabled: boolean) => {
    if (!moduleTenant) return
    try {
      await tenantsService.setModule(moduleTenant.tenant.id, moduleKey, enabled)
      setModuleTenant((prev) =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map((m) =>
                m.module_key === moduleKey ? { ...m, enabled } : m
              ),
            }
          : prev
      )
      toast.success(`Módulo ${enabled ? 'activado' : 'desactivado'}`)
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(errMsg ?? 'Error actualizando módulo')
    }
  }


  const isModuleEnabled = (key: string) =>
    moduleTenant?.modules.some((m) => m.module_key === key && m.enabled) ?? false

  // Origen del módulo habilitado: 'manual' (cortesía) o 'plan'. undefined si no está habilitado.
  const moduleSource = (key: string): 'plan' | 'manual' | undefined => {
    const m = moduleTenant?.modules.find((x) => x.module_key === key && x.enabled)
    return m?.source
  }

  const clearCertUploads = () => {
    setSyncCertBase64('')
    setSyncPrivateKeyBase64('')
    setSyncPfxBase64('')
    setCertPasswordInput('')
  }

  const switchCertInputMode = (mode: 'pfx' | 'pem') => {
    setCertInputMode(mode)
    clearCertUploads()
  }

  /* ── SUNAT / Facturador ───────────────────────────── */
  const openSunat = async (t: Tenant) => {
    setLoadingSunat(true)
    setSyncCertBase64('')
    setSyncPrivateKeyBase64('')
    setSyncPfxBase64('')
    setCertPasswordInput('')
    setSyncLogoBase64('')
    setPsePasswordInput('')
    setGreClientSecretInput('')
    setCertInputMode('pfx')
    clearCertUploads()
    try {
      const config = await tenantsService.getSunatConfig(t.id)
      const mode = sendMode(config)
      setSunatTenant({ tenant: t, config })
      setSunatForm({
        sunat_enabled: config.sunat_enabled,
        sunat_sol_user: config.sunat_sol_user ?? '',
        sunat_env_mode: normalizeSunatEnvMode(config.sunat_env_mode),
        tax_rate: config.tax_rate ?? 18,
        igv_regime: config.igv_regime ?? 'standard',
        tax_benefit_zone: config.tax_benefit_zone ?? false,
        send_mode: mode,
        pse_provider: mode === 'pse' ? (config.pse_provider ?? config.fiscal_provider ?? 'validapse') : undefined,
        fiscal_provider:
          mode === 'pse'
            ? (config.fiscal_provider ?? config.pse_provider ?? 'validapse')
            : 'sunat',
        pse_user: config.pse_user ?? '',
        gre_client_id: config.gre_client_id ?? '',
      })
    } catch {
      toast.error('Error cargando configuración SUNAT')
    } finally {
      setLoadingSunat(false)
    }
  }

  const handleSaveSunat = async () => {
    if (!sunatTenant) return
    setSavingSunat(true)
    try {
      const mode = sunatForm.send_mode ?? 'sunat_direct'
      if (mode === 'pse') {
        const tokenConfigured = !!sunatTenant.config.pse_token_configured
        if (!sunatForm.pse_user?.trim() && !tokenConfigured) {
          toast.error('Ingrese el usuario PSE (ValidaPSE)')
          setSavingSunat(false)
          return
        }
        if (!psePasswordInput.trim() && !tokenConfigured) {
          toast.error('Ingrese la contraseña / token de acceso PSE')
          setSavingSunat(false)
          return
        }
      }
      if (mode === 'sunat_direct') {
        const solConfigured = !!sunatTenant.config.sol_configured
        const certConfigured = !!sunatTenant.config.certificate_configured
        const hasNewPfx = certInputMode === 'pfx' && !!syncPfxBase64
        const hasNewPem = certInputMode === 'pem' && !!(syncCertBase64 || syncPrivateKeyBase64)
        const hasNewCert = hasNewPfx || hasNewPem
        if (!sunatForm.sunat_sol_user?.trim() && !solConfigured && !sunatForm.sunat_sol_pass?.trim()) {
          toast.error('Ingrese usuario SOL (ej. RUCMODDATOS) y clave SOL')
          setSavingSunat(false)
          return
        }
        if (!certConfigured && !hasNewCert && !syncLogoBase64) {
          toast.error(
            certInputMode === 'pfx'
              ? 'Suba el certificado PFX y la contraseña'
              : 'Suba el certificado PEM (archivo único combinado o clave privada + certificado)'
          )
          setSavingSunat(false)
          return
        }
        if (hasNewPfx && !certPasswordInput.trim()) {
          toast.error('Ingrese la contraseña del certificado PFX')
          setSavingSunat(false)
          return
        }
      }
      const isProduction = normalizeSunatEnvMode(sunatForm.sunat_env_mode) === 'production'
      if (isProduction) {
        const apiConfigured = !!sunatTenant.config.gre_client_configured
        if (!sunatForm.gre_client_id?.trim() && !apiConfigured) {
          toast.error('Ingrese Client ID SUNAT API (requerido en producción)')
          setSavingSunat(false)
          return
        }
        if (!greClientSecretInput.trim() && !apiConfigured) {
          toast.error('Ingrese Client Secret SUNAT API (requerido en producción)')
          setSavingSunat(false)
          return
        }
      }
      const needsCertSync =
        mode === 'sunat_direct' &&
        ((certInputMode === 'pfx' && !!syncPfxBase64) ||
          (certInputMode === 'pem' && !!(syncCertBase64 || syncPrivateKeyBase64)))
      if (needsCertSync || syncLogoBase64) {
        const syncBody: {
          certificate_base64?: string
          private_key_base64?: string
          pfx_base64?: string
          certificate_password?: string
          logo_base64?: string
          sol_user?: string
          sol_pass?: string
        } = {
          sol_user: sunatForm.sunat_sol_user,
          sol_pass: sunatForm.sunat_sol_pass,
        }
        if (mode === 'sunat_direct') {
          if (certInputMode === 'pfx' && syncPfxBase64) {
            syncBody.pfx_base64 = syncPfxBase64
            syncBody.certificate_password = certPasswordInput.trim()
          } else if (certInputMode === 'pem') {
            if (syncCertBase64) syncBody.certificate_base64 = syncCertBase64
            if (syncPrivateKeyBase64) syncBody.private_key_base64 = syncPrivateKeyBase64
          }
        }
        if (syncLogoBase64) syncBody.logo_base64 = syncLogoBase64
        await tenantsService.syncFacturador(sunatTenant.tenant.id, syncBody)
      }
      await tenantsService.updateSunatConfig(sunatTenant.tenant.id, {
        sunat_enabled: sunatForm.sunat_enabled,
        sunat_sol_user: sunatForm.sunat_sol_user,
        sunat_sol_pass: sunatForm.sunat_sol_pass?.trim() || undefined,
        sunat_env_mode: normalizeSunatEnvMode(sunatForm.sunat_env_mode),
        tax_rate: sunatForm.tax_rate,
        igv_regime: sunatForm.igv_regime,
        tax_benefit_zone: sunatForm.tax_benefit_zone,
        send_mode: mode,
        fiscal_provider: mode === 'pse' ? (sunatForm.fiscal_provider ?? sunatForm.pse_provider ?? 'validapse') : 'sunat',
        pse_provider:
          mode === 'pse'
            ? (sunatForm.pse_provider ?? sunatForm.fiscal_provider ?? 'validapse')
            : undefined,
        pse_user: sunatForm.pse_user,
        pse_password: psePasswordInput.trim() || undefined,
        ...(isProduction
          ? {
              gre_client_id: sunatForm.gre_client_id?.trim() || undefined,
              gre_client_secret: greClientSecretInput.trim() || undefined,
            }
          : {}),
      })
      toast.success('Configuración fiscal guardada y sincronizada')
      fetchTenants()
      openSunat(sunatTenant.tenant)
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(errMsg ?? 'Error al guardar')
    } finally {
      setSavingSunat(false)
    }
  }

  const handleTestFiscalConnection = async () => {
    if (!sunatTenant) return
    setTestingConnection(true)
    try {
      const result = await tenantsService.testFiscalConnection(sunatTenant.tenant.id)
      if (result?.success || result?.connection_status === 'connected') {
        toast.success(result?.message ?? 'Conexión fiscal OK')
      } else {
        toast.error(result?.message ?? 'Conexión fiscal fallida')
      }
      const config = await tenantsService.getSunatConfig(sunatTenant.tenant.id)
      setSunatTenant({ tenant: sunatTenant.tenant, config })
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(errMsg ?? 'Error probando conexión')
    } finally {
      setTestingConnection(false)
    }
  }

  /* ─── render ────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Empresas</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de tenants del sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Nueva empresa
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, email, RUC..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Suspendidos</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={regionFilter}
              onChange={(e) => { setRegionFilter(e.target.value); setProvinciaFilter('') }}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
            >
              <option value="">Todos los deptos.</option>
              {regionesFilter.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={provinciaFilter}
              onChange={(e) => setProvinciaFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
              disabled={!regionFilter}
            >
              <option value="">Todas las prov.</option>
              {provinciasFilter.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={fetchTenants}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} />
            Actualizar
          </button>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <p className="text-sm text-slate-500">
            {loading ? 'Cargando...' : `${total} empresa(s) encontrada(s)`}
          </p>
        </CardHeader>
        {loading ? (
          <CardBody className="flex justify-center py-12">
            <Spinner size={32} />
          </CardBody>
        ) : (
          <>
            {tenants.length === 0 ? (
              <CardBody>
                <p className="text-slate-400 text-sm text-center py-8">No se encontraron empresas</p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  {['Empresa', 'Slug', 'Rubro', 'Email', 'RUC', 'Plan', 'Suscripción', 'Modo SUNAT', 'Facturador', 'Estado', 'Acciones'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={resolveTenantUrl(t)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        title={resolveTenantUrl(t)}
                      >
                        {t.slug}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={t.rubro === 'gastronomico' ? 'blue' : 'gray'}>
                        {t.rubro === 'gastronomico' ? 'Gastronómico' : 'General'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.email}</td>
                    <td className="px-4 py-3 text-slate-600">{t.ruc || '—'}</td>
                    <td className="px-4 py-3">
                      {/* plan_name viene resuelto de la suscripción vigente; t.plan es el
                          texto suelto y solo sirve de respaldo. */}
                      <Badge variant="blue">{t.plan_name || t.plan}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <SubscriptionStatusCell sub={subscriptionsByTenantId[t.id]} />
                    </td>
                    <td className="px-4 py-3">
                      <SunatEnvCell tenant={t} onUpdated={() => fetchTenants()} />
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const ruc = (t.ruc || '').trim()
                        const entry = ruc ? facturadorByRuc[ruc] : undefined
                        if (!entry) {
                          return <span className="text-slate-400 text-xs">No registrada</span>
                        }
                        const enabled = entry.enabled !== false
                        return (
                          <button
                            type="button"
                            disabled={togglingRuc === ruc}
                            onClick={() => handleToggleFacturador(t)}
                            title={enabled ? 'Habilitada en el facturador — clic para deshabilitar' : 'Deshabilitada en el facturador — clic para habilitar'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                              enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            {togglingRuc === ruc ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                            {enabled ? 'Habilitada' : 'Deshabilitada'}
                          </button>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ActionMenu
                        items={[
                          {
                            key: 'edit',
                            label: 'Editar',
                            icon: <Edit size={15} className="text-amber-600" />,
                            onClick: () => openEdit(t),
                          },
                          {
                            key: 'master',
                            label: 'Acceso maestro',
                            icon: <LogIn size={15} className="text-indigo-600" />,
                            onClick: () => setMasterAccessTenant(t),
                          },
                          {
                            key: 'toggle',
                            label: t.status === 'active' ? 'Suspender' : 'Activar',
                            icon: (
                              <Power
                                size={15}
                                className={t.status === 'active' ? 'text-red-500' : 'text-emerald-600'}
                              />
                            ),
                            onClick: () => handleToggle(t),
                            tone: t.status === 'active' ? 'danger' : 'success',
                          },
                          {
                            key: 'modules',
                            label: 'Módulos',
                            icon: <Layers size={15} className="text-violet-600" />,
                            onClick: () => openModules(t),
                            disabled: loadingModules,
                          },
                          {
                            key: 'sunat',
                            label: 'SUNAT / Facturador',
                            icon: <Shield size={15} className="text-sky-600" />,
                            onClick: () => openSunat(t),
                            disabled: loadingSunat,
                            hidden: !t.billing_enabled,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
            )}
            <PaginationBar
              page={page}
              perPage={perPage}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              itemLabel="empresas"
            />
          </>
        )}
      </Card>

      {/* ── Modal: Create ─────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva empresa" maxWidth="max-w-2xl">
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="RUC" error={createForm.formState.errors.ruc?.message}>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                <input
                  {...createForm.register('ruc')}
                  placeholder="20123456789"
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={handleConsultaRucCreate}
                  disabled={consultandoRuc === 'create'}
                  className="flex items-center gap-1.5 px-3 py-2 border-l border-slate-200 text-sm text-slate-600 hover:bg-slate-50 bg-slate-50/50 whitespace-nowrap disabled:opacity-60"
                  title="Consultar RUC en SUNAT"
                >
                  <SearchCheck size={16} className={consultandoRuc === 'create' ? 'animate-pulse' : ''} />
                  {consultandoRuc === 'create' ? '...' : 'Consultar'}
                </button>
              </div>
            </FormField>
            <FormField label="Nombre *" error={createForm.formState.errors.name?.message}>
              <input {...createForm.register('name')} placeholder="Mi Empresa S.A.C." className={inputClass} />
            </FormField>
            <FormField
              label="Subdominio *"
              error={createForm.formState.errors.slug?.message}
            >
              <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                <input
                  {...createForm.register('slug', {
                    onChange: e => {
                      const normalized = normalizeSlugInput(e.target.value)
                      if (normalized !== e.target.value) e.target.value = normalized
                      createForm.setValue('slug', normalized, { shouldValidate: true, shouldDirty: true })
                    },
                  })}
                  placeholder="miempresa"
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0 lowercase"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <span className="flex items-center px-3 py-2 text-sm text-slate-500 font-mono bg-slate-50/80 border-l border-slate-200 whitespace-nowrap">
                  .{getRootDomain()}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Se guardará el slug <span className="font-mono text-blue-600">{createForm.watch('slug') || 'subdominio'}</span>
                {' '}y el cliente accederá a:{' '}
                <span className="font-mono text-blue-600">{getTenantHost(createForm.watch('slug') ?? '')}</span>
              </p>
            </FormField>
            <FormField label="Email *" error={createForm.formState.errors.email?.message}>
              <input {...createForm.register('email')} type="email" placeholder="empresa@email.com" className={inputClass} />
            </FormField>
            <FormField label="Teléfono" error={createForm.formState.errors.phone?.message}>
              <input {...createForm.register('phone')} placeholder="+51 999 000 000" className={inputClass} />
            </FormField>
            <FormField label="Plan *" error={createForm.formState.errors.plan?.message}>
              <select {...createForm.register('plan')} className={inputClass}>
                <option value="">Seleccione un plan…</option>
                {saasPlans.map(p => (
                  <option key={p.id} value={p.name.toLowerCase()}>
                    {p.name} — S/ {p.price.toFixed(2)} / {p.billing_cycle === 'yearly' ? 'año' : p.billing_cycle === 'lifetime' ? 'vitalicio' : 'mes'}
                  </option>
                ))}
              </select>
              {saasPlans.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No hay planes activos. Crea uno en la sección Planes antes de dar de alta empresas.
                </p>
              )}
              {createPlanPreview.matched && (
                <p className="text-xs text-slate-500 mt-1">
                  {createPlanPreview.matched.description || 'Plan del catálogo SaaS'}
                  {createPlanPreview.matched.is_unlimited_documents
                    ? ' · Documentos ilimitados'
                    : createPlanPreview.matched.monthly_documents_limit
                      ? ` · ${createPlanPreview.matched.monthly_documents_limit} docs/mes`
                      : ''}
                </p>
              )}
            </FormField>
            <FormField label="Rubro *" error={createForm.formState.errors.rubro?.message}>
              <select {...createForm.register('rubro')} className={inputClass}>
                <option value="general">General (bodegas, comercio, etc.)</option>
                <option value="gastronomico">Gastronómico (restaurantes, bares, cafeterías)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Gastronómico activa el módulo restaurante y crea piso, 10 mesas y empresas de delivery por defecto.
              </p>
            </FormField>
            <FormField label="Régimen tributario *" error={createForm.formState.errors.taxpayer_regime?.message}>
              <select {...createForm.register('taxpayer_regime')} className={inputClass}>
                <option value="general">Régimen General / MYPE (emite Facturas y Boletas)</option>
                <option value="nrus">Nuevo RUS (solo Boletas — no emite Facturas)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Nuevo RUS: la empresa solo podrá emitir Boletas y Notas de Venta; las Facturas quedan bloqueadas.
              </p>
            </FormField>
            <FormField label="Duración suscripción (meses)" error={createForm.formState.errors.subscription_months?.message}>
              {/* Los mismos 4 ciclos fijos del autoservicio del tenant (1/3/6/12 meses) — son
                  los únicos que pueden traer descuento configurado en el plan (ver Planes), así
                  que fuera de estos cuatro no hay nada que aplicar. */}
              <select {...createForm.register('subscription_months', { valueAsNumber: true })} className={inputClass}>
                {[1, 3, 6, 12].map(m => {
                  const plan = saasPlans.find(p => p.name.toLowerCase() === (createPlanValue ?? '').toLowerCase())
                  const cycle = plan?.cycles.find(c => c.months === m && c.enabled)
                  const discountLabel = cycle
                    ? cycle.discount_type === 'percent'
                      ? ` — ${cycle.discount_value}% dto.`
                      : cycle.discount_value > 0
                        ? ` — S/ ${cycle.discount_value.toFixed(2)} dto.`
                        : ''
                    : ''
                  return (
                    <option key={m} value={m}>
                      {m === 1 ? '1 mes' : `${m} meses`}
                      {discountLabel}
                    </option>
                  )
                })}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Se creará la suscripción con el plan elegido y se emitirá su cobro por ese período.
              </p>
            </FormField>
            <FormField
              label="Fecha de inicio de la suscripción (opcional)"
              error={createForm.formState.errors.start_date?.message}
            >
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                {...createForm.register('start_date')}
                className={inputClass}
              />
              <p className="text-xs text-slate-500 mt-1">
                Vacío = arranca hoy. Útil si la empresa se registra hoy pero recién va a operar/pagar
                más adelante. Vigencia: <strong>{createDatesPreview.startLabel}</strong> →{' '}
                <strong>{createDatesPreview.endLabel}</strong>
              </p>
            </FormField>
            {/* El descuento ya no se escribe a mano: sale del ciclo que el plan tiene
                configurado para la duración elegida (mismos 4 ciclos fijos — 1/3/6/12 meses —
                del autoservicio del tenant). Se edita desde Planes, no acá. */}
            <FormField label="Descuento (según el plan)">
              <div
                className={`rounded-lg border px-3 py-2.5 text-sm ${
                  createChargePreview.hasConfiguredCycle
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                {createChargePreview.hasConfiguredCycle ? (
                  <p className="text-emerald-800">
                    {createChargePreview.discountType === 'percent'
                      ? `${createChargePreview.discountValue}% de descuento`
                      : `S/ ${createChargePreview.discountValue.toFixed(2)} de descuento`}{' '}
                    configurado en el plan para {Number(createMonths) || 1} mes(es).
                  </p>
                ) : (
                  <p className="text-slate-500">
                    El plan no tiene un descuento configurado para {Number(createMonths) || 1} mes(es) — se
                    cobra el precio pleno.
                  </p>
                )}
                {createChargePreview.gross > 0 && (
                  <p className="text-xs mt-1.5">
                    Cobro: S/ {createChargePreview.gross.toFixed(2)}
                    {createChargePreview.discount > 0
                      ? ` − S/ ${createChargePreview.discount.toFixed(2)} = `
                      : ' = '}
                    <strong>S/ {createChargePreview.net.toFixed(2)}</strong>
                    {!payNow && <span className="text-slate-400"> · queda pendiente de pago</span>}
                  </p>
                )}
              </div>
            </FormField>

            {/* Cobro en el mismo paso. Opcional a propósito: el alta no depende de esto. */}
            <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={payNow}
                  onChange={e => setPayNow(e.target.checked)}
                />
                <span>
                  <span className="text-sm font-medium text-slate-700">Registrar el pago ahora</span>
                  <span className="block text-xs text-slate-500">
                    Opcional. Si ya te pagó, la empresa nace al día; si no, deja esto sin marcar y el
                    cobro sigue pendiente.
                  </span>
                </span>
              </label>

              {payNow && (
                <div className="space-y-3 pl-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Monto (S/) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className={inputClass}
                        value={payAmount}
                        onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                      />
                      {createChargePreview.net > 0 &&
                        Math.abs(payAmount - createChargePreview.net) > 0.009 && (
                          <p className="text-[11px] text-amber-700 mt-1">
                            El cobro es S/ {createChargePreview.net.toFixed(2)}. Un monto menor será
                            rechazado.
                          </p>
                        )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Método</label>
                      <select
                        className={inputClass}
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value)}
                        disabled={paymentMethods.length === 0}
                      >
                        {paymentMethods.length === 0 ? (
                          <option value="">Sin métodos configurados</option>
                        ) : (
                          paymentMethods.map(m => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))
                        )}
                      </select>
                      {paymentMethods.length === 0 && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          No hay métodos de pago habilitados — configúralos en Configuración SaaS.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Referencia (opcional)
                      </label>
                      <input
                        className={inputClass}
                        placeholder="N.° de operación"
                        value={payReference}
                        onChange={e => setPayReference(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Comprobante del pago (opcional)
                      </label>
                      <div
                        onClick={() => payReceiptRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 rounded-lg p-3 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
                      >
                        <input
                          ref={payReceiptRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,.pdf,.webp"
                          className="hidden"
                          onChange={e => setPayReceipt(e.target.files?.[0] ?? null)}
                        />
                        {payReceipt ? (
                          <div className="flex items-center justify-center gap-2 text-indigo-600 text-xs font-medium">
                            <Upload size={13} /> {payReceipt.name}
                          </div>
                        ) : (
                          <div className="text-slate-500 text-xs flex items-center justify-center gap-1.5">
                            <Upload size={13} /> Clic para subir el voucher/captura del pago
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* El comprobante de acá es lo que el tenant/admin presenta como prueba de
                      pago (voucher, captura de yape, etc.) — la boleta/factura en PDF que se
                      le ENTREGA al tenant por este pago se adjunta después, desde el listado
                      de Pagos («Adjuntar comprobante» sobre el pago ya aprobado). */}
                  <p className="text-[11px] text-slate-400">
                    Después de crear la empresa, no olvides adjuntar la boleta/factura en PDF
                    para el tenant desde <strong>Pagos</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Módulos que se habilitarán al crear
            </p>
            {createPlanPreview.modules.length === 0 ? (
              <p className="text-sm text-slate-500">
                El plan seleccionado no tiene módulos asignados en el catálogo. Revise la configuración en Planes SaaS.
                {createRubroValue === 'gastronomico' && (
                  <span className="block mt-1 text-emerald-700">
                    Rubro gastronómico: se activará igual el módulo <strong>Restaurante</strong>.
                  </span>
                )}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {createPlanPreview.modules.map(m => (
                    <span
                      key={m.key}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700"
                    >
                      <span>{moduleEmoji(m.key)}</span>
                      {m.name}
                    </span>
                  ))}
                </div>
                {createPlanPreview.restaurantExtra && (
                  <p className="text-xs text-emerald-700">
                    Incluye <strong>Restaurante</strong> por rubro gastronómico (además del plan).
                  </p>
                )}
              </>
            )}
          </div>

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">Ubicación *</p>
          <UbigeoSelects
            regionId={createUbigeo.regionId}
            provinciaId={createUbigeo.provinciaId}
            distritoId={createUbigeo.distritoId}
            onChange={(regionId, provinciaId, distritoId) => setCreateUbigeo({ regionId, provinciaId, distritoId })}
            selectClassName={inputClass}
          />
          <FormField label="Dirección *" error={createForm.formState.errors.address?.message}>
            <input {...createForm.register('address')} placeholder="Calle, nro, ref." className={inputClass} />
          </FormField>
          <hr className="border-slate-100" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Credenciales del administrador</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Email admin *" error={createForm.formState.errors.admin_email?.message}>
              <input {...createForm.register('admin_email')} type="email" placeholder="admin@miempresa.com" className={inputClass} />
            </FormField>
            <FormField label="Contraseña *" error={createForm.formState.errors.admin_password?.message}>
              <input {...createForm.register('admin_password')} type="password" placeholder="••••••••" className={inputClass} />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={createForm.formState.isSubmitting} className={btnPrimary}>
              {createForm.formState.isSubmitting ? 'Creando...' : 'Crear empresa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Edit ──────────────────────────────────── */}
      <Modal
        open={!!editTenant}
        onClose={() => setEditTenant(null)}
        title={`Editar: ${editTenant?.name ?? ''}`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="RUC" error={editForm.formState.errors.ruc?.message}>
              <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                <input
                  {...editForm.register('ruc')}
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={handleConsultaRucEdit}
                  disabled={consultandoRuc === 'edit'}
                  className="flex items-center gap-1.5 px-3 py-2 border-l border-slate-200 text-sm text-slate-600 hover:bg-slate-50 bg-slate-50/50 whitespace-nowrap disabled:opacity-60"
                  title="Consultar RUC en SUNAT"
                >
                  <SearchCheck size={16} className={consultandoRuc === 'edit' ? 'animate-pulse' : ''} />
                  {consultandoRuc === 'edit' ? '...' : 'Consultar'}
                </button>
              </div>
            </FormField>
            <FormField label="Nombre *" error={editForm.formState.errors.name?.message}>
              <input {...editForm.register('name')} className={inputClass} />
            </FormField>
            <FormField label="Email *" error={editForm.formState.errors.email?.message}>
              <input {...editForm.register('email')} type="email" className={inputClass} />
            </FormField>
            <FormField label="Teléfono" error={editForm.formState.errors.phone?.message}>
              <input {...editForm.register('phone')} className={inputClass} />
            </FormField>
            <FormField label="Plan *" error={editForm.formState.errors.plan?.message}>
              <select {...editForm.register('plan')} className={inputClass}>
                {/* Vacío solo si el plan guardado no está en el catálogo: obliga a elegir
                    uno válido en vez de guardar en silencio el primero de la lista. */}
                {!editPlanMatched && <option value="">— Seleccione un plan —</option>}
                {saasPlans.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name} — S/ {p.price.toFixed(2)} /{' '}
                    {p.billing_cycle === 'yearly' ? 'año' : p.billing_cycle === 'lifetime' ? 'vitalicio' : 'mes'}
                  </option>
                ))}
              </select>
              {!editPlanMatched && editTenant && (
                <p className="mt-1 text-xs text-amber-600">
                  El plan guardado ({editTenant.plan || 'sin plan'}) no existe en el catálogo. Seleccione uno.
                </p>
              )}
            </FormField>
            <FormField label="Estado *" error={editForm.formState.errors.status?.message}>
              <select {...editForm.register('status')} className={inputClass}>
                <option value="active">Activo</option>
                <option value="inactive">Suspendido</option>
              </select>
            </FormField>
            <FormField label="Régimen tributario *" error={editForm.formState.errors.taxpayer_regime?.message}>
              <select {...editForm.register('taxpayer_regime')} className={inputClass}>
                <option value="general">Régimen General / MYPE (Facturas y Boletas)</option>
                <option value="nrus">Nuevo RUS (solo Boletas)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Al cambiar a Nuevo RUS, la empresa dejará de poder emitir Facturas.
              </p>
            </FormField>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">Ubicación</p>
          <UbigeoSelects
            regionId={editUbigeo.regionId}
            provinciaId={editUbigeo.provinciaId}
            distritoId={editUbigeo.distritoId}
            onChange={(regionId, provinciaId, distritoId) => setEditUbigeo({ regionId, provinciaId, distritoId })}
            selectClassName={inputClass}
          />
          <FormField label="Dirección" error={editForm.formState.errors.address?.message}>
            <input {...editForm.register('address')} placeholder="Calle, nro, ref." className={inputClass} />
          </FormField>
          <div className="mt-6 pt-4 border-t border-red-100">
            <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2">Zona peligrosa</p>
            <p className="text-xs text-slate-600 mb-3">
              Elimina la empresa, su base de datos MySQL y archivos en este servidor. No modifica el facturador Lycet/SUNAT.
            </p>
            <button
              type="button"
              onClick={() => {
                setDestroyTenant(editTenant)
                setDestroyOpsKey('')
                setDestroyConfirmSlug('')
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-800 text-sm font-medium hover:bg-red-50"
            >
              <Trash2 size={16} />
              Eliminar empresa por completo…
            </button>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditTenant(null)} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={editForm.formState.isSubmitting} className={btnPrimary}>
              {editForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Destroy tenant ─────────────────────────── */}
      <Modal
        open={!!destroyTenant}
        onClose={() => !destroying && setDestroyTenant(null)}
        title="Eliminar empresa por completo"
        maxWidth="max-w-lg"
      >
        {destroyTenant && (
          <div className="space-y-4">
            <div className="flex gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm">
              <AlertTriangle className="shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold">Esta acción no se puede deshacer</p>
                <ul className="mt-2 list-disc list-inside text-xs space-y-1">
                  <li>Registro en BD central: <strong>{destroyTenant.name}</strong></li>
                  <li>Base de datos: <strong>{destroyTenant.db_name}</strong></li>
                  <li>Archivos en <code>uploads/tenants/{destroyTenant.ruc || '…'}</code></li>
                  <li>Comprobantes en almacenamiento local del ERP</li>
                  <li>Suscripciones, pagos y cupos de documentos</li>
                </ul>
                <p className="mt-2 text-xs font-medium">El facturador SUNAT/Lycet externo no se modifica.</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600">Clave de operaciones</label>
              <input
                type="password"
                className={inputClass}
                value={destroyOpsKey}
                onChange={e => setDestroyOpsKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600">
                Escriba el slug para confirmar: <strong>{destroyTenant.slug}</strong>
              </label>
              <input
                className={inputClass}
                value={destroyConfirmSlug}
                onChange={e => setDestroyConfirmSlug(e.target.value)}
                placeholder={destroyTenant.slug}
                autoComplete="off"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={destroying}
                onClick={() => setDestroyTenant(null)}
                className={btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  destroying ||
                  !destroyOpsKey ||
                  destroyConfirmSlug.trim().toLowerCase() !== destroyTenant.slug.toLowerCase()
                }
                onClick={async () => {
                  setDestroying(true)
                  try {
                    const res = await tenantsService.destroyComplete(destroyTenant.id, {
                      operations_key: destroyOpsKey,
                      confirm_slug: destroyConfirmSlug.trim(),
                    })
                    const warn =
                      res.result?.file_errors?.length
                        ? ` (${res.result.file_errors.length} advertencia(s) en archivos)`
                        : ''
                    toast.success((res.message ?? 'Empresa eliminada por completo') + warn)
                    setDestroyTenant(null)
                    setDestroyOpsKey('')
                    setDestroyConfirmSlug('')
                    setEditTenant(null)
                    await fetchTenants()
                  } catch (e: unknown) {
                    const err = e as { response?: { data?: { error?: string }; message?: string } }
                    toast.error(
                      err.response?.data?.error ??
                        (e instanceof Error ? e.message : undefined) ??
                        'No se pudo eliminar',
                    )
                  } finally {
                    setDestroying(false)
                  }
                }}
                className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {destroying ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Modules ───────────────────────────────── */}
      <Modal
        open={!!moduleTenant}
        onClose={() => setModuleTenant(null)}
        title={`Módulos: ${moduleTenant?.tenant.name ?? ''}`}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <p className="text-xs text-blue-700">
              Plan actual: <strong className="font-semibold">{moduleTenant?.tenant.plan}</strong>
              {' · '}Los interruptores habilitan <strong>módulos dentro del ERP</strong> del cliente (próximo login).
              {' '}El cobro del <strong>plan Tukifac</strong> del tenant se gestiona en Suscripciones y Pagos, no aquí.
            </p>
            <button
              onClick={() => moduleTenant && openModules(moduleTenant.tenant)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap ml-2"
            >
              Recargar
            </button>
          </div>
          <div className="space-y-1.5">
            {moduleCatalog.map((m) => {
              const enabled = isModuleEnabled(m.key)
              const source = moduleSource(m.key)
              return (
                <div
                  key={m.key}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{moduleEmoji(m.key)}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                        {m.name}
                        {enabled && source === 'manual' && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Cortesía</span>
                        )}
                        {enabled && source === 'plan' && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Del plan</span>
                        )}
                        {!m.implemented && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">No implementado</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{m.key}</p>
                      {m.description ? (
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleModule(m.key, !enabled)}
                    className={`relative inline-flex rounded-full transition-colors flex-shrink-0 ${
                      enabled ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                    style={{ height: '22px', width: '40px' }}
                  >
                    <span
                      className={`absolute top-0.5 bg-white rounded-full shadow transition-transform ${
                        enabled ? 'translate-x-[19px]' : 'translate-x-0.5'
                      }`}
                      style={{ width: '18px', height: '18px' }}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </Modal>

      {/* ── Modal: Configuración Fiscal ───────────────────────── */}
      <Modal
        open={!!sunatTenant}
        onClose={() => setSunatTenant(null)}
        title={`Configuración Fiscal: ${sunatTenant?.tenant.name ?? ''}`}
        maxWidth="max-w-lg"
      >
        {loadingSunat ? (
          <div className="flex justify-center py-8">
            <Spinner size={28} />
          </div>
        ) : sunatTenant ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 flex flex-wrap items-center gap-2 justify-between">
              <span>
                RUC: <span className="font-mono font-medium">{sunatTenant.config.ruc ?? '—'}</span>
                {' · '}
                {sunatTenant.config.business_name ?? '—'}
              </span>
              {sunatTenant.config.connection_status ? (
                <Badge variant={sunatTenant.config.connection_status === 'connected' ? 'green' : 'yellow'}>
                  {sunatTenant.config.connection_status}
                </Badge>
              ) : null}
              {sunatForm.send_mode !== 'pse' ? (
                <>
                  {sunatTenant.config.sol_configured ? (
                    <Badge variant="green">SOL OK</Badge>
                  ) : (
                    <Badge variant="yellow">SOL pendiente</Badge>
                  )}
                  {sunatTenant.config.certificate_configured ? (
                    <Badge variant="green">Certificado OK</Badge>
                  ) : (
                    <Badge variant="yellow">Certificado pendiente</Badge>
                  )}
                  {sunatTenant.config.logo_configured ? (
                    <Badge variant="green">Logo OK</Badge>
                  ) : null}
                </>
              ) : null}
            </div>
            {(() => {
              const ruc = (sunatTenant.config.ruc || sunatTenant.tenant.ruc || '').trim()
              const entry = ruc ? facturadorByRuc[ruc] : undefined
              const enabled = entry ? entry.enabled !== false : null
              return (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-medium text-slate-700">Habilitado en facturador (Lycet)</p>
                    <p className="text-xs text-slate-500">
                      {entry
                        ? enabled
                          ? 'La empresa puede emitir a SUNAT/PSE.'
                          : 'Deshabilitada: los envíos se rechazan como "Empresa fiscal deshabilitada". Habilítala para emitir.'
                        : 'La empresa aún no está registrada en el facturador. Usa "Sincronizar con facturador".'}
                    </p>
                  </div>
                  {entry ? (
                    <button
                      type="button"
                      disabled={togglingRuc === ruc}
                      onClick={() => handleToggleFacturador(sunatTenant.tenant)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex-shrink-0 ${
                        enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {togglingRuc === ruc ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                      {enabled ? 'Habilitada' : 'Deshabilitada'}
                    </button>
                  ) : (
                    <Badge variant="gray">No registrada</Badge>
                  )}
                </div>
              )
            })()}
            {(sunatTenant.config.certificate_file || sunatTenant.config.logo_file) && sunatForm.send_mode !== 'pse' ? (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 space-y-1">
                {sunatTenant.config.certificate_file ? (
                  <p>
                    Certificado registrado:{' '}
                    <span className="font-mono text-slate-800">{sunatTenant.config.certificate_file}</span>
                  </p>
                ) : null}
                {sunatTenant.config.logo_file ? (
                  <p>
                    Logo registrado:{' '}
                    <span className="font-mono text-slate-800">{sunatTenant.config.logo_file}</span>
                  </p>
                ) : null}
                <p className="text-slate-500">Suba un archivo nuevo solo si desea reemplazarlo.</p>
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Modo de emisión">
                <select
                  value={sunatForm.send_mode ?? 'sunat_direct'}
                  onChange={(e) => {
                    const v = e.target.value as 'sunat_direct' | 'pse'
                    setSunatForm((f) => ({
                      ...f,
                      send_mode: v,
                      fiscal_provider: v === 'pse' ? 'validapse' : 'sunat',
                      pse_provider: v === 'pse' ? 'validapse' : undefined,
                    }))
                  }}
                  className={inputClass}
                >
                  <option value="sunat_direct">SUNAT Directa</option>
                  <option value="pse">PSE</option>
                </select>
              </FormField>
              {sunatForm.send_mode === 'pse' ? (
                <>
                  <FormField label="Proveedor PSE">
                    <select
                      value={sunatForm.fiscal_provider ?? sunatForm.pse_provider ?? 'validapse'}
                      onChange={(e) =>
                        setSunatForm((f) => ({
                          ...f,
                          fiscal_provider: e.target.value,
                          pse_provider: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="validapse">ValidaPSE</option>
                    </select>
                  </FormField>
                  <FormField label="Usuario PSE">
                    <input
                      value={sunatForm.pse_user ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, pse_user: e.target.value }))}
                      placeholder="Usuario de credenciales ValidaPSE"
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Contraseña / Token de acceso">
                    <input
                      type="password"
                      value={psePasswordInput}
                      onChange={(e) => setPsePasswordInput(e.target.value)}
                      placeholder={
                        sunatTenant.config.pse_token_configured
                          ? 'Configurado en facturador (vacío = no cambiar)'
                          : 'Token de acceso de ValidaPSE'
                      }
                      className={inputClass}
                    />
                  </FormField>
                  <div className="col-span-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-600 space-y-1">
                    <p>
                      ValidaPSE autentica con <span className="font-mono">Authorization: Bearer TOKEN</span>.
                      La contraseña del panel es el token de acceso; el usuario se guarda para referencia.
                    </p>
                    <p>
                      La URL del API (<span className="font-mono">app.validapse.com</span>) se configura automáticamente.
                    </p>
                  </div>
                </>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between col-span-full">
                <label className="text-sm font-medium text-slate-700">Facturación electrónica habilitada</label>
                <button
                  type="button"
                  onClick={() => setSunatForm((f) => ({ ...f, sunat_enabled: !f.sunat_enabled }))}
                  className={`relative inline-flex rounded-full transition-colors flex-shrink-0 ${sunatForm.sunat_enabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                  style={{ height: '22px', width: '40px' }}
                >
                  <span
                    className={`absolute top-0.5 bg-white rounded-full shadow transition-transform ${sunatForm.sunat_enabled ? 'translate-x-[19px]' : 'translate-x-0.5'}`}
                    style={{ width: '18px', height: '18px' }}
                  />
                </button>
              </div>
              <FormField label="Ambiente SUNAT">
                {normalizeSunatEnvMode(sunatTenant.config.sunat_env_mode) === 'production' ? (
                  <div className={`${inputClass} bg-slate-50 text-emerald-700 font-medium`}>Producción (bloqueado)</div>
                ) : (
                  <select
                    value={normalizeSunatEnvMode(sunatForm.sunat_env_mode)}
                    onChange={(e) =>
                      setSunatForm((f) => ({
                        ...f,
                        sunat_env_mode: e.target.value as 'demo' | 'production',
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="demo">Pruebas</option>
                    <option value="production">Producción</option>
                  </select>
                )}
              </FormField>
              {normalizeSunatEnvMode(sunatForm.sunat_env_mode) === 'production' ? (
                <>
                  <FormField label="Client ID SUNAT API">
                    <input
                      value={sunatForm.gre_client_id ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, gre_client_id: e.target.value }))}
                      placeholder={
                        sunatTenant.config.gre_client_configured
                          ? sunatTenant.config.gre_client_id ?? 'Configurado en facturador'
                          : 'OAuth Client ID SUNAT API'
                      }
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Client Secret SUNAT API">
                    <input
                      type="password"
                      value={greClientSecretInput}
                      onChange={(e) => setGreClientSecretInput(e.target.value)}
                      placeholder={
                        sunatTenant.config.gre_client_configured
                          ? 'Configurado en facturador (vacío = no cambiar)'
                          : 'OAuth Client Secret SUNAT API'
                      }
                      className={inputClass}
                    />
                  </FormField>
                </>
              ) : null}
              {sunatForm.send_mode !== 'pse' ? (
                <>
                  <FormField label="Usuario SOL">
                    <input
                      value={sunatForm.sunat_sol_user ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, sunat_sol_user: e.target.value }))}
                      placeholder={sunatTenant.config.ruc ? `${sunatTenant.config.ruc}MODDATOS` : 'RUCMODDATOS'}
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Clave SOL (opcional, dejar vacío para no cambiar)">
                    <input
                      type="password"
                      value={sunatForm.sunat_sol_pass ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, sunat_sol_pass: e.target.value }))}
                      placeholder={
                        sunatTenant.config.sol_configured
                          ? 'Configurado en facturador (vacío = no cambiar)'
                          : '••••••••'
                      }
                      className={inputClass}
                    />
                  </FormField>
                </>
              ) : null}
              {sunatForm.send_mode === 'pse' ? (
                <>
                  <div className="col-span-full bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800">
                    Credenciales SOL <span className="font-medium">opcionales</span>: habilitan validar el
                    comprobante directamente en SUNAT cuando el PSE no responde. No reemplazan las credenciales del PSE.
                  </div>
                  <FormField label="Usuario SOL (opcional)">
                    <input
                      value={sunatForm.sunat_sol_user ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, sunat_sol_user: e.target.value }))}
                      placeholder={sunatTenant.config.ruc ? `${sunatTenant.config.ruc}MODDATOS` : 'RUCMODDATOS'}
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Clave SOL (opcional)">
                    <input
                      type="password"
                      value={sunatForm.sunat_sol_pass ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, sunat_sol_pass: e.target.value }))}
                      placeholder={
                        sunatTenant.config.sol_configured
                          ? 'Configurado en facturador (vacío = no cambiar)'
                          : 'Solo si desea validar en SUNAT'
                      }
                      className={inputClass}
                    />
                  </FormField>
                </>
              ) : null}
              <FormField label="Tasa IGV (%)">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={sunatForm.tax_rate ?? 18}
                  onChange={(e) => setSunatForm((f) => ({ ...f, tax_rate: Number(e.target.value) }))}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Régimen IGV">
                <select
                  value={sunatForm.igv_regime ?? 'standard'}
                  onChange={(e) => setSunatForm((f) => ({ ...f, igv_regime: e.target.value }))}
                  className={inputClass}
                >
                  <option value="standard">General</option>
                  <option value="simplified">Simplificado</option>
                  <option value="exempt">Exonerado</option>
                </select>
              </FormField>
              <div className="flex items-center justify-between col-span-full">
                <label className="text-sm font-medium text-slate-700">Zona de beneficio tributario</label>
                <button
                  type="button"
                  onClick={() => setSunatForm((f) => ({ ...f, tax_benefit_zone: !f.tax_benefit_zone }))}
                  className={`relative inline-flex rounded-full transition-colors flex-shrink-0 ${sunatForm.tax_benefit_zone ? 'bg-blue-600' : 'bg-slate-200'}`}
                  style={{ height: '22px', width: '40px' }}
                >
                  <span
                    className={`absolute top-0.5 bg-white rounded-full shadow transition-transform ${sunatForm.tax_benefit_zone ? 'translate-x-[19px]' : 'translate-x-0.5'}`}
                    style={{ width: '18px', height: '18px' }}
                  />
                </button>
              </div>
            </div>
            {sunatForm.send_mode !== 'pse' ? (
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cert-input-mode"
                      checked={certInputMode === 'pfx'}
                      onChange={() => switchCertInputMode('pfx')}
                      className="text-blue-600"
                    />
                    Certificado PFX
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cert-input-mode"
                      checked={certInputMode === 'pem'}
                      onChange={() => switchCertInputMode('pem')}
                      className="text-blue-600"
                    />
                    Archivos PEM
                  </label>
                </div>
                <div className="flex flex-wrap gap-4">
                  {certInputMode === 'pfx' ? (
                    <>
                      <FormField label="Certificado .pfx / .p12">
                    <input
                      type="file"
                      accept=".pfx,.p12"
                      className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          setSyncPfxBase64(await fileToBase64Binary(f))
                        } catch {
                          toast.error('No se pudo leer el archivo PFX')
                        }
                      }}
                    />
                    {syncPfxBase64 && <span className="text-xs text-emerald-600 ml-1">✓</span>}
                  </FormField>
                  <FormField label="Contraseña PFX (solo si reemplaza certificado)">
                    <input
                      type="password"
                      value={certPasswordInput}
                      onChange={(e) => setCertPasswordInput(e.target.value)}
                      placeholder={
                        sunatTenant.config.certificate_configured
                          ? 'Vacío = no cambiar certificado'
                          : 'Contraseña del archivo PFX'
                      }
                      className={inputClass}
                    />
                  </FormField>
                    </>
                  ) : (
                    <>
                  <FormField label="Clave privada .pem (opcional si sube PEM combinado)">
                    <input
                      type="file"
                      accept=".pem"
                      className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          setSyncPrivateKeyBase64(await fileToBase64Text(f))
                        } catch {
                          toast.error('No se pudo leer la clave privada')
                        }
                      }}
                    />
                    {syncPrivateKeyBase64 && <span className="text-xs text-emerald-600 ml-1">✓</span>}
                  </FormField>
                  <FormField label="Certificado .pem (combinado o solo certificado)">
                    <input
                      type="file"
                      accept=".pem"
                      className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          setSyncCertBase64(await fileToBase64Text(f))
                        } catch {
                          toast.error('No se pudo leer el certificado PEM')
                        }
                      }}
                    />
                    {syncCertBase64 && <span className="text-xs text-emerald-600 ml-1">✓</span>}
                  </FormField>
                    </>
                  )}
                </div>
              </div>
            ) : null}
            <div className="pt-3 border-t border-slate-100">
              <FormField label="Logo .png (para PDF)">
                <input
                  type="file"
                  accept=".png,image/png"
                  className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const r = new FileReader()
                    r.onload = () => {
                      const s = (r.result as string) || ''
                      if (s.includes(',')) setSyncLogoBase64(s.split(',')[1])
                    }
                    r.readAsDataURL(f)
                  }}
                />
                {syncLogoBase64 && <span className="text-xs text-emerald-600 ml-1">✓ Listo</span>}
                {sunatTenant.config.logo_file ? (
                  <p className="text-xs text-slate-500 mt-1">
                    Actual: <span className="font-mono">{sunatTenant.config.logo_file}</span>
                  </p>
                ) : null}
              </FormField>
            </div>
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleTestFiscalConnection}
                disabled={testingConnection || savingSunat}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {testingConnection ? 'Probando...' : 'Probar conexión'}
              </button>
              <button
                type="button"
                onClick={handleSaveSunat}
                disabled={savingSunat}
                className={btnPrimary}
              >
                {savingSunat ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── Modal: Acceso maestro ─────────────────────────── */}
      <Modal
        open={!!masterAccessTenant}
        onClose={() => !masterAccessLoading && setMasterAccessTenant(null)}
        title="Acceso maestro"
        maxWidth="max-w-md"
      >
        {masterAccessTenant && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              Ingresarás como el administrador principal del tenant{' '}
              <strong className="text-slate-800">{masterAccessTenant.name}</strong>.
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Todas las acciones quedarán registradas.
            </p>
            <p className="text-sm font-medium text-slate-700">¿Deseas continuar?</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMasterAccessTenant(null)}
                disabled={masterAccessLoading}
                className={btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmMasterAccess}
                disabled={masterAccessLoading}
                className={btnPrimary}
              >
                {masterAccessLoading ? 'Generando acceso...' : 'Continuar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ─── sub-components ─────────────────────────────────── */
function FormField({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const btnPrimary =
  'px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors'
const btnSecondary =
  'px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors'
