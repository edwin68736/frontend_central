import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileCheck, Edit, RefreshCw } from 'lucide-react'
import { tenantsService, type TenantConectadoSunat } from '@/services/tenants.service'
import { getTenantUrl } from '@/utils/tenantUrl'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'

function formatDate(s: string | null): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

export default function EmpresasSunatPage() {
  const navigate = useNavigate()
  const [list, setList] = useState<TenantConectadoSunat[]>([])
  const [loading, setLoading] = useState(true)

  const fetchList = async () => {
    setLoading(true)
    try {
      const data = await tenantsService.listConectadosSunat()
      setList(data)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleEditar = (t: TenantConectadoSunat) => {
    navigate('/tenants', { state: { openSunatId: t.id } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Empresas conectadas con SUNAT</h1>
        <p className="text-slate-500 text-sm mt-1">
          Lista obtenida de Lycet (GET /api/v1/empresas). Al editar un tenant en Empresas y guardar su configuración SUNAT, los datos se sincronizan con Lycet.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? 'Cargando...' : `${list.length} empresa(s) conectada(s)`}
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
              <FileCheck size={40} className="mb-3 opacity-50" />
              <p className="text-sm">Ninguna empresa en Lycet</p>
              <p className="text-xs mt-1 text-center max-w-sm">
                La lista viene del facturador Lycet. Registra empresas en Lycet o, desde Empresas, configura SUNAT de un tenant y usa Sincronizar.
              </p>
              <button
                type="button"
                onClick={() => navigate('/tenants')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Ir a Empresas
              </button>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  {['Empresa', 'RUC', 'Slug', 'En Lycet', 'Ambiente Lycet', 'Última sincronización', 'Acciones'].map((h) => (
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
                {list.map((t) => (
                  <tr key={t.ruc || t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {(t.name || t.ruc).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{t.name || (t.id ? '—' : 'Solo en Lycet')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{t.ruc || '—'}</td>
                    <td className="px-4 py-3">
                      {t.slug ? (
                        <a
                          href={getTenantUrl(t.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          title={getTenantUrl(t.slug)}
                        >
                          {t.slug}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">{t.id ? '—' : 'Sin tenant'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        Sí
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.ambiente_lycet ? (
                        <span className={`text-xs font-medium px-2 py-1 rounded ${t.ambiente_lycet === 'produccion' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                          {t.ambiente_lycet === 'produccion' ? 'Producción' : 'Pruebas'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(t.sunat_connected_at)}</td>
                    <td className="px-4 py-3">
                      {t.id ? (
                        <button
                          type="button"
                          onClick={() => handleEditar(t)}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Edit size={12} />
                          Editar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate('/tenants')}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
                        >
                          Ir a Empresas
                        </button>
                      )}
                    </td>
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
