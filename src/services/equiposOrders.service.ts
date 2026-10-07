import { api } from './api'

const base = '/superadmin/equipos'

export type SaleType = 'independiente' | 'promo_tk'
export type LineType = 'producto' | 'combo' | 'plan' | 'otro'
export type PaymentMethod = 'yape' | 'plin' | 'efectivo' | 'transferencia' | 'deposito' | 'otro'
export type DeliveryMode = 'agencia' | 'oficina' | 'pendiente_recojo'

export const SALE_TYPE_LABEL: Record<string, string> = { independiente: 'Independiente', promo_tk: 'Promo TK' }
export const METHOD_LABEL: Record<string, string> = {
  yape: 'Yape', plin: 'Plin', efectivo: 'Efectivo', transferencia: 'Transferencia', deposito: 'Depósito', otro: 'Otro',
}
export const PAYMENT_STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado', no_pago: 'Sin pago' }
export const VALIDATION_LABEL: Record<string, string> = {
  pendiente_validacion: 'Por validar', validado: 'Validado', observado: 'Observado',
}
export const ORDER_STATUS_LABEL: Record<string, string> = { borrador: 'Borrador', registrado: 'Confirmado', anulado: 'Anulado' }
export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  pendiente_envio: 'Por despachar', en_transito: 'En tránsito', en_agencia: 'En agencia', entregado: 'Recogido', retorno: 'En retorno',
}
export const DELIVERY_MODE_LABEL: Record<string, string> = { agencia: 'Agencia', oficina: 'Oficina', pendiente_recojo: 'Recojo en oficina' }

export interface EquipCustomerRow {
  id: number
  name: string
  doc_type: string
  doc_number: string | null
  contact_dni: string
  phone: string
  phone_kind: string
  notes: string
  orders: number
  balance: number
  credit: number
}

export interface CustomerInput {
  name: string
  doc_type: string
  doc_number: string
  contact_dni: string
  phone: string
  notes: string
}

export interface OrderItemInput {
  line_type: LineType
  product_id?: number | null
  combo_id?: number | null
  description: string
  plan_months: number
  quantity: number
  unit_price: number
  is_courtesy: boolean
  notes: string
}

export interface ShipmentInput {
  carrier_id: number | null
  guide_number: string
  destination_agency: string
  destination_department: string
  destination_province: string
  destination_district: string
  delivery_mode: DeliveryMode
  scheduled_dispatch_date: string
  notes: string
  freight_cost?: number | null
}

export interface OrderInput {
  customer_id: number | null
  customer_name: string
  customer_doc_type: string
  customer_doc_number: string
  contact_dni: string
  customer_phone: string
  save_customer: boolean
  sale_type: SaleType
  order_date: string
  billing_doc_type: string
  notes: string
  items: OrderItemInput[]
  shipment: ShipmentInput | null
}

export interface OrderItemView extends Omit<OrderItemInput, 'product_id' | 'combo_id'> {
  id: number
  line_no: number
  product_id: number | null
  combo_id: number | null
  subtotal: number
  product_name: string
  reference_price: number
  price_deviation: number
  components?: { product_id: number; code: string; quantity: number }[]
}

export interface PaymentLine {
  payment_id: number
  paid_at: string
  method: string
  moment: string
  reference: string
  invoice: string
  amount: number
  payment_total: number
  status: string
  notes: string
}

export interface TimelineEvent {
  at: string
  kind: string
  label: string
  future?: boolean
}

export interface PackingLine {
  product_id: number
  code: string
  quantity: number
}

export interface ShipmentView {
  id: number
  order_id: number
  carrier_id: number | null
  guide_number: string
  destination_agency: string
  destination_department: string
  destination_province: string
  destination_district: string
  delivery_mode: DeliveryMode
  scheduled_dispatch_date: string | null
  dispatched_at: string | null
  arrived_at: string | null
  pickup_deadline: string | null
  picked_up_at: string | null
  label_printed_at: string | null
  freight_cost: number
  status: string
  notes: string
  carrier_name: string
  carrier_code: string
  guide_label: string
  tracking_url: string
  dispatch_days: string
  days_since_arrival: number | null
  days_left: number | null
  alert: '' | 'verde' | 'amarillo' | 'rojo' | 'vencido'
  dispatch_day_notice: string
}

export interface OrderView {
  id: number
  order_number: number
  sale_type: SaleType
  order_date: string
  registered_at: string
  confirmed_at: string | null
  validated_at: string | null
  is_gift: boolean
  customer_id: number | null
  customer_name: string
  customer_doc_type: string
  customer_doc_number: string
  contact_dni: string
  customer_phone: string
  billing_doc_type: string
  total_amount: number
  paid_amount: number
  balance_amount: number
  payment_status: string
  validation_status: string
  validation_notes: string
  status: string
  notes: string
  items: OrderItemView[]
  payments: PaymentLine[] | null
  shipment: ShipmentView | null
  packing: PackingLine[] | null
  timeline: TimelineEvent[]
}

export interface OrderRow {
  id: number
  order_number: number
  sale_type: string
  order_date: string
  customer_name: string
  customer_doc_type: string
  customer_doc_number: string
  total_amount: number
  paid_amount: number
  balance_amount: number
  payment_status: string
  validation_status: string
  status: string
  is_gift: boolean
  shipment_status: string
  carrier_name: string
  guide_number: string
  department: string
  summary: string
}

export interface OrderListResult {
  rows: OrderRow[]
  total: number
  page: number
  per_page: number
  sum_total: number
  sum_balance: number
}

export interface OrderFilter {
  q?: string
  from?: string
  to?: string
  sale_type?: string
  payment_status?: string
  validation_status?: string
  status?: string
  shipment_status?: string
  carrier_id?: number
  department?: string
  page?: number
  per_page?: number
}

export interface ShipmentRow extends ShipmentView {
  order_number: number
  customer_name: string
  customer_phone: string
  validation_status: string
  payment_status: string
  total_amount: number
  balance_amount: number
  ready_to_dispatch: boolean
  packing: PackingLine[] | null
}

export interface PaymentInput {
  customer_id: number | null
  amount: number
  paid_at: string
  method: PaymentMethod
  moment: 'anticipado' | 'al_recoger'
  reference: string
  invoice: string
  notes: string
  allocations: { order_id: number; amount: number }[]
  auto_allocate: boolean
}

export interface PaymentView {
  id: number
  customer_id: number | null
  customer_name: string
  amount: number
  paid_at: string
  method: string
  moment: string
  reference: string
  invoice: string
  unallocated_amount: number
  status: string
  notes: string
  allocations: { order_id: number; order_number: number; amount: number }[]
}

export interface PaymentListResult {
  rows: PaymentView[]
  total: number
  page: number
  per_page: number
  sum: number
}

export interface AccountOrder {
  id: number
  order_number: number
  order_date: string
  total_amount: number
  paid_amount: number
  balance_amount: number
  payment_status: string
  status: string
  shipment_status: string
}

export interface CustomerAccount {
  customer: EquipCustomerRow
  total_ordered: number
  total_paid: number
  balance: number
  credit: number
  orders: AccountOrder[]
  payments: PaymentView[]
}

export interface NegativeStockItem {
  product_id: number
  code: string
  current: number
  needed: number
  resulting: number
}

/** Respuesta 409 del backend cuando confirmar dejaría productos con stock negativo. */
export function negativeStockItems(e: unknown): NegativeStockItem[] | null {
  const r = (e as { response?: { status?: number; data?: { code?: string; items?: NegativeStockItem[] } } })?.response
  return r?.status === 409 && r.data?.code === 'NEGATIVE_STOCK' ? (r.data.items ?? []) : null
}

interface OrderResponse {
  data: OrderView
  warnings?: string[]
}
const unwrap = (r: { data: OrderResponse }) => ({ order: r.data.data, warnings: r.data.warnings ?? [] })

const pinHeader = (pin?: string) => (pin ? { headers: { 'X-Security-Pin': pin } } : undefined)

export interface Lookup {
  success: boolean
  name: string
  doc_number: string
  address?: string
  department?: string
  province?: string
  district?: string
  status?: string
  condition?: string
}

export const equiposOrders = {
  lookup: (type: 'dni' | 'ruc', number: string) =>
    api.get<{ data: Lookup }>(`${base}/lookup/${type}`, { params: { number } }).then((r) => r.data.data),
  listCustomersPaged: (q: string | undefined, page: number, perPage: number) =>
    api.get<{ data: EquipCustomerRow[]; total: number }>(`${base}/customers`, { params: { q, page, limit: perPage } }).then((r) => ({ rows: r.data.data ?? [], total: r.data.total ?? 0 })),
  listCustomers: (q?: string, limit = 50) =>
    api.get<{ data: EquipCustomerRow[] }>(`${base}/customers`, { params: { q, limit } }).then((r) => r.data.data ?? []),
  createCustomer: (body: CustomerInput) => api.post(`${base}/customers`, body).then((r) => r.data.data as EquipCustomerRow),
  updateCustomer: (id: number, body: CustomerInput) => api.put(`${base}/customers/${id}`, body).then((r) => r.data.data as EquipCustomerRow),
  customerAccount: (id: number) => api.get<{ data: CustomerAccount }>(`${base}/customers/${id}/account`).then((r) => r.data.data),
  openBalances: (id: number) => api.get<{ data: AccountOrder[] }>(`${base}/customers/${id}/open-balances`).then((r) => r.data.data ?? []),

  listOrders: (f: OrderFilter) => api.get<{ data: OrderListResult }>(`${base}/orders`, { params: f }).then((r) => r.data.data),
  getOrder: (id: number) => api.get<{ data: OrderView }>(`${base}/orders/${id}`).then((r) => r.data.data),
  createOrder: (body: OrderInput) => api.post<OrderResponse>(`${base}/orders`, body).then(unwrap),
  updateOrder: (id: number, body: OrderInput & { allow_negative?: boolean; negative_note?: string }, pin?: string) =>
    api.put<OrderResponse>(`${base}/orders/${id}`, body, pinHeader(pin)).then(unwrap),
  confirmOrder: (id: number, body: { allow_negative?: boolean; negative_note?: string } = {}) =>
    api.post<OrderResponse>(`${base}/orders/${id}/confirm`, body).then(unwrap),
  cancelOrder: (id: number, reason: string, pin?: string) => api.post<OrderResponse>(`${base}/orders/${id}/cancel`, { reason }, pinHeader(pin)).then(unwrap),
  validateOrder: (id: number, notes = '') => api.post<OrderResponse>(`${base}/orders/${id}/validate`, { notes }).then(unwrap),
  observeOrder: (id: number, notes: string) => api.post<OrderResponse>(`${base}/orders/${id}/observe`, { notes }).then(unwrap),
  setNoPayment: (id: number, on: boolean, pin?: string) => api.post<OrderResponse>(`${base}/orders/${id}/no-payment`, { on }, pinHeader(pin)).then(unwrap),

  listShipments: (params: { status?: string; carrier_id?: number; q?: string }) =>
    api.get<{ data: ShipmentRow[] }>(`${base}/shipments`, { params }).then((r) => r.data.data ?? []),
  updateShipment: (orderId: number, body: ShipmentInput) => api.put<OrderResponse>(`${base}/orders/${orderId}/shipment`, body).then(unwrap),
  dispatch: (orderId: number, date?: string) => api.post<OrderResponse>(`${base}/orders/${orderId}/dispatch`, { date }).then(unwrap),
  arrived: (orderId: number, date?: string) => api.post<OrderResponse>(`${base}/orders/${orderId}/arrived`, { date }).then(unwrap),
  pickedUp: (orderId: number, date?: string) => api.post<OrderResponse>(`${base}/orders/${orderId}/picked-up`, { date }).then(unwrap),
  labelPrinted: (orderId: number) => api.post(`${base}/orders/${orderId}/label-printed`).then((r) => r.data),

  listPayments: (params: { customer_id?: number; from?: string; to?: string; method?: string; status?: string; q?: string; page?: number; per_page?: number }) =>
    api.get<{ data: PaymentListResult }>(`${base}/payments`, { params }).then((r) => r.data.data),
  createPayment: (body: PaymentInput) => api.post<{ data: PaymentView }>(`${base}/payments`, body).then((r) => r.data.data),
  voidPayment: (id: number, reason: string, pin?: string) => api.post<{ data: PaymentView }>(`${base}/payments/${id}/void`, { reason }, pinHeader(pin)).then((r) => r.data.data),
  allocatePayment: (id: number, allocations: { order_id: number; amount: number }[]) =>
    api.post<{ data: PaymentView }>(`${base}/payments/${id}/allocate`, { allocations }).then((r) => r.data.data),
}
