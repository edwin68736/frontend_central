import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Ban, Pencil, RefreshCw, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import { useAuth } from '@/contexts/AuthContext'
import { CONDITION_LABEL, equiposControl, RETURN_STATUS_LABEL, type EquipReturnView } from '@/services/equiposControl.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, formatDateTime, INPUT, LABEL } from './common'
import OrderDetail from './OrderDetail'
import { useConfirm } from './ConfirmProvider'
import { usePaging } from './hooks'
import { fmtDate, money, SELECT, toDateInput, todayISO } from './ordersCommon'

const FILTERS = [
  { key: 'abiertos', label: 'Abiertos' }, { key: 'recibido', label: 'Recibidos' }, { key: '', label: 'Todos' },
]
/** Etapa del retorno en Shalom (la guía del retorno se vincula igual que la de un pedido). */
const STAGE_STYLE: Record<string, string> = {
  origen: 'bg-slate-100 text-slate-700 border-slate-200', transito: 'bg-sky-50 text-sky-700 border-sky-200',
  destino: 'bg-amber-50 text-amber-800 border-amber-300', entregado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const STYLE: Record<string, string> = {
  solicitado: 'bg-amber-50 text-amber-700 border-amber-200', en_camino: 'bg-sky-50 text-sky-700 border-sky-200',
  recibido: 'bg-emerald-50 text-emerald-700 border-emerald-200', desechado_por_agencia: 'bg-red-50 text-red-700 border-red-200',
  anulado: 'bg-slate-100 text-slate-500 border-slate-200',
}

/** Retornos: paquetes no recogidos que vuelven. Recibidos en buen estado reingresan al stock; los dañados solo se registran. */
export default function ReturnsTab() {
  const { hasPermission } = useAuth()
  const can = hasPermission('equipos.returns')
  // Anular un retorno es una acción aparte (permiso propio): se asigna al rol de quien lo puede revertir.
  const canCancel = hasPermission('equipos.returns_cancel')
  // Casilla «Recibido»: la usa quien recibe físicamente el equipo (permiso propio).
  const canReceive = hasPermission('equipos.returns_receive')
  const [filter, setFilter] = useState('abiertos')
  const [rows, setRows] = useState<EquipReturnView[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<EquipReturnView | null>(null)
  const [f, setF] = useState({ status: '', condition: 'buen_estado', cost: '0', unpaid: '0', received: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [onlyDestino, setOnlyDestino] = useState(false)
  // Guía del retorno
  const [guideFor, setGuideFor] = useState<EquipReturnView | null>(null)
  const [guideText, setGuideText] = useState('')
  const [guideCode, setGuideCode] = useState('')
  const [guideBusy, setGuideBusy] = useState(false)
  // Recibido
  const [recvFor, setRecvFor] = useState<EquipReturnView | null>(null)
  const [recvCond, setRecvCond] = useState<'buen_estado' | 'danado'>('buen_estado')
  const [recvBusy, setRecvBusy] = useState(false)
  const [refreshing, setRefreshing] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const confirm = useConfirm()
  const shownRows = onlyDestino ? rows.filter((x) => x.track_stage === 'destino') : rows
  const paging = usePaging(shownRows)

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

  const cancelReturn = async (r: EquipReturnView) => {
    const res = await confirm({
      title: `Anular retorno N° ${r.return_number}`,
      message: r.status === 'recibido' && r.condition === 'buen_estado'
        ? `Este retorno ya se recibió: se descontará otra vez del stock lo que reingresó (${r.items_text}) y el envío del pedido volverá a su estado anterior.`
        : 'El retorno quedará anulado y el envío del pedido volverá a su estado anterior. No se puede deshacer.',
      danger: true, pin: true, input: { label: 'Motivo de la anulación', required: true }, confirmLabel: 'Anular retorno',
    })
    if (!res) return
    try {
      await equiposControl.cancelReturn(r.id, res.text, res.pin)
      toast.success('Retorno anulado')
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo anular el retorno'))
    }
  }

  const openGuide = (r: EquipReturnView) => { setGuideFor(r); setGuideText(r.guide_number ?? ''); setGuideCode(r.provider_code ?? '') }
  const saveGuide = async () => {
    if (!guideFor) return
    setGuideBusy(true)
    try {
      const { warnings } = await equiposControl.setReturnGuide(guideFor.id, guideText.trim(), guideCode.trim())
      warnings.forEach((w) => toast.warning(w, { duration: 9000 }))
      toast.success('Guía del retorno guardada')
      setGuideFor(null)
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar la guía'))
    } finally {
      setGuideBusy(false)
    }
  }
  const refreshTracking = async (r: EquipReturnView) => {
    setRefreshing(r.id)
    try { await equiposControl.refreshReturnTracking(r.id); toast.success('Estado actualizado desde Shalom'); void load() } catch (e) { toast.error(apiError(e, 'No se pudo consultar a Shalom')) } finally { setRefreshing(null) }
  }
  const receive = async () => {
    if (!recvFor) return
    setRecvBusy(true)
    try {
      await equiposControl.receiveReturn(recvFor.id, recvCond)
      toast.success(recvCond === 'buen_estado' ? 'Retorno recibido: los equipos volvieron al stock' : 'Retorno recibido (dañado: no vuelve al stock)')
      setRecvFor(null)
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo marcar como recibido'))
    } finally {
      setRecvBusy(false)
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
        <button type="button" aria-pressed={onlyDestino} onClick={() => setOnlyDestino((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-sm border ${onlyDestino ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>En destino (por recoger)</button>
        <p className="text-xs text-slate-400 ml-2">Los retornos se registran desde el detalle del pedido, cuando el paquete está en tránsito o en agencia.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50"><th className="px-3 py-2">N°</th><th className="px-3">Pedido</th><th className="px-3">Cliente</th><th className="px-3">Equipos</th><th className="px-3">Solicitado</th><th className="px-3 text-right">Saldo no cobrado</th><th className="px-3 text-right">Costo</th><th className="px-3">Guía y seguimiento</th><th className="px-3">Estado</th><th className="px-3 text-center">Recibido</th><th /></tr></thead>
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
                  <td className="px-3 min-w-40">
                    <div className="flex items-start gap-1">
                      <div>
                        <span className="text-slate-700">{r.guide_number || <span className="text-slate-300">Sin guía</span>}</span>
                        {r.track_stage && <span className={`mt-0.5 block w-fit text-xs rounded-full border px-2 py-0.5 ${STAGE_STYLE[r.track_stage]}`}>{r.track_label}</span>}
                        {r.provider_synced_at && <span className="block text-[11px] text-slate-400">act. {formatDateTime(r.provider_synced_at)}</span>}
                      </div>
                      {can && r.status !== 'anulado' && r.status !== 'recibido' && (
                        <span className="flex flex-col gap-0.5">
                          <button type="button" title="Editar guía" aria-label={`Editar guía del retorno ${r.return_number}`} onClick={() => openGuide(r)} className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100"><Pencil size={13} /></button>
                          {r.provider_code && <button type="button" title="Actualizar desde Shalom" aria-label={`Actualizar retorno ${r.return_number} desde Shalom`} disabled={refreshing === r.id} onClick={() => void refreshTracking(r)} className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-40"><RefreshCw size={13} className={refreshing === r.id ? 'animate-spin' : ''} /></button>}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3"><span className={`text-xs rounded-full border px-2 py-0.5 whitespace-nowrap ${STYLE[r.status]}`}>{RETURN_STATUS_LABEL[r.status]}</span>{r.reshipped && <span className="block text-xs text-indigo-600">reenviado</span>}{r.status === 'anulado' && r.cancel_reason && <span className="block max-w-40 truncate text-xs text-slate-400" title={r.cancel_reason}>{r.cancel_reason}</span>}</td>
                  <td className="px-3 text-center">
                    {r.status === 'recibido' ? (
                      <input type="checkbox" checked disabled aria-label={`Retorno ${r.return_number} recibido`} className="rounded" title={r.received_at ? `Recibido el ${fmtDate(r.received_at)}` : 'Recibido'} />
                    ) : canReceive && (r.status === 'solicitado' || r.status === 'en_camino') ? (
                      <input type="checkbox" checked={false} aria-label={`Marcar el retorno ${r.return_number} como recibido`} className="rounded cursor-pointer" onChange={() => { setRecvCond('buen_estado'); setRecvFor(r) }} />
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 text-right whitespace-nowrap">
                    {can && r.status !== 'anulado' && <button type="button" className={BTN_SECONDARY} onClick={() => open(r)}>Gestionar</button>}
                    {can && r.status === 'recibido' && r.condition === 'buen_estado' && !r.reshipped && r.order_id && (
                      <button type="button" className={BTN_SECONDARY + ' ml-1'} onClick={() => void reship(r)}><RotateCcw size={12} /> Reenviar</button>
                    )}
                    {canCancel && r.status !== 'anulado' && !r.reshipped && (
                      <button type="button" className="ml-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100" onClick={() => void cancelReturn(r)}><Ban size={12} /> Anular</button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="text-center text-slate-400 py-10">No hay retornos en esta vista.</td></tr>}
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
                  {Object.entries(RETURN_STATUS_LABEL).filter(([k]) => k !== 'anulado').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
      <Modal open={guideFor != null} onClose={() => setGuideFor(null)} title={guideFor ? `Guía del retorno N° ${guideFor.return_number}` : ''}>
        <div className="space-y-3">
          <div><label className={LABEL}>N° de guía</label><input value={guideText} onChange={(e) => setGuideText(e.target.value)} placeholder="Ej. 101567718 - MKWD" className={INPUT} /></div>
          <div><label className={LABEL}>Código de Shalom (4 caracteres)</label><input value={guideCode} maxLength={4} onChange={(e) => setGuideCode(e.target.value.toUpperCase())} placeholder="Si ya viene en la guía, déjalo vacío" className={INPUT + ' font-mono w-48'} /></div>
          <p className="text-xs text-slate-500">Con el formato de Shalom (número y código) se vincula el seguimiento: verás si el retorno está En origen, En tránsito, En destino o Entregado, y el panel avisará cuando llegue a destino. Cambiar la guía reinicia el seguimiento.</p>
          <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => setGuideFor(null)}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={guideBusy} onClick={() => void saveGuide()}>{guideBusy ? 'Guardando…' : 'Guardar guía'}</button></div>
        </div>
      </Modal>

      <Modal open={recvFor != null} onClose={() => setRecvFor(null)} title={recvFor ? `Recibir retorno N° ${recvFor.return_number}` : ''}>
        {recvFor && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{recvFor.customer_name} · {recvFor.items_text}</p>
            <fieldset className="space-y-2">
              <legend className={LABEL}>Estado del equipo recibido</legend>
              {([['buen_estado', 'Buen estado', 'Vuelve al stock automáticamente.'], ['danado', 'Dañado', 'Se registra, pero no vuelve al stock.']] as const).map(([v, l, d]) => (
                <label key={v} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer ${recvCond === v ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                  <input type="radio" name="recv-cond" checked={recvCond === v} onChange={() => setRecvCond(v)} className="mt-1" />
                  <span><span className="font-medium text-slate-800">{l}</span><span className="block text-xs text-slate-500">{d}</span></span>
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => setRecvFor(null)}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={recvBusy} onClick={() => void receive()}>{recvBusy ? 'Guardando…' : 'Marcar como recibido'}</button></div>
          </div>
        )}
      </Modal>
      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} onEdit={() => setDetailId(null)} />
    </div>
  )
}
