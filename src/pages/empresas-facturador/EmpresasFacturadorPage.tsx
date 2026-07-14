import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Edit, Loader2, Power, RefreshCw, Search } from 'lucide-react'
import { tenantsService, type TenantConectadoFacturador } from '@/services/tenants.service'
import { resolveTenantUrl } from '@/utils/tenantUrl'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import PaginationBar from '@/components/ui/PaginationBar'
import type { PerPageOption } from '@/services/pagination'

function formatDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

export default function EmpresasFacturadorPage() {
  const navigate = useNavigate()
  const [list, setList] = useState<TenantConectadoFacturador[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [conexionFilter, setConexionFilter] = useState('')
  const [enabledFilter, setEnabledFilter] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(25)
  const [togglingRuc, setTogglingRuc] = useState<string | null>(null)

  const fetchList = async () => {
    setLoading(true)
    try {
      const data = await tenantsService.listConectadosFacturador()
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((t) => {
      if (conexionFilter && t.conexion_tipo !== conexionFilter) return false
      if (enabledFilter === 'enabled' && t.enabled === false) return false
      if (enabledFilter === 'disabled' && t.enabled !== false) return false
      if (!q) return true
      return (
        t.ruc.toLowerCase().includes(q) ||
        (t.name || '').toLowerCase().includes(q) ||
        (t.slug || '').toLowerCase().includes(q)
      )
    })
  }, [list, search, conexionFilter, enabledFilter])

  // Reiniciar a la primera página cuando cambian filtros/búsqueda o el tamaño de página.
  useEffect(() => {
    setPage(1)
  }, [search, conexionFilter, enabledFilter, perPage])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  )

  const handleEditar = (t: TenantConectadoFacturador) => {
    navigate('/tenants', { state: { openSunatId: t.id } })
  }

  const handleToggleEnabled = async (t: TenantConectadoFacturador) => {
    const ruc = (t.ruc || '').trim()
    if (ruc.length !== 11) {
      window.alert('RUC inválido: no se puede cambiar el estado en el facturador.')
      return
    }
    const currentlyEnabled = t.enabled !== false
    const next = !currentlyEnabled
    if (!next && !window.confirm(`¿Deshabilitar la empresa ${ruc} en el facturador? Dejará de poder emitir comprobantes.`)) {
      return
    }
    setTogglingRuc(ruc)
    try {
      await tenantsService.setFacturadorEnabled(ruc, next)
      setList((prev) => prev.map((row) => (row.ruc === ruc ? { ...row, enabled: next } : row)))
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      window.alert(msg || 'No se pudo cambiar el estado en el facturador.')
    } finally {
      setTogglingRuc(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Empresas en facturador</h1>
        <p className="text-slate-500 text-sm mt-1">
          Lista unificada desde Lycet (GET /api/v1/empresas). Indica si cada empresa emite vía SUNAT directo o PSE.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por RUC, empresa o slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <select
            value={conexionFilter}
            onChange={(e) => setConexionFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">Conexión (todas)</option>
            <option value="SUNAT">SUNAT directo</option>
            <option value="PSE">PSE</option>
          </select>
          <select
            value={enabledFilter}
            onChange={(e) => setEnabledFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="">Estado (todos)</option>
            <option value="enabled">Habilitadas</option>
            <option value="disabled">Deshabilitadas</option>
          </select>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? 'Cargando...' : `${filtered.length} empresa(s) en facturador`}
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
        ) : filtered.length === 0 ? (
          <CardBody>
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Building2 size={40} className="mb-3 opacity-50" />
              <p className="text-sm">Ninguna empresa en el facturador</p>
              <p className="text-xs mt-1 text-center max-w-md">
                Registra empresas en Lycet o, desde Empresas, configura SUNAT/PSE de un tenant y usa Sincronizar con facturador.
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
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  {[
                    'Empresa',
                    'RUC',
                    'Slug',
                    'Conexión',
                    'Provider',
                    'Ambiente',
                    'Habilitado (facturador)',
                    'Conexión SUNAT',
                    'Última sync',
                    'Acciones',
                  ].map((h) => (
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
                {paged.map((t) => (
                  <tr key={t.ruc || t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {(t.name || t.ruc).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">
                          {t.name || (t.id ? '—' : 'Solo en Lycet')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{t.ruc || '—'}</td>
                    <td className="px-4 py-3">
                      {t.slug ? (
                        t.id ? (
                          <a
                            href={resolveTenantUrl(t)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {t.slug}
                          </a>
                        ) : (
                          <span className="font-mono text-xs text-slate-600">{t.slug}</span>
                        )
                      ) : (
                        <span className="text-slate-400 text-xs">{t.id ? '—' : 'Sin tenant'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={t.conexion_tipo === 'PSE' ? 'blue' : 'green'}>
                        {t.conexion_tipo === 'PSE' ? 'PSE' : 'SUNAT'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{t.provider || t.send_mode || '—'}</td>
                    <td className="px-4 py-3">
                      {t.ambiente_lycet ? (
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            t.ambiente_lycet === 'produccion'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.ambiente_lycet === 'produccion' ? 'Producción' : 'Pruebas'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={togglingRuc === t.ruc || (t.ruc || '').trim().length !== 11}
                        onClick={() => handleToggleEnabled(t)}
                        title={
                          t.enabled !== false
                            ? 'Habilitada en el facturador — clic para deshabilitar'
                            : 'Deshabilitada en el facturador — clic para habilitar'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          t.enabled !== false
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {togglingRuc === t.ruc ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Power size={13} />
                        )}
                        {t.enabled !== false ? 'Habilitada' : 'Deshabilitada'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {t.connection_status ? (
                        <Badge variant={t.connection_status === 'connected' ? 'green' : 'yellow'}>
                          {t.connection_status}
                        </Badge>
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
          <PaginationBar
            page={page}
            perPage={perPage}
            total={filtered.length}
            totalPages={totalPages}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            itemLabel="empresa(s)"
          />
          </>
        )}
      </Card>
    </div>
  )
}
