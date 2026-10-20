import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { todayISO } from './ordersCommon'

/** Registro manual de la fecha de llegada a la agencia: hoy (Lima) por defecto, nunca una fecha futura. */
export default function ArrivalModal({ open, busy, onClose, onConfirm }: {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: (date: string) => void
}) {
  const [date, setDate] = useState(todayISO())
  const today = todayISO()
  useEffect(() => { if (open) setDate(todayISO()) }, [open])
  const invalid = !date || date > today

  return (
    <Modal open={open} onClose={onClose} title="Registrar llegada a agencia">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Indica el día en que el paquete llegó a la agencia de destino. Desde esa fecha corre el plazo de recojo.</p>
        <div>
          <label htmlFor="arrival-date" className={LABEL}>Fecha de llegada</label>
          <input id="arrival-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={INPUT} />
          {date > today && <p className="text-xs text-red-600 mt-1">La fecha de llegada no puede ser futura.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy || invalid} onClick={() => onConfirm(date)}>Registrar llegada</button>
        </div>
      </div>
    </Modal>
  )
}
