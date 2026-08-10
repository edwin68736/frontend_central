import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Check, X, Pencil, Package, Inbox } from 'lucide-react'
import {
  documentPackagesService,
  type DocumentPackage,
  type PackagePurchaseRequest,
} from '@/services/documentPackages.service'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { saasAssetUrl } from '@/services/saasSettings.service'

const INPUT =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
const LABEL = 'block text-sm font-medium text-slate-700 mb-1'

const EMPTY_FORM: Partial<DocumentPackage> = {
  name: '',
  description: '',
  documents_qty: 50,
  price: 10,
  currency: 'PEN',
  is_active: true,
  sort_order: 0,
}

export default function DocumentPackagesPage() {
  const [packages, setPackages] = useState<DocumentPackage[]>([])
  const [pending, setPending] = useState<PackagePurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Partial<DocumentPackage>>(EMPTY_FORM)
  const [rejectTarget, setRejectTarget] = useState<PackagePurchaseRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [p, r] = await Promise.all([
        documentPackagesService.list(),
        documentPackagesService.listPending(),
      ])
      setPackages(p)
      setPending(r)
    } catch {
      toast.error('Error cargando paquetes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setModal(true)
  }

  const openEdit = (p: DocumentPackage) => {
    setForm(p)
    setModal(true)
  }

  const save = async () => {
    // Se valida aquí para no depender del error del backend, que no dice qué campo falta.
    if (!String(form.name ?? '').trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if ((form.documents_qty ?? 0) <= 0) {
      toast.error('La cantidad de documentos debe ser mayor a cero')
      return
    }
    setSaving(true)
    try {
      await documentPackagesService.save(form)
      toast.success('Paquete guardado')
      setModal(false)
      void load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err?.response?.data?.error ?? 'Error al guardar el paquete')
    } finally {
      setSaving(false)
    }
  }

  const approve = async (r: PackagePurchaseRequest) => {
    try {
      await documentPackagesService.approve(r.id)
      toast.success('Aprobado — el tenant puede emitir de inmediato')
      void load()
    } catch {
      toast.error('No se pudo aprobar la compra')
    }
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    const reason = rejectReason.trim()
    if (!reason) {
      toast.error('Indique el motivo del rechazo')
      return
    }
    try {
      await documentPackagesService.reject(rejectTarget.id, reason)
      toast.success('Compra rechazada')
      setRejectTarget(null)
      setRejectReason('')
      void load()
    } catch {
      toast.error('No se pudo rechazar la compra')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Paquetes de documentos</h1>
          <p className="text-sm text-slate-500 mt-1">Catálogo y aprobación de compras adicionales</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nuevo paquete
        </button>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Paquete</th>
                <th className="px-4 py-3">Documentos</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {packages.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">{p.documents_qty}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 tabular-nums">
                    S/ {p.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.is_active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {packages.length === 0 && (
          <div className="text-center py-14">
            <Package className="mx-auto text-slate-300" size={32} />
            <p className="mt-2 font-medium text-slate-700">No hay paquetes registrados</p>
            <p className="text-sm text-slate-500 mt-1">Crea el primero para que los tenants puedan comprar documentos</p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Solicitudes pendientes</h2>
          {pending.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 text-center py-12">
            <Inbox className="mx-auto text-slate-300" size={32} />
            <p className="mt-2 text-sm text-slate-500">No hay compras en revisión.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {pending.map(r => (
              <div
                key={r.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 justify-between items-start"
              >
                <div className="text-sm space-y-1 min-w-0">
                  <p className="font-medium text-slate-800">{r.tenant_name ?? `Tenant #${r.tenant_id}`}</p>
                  <p className="text-slate-600">
                    {r.package_name ?? `Paquete #${r.package_id}`}
                    <span className="text-slate-400"> · {r.documents_qty} docs</span>
                  </p>
                  <p className="text-slate-800 font-semibold tabular-nums">S/ {r.amount.toFixed(2)}</p>
                  {r.receipt_url && (
                    <a
                      href={saasAssetUrl(r.receipt_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-700 text-xs font-medium hover:underline"
                    >
                      Ver comprobante
                    </a>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void approve(r)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                  >
                    <Check size={14} /> Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(r)
                      setRejectReason('')
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium transition-colors"
                  >
                    <X size={14} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? 'Editar paquete' : 'Nuevo paquete'}>
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Nombre *</label>
            <input
              className={INPUT}
              placeholder="Ej: Paquete 500 documentos"
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={LABEL}>Descripción</label>
            <textarea
              className={`${INPUT} resize-none`}
              rows={2}
              placeholder="Detalle visible para el tenant"
              value={form.description ?? ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Cantidad de documentos *</label>
              <input
                type="number"
                min="1"
                step="1"
                className={INPUT}
                value={form.documents_qty ?? 0}
                onChange={e => setForm(f => ({ ...f, documents_qty: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={LABEL}>Precio (S/)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={INPUT}
                value={form.price ?? 0}
                onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Orden de aparición</label>
            <input
              type="number"
              min="0"
              step="1"
              className={INPUT}
              value={form.sort_order ?? 0}
              onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
            />
            <p className="text-xs text-slate-500 mt-1">Menor número aparece primero en el panel del tenant.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={form.is_active ?? true}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            Activo (visible para los tenants)
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModal(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : form.id ? 'Actualizar' : 'Crear paquete'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Rechazar compra">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            El motivo se le mostrará al tenant. Sea concreto para que pueda corregir y volver a enviar.
          </p>
          <div>
            <label className={LABEL}>Motivo *</label>
            <textarea
              className={`${INPUT} resize-none`}
              rows={3}
              placeholder="Ej: el comprobante no corresponde al monto del paquete"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmReject()}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
            >
              Rechazar compra
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
