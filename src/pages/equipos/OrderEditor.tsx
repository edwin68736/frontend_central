import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import {
  equiposService, type EquipCarrier, type EquipCombo, type EquipProduct,
} from '@/services/equipos.service'
import {
  DELIVERY_MODE_LABEL, equiposOrders, negativeStockItems, type DeliveryMode, type EquipCustomerRow, type LineType,
  type NegativeStockItem, type OrderInput, type OrderItemInput, type OrderView, type SaleType,
} from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { money, toDateInput, todayISO } from './ordersCommon'

const DEPARTMENTS = ['Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali']

const emptyItem = (): OrderItemInput => ({ line_type: 'producto', product_id: null, combo_id: null, description: '', plan_months: 0, quantity: 1, unit_price: 0, is_courtesy: false, notes: '' })

const emptyShipment = (carrierId: number | null) => ({
  carrier_id: carrierId, guide_number: '', destination_agency: '', destination_department: '', destination_province: '',
  destination_district: '', delivery_mode: 'agencia' as DeliveryMode, scheduled_dispatch_date: '', notes: '',
})

const emptyForm = (carrierId: number | null): OrderInput => ({
  customer_id: null, customer_name: '', customer_doc_type: 'DNI', customer_doc_number: '', contact_dni: '', customer_phone: '',
  save_customer: true, sale_type: 'independiente', order_date: todayISO(), billing_doc_type: 'ninguno', notes: '',
  items: [emptyItem()], shipment: emptyShipment(carrierId),
})

function fromView(o: OrderView): OrderInput {
  return {
    customer_id: o.customer_id, customer_name: o.customer_name, customer_doc_type: o.customer_doc_type || 'DNI',
    customer_doc_number: o.customer_doc_number, contact_dni: o.contact_dni, customer_phone: o.customer_phone, save_customer: false,
    sale_type: o.sale_type, order_date: toDateInput(o.order_date), billing_doc_type: o.billing_doc_type || 'ninguno', notes: o.notes,
    items: o.items.map((i) => ({
      line_type: i.line_type, product_id: i.product_id, combo_id: i.combo_id, description: i.description, plan_months: i.plan_months,
      quantity: i.quantity, unit_price: i.unit_price, is_courtesy: i.is_courtesy, notes: i.notes,
    })),
    shipment: o.shipment
      ? {
          carrier_id: o.shipment.carrier_id, guide_number: o.shipment.guide_number, destination_agency: o.shipment.destination_agency,
          destination_department: o.shipment.destination_department, destination_province: o.shipment.destination_province,
          destination_district: o.shipment.destination_district, delivery_mode: o.shipment.delivery_mode,
          scheduled_dispatch_date: toDateInput(o.shipment.scheduled_dispatch_date), notes: o.shipment.notes,
        }
      : null,
  }
}

interface Props {
  open: boolean
  onClose: () => void
  /** Si se indica, se edita ese pedido; si no, se crea uno nuevo. */
  orderId?: number
  onSaved: (order: OrderView) => void
}

export default function OrderEditor({ open, onClose, orderId, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<EquipProduct[]>([])
  const [combos, setCombos] = useState<EquipCombo[]>([])
  const [carriers, setCarriers] = useState<EquipCarrier[]>([])
  const [form, setForm] = useState<OrderInput>(emptyForm(null))
  const [status, setStatus] = useState<string>('borrador')
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [neg, setNeg] = useState<{ items: NegativeStockItem[]; note: string; run: (note: string) => Promise<void> } | null>(null)
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<EquipCustomerRow[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    setNeg(null); setSearch(''); setFound([]); setCreatedId(null)
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [p, c, ca] = await Promise.all([equiposService.listProducts(), equiposService.listCombos(), equiposService.listCarriers(false)])
        if (!alive) return
        setProducts(p.products); setCombos(c); setCarriers(ca)
        const def = ca.find((x) => x.is_default)?.id ?? ca[0]?.id ?? null
        if (orderId) {
          const o = await equiposOrders.getOrder(orderId)
          if (!alive) return
          setForm(fromView(o)); setStatus(o.status)
        } else {
          setForm(emptyForm(def)); setStatus('borrador')
        }
      } catch (e) {
        toast.error(apiError(e, 'No se pudo cargar el formulario'))
        onClose()
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId])

  const set = <K extends keyof OrderInput>(k: K, v: OrderInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setItem = (i: number, patch: Partial<OrderItemInput>) =>
    setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }))
  const setShip = (patch: Partial<NonNullable<OrderInput['shipment']>>) =>
    setForm((f) => ({ ...f, shipment: { ...(f.shipment ?? emptyShipment(null)), ...patch } }))

  const refPrice = (it: OrderItemInput): number => {
    if (it.line_type === 'producto') return products.find((p) => p.id === it.product_id)?.reference_price ?? 0
    if (it.line_type === 'combo') return combos.find((c) => c.id === it.combo_id)?.reference_price ?? 0
    return 0
  }
  const total = useMemo(() => form.items.reduce((s, it) => s + (it.is_courtesy ? 0 : it.quantity * it.unit_price), 0), [form.items])

  const onSearch = (q: string) => {
    setSearch(q)
    clearTimeout(timer.current)
    if (q.trim().length < 2) return setFound([])
    timer.current = setTimeout(() => {
      equiposOrders.listCustomers(q.trim(), 8).then(setFound).catch(() => setFound([]))
    }, 250)
  }
  const pickCustomer = (c: EquipCustomerRow) => {
    setForm((f) => ({
      ...f, customer_id: c.id, customer_name: c.name, customer_doc_type: c.doc_type, customer_doc_number: c.doc_number ?? '',
      contact_dni: c.contact_dni, customer_phone: c.phone, save_customer: false,
    }))
    setSearch(''); setFound([])
  }

  const carrier = carriers.find((c) => c.id === form.shipment?.carrier_id)

  const validate = (): string | null => {
    const f = form
    if (!f.customer_name.trim()) return 'Indica el nombre del cliente'
    const doc = f.customer_doc_number.trim()
    if (doc) {
      if (f.customer_doc_type === 'DNI' && !/^\d{8}$/.test(doc)) return 'El DNI debe tener 8 dígitos'
      if (f.customer_doc_type === 'RUC' && !/^\d{11}$/.test(doc)) return 'El RUC debe tener 11 dígitos'
    } else if (f.save_customer) return 'Para guardar el cliente indica su documento'
    if (f.contact_dni && !/^\d{8}$/.test(f.contact_dni)) return 'El DNI de contacto debe tener 8 dígitos'
    const phone = f.customer_phone.replace(/[\s-]/g, '')
    if (phone && !/^(\+?51)?9\d{8}$/.test(phone) && !/^\+?\d{7,15}$/.test(phone)) return 'El teléfono no parece válido'
    if (f.items.length === 0) return 'Agrega al menos un ítem'
    for (const [n, it] of f.items.entries()) {
      const tag = `Ítem ${n + 1}`
      if (it.line_type === 'producto' && !it.product_id) return `${tag}: elige el producto`
      if (it.line_type === 'combo' && !it.combo_id) return `${tag}: elige el combo`
      if ((it.line_type === 'plan' || it.line_type === 'otro') && !it.description.trim()) return `${tag}: escribe la descripción`
      if (!(it.quantity > 0)) return `${tag}: la cantidad debe ser mayor a 0`
      if (it.unit_price < 0) return `${tag}: el precio no puede ser negativo`
    }
    const g = form.shipment?.guide_number.trim()
    if (g && carrier?.guide_format) {
      try {
        if (!new RegExp(carrier.guide_format).test(g)) return `La guía no tiene el formato de ${carrier.name}`
      } catch { /* formato mal escrito en el catálogo: lo valida el servidor */ }
    }
    return null
  }

  const payload = (): OrderInput => ({ ...form, shipment: form.shipment && form.shipment.carrier_id ? form.shipment : form.shipment })

  const finish = (o: OrderView, warnings: string[], msg: string) => {
    warnings.forEach((w) => toast.warning(w, { duration: 8000 }))
    toast.success(msg)
    onSaved(o)
    onClose()
  }

  const confirmWith = async (id: number, allow: boolean, note: string): Promise<boolean> => {
    try {
      const r = await equiposOrders.confirmOrder(id, allow ? { allow_negative: true, negative_note: note } : {})
      finish(r.order, r.warnings, `Pedido N° ${r.order.order_number} confirmado`)
      return true
    } catch (e) {
      const items = negativeStockItems(e)
      if (items) {
        setNeg({
          items, note: '',
          run: async (n) => {
            if (!n.trim()) return void toast.error('Escribe la nota que justifica el stock negativo')
            await confirmWith(id, true, n.trim())
          },
        })
        return false
      }
      toast.error(apiError(e, 'No se pudo confirmar el pedido'))
      return false
    }
  }

  const save = async (confirm: boolean) => {
    const err = validate()
    if (err) return toast.error(err)
    setSaving(true)
    try {
      const id = orderId ?? createdId
      if (id) {
        const run = async (allow: boolean, note: string) => {
          const r = await equiposOrders.updateOrder(id, { ...payload(), allow_negative: allow, negative_note: note })
          if (confirm && r.order.status === 'borrador') return void (await confirmWith(id, false, ''))
          finish(r.order, r.warnings, 'Pedido actualizado')
        }
        try {
          await run(false, '')
        } catch (e) {
          const items = negativeStockItems(e)
          if (!items) throw e
          setNeg({
            items, note: '',
            run: async (n) => {
              if (!n.trim()) return void toast.error('Escribe la nota que justifica el stock negativo')
              setSaving(true)
              try { await run(true, n.trim()) } catch (e2) { toast.error(apiError(e2, 'No se pudo guardar')) } finally { setSaving(false) }
            },
          })
        }
        return
      }
      const created = await equiposOrders.createOrder(payload())
      setCreatedId(created.order.id)
      if (confirm) {
        created.warnings.forEach((w) => toast.warning(w, { duration: 8000 }))
        const ok = await confirmWith(created.order.id, false, '')
        if (!ok) onSaved(created.order) // quedó guardado como borrador
      } else finish(created.order, created.warnings, `Borrador N° ${created.order.order_number} guardado`)
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el pedido'))
    } finally {
      setSaving(false)
    }
  }

  const editable = status !== 'anulado'
  const title = orderId ? `Editar pedido${status === 'registrado' ? ' (confirmado)' : ''}` : 'Nuevo pedido'

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-5xl">
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          {status === 'registrado' && (
            <div className="flex gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>El pedido ya está confirmado: si cambias los ítems, el stock se recalcula con las nuevas cantidades.</span>
            </div>
          )}

          {/* Cliente */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Cliente</h3>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar cliente existente por nombre, documento o teléfono…" className={INPUT + ' pl-9'} />
              {found.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                  {found.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => pickCustomer(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between gap-3">
                        <span className="font-medium text-slate-800">{c.name}</span>
                        <span className="text-slate-500">{c.doc_type} {c.doc_number} · {c.orders} pedidos{c.balance > 0 ? ` · debe ${money(c.balance)}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {form.customer_id && <p className="text-xs text-emerald-700">Cliente existente seleccionado. Editar el documento lo trata como otro cliente.</p>}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2"><label className={LABEL}>Nombre / razón social *</label><input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} className={INPUT} /></div>
              <div>
                <label className={LABEL}>Tipo de documento</label>
                <select value={form.customer_doc_type} onChange={(e) => setForm((f) => ({ ...f, customer_doc_type: e.target.value, customer_id: null }))} className={INPUT}>
                  <option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">C. extranjería</option>
                </select>
              </div>
              <div><label className={LABEL}>N° de documento</label><input value={form.customer_doc_number} onChange={(e) => setForm((f) => ({ ...f, customer_doc_number: e.target.value.trim(), customer_id: null }))} className={INPUT} /></div>
              <div><label className={LABEL}>Celular / WhatsApp</label><input value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>DNI de quien recoge</label><input value={form.contact_dni} onChange={(e) => set('contact_dni', e.target.value.trim())} className={INPUT} /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 self-end pb-2">
                <input type="checkbox" checked={form.save_customer} disabled={!!form.customer_id} onChange={(e) => set('save_customer', e.target.checked)} className="rounded" />
                Guardar como cliente (para su historial de pagos)
              </label>
            </div>
          </section>

          {/* Datos del pedido */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div><label className={LABEL}>Fecha del pedido</label><input type="date" max={todayISO()} value={form.order_date} onChange={(e) => set('order_date', e.target.value)} className={INPUT} /></div>
            <div>
              <label className={LABEL}>Tipo de venta</label>
              <select value={form.sale_type} onChange={(e) => set('sale_type', e.target.value as SaleType)} className={INPUT}>
                <option value="independiente">Independiente</option><option value="promo_tk">Promo TK</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Comprobante</label>
              <select value={form.billing_doc_type} onChange={(e) => set('billing_doc_type', e.target.value)} className={INPUT}>
                <option value="ninguno">Ninguno</option><option value="boleta">Boleta</option><option value="factura">Factura</option>
              </select>
            </div>
            <div><label className={LABEL}>Observaciones</label><input value={form.notes} onChange={(e) => set('notes', e.target.value)} className={INPUT} /></div>
          </section>

          {/* Ítems */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Ítems</h3>
              <button type="button" className={BTN_SECONDARY} onClick={() => set('items', [...form.items, emptyItem()])}><Plus size={12} /> Agregar ítem</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, i) => {
                const ref = refPrice(it)
                const dev = ref > 0 && !it.is_courtesy ? (it.unit_price - ref) / ref : 0
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-lg p-2">
                    <select aria-label="Tipo de ítem" value={it.line_type} onChange={(e) => setItem(i, { line_type: e.target.value as LineType, product_id: null, combo_id: null, description: '' })} className={INPUT + ' col-span-3 sm:col-span-2'}>
                      <option value="producto">Producto</option><option value="combo">Combo</option><option value="plan">Plan Tukifac</option><option value="otro">Otro</option>
                    </select>
                    <div className="col-span-9 sm:col-span-4 space-y-1">
                      {it.line_type === 'producto' && (
                        <select aria-label="Producto" value={it.product_id ?? ''} onChange={(e) => {
                          const p = products.find((x) => x.id === Number(e.target.value))
                          setItem(i, { product_id: p?.id ?? null, unit_price: p ? p.reference_price : 0 })
                        }} className={INPUT}>
                          <option value="">Elegir producto…</option>
                          {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                        </select>
                      )}
                      {it.line_type === 'combo' && (
                        <select aria-label="Combo" value={it.combo_id ?? ''} onChange={(e) => {
                          const c = combos.find((x) => x.id === Number(e.target.value))
                          setItem(i, { combo_id: c?.id ?? null, unit_price: c ? c.reference_price : 0 })
                        }} className={INPUT}>
                          <option value="">Elegir combo…</option>
                          {combos.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.components.map((x) => `${x.quantity}×${x.product_code}`).join(' + ')}</option>)}
                        </select>
                      )}
                      {(it.line_type === 'plan' || it.line_type === 'otro') && (
                        <input aria-label="Descripción" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder={it.line_type === 'plan' ? 'Ej. Plan Emprendedor' : 'Descripción'} className={INPUT} />
                      )}
                      {it.line_type === 'plan' && (
                        <input type="number" min={0} aria-label="Meses del plan" value={it.plan_months || ''} onChange={(e) => setItem(i, { plan_months: Number(e.target.value) })} placeholder="Meses" className={INPUT} />
                      )}
                    </div>
                    <input type="number" min={0} step="1" aria-label="Cantidad" value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} className={INPUT + ' col-span-3 sm:col-span-1 text-right'} />
                    <div className="col-span-4 sm:col-span-2">
                      <input type="number" min={0} step="0.01" aria-label="Precio unitario" value={it.is_courtesy ? 0 : it.unit_price} disabled={it.is_courtesy} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} className={INPUT + ' text-right'} />
                      {Math.abs(dev) > 0.3 && <p className="text-[11px] text-amber-700 mt-0.5">{Math.round(dev * 100)}% vs lista ({money(ref)})</p>}
                    </div>
                    <label className="col-span-3 sm:col-span-1 flex items-center gap-1 text-xs text-slate-600 pt-2.5"><input type="checkbox" checked={it.is_courtesy} onChange={(e) => setItem(i, { is_courtesy: e.target.checked })} className="rounded" /> Obsequio</label>
                    <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-2 pt-2">
                      <span className="text-sm font-medium text-slate-700">{money(it.is_courtesy ? 0 : it.quantity * it.unit_price)}</span>
                      {form.items.length > 1 && <button type="button" aria-label="Quitar ítem" onClick={() => set('items', form.items.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-right text-base font-semibold text-slate-800">Total: {money(total)}</p>
          </section>

          {/* Envío */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Envío</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className={LABEL}>Transportista</label>
                <select value={form.shipment?.carrier_id ?? ''} onChange={(e) => setShip({ carrier_id: e.target.value ? Number(e.target.value) : null })} className={INPUT}>
                  <option value="">Sin definir</option>
                  {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Modalidad</label>
                <select value={form.shipment?.delivery_mode ?? 'agencia'} onChange={(e) => setShip({ delivery_mode: e.target.value as DeliveryMode })} className={INPUT}>
                  {Object.entries(DELIVERY_MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Departamento</label>
                <input list="equip-deps" value={form.shipment?.destination_department ?? ''} onChange={(e) => setShip({ destination_department: e.target.value })} className={INPUT} />
                <datalist id="equip-deps">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
              </div>
              <div><label className={LABEL}>Provincia</label><input value={form.shipment?.destination_province ?? ''} onChange={(e) => setShip({ destination_province: e.target.value })} className={INPUT} /></div>
              <div><label className={LABEL}>Distrito</label><input value={form.shipment?.destination_district ?? ''} onChange={(e) => setShip({ destination_district: e.target.value })} className={INPUT} /></div>
              <div><label className={LABEL}>Agencia / dirección de destino</label><input value={form.shipment?.destination_agency ?? ''} onChange={(e) => setShip({ destination_agency: e.target.value })} className={INPUT} /></div>
              <div><label className={LABEL}>{carrier?.guide_label || 'N° de guía'} (opcional ahora)</label><input value={form.shipment?.guide_number ?? ''} onChange={(e) => setShip({ guide_number: e.target.value.trim() })} className={INPUT} /></div>
              <div><label className={LABEL}>Despacho programado</label><input type="date" value={form.shipment?.scheduled_dispatch_date ?? ''} onChange={(e) => setShip({ scheduled_dispatch_date: e.target.value })} className={INPUT} /></div>
            </div>
            {carrier && form.shipment?.scheduled_dispatch_date && carrier.dispatch_days && (() => {
              const dow = new Date(`${form.shipment!.scheduled_dispatch_date}T12:00:00`).getDay()
              return carrier.dispatch_days.split(',').map((d) => d.trim()).includes(String(dow)) ? null : (
                <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={13} /> {carrier.name} no despacha ese día de la semana (solo es un aviso).</p>
              )
            })()}
          </section>

          {neg && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-red-800">Esta confirmación dejaría el stock en negativo:</p>
              <ul className="text-sm text-red-700 list-disc ml-5">
                {neg.items.map((n) => <li key={n.product_id}>{n.code}: hay {n.current}, se necesitan {n.needed} → quedaría en {n.resulting}</li>)}
              </ul>
              <textarea value={neg.note} onChange={(e) => setNeg({ ...neg, note: e.target.value })} placeholder="Nota obligatoria (ej. llega reposición el viernes)" rows={2} className={INPUT} />
              <div className="flex justify-end gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={() => setNeg(null)}>Revisar</button>
                <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void neg.run(neg.note)}>Confirmar igualmente</button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
            {editable && status !== 'registrado' && (
              <button type="button" className={BTN_SECONDARY} disabled={saving} onClick={() => void save(false)}>Guardar borrador</button>
            )}
            {editable && (
              <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save(status !== 'registrado')}>
                {saving ? 'Guardando…' : status === 'registrado' ? 'Guardar cambios' : 'Guardar y confirmar'}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
