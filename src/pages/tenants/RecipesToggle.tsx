import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { tenantsService } from '@/services/tenants.service'

/**
 * Insumos y recetas de Tukichef. No es un módulo del plan: es un interruptor por empresa guardado en su propia base de datos,
 * por eso va aparte de la lista de módulos.
 */
export function RecipesToggle({ tenantId }: { tenantId: number }) {
  const [state, setState] = useState<{ enabled: boolean; available: boolean } | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState(null)
    setFailed(false)
    tenantsService
      .getRestaurantRecipes(tenantId)
      .then((s) => {
        if (!cancelled) setState(s)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  const toggle = async () => {
    if (!state?.available || saving) return
    const enabled = !state.enabled
    setSaving(true)
    try {
      await tenantsService.setRestaurantRecipes(tenantId, enabled)
      setState({ ...state, enabled })
      toast.success(`Insumos y recetas ${enabled ? 'activado' : 'desactivado'}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo actualizar')
    } finally {
      setSaving(false)
    }
  }

  let help = 'Muestra «Insumos» en Tukichef. Requiere el módulo Restaurante. El cliente debe volver a abrir la app.'
  if (failed) help = 'No se pudo leer el estado.'
  else if (state && !state.available) help = 'La base de datos de esta empresa aún no está migrada.'

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100">
      <div>
        <p className="text-sm font-medium text-slate-700">Insumos y recetas (Tukichef)</p>
        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{help}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!state?.enabled}
        aria-label="Insumos y recetas"
        disabled={!state?.available || saving}
        onClick={toggle}
        className={`relative inline-flex rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
          state?.enabled ? 'bg-blue-600' : 'bg-slate-200'
        }`}
        style={{ height: '22px', width: '40px' }}
      >
        <span
          className={`absolute top-0.5 bg-white rounded-full shadow transition-transform ${
            state?.enabled ? 'translate-x-[19px]' : 'translate-x-0.5'
          }`}
          style={{ width: '18px', height: '18px' }}
        />
      </button>
    </div>
  )
}
