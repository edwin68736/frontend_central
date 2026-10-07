import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Ban, Banknote, CheckCircle2, ExternalLink, MessageCircle, Pencil, Printer, RotateCcw, Truck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  DELIVERY_MODE_LABEL, equiposOrders, METHOD_LABEL, negativeStockItems, SALE_TYPE_LABEL, type OrderView,
} from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, formatDateTime, INPUT } from './common'
import { AlertBadge, fmtDate, money, PaymentBadge, ShipmentBadge, StatusBadge, ValidationBadge } from './ordersCommon'
import { buildShippingLabel, openLabel, type LabelFormat } from './shippingLabel'
import PaymentModal from './PaymentModal'
import { equiposControl } from '@/services/equiposControl.service'
import { waLink, waText, WA_LABEL, type WaKind } from './whatsapp'

interface Props {
  orderId: number | null
  onClose: () => void
  onChanged: () => void
  onEdit: (id: number) => void
}

type Prompt = { title: string; label: string; required: boolean; confirmLabel: string; run: (text: string) => Promise<void> } | null

export default function OrderDetail({ orderId, onClose, onChanged, onEdit }: Props) {
  const { hasPermission } = useAuth()
  const [o, setO] = useState<OrderView | null>(null)
  const [busy, setBusy] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [prompt, setPrompt] = useState<Prompt>(null)
  const [promptText, setPromptText] = useState('')
  const [retOpen, setRetOpen] = useState(false)
  const [ret, setRet] = useState({ cost: '0', condition: 'buen_estado' as 'buen_estado' | 'danado', notes: '' })
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('thermal')

  const can = (p: string) => hasPermission(p)

  const load = useCallback(async () => {
    if (!orderId) return
    try {
      setO(await equiposOrders.getOrder(orderId))
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el pedido'))
      onClose()
    }
  }, [orderId, onClose])

  useEffect(() => {
    setO(null)
    void load()
  }, [load])

  const act = async (fn: () => Promise<{ order: OrderView; warnings: string[] }>, ok: string) => {
    setBusy(true)
    try {
      const r = await fn()
      r.warnings.forEach((w) => toast.warning(w, { duration: 8000 }))
      toast.success(ok)
      setO(r.order)
      onChanged()
    } catch (e) {
      const neg = negativeStockItems(e)
      if (neg) toast.error(`Stock insuficiente: ${neg.map((n) => `${n.code} quedaría en ${n.resulting}`).join(', ')}. Edita el pedido para confirmarlo con nota.`)
      else toast.error(apiError(e, 'No se pudo completar la acción'))
    } finally {
      setBusy(false)
    }
  }

  const ask = (p: NonNullable<Prompt>) => { setPromptText(''); setPrompt(p) }

  const printLabel = async () => {
    if (!o) return
    const blob = buildShippingLabel(o, labelFormat)
    if (!openLabel(blob)) toast.error('El navegador bloqueó la ventana del rótulo; permite las ventanas emergentes')
    try { await equiposOrders.labelPrinted(o.id); void load(); onChanged() } catch { /* no crítico */ }
  }

  const saveReturn = async () => {
    if (!o) return
    setBusy(true)
    try {
      await equiposControl.createReturn({ order_id: o.id, return_cost: Number(ret.cost) || 0, condition: ret.condition, notes: ret.notes })
      toast.success('Retorno registrado')
      setRetOpen(false)
      void load()
      onChanged()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo registrar el retorno'))
    } finally {
      setBusy(false)
    }
  }

  const sh = o?.shipment ?? null
  const waKinds: WaKind[] = !o || !sh ? [] : [
    ...(sh.status === 'en_transito' ? (['despachado'] as WaKind[]) : []),
    ...(sh.status === 'en_agencia' ? (['llego', 'recordatorio', 'vence_pronto'] as WaKind[]) : []),
    ...(o.balance_amount > 0 && o.payments != null && o.status === 'registrado' ? (['saldo'] as WaKind[]) : []),
  ]
  const paymentsVisible = o?.payments != null
  const isOpen = o && o.status !== 'anulado'

  return (
    <>
      <Modal open={orderId != null} onClose={onClose} title={o ? `Pedido N° ${o.order_number}` : 'Pedido'} maxWidth="max-w-4xl">
        {!o ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={o.status} />
              <ValidationBadge value={o.validation_status} />
              <PaymentBadge value={o.payment_status} />
              {sh && <ShipmentBadge value={sh.status} />}
              {sh && <AlertBadge alert={sh.alert} since={sh.days_since_arrival} left={sh.days_left} />}
              <span className="text-xs text-slate-500 ml-auto">{SALE_TYPE_LABEL[o.sale_type]} · {fmtDate(o.order_date)}</span>
            </div>

            {o.validation_status === 'observado' && o.validation_notes && (
              <div className="flex gap-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Observado: {o.validation_notes}</div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <section className="border border-slate-200 rounded-lg p-3 text-sm space-y-0.5">
                <p className="text-xs font-semibold text-slate-400 uppercase">Cliente</p>
                <p className="font-semibold text-slate-800">{o.customer_name}</p>
                <p className="text-slate-600">{o.customer_doc_type} {o.customer_doc_number}</p>
                {o.customer_phone && <p className="text-slate-600">Cel. {o.customer_phone}</p>}
                {o.contact_dni && <p className="text-slate-600">DNI de quien recoge: {o.contact_dni}</p>}
                {o.billing_doc_type !== 'ninguno' && <p className="text-slate-600">Comprobante: {o.billing_doc_type}</p>}
                {o.notes && <p className="text-slate-500 italic">{o.notes}</p>}
              </section>
              <section className="border border-slate-200 rounded-lg p-3 text-sm space-y-0.5">
                <p className="text-xs font-semibold text-slate-400 uppercase">Envío</p>
                {sh ? (
                  <>
                    <p className="font-semibold text-slate-800">{sh.carrier_name || 'Sin transportista'} · {DELIVERY_MODE_LABEL[sh.delivery_mode]}</p>
                    <p className="text-slate-600">{[sh.destination_district, sh.destination_province, sh.destination_department].filter(Boolean).join(' - ') || 'Sin destino'}</p>
                    {sh.destination_agency && <p className="text-slate-600">{sh.destination_agency}</p>}
                    <p className="text-slate-600">
                      {sh.guide_label || 'Guía'}: {sh.guide_number || '—'}
                      {sh.tracking_url && <a href={sh.tracking_url} target="_blank" rel="noreferrer" className="ml-2 text-indigo-600 inline-flex items-center gap-0.5">seguir <ExternalLink size={12} /></a>}
                    </p>
                    <p className="text-slate-500 text-xs">
                      Programado {fmtDate(sh.scheduled_dispatch_date)} · Despachado {fmtDate(sh.dispatched_at)} · Llegó {fmtDate(sh.arrived_at)}
                      {sh.pickup_deadline ? ` · Vence ${fmtDate(sh.pickup_deadline)}` : ''}{sh.picked_up_at ? ` · Recogido ${fmtDate(sh.picked_up_at)}` : ''}
                    </p>
                    {sh.dispatch_day_notice && <p className="text-xs text-amber-700">{sh.dispatch_day_notice}</p>}
                  </>
                ) : <p className="text-slate-400">Sin envío</p>}
              </section>
            </div>

            <section>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-200"><th className="py-1">Ítem</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {o.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-1.5">
                        <span className="text-slate-800">{it.product_name || it.description || it.line_type}</span>
                        {it.line_type === 'plan' && it.plan_months > 0 && <span className="text-slate-500"> · {it.plan_months} meses</span>}
                        {it.is_courtesy && <span className="ml-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5">obsequio</span>}
                        {Math.abs(it.price_deviation) > 0.3 && <span className="ml-2 text-xs text-amber-700">precio {Math.round(it.price_deviation * 100)}% vs lista</span>}
                        {it.components && <span className="block text-xs text-slate-400">{it.components.map((c) => `${c.quantity}×${c.code}`).join(' + ')}</span>}
                      </td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{money(it.unit_price)}</td>
                      <td className="text-right font-medium">{money(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-right text-sm space-y-0.5">
                <p className="text-slate-600">Total <span className="font-semibold text-slate-800">{money(o.total_amount)}</span></p>
                {paymentsVisible && <>
                  <p className="text-slate-600">Cobrado {money(o.paid_amount)}</p>
                  <p className={o.balance_amount > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'}>Saldo {money(o.balance_amount)}</p>
                </>}
              </div>
            </section>

            {paymentsVisible && (
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-slate-800">Cobros aplicados</h3>
                  {can('equipos.payments') && isOpen && o.status === 'registrado' && (
                    <button type="button" className={BTN_SECONDARY} onClick={() => setPayOpen(true)}><Banknote size={13} /> Registrar cobro</button>
                  )}
                </div>
                {(o.payments ?? []).length === 0 ? <p className="text-sm text-slate-400">Sin cobros.</p> : (
                  <ul className="text-sm divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {(o.payments ?? []).map((p) => (
                      <li key={p.payment_id} className={`flex flex-wrap gap-x-4 px-3 py-1.5 ${p.status !== 'vigente' ? 'text-slate-400 line-through' : ''}`}>
                        <span>{fmtDate(p.paid_at)}</span><span className="font-medium">{money(p.amount)}</span>
                        <span>{METHOD_LABEL[p.method] ?? p.method} · {p.moment === 'al_recoger' ? 'al recoger' : 'anticipado'}</span>
                        {p.reference && <span>Op. {p.reference}</span>}{p.invoice && <span>{p.invoice}</span>}
                        {p.payment_total !== p.amount && <span className="text-slate-400">de un cobro de {money(p.payment_total)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Historial</h3>
              <ol className="text-sm space-y-0.5">
                {o.timeline.map((t, i) => (
                  <li key={i} className={`flex gap-3 ${t.future ? 'text-slate-400' : 'text-slate-700'}`}>
                    <span className="w-36 text-slate-400 shrink-0">{formatDateTime(t.at)}</span><span>{t.label}</span>
                  </li>
                ))}
              </ol>
            </section>

            {/* Acciones */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
              {isOpen && can('equipos.update') && (
                <button type="button" className={BTN_SECONDARY} onClick={() => onEdit(o.id)}><Pencil size={13} /> Editar</button>
              )}
              {o.status === 'borrador' && can('equipos.create') && (
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void act(() => equiposOrders.confirmOrder(o.id), 'Pedido confirmado')}><CheckCircle2 size={15} /> Confirmar pedido</button>
              )}
              {o.status === 'registrado' && can('equipos.validate') && o.validation_status !== 'validado' && (
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void act(() => equiposOrders.validateOrder(o.id), 'Pedido validado')}><CheckCircle2 size={15} /> Validar datos</button>
              )}
              {o.status === 'registrado' && can('equipos.validate') && (
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => ask({ title: 'Observar pedido', label: '¿Qué hay que corregir?', required: true, confirmLabel: 'Observar', run: async (t) => act(() => equiposOrders.observeOrder(o.id, t), 'Pedido observado') })}>Observar</button>
              )}
              {o.status === 'registrado' && sh?.status === 'pendiente_envio' && can('equipos.shipments') && (
                <button type="button" className={BTN_PRIMARY} disabled={busy || o.validation_status !== 'validado'} title={o.validation_status !== 'validado' ? 'Primero valida los datos del pedido' : ''} onClick={() => void act(() => equiposOrders.dispatch(o.id), 'Pedido despachado')}><Truck size={15} /> Despachar</button>
              )}
              {sh?.status === 'en_transito' && can('equipos.shipments') && (
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void act(() => equiposOrders.arrived(o.id), 'Llegada registrada')}>Marcar llegada a agencia</button>
              )}
              {(sh?.status === 'en_agencia' || sh?.status === 'en_transito') && can('equipos.shipments') && (
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void act(() => equiposOrders.pickedUp(o.id), 'Recojo registrado')}>Cliente recogió</button>
              )}
              {o.status === 'registrado' && can('equipos.payments') && o.payment_status !== 'pagado' && (
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void act(() => equiposOrders.setNoPayment(o.id, o.payment_status !== 'no_pago'), o.payment_status === 'no_pago' ? 'Marca de sin pago quitada' : 'Marcado sin pago (obsequio/cortesía)')}>
                  {o.payment_status === 'no_pago' ? 'Quitar «sin pago»' : 'Marcar sin pago'}
                </button>
              )}
              {sh && o.status === 'registrado' && can('equipos.shipments') && (
                <span className="inline-flex items-center gap-1">
                  <select aria-label="Formato del rótulo" value={labelFormat} onChange={(e) => setLabelFormat(e.target.value as LabelFormat)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                    <option value="thermal">Térmico 100×150</option><option value="a4">A4 (2 por hoja)</option>
                  </select>
                  <button type="button" className={BTN_SECONDARY} onClick={() => void printLabel()}><Printer size={13} /> Rótulo{sh.label_printed_at ? ' (reimprimir)' : ''}</button>
                </span>
              )}
              {sh && (sh.status === 'en_transito' || sh.status === 'en_agencia') && o.status === 'registrado' && can('equipos.returns') && (
                <button type="button" className={BTN_SECONDARY} onClick={() => setRetOpen(true)}><RotateCcw size={13} /> Registrar retorno</button>
              )}
              {o.customer_phone && waKinds.map((k) => {
                const link = waLink(o.customer_phone, waText(k, { customer: o.customer_name, orderNumber: o.order_number, carrier: sh?.carrier_name, guide: sh?.guide_number, guideLabel: sh?.guide_label, agency: sh?.destination_agency, deadline: sh?.pickup_deadline ? fmtDate(sh.pickup_deadline) : undefined, balance: o.balance_amount }))
                return link ? <a key={k} href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><MessageCircle size={13} /> {WA_LABEL[k]}</a> : null
              })}
              {isOpen && can('equipos.cancel') && (
                <button type="button" className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100" disabled={busy}
                  onClick={() => ask({ title: 'Anular pedido', label: 'Motivo de la anulación', required: true, confirmLabel: 'Anular pedido', run: async (t) => act(() => equiposOrders.cancelOrder(o.id, t), 'Pedido anulado') })}>
                  <Ban size={13} /> Anular
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <PaymentModal
        open={payOpen} onClose={() => setPayOpen(false)} onSaved={() => { void load(); onChanged() }}
        customerId={o?.customer_id ?? null} customerName={o?.customer_name ?? ''} orderId={o?.id} suggestedAmount={o && o.balance_amount > 0 ? o.balance_amount : undefined}
      />

      <Modal open={retOpen} onClose={() => setRetOpen(false)} title="Registrar retorno">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Se devuelve todo el pedido; el envío pasa a «en retorno». Al recibirlo en buen estado, los equipos vuelven al stock (Retornos).</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Condición</label><select value={ret.condition} onChange={(e) => setRet({ ...ret, condition: e.target.value as 'buen_estado' | 'danado' })} className={INPUT}><option value="buen_estado">Buen estado</option><option value="danado">Dañado</option></select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Costo del retorno</label><input type="number" min={0} step="0.01" value={ret.cost} onChange={(e) => setRet({ ...ret, cost: e.target.value })} className={INPUT} /></div>
          </div>
          <input value={ret.notes} onChange={(e) => setRet({ ...ret, notes: e.target.value })} placeholder="Observaciones" className={INPUT} />
          <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => setRetOpen(false)}>Cancelar</button><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void saveReturn()}>Registrar</button></div>
        </div>
      </Modal>

      <Modal open={prompt != null} onClose={() => setPrompt(null)} title={prompt?.title ?? ''}>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">{prompt?.label}</label>
          <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={3} className={INPUT} autoFocus />
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setPrompt(null)}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} onClick={() => {
              if (prompt?.required && !promptText.trim()) return toast.error('Este dato es obligatorio')
              const run = prompt!.run
              setPrompt(null)
              void run(promptText.trim())
            }}>{prompt?.confirmLabel}</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
