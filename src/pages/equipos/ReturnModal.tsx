import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/Modal'
import { equiposControl } from '@/services/equiposControl.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT } from './common'
import { useConfirm } from './ConfirmProvider'

/** Registro de retorno de un pedido en tránsito o en agencia (siempre el pedido completo; pide el PIN de seguridad). */
export default function ReturnModal({ open, orderId, onClose, onDone }: {
  open: boolean
  orderId: number | null
  onClose: () => void
  onDone: () => void
}) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [ret, setRet] = useState({ cost: '0', condition: 'buen_estado' as 'buen_estado' | 'danado', notes: '' })
  useEffect(() => { if (open) setRet({ cost: '0', condition: 'buen_estado', notes: '' }) }, [open])

  const save = async () => {
    if (!orderId) return
    const r = await confirm({ title: 'Registrar retorno', message: 'Se devuelve todo el pedido. Requiere tu PIN.', pin: true, confirmLabel: 'Registrar retorno' })
    if (!r) return
    setBusy(true)
    try {
      await equiposControl.createReturn({ order_id: orderId, return_cost: Number(ret.cost) || 0, condition: ret.condition, notes: ret.notes }, r.pin)
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
        <p className="text-sm text-slate-600">Se devuelve todo el pedido; el envío pasa a «en retorno». Al recibirlo en buen estado, los equipos vuelven al stock (Retornos). No devuelve dinero: los cobros no cambian.</p>
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
