import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import SearchSelect from '@/components/ui/SearchSelect'
import { useConfirm } from './ConfirmProvider'
import { useAuth } from '@/contexts/AuthContext'
import { equiposService, type EquipCarrier, type EquipSettings } from '@/services/equipos.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'

export default function SettingsTab() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('equipos.settings')
  const [s, setS] = useState<EquipSettings | null>(null)
  const [carriers, setCarriers] = useState<EquipCarrier[]>([])
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const [hasPin, setHasPin] = useState(false)
  const [pin, setPin] = useState({ current: '', next: '', repeat: '' })
  const [savingPin, setSavingPin] = useState(false)

  useEffect(() => {
    void Promise.all([equiposService.getSettings(), equiposService.listCarriers(false), equiposService.hasSecurityPin()])
      .then(([st, c, hp]) => {
        setS(st)
        setCarriers(c)
        setHasPin(hp)
      })
      .catch((e) => toast.error(apiError(e, 'No se pudo cargar la configuración')))
  }, [])

  if (!s) return <div className="flex justify-center py-16"><Spinner /></div>

  const savePin = async () => {
    if (!/^\d{4,6}$/.test(pin.next)) return toast.error('El PIN debe tener de 4 a 6 dígitos')
    if (pin.next !== pin.repeat) return toast.error('La confirmación del PIN no coincide')
    if (hasPin && !pin.current) return toast.error('Ingresa tu PIN actual')
    if (!(await confirm({ title: hasPin ? 'Cambiar PIN de seguridad' : 'Crear PIN de seguridad', message: 'Este PIN se pedirá para editar pedidos confirmados, anular pedidos y cobros, ajustar stock y abrir o cerrar meses.', confirmLabel: 'Guardar PIN' }))) return
    setSavingPin(true)
    try {
      await equiposService.setSecurityPin(pin.next, pin.current || undefined)
      toast.success('PIN de seguridad guardado')
      setHasPin(true)
      setPin({ current: '', next: '', repeat: '' })
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar el PIN'))
    } finally {
      setSavingPin(false)
    }
  }

  const save = async () => {
    if (!(await confirm({ title: 'Guardar configuración', message: 'Se aplicarán los nuevos valores de alertas, numeración y transportista por defecto.', confirmLabel: 'Guardar' }))) return
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
        <SearchSelect value={s.default_carrier_id} disabled={!canEdit} clearable placeholder="Ninguno" searchPlaceholder="Buscar transportista…"
          options={carriers.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => setS({ ...s, default_carrier_id: v ? Number(v) : null })} />
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

      {canEdit && (
        <section className="border-t border-slate-200 pt-5 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ShieldCheck size={16} className="text-indigo-600" /> PIN de seguridad {hasPin ? <span className="text-xs font-normal text-emerald-700">(configurado)</span> : <span className="text-xs font-normal text-amber-700">(sin configurar)</span>}</h3>
          <p className="text-xs text-slate-500">Se pide antes de editar pedidos confirmados, anular pedidos o cobros, marcar «sin pago», ajustar stock y abrir o cerrar meses. Tras 5 intentos fallidos se bloquea 5 minutos.</p>
          <div className="grid grid-cols-3 gap-3">
            {hasPin && <div><label className={LABEL}>PIN actual</label><input type="password" inputMode="numeric" maxLength={6} value={pin.current} onChange={(e) => setPin({ ...pin, current: e.target.value.replace(/\D/g, '') })} className={INPUT} autoComplete="off" /></div>}
            <div><label className={LABEL}>{hasPin ? 'PIN nuevo' : 'PIN'}</label><input type="password" inputMode="numeric" maxLength={6} value={pin.next} onChange={(e) => setPin({ ...pin, next: e.target.value.replace(/\D/g, '') })} className={INPUT} autoComplete="off" /></div>
            <div><label className={LABEL}>Repetir PIN</label><input type="password" inputMode="numeric" maxLength={6} value={pin.repeat} onChange={(e) => setPin({ ...pin, repeat: e.target.value.replace(/\D/g, '') })} className={INPUT} autoComplete="off" /></div>
          </div>
          <button type="button" className={BTN_SECONDARY} disabled={savingPin} onClick={() => void savePin()}>{savingPin ? 'Guardando…' : hasPin ? 'Cambiar PIN' : 'Crear PIN'}</button>
        </section>
      )}
    </div>
  )
}
