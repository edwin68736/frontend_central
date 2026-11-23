import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/Modal'
import { equiposControl, type ReturnableItem } from '@/services/equiposControl.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT } from './common'
import { useConfirm } from './ConfirmProvider'

/** Registro de retorno de un pedido: completo (en tránsito o en agencia) o parcial por producto (también sobre un envío ya recogido). Pide el PIN. */
export default function ReturnModal({ open, orderId, onClose, onDone }: {
  open: boolean
  orderId: number | null
  onClose: () => void
  onDone: () => void
}) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [ret, setRet] = useState({ cost: '0', condition: 'buen_estado' as 'buen_estado' | 'danado', notes: '' })
  const [lines, setLines] = useState<ReturnableItem[]>([])
  const [qty, setQty] = useState<Record<number, string>>({})
  useEffect(() => {
    if (!open || !orderId) return
    setRet({ cost: '0', condition: 'buen_estado', notes: '' })
    setLines([]); setQty({})
    let alive = true
    equiposControl.returnableItems(orderId).then((r) => {
      if (!alive) return
      setLines(r)
      setQty(Object.fromEntries(r.map((l) => [l.product_id, String(l.available)])))
    }).catch(() => { /* sin lista: se devuelve el pedido completo como antes */ })
    return () => { alive = false }
  }, [open, orderId])
  const picked = lines.map((l) => ({ product_id: l.product_id, quantity: Math.min(Math.max(Math.floor(Number(qty[l.product_id]) || 0), 0), l.available) })).filter((x) => x.quantity > 0)
  const isFull = lines.length > 0 && lines.every((l) => l.returned === 0 && (picked.find((x) => x.product_id === l.product_id)?.quantity ?? 0) === l.sold)


  const save = async () => {
    if (!orderId) return
    if (lines.length > 0 && picked.length === 0) { toast.error('Indica la cantidad a devolver de al menos un producto'); return }
    const r = await confirm({ title: 'Registrar retorno', message: isFull || lines.length === 0 ? 'Se devuelve todo el pedido. Requiere tu PIN.' : 'Se devuelve solo lo indicado; el pedido sigue vigente. Requiere tu PIN.', pin: true, confirmLabel: 'Registrar retorno' })
    if (!r) return
    setBusy(true)
    try {
      await equiposControl.createReturn({ order_id: orderId, items: lines.length > 0 ? picked : undefined, return_cost: Number(ret.cost) || 0, condition: ret.condition, notes: ret.notes }, r.pin)
      toast.success('Retorno registrado')
      onClose()
      onDone()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo registrar el retorno'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar retorno">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Indica cuánto de cada producto se devuelve. Si es todo, el envío pasa a «en retorno»; si es una parte, el pedido sigue vigente. Al recibirlo en buen estado vuelve al stock; dañado, se suma en Stock › Dañados. No devuelve dinero: los cobros no cambian.</p>
        {lines.length > 0 && (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {lines.map((l) => (
              <div key={l.product_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0"><div className="font-medium text-slate-800 truncate">{l.code}{l.name && l.name !== l.code ? ' · ' + l.name : ''}</div><div className="text-xs text-slate-500">Enviado {l.sold}{l.returned > 0 ? ' · ya devuelto ' + l.returned : ''} · disponible {l.available}</div></div>
                <input type="number" min={0} max={l.available} disabled={l.available === 0} value={qty[l.product_id] ?? ''} onChange={(e) => setQty({ ...qty, [l.product_id]: e.target.value })} aria-label={'Cantidad a devolver de ' + l.code} className={INPUT + ' !w-20 text-right'} />
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Condición</label><select value={ret.condition} onChange={(e) => setRet({ ...ret, condition: e.target.value as 'buen_estado' | 'danado' })} className={INPUT}><option value="buen_estado">Buen estado</option><option value="danado">Dañado</option></select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Costo del retorno</label><input type="number" min={0} step="0.01" value={ret.cost} onChange={(e) => setRet({ ...ret, cost: e.target.value })} className={INPUT} /></div>
        </div>
        <input value={ret.notes} onChange={(e) => setRet({ ...ret, notes: e.target.value })} placeholder="Observaciones" className={INPUT} />
        <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void save()}>Registrar</button></div>
      </div>
    </Modal>
  )
}
