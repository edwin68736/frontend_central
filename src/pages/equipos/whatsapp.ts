/** Mensajes de WhatsApp prellenados para el seguimiento del cliente (se abre wa.me; el envío es manual). */

/** Deja el celular en formato internacional peruano; devuelve null si no parece un celular. */
export function waNumber(phone: string): string | null {
  const d = phone.replace(/[^\d]/g, '')
  if (d.length === 9 && d.startsWith('9')) return `51${d}`
  if (d.length === 11 && d.startsWith('519')) return d
  if (d.length >= 10 && d.length <= 15 && !d.startsWith('0')) return d
  return null
}

export interface WaContext {
  customer: string
  orderNumber: number
  carrier?: string
  guide?: string
  guideLabel?: string
  agency?: string
  deadline?: string
  balance?: number
}

const money = (n: number) => `S/ ${n.toFixed(2)}`

export type WaKind = 'despachado' | 'llego' | 'recordatorio' | 'vence_pronto' | 'saldo'

export const WA_LABEL: Record<WaKind, string> = {
  despachado: 'Avisar despacho',
  llego: 'Avisar llegada',
  recordatorio: 'Recordar recojo',
  vence_pronto: 'Plazo por vencer',
  saldo: 'Cobrar saldo',
}

export function waText(kind: WaKind, c: WaContext): string {
  const hi = `Hola ${c.customer}, te escribimos de Tukifac.`
  const guide = c.guide ? ` ${c.guideLabel || 'Guía'}: ${c.guide}${c.carrier ? ` (${c.carrier})` : ''}.` : ''
  switch (kind) {
    case 'despachado':
      return `${hi} Tu pedido N° ${c.orderNumber} ya fue despachado.${guide} Te avisaremos cuando llegue a la agencia.`
    case 'llego':
      return `${hi} Tu pedido N° ${c.orderNumber} ya llegó${c.agency ? ` a ${c.agency}` : ' a la agencia'}.${guide}${c.deadline ? ` Tienes hasta el ${c.deadline} para recogerlo.` : ''}${c.balance && c.balance > 0 ? ` Saldo pendiente: ${money(c.balance)}.` : ''}`
    case 'recordatorio':
      return `${hi} Te recordamos que tu pedido N° ${c.orderNumber} está en la agencia esperando que lo recojas.${guide}${c.deadline ? ` El plazo vence el ${c.deadline}.` : ''}${c.balance && c.balance > 0 ? ` Saldo pendiente: ${money(c.balance)}.` : ''}`
    case 'vence_pronto':
      return `${hi} Tu pedido N° ${c.orderNumber} vence pronto en la agencia${c.deadline ? ` (${c.deadline})` : ''}. De no recogerlo, será devuelto.${guide}`
    case 'saldo':
      return `${hi} Tienes un saldo pendiente de ${money(c.balance ?? 0)} por el pedido N° ${c.orderNumber}. ¿Nos confirmas el pago? Gracias.`
  }
}

/** Enlace wa.me con el mensaje; null si el cliente no tiene un celular utilizable. */
export function waLink(phone: string, text: string): string | null {
  const n = waNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null
}
