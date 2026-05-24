import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  Search,
  Server,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fiscalOperationsService,
  FiscalAlertItem,
  FiscalAuditTimeline,
  FiscalHealth,
  FiscalOperationsSummary,
  FiscalQueueItem,
  FiscalQueueMonitor,
  FiscalTenantOperation,
} from '@/services/fiscal-operations.service'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'

function healthVariant(s: string): 'green' | 'yellow' | 'red' | 'gray' {
  if (s === 'healthy') return 'green'
  if (s === 'degraded') return 'yellow'
  if (s === 'critical') return 'red'
  return 'gray'
}

function connVariant(s: string): 'green' | 'red' | 'yellow' | 'gray' {
  if (s === 'connected') return 'green'
  if (s === 'testing') return 'yellow'
  if (s === 'configuration_missing') return 'gray'
  return 'red'
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </CardBody>
    </Card>
  )
}

function MiniBarChart({
  title,
  rows,
  labelKey,
  valueKey,
}: {
  title: string
  rows: Array<Record<string, unknown>>
  labelKey: string
  valueKey: string
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] ?? 0)))
  return (
    <Card>
      <CardHeader className="text-sm font-semibold text-slate-700">{title}</CardHeader>
      <CardBody className="space-y-2 max-h-48 overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-slate-400">Sin datos hoy</p>}
        {rows.map((row, i) => {
          const val = Number(row[valueKey] ?? 0)
          const label = String(row[labelKey] ?? '')
          const pct = Math.round((val / max) * 100)
          return (
            <div key={i}>
              <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                <span className="truncate max-w-[70%]">{label}</span>
                <span>{val}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded overflow-hidden">
                <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}

export default function OperacionesFiscalesPage() {
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<FiscalHealth | null>(null)
  const [summary, setSummary] = useState<FiscalOperationsSummary | null>(null)
  const [tenants, setTenants] = useState<FiscalTenantOperation[]>([])
  const [queue, setQueue] = useState<FiscalQueueMonitor | null>(null)
  const [alerts, setAlerts] = useState<FiscalAlertItem[]>([])
  const [queueTab, setQueueTab] = useState<'queued' | 'processing' | 'failed' | 'retrying'>('queued')
  const [search, setSearch] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [timeline, setTimeline] = useState<FiscalAuditTimeline | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        fiscalOperationsService.getHealth(),
        fiscalOperationsService.getSummary(),
        fiscalOperationsService.getTenants({
          q: search || undefined,
          errors_only: errorsOnly,
          pending_only: pendingOnly,
        }),
        fiscalOperationsService.getQueue(),
        fiscalOperationsService.getAlerts(),
      ])
      const [h, s, t, q, a] = results
      if (h.status === 'fulfilled') setHealth(h.value)
      if (s.status === 'fulfilled') setSummary(s.value)
      if (t.status === 'fulfilled') setTenants(t.value.items || [])
      if (q.status === 'fulfilled') setQueue(q.value)
      if (a.status === 'fulfilled') setAlerts(a.value.items || [])
      if (results.every((r) => r.status === 'rejected')) {
        toast.error('Error cargando operaciones fiscales')
      }
    } catch (e) {
      toast.error('Error cargando operaciones fiscales')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, errorsOnly, pendingOnly])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const queueItems = useMemo((): FiscalQueueItem[] => {
    if (!queue) return []
    return queue[queueTab] || []
  }, [queue, queueTab])

  const openTimeline = async (uuid: string) => {
    setTimelineOpen(true)
    setTimeline(null)
    try {
      setTimeline(await fiscalOperationsService.getAuditTimeline(uuid))
    } catch {
      toast.error('No se pudo cargar timeline')
    }
  }

  const retryDoc = async (uuid: string) => {
    setActionLoading(uuid)
    try {
      await fiscalOperationsService.retryDocument(uuid)
      toast.success('Reprocesamiento encolado')
      load()
    } catch {
      toast.error('Error al reprocesar')
    } finally {
      setActionLoading(null)
    }
  }

  const cancelDoc = async (uuid: string) => {
    setActionLoading(uuid)
    try {
      await fiscalOperationsService.cancelDocument(uuid)
      toast.success('Documento cancelado')
      load()
    } catch {
      toast.error('No se pudo cancelar')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading && !summary) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={36} />
      </div>
    )
  }

  const cards = summary?.cards
  const timelineEvents = timeline?.merged_timeline?.length
    ? timeline.merged_timeline
    : timeline?.timeline ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Activity size={24} className="text-blue-600" />
            Operaciones Fiscales
          </h1>
          <p className="text-sm text-slate-500">Observabilidad multi-tenant — emisión V2 intacta</p>
        </div>
        <div className="flex items-center gap-2">
          {health && <Badge variant={healthVariant(health.status)}>{health.status.toUpperCase()}</Badge>}
          {alerts.length > 0 && <Badge variant="red">{alerts.length} alertas</Badge>}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {health && (
        <Card>
          <CardBody className="flex flex-wrap gap-4 text-xs text-slate-600 py-3">
            <span className="flex items-center gap-1">
              <Server size={14} /> Redis: {health.redis_connected ? 'OK' : 'OFF'}
            </span>
            <span>Cola emit: {health.queue_status.emit}</span>
            <span>Workers: {health.worker_count}</span>
            <span>DB: {health.db_status}</span>
            <span>
              SUNAT: {health.sunat_connectivity.connected}/{health.sunat_connectivity.total}
            </span>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Documentos hoy" value={cards?.documents_today ?? 0} />
        <KpiCard label="Pendientes" value={cards?.pending ?? 0} />
        <KpiCard label="Errores hoy" value={cards?.errors_today ?? 0} />
        <KpiCard label="Retries hoy" value={cards?.retries_today ?? 0} />
        <KpiCard label="Tiempo prom. ms" value={cards?.avg_duration_ms ?? '—'} />
        <KpiCard label="Tenants conectados" value={cards?.tenants_connected ?? 0} />
        <KpiCard label="Tenants con error" value={cards?.tenants_with_error ?? 0} />
      </div>

      {summary && (
        <div className="grid md:grid-cols-3 gap-4">
          <MiniBarChart
            title="Emisiones por hora"
            rows={summary.charts.emissions_by_hour as Array<Record<string, unknown>>}
            labelKey="hour_bucket"
            valueKey="total"
          />
          <MiniBarChart
            title="Errores por proveedor"
            rows={summary.charts.errors_by_provider as Array<Record<string, unknown>>}
            labelKey="provider"
            valueKey="errors"
          />
          <MiniBarChart
            title="Tiempo prom. por provider (ms)"
            rows={summary.charts.avg_duration_by_provider as Array<Record<string, unknown>>}
            labelKey="provider"
            valueKey="avg_ms"
          />
        </div>
      )}

      {alerts.length > 0 && (
        <Card>
          <CardHeader className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={16} /> Alertas activas
          </CardHeader>
          <CardBody className="space-y-2">
            {alerts.slice(0, 8).map((a) => (
              <div key={a.id} className="text-sm border-l-2 border-red-400 pl-3 py-1">
                <span className="font-medium">{a.tenant_slug || 'Global'}</span>
                <span className="text-slate-500 ml-2">{a.alert_type}</span>
                <p className="text-slate-600">{a.message}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Tenants fiscales</span>
          <div className="flex-1 flex flex-wrap gap-2 ml-auto">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2 text-slate-400" />
              <input
                className="pl-7 pr-2 py-1.5 text-sm border rounded-lg"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
              Solo errores
            </label>
            <label className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
              Solo pendientes
            </label>
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {['Tenant', 'RUC', 'Modo', 'Proveedor', 'Conexión', 'Pend.', 'Últ. emisión', 'Errores 24h', 'Retries', 'Prom. ms'].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={`${t.tenant_slug}-${t.ruc}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2 font-medium">{t.tenant_slug}</td>
                  <td className="px-3 py-2">{t.ruc}</td>
                  <td className="px-3 py-2">{t.send_mode}</td>
                  <td className="px-3 py-2">{t.provider || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={connVariant(t.connection_status)}>{t.connection_status}</Badge>
                  </td>
                  <td className="px-3 py-2">{t.pending}</td>
                  <td className="px-3 py-2 text-xs">
                    {t.last_emit_at ? new Date(t.last_emit_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2">{t.errors_24h}</td>
                  <td className="px-3 py-2">{t.retries_24h}</td>
                  <td className="px-3 py-2">{t.avg_duration_ms ?? '—'}</td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-400">
                    Sin tenants
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <BarChart3 size={16} />
          <span className="font-semibold">Monitor de cola</span>
          {queue && (
            <span className="text-xs text-slate-500 ml-2">
              Redis emit: {queue.redis.emit_queue} · retry programados: {queue.redis.retry_scheduled}
            </span>
          )}
        </CardHeader>
        <CardBody>
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['queued', 'processing', 'failed', 'retrying'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setQueueTab(tab)}
                className={`px-3 py-1 text-xs rounded-full border ${
                  queueTab === tab ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'
                }`}
              >
                {tab} ({queue ? queue[`${tab}_count`] : 0})
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs">
                <tr>
                  {['Tenant', 'Documento', 'Estado', 'Error', 'Acciones'].map((h) => (
                    <th key={h} className="text-left py-2 px-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queueItems.map((item) => (
                  <tr key={item.document_uuid} className="border-t border-slate-100">
                    <td className="py-2 px-2">{item.tenant_slug}</td>
                    <td className="py-2 px-2">
                      {item.document_type}-{item.series}-{item.number}
                    </td>
                    <td className="py-2 px-2">{item.status}</td>
                    <td className="py-2 px-2 text-xs text-red-600 max-w-md">
                      <div className="truncate" title={item.display_message || item.pse_message || item.sunat_message || ''}>
                        {item.display_message || item.pse_message || item.sunat_message || '—'}
                      </div>
                      {item.pse_response ? (
                        <div className="text-slate-500 mt-0.5 truncate">
                          PSE: isSuccess={String(item.pse_response.isSuccess ?? '—')} · estado=
                          {String(item.pse_response.estado ?? '—')}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 flex gap-1 flex-wrap">
                      <button
                        type="button"
                        disabled={actionLoading === item.document_uuid}
                        onClick={() => openTimeline(item.document_uuid)}
                        className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                      >
                        Timeline
                      </button>
                      {(item.status === 'error' || item.status === 'retrying' || item.status === 'queued') && (
                        <button
                          type="button"
                          disabled={actionLoading === item.document_uuid}
                          onClick={() => retryDoc(item.document_uuid)}
                          className="text-xs px-2 py-1 border rounded text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1"
                        >
                          <RotateCcw size={12} /> Reprocesar
                        </button>
                      )}
                      {(item.status === 'queued' || item.status === 'pending' || item.status === 'retrying') && (
                        <button
                          type="button"
                          disabled={actionLoading === item.document_uuid}
                          onClick={() => cancelDoc(item.document_uuid)}
                          className="text-xs px-2 py-1 border rounded text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                        >
                          <XCircle size={12} /> Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {queueItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      Cola vacía en esta vista
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Modal open={timelineOpen} onClose={() => setTimelineOpen(false)} title="Timeline fiscal">
        {!timeline ? (
          <Spinner size={28} />
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-slate-500">
              {timeline.tenant_slug} · {timeline.document_uuid}
            </p>
            {timelineEvents.map((ev, i) => (
              <div key={i} className="flex gap-3 text-sm border-l-2 border-blue-200 pl-3 py-1">
                <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{String(ev.type ?? ev.event_type ?? 'event')}</p>
                  <p className="text-xs text-slate-500">{String(ev.at ?? '')}</p>
                  {ev.error != null && <p className="text-xs text-red-600">{String(ev.error)}</p>}
                  {ev.error_message != null && (
                    <p className="text-xs text-red-600">{String(ev.error_message)}</p>
                  )}
                  {ev.pse_message != null && (
                    <p className="text-xs text-amber-700">PSE: {String(ev.pse_message)}</p>
                  )}
                  {ev.metadata_json != null && (
                    <p className="text-xs text-slate-600 font-mono break-all">
                      {String(ev.metadata_json)}
                    </p>
                  )}
                  {ev.status != null && <p className="text-xs">Estado: {String(ev.status)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
