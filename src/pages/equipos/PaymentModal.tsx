import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Modal from '@/components/ui/Modal'
import {
  equiposOrders, METHOD_LABEL, type AccountOrder, type PaymentInput, type PaymentMethod,
} from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { money, todayISO } from './ordersCommon'
import { useConfirm } from './ConfirmProvider'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  customerId: number | null
  customerName: string
  /** Pedido sugerido para aplicar el cobro (desde el detalle del pedido). */
  orderId?: number
  /** Monto sugerido (p. ej. el saldo del pedido). */
  suggestedAmount?: number
}

const INVOICE_RE = /^[A-Za-z0-9]{1,4}-\d{1,10}$/

/** Registra un cobro del cliente y lo aplica a uno o varios pedidos con saldo. */
export default function PaymentModal({ open, onClose, onSaved, customerId, customerName, orderId, suggestedAmount }: Props) {
  const [balances, setBalances] = useState<AccountOrder[]>([])
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(todayISO())
  const [method, setMethod] = useState<PaymentMethod>('yape')
  const [moment, setMoment] = useState<'anticipado' | 'al_recoger'>('anticipado')
  const [reference, setReference] = useState('')
  const [invoice, setInvoice] = useState('')
  const [notes, setNotes] = useState('')
  const [apply, setApply] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    if (!open) return
    setAmount(suggestedAmount ? String(suggestedAmount) : '')
    setPaidAt(todayISO()); setMethod('yape'); setMoment('anticipado'); setReference(''); setInvoice(''); setNotes(''); setApply({})
    if (customerId) {
      equiposOrders.openBalances(customerId).then((rows) => {
        setBalances(rows)
        if (orderId && suggestedAmount) setApply({ [orderId]: String(suggestedAmount) })
      }).catch((e) => toast.error(apiError(e, 'No se pudieron cargar los saldos del cliente')))
    } else setBalances([])
  }, [open, customerId, orderId, suggestedAmount])

  const total = Number(amount) || 0
  const applied = useMemo(() => Object.values(apply).reduce((s, v) => s + (Number(v) || 0), 0), [apply])
  const rest = Math.round((total - applied) * 100) / 100

  const autoFill = () => {
    let left = total
    const next: Record<number, string> = {}
    for (const o of [...balances].sort((a, b) => a.order_number - b.order_number)) {
      if (left <= 0) break
      const take = Math.min(left, o.balance_amount)
      next[o.id] = take.toFixed(2)
      left = Math.round((left - take) * 100) / 100
    }
    setApply(next)
  }

  const save = async () => {
    if (!customerId) return toast.error('El pedido no tiene un cliente registrado; asocia un cliente antes de cobrar')
    if (!(total > 0)) return toast.error('Indica el monto cobrado')
    if (rest < -0.005) return toast.error('Estás aplicando más de lo cobrado')
    if (invoice.trim() && !INVOICE_RE.test(invoice.trim())) return toast.error('El comprobante debe tener el formato F002-59')
    const allocations = Object.entries(apply).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ order_id: Number(id), amount: Number(v) }))
    for (const a of allocations) {
      const b = balances.find((x) => x.id === a.order_id)
      if (b && a.amount > b.balance_amount + 0.005) return toast.error(`Pedido ${b.order_number}: solo debe ${money(b.balance_amount)}`)
    }
    const body: PaymentInput = {
      customer_id: customerId, amount: total, paid_at: paidAt, method, moment, reference: reference.trim(),
      invoice: invoice.trim().toUpperCase(), notes: notes.trim(), allocations, auto_allocate: false,
    }
    if (!(await confirm({ title: 'Registrar cobro', message: `Se registrará un cobro de ${money(total)} (${METHOD_LABEL[method]}) a nombre de ${customerName}${applied > 0 ? `, aplicado ${money(applied)} a sus pedidos` : ''}.`, confirmLabel: 'Registrar cobro' }))) return
    setSaving(true)
    try {
      await equiposOrders.createPayment(body)
      toast.success(rest > 0.005 ? `Cobro registrado. ${money(rest)} quedan como saldo a favor` : 'Cobro registrado')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo registrar el cobro'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar cobro" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Cliente: <span className="font-semibold text-slate-800">{customerName || '—'}</span></p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><label className={LABEL}>Monto cobrado *</label><input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={INPUT} /></div>
          <div><label className={LABEL}>Fecha del cobro</label><input type="date" max={todayISO()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={INPUT} /></div>
          <div>
            <label className={LABEL}>Medio</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={INPUT}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Momento</label>
            <select value={moment} onChange={(e) => setMoment(e.target.value as 'anticipado' | 'al_recoger')} className={INPUT}>
              <option value="anticipado">Anticipado</option>
              <option value="al_recoger">Al recoger</option>
            </select>
          </div>
          <div><label className={LABEL}>N° de operación</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={INPUT} /></div>
          <div><label className={LABEL}>Comprobante emitido</label><input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="F002-59" className={INPUT} /></div>
        </div>
        <div><label className={LABEL}>Notas</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} /></div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={LABEL + ' !mb-0'}>Aplicar a pedidos con saldo</label>
            <button type="button" className={BTN_SECONDARY} onClick={autoFill} disabled={!total}>Aplicar al más antiguo primero</button>
          </div>
          {balances.length === 0 ? (
            <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-3">El cliente no tiene pedidos con saldo; el cobro quedará como saldo a favor.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {balances.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800 w-16">N° {o.order_number}</span>
                  <span className="text-slate-500 flex-1">Saldo {money(o.balance_amount)} de {money(o.total_amount)}</span>
                  <input
                    type="number" min={0} step="0.01" max={o.balance_amount} placeholder="0.00" aria-label={`Aplicar al pedido ${o.order_number}`}
                    value={apply[o.id] ?? ''} onChange={(e) => setApply((a) => ({ ...a, [o.id]: e.target.value }))}
                    className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-right"
                  />
                </div>
              ))}
            </div>
          )}
          <p className={`text-xs mt-1 ${rest < -0.005 ? 'text-red-600' : 'text-slate-500'}`}>
            Aplicado {money(applied)} de {money(total)}{rest > 0.005 ? ` · ${money(rest)} quedarán como saldo a favor del cliente` : ''}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Registrar cobro'}</button>
        </div>
      </div>
    </Modal>
  )
}
