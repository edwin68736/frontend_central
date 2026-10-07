import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { equiposService, type EquipCarrier, type EquipSettings } from '@/services/equipos.service'
import { apiError, BTN_PRIMARY, INPUT, LABEL } from './common'

export default function SettingsTab() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('equipos.settings')
  const [s, setS] = useState<EquipSettings | null>(null)
  const [carriers, setCarriers] = useState<EquipCarrier[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([equiposService.getSettings(), equiposService.listCarriers(false)])
      .then(([st, c]) => {
        setS(st)
        setCarriers(c)
      })
      .catch((e) => toast.error(apiError(e, 'No se pudo cargar la configuración')))
  }, [])

  if (!s) return <div className="flex justify-center py-16"><Spinner /></div>

  const save = async () => {
    setSaving(true)
    try {
      setS(await equiposService.updateSettings(s))
      toast.success('Configuración guardada')
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar la configuración'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <label className={LABEL}>Responsable de stock</label>
        <input value={s.stock_manager} disabled={!canEdit} onChange={(e) => setS({ ...s, stock_manager: e.target.value })} placeholder="Ej. Rosymar" className={INPUT} />
      </div>
      <div>
        <label className={LABEL}>Transportista por defecto</label>
        <select
          value={s.default_carrier_id ?? ''} disabled={!canEdit}
          onChange={(e) => setS({ ...s, default_carrier_id: e.target.value ? Number(e.target.value) : null })} className={INPUT}
        >
          <option value="">Ninguno</option>
          {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Alerta amarilla (días desde la llegada)</label>
          <input type="number" min={1} value={s.alert_yellow_days} disabled={!canEdit} onChange={(e) => setS({ ...s, alert_yellow_days: Number(e.target.value) })} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Alerta roja (días desde la llegada)</label>
          <input type="number" min={2} value={s.alert_red_days} disabled={!canEdit} onChange={(e) => setS({ ...s, alert_red_days: Number(e.target.value) })} className={INPUT} />
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Un paquete en agencia se ve verde antes del amarillo, amarillo hasta el rojo y rojo después; vence cuando se cumple el plazo de su transportista (15 días en Shalom).
      </p>
      <div>
        <label className={LABEL}>Siguiente N° de pedido</label>
        <input type="number" min={1} value={s.next_order_number} disabled={!canEdit} onChange={(e) => setS({ ...s, next_order_number: Number(e.target.value) })} className={INPUT} />
        <p className="text-xs text-slate-500 mt-1">La numeración es continua (no se reinicia cada mes). Debe ser mayor que el último pedido existente.</p>
      </div>
      {canEdit && <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>}
    </div>
  )
}
