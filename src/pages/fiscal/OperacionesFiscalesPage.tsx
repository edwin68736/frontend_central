import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
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
  FiscalQueueGroup,
  FiscalQueueItem,
  FiscalQueueMonitor,
} from '@/services/fiscal-operations.service'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'
import TenantFiscalSummary from './TenantFiscalSummary'
import {
  fiscalGroup,
  isNormalActionBlocked,
  fiscalExplanation,
  retryProgressLabel,
  fiscalActionErrorMessage,
  healthStatusLabel,
  queueTabLabel,
} from '@/lib/fiscalStatus'
import { agoText, docTypeLabel, durationText, formatLima } from '@/lib/fiscalFilters'

const QUEUE_PAGE_SIZE = 25
const REFRESH_MS = 30000
const QUEUE_TABS: FiscalQueueGroup[] = ['queued', 'processing', 'retrying', 'stuck']
const ALERTS_COLLAPSED = 5

const ALERT_TYPE_LABELS: Record<string, string> = {
  cert_expiring: 'Certificado vencido',
  tenant_disconnected: 'Tenant desconectado',
  consecutive_errors: 'Errores consecutivos',
  queue_saturated: 'Cola saturada',
  retry_anomaly: 'Reintentos anormales',
}

function healthVariant(s: string): 'green' | 'yellow' | 'red' | 'gray' {
  if (s === 'healthy') return 'green'
  if (s === 'degraded') return 'yellow'
  if (s === 'critical') return 'red'
  return 'gray'
}

type Tone = 'green' | 'amber' | 'red' | 'gray'
const DOT: Record<Tone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-300',
}

function StatusChip({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span className={`w-2 h-2 rounded-full ${DOT[tone]}`} />
      <span className="text-slate-500">{label}</span>
      <b className="text-slate-800">{value}</b>
    </span>
  )
}

function KpiCard({
  label,
  hint,
  value,
  tone,
  href,
  onClick,
}: {
  label: string
  hint?: string
  value: string | number
  tone?: string
  href?: string
  onClick?: () => void
}) {
  const body = (
    <CardBody className="py-4">
      <p className={`text-2xl font-bold ${tone ?? 'text-slate-800'}`}>{value}</p>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </CardBody>
  )
  const cls = 'block text-left rounded-xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 transition'
  if (href) {
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} w-full`}>
        {body}
      </button>
    )
  }
  return <Card>{body}</Card>
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

function AlertRow({
  alert,
  busy,
  onAck,
  onResolve,
}: {
  alert: FiscalAlertItem
  busy: boolean
  onAck: (a: FiscalAlertItem) => void
  onResolve: (a: FiscalAlertItem) => void
}) {
  const acked = !!alert.acknowledged_at
  return (
    <div
      className={`flex flex-wrap items-start gap-3 border-l-4 pl-3 py-2 ${
        acked ? 'border-slate-300 opacity-70' : alert.severity === 'critical' ? 'border-red-500' : 'border-amber-400'
      }`}
    >
      <div className="flex-1 min-w-[220px]">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={alert.severity === 'critical' ? 'red' : 'yellow'}>
            {alert.severity === 'critical' ? 'Crítica' : 'Advertencia'}
          </Badge>
          <span className="font-medium text-slate-700">{ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type}</span>
          <span className="text-slate-500">· {alert.tenant_slug || 'Global'}</span>
          <span className="text-slate-400" title={formatLima(alert.created_at)}>
            · {agoText(alert.created_at)}
          </span>
          {acked && <span className="text-slate-400">· reconocida {agoText(alert.acknowledged_at)}</span>}
        </div>
        <p className="text-sm text-slate-600 mt-0.5">{alert.message}</p>
      </div>
      <div className="flex items-center gap-1">
        {!acked && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAck(alert)}
            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50"
          >
            Reconocer
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve(alert)}
          className="px-2 py-1 text-xs border border-emerald-200 text-emerald-800 bg-emerald-50 rounded hover:bg-emerald-100 disabled:opacity-50"
        >
          Resolver
        </button>
      </div>
    </div>
  )
}

export default function OperacionesFiscalesPage() {
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<FiscalHealth | null>(null)
  const [summary, setSummary] = useState<FiscalOperationsSummary | null>(null)
  const [queue, setQueue] = useState<FiscalQueueMonitor | null>(null)
  const [queueOffset, setQueueOffset] = useState(0)
  const [alerts, setAlerts] = useState<FiscalAlertItem[]>([])
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [showAcked, setShowAcked] = useState(false)
  const [alertBusy, setAlertBusy] = useState<number | null>(null)
  const [queueTab, setQueueTab] = useState<FiscalQueueGroup>('queued')
  const [timeline, setTimeline] = useState<FiscalAuditTimeline | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FiscalQueueItem | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const queueRef = useRef<HTMLDivElement>(null)
  // Un solo aviso de error por racha de fallos, no uno cada 30 s.
  const failing = useRef(false)

  // Salud/KPIs/alertas — no dependen de ninguna paginación.
  const loadCore = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fiscalOperationsService.getHealth(),
        fiscalOperationsService.getSummary(),
        fiscalOperationsService.getAlerts(),
      ])
      const [h, s, a] = results
      if (h.status === 'fulfilled') setHealth(h.value)
      if (s.status === 'fulfilled') setSummary(s.value)
      if (a.status === 'fulfilled') setAlerts(a.value.items || [])
      if (results.every((r) => r.status === 'rejected')) {
        if (!failing.current) toast.error('Error cargando operaciones fiscales')
        failing.current = true
      } else {
        failing.current = false
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // La cola se pide UN bucket a la vez, paginado.
  const loadQueue = useCallback(async () => {
    try {
      setQueue(await fiscalOperationsService.getQueue({ group: queueTab, limit: QUEUE_PAGE_SIZE, offset: queueOffset }))
    } catch {
      if (!failing.current) toast.error('Error cargando la cola')
      failing.current = true
    }
  }, [queueTab, queueOffset])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCore(), loadQueue()])
    setLastUpdate(new Date())
  }, [loadCore, loadQueue])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Auto-refresco único: se pausa con la pestaña oculta y se pone al día al volver.
  useEffect(() => {
    if (!autoRefresh) return
    const tick = () => {
      if (document.visibilityState === 'visible') refreshAll()
    }
    const id = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [autoRefresh, refreshAll])

  const changeQueueTab = (tab: FiscalQueueGroup) => {
    setQueueTab(tab)
    setQueueOffset(0)
  }

  const goToStuck = () => {
    changeQueueTab('stuck')
    queueRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const queueItems = queue?.items ?? []

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
      refreshAll()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'Error al reprocesar'))
    } finally {
      setActionLoading(null)
    }
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    const uuid = cancelTarget.document_uuid
    setActionLoading(uuid)
    try {
      await fiscalOperationsService.cancelDocument(uuid)
      toast.success('Documento cancelado y marcado como atendido')
      setCancelTarget(null)
      refreshAll()
    } catch {
      toast.error('No se pudo cancelar')
    } finally {
      setActionLoading(null)
    }
  }

  const alertAction = async (a: FiscalAlertItem, kind: 'ack' | 'resolve') => {
    setAlertBusy(a.id)
    try {
      if (kind === 'ack') await fiscalOperationsService.acknowledgeAlert(a.id)
      else await fiscalOperationsService.resolveAlert(a.id)
      toast.success(kind === 'ack' ? 'Alerta reconocida' : 'Alerta resuelta')
      await loadCore()
    } catch (err) {
      toast.error(fiscalActionErrorMessage(err, 'No se pudo actualizar la alerta'))
    } finally {
      setAlertBusy(null)
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
  const timelineEvents = timeline?.merged_timeline?.length ? timeline.merged_timeline : timeline?.timeline ?? []
  const pendingAlerts = alerts.filter((a) => !a.acknowledged_at)
  const ackedAlerts = alerts.filter((a) => !!a.acknowledged_at)
  const visibleAlerts = showAllAlerts ? pendingAlerts : pendingAlerts.slice(0, ALERTS_COLLAPSED)
  const needsAction = queue?.counts.needs_action ?? cards?.needs_action ?? 0
  const stuckCount = queue?.counts.stuck ?? cards?.stuck ?? 0

  const sunat = health?.sunat_connectivity
  const sunatTone: Tone =
    !sunat || sunat.total === 0 ? 'gray' : sunat.connected === sunat.total ? 'green' : sunat.connected === 0 ? 'red' : 'amber'
  const heartbeat = health?.worker_heartbeat_age_sec

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Activity size={24} className="text-blue-600" />
            Operaciones Fiscales
          </h1>
          <p className="text-sm text-slate-500">
            Salud del sistema, cola en vivo y alertas. Los documentos con error o rechazados se gestionan en{' '}
            <a href="/fiscal" className="text-indigo-600 hover:underline">
              Documentos fiscales
            </a>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {health && <Badge variant={healthVariant(health.status)}>{healthStatusLabel(health.status)}</Badge>}
          {pendingAlerts.length > 0 && (
            <Badge variant="red">
              {pendingAlerts.length} alerta{pendingAlerts.length === 1 ? '' : 's'} por revisar
            </Badge>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-actualizar
          </label>
          {lastUpdate && <span className="text-xs text-slate-400">{formatLima(lastUpdate.toISOString())}</span>}
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </div>

      {health && (
        <Card>
          <CardBody className="flex flex-wrap gap-x-6 gap-y-2 py-3">
            <StatusChip tone={health.redis_connected ? 'green' : 'red'} label="Redis" value={health.redis_connected ? 'OK' : 'Caído'} />
            <StatusChip
              tone={health.db_status === 'ok' ? 'green' : 'red'}
              label="Base de datos"
              value={health.db_status === 'ok' ? 'OK' : health.db_status}
            />
            <StatusChip
              tone={health.worker_count > 0 && (heartbeat == null || heartbeat < 120) ? 'green' : health.worker_count > 0 ? 'amber' : 'red'}
              label="Workers"
              value={`${health.worker_count}${heartbeat != null ? ` · latido hace ${durationText(heartbeat)}` : ''}`}
            />
            <StatusChip tone={health.queue_status.emit > 100 ? 'amber' : 'green'} label="Cola de emisión" value={`${health.queue_status.emit}`} />
            <StatusChip tone={sunatTone} label="SUNAT/PSE" value={sunat ? `${sunat.connected}/${sunat.total} conectados` : '—'} />
            {cards && (
              <StatusChip
                tone={cards.tenants_with_error > 0 ? 'amber' : 'green'}
                label="Tenants"
                value={`${cards.tenants_connected} conectados${cards.tenants_with_error > 0 ? ` · ${cards.tenants_with_error} con problema` : ''}`}
              />
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard
          label="Por atender"
          hint="Con error, rechazados o anulados"
          value={needsAction}
          tone={needsAction > 0 ? 'text-red-600' : undefined}
          href="/fiscal?view=needs_action"
        />
        <KpiCard label="Pendientes ahora" hint="En cola o reintentando" value={cards?.pending ?? 0} href="/fiscal?view=processing" />
        <KpiCard
          label="Atascados"
          hint="Sin avanzar hace rato"
          value={stuckCount}
          tone={stuckCount > 0 ? 'text-red-600' : undefined}
          onClick={goToStuck}
        />
        <KpiCard label="Documentos hoy" value={cards?.documents_today ?? 0} />
        <KpiCard label="Errores hoy" hint="Eventos de envío fallidos" value={cards?.errors_today ?? 0} />
        <KpiCard label="Reintentos hoy" value={cards?.retries_today ?? 0} />
        <KpiCard label="Tiempo prom. (ms)" value={cards?.avg_duration_ms ?? '—'} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center gap-2">
          <Bell size={16} className={pendingAlerts.length > 0 ? 'text-red-600' : 'text-slate-400'} />
          <span className="font-semibold">Alertas</span>
          <span className="text-xs text-slate-500">
            {pendingAlerts.length === 0 ? 'Sin alertas por revisar' : `${pendingAlerts.length} por revisar`}
            {ackedAlerts.length > 0 ? ` · ${ackedAlerts.length} reconocidas` : ''}
          </span>
        </CardHeader>
        <CardBody className="space-y-2">
          {pendingAlerts.length === 0 && (
            <p className="text-sm text-slate-400">No hay alertas activas. Las que dejan de cumplirse se cierran solas.</p>
          )}
          {visibleAlerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              busy={alertBusy === a.id}
              onAck={(x) => alertAction(x, 'ack')}
              onResolve={(x) => alertAction(x, 'resolve')}
            />
          ))}
          {pendingAlerts.length > ALERTS_COLLAPSED && (
            <button type="button" onClick={() => setShowAllAlerts((v) => !v)} className="text-xs text-indigo-600 hover:underline">
              {showAllAlerts ? 'Ver menos' : `Ver las ${pendingAlerts.length} alertas`}
            </button>
          )}
          {ackedAlerts.length > 0 && (
            <div className="pt-1">
              <button type="button" onClick={() => setShowAcked((v) => !v)} className="text-xs text-slate-500 hover:underline">
                {showAcked ? 'Ocultar reconocidas' : `Ver reconocidas (${ackedAlerts.length})`}
              </button>
              {showAcked && (
                <div className="mt-2 space-y-2">
                  {ackedAlerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      busy={alertBusy === a.id}
                      onAck={(x) => alertAction(x, 'ack')}
                      onResolve={(x) => alertAction(x, 'resolve')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

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
            title="Tiempo prom. por proveedor (ms)"
            rows={summary.charts.avg_duration_by_provider as Array<Record<string, unknown>>}
            labelKey="provider"
            valueKey="avg_ms"
          />
        </div>
      )}

      <TenantFiscalSummary />

      <div ref={queueRef}>
        <Card>
          <CardHeader className="flex flex-wrap items-center gap-2">
            <BarChart3 size={16} />
            <span className="font-semibold">Monitor de cola</span>
            {queue && (
              <span className="text-xs text-slate-500 ml-2">
                Redis emit: {queue.redis.emit_queue} · retry programados: {queue.redis.retry_scheduled}
              </span>
            )}
          </CardHeader>
          <CardBody>
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              {QUEUE_TABS.map((tab) => {
                const n = queue?.counts[tab] ?? 0
                const alarm = tab === 'stuck' && n > 0
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => changeQueueTab(tab)}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      queueTab === tab
                        ? alarm
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-blue-600 text-white border-blue-600'
                        : alarm
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-white text-slate-600'
                    }`}
                  >
                    {queueTabLabel(tab)} ({n})
                  </button>
                )
              })}
              <a
                href="/fiscal?view=needs_action"
                className="ml-auto inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                <ExternalLink size={12} /> {needsAction.toLocaleString()} con error o rechazados por atender — Documentos fiscales
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    {['Tenant', 'Documento', 'Estado', 'Tiempo en este estado', 'Mensaje', 'Acciones'].map((h) => (
                      <th key={h} className="text-left py-2 px-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queueItems.map((item) => {
                    const g = fiscalGroup(item.status, item.error_type, item.retryable)
                    const progress = retryProgressLabel(item.retry_count, item.error_type, item.retryable)
                    const explanation = fiscalExplanation(item.status, item.error_type, item.retryable)
                    const message = item.display_message || item.pse_message || item.sunat_message || ''
                    return (
                      <tr key={item.document_uuid} className="border-t border-slate-100">
                        <td className="py-2 px-2">{item.tenant_slug}</td>
                        <td className="py-2 px-2">
                          <div className="font-mono text-xs">
                            {item.series}-{item.number}
                          </div>
                          <div className="text-xs text-slate-400">{docTypeLabel(item.document_type)}</div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={g.variant}>{g.label}</Badge>
                            {progress && <span className="text-[11px] text-slate-500">{progress}</span>}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-xs whitespace-nowrap">
                          {item.age_seconds != null ? (
                            <span
                              className={item.stuck ? 'text-red-600 font-medium' : 'text-slate-600'}
                              title={item.updated_at ? formatLima(item.updated_at) : undefined}
                            >
                              {durationText(item.age_seconds)}
                              {item.stuck && ' · atascado'}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs max-w-md">
                          <div className="truncate text-red-600" title={message}>
                            {message || '—'}
                          </div>
                          {item.pse_response ? (
                            <div className="text-slate-500 mt-0.5 truncate">
                              PSE: isSuccess={String(item.pse_response.isSuccess ?? '—')} · estado={String(item.pse_response.estado ?? '—')}
                            </div>
                          ) : null}
                          {explanation ? <div className="text-slate-500 mt-0.5 truncate">{explanation}</div> : null}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex gap-1 flex-wrap">
                            <button
                              type="button"
                              disabled={actionLoading === item.document_uuid}
                              onClick={() => openTimeline(item.document_uuid)}
                              className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                            >
                              Línea de tiempo
                            </button>
                            {(item.status === 'error' || item.status === 'retrying' || item.status === 'queued') &&
                              !isNormalActionBlocked(item.status, item.error_type) && (
                                <button
                                  type="button"
                                  disabled={actionLoading === item.document_uuid}
                                  onClick={() => retryDoc(item.document_uuid)}
                                  className="text-xs px-2 py-1 border rounded text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1"
                                >
                                  <RotateCcw size={12} /> Reprocesar
                                </button>
                              )}
                            {item.status === 'error' && isNormalActionBlocked(item.status, item.error_type) && (
                              <span className="text-xs text-slate-500 self-center">
                                Requiere acción administrativa (forzar desde Documentos Fiscales)
                              </span>
                            )}
                            {(item.status === 'queued' || item.status === 'pending' || item.status === 'retrying') && (
                              <button
                                type="button"
                                disabled={actionLoading === item.document_uuid}
                                onClick={() => setCancelTarget(item)}
                                className="text-xs px-2 py-1 border rounded text-red-700 hover:bg-red-50 inline-flex items-center gap-1"
                              >
                                <XCircle size={12} /> Cancelar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {queueItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400">
                        {queueTab === 'stuck' ? 'Nada atascado: todo avanza con normalidad' : 'Cola vacía en esta vista'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
            <span className="text-slate-500">
              {queue && queue.total > 0
                ? `Mostrando ${queueOffset + 1}-${Math.min(queueOffset + QUEUE_PAGE_SIZE, queue.total)} de ${queue.total}`
                : 'Sin documentos'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQueueOffset((o) => Math.max(0, o - QUEUE_PAGE_SIZE))}
                disabled={queueOffset <= 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              <button
                type="button"
                onClick={() => setQueueOffset((o) => o + QUEUE_PAGE_SIZE)}
                disabled={!queue || queueOffset + QUEUE_PAGE_SIZE >= queue.total}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40"
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Modal open={cancelTarget !== null} onClose={() => !actionLoading && setCancelTarget(null)} title="Cancelar documento" maxWidth="max-w-md">
        {cancelTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Se cancelará{' '}
              <b>
                {docTypeLabel(cancelTarget.document_type)} {cancelTarget.series}-{cancelTarget.number}
              </b>{' '}
              de <b>{cancelTarget.tenant_slug}</b>: dejará de reintentarse y no se enviará a SUNAT.
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Queda marcado como <b>atendido</b> (motivo "Cancelado desde Operaciones fiscales"), así que no aparecerá entre los pendientes de
              Documentos fiscales. Se puede revertir con "Quitar atendido".
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={actionLoading !== null}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={actionLoading !== null}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Cancelando…' : 'Cancelar documento'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={timelineOpen} onClose={() => setTimelineOpen(false)} title="Línea de tiempo fiscal">
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
                  <p className="text-xs text-slate-500">{formatLima(ev.at == null ? null : String(ev.at))}</p>
                  {ev.error != null && <p className="text-xs text-red-600">{String(ev.error)}</p>}
                  {ev.error_message != null && <p className="text-xs text-red-600">{String(ev.error_message)}</p>}
                  {ev.pse_message != null && <p className="text-xs text-amber-700">PSE: {String(ev.pse_message)}</p>}
                  {ev.metadata_json != null && <p className="text-xs text-slate-600 font-mono break-all">{String(ev.metadata_json)}</p>}
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
