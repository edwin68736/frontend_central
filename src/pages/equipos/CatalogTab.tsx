import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposService,
  EQUIP_KIND_LABEL,
  type EquipCombo,
  type EquipKind,
  type EquipProduct,
  type EquipProductInput,
} from '@/services/equipos.service'
import { ActiveBadge, apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SemaphoreBadge } from './common'

const EMPTY_PRODUCT: EquipProductInput = {
  code: '', name: '', kind: 'equipo', notes: '', reference_price: 0, yellow_threshold: 0, green_threshold: 0, active: true,
}

type ComboForm = { id?: number; code: string; reference_price: string; active: boolean; items: { product_id: number | ''; quantity: string }[] }
const EMPTY_COMBO: ComboForm = { code: '', reference_price: '0', active: true, items: [{ product_id: '', quantity: '1' }] }

export default function CatalogTab() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('equipos.catalog')
  const [products, setProducts] = useState<EquipProduct[]>([])
  const [stockVisible, setStockVisible] = useState(false)
  const [combos, setCombos] = useState<EquipCombo[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [pForm, setPForm] = useState<{ open: boolean; id?: number; data: EquipProductInput }>({ open: false, data: EMPTY_PRODUCT })
  const [cForm, setCForm] = useState<{ open: boolean; data: ComboForm }>({ open: false, data: EMPTY_COMBO })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([equiposService.listProducts({ include_inactive: true }), equiposService.listCombos(true)])
      setProducts(p.products)
      setStockVisible(p.stockVisible)
      setCombos(c)
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar el catálogo'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const term = q.trim().toLowerCase()
  const shownProducts = useMemo(
    () => products.filter((p) => (showInactive || p.active) && (!term || p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))),
    [products, term, showInactive],
  )
  const shownCombos = useMemo(
    () => combos.filter((c) => (showInactive || c.active) && (!term || c.code.toLowerCase().includes(term))),
    [combos, term, showInactive],
  )
  const activeProducts = useMemo(() => products.filter((p) => p.active), [products])

  const openProduct = (p?: EquipProduct) =>
    setPForm({
      open: true,
      id: p?.id,
      data: p
        ? { code: p.code, name: p.name, kind: p.kind, notes: p.notes, reference_price: p.reference_price, yellow_threshold: p.yellow_threshold, green_threshold: p.green_threshold, active: p.active }
        : EMPTY_PRODUCT,
    })

  const saveProduct = async () => {
    const d = pForm.data
    if (!d.code.trim()) return toast.error('El código es obligatorio')
    if (d.yellow_threshold > d.green_threshold) return toast.error('El umbral amarillo no puede ser mayor que el verde')
    setSaving(true)
    try {
      if (pForm.id) await equiposService.updateProduct(pForm.id, d)
      else await equiposService.createProduct(d)
      toast.success('Producto guardado')
      setPForm((f) => ({ ...f, open: false }))
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el producto'))
    } finally {
      setSaving(false)
    }
  }

  const openCombo = (c?: EquipCombo) =>
    setCForm({
      open: true,
      data: c
        ? { id: c.id, code: c.code, reference_price: String(c.reference_price), active: c.active, items: c.components.map((x) => ({ product_id: x.product_id, quantity: String(x.quantity) })) }
        : EMPTY_COMBO,
    })

  const saveCombo = async () => {
    const d = cForm.data
    const items = d.items.filter((i) => i.product_id !== '')
    if (!d.code.trim()) return toast.error('El código del combo es obligatorio')
    if (items.length === 0) return toast.error('Agrega al menos un componente')
    const body = {
      code: d.code.trim(),
      name: d.code.trim(),
      reference_price: Number(d.reference_price) || 0,
      active: d.active,
      items: items.map((i) => ({ product_id: Number(i.product_id), quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)) })),
    }
    setSaving(true)
    try {
      if (d.id) await equiposService.updateCombo(d.id, body)
      else await equiposService.createCombo(body)
      toast.success('Combo guardado')
      setCForm((f) => ({ ...f, open: false }))
      void load()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el combo'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o combo…" className={INPUT + ' pl-9'} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" /> Ver inactivos
        </label>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-slate-800">Productos <span className="text-sm font-normal text-slate-400">({shownProducts.length})</span></h2>
          {canEdit && <button type="button" className={BTN_PRIMARY} onClick={() => openProduct()}><Plus size={16} /> Nuevo producto</button>}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Notas</th>
                <th className="px-3 py-2 text-right">Precio ref.</th>
                <th className="px-3 py-2 text-right">Umbrales</th>
                {stockVisible && <th className="px-3 py-2 text-right">Stock</th>}
                {stockVisible && <th className="px-3 py-2 text-center">Semáforo</th>}
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shownProducts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-medium text-slate-800">{p.code}{p.name !== p.code && <span className="block text-xs text-slate-400 font-normal">{p.name}</span>}</td>
                  <td className="px-3 py-2 text-slate-600">{EQUIP_KIND_LABEL[p.kind]}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{p.notes || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.reference_price > 0 ? `S/ ${p.reference_price.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p.yellow_threshold} / {p.green_threshold}</td>
                  {stockVisible && <td className={`px-3 py-2 text-right tabular-nums font-medium ${p.stock < 0 ? 'text-red-600' : ''}`}>{p.stock}</td>}
                  {stockVisible && <td className="px-3 py-2 text-center"><SemaphoreBadge value={p.semaphore} /></td>}
                  <td className="px-3 py-2 text-center"><ActiveBadge active={p.active} /></td>
                  <td className="px-3 py-2 text-right">{canEdit && <button type="button" className={BTN_SECONDARY} onClick={() => openProduct(p)}><Pencil size={12} /> Editar</button>}</td>
                </tr>
              ))}
              {shownProducts.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No hay productos. {canEdit ? 'Crea el primero o importa el Excel.' : ''}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-slate-800">Combos <span className="text-sm font-normal text-slate-400">({shownCombos.length})</span></h2>
          {canEdit && <button type="button" className={BTN_PRIMARY} onClick={() => openCombo()}><Plus size={16} /> Nuevo combo</button>}
        </div>
        <p className="text-xs text-slate-500 mb-2">Un combo no tiene stock propio: al venderlo se descuentan sus componentes.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shownCombos.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{c.code}</p>
                  {c.reference_price > 0 && <p className="text-xs text-slate-500">Precio ref. S/ {c.reference_price.toFixed(2)}</p>}
                </div>
                <ActiveBadge active={c.active} />
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {c.components.map((x) => (
                  <li key={x.product_id} className="flex justify-between"><span>{x.product_code}</span><span className="tabular-nums text-slate-500">× {x.quantity}</span></li>
                ))}
              </ul>
              {canEdit && <div className="mt-3 text-right"><button type="button" className={BTN_SECONDARY} onClick={() => openCombo(c)}><Pencil size={12} /> Editar</button></div>}
            </div>
          ))}
          {shownCombos.length === 0 && <p className="text-sm text-slate-400 col-span-full py-6 text-center">No hay combos.</p>}
        </div>
      </section>

      <Modal open={pForm.open} onClose={() => setPForm((f) => ({ ...f, open: false }))} title={pForm.id ? 'Editar producto' : 'Nuevo producto'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Código *</label><input value={pForm.data.code} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, code: e.target.value } }))} className={INPUT} /></div>
            <div>
              <label className={LABEL}>Tipo</label>
              <select value={pForm.data.kind} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, kind: e.target.value as EquipKind } }))} className={INPUT}>
                {(Object.keys(EQUIP_KIND_LABEL) as EquipKind[]).map((k) => <option key={k} value={k}>{EQUIP_KIND_LABEL[k]}</option>)}
              </select>
            </div>
          </div>
          <div><label className={LABEL}>Nombre</label><input value={pForm.data.name} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, name: e.target.value } }))} placeholder="Igual al código si se deja vacío" className={INPUT} /></div>
          <div><label className={LABEL}>Notas</label><input value={pForm.data.notes} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, notes: e.target.value } }))} placeholder="Ej. Portátil 80mm" className={INPUT} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={LABEL}>Precio de referencia</label><input type="number" min={0} step="0.01" value={pForm.data.reference_price} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, reference_price: Number(e.target.value) } }))} className={INPUT} /></div>
            <div><label className={LABEL}>Umbral amarillo</label><input type="number" min={0} value={pForm.data.yellow_threshold} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, yellow_threshold: Number(e.target.value) } }))} className={INPUT} /></div>
            <div><label className={LABEL}>Umbral verde</label><input type="number" min={0} value={pForm.data.green_threshold} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, green_threshold: Number(e.target.value) } }))} className={INPUT} /></div>
          </div>
          <p className="text-xs text-slate-500">Semáforo: stock ≥ verde = suficiente · ≥ amarillo = moderado · menos = bajo. El precio es solo una sugerencia: en cada pedido se puede cambiar.</p>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={pForm.data.active !== false} onChange={(e) => setPForm((f) => ({ ...f, data: { ...f.data, active: e.target.checked } }))} className="rounded" /> Producto activo</label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setPForm((f) => ({ ...f, open: false }))}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void saveProduct()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={cForm.open} onClose={() => setCForm((f) => ({ ...f, open: false }))} title={cForm.data.id ? 'Editar combo' : 'Nuevo combo'} maxWidth="max-w-xl">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL}>Código *</label><input value={cForm.data.code} onChange={(e) => setCForm((f) => ({ ...f, data: { ...f.data, code: e.target.value } }))} placeholder="COMBO POS 1" className={INPUT} /></div>
            <div><label className={LABEL}>Precio de referencia</label><input type="number" min={0} step="0.01" value={cForm.data.reference_price} onChange={(e) => setCForm((f) => ({ ...f, data: { ...f.data, reference_price: e.target.value } }))} className={INPUT} /></div>
          </div>
          <div>
            <label className={LABEL}>Componentes *</label>
            <div className="space-y-2">
              {cForm.data.items.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={it.product_id}
                    onChange={(e) => setCForm((f) => ({ ...f, data: { ...f.data, items: f.data.items.map((x, i) => (i === idx ? { ...x, product_id: e.target.value ? Number(e.target.value) : '' } : x)) } }))}
                    className={INPUT}
                  >
                    <option value="">Producto…</option>
                    {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                  </select>
                  <input
                    type="number" min={1} value={it.quantity}
                    onChange={(e) => setCForm((f) => ({ ...f, data: { ...f.data, items: f.data.items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)) } }))}
                    className={INPUT + ' w-24'}
                  />
                  <button type="button" aria-label="Quitar componente" className="p-2 text-slate-400 hover:text-red-600" onClick={() => setCForm((f) => ({ ...f, data: { ...f.data, items: f.data.items.filter((_, i) => i !== idx) } }))}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button type="button" className={BTN_SECONDARY + ' mt-2'} onClick={() => setCForm((f) => ({ ...f, data: { ...f.data, items: [...f.data.items, { product_id: '', quantity: '1' }] } }))}><Plus size={13} /> Agregar componente</button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={cForm.data.active} onChange={(e) => setCForm((f) => ({ ...f, data: { ...f.data, active: e.target.checked } }))} className="rounded" /> Combo activo</label>
          <p className="text-xs text-slate-500">Cambiar la composición no altera los pedidos ya vendidos: cada pedido guarda la composición con la que se vendió.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setCForm((f) => ({ ...f, open: false }))}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void saveCombo()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
