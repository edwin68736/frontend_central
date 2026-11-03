import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, PackageCheck } from 'lucide-react'
import { equiposProvider, type PanelNotification } from '@/services/equiposProvider.service'
import { formatDateTime } from '@/pages/equipos/common'

/** Refresco periódico: los avisos nacen cuando el webhook de Shalom informa un cambio. */
const REFRESH_MS = 60_000

const DOT: Record<string, string> = { success: 'bg-emerald-500', warning: 'bg-amber-500', info: 'bg-sky-500' }

/**
 * Campana de envíos del panel central: avisa cuando Shalom informa que un paquete llegó a la agencia, fue entregado o
 * tiene una demora. Es independiente de la campana de cobranza. Al tocar un aviso se marca como leído y abre el pedido.
 */
export default function EquiposNotificationsBell() {
  const navigate = useNavigate()
  const [items, setItems] = useState<PanelNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    equiposProvider.notifications().then((r) => { setItems(r.items); setUnread(r.unread) }).catch(() => { /* sin permiso o sin red: la campana queda como estaba */ })
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

  const openOrder = (n: PanelNotification) => {
    setOpen(false)
    if (!n.read_at) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
      void equiposProvider.markNotificationsRead({ ids: [n.id] })
    }
    navigate(`/equipos?tab=pedidos&order=${n.order_id}`)
  }

  const markAll = () => {
    setItems((l) => l.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })))
    setUnread(0)
    void equiposProvider.markNotificationsRead({ all: true })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title="Envíos"
        aria-label={unread > 0 ? `Envíos: ${unread} avisos sin leer` : 'Envíos'}
      >
        <PackageCheck size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-100 bg-white shadow-xl ring-1 ring-black/5 py-2 z-50 max-h-[70vh] overflow-y-auto">
          <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase">Avisos de envíos</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <CheckCheck size={12} /> Marcar todo como leído
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Sin avisos por ahora. Aparecen cuando Shalom informa llegadas, entregas o demoras.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openOrder(n)}
                className={`w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-slate-50 ${n.read_at ? '' : 'bg-indigo-50/50'}`}
              >
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read_at ? 'bg-slate-300' : (DOT[n.severity] ?? 'bg-sky-500')}`} />
                <span className="min-w-0">
                  <span className={`block text-sm ${n.read_at ? 'text-slate-600' : 'font-semibold text-slate-800'}`}>{n.title}</span>
                  <span className="block text-xs text-slate-500 truncate">{n.message}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">{formatDateTime(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
