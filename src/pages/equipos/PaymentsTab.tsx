import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, Pencil, Plus, Search, UserPlus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PaginationBar from '@/components/ui/PaginationBar'
import type { PerPageOption } from '@/services/pagination'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposOrders, METHOD_LABEL, type CustomerAccount, type CustomerInput, type EquipCustomerRow, type PaymentListResult, type PaymentView,
} from '@/services/equiposOrders.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import OrderDetail from './OrderDetail'
import { useConfirm } from './ConfirmProvider'
import { useDebounced, usePaging } from './hooks'
import { fmtDate, money, PaymentBadge, SELECT } from './ordersCommon'
import PaymentModal from './PaymentModal'

const EMPTY_CUSTOMER: CustomerInput = { name: '', doc_type: 'DNI', doc_number: '', contact_dni: '', phone: '', notes: '' }

function PaymentRow({ p, canVoid, onVoid }: { p: PaymentView; canVoid: boolean; onVoid: (p: PaymentView) => void }) {
  const voided = p.status !== 'vigente'
  return (
    <tr className={voided ? 'text-slate-400 line-through' : ''}>
      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.paid_at)}</td>
      <td className="px-3 font-medium">{money(p.amount)}</td>
      <td className="px-3">{METHOD_LABEL[p.method] ?? p.method}<span className="block text-xs text-slate-400">{p.moment === 'al_recoger' ? 'al recoger' : 'anticipado'}</span></td>
      <td className="px-3 text-xs">{p.reference && <span className="block">Op. {p.reference}</span>}{p.invoice && <span className="block">{p.invoice}</span>}</td>
      <td className="px-3 text-xs">
        {p.allocations.map((a) => <span key={a.order_id} className="block">N° {a.order_number}: {money(a.amount)}</span>)}
        {p.unallocated_amount > 0 && !voided && <span className="block text-indigo-700">Saldo a favor {money(p.unallocated_amount)}</span>}
      </td>
      <td className="px-3 text-right">{canVoid && !voided && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => onVoid(p)}>Anular</button>}{voided && <span className="text-xs no-underline">anulado</span>}</td>
    </tr>
  )
}

export default function PaymentsTab() {
  const { hasPermission } = useAuth()
  const canPay = hasPermission('equipos.payments')
  const canEditCustomer = hasPermission('equipos.create')
  const [mode, setMode] = useState<'clientes' | 'cobros'>('clientes')
  const [q, setQ] = useState('')
  const [customers, setCustomers] = useState<EquipCustomerRow[]>([])
  const [custTotal, setCustTotal] = useState(0)
  const [custPage, setCustPage] = useState(1)
  const [custPer, setCustPer] = useState<PerPageOption>(25)
  const [allPer, setAllPer] = useState<PerPageOption>(25)
  const confirm = useConfirm()
  const dq = useDebounced(q, 450)
  const [looking, setLooking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [account, setAccount] = useState<CustomerAccount | null>(null)
  const ordersPaging = usePaging(account?.orders ?? [], 10)
  const paysPaging = usePaging(account?.payments ?? [], 10)
  const [payOpen, setPayOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [form, setForm] = useState<{ open: boolean; id?: number; data: CustomerInput }>({ open: false, data: EMPTY_CUSTOMER })
  const [all, setAll] = useState<PaymentListResult | null>(null)
  const [allFilter, setAllFilter] = useState({ method: '', from: '', to: '', status: '', q: '' })
  const [page, setPage] = useState(1)

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const r = await equiposOrders.listCustomersPaged(dq.trim() || undefined, custPage, custPer)
      setCustomers(r.rows)
      setCustTotal(r.total)
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los clientes'))
    } finally {
      setLoading(false)
    }
  }, [dq, custPage, custPer])

  useEffect(() => { void loadCustomers() }, [loadCustomers])

  const loadAccount = useCallback(async (id: number) => {
    try {
      setAccount(await equiposOrders.customerAccount(id))
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el estado de cuenta'))
    }
  }, [])

  useEffect(() => {
    setAccount(null)
    if (selected) void loadAccount(selected)
  }, [selected, loadAccount])

  const dqAll = useDebounced(allFilter.q, 450)
  const loadAll = useCallback(async () => {
    try {
      setAll(await equiposOrders.listPayments({
        method: allFilter.method || undefined, from: allFilter.from || undefined, to: allFilter.to || undefined,
        status: allFilter.status || undefined, q: dqAll.trim() || undefined, page, per_page: allPer,
      }))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar los cobros'))
    }
  }, [allFilter.method, allFilter.from, allFilter.to, allFilter.status, dqAll, page, allPer])

  useEffect(() => { if (mode === 'cobros') void loadAll() }, [mode, loadAll])

  const refresh = () => {
    void loadCustomers()
    if (selected) void loadAccount(selected)
    if (mode === 'cobros') void loadAll()
  }

  const saveCustomer = async () => {
    const d = form.data
    if (!d.name.trim()) return toast.error('El nombre es obligatorio')
    if (d.doc_type === 'DNI' && !/^\d{8}$/.test(d.doc_number)) return toast.error('El DNI debe tener 8 dígitos')
    if (d.doc_type === 'RUC' && !/^\d{11}$/.test(d.doc_number)) return toast.error('El RUC debe tener 11 dígitos')
    if (!(await confirm({ title: form.id ? 'Guardar cambios del cliente' : 'Registrar cliente', message: `${d.name.trim()} · ${d.doc_type} ${d.doc_number}`, confirmLabel: 'Guardar' }))) return
    try {
      const c = form.id ? await equiposOrders.updateCustomer(form.id, d) : await equiposOrders.createCustomer(d)
      toast.success('Cliente guardado')
      setForm({ open: false, data: EMPTY_CUSTOMER })
      setSelected(c.id)
      refresh()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el cliente'))
    }
  }

  const voidPayment = async (pay: PaymentView) => {
    const r = await confirm({ title: 'Anular cobro', message: `Se anulará el cobro de ${money(pay.amount)} y se recalcularán los saldos de los pedidos a los que estaba aplicado.`, danger: true, pin: true, input: { label: 'Motivo de la anulación', required: true }, confirmLabel: 'Anular cobro' })
    if (!r) return
    try {
      await equiposOrders.voidPayment(pay.id, r.text, r.pin)
      toast.success('Cobro anulado; los saldos se recalcularon')
      refresh()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo anular el cobro'))
    }
  }

  // Consulta RUC/DNI para completar el nombre del cliente.
  const lookupDoc = async (silent: boolean) => {
    const { doc_type: t, doc_number: n } = form.data
    if (t !== 'DNI' && t !== 'RUC') return
    setLooking(true)
    try {
      const r = await equiposOrders.lookup(t === 'DNI' ? 'dni' : 'ruc', n)
      if (r.success && r.name) setForm((f) => (f.data.doc_number === n ? { ...f, data: { ...f.data, name: r.name } } : f))
      else if (!silent) toast.warning('El documento no se encontró en la consulta')
    } catch (e) {
      if (!silent) toast.warning(apiError(e, 'No se pudo consultar el documento'))
    } finally {
      setLooking(false)
    }
  }
  const debDoc = useDebounced(form.data.doc_number, 600)
  useEffect(() => {
    if (!form.open || form.id) return
    const t = form.data.doc_type
    if ((t === 'DNI' && /^\d{8}$/.test(debDoc)) || (t === 'RUC' && /^\d{11}$/.test(debDoc))) void lookupDoc(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debDoc, form.open])

  const openForm = (c?: CustomerAccount['customer']) =>
    setForm({ open: true, id: c?.id, data: c ? { name: c.name, doc_type: c.doc_type, doc_number: c.doc_number ?? '', contact_dni: c.contact_dni, phone: c.phone, notes: c.notes } : EMPTY_CUSTOMER })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['clientes', 'cobros'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`px-3 py-1.5 rounded-lg text-sm border ${mode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
            {m === 'clientes' ? 'Clientes y estado de cuenta' : 'Todos los cobros'}
          </button>
        ))}
      </div>

      {mode === 'clientes' ? (
        <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input value={q} onChange={(e) => { setCustPage(1); setQ(e.target.value) }} placeholder="Buscar cliente…" className={INPUT + ' pl-9'} />
              </div>
              {canEditCustomer && <button type="button" aria-label="Nuevo cliente" className={BTN_PRIMARY + ' !px-3'} onClick={() => openForm()}><UserPlus size={16} /></button>}
            </div>
            {loading && customers.length === 0 ? <div className="flex justify-center py-8"><Spinner /></div> : (
              <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-auto">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelected(c.id)} className={`w-full text-left px-2 py-2 rounded-lg hover:bg-slate-50 ${selected === c.id ? 'bg-indigo-50' : ''}`}>
                      <span className="block text-sm font-medium text-slate-800 truncate">{c.name}</span>
                      <span className="flex justify-between text-xs text-slate-500">
                        <span>{c.doc_type} {c.doc_number} · {c.orders} ped.</span>
                        {c.balance > 0 && <span className="text-red-700 font-medium">debe {money(c.balance)}</span>}
                        {c.credit > 0 && <span className="text-indigo-700 font-medium">a favor {money(c.credit)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
                {customers.length === 0 && <li className="text-center text-sm text-slate-400 py-8">Sin clientes.</li>}
              </ul>
            )}
            <PaginationBar page={custPage} perPage={custPer} total={custTotal} totalPages={Math.max(1, Math.ceil(custTotal / custPer))} onPageChange={setCustPage} onPerPageChange={(n) => { setCustPer(n); setCustPage(1) }} itemLabel="clientes" />
          </div>

          <div className="space-y-4">
            {!selected && <p className="text-center text-slate-400 py-16 bg-white rounded-xl border border-dashed border-slate-200">Elige un cliente para ver su estado de cuenta y su historial de pagos.</p>}
            {selected && !account && <div className="flex justify-center py-16"><Spinner /></div>}
            {account && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-start gap-4">
                  <div className="flex-1 min-w-52">
                    <p className="text-lg font-semibold text-slate-800">{account.customer.name}</p>
                    <p className="text-sm text-slate-500">{account.customer.doc_type} {account.customer.doc_number}{account.customer.phone && ` · Cel. ${account.customer.phone}`}</p>
                    {account.customer.notes && <p className="text-xs text-slate-400 mt-1">{account.customer.notes}</p>}
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div><p className="text-xs text-slate-400">Pedidos</p><p className="font-semibold">{money(account.total_ordered)}</p></div>
                    <div><p className="text-xs text-slate-400">Cobrado</p><p className="font-semibold text-emerald-700">{money(account.total_paid)}</p></div>
                    <div><p className="text-xs text-slate-400">Por cobrar</p><p className={`font-semibold ${account.balance > 0 ? 'text-red-700' : 'text-slate-700'}`}>{money(account.balance)}</p></div>
                    <div><p className="text-xs text-slate-400">Saldo a favor</p><p className="font-semibold text-indigo-700">{money(account.credit)}</p></div>
                  </div>
                  <div className="flex gap-2">
                    {canEditCustomer && <button type="button" className={BTN_SECONDARY} onClick={() => openForm(account.customer)}><Pencil size={12} /> Editar</button>}
                    {canPay && <button type="button" className={BTN_PRIMARY} onClick={() => setPayOpen(true)}><Banknote size={15} /> Registrar cobro</button>}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                  <p className="px-4 pt-3 text-sm font-semibold text-slate-800">Pedidos</p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="px-3 py-2">N°</th><th>Fecha</th><th className="text-right">Total</th><th className="text-right">Cobrado</th><th className="text-right">Saldo</th><th className="px-3">Pago</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ordersPaging.rows.map((o) => (
                        <tr key={o.id} onClick={() => setDetailId(o.id)} className={`cursor-pointer hover:bg-slate-50 ${o.status === 'anulado' ? 'opacity-40' : ''}`}>
                          <td className="px-3 py-1.5 font-medium">{o.order_number}</td><td>{fmtDate(o.order_date)}</td>
                          <td className="text-right">{money(o.total_amount)}</td><td className="text-right">{money(o.paid_amount)}</td>
                          <td className={`text-right ${o.balance_amount > 0 ? 'text-red-700 font-medium' : ''}`}>{money(o.balance_amount)}</td>
                          <td className="px-3"><PaymentBadge value={o.payment_status} /></td>
                        </tr>
                      ))}
                      {account.orders.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">Sin pedidos.</td></tr>}
                    </tbody>
                  </table>
                  <PaginationBar {...ordersPaging.barProps} itemLabel="pedidos" />
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                  <p className="px-4 pt-3 text-sm font-semibold text-slate-800">Historial de pagos</p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200"><th className="px-3 py-2">Fecha</th><th className="px-3">Monto</th><th className="px-3">Medio</th><th className="px-3">Referencia</th><th className="px-3">Aplicado a</th><th /></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {paysPaging.rows.map((p) => <PaymentRow key={p.id} p={p} canVoid={canPay} onVoid={(x) => void voidPayment(x)} />)}
                      {account.payments.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">Sin pagos registrados.</td></tr>}
                    </tbody>
                  </table>
                  <PaginationBar {...paysPaging.barProps} itemLabel="pagos" />
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input value={allFilter.q} onChange={(e) => { setPage(1); setAllFilter({ ...allFilter, q: e.target.value }) }} placeholder="Cliente, referencia o comprobante…" className={INPUT + ' !w-64'} />
            <select aria-label="Medio" value={allFilter.method} onChange={(e) => { setPage(1); setAllFilter({ ...allFilter, method: e.target.value }) }} className={SELECT}>
              <option value="">Todos los medios</option>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select aria-label="Estado" value={allFilter.status} onChange={(e) => { setPage(1); setAllFilter({ ...allFilter, status: e.target.value }) }} className={SELECT}>
              <option value="">Vigentes y anulados</option><option value="vigente">Vigentes</option><option value="anulado">Anulados</option>
            </select>
            <input type="date" aria-label="Desde" value={allFilter.from} onChange={(e) => { setPage(1); setAllFilter({ ...allFilter, from: e.target.value }) }} className={SELECT} />
            <input type="date" aria-label="Hasta" value={allFilter.to} onChange={(e) => { setPage(1); setAllFilter({ ...allFilter, to: e.target.value }) }} className={SELECT} />
          </div>
          {all && <p className="text-sm text-slate-500">{all.total} cobros · Total vigente <span className="font-semibold text-slate-700">{money(all.sum)}</span></p>}
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50"><th className="px-3 py-2">Fecha</th><th className="px-3">Monto</th><th className="px-3">Medio</th><th className="px-3">Referencia</th><th className="px-3">Aplicado a</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(all?.rows ?? []).map((p) => (
                  <PaymentRow key={p.id} p={{ ...p, allocations: p.allocations }} canVoid={canPay} onVoid={(x) => void voidPayment(x)} />
                ))}
                {all && all.rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-10">No hay cobros con esos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          {all && <PaginationBar page={page} perPage={allPer} total={all.total} totalPages={Math.max(1, Math.ceil(all.total / allPer))} onPageChange={setPage} onPerPageChange={(n) => { setAllPer(n); setPage(1) }} itemLabel="cobros" />}
        </div>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} onSaved={refresh} customerId={account?.customer.id ?? null} customerName={account?.customer.name ?? ''} />
      <OrderDetail orderId={detailId} onClose={() => setDetailId(null)} onChanged={refresh} onEdit={() => setDetailId(null)} />

      <Modal open={form.open} onClose={() => setForm({ open: false, data: EMPTY_CUSTOMER })} title={form.id ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="space-y-3">
          <div><label className={LABEL}>Nombre / razón social *</label><input value={form.data.name} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, name: e.target.value } }))} className={INPUT} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Tipo de documento</label>
              <select value={form.data.doc_type} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, doc_type: e.target.value } }))} className={INPUT}><option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">C. extranjería</option></select></div>
            <div><label className={LABEL}>N° de documento *</label><div className="flex gap-1"><input value={form.data.doc_number} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, doc_number: e.target.value.trim() } }))} className={INPUT} />{(form.data.doc_type === 'DNI' || form.data.doc_type === 'RUC') && <button type="button" className={BTN_SECONDARY} disabled={looking || !form.data.doc_number} onClick={() => void lookupDoc(false)}>{looking ? '…' : 'Consultar'}</button>}</div></div>
            <div><label className={LABEL}>Celular / WhatsApp</label><input value={form.data.phone} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, phone: e.target.value } }))} className={INPUT} /></div>
            <div><label className={LABEL}>DNI de contacto</label><input value={form.data.contact_dni} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, contact_dni: e.target.value.trim() } }))} className={INPUT} /></div>
          </div>
          <div><label className={LABEL}>Notas</label><input value={form.data.notes} onChange={(e) => setForm((f) => ({ ...f, data: { ...f.data, notes: e.target.value } }))} className={INPUT} /></div>
          <div className="flex justify-end gap-2"><button type="button" className={BTN_SECONDARY} onClick={() => setForm({ open: false, data: EMPTY_CUSTOMER })}>Cancelar</button><button type="button" className={BTN_PRIMARY} onClick={() => void saveCustomer()}><Plus size={14} /> Guardar</button></div>
        </div>
      </Modal>

    </div>
  )
}
