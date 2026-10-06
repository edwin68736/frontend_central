import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
  FileSpreadsheet,
  ClipboardCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fiscalService,
  FiscalDocumentDetail,
  FiscalDocumentSummary,
  FiscalFilters,
  FiscalStats,
  FiscalView,
  downloadFiscalFile,
} from '@/services/fiscal.service'
import { tenantsService, Tenant } from '@/services/tenants.service'
import { Card, CardBody } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'
import {
  fiscalGroup,
  isNormalActionBlocked,
  needsForceConfirmation,
  fiscalExplanation,
  retryProgressLabel,
  fiscalActionErrorMessage,
  sendModeLabel,
  emailStatusLabel,
  actionLabel,
  isAttendable,
  attendedBadge,
} from '@/lib/fiscalStatus'
import {
  DATE_PRESETS,
  DatePreset,
  docTypeLabel,
  fiscalDocsToCsv,
  formatLima,
  normalizeRange,
  parseSearchQuery,
  rangeForPreset,
} from '@/lib/fiscalFilters'

const STORAGE_KEY = 'sa_fiscal_filters_v2'
const PAGE_SIZES = [25, 50, 100, 200]
const BULK_MAX = 200
const EXPORT_MAX = 5000

type Tab = 'pending' | 'history'
type BulkAction = 'send' | 'retry' | 'force' | 'email' | 'poll'

const DOC_TYPES = [
  { v: '', l: 'Todos los tipos' },
  { v: '01', l: 'Factura' },
  { v: '03', l: 'Boleta' },
  { v: '07', l: 'Nota de crédito' },
  { v: '08', l: 'Nota de débito' },
  { v: '09', l: 'Guía' },
  { v: 'RC', l: 'Resumen diario' },
  { v: 'RA', l: 'Comunicación de baja' },
]

const PENDING_SUBS: { v: FiscalView; l: string }[] = [
  { v: 'pending', l: 'Todos' },
  { v: 'needs_action', l: 'Requieren acción' },
  { v: 'processing', l: 'En proceso' },
]

const HISTORY_SUBS: { v: FiscalView; l: string }[] = [
  { v: 'history', l: 'Todo el historial' },
  { v: 'accepted', l: 'Aceptados por SUNAT' },
  { v: 'attended', l: 'Atendidos' },
]

const BULK_LABELS: Record<BulkAction, string> = {
  retry: 'Reintentar',
  send: 'Enviar',
  force: 'Forzar',
  poll: 'Consultar estado',
  email: 'Reenviar correo',
}

type SavedFilters = Omit<FiscalFilters, 'view' | 'cursor' | 'offset' | 'limit' | 'include_total'>

function loadSavedFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function KpiCard({
  label,
  hint,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string
  hint?: string
  value: number | undefined
  icon: React.ElementType
  tone: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-xl border bg-white shadow-sm transition ${
        active ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
      } ${onClick ? 'hover:border-indigo-300 cursor-pointer' : 'cursor-default'}`}
    >
      <CardBody className="flex items-center gap-3 py-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{(value ?? 0).toLocaleString()}</p>
          <p className="text-xs font-medium text-slate-600">{label}</p>
          {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
        </div>
      </CardBody>
    </button>
  )
}

/** Selector de tenant con búsqueda en servidor (hay cientos: un <select> de 100 no alcanza). */
function TenantPicker({
  value,
  onChange,
}: {
  value?: string
  onChange: (slug: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [results, setResults] = useState<Tenant[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => {
      tenantsService
        .list({ page: 1, per_page: 15, q: text.trim() || undefined })
        .then((r) => setResults(r.data ?? []))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(id)
  }, [open, text])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
        <Search size={14} className="text-slate-400 mr-2 shrink-0" />
        <input
          className="flex-1 min-w-0 outline-none bg-transparent"
          placeholder={value ? value : 'Todos los tenants — buscar por nombre o RUC'}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
        />
        {value && (
          <button
            type="button"
            aria-label="Quitar tenant"
            onClick={() => {
              onChange(undefined)
              setText('')
            }}
            className="text-slate-400 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {results.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Sin resultados</p>}
          {results.map((t) => (
            <button
              type="button"
              key={t.id}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                onChange(t.slug)
                setText('')
                setOpen(false)
              }}
            >
              <span className="font-medium text-slate-800">{t.name}</span>
              <span className="ml-2 text-xs text-slate-400">
                {t.slug}
                {t.ruc ? ` · ${t.ruc}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FiscalDocumentsPage() {
  const [stats, setStats] = useState<FiscalStats | null>(null)
  const [items, setItems] = useState<FiscalDocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filters, setFilters] = useState<SavedFilters>(() => loadSavedFilters())
  const [searchText, setSearchText] = useState('')
  const [tab, setTab] = useState<Tab>('pending')
  const [pendingSub, setPendingSub] = useState<FiscalView>('pending')
  const [historySub, setHistorySub] = useState<FiscalView>('history')
  const [pageSize, setPageSize] = useState(50)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectAllFilter, setSelectAllFilter] = useState(false)
  const [detail, setDetail] = useState<FiscalDocumentDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [bulkAsk, setBulkAsk] = useState<BulkAction | 'attend' | null>(null)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [attendTarget, setAttendTarget] = useState<string | null>(null)
  const [attendReason, setAttendReason] = useState('')
  const [attendSubmitting, setAttendSubmitting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const view: FiscalView = tab === 'pending' ? pendingSub : historySub

  // Texto libre -> serie/correlativo/RUC/cliente, con espera para no consultar en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      const parsed = parseSearchQuery(searchText)
      setFilters((f) => {
        const { series: _s, number: _n, company_ruc: _r, customer_name: _c, ...rest } = f
        const next = { ...rest, ...parsed }
        return JSON.stringify(next) === JSON.stringify(f) ? f : next
      })
    }, 400)
    return () => clearTimeout(id)
  }, [searchText])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    } catch {
      /* almacenamiento no disponible: no es crítico */
    }
  }, [filters])

  const listQuery = useMemo<FiscalFilters>(() => ({ ...filters, view }), [filters, view])

  const fetchStats = useCallback(async () => {
    setStats(await fiscalService.getStats(filters))
  }, [filters])

  const fetchDocuments = useCallback(
    async (pageCursor?: string | null) => {
      const q: FiscalFilters = { ...listQuery, limit: pageSize, cursor: pageCursor || undefined }
      if (!pageCursor) {
        q.offset = 0
        q.include_total = false
      }
      const data = await fiscalService.listDocuments(q)
      setItems(data.items || [])
      setHasMore(!!data.has_more)
      setCursor(data.next_cursor || null)
    },
    [listQuery, pageSize]
  )

  const reload = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setCursorHistory([null])
      setHistoryIndex(0)
      try {
        await Promise.all([fetchStats(), fetchDocuments(null)])
        setLastUpdate(new Date())
      } catch {
        toast.error('No se pudo cargar documentos fiscales')
      } finally {
        setLoading(false)
      }
    },
    [fetchStats, fetchDocuments]
  )

  useEffect(() => {
    setSelected(new Set())
    setSelectAllFilter(false)
    reload()
  }, [reload])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => reload(true), 30000)
    return () => clearInterval(id)
  }, [autoRefresh, reload])

  const nextPage = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const nextHistory = [...cursorHistory.slice(0, historyIndex + 1), cursor]
      setCursorHistory(nextHistory)
      setHistoryIndex(nextHistory.length - 1)
      await fetchDocuments(cursor)
    } finally {
      setLoadingMore(false)
    }
  }

  const prevPage = async () => {
    if (historyIndex <= 0) return
    setLoadingMore(true)
    try {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      await fetchDocuments(cursorHistory[newIndex])
    } finally {
      setLoadingMore(false)
    }
  }

  const openDetail = async (uuid: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      setDetail(await fiscalService.getDocument(uuid))
    } catch {
      toast.error('No se pudo cargar el detalle')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  // ---- filtros -----------------------------------------------------------------------------
  const setFilter = <K extends keyof SavedFilters>(key: K, value: SavedFilters[K] | undefined) =>
    setFilters((f) => {
      const next = { ...f }
      if (value === undefined || value === '' || value === false) delete next[key]
      else next[key] = value
      return next
    })

  const setRange = (from?: string, to?: string) => {
    const r = normalizeRange(from, to)
    setFilters((f) => {
      const { from: _f, to: _t, ...rest } = f
      return { ...rest, ...(r.from ? { from: r.from } : {}), ...(r.to ? { to: r.to } : {}) }
    })
  }

  const applyPreset = (p: DatePreset) => {
    const r = rangeForPreset(p)
    setRange(r.from, r.to)
  }

  const activePreset = DATE_PRESETS.find((p) => {
    const r = rangeForPreset(p.id)
    return r.from === filters.from && r.to === filters.to
  })?.id

  const clearFilters = () => {
    setFilters({})
    setSearchText('')
  }

  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.tenant_slug) chips.push({ key: 'tenant', label: `Tenant: ${filters.tenant_slug}`, clear: () => setFilter('tenant_slug', undefined) })
  if (filters.from || filters.to)
    chips.push({ key: 'range', label: `Fechas: ${filters.from ?? '…'} → ${filters.to ?? '…'}`, clear: () => setRange() })
  if (filters.document_type) chips.push({ key: 'type', label: `Tipo: ${docTypeLabel(filters.document_type)}`, clear: () => setFilter('document_type', undefined) })
  if (searchText.trim()) chips.push({ key: 'q', label: `Búsqueda: ${searchText.trim()}`, clear: () => setSearchText('') })
  if (filters.provider) chips.push({ key: 'prov', label: `Proveedor: ${filters.provider}`, clear: () => setFilter('provider', undefined) })
  if (filters.send_mode) chips.push({ key: 'mode', label: `Modo: ${sendModeLabel(filters.send_mode)}`, clear: () => setFilter('send_mode', undefined) })
  if (filters.customer_email) chips.push({ key: 'mail', label: `Email: ${filters.customer_email}`, clear: () => setFilter('customer_email', undefined) })

  // ---- selección / acciones ----------------------------------------------------------------
  const toggleSelect = (uuid: string) => {
    setSelectAllFilter(false)
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(uuid)) n.delete(uuid)
      else n.add(uuid)
      return n
    })
  }

  // Un documento atendido no admite ninguna acción — no se deja seleccionable para lote.
  const selectableItems = useMemo(() => items.filter((i) => !i.attended), [items])

  const toggleAll = () => {
    setSelectAllFilter(false)
    if (selected.size === selectableItems.length && selectableItems.length > 0) setSelected(new Set())
    else setSelected(new Set(selectableItems.map((i) => i.document_uuid)))
  }

  const viewTotal = stats?.views?.[view]
  const bulkCount = selectAllFilter ? Math.min(viewTotal ?? 0, BULK_MAX) : selected.size
  const canSelectWholeFilter =
    !selectAllFilter && selected.size > 0 && selected.size === selectableItems.length && (viewTotal ?? 0) > selected.size

  const runBulk = async () => {
    const action = bulkAsk
    if (!action) return
    setBulkLoading(true)
    try {
      if (action === 'attend') {
        const reason = bulkReason.trim() || undefined
        const uuids = Array.from(selected)
        let ok = 0
        let fail = 0
        for (let i = 0; i < uuids.length; i += 5) {
          const res = await Promise.allSettled(uuids.slice(i, i + 5).map((u) => fiscalService.attendDocument(u, reason)))
          res.forEach((r) => (r.status === 'fulfilled' ? ok++ : fail++))
        }
        if (ok > 0) toast.success(`${ok} documento(s) marcados como atendidos`)
        if (fail > 0) toast.error(`${fail} no se pudieron marcar (estado no admite "atendido")`)
      } else {
        const payload =
          !selectAllFilter && selected.size > 0
            ? { document_uuids: Array.from(selected), max: BULK_MAX }
            : { filters: { ...listQuery } as Record<string, unknown>, max: BULK_MAX }
        const res = await fiscalService.bulkAction(action, payload)
        const skipped = res.skipped ?? 0
        toast.success(
          `${BULK_LABELS[action]}: ${res.queued ?? 0} encolados` +
            (skipped > 0 ? ` · ${skipped} omitidos por regla fiscal o por estar atendidos` : '')
        )
      }
      setBulkAsk(null)
      setBulkReason('')
      setSelected(new Set())
      setSelectAllFilter(false)
      reload()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'Error en acción masiva'))
    } finally {
      setBulkLoading(false)
    }
  }

  const runAction = async (
    uuid: string,
    action: BulkAction,
    doc?: { status: string; error_type?: string | null }
  ) => {
    if (
      action === 'force' &&
      doc &&
      needsForceConfirmation(doc.status, doc.error_type) &&
      !window.confirm(
        'Este documento está aceptado, es un rechazo de negocio, o requiere acción manual. Forzar el reenvío es una acción administrativa explícita. ¿Continuar?'
      )
    ) {
      return
    }
    try {
      await fiscalService.documentAction(uuid, action)
      toast.success(`Acción ${action} encolada`)
      if (detail?.document.document_uuid === uuid) openDetail(uuid)
      reload(true)
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'Error en acción'))
    }
  }

  const openAttendModal = (uuid: string) => {
    setAttendReason('')
    setAttendTarget(uuid)
  }

  const confirmAttend = async () => {
    if (!attendTarget) return
    const uuid = attendTarget
    setAttendSubmitting(true)
    try {
      await fiscalService.attendDocument(uuid, attendReason.trim() || undefined)
      toast.success('Documento marcado como atendido: pasó al historial')
      setAttendTarget(null)
      if (detail?.document.document_uuid === uuid) openDetail(uuid)
      reload(true)
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'No se pudo marcar como atendido'))
    } finally {
      setAttendSubmitting(false)
    }
  }

  const unattendDocument = async (uuid: string) => {
    try {
      await fiscalService.unattendDocument(uuid)
      toast.success('Se quitó "atendido": el documento volvió a pendientes')
      if (detail?.document.document_uuid === uuid) openDetail(uuid)
      reload(true)
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'No se pudo quitar "atendido"'))
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all: FiscalDocumentSummary[] = []
      let cur: string | undefined
      while (all.length < EXPORT_MAX) {
        const data = await fiscalService.listDocuments({ ...listQuery, limit: 200, cursor: cur, include_total: false })
        all.push(...(data.items || []))
        if (!data.has_more || !data.next_cursor) break
        cur = data.next_cursor
      }
      const blob = new Blob([fiscalDocsToCsv(all)], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `documentos-fiscales-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success(`${all.length} documentos exportados${all.length >= EXPORT_MAX ? ` (tope ${EXPORT_MAX})` : ''}`)
    } catch {
      toast.error('No se pudo exportar')
    } finally {
      setExporting(false)
    }
  }

  const goTab = (t: Tab, sub?: FiscalView) => {
    setTab(t)
    if (sub) {
      if (t === 'pending') setPendingSub(sub)
      else setHistorySub(sub)
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex justify-center items-center h-48">
        <Spinner size={36} />
      </div>
    )
  }

  const views = stats?.views ?? {}
  const subs = tab === 'pending' ? PENDING_SUBS : HISTORY_SUBS
  const currentSub = tab === 'pending' ? pendingSub : historySub
  const failureText = (d: FiscalDocumentSummary): string => {
    if (d.attended) return d.attended_reason ? `Atendido: ${d.attended_reason}` : 'Atendido'
    if (d.status === 'accepted' || d.status === 'observed') return ''
    if (d.next_retry_at) return `Reintento: ${formatLima(d.next_retry_at)}`
    return d.sunat_message || ''
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Documentos fiscales</h1>
          <p className="text-sm text-slate-500">
            Gestiona solo lo pendiente. Lo aceptado por SUNAT o ya atendido pasa al historial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-actualizar (30 s)
          </label>
          {lastUpdate && (
            <span className="text-xs text-slate-400">{lastUpdate.toLocaleTimeString('es-PE', { timeZone: 'America/Lima' })}</span>
          )}
          <button
            type="button"
            onClick={() => reload()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Por atender"
            hint="Error, rechazados o anulados sin atender"
            value={views.needs_action}
            icon={AlertTriangle}
            tone="bg-red-500"
            active={tab === 'pending' && pendingSub === 'needs_action'}
            onClick={() => goTab('pending', 'needs_action')}
          />
          <KpiCard
            label="En proceso"
            hint="En cola o reintentando solos"
            value={views.processing}
            icon={Clock}
            tone="bg-amber-500"
            active={tab === 'pending' && pendingSub === 'processing'}
            onClick={() => goTab('pending', 'processing')}
          />
          <KpiCard label="Emails pendientes" hint="Comprobantes sin correo enviado" value={stats.emails_pending} icon={Mail} tone="bg-sky-500" />
        </div>
      )}

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter size={16} /> Filtros
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TenantPicker value={filters.tenant_slug} onChange={(s) => setFilter('tenant_slug', s)} />
            <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <Search size={14} className="text-slate-400 mr-2 shrink-0" />
              <input
                className="flex-1 min-w-0 outline-none bg-transparent"
                placeholder="Serie-número (F001-123), RUC o cliente"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <select
              value={filters.document_type ?? ''}
              onChange={(e) => setFilter('document_type', e.target.value || undefined)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {DOC_TYPES.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1 text-xs rounded-full border ${
                  activePreset === p.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => setRange(e.target.value || undefined, filters.to)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
              aria-label="Desde"
            />
            <span className="text-xs text-slate-400">a</span>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => setRange(filters.from, e.target.value || undefined)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
              aria-label="Hasta"
            />
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="ml-auto text-xs text-indigo-600 hover:underline"
            >
              {showAdvanced ? 'Ocultar filtros avanzados' : 'Más filtros'}
            </button>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={filters.provider ?? ''}
                onChange={(e) => setFilter('provider', e.target.value || undefined)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Proveedor: todos</option>
                <option value="sunat">SUNAT</option>
                <option value="pse">PSE</option>
              </select>
              <select
                value={filters.send_mode ?? ''}
                onChange={(e) => setFilter('send_mode', e.target.value || undefined)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Modo de envío: todos</option>
                <option value="sunat">SUNAT directo</option>
                <option value="pse">PSE</option>
              </select>
              <input
                value={filters.customer_email ?? ''}
                onChange={(e) => setFilter('customer_email', e.target.value || undefined)}
                placeholder="Email del cliente"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {chips.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded-full">
                  {c.label}
                  <button type="button" onClick={c.clear} aria-label={`Quitar ${c.label}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button type="button" onClick={clearFilters} className="text-xs text-slate-500 hover:underline">
                Limpiar todo
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 border-b border-slate-100">
          {(
            [
              { t: 'pending' as Tab, l: 'Pendientes', n: views.pending },
              { t: 'history' as Tab, l: 'Historial', n: views.history },
            ]
          ).map((x) => (
            <button
              key={x.t}
              type="button"
              onClick={() => setTab(x.t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === x.t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {x.l}
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{(x.n ?? 0).toLocaleString()}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 pb-2">
            {subs.map((s) => (
              <button
                key={s.v}
                type="button"
                onClick={() => (tab === 'pending' ? setPendingSub(s.v) : setHistorySub(s.v))}
                className={`px-3 py-1 text-xs rounded-full border ${
                  currentSub === s.v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {s.l}
                {views[s.v] !== undefined && <span className="ml-1 opacity-70">({views[s.v]})</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{(viewTotal ?? items.length).toLocaleString()} documentos</span>
            {selected.size > 0 && <span className="ml-3 text-indigo-700">{selected.size} seleccionados</span>}
            {canSelectWholeFilter && (
              <button type="button" className="ml-3 text-xs text-indigo-600 hover:underline" onClick={() => setSelectAllFilter(true)}>
                Seleccionar los {viewTotal} del filtro (máx. {BULK_MAX} por lote)
              </button>
            )}
            {selectAllFilter && <span className="ml-3 text-xs text-indigo-700">Se aplicará al filtro completo (hasta {BULK_MAX})</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'pending' && (
              <>
                {(['retry', 'send', 'force', 'poll', 'email'] as BulkAction[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={bulkLoading || (selected.size === 0 && !selectAllFilter)}
                    onClick={() => setBulkAsk(a)}
                    className="px-2.5 py-1.5 text-xs bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40"
                  >
                    {BULK_LABELS[a]} (lote)
                  </button>
                ))}
                <button
                  type="button"
                  disabled={bulkLoading || selected.size === 0}
                  onClick={() => setBulkAsk('attend')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40"
                >
                  <ClipboardCheck size={13} /> Marcar atendidos (lote)
                </button>
              </>
            )}
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              <FileSpreadsheet size={13} /> {exporting ? 'Exportando…' : 'Exportar CSV'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={selected.size > 0 && selected.size === selectableItems.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Emisión (Lima)</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Detalle / motivo</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2 text-right">Reint.</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-slate-400">
                    {tab === 'pending' ? 'No hay documentos pendientes de gestión con estos filtros.' : 'Sin documentos en el historial con estos filtros.'}
                  </td>
                </tr>
              )}
              {items.map((d) => {
                const g = fiscalGroup(d.status, d.error_type, d.retryable)
                const ab = attendedBadge(!!d.attended)
                const failure = failureText(d)
                return (
                  <tr key={d.document_uuid} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${d.series}-${d.number}`}
                        disabled={!!d.attended}
                        checked={selected.has(d.document_uuid)}
                        onChange={() => toggleSelect(d.document_uuid)}
                      />
                    </td>
                    <td className="px-3 py-2 cursor-pointer" onClick={() => openDetail(d.document_uuid)}>
                      <div className="font-medium text-slate-800">{d.tenant_slug}</div>
                      <div className="text-xs text-slate-400">{d.company_ruc ?? ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">
                        {d.series}-{d.number}
                      </div>
                      <div className="text-xs text-slate-400">{docTypeLabel(d.document_type)}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{d.customer_name || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">{formatLima(d.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={g.variant}>{g.label}</Badge>
                        {d.attended && <Badge variant={ab.variant}>{ab.label}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[220px] text-xs text-slate-500">
                      <span className="line-clamp-2" title={failure}>
                        {failure || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.total ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{d.customer_email ? emailStatusLabel(d.email_status) : 'Sin correo'}</td>
                    <td className="px-3 py-2 text-right">{d.retry_count}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1">
                        {!d.attended && !isNormalActionBlocked(d.status, d.error_type) && d.status !== 'accepted' && d.status !== 'observed' && (
                          <button
                            type="button"
                            onClick={() => runAction(d.document_uuid, 'retry', d)}
                            className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                          >
                            Reintentar
                          </button>
                        )}
                        {!d.attended && isAttendable(d.status) && (
                          <button
                            type="button"
                            onClick={() => openAttendModal(d.document_uuid)}
                            className="px-2 py-1 text-xs bg-emerald-50 text-emerald-800 rounded hover:bg-emerald-100"
                          >
                            Atender
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openDetail(d.document_uuid)}
                          className="px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200"
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={prevPage}
            disabled={loadingMore || historyIndex === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>Página {historyIndex + 1}</span>
            <label className="flex items-center gap-1.5">
              Por página
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={nextPage}
            disabled={loadingMore || !hasMore}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </Card>

      <Modal open={bulkAsk !== null} onClose={() => !bulkLoading && setBulkAsk(null)} title="Confirmar acción en lote" maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {bulkAsk === 'attend' ? (
              <>
                Se marcarán como <b>atendidos</b> <b>{selected.size}</b> documento(s) y pasarán al historial; no se podrán reenviar hasta quitarles
                "atendido".
              </>
            ) : (
              <>
                Acción <b>{bulkAsk ? BULK_LABELS[bulkAsk] : ''}</b> sobre <b>{bulkCount}</b> documento(s)
                {selectAllFilter && (viewTotal ?? 0) > BULK_MAX ? ` (de ${viewTotal}; el resto requiere repetir el lote)` : ''}.
              </>
            )}
          </p>
          {bulkAsk === 'force' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Forzar reenvía sin respetar las reglas normales de envío/reintento (incluye aceptados, rechazos de negocio y los que requieren acción
              manual). Es un override administrativo.
            </p>
          )}
          {bulkAsk === 'attend' && (
            <textarea
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Motivo común (opcional)"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBulkAsk(null)}
              disabled={bulkLoading}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={runBulk}
              disabled={bulkLoading}
              className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${bulkAsk === 'force' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {bulkLoading ? 'Procesando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Detalle fiscal" maxWidth="max-w-4xl">
        {detailLoading && (
          <div className="flex justify-center py-12">
            <Spinner size={32} />
          </div>
        )}
        {detail && !detailLoading && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {detail.document.attended ? (
                <span className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-1.5 self-center">
                  Documento atendido — no admite reenvío/reintento. Quitar "atendido" para volver a habilitarlas.
                </span>
              ) : (
                (['retry', 'send', 'force', 'poll', 'email'] as const)
                  .filter(
                    (a) =>
                      a === 'force' ||
                      a === 'poll' ||
                      a === 'email' ||
                      !isNormalActionBlocked(detail.document.status, detail.document.error_type)
                  )
                  .map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => runAction(detail.document.document_uuid, a, detail.document)}
                      className={
                        a === 'force'
                          ? 'px-3 py-1.5 text-xs bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 border border-amber-200'
                          : 'px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100'
                      }
                      title={a === 'force' ? 'Override administrativo: ignora las reglas normales de reenvío' : undefined}
                    >
                      {actionLabel(a)}
                    </button>
                  ))
              )}
              {!detail.document.attended && isNormalActionBlocked(detail.document.status, detail.document.error_type) && (
                <span className="text-xs text-slate-500 self-center">
                  send/retry normal no disponible en este estado — usar "force" para forzar de todas formas.
                </span>
              )}
              {detail.document.attended ? (
                <button
                  type="button"
                  onClick={() => unattendDocument(detail.document.document_uuid)}
                  className="px-3 py-1.5 text-xs bg-slate-700 text-white rounded-lg hover:bg-slate-800"
                >
                  {actionLabel('unattend')}
                </button>
              ) : (
                isAttendable(detail.document.status) && (
                  <button
                    type="button"
                    onClick={() => openAttendModal(detail.document.document_uuid)}
                    className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-800 rounded-lg hover:bg-emerald-100 border border-emerald-200"
                    title="Decisión administrativa: ya no se reenvía/reintenta este documento, sin importar el estado técnico"
                  >
                    {actionLabel('attend')}
                  </button>
                )
              )}
              {(['xml', 'signed_xml', 'cdr', 'pdf'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    downloadFiscalFile(
                      detail.document.document_uuid,
                      t,
                      `${detail.document.series}-${detail.document.number}.${t === 'pdf' ? 'pdf' : t === 'cdr' ? 'zip' : 'xml'}`
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  <Download size={14} /> {t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">UUID:</span> {detail.document.document_uuid}
              </div>
              <div>
                <span className="text-slate-500">Tenant:</span> {detail.document.tenant_slug}
              </div>
              <div className="col-span-2 flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Estado:</span>
                {(() => {
                  const g = fiscalGroup(detail.document.status, detail.document.error_type, detail.document.retryable)
                  return <Badge variant={g.variant}>{g.label}</Badge>
                })()}
                {(() => {
                  const b = attendedBadge(detail.document.attended)
                  return <Badge variant={b.variant}>{b.label}</Badge>
                })()}
                {(() => {
                  const explanation = fiscalExplanation(
                    detail.document.status,
                    detail.document.error_type,
                    detail.document.retryable
                  )
                  const progress = retryProgressLabel(
                    detail.document.retry_count,
                    detail.document.error_type,
                    detail.document.retryable
                  )
                  if (!explanation && !progress) return null
                  return <span className="text-xs text-slate-500">{[explanation, progress].filter(Boolean).join(' · ')}</span>
                })()}
              </div>
              {detail.document.next_retry_at ? (
                <div className="col-span-2 text-xs text-slate-500">
                  <span className="text-slate-500">Próximo reintento automático:</span> {formatLima(detail.document.next_retry_at)}
                </div>
              ) : null}
              {detail.document.attended ? (
                <div className="col-span-2 text-xs text-slate-500">
                  <span className="text-slate-500">Atendido:</span> {formatLima(detail.document.attended_at)}
                  {detail.document.attended_by ? ` · por ${detail.document.attended_by}` : ''}
                  {detail.document.attended_reason ? ` · "${detail.document.attended_reason}"` : ''}
                </div>
              ) : null}
              <div className="col-span-2">
                <span className="text-slate-500">SUNAT / PSE:</span> {detail.document.sunat_code} — {detail.document.sunat_message}
              </div>
            </div>

            {detail.pse_response ? (
              <details open className="text-sm border border-slate-100 rounded-lg p-3 bg-amber-50/50">
                <summary className="cursor-pointer font-semibold text-slate-700">Respuesta PSE (ValidaPSE)</summary>
                <pre className="mt-2 p-3 bg-white rounded-lg overflow-auto max-h-40 text-xs">
                  {JSON.stringify(detail.pse_response, null, 2)}
                </pre>
              </details>
            ) : null}

            <div>
              <h3 className="font-semibold text-slate-700 mb-2">Línea de tiempo</h3>
              <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                {detail.timeline.map((ev, i) => (
                  <div key={i} className="flex gap-2 py-1 border-b border-slate-50">
                    <span className="text-slate-400 whitespace-nowrap">{formatLima(String(ev.at))}</span>
                    <span className="font-medium">{String(ev.type)}</span>
                  </div>
                ))}
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">Snapshot JSON</summary>
              <pre className="mt-2 p-3 bg-slate-50 rounded-lg overflow-auto max-h-48">
                {JSON.stringify(detail.snapshot_json, null, 2)}
              </pre>
            </details>

            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">Attempts ({detail.attempts.length})</summary>
              <pre className="mt-2 p-3 bg-slate-50 rounded-lg overflow-auto max-h-32">
                {JSON.stringify(detail.attempts, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </Modal>

      <Modal open={attendTarget !== null} onClose={() => setAttendTarget(null)} title="Marcar como atendido" maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Ya no se podrá reenviar/reintentar/forzar este documento hasta quitarle "atendido", y pasará al historial. Motivo (opcional):
          </p>
          <textarea
            autoFocus
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
            placeholder="Ej: cliente resolvió por otra vía, ya no se factura"
            value={attendReason}
            onChange={(e) => setAttendReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAttendTarget(null)}
              disabled={attendSubmitting}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmAttend}
              disabled={attendSubmitting}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {attendSubmitting ? 'Marcando…' : 'Marcar atendido'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
