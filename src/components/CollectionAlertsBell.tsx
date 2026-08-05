import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, FileCheck2, AlertTriangle, UserX } from 'lucide-react'
import { paymentsService, type CollectionAlerts } from '../services/payments.service'

/** Refresco periódico: la cobranza cambia por el cron y por lo que suben los tenants. */
const REFRESH_MS = 60_000

function money(n: number) {
  return `S/ ${n.toFixed(2)}`
}

/**
 * Campana de cobranza del panel central.
 *
 * Dos grupos: comprobantes por validar (los subió el tenant) y cobros que agotaron su ventana
 * de pago. Los que además nunca pagaron nada son altas que no se concretaron —ahí es donde el
 * usuario central decide suspender o anular—, así que van marcados aparte.
 */
export default function CollectionAlertsBell() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<CollectionAlerts | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    paymentsService
      .alerts()
      .then(setAlerts)
      .catch(() => setAlerts(null))
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const total = alerts?.total ?? 0
  const pending = alerts?.pending_review ?? []
  const overdue = alerts?.overdue ?? []

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title="Cobranza"
      >
        <Bell size={20} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-100 bg-white shadow-xl ring-1 ring-black/5 py-2 z-50 max-h-[70vh] overflow-y-auto">
          {pending.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase border-b border-slate-100">
                Comprobantes por validar ({pending.length})
              </div>
              {pending.map(a => (
                <button
                  key={`p-${a.payment_id}`}
                  type="button"
                  onClick={() => go('/payments?status=pending')}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileCheck2 size={18} className="text-blue-500 shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="font-medium block truncate">{a.tenant_name}</span>
                    <span className="text-xs text-slate-500">
                      Envió un comprobante de {money(a.amount)}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}

          {overdue.length > 0 && (
            <>
              <div
                className={`px-3 py-2 text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 ${
                  pending.length > 0 ? 'mt-1' : ''
                }`}
              >
                Cobros vencidos ({overdue.length})
              </div>
              {overdue.map(a => (
                <button
                  key={`c-${a.billing_cycle_id}`}
                  type="button"
                  onClick={() => go('/subscriptions')}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {a.never_paid ? (
                    <UserX size={18} className="text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0">
                    <span className="font-medium block truncate">{a.tenant_name}</span>
                    <span className="text-xs text-slate-500">
                      {money(a.amount)}
                      {a.days_overdue ? ` · ${a.days_overdue} día(s) de atraso` : ''}
                      {a.never_paid ? ' · nunca pagó' : ''}
                      {a.tenant_suspended ? ' · ya suspendido' : ''}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}

          {total === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              Sin pendientes de cobranza
            </div>
          )}
        </div>
      )}
    </div>
  )
}
