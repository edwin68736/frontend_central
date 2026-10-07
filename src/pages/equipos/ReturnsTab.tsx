import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import { useAuth } from '@/contexts/AuthContext'
import { CONDITION_LABEL, equiposControl, RETURN_STATUS_LABEL, type EquipReturnView } from '@/services/equiposControl.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import OrderDetail from './OrderDetail'
import { useConfirm } from './ConfirmProvider'
import { usePaging } from './hooks'
import { fmtDate, money, SELECT, toDateInput, todayISO } from './ordersCommon'

const FILTERS = [
  { key: 'abiertos', label: 'Abiertos' }, { key: 'recibido', label: 'Recibidos' }, { key: '', label: 'Todos' },
]
const STYLE: Record<string, string> = {
  solicitado: 'bg-amber-50 text-amber-700 border-amber-200', en_camino: 'bg-sky-50 text-sky-700 border-sky-200',
  recibido: 'bg-emerald-50 text-emerald-700 border-emerald-200', desechado_por_agencia: 'bg-red-50 text-red-700 border-red-200',
}

/** Retornos: paquetes no recogidos que vuelven. Recibidos en buen estado reingresan al stock; los dañados solo se registran. */
export default function ReturnsTab() {
  const { hasPermission } = useAuth()
  const can = hasPermission('equipos.returns')
  const [filter, setFilter] = useState('abiertos')
  const [rows, setRows] = useState<EquipReturnView[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<EquipReturnView | null>(null)
  const [f, setF] = useState({ status: '', condition: 'buen_estado', cost: '0', unpaid: '0', received: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const confirm = useConfirm()
  const paging = usePaging(rows)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await equiposControl.listReturns(filter || undefined))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los retornos'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void load() }, [load])

  const open = (r: EquipReturnView) => {
    setEdit(r)
    setF({ status: r.status, condition: r.condition, cost: String(r.return_cost), unpaid: String(r.unpaid_balance), received: toDateInput(r.received_at) || todayISO(), notes: r.notes })
  }
  const closed = edit?.status === 'recibido' || edit?.status === 'desechado_por_agencia'

  const save = async () => {
    if (!edit) return
    const closing = f.status === 'recibido' && edit.status !== 'recibido'
    const ok = await confirm({ title: 'Guardar retorno', message: closing ? (f.condition === 'buen_estado' ? 'Al marcarlo como recibido en buen estado, los equipos vuelven al stock. No se podrá deshacer.' : 'Se cerrará el retorno como recibido en mal estado; no vuelve al stock.') : 'Se actualizarán los datos del retorno.', confirmLabel: 'Guardar' })
    if (!ok) return
    setSaving(true)
    try {
      await equiposControl.updateReturn(edit.id, {
        status: f.status, condition: f.condition, return_cost: Number(f.cost) || 0, unpaid_balance: Number(f.unpaid) || 0,
        received_at: f.status === 'recibido' || f.status === 'desechado_por_agencia' ? f.received : undefined, notes: f.notes,
      })
      toast.success(f.status === 'recibido' && f.condition === 'buen_estado' && edit.status !== 'recibido' ? 'Retorno recibido: los equipos volvieron al stock' : 'Retorno actualizado')
      setEdit(null)
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el retorno'))
    } finally {
      setSaving(false)
    }
  }

  const reship = async (r: EquipReturnView) => {
    if (!(await confirm({ title: 'Reenviar pedido', message: `Se creará un nuevo envío para el pedido N° ${r.order_number} y se descontará otra vez el stock de ${r.items_text}.`, confirmLabel: 'Reenviar' }))) return
    try {
      await equiposControl.reship(r.id)
      toast.success('Se creó un nuevo envío para el pedido (queda por despachar) y el stock se descontó')
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo reenviar'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {FILTERS.map((x) => (
          <button key={x.key} type="button" onClick={() => setFilter(x.key)} aria-pressed={filter === x.key}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filter === x.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>{x.label}</button>
        ))}
        <p className="text-xs text-slate-400 ml-2">Los retornos se registran desde el detalle del pedido, cuando el paquete está en tránsito o en agencia.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50"><th className="px-3 py-2">N°</th><th className="px-3">Pedido</th><th className="px-3">Cliente</th><th className="px-3">Equipos</th><th className="px-3">Solicitado</th><th className="px-3 text-right">Saldo no cobrado</th><th className="px-3 text-right">Costo</th><th className="px-3">Estado</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {paging.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">{r.return_number}</td>
                  <td className="px-3">{r.order_id ? <button type="button" className="text-indigo-600 hover:underline" onClick={() => setDetailId(r.order_id)}>N° {r.order_number}</button> : '—'}</td>
                  <td className="px-3">{r.customer_name}<span className="block text-xs text-slate-400">{r.guide_number}</span></td>
                  <td className="px-3 text-slate-600">{r.items_text}<span className="block text-xs text-slate-400">{CONDITION_LABEL[r.condition]}</span></td>
                  <td className="px-3 whitespace-nowrap">{fmtDate(r.requested_at)}</td>
                  <td className="px-3 text-right">{money(r.unpaid_balance)}</td>
                  <td className="px-3 text-right">{money(r.return_cost)}</td>
                  <td className="px-3"><span className={`text-xs rounded-full border px-2 py-0.5 whitespace-nowrap ${STYLE[r.status]}`}>{RETURN_STATUS_LABEL[r.status]}</span>{r.reshipped && <span className="block text-xs text-indigo-600">reenviado</span>}</td>
                  <td className="px-3 text-right whitespace-nowrap">
                    {can && <button type="button" className={BTN_SECONDARY} onClick={() => open(r)}>Gestionar</button>}
                    {can && r.status === 'recibido' && r.condition === 'buen_estado' && !r.reshipped && r.order_id && (
                      <button type="button" className={BTN_SECONDARY + ' ml-1'} onClick={() => void reship(r)}><RotateCcw size={12} /> Reenviar</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-10">No hay retornos en esta vista.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {!loading && rows.length > 0 && <PaginationBar {...paging.barProps} itemLabel="retornos" />}

      <Modal open={edit != null} onClose={() => setEdit(null)} title={edit ? `Retorno N° ${edit.return_number}` : ''}>
        {edit && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{edit.customer_name} · {edit.items_text}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Estado</label>
                <select value={f.status} disabled={closed} onChange={(e) => setF({ ...f, status: e.target.value })} className={INPUT}>
                  {Object.entries(RETURN_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Condición</label>
                <select value={f.condition} disabled={closed} onChange={(e) => setF({ ...f, condition: e.target.value })} className={INPUT}>
                  {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className={LABEL}>Costo del retorno</label><input type="number" min={0} step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className={INPUT} /></div>
              <div><label className={LABEL}>Saldo no cobrado</label><input type="number" min={0} step="0.01" value={f.unpaid} onChange={(e) => setF({ ...f, unpaid: e.target.value })} className={INPUT} /></div>
              {(f.status === 'recibido' || f.status === 'desechado_por_agencia') && (
                <div><label className={LABEL}>Fecha de recepción</label><input type="date" max={todayISO()} value={f.received} onChange={(e) => setF({ ...f, received: e.target.value })} className={SELECT + ' w-full'} /></div>
              )}
            </div>
            <div><label className={LABEL}>Observaciones</label><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={INPUT} /></div>
            {f.status === 'recibido' && !closed && (
              <p className="text-xs text-slate-500">{f.condition === 'buen_estado' ? 'Al guardar, los equipos reingresan al stock.' : 'Dañado: se registra sin reingresar al stock. Si corresponde, haz una baja o ajuste con nota.'}</p>
            )}
            <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => setEdit(null)}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
          </div>
        )}
      </Modal>
      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} onEdit={() => setDetailId(null)} />
    </div>
  )
}
