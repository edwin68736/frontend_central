import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  migrationsService,
  type MigrationRow,
  type MigrationSummary,
  type MigrationHistoryItem,
  type DriftReport,
  type RepairResult,
  type MigrationJob,
} from '@/services/migrations.service'
import { Card, CardBody } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'
import { getTenantUrl } from '@/utils/tenantUrl'
import { BackfillsPanel } from './BackfillsPanel'
import {
  RefreshCw,
  Play,
  RotateCcw,
  Pause,
  PlayCircle,
  ExternalLink,
  Search,
  Wrench,
  History,
  AlertTriangle,
  CheckSquare,
  Square,
} from 'lucide-react'

const statusBadge = (s: string) => {
  switch (s) {
    case 'completed':
      return <Badge variant="green">Completado</Badge>
    case 'pending':
      return <Badge variant="yellow">Pendiente</Badge>
    case 'running':
      return <Badge variant="blue">Ejecutando</Badge>
    case 'failed':
      return <Badge variant="red">Fallido</Badge>
    case 'paused':
      return <Badge variant="gray">Pausado</Badge>
    case 'drifted':
      return <Badge variant="red">Drift</Badge>
    default:
      return <Badge>{s}</Badge>
  }
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </CardBody>
    </Card>
  )
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-PE')
  } catch {
    return iso
  }
}

export default function FleetMigrationsPage() {
  const [summary, setSummary] = useState<MigrationSummary | null>(null)
  const [rows, setRows] = useState<MigrationRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeJob, setActiveJob] = useState<MigrationJob | null>(null)
  const [historyModal, setHistoryModal] = useState<{ tenant: MigrationRow; items: MigrationHistoryItem[] } | null>(null)
  const [driftModal, setDriftModal] = useState<DriftReport | null>(null)
  const [repairModal, setRepairModal] = useState<RepairResult | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    action: () => Promise<void>
  } | null>(null)

  const perPage = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, list] = await Promise.all([
        migrationsService.summary(),
        migrationsService.list({
          page,
          per_page: perPage,
          status: statusFilter,
          tenant_slug: search,
          tenant_name: search,
          last_migrated_from: dateFrom || undefined,
          last_migrated_to: dateTo || undefined,
          drifted: statusFilter === 'drifted' ? true : undefined,
          failed: statusFilter === 'failed' ? true : undefined,
          pending: statusFilter === 'pending' ? true : undefined,
        }),
      ])
      setSummary(s)
      setRows(list.data ?? [])
      setTotal(list.total ?? 0)
    } catch {
      toast.error('No se pudo cargar migraciones')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'failed') return
    const t = setInterval(async () => {
      try {
        const job = await migrationsService.getJob(activeJob.id)
        setActiveJob(job)
        if (job.status === 'completed' || job.status === 'failed') {
          toast.success(`Trabajo #${job.id} finalizado`)
          load()
        }
      } catch {
        /* ignore poll errors */
      }
    }, 2000)
    return () => clearInterval(t)
  }, [activeJob, load])

  const progressPct = summary && summary.total > 0
    ? Math.round((summary.completed / summary.total) * 100)
    : 0

  const runAction = (title: string, message: string, fn: () => Promise<void>) => {
    setConfirm({ title, message, action: fn })
  }

  const pollJob = (job: MigrationJob) => {
    setActiveJob(job)
  }

  const doAction = async (tenantId: number, kind: 'retry' | 'migrate' | 'pause' | 'resume') => {
    try {
      if (kind === 'retry') await migrationsService.retry(tenantId)
      if (kind === 'migrate') await migrationsService.migrate(tenantId)
      if (kind === 'pause') await migrationsService.pause(tenantId)
      if (kind === 'resume') await migrationsService.resume(tenantId)
      toast.success('Operación completada')
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Error en la operación')
    }
  }

  const openHistory = async (row: MigrationRow) => {
    try {
      const items = await migrationsService.history(row.tenant_id)
      setHistoryModal({ tenant: row, items })
    } catch {
      toast.error('No se pudo cargar historial')
    }
  }

  const scanDrift = async (tenantId?: number) => {
    try {
      if (tenantId) {
        const report = await migrationsService.drift(tenantId)
        setDriftModal(report)
        if (!report.drift_detected) toast.success('Sin inconsistencias detectadas')
      } else {
        const res = await migrationsService.driftScan({ limit: 100, async: true })
        if (res.job) {
          pollJob(res.job)
          toast.info('Escaneo de drift iniciado en segundo plano')
        } else {
          toast.info(`${res.count ?? 0} tenants con drift detectado`)
        }
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Error al escanear drift')
    }
  }

  const repairTenant = async (tenantId: number, slug: string) => {
    try {
      const result = await migrationsService.repair(tenantId)
      setRepairModal(result)
      toast.success(result.migrated ? `Reparación de ${slug} completada` : `Reconciliación de ${slug} aplicada`)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Error al reparar')
    }
  }

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.tenant_id)))
  }

  const bulkRepairSelected = async () => {
    if (selected.size === 0) return
    try {
      const { job } = await migrationsService.bulkRepair([...selected])
      pollJob(job)
      toast.info(`Reparación masiva iniciada (${selected.size} tenants)`)
      setSelected(new Set())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || 'Error en reparación masiva')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Migraciones de esquema</h1>
          <p className="text-sm text-slate-500">
            Gestión operativa multi-tenant · target V{summary?.schema_target_version ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => scanDrift()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100"
          >
            <Search size={16} />
            Escanear inconsistencias
          </button>
          <button
            type="button"
            onClick={() =>
              runAction('Reparar drifted', '¿Reparar todos los tenants en estado drifted (lote 50)?', async () => {
                const { job } = await migrationsService.bulkRepairDrifted(50)
                pollJob(job)
                toast.info('Reparación de drifted iniciada')
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            <Wrench size={16} />
            Reparar drifted
          </button>
          <button
            type="button"
            onClick={() =>
              runAction('Reintentar fallidos', '¿Reintentar tenants fallidos (lote 50)?', async () => {
                const { job } = await migrationsService.bulkRetryFailed(50)
                pollJob(job)
                toast.info('Reintento masivo iniciado')
              })
            }
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            Reintentar fallidos
          </button>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {activeJob && activeJob.status !== 'completed' && (
        <Card>
          <CardBody>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Trabajo #{activeJob.id} · {activeJob.kind}</span>
              <Badge variant={activeJob.status === 'running' ? 'blue' : 'yellow'}>{activeJob.status}</Badge>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${activeJob.total > 0 ? (activeJob.processed / activeJob.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {activeJob.processed}/{activeJob.total} · OK {activeJob.succeeded} · Error {activeJob.failed}
            </p>
          </CardBody>
        </Card>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <StatCard label="Total" value={summary.total} />
            <StatCard label="Actualizados" value={summary.completed} />
            <StatCard label="Pendientes" value={summary.pending} />
            <StatCard label="Fallidos" value={summary.failed} />
            <StatCard label="Drift" value={summary.drifted ?? 0} />
            <StatCard label="Ejecutando" value={summary.running} />
            <StatCard label="Desactualizados" value={summary.outdated} />
            <StatCard
              label="Duración prom."
              value={Math.round((summary.avg_migration_duration_ms ?? 0) / 1000)}
              sub="seg (último fleet)"
            />
          </div>
          <p className="text-xs text-slate-500">
            Último fleet: {formatDate(summary.last_fleet_run_at)} · Sin registry: {summary.without_registry}
          </p>
          {summary.circuit_open && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-red-700">Circuit breaker abierto</p>
                  <p className="text-sm text-slate-600">{summary.circuit_reason || 'Fleet pausado'}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    runAction('Reanudar fleet', '¿Cerrar circuit breaker?', async () => {
                      await migrationsService.resumeFleet()
                      toast.success('Fleet reanudado')
                      load()
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm"
                >
                  Reanudar fleet
                </button>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardBody>
              <div className="flex justify-between text-sm mb-2">
                <span>Progreso global (completados / total)</span>
                <span className="font-medium">{summary.completed} / {summary.total} ({progressPct}%)</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span>{selected.size} seleccionados</span>
          <button type="button" onClick={bulkRepairSelected} className="text-blue-700 font-medium hover:underline">
            Reparar seleccionados
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">
            Limpiar
          </button>
        </div>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Buscar slug o empresa..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[200px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="completed">Completado</option>
              <option value="pending">Pendiente</option>
              <option value="running">Ejecutando</option>
              <option value="failed">Fallido</option>
              <option value="drifted">Drift</option>
              <option value="paused">Pausado</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              title="Migrado desde"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              title="Migrado hasta"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Spinner size={36} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-slate-500 border-b">
                  <tr>
                    <th className="py-2 pr-2 w-8">
                      <button type="button" onClick={toggleSelectAll} className="p-1">
                        {selected.size === rows.length && rows.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                    <th className="py-2 pr-4">Tenant</th>
                    <th className="py-2 pr-4">Versión</th>
                    <th className="py-2 pr-4">Aplicadas / Pend.</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Última migración</th>
                    <th className="py-2 pr-4">Error</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tenant_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 pr-2">
                        <button type="button" onClick={() => toggleSelect(r.tenant_id)} className="p-1">
                          {selected.has(r.tenant_id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-800">{r.company_name}</div>
                        <div className="text-xs text-slate-500">{r.tenant_slug}</div>
                      </td>
                      <td className="py-3 pr-4">
                        V{r.current_version} → V{r.target_version}
                      </td>
                      <td className="py-3 pr-4">
                        {r.migrations_applied} / {r.migrations_pending}
                      </td>
                      <td className="py-3 pr-4">{statusBadge(r.status)}</td>
                      <td className="py-3 pr-4 text-xs text-slate-600">{formatDate(r.last_migrated_at)}</td>
                      <td className="py-3 pr-4 max-w-[180px] truncate text-red-600 text-xs" title={r.last_error || ''}>
                        {r.last_error || '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" title="Migrar ahora" className="p-1.5 rounded hover:bg-slate-200" onClick={() =>
                            runAction('Migrar ahora', `¿Ejecutar migraciones en ${r.tenant_slug}?`, () => doAction(r.tenant_id, 'migrate'))
                          }>
                            <Play size={16} />
                          </button>
                          <button type="button" title="Reparar" className="p-1.5 rounded hover:bg-amber-100 text-amber-800" onClick={() =>
                            runAction('Reparar tenant', `¿Reparar drift y migrar ${r.tenant_slug}?`, async () => { await repairTenant(r.tenant_id, r.tenant_slug) })
                          }>
                            <Wrench size={16} />
                          </button>
                          <button type="button" title="Escanear drift" className="p-1.5 rounded hover:bg-slate-200" onClick={() => scanDrift(r.tenant_id)}>
                            <AlertTriangle size={16} />
                          </button>
                          <button type="button" title="Historial" className="p-1.5 rounded hover:bg-slate-200" onClick={() => openHistory(r)}>
                            <History size={16} />
                          </button>
                          <button type="button" title="Reintentar" className="p-1.5 rounded hover:bg-slate-200" onClick={() =>
                            runAction('Reintentar', `¿Reintentar ${r.tenant_slug}?`, () => doAction(r.tenant_id, 'retry'))
                          }>
                            <RotateCcw size={16} />
                          </button>
                          {r.status === 'paused' ? (
                            <button type="button" className="p-1.5 rounded hover:bg-slate-200" onClick={() => doAction(r.tenant_id, 'resume')}>
                              <PlayCircle size={16} />
                            </button>
                          ) : (
                            <button type="button" className="p-1.5 rounded hover:bg-slate-200" onClick={() =>
                              runAction('Pausar', `¿Pausar ${r.tenant_slug}?`, () => doAction(r.tenant_id, 'pause'))
                            }>
                              <Pause size={16} />
                            </button>
                          )}
                          <a href={getTenantUrl(r.tenant_slug)} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-slate-200 inline-flex">
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="text-center text-slate-500 py-8">Sin resultados</p>}
              <div className="flex justify-between items-center pt-4">
                <span className="text-sm text-slate-500">{total} tenants</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40">Anterior</button>
                  <span className="text-sm py-1">Pág. {page}</span>
                  <button type="button" disabled={page * perPage >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-40">Siguiente</button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={historyModal ? `Historial · ${historyModal.tenant.tenant_slug}` : ''}>
        {historyModal && (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="py-2 text-left">V</th>
                  <th className="py-2 text-left">Nombre</th>
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-left">Estado</th>
                  <th className="py-2 text-left">Fecha</th>
                  <th className="py-2 text-left">ms</th>
                </tr>
              </thead>
              <tbody>
                {historyModal.items.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="py-2">{h.version}</td>
                    <td className="py-2">{h.name}</td>
                    <td className="py-2">{h.type}</td>
                    <td className="py-2">{h.success ? <Badge variant="green">OK</Badge> : <Badge variant="red">Fail</Badge>}</td>
                    <td className="py-2">{formatDate(h.applied_at)}</td>
                    <td className="py-2">{h.duration_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historyModal.items.length === 0 && <p className="text-slate-500 py-4 text-center">Sin registros en tenant_migration_history</p>}
          </div>
        )}
      </Modal>

      <Modal open={!!driftModal} onClose={() => setDriftModal(null)} title={driftModal ? `Drift · ${driftModal.tenant_slug}` : ''}>
        {driftModal && (
          <div className="space-y-3 text-sm">
            <p>Declarada: V{driftModal.declared_version} · Probada: V{driftModal.proven_version}</p>
            {driftModal.drift_detected ? (
              <ul className="list-disc pl-5 text-red-700 space-y-1">
                {driftModal.issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            ) : (
              <p className="text-emerald-700">Sin inconsistencias detectadas.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!repairModal} onClose={() => setRepairModal(null)} title={repairModal ? `Reparación · ${repairModal.tenant_slug}` : ''}>
        {repairModal && (
          <div className="space-y-2 text-sm">
            <p>Antes: V{repairModal.declared_before} (probado V{repairModal.proven_before})</p>
            <p>Después: probado V{repairModal.proven_after}</p>
            {repairModal.invalidated_from ? <p>Historial invalidado desde V{repairModal.invalidated_from} ({repairModal.rows_invalidated} filas)</p> : null}
            {repairModal.migrated && <p className="text-emerald-700 font-medium">Migraciones ejecutadas correctamente.</p>}
            {repairModal.error && <p className="text-red-600">{repairModal.error}</p>}
            {repairModal.issues && repairModal.issues.length > 0 && (
              <ul className="list-disc pl-5 text-slate-600">{repairModal.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
        )}
      </Modal>

      <BackfillsPanel />

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ''}>
        <p className="text-slate-600 mb-4">{confirm?.message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => setConfirm(null)}>Cancelar</button>
          <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded-lg" onClick={async () => { if (confirm) await confirm.action(); setConfirm(null) }}>Confirmar</button>
        </div>
      </Modal>
    </div>
  )
}
