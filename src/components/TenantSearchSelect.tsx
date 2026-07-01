import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { tenantsService, type Tenant } from '@/services/tenants.service'
import Spinner from '@/components/ui/Spinner'

interface TenantSearchSelectProps {
  value: number
  onChange: (tenantId: number, tenant?: Tenant) => void
  disabled?: boolean
}

/** Selector de empresa con búsqueda remota (máx. 20 por consulta). */
export default function TenantSearchSelect({ value, onChange, disabled }: TenantSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSelected = useCallback(async (id: number) => {
    if (!id) {
      setSelectedLabel('')
      return
    }
    try {
      const { data } = await tenantsService.get(id)
      setSelectedLabel(data.ruc ? `${data.name} (${data.ruc})` : data.name)
    } catch {
      setSelectedLabel(`Empresa #${id}`)
    }
  }, [])

  useEffect(() => {
    loadSelected(value)
  }, [value, loadSelected])

  const search = useCallback((q: string) => {
    setLoading(true)
    tenantsService
      .list({ q, page: 1, per_page: 20 })
      .then(res => setResults(res.data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, search])

  const handleSelect = (tenant: Tenant) => {
    onChange(tenant.id, tenant)
    setSelectedLabel(tenant.ruc ? `${tenant.name} (${tenant.ruc})` : tenant.name)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full text-left border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
      >
        {value ? selectedLabel || `Empresa #${value}` : 'Selecciona empresa...'}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="relative p-2 border-b border-slate-100">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar por nombre o RUC..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6">
                <Spinner size={20} />
              </div>
            ) : results.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Sin resultados</p>
            ) : (
              results.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                    t.id === value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  {t.ruc && <span className="text-slate-500 ml-2">{t.ruc}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
