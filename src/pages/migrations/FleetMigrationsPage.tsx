import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  migrationsService,
  type MigrationRow,
  type MigrationSummary,
} from '@/services/migrations.service'
import { Card, CardBody } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'
import { getTenantUrl } from '@/utils/tenantUrl'
import { RefreshCw, Play, RotateCcw, Pause, PlayCircle, ExternalLink } from 'lucide-react'

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

export default function FleetMigrationsPage() {
  const [summary, setSummary] = useState<MigrationSummary | null>(null)
  const [rows, setRows] = useState<MigrationRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
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
  }, [page, statusFilter, search])

  useEffect(() => {
    load()
  }, [load])

  const migratedCount = summary
    ? summary.completed
    : 0
  const progressPct = summary && summary.total > 0
    ? Math.round((migratedCount / summary.total) * 100)
    : 0

  const runAction = (title: string, message: string, fn: () => Promise<void>) => {
    setConfirm({ title, message, action: fn })
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fleet Migrations</h1>
          <p className="text-sm text-slate-500">
            Estado del esquema por tenant · target V{summary?.schema_target_version ?? '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total tenants" value={summary.total} />
            <StatCard label="Completados" value={summary.completed} />
            <StatCard label="Pendientes" value={summary.pending} />
            <StatCard label="Ejecutando" value={summary.running} />
            <StatCard label="Fallidos" value={summary.failed} />
            <StatCard label="Bloqueados" value={summary.blocked} sub="backoff activo" />
            <StatCard label="Desactualizados" value={summary.outdated} sub={`sin registry: ${summary.without_registry}`} />
          </div>
          {summary.circuit_open && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-red-700">Circuit breaker abierto</p>
                  <p className="text-sm text-slate-600">{summary.circuit_reason || 'Fleet pausado por fallos consecutivos'}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    runAction('Reanudar fleet', '¿Cerrar circuit breaker y permitir migraciones?', async () => {
                      await migrationsService.resumeFleet()
                      toast.success('Fleet reanudado')
                      load()
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
                >
                  Reanudar fleet
                </button>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardBody>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Progreso fleet (completados / total)</span>
                <span className="font-medium">{migratedCount} / {summary.total} ({progressPct}%)</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </CardBody>
          </Card>
        </>
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
              <option value="paused">Pausado</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size={36} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-slate-500 border-b">
                  <tr>
                    <th className="py-2 pr-4">Tenant</th>
                    <th className="py-2 pr-4">Versión</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Intentos</th>
                    <th className="py-2 pr-4">Error</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((r) => (
                    <tr key={r.tenant_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-800">{r.company_name}</div>
                        <div className="text-xs text-slate-500">{r.tenant_slug}</div>
                      </td>
                      <td className="py-3 pr-4">{r.current_version}</td>
                      <td className="py-3 pr-4">{r.target_version}</td>
                      <td className="py-3 pr-4">{statusBadge(r.status)}</td>
                      <td className="py-3 pr-4">{r.attempts}</td>
                      <td className="py-3 pr-4 max-w-[200px] truncate text-red-600 text-xs" title={r.last_error || ''}>
                        {r.last_error || '—'}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            title="Retry"
                            className="p-1.5 rounded hover:bg-slate-200"
                            onClick={() =>
                              runAction('Reintentar migración', `¿Reintentar ${r.tenant_slug}?`, () =>
                                doAction(r.tenant_id, 'retry'),
                              )
                            }
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            type="button"
                            title="Migrate"
                            className="p-1.5 rounded hover:bg-slate-200"
                            onClick={() =>
                              runAction('Migrar tenant', `¿Ejecutar migrate en ${r.tenant_slug}?`, () =>
                                doAction(r.tenant_id, 'migrate'),
                              )
                            }
                          >
                            <Play size={16} />
                          </button>
                          {r.status === 'paused' ? (
                            <button
                              type="button"
                              title="Resume"
                              className="p-1.5 rounded hover:bg-slate-200"
                              onClick={() => doAction(r.tenant_id, 'resume')}
                            >
                              <PlayCircle size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Pause"
                              className="p-1.5 rounded hover:bg-slate-200"
                              onClick={() =>
                                runAction('Pausar', `¿Pausar migraciones de ${r.tenant_slug}?`, () =>
                                  doAction(r.tenant_id, 'pause'),
                                )
                              }
                            >
                              <Pause size={16} />
                            </button>
                          )}
                          <a
                            href={getTenantUrl(r.tenant_slug)}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded hover:bg-slate-200 inline-flex"
                            title="Abrir tenant"
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="text-center text-slate-500 py-8">Sin resultados</p>
              )}
              <div className="flex justify-between items-center pt-4">
                <span className="text-sm text-slate-500">{total} tenants</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-sm py-1">Pág. {page}</span>
                  <button
                    type="button"
                    disabled={page * perPage >= total}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title || ''}
      >
        <p className="text-slate-600 mb-4">{confirm?.message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => setConfirm(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            onClick={async () => {
              if (confirm) await confirm.action()
              setConfirm(null)
            }}
          >
            Confirmar
          </button>
        </div>
      </Modal>
    </div>
  )
}
