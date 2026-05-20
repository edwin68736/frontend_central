import { useEffect, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Plus, Search, RefreshCw, Edit, Power, Layers, ChevronDown, Shield, SearchCheck,
} from 'lucide-react'
import {
  tenantsService,
  Tenant,
  TenantModule,
  CreateTenantInput,
  UpdateTenantInput,
  ALL_MODULES,
  type SunatConfigResponse,
  type SunatConfigUpdate,
} from '@/services/tenants.service'
import { consultaService } from '@/services/consulta.service'
import { getTenantUrl } from '@/utils/tenantUrl'
import { ubigeoService } from '@/services/ubigeo.service'
import { UbigeoSelects, ubigeoToIds } from '@/components/UbigeoSelects'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'

/* ─── helpers ─────────────────────────────────────────────── */
const statusVariant = (s: string) =>
  s === 'active' ? 'green' : s === 'inactive' ? 'red' : 'yellow'
const statusLabel = (s: string) =>
  s === 'active' ? 'Activo' : s === 'inactive' ? 'Suspendido' : s

const isProduction = (mode?: string) =>
  (mode ?? '').toLowerCase() === 'production'

function SunatEnvCell({ tenant, onUpdated }: { tenant: Tenant; onUpdated: () => void }) {
  const [updating, setUpdating] = useState(false)
  const mode = tenant.sunat_env_mode ?? 'demo'
  const prod = isProduction(mode)

  const toggle = async () => {
    setUpdating(true)
    try {
      await tenantsService.setSunatEnv(tenant.id, prod ? 'beta' : 'production')
      toast.success(prod ? 'Cambiado a modo Pruebas' : 'Cambiado a modo Producción')
      onUpdated()
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al cambiar modo')
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
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium ${prod ? 'text-emerald-600' : 'text-amber-600'}`}>
        {prod ? 'Producción' : 'Pruebas'}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={updating}
        className="text-xs px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
        title={prod ? 'Cambiar a Pruebas' : 'Cambiar a Producción'}
      >
        {updating ? '...' : prod ? '→ Pruebas' : '→ Prod'}
      </button>
    </div>
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
  plan: z.enum(['trial', 'basic', 'pro']),
  admin_email: z.string().email('Email inválido'),
  admin_password: z.string().min(6, 'Mínimo 6 caracteres'),
  address: z.string().optional(),
  ubigeo: z.string().optional(),
  subscription_months: z.number().min(0).max(120).optional(),
})

const editSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  ruc: z.string().optional(),
  plan: z.enum(['trial', 'basic', 'pro']),
  status: z.enum(['active', 'inactive', 'trial']),
  address: z.string().optional(),
  ubigeo: z.string().optional(),
})

type CreateForm = z.infer<typeof createSchema>
type EditForm = z.infer<typeof editSchema>

/* ─── component ────────────────────────────────────────────── */
export default function TenantsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [provinciaFilter, setProvinciaFilter] = useState('')
  const [regionesFilter, setRegionesFilter] = useState<{ id: string; nombre: string }[]>([])
  const [provinciasFilter, setProvinciasFilter] = useState<{ id: string; nombre: string }[]>([])

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)
  const [moduleTenant, setModuleTenant] = useState<{ tenant: Tenant; modules: TenantModule[] } | null>(null)
  const [loadingModules, setLoadingModules] = useState(false)
  const [migratingId, setMigratingId] = useState<number | null>(null)
  const [migratingAll, setMigratingAll] = useState(false)
  const [sunatTenant, setSunatTenant] = useState<{ tenant: Tenant; config: SunatConfigResponse } | null>(null)
  const [loadingSunat, setLoadingSunat] = useState(false)
  const [savingSunat, setSavingSunat] = useState(false)
  const [sunatForm, setSunatForm] = useState<SunatConfigUpdate & { sunat_sol_pass?: string }>({ sunat_enabled: false })
  const [pseTokenInput, setPseTokenInput] = useState('')
  const [syncingPSE, setSyncingPSE] = useState(false)
  const [syncCertBase64, setSyncCertBase64] = useState<string>('')
  const [syncPrivateKeyBase64, setSyncPrivateKeyBase64] = useState<string>('')
  const [syncLogoBase64, setSyncLogoBase64] = useState<string>('')
  const [consultandoRuc, setConsultandoRuc] = useState<'create' | 'edit' | null>(null)

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    try {
      const data = await tenantsService.list(search, statusFilter, regionFilter, provinciaFilter)
      setTenants(data)
    } catch {
      toast.error('Error cargando empresas')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, regionFilter, provinciaFilter])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  useEffect(() => {
    ubigeoService.getRegiones().then(setRegionesFilter)
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
    if (!openSunatId || tenants.length === 0) return
    const tenant = tenants.find((t) => t.id === openSunatId)
    if (tenant) {
      openSunat(tenant)
      navigate('/tenants', { replace: true, state: {} })
    }
  }, [openSunatId, tenants])

  /* ── Create form ─────────────── */
  const [createUbigeo, setCreateUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { plan: 'trial', subscription_months: 1 },
  })

  const onCreateSubmit = async (data: CreateForm) => {
    try {
      await tenantsService.create({
        ...(data as CreateTenantInput),
        address: data.address ?? '',
        ubigeo: createUbigeo.distritoId || undefined,
        subscription_months: (() => {
          const m = Number((data as CreateForm & { subscription_months?: number }).subscription_months)
          return Number.isFinite(m) ? m : 1
        })(),
      })
      toast.success('Empresa creada correctamente')
      setShowCreate(false)
      createForm.reset()
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
  const [editUbigeo, setEditUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })

  const openEdit = (t: Tenant) => {
    setEditTenant(t)
    const ids = ubigeoToIds(t.ubigeo ?? '')
    editForm.reset({
      name: t.name,
      email: t.email,
      phone: t.phone,
      ruc: t.ruc,
      plan: t.plan as EditForm['plan'],
      status: t.status as EditForm['status'],
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

  /* ── Migrations ──────────────── */
  const handleMigrate = async (t: Tenant) => {
    try {
      setMigratingId(t.id)
      await tenantsService.migrate(t.id)
      toast.success(`Migraciones ejecutadas para ${t.name}`)
    } catch {
      toast.error('Error ejecutando migraciones para esta empresa')
    } finally {
      setMigratingId(null)
    }
  }

  const handleMigrateAll = async () => {
    try {
      setMigratingAll(true)
      await tenantsService.migrateAll()
      toast.success('Migraciones ejecutadas para todos los tenants')
    } catch {
      toast.error('Error ejecutando migraciones masivas')
    } finally {
      setMigratingAll(false)
    }
  }

  /* ── Modules ─────────────────── */
  const openModules = async (t: Tenant) => {
    setLoadingModules(true)
    try {
      const mods = await tenantsService.getModules(t.id)
      // Completar con todos los módulos conocidos (los que no existen en BD = disabled)
      const existing = new Map(mods.map(m => [m.module_key, m]))
      const full: TenantModule[] = ALL_MODULES.map(m =>
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

  /* ── SUNAT / Facturador ───────────────────────────── */
  const openSunat = async (t: Tenant) => {
    setLoadingSunat(true)
    setSyncCertBase64('')
    setSyncPrivateKeyBase64('')
    setSyncLogoBase64('')
    setPseTokenInput('')
    try {
      const config = await tenantsService.getSunatConfig(t.id)
      setSunatTenant({ tenant: t, config })
      setSunatForm({
        sunat_enabled: config.sunat_enabled,
        sunat_sol_user: config.sunat_sol_user ?? '',
        sunat_env_mode: config.sunat_env_mode ?? 'beta',
        tax_rate: config.tax_rate ?? 18,
        igv_regime: config.igv_regime ?? 'standard',
        tax_benefit_zone: config.tax_benefit_zone ?? false,
        invoicing_mode: config.invoicing_mode ?? 'legacy_backend',
        pse_provider: config.pse_provider ?? 'validapse',
        pse_base_url: config.pse_base_url ?? '',
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
      const mode = (sunatForm.invoicing_mode ?? 'legacy_backend').toString()
      if (mode === 'pse') {
        const base = (sunatForm.pse_base_url ?? '').trim()
        const tokenConfigured = !!sunatTenant.config.pse_token_configured
        const tokenOk = pseTokenInput.trim() !== '' || tokenConfigured
        if (!base) {
          toast.error('Ingrese la URL base del PSE para activar el modo PSE')
          setSavingSunat(false)
          return
        }
        if (!tokenOk) {
          toast.error('Ingrese el token del PSE para activar el modo PSE')
          setSavingSunat(false)
          return
        }
      }
      await tenantsService.updateSunatConfig(sunatTenant.tenant.id, {
        sunat_enabled: sunatForm.sunat_enabled,
        sunat_sol_user: sunatForm.sunat_sol_user,
        sunat_sol_pass: sunatForm.sunat_sol_pass,
        sunat_env_mode: sunatForm.sunat_env_mode,
        tax_rate: sunatForm.tax_rate,
        igv_regime: sunatForm.igv_regime,
        tax_benefit_zone: sunatForm.tax_benefit_zone,
        invoicing_mode: sunatForm.invoicing_mode,
        pse_provider: sunatForm.pse_provider,
        pse_base_url: sunatForm.pse_base_url,
        pse_token: pseTokenInput.trim() ? pseTokenInput.trim() : undefined,
      })
      if (mode !== 'pse') {
        const body: { certificate_base64?: string; private_key_base64?: string; logo_base64?: string; sol_user?: string; sol_pass?: string } = {}
        if (syncCertBase64) body.certificate_base64 = syncCertBase64
        if (syncPrivateKeyBase64) body.private_key_base64 = syncPrivateKeyBase64
        if (syncLogoBase64) body.logo_base64 = syncLogoBase64
        if (sunatForm.sunat_sol_user) body.sol_user = sunatForm.sunat_sol_user
        if (sunatForm.sunat_sol_pass) body.sol_pass = sunatForm.sunat_sol_pass
        await tenantsService.syncFacturador(sunatTenant.tenant.id, Object.keys(body).length ? body : undefined)
        toast.success('Datos guardados y sincronizados con el facturador')
      } else {
        toast.success('Datos guardados (modo PSE)')
      }
      fetchTenants()
      openSunat(sunatTenant.tenant)
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(errMsg ?? 'Error al guardar')
    } finally {
      setSavingSunat(false)
    }
  }

  const handleSyncPSE = async () => {
    if (!sunatTenant) return
    setSyncingPSE(true)
    try {
      await tenantsService.syncPSECredentials(sunatTenant.tenant.id)
      setPseTokenInput('')
      toast.success('Credenciales PSE sincronizadas')
      openSunat(sunatTenant.tenant)
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(errMsg ?? 'No se pudo sincronizar credenciales PSE')
    } finally {
      setSyncingPSE(false)
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
            onClick={handleMigrateAll}
            disabled={migratingAll}
            className="flex items-center gap-2 px-3 py-2 border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={migratingAll ? 'animate-spin' : ''} />
            {migratingAll ? 'Migrando todos...' : 'Migrar todos los tenants'}
          </button>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
            {loading ? 'Cargando...' : `${tenants.length} empresa(s) encontrada(s)`}
          </p>
        </CardHeader>
        {loading ? (
          <CardBody className="flex justify-center py-12">
            <Spinner size={32} />
          </CardBody>
        ) : tenants.length === 0 ? (
          <CardBody>
            <p className="text-slate-400 text-sm text-center py-8">No se encontraron empresas</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  {['Empresa', 'Slug', 'Email', 'RUC', 'Plan', 'Modo SUNAT', 'Estado', 'Acciones'].map((h) => (
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
                        href={getTenantUrl(t.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        title={getTenantUrl(t.slug)}
                      >
                        {t.slug}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.email}</td>
                    <td className="px-4 py-3 text-slate-600">{t.ruc || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="blue">{t.plan}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <SunatEnvCell tenant={t} onUpdated={() => fetchTenants()} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(t)}
                          title="Editar"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => handleToggle(t)}
                          title={t.status === 'active' ? 'Suspender' : 'Activar'}
                          className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${
                            t.status === 'active'
                              ? 'text-slate-500 hover:text-red-500'
                              : 'text-slate-500 hover:text-emerald-600'
                          }`}
                        >
                          <Power size={15} />
                        </button>
                        <button
                          onClick={() => handleMigrate(t)}
                          title="Ejecutar migraciones"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-colors disabled:opacity-50"
                          disabled={migratingId === t.id}
                        >
                          <RefreshCw size={15} className={migratingId === t.id ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => openModules(t)}
                          title="Módulos"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-violet-600 transition-colors"
                          disabled={loadingModules}
                        >
                          <Layers size={15} />
                        </button>
                        {t.billing_enabled && (
                          <button
                            onClick={() => openSunat(t)}
                            title="SUNAT / Facturador"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-emerald-600 transition-colors"
                            disabled={loadingSunat}
                          >
                            <Shield size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  {...createForm.register('slug')}
                  placeholder="miempresa"
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0"
                  autoComplete="off"
                />
                <span className="flex items-center px-3 py-2 text-sm text-slate-500 font-mono bg-slate-50/80 border-l border-slate-200 whitespace-nowrap">
                  .app.tukifac.cloud
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                El tenant accederá a: <span className="font-mono text-slate-600">{createForm.watch('slug') || 'subdominio'}.app.tukifac.cloud</span>
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
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
              </select>
            </FormField>
            <FormField label="Duración suscripción (meses)" error={createForm.formState.errors.subscription_months?.message}>
              <input
                type="number"
                min={0}
                max={120}
                {...createForm.register('subscription_months', { valueAsNumber: true })}
                className={inputClass}
                placeholder="1"
              />
              <p className="text-xs text-slate-500 mt-1">
                Se creará una suscripción con el plan elegido. 0 = no crear suscripción (solo empresa).
              </p>
            </FormField>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">Ubicación</p>
          <UbigeoSelects
            regionId={createUbigeo.regionId}
            provinciaId={createUbigeo.provinciaId}
            distritoId={createUbigeo.distritoId}
            onChange={(regionId, provinciaId, distritoId) => setCreateUbigeo({ regionId, provinciaId, distritoId })}
            selectClassName={inputClass}
          />
          <FormField label="Dirección" error={createForm.formState.errors.address?.message}>
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
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
              </select>
            </FormField>
            <FormField label="Estado *" error={editForm.formState.errors.status?.message}>
              <select {...editForm.register('status')} className={inputClass}>
                <option value="active">Activo</option>
                <option value="inactive">Suspendido</option>
              </select>
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditTenant(null)} className={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={editForm.formState.isSubmitting} className={btnPrimary}>
              {editForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
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
            {ALL_MODULES.map((m) => {
              const enabled = isModuleEnabled(m.key)
              return (
                <div
                  key={m.key}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{m.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{m.key}</p>
                      {m.centralNote ? (
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.centralNote}</p>
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

      {/* ── Modal: SUNAT / Facturador ───────────────────────── */}
      <Modal
        open={!!sunatTenant}
        onClose={() => setSunatTenant(null)}
        title={`SUNAT / Facturador: ${sunatTenant?.tenant.name ?? ''}`}
        maxWidth="max-w-lg"
      >
        {loadingSunat ? (
          <div className="flex justify-center py-8">
            <Spinner size={28} />
          </div>
        ) : sunatTenant ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
              RUC: <span className="font-mono font-medium">{sunatTenant.config.ruc ?? '—'}</span>
              {' · '}
              Razón social: {sunatTenant.config.business_name ?? '—'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Proveedor de emisión">
                <select
                  value={(sunatForm.invoicing_mode ?? 'legacy_backend').toString()}
                  onChange={(e) => setSunatForm((f) => ({ ...f, invoicing_mode: e.target.value }))}
                  className={inputClass}
                >
                  <option value="legacy_backend">Actual (legacy / facturador)</option>
                  <option value="pse">PSE (ValidaPSE)</option>
                </select>
              </FormField>
              {(sunatForm.invoicing_mode ?? 'legacy_backend') === 'pse' ? (
                <>
                  <FormField label="PSE Provider">
                    <input
                      value={sunatForm.pse_provider ?? 'validapse'}
                      onChange={(e) => setSunatForm((f) => ({ ...f, pse_provider: e.target.value }))}
                      placeholder="validapse"
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="PSE Base URL">
                    <input
                      value={sunatForm.pse_base_url ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, pse_base_url: e.target.value }))}
                      placeholder="https://tu-pse.com"
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="PSE Token">
                    <input
                      type="password"
                      value={pseTokenInput}
                      onChange={(e) => setPseTokenInput(e.target.value)}
                      placeholder={sunatTenant.config.pse_token_configured ? 'Configurado (dejar vacío para no cambiar)' : 'Ingrese token'}
                      className={inputClass}
                    />
                  </FormField>
                  <div className="col-span-full flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-600">
                      En modo PSE no se requiere SOL, certificado ni logo del facturador.
                    </p>
                    <button
                      type="button"
                      onClick={handleSyncPSE}
                      disabled={syncingPSE}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60"
                    >
                      {syncingPSE ? 'Sincronizando...' : 'Sincronizar credenciales PSE'}
                    </button>
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
                <select
                  value={sunatForm.sunat_env_mode ?? 'beta'}
                  onChange={(e) => setSunatForm((f) => ({ ...f, sunat_env_mode: e.target.value }))}
                  className={inputClass}
                >
                  <option value="beta">Beta / Pruebas</option>
                  <option value="demo">Demo</option>
                  <option value="production">Producción</option>
                </select>
              </FormField>
              {(sunatForm.invoicing_mode ?? 'legacy_backend') !== 'pse' ? (
                <>
                  <FormField label="Usuario SOL">
                    <input
                      value={sunatForm.sunat_sol_user ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, sunat_sol_user: e.target.value }))}
                      placeholder="MODDATOS o RUC"
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Clave SOL (opcional, dejar vacío para no cambiar)">
                    <input
                      type="password"
                      value={sunatForm.sunat_sol_pass ?? ''}
                      onChange={(e) => setSunatForm((f) => ({ ...f, sunat_sol_pass: e.target.value }))}
                      placeholder="••••••••"
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
            {(sunatForm.invoicing_mode ?? 'legacy_backend') !== 'pse' ? (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-600">Enviar al facturador al sincronizar (opcional)</p>
                <p className="text-xs text-slate-500">Lycet necesita un único PEM: primero clave privada, luego certificado. Puedes subir ambos por separado y este backend los combina.</p>
                <div className="flex flex-wrap gap-4">
                  <FormField label="Clave privada .pem">
                    <input
                      type="file"
                      accept=".pem"
                      className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        const r = new FileReader()
                        r.onload = () => setSyncPrivateKeyBase64(btoa(String(r.result ?? '')))
                        r.readAsBinaryString(f)
                      }}
                    />
                    {syncPrivateKeyBase64 && <span className="text-xs text-emerald-600 ml-1">✓ Listo</span>}
                  </FormField>
                  <FormField label="Certificado .pem">
                    <input
                      type="file"
                      accept=".pem"
                      className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        const r = new FileReader()
                        r.onload = () => setSyncCertBase64(btoa(String(r.result ?? '')))
                        r.readAsBinaryString(f)
                      }}
                    />
                    {syncCertBase64 && <span className="text-xs text-emerald-600 ml-1">✓ Listo</span>}
                  </FormField>
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
                  </FormField>
                </div>
              </div>
            ) : null}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveSunat}
                disabled={savingSunat}
                className={btnPrimary}
              >
                {savingSunat ? 'Guardando...' : 'Guardar datos'}
              </button>
            </div>
          </div>
        ) : null}
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
