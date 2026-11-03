import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'
import { todayISO } from './ordersCommon'

/**
 * Fecha de una acción del envío (despacho, llegada a agencia, recojo): hoy (Lima) por defecto y
 * cualquier día pasado, para registrar envíos que ya ocurrieron; nunca una fecha futura. El backend
 * retrocede las fechas previas si hace falta (despacho ← llegada ← recojo).
 */
export default function ShipmentDateModal({ open, busy, title, description, label, confirmLabel, onClose, onConfirm }: {
  open: boolean
  busy: boolean
  title: string
  description: string
  label: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (date: string) => void
}) {
  const [date, setDate] = useState(todayISO())
  const today = todayISO()
  useEffect(() => { if (open) setDate(todayISO()) }, [open])
  const invalid = !date || date > today

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{description}</p>
        <div>
          <label htmlFor="shipment-date" className={LABEL}>{label}</label>
          <input id="shipment-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={INPUT} />
          {date > today && <p className="text-xs text-red-600 mt-1">La fecha no puede ser futura.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy || invalid} onClick={() => onConfirm(date)}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  )
}
