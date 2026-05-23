import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Check, X } from 'lucide-react'
import {
  documentPackagesService,
  type DocumentPackage,
  type PackagePurchaseRequest,
} from '@/services/documentPackages.service'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'

export default function DocumentPackagesPage() {
  const [packages, setPackages] = useState<DocumentPackage[]>([])
  const [pending, setPending] = useState<PackagePurchaseRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Partial<DocumentPackage>>({
    name: '', description: '', documents_qty: 50, price: 10, currency: 'PEN', is_active: true, sort_order: 0,
  })

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

  useEffect(() => { void load() }, [])

  const save = async () => {
    try {
      await documentPackagesService.save(form)
      toast.success('Paquete guardado')
      setModal(false)
      void load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err?.response?.data?.error ?? 'Error')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paquetes de documentos</h1>
          <p className="text-sm text-gray-500">Catálogo y aprobación de compras adicionales</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm({ name: '', description: '', documents_qty: 50, price: 10, currency: 'PEN', is_active: true, sort_order: 0 })
            setModal(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
        >
          <Plus size={16} /> Nuevo paquete
        </button>
      </div>

      <section className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Docs</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {packages.map(p => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">{p.documents_qty}</td>
                <td className="px-4 py-3">S/ {p.price.toFixed(2)}</td>
                <td className="px-4 py-3">{p.is_active ? 'Sí' : 'No'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-blue-600 text-xs font-medium"
                    onClick={() => {
                      setForm(p)
                      setModal(true)
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Solicitudes pendientes</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">No hay compras en revisión.</p>
        ) : (
          <div className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="bg-white border rounded-2xl p-4 flex flex-wrap gap-4 justify-between items-start">
                <div className="text-sm space-y-1">
                  <p><span className="text-gray-500">Tenant:</span> {r.tenant_name ?? r.tenant_id}</p>
                  <p><span className="text-gray-500">Paquete:</span> {r.package_name ?? r.package_id} ({r.documents_qty} docs)</p>
                  <p><span className="text-gray-500">Monto:</span> S/ {r.amount.toFixed(2)}</p>
                  {r.receipt_url && (
                    <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs">Ver comprobante</a>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium"
                    onClick={async () => {
                      await documentPackagesService.approve(r.id)
                      toast.success('Aprobado — el tenant puede emitir de inmediato')
                      void load()
                    }}
                  >
                    <Check size={14} /> Aprobar
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-100 text-red-800 text-xs font-medium"
                    onClick={async () => {
                      const reason = prompt('Motivo de rechazo')?.trim()
                      if (!reason) return
                      await documentPackagesService.reject(r.id, reason)
                      toast.success('Rechazado')
                      void load()
                    }}
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
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nombre" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descripción" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" className="border rounded-lg px-3 py-2 text-sm" placeholder="Cantidad docs" value={form.documents_qty ?? 0} onChange={e => setForm(f => ({ ...f, documents_qty: Number(e.target.value) }))} />
            <input type="number" className="border rounded-lg px-3 py-2 text-sm" placeholder="Precio" value={form.price ?? 0} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            Activo
          </label>
          <button type="button" onClick={() => void save()} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium">
            Guardar
          </button>
        </div>
      </Modal>
    </div>
  )
}
