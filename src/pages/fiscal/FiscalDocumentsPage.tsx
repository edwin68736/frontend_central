import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RefreshCw,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  RotateCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fiscalService,
  FiscalDocumentDetail,
  FiscalDocumentSummary,
  FiscalFilters,
  FiscalStats,
  downloadFiscalFile,
} from '@/services/fiscal.service'
import { tenantsService, Tenant } from '@/services/tenants.service'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
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

const STORAGE_KEY = 'sa_fiscal_filters_v1'
const PAGE_SIZE = 50

const DOC_TYPES = [
  { v: '', l: 'Todos' },
  { v: '01', l: 'Factura' },
  { v: '03', l: 'Boleta' },
  { v: '07', l: 'Nota crédito' },
  { v: '08', l: 'Nota débito' },
  { v: '09', l: 'Guía' },
  { v: 'RC', l: 'Resumen' },
  { v: 'RA', l: 'Baja' },
]

// Grupos de estado simplificados que ve el usuario (menos estados = menos confusión).
// El valor 'v' es el parámetro ?group= que entiende el backend.
const STATUS_OPTS = [
  { v: '', l: 'Todos' },
  { v: 'processing', l: 'En proceso' },
  { v: 'accepted', l: 'Aceptado' },
  { v: 'observed', l: 'Con observaciones' },
  { v: 'rejected', l: 'Rechazado' },
  { v: 'action', l: 'Requiere acción' },
  { v: 'cancelled', l: 'Anulado' },
]

// Filtro deliberadamente SEPARADO del status técnico de arriba: "atendido" es una decisión
// administrativa (ver src/lib/fiscalStatus.ts), no un estado SUNAT/PSE — mezclarlo en el mismo
// dropdown confundiría ambos conceptos, que es justo lo que se pidió evitar.
const ATTENDED_OPTS = [
  { v: '', l: 'Todos' },
  { v: 'unattended', l: 'Solo no atendidos' },
  { v: 'attended', l: 'Solo atendidos' },
]

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ElementType
  tone: string
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3 py-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-800">{value.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function loadSavedFilters(): FiscalFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export default function FiscalDocumentsPage() {
  const [stats, setStats] = useState<FiscalStats | null>(null)
  const [items, setItems] = useState<FiscalDocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [filters, setFilters] = useState<FiscalFilters>(() => ({
    limit: PAGE_SIZE,
    ...loadSavedFilters(),
  }))
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<FiscalDocumentDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const filterQuery = useMemo(() => {
    const { cursor: _c, offset: _o, ...rest } = filters
    return rest
  }, [filters])

  const fetchStats = useCallback(async () => {
    const data = await fiscalService.getStats({
      tenant_slug: filters.tenant_slug,
      from: filters.from,
      to: filters.to,
    })
    setStats(data)
  }, [filters.tenant_slug, filters.from, filters.to])

  const fetchDocuments = useCallback(
    async (pageCursor?: string | null) => {
      const q: FiscalFilters = {
        ...filterQuery,
        limit: PAGE_SIZE,
        cursor: pageCursor || undefined,
      }
      if (!pageCursor) {
        q.offset = 0
        q.include_total = false
      }
      const data = await fiscalService.listDocuments(q)
      setItems(data.items || [])
      setHasMore(!!data.has_more)
      setCursor(data.next_cursor || null)
    },
    [filterQuery]
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setCursorHistory([null])
    setHistoryIndex(0)
    try {
      await Promise.all([fetchStats(), fetchDocuments(null)])
    } catch {
      toast.error('No se pudo cargar documentos fiscales')
    } finally {
      setLoading(false)
    }
  }, [fetchStats, fetchDocuments])

  useEffect(() => {
    tenantsService.list({ page: 1, per_page: 100 }).then(r => setTenants(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filterQuery))
  }, [filterQuery])

  useEffect(() => {
    reload()
  }, [filterQuery])

  const applyFilters = () => reload()

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
      const d = await fiscalService.getDocument(uuid)
      setDetail(d)
    } catch {
      toast.error('No se pudo cargar el detalle')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const toggleSelect = (uuid: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(uuid)) n.delete(uuid)
      else n.add(uuid)
      return n
    })
  }

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((i) => i.document_uuid)))
  }

  const runBulk = async (action: 'send' | 'retry' | 'force' | 'email' | 'poll') => {
    if (action === 'force' && !window.confirm(
      'Forzar reenvía documentos sin respetar las reglas normales de send/retry (incluye aceptados, rechazos de negocio y los que requieren acción manual). ¿Continuar?'
    )) {
      return
    }
    setBulkLoading(true)
    try {
      const payload =
        selected.size > 0
          ? { document_uuids: Array.from(selected), max: 200 }
          : { filters: { ...filterQuery }, max: 200 }
      const res = await fiscalService.bulkAction(action, payload)
      const skipped = res.skipped ?? 0
      toast.success(
        `Bulk ${action}: ${res.queued ?? 0} encolados` +
          (skipped > 0 ? ` · ${skipped} omitidos por regla fiscal (accepted/business/permanent/manual_only) o por estar atendidos` : '')
      )
      setSelected(new Set())
      reload()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'Error en acción masiva'))
    } finally {
      setBulkLoading(false)
    }
  }

  const runAction = async (uuid: string, action: 'send' | 'retry' | 'force' | 'email' | 'poll', doc?: { status: string; error_type?: string | null }) => {
    if (action === 'force' && doc && needsForceConfirmation(doc.status, doc.error_type) && !window.confirm(
      'Este documento está aceptado, es un rechazo de negocio, o requiere acción manual. Forzar el reenvío es una acción administrativa explícita. ¿Continuar?'
    )) {
      return
    }
    try {
      await fiscalService.documentAction(uuid, action)
      toast.success(`Acción ${action} encolada`)
      if (detail?.document.document_uuid === uuid) openDetail(uuid)
      reload()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'Error en acción'))
    }
  }

  const attendDocument = async (uuid: string) => {
    const reason = window.prompt(
      'Marcar como atendido: ya no se podrá reenviar/reintentar hasta quitarle "atendido". Motivo (opcional):',
      ''
    )
    if (reason === null) return // canceló el prompt
    try {
      await fiscalService.attendDocument(uuid, reason.trim() || undefined)
      toast.success('Documento marcado como atendido')
      if (detail?.document.document_uuid === uuid) openDetail(uuid)
      reload()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'No se pudo marcar como atendido'))
    }
  }

  const unattendDocument = async (uuid: string) => {
    try {
      await fiscalService.unattendDocument(uuid)
      toast.success('Se quitó "atendido" del documento')
      if (detail?.document.document_uuid === uuid) openDetail(uuid)
      reload()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'No se pudo quitar "atendido"'))
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex justify-center items-center h-48">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Documentos fiscales</h1>
          <p className="text-sm text-slate-500">Panel global SaaS — source of truth: facturador_lycet</p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCard label="Hoy" value={stats.documents_today} icon={FileText} tone="bg-indigo-500" />
          <KpiCard label="Aceptados" value={stats.accepted} icon={CheckCircle2} tone="bg-emerald-500" />
          <KpiCard label="Rechazados" value={stats.rejected} icon={AlertTriangle} tone="bg-red-500" />
          <KpiCard label="Pendientes" value={stats.pending} icon={Clock} tone="bg-amber-500" />
          <KpiCard label="En cola" value={stats.in_queue} icon={Clock} tone="bg-slate-500" />
          <KpiCard label="Errores" value={stats.errors} icon={AlertTriangle} tone="bg-orange-500" />
          <KpiCard label="Retry" value={stats.retries} icon={RotateCcw} tone="bg-violet-500" />
          <KpiCard label="Emails pend." value={stats.emails_pending} icon={Mail} tone="bg-sky-500" />
        </div>
      )}

      <Card>
        <CardHeader className="flex items-center gap-2 text-slate-700">
          <Filter size={18} /> Filtros
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.tenant_slug || ''}
            onChange={(e) => setFilters((f) => ({ ...f, tenant_slug: e.target.value || undefined }))}
          >
            <option value="">Todos los tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
          <input
            placeholder="RUC empresa"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.company_ruc || ''}
            onChange={(e) => setFilters((f) => ({ ...f, company_ruc: e.target.value || undefined }))}
          />
          <input
            type="date"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.from?.slice(0, 10) || ''}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
          />
          <input
            type="date"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.to?.slice(0, 10) || ''}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.document_type || ''}
            onChange={(e) => setFilters((f) => ({ ...f, document_type: e.target.value || undefined }))}
          >
            {DOC_TYPES.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.group || ''}
            onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value || undefined, status: undefined }))}
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.attended_only ? 'attended' : filters.unattended_only ? 'unattended' : ''}
            onChange={(e) => {
              const v = e.target.value
              setFilters((f) => ({
                ...f,
                attended_only: v === 'attended' ? true : undefined,
                unattended_only: v === 'unattended' ? true : undefined,
              }))
            }}
          >
            {ATTENDED_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
          <input
            placeholder="Serie"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.series || ''}
            onChange={(e) => setFilters((f) => ({ ...f, series: e.target.value || undefined }))}
          />
          <input
            placeholder="Correlativo"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.number || ''}
            onChange={(e) => setFilters((f) => ({ ...f, number: e.target.value || undefined }))}
          />
          <input
            placeholder="Cliente"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.customer_name || ''}
            onChange={(e) => setFilters((f) => ({ ...f, customer_name: e.target.value || undefined }))}
          />
          <input
            placeholder="Email cliente"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.customer_email || ''}
            onChange={(e) => setFilters((f) => ({ ...f, customer_email: e.target.value || undefined }))}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.provider || ''}
            onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value || undefined }))}
          >
            <option value="">Proveedor</option>
            <option value="sunat">SUNAT</option>
            <option value="pse">PSE</option>
          </select>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={filters.send_mode || ''}
            onChange={(e) => setFilters((f) => ({ ...f, send_mode: e.target.value || undefined }))}
          >
            <option value="">Modo envío</option>
            <option value="sunat">SUNAT directo</option>
            <option value="pse">PSE</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!filters.errors_only}
              onChange={(e) => setFilters((f) => ({ ...f, errors_only: e.target.checked || undefined }))}
            />
            Solo errores
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!filters.pending_only}
              onChange={(e) => setFilters((f) => ({ ...f, pending_only: e.target.checked || undefined }))}
            />
            Solo pendientes
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={!!filters.retry_only}
              onChange={(e) => setFilters((f) => ({ ...f, retry_only: e.target.checked || undefined }))}
            />
            Solo reintentos
          </label>
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            <Search size={16} /> Buscar
          </button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">
            {items.length} documentos {selected.size > 0 && `· ${selected.size} seleccionados`}
          </span>
          <p className="flex flex-wrap gap-2">
            {(['retry', 'send', 'force', 'poll', 'email'] as const).map((a) => (
              <button
                key={a}
                type="button"
                disabled={bulkLoading}
                onClick={() => runBulk(a)}
                className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
              >
                {actionLabel(a)} (lote)
              </button>
            ))}
          </p>
        </CardHeader>
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3 text-left">Tenant</th>
                <th className="p-3 text-left">RUC</th>
                <th className="p-3 text-left">Tipo</th>
                <th className="p-3 text-left">Serie-Núm</th>
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-left">Fecha</th>
                <th className="p-3 text-left">Estado</th>
                <th className="p-3 text-left">Atendido</th>
                <th className="p-3 text-left">Proveedor</th>
                <th className="p-3 text-right">Monto</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-center">Reintentos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr
                  key={doc.document_uuid}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => openDetail(doc.document_uuid)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(doc.document_uuid)}
                      onChange={() => toggleSelect(doc.document_uuid)}
                    />
                  </td>
                  <td className="p-3 font-medium">{doc.tenant_slug}</td>
                  <td className="p-3 text-slate-500">{doc.company_ruc || '—'}</td>
                  <td className="p-3">{doc.document_type}</td>
                  <td className="p-3 font-mono text-xs">
                    {doc.series}-{doc.number}
                  </td>
                  <td className="p-3 max-w-[140px] truncate">{doc.customer_name || '—'}</td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const g = fiscalGroup(doc.status, doc.error_type, doc.retryable)
                      return <Badge variant={g.variant}>{g.label}</Badge>
                    })()}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const b = attendedBadge(doc.attended)
                      return <Badge variant={b.variant}>{b.label}</Badge>
                    })()}
                  </td>
                  <td className="p-3">{doc.provider || sendModeLabel(doc.send_mode)}</td>
                  <td className="p-3 text-right">{doc.total != null ? Number(doc.total).toFixed(2) : '—'}</td>
                  <td className="p-3">{emailStatusLabel(doc.email_status)}</td>
                  <td className="p-3 text-center">{doc.retry_count}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-slate-400">
                    Sin documentos con estos filtros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={prevPage}
            disabled={loadingMore || historyIndex <= 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          {loadingMore && <Spinner size={20} />}
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
                    onClick={() => attendDocument(detail.document.document_uuid)}
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
                  return (
                    <span className="text-xs text-slate-500">
                      {[explanation, progress].filter(Boolean).join(' · ')}
                    </span>
                  )
                })()}
              </div>
              {detail.document.next_retry_at ? (
                <div className="col-span-2 text-xs text-slate-500">
                  <span className="text-slate-500">Próximo reintento automático:</span>{' '}
                  {new Date(detail.document.next_retry_at).toLocaleString()}
                </div>
              ) : null}
              {detail.document.attended ? (
                <div className="col-span-2 text-xs text-slate-500">
                  <span className="text-slate-500">Atendido:</span>{' '}
                  {detail.document.attended_at ? new Date(detail.document.attended_at).toLocaleString() : '—'}
                  {detail.document.attended_by ? ` · por ${detail.document.attended_by}` : ''}
                  {detail.document.attended_reason ? ` · "${detail.document.attended_reason}"` : ''}
                </div>
              ) : null}
              <div className="col-span-2">
                <span className="text-slate-500">SUNAT / PSE:</span> {detail.document.sunat_code} —{' '}
                {detail.document.sunat_message}
              </div>
            </div>

            {detail.pse_response ? (
              <details open className="text-sm border border-slate-100 rounded-lg p-3 bg-amber-50/50">
                <summary className="cursor-pointer font-semibold text-slate-700">
                  Respuesta PSE (ValidaPSE)
                </summary>
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
                    <span className="text-slate-400 whitespace-nowrap">{String(ev.at)}</span>
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
              <summary className="cursor-pointer font-semibold text-slate-700">
                Attempts ({detail.attempts.length})
              </summary>
              <pre className="mt-2 p-3 bg-slate-50 rounded-lg overflow-auto max-h-32">
                {JSON.stringify(detail.attempts, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </Modal>
    </div>
  )
}
