import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardBody } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import TenantSearchSelect from '@/components/TenantSearchSelect'
import { backfillsService, type BackfillInfo } from '@/services/backfills.service'

/**
 * Backfills (correcciones de datos run-once, idempotentes).
 *
 * Se pueden aplicar a un tenant o a toda la flota. El backend salta los ya aplicados por
 * tenant, así que reejecutar es seguro. También corren solos en el cron de migración; esto
 * es el disparo manual a demanda.
 */
export function BackfillsPanel() {
  const [backfills, setBackfills] = useState<BackfillInfo[]>([])
  const [version, setVersion] = useState(0) // 0 = todos
  const [tenantId, setTenantId] = useState(0)
  const [running, setRunning] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmCleanAll, setConfirmCleanAll] = useState(false)

  useEffect(() => {
    backfillsService
      .list()
      .then(setBackfills)
      .catch(() => toast.error('No se pudieron cargar los backfills'))
  }, [])

  const selectedLabel =
    version === 0 ? 'todos los backfills' : backfills.find((b) => b.version === version)?.name ?? `v${version}`

  const runForTenant = async () => {
    if (!tenantId) {
      toast.error('Seleccione la empresa')
      return
    }
    setRunning(true)
    try {
      await backfillsService.runForTenant(tenantId, version)
      toast.success('Backfill ejecutado en la empresa')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error ejecutando el backfill')
    } finally {
      setRunning(false)
    }
  }

  const runForAll = async () => {
    setConfirmAll(false)
    setRunning(true)
    try {
      const res = await backfillsService.runForAll(version)
      if (res.failed > 0) {
        toast.warning(`Aplicado en ${res.aplicado}; fallaron ${res.failed}: ${(res.failed_tenants ?? []).join(', ')}`)
      } else {
        toast.success(`Backfill aplicado en ${res.aplicado} empresa(s)`)
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error ejecutando el backfill en la flota')
    } finally {
      setRunning(false)
    }
  }

  const cleanTenant = async () => {
    if (!tenantId) {
      toast.error('Seleccione la empresa')
      return
    }
    setCleaning(true)
    try {
      const n = await backfillsService.cleanupAbandonedOrders(tenantId)
      toast.success(n > 0 ? `${n} venta(s) abandonada(s) cancelada(s)` : 'No había ventas abandonadas')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error en la limpieza')
    } finally {
      setCleaning(false)
    }
  }

  const cleanAll = async () => {
    setConfirmCleanAll(false)
    setCleaning(true)
    try {
      const res = await backfillsService.cleanupAbandonedOrdersAll()
      if (res.failed > 0) {
        toast.warning(`Canceladas ${res.cancelled}; fallaron ${res.failed}: ${(res.failed_tenants ?? []).join(', ')}`)
      } else {
        toast.success(`${res.cancelled} venta(s) abandonada(s) cancelada(s) en la flota`)
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error en la limpieza de la flota')
    } finally {
      setCleaning(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-slate-800">Backfills de datos</h2>
          <p className="text-sm text-slate-500">
            Correcciones de datos idempotentes. Aplíquelas a una empresa o a toda la flota; las
            ya aplicadas se saltan solas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Backfill</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
            >
              <option value={0}>Todos los registrados</option>
              {backfills.map((b) => (
                <option key={b.version} value={b.version}>
                  v{b.version} — {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Empresa (para aplicar a una sola)</label>
            <TenantSearchSelect value={tenantId} onChange={(id) => setTenantId(id)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runForTenant}
            disabled={running || !tenantId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {running ? 'Ejecutando…' : 'Aplicar a la empresa'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
          >
            Aplicar a TODA la flota
          </button>
        </div>

        {/* Mantenimiento recurrente (no es un backfill: se puede correr cuantas veces haga
            falta, a diferencia de los backfills que se aplican una sola vez). */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <h3 className="text-sm font-bold text-slate-800">Limpiar ventas rápidas abandonadas (restaurante)</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Cancela ventas rápidas que quedaron abiertas sin cobrar (de días anteriores, sin
            mesa) y saca sus comandas de la cocina. No toca operaciones del día ni mesas ocupadas.
            Úselo con la empresa seleccionada arriba, o en toda la flota.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={cleanTenant}
              disabled={cleaning || !tenantId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {cleaning ? 'Limpiando…' : 'Limpiar en la empresa'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCleanAll(true)}
              disabled={cleaning}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
            >
              Limpiar en TODA la flota
            </button>
          </div>
        </div>
      </CardBody>

      <Modal open={confirmAll} onClose={() => setConfirmAll(false)} title="Aplicar backfill a toda la flota">
        <p className="text-slate-600 mb-4">
          Se ejecutará <strong>{selectedLabel}</strong> en todas las empresas activas. Es
          idempotente (las ya aplicadas se saltan), pero recorre toda la base. ¿Continuar?
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => setConfirmAll(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-amber-600 text-white rounded-lg"
            onClick={runForAll}
          >
            Ejecutar en la flota
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmCleanAll}
        onClose={() => setConfirmCleanAll(false)}
        title="Limpiar ventas abandonadas en toda la flota"
      >
        <p className="text-slate-600 mb-4">
          Cancelará las ventas rápidas abiertas sin cobrar (de días anteriores, sin mesa) de
          <strong> todas</strong> las empresas activas. No afecta operaciones del día. ¿Continuar?
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => setConfirmCleanAll(false)}>
            Cancelar
          </button>
          <button type="button" className="px-4 py-2 bg-amber-600 text-white rounded-lg" onClick={cleanAll}>
            Limpiar en la flota
          </button>
        </div>
      </Modal>
    </Card>
  )
}
