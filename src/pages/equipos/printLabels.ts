import { toast } from 'sonner'
import { equiposOrders } from '@/services/equiposOrders.service'
import { buildLabelSheet, openLabel } from './shippingLabel'

export const MAX_LABELS = 60

/** Imprime en un solo PDF A4 los rótulos de los pedidos elegidos (6 por hoja, con salto de página). */
export async function printLabelsFor(orderIds: number[]): Promise<boolean> {
  if (orderIds.length === 0) {
    toast.error('Selecciona al menos un pedido')
    return false
  }
  if (orderIds.length > MAX_LABELS) {
    toast.error(`Máximo ${MAX_LABELS} rótulos por impresión`)
    return false
  }
  const views = await Promise.all(orderIds.map((id) => equiposOrders.getOrder(id)))
  const printable = views.filter((v) => v.status === 'registrado' && v.shipment)
  if (printable.length === 0) {
    toast.error('Ninguno de los pedidos elegidos tiene un envío confirmado')
    return false
  }
  if (printable.length < views.length) toast.warning(`${views.length - printable.length} pedido(s) sin envío confirmado se omitieron`)
  if (!openLabel(buildLabelSheet(printable))) {
    toast.error('El navegador bloqueó la ventana del PDF; permite las ventanas emergentes')
    return false
  }
  await Promise.allSettled(printable.map((v) => equiposOrders.labelPrinted(v.id)))
  toast.success(`${printable.length} rótulo(s) generado(s)`)
  return true
}
