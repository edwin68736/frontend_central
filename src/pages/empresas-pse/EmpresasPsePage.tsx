import { useEffect, useMemo, useState } from 'react'
import { Building2, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import { pseEmpresasService, type PSEEmpresa } from '@/services/pseEmpresas.service'
import { getTenantUrl } from '@/utils/tenantUrl'

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleDateString('es-PE', { dateStyle: 'short' })
  } catch {
    return s
  }
}

export default function EmpresasPsePage() {
  const [list, setList] = useState<PSEEmpresa[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('')
  const [servidor, setServidor] = useState('')

  const params = useMemo(
    () => ({
      per_page: 100,
      search: search.trim() || undefined,
      estado: estado || undefined,
      servidor: servidor || undefined,
    }),
    [search, estado, servidor]
  )

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await pseEmpresasService.list(params)
      setList(res.data)
    } catch (e: any) {
      setList([])
      toast.error(e?.response?.data?.error ?? 'Error cargando empresas del PSE')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [params.search, params.estado, params.servidor])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Empresas en PSE (ValidaPSE)</h1>
        <p className="text-slate-500 text-sm mt-1">
          Lista obtenida desde la API de Gestión del PSE. Se cruza por RUC con la BD central para indicar si existe tenant.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por RUC o razón social..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Estado (todos)</option>
            <option value="ACTIVO">ACTIVO</option>
            <option value="INACTIVO">INACTIVO</option>
          </select>
          <select
            value={servidor}
            onChange={(e) => setServidor(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Servidor (todos)</option>
            <option value="DEMO">DEMO</option>
            <option value="PRODUCCIÓN">PRODUCCIÓN</option>
            <option value="PRODUCCION">PRODUCCION</option>
          </select>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? 'Cargando...' : `${list.length} empresa(s)`}
          </p>
          <button
            type="button"
            onClick={fetchList}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </CardHeader>
        {loading ? (
          <CardBody className="flex justify-center py-12">
            <Spinner size={32} />
          </CardBody>
        ) : list.length === 0 ? (
          <CardBody>
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Building2 size={40} className="mb-3 opacity-50" />
              <p className="text-sm">Ninguna empresa en el PSE</p>
              <p className="text-xs mt-1 text-center max-w-sm">
                Verifica que el servidor tenga configurado el token de gestión (VALIDAPSE_MGMT_TOKEN) o que existan empresas registradas.
              </p>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  {['Razón social', 'RUC', 'Tenant', 'Estado', 'Servidor', 'Inicio', 'Fin', 'OSE', 'Firmas'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {list.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{it.razon_social || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{it.ruc || '—'}</td>
                    <td className="px-4 py-3">
                      {it.tenant ? (
                        <a
                          href={getTenantUrl(it.tenant.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          title={getTenantUrl(it.tenant.slug)}
                        >
                          {it.tenant.slug}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          it.estado === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {it.estado || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{it.servidor || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(it.fecha_inicio)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {it.sin_limite_fecha ? 'Sin límite' : formatDate(it.fecha_fin)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${it.ose_activo ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {it.ose_activo ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{Number.isFinite(it.firmas_usadas) ? it.firmas_usadas : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

