import { api } from './api'
import type { OrderView } from './equiposOrders.service'

const base = '/superadmin/equipos'

export interface ReturnItem { product_id: number; code: string; quantity: number }

export interface EquipReturnView {
  id: number
  return_number: number
  order_id: number | null
  shipment_id: number | null
  order_number: number
  customer_name: string
  guide_number: string
  requested_at: string | null
  received_at: string | null
  items: ReturnItem[]
  items_text: string
  unpaid_balance: number
  return_cost: number
  status: 'solicitado' | 'en_camino' | 'recibido' | 'desechado_por_agencia'
  condition: 'buen_estado' | 'danado'
  action_taken: string
  notes: string
  reshipped: boolean
}

export const RETURN_STATUS_LABEL: Record<string, string> = {
  solicitado: 'Solicitado', en_camino: 'En camino', recibido: 'Recibido', desechado_por_agencia: 'Desechado por la agencia',
}
export const CONDITION_LABEL: Record<string, string> = { buen_estado: 'Buen estado', danado: 'Dañado' }

export interface ReturnInput {
  order_id: number
  requested_at?: string
  items?: { product_id: number; quantity: number }[]
  unpaid_balance?: number
  return_cost: number
  condition: 'buen_estado' | 'danado'
  notes: string
}

export interface ReturnUpdate {
  status?: string
  condition?: string
  action_taken?: string
  return_cost: number
  unpaid_balance: number
  received_at?: string
  notes?: string
}

export interface Dashboard {
  period: string
  orders: number
  sales_total: number
  collected: number
  receivable: number
  pending_validation: number
  observed: number
  ready_to_dispatch: number
  waiting_dispatch: number
  in_transit: number
  in_transit_follow_up: number
  in_agency: number
  agency_yellow: number
  agency_red: number
  agency_expired: number
  picked_up_with_debt: number
  open_returns: number
  return_cost: number
  return_unpaid: number
  stock_red: { code: string; name: string; current: number }[]
  negative_stock: { code: string; name: string; current: number }[]
  stock_visible: boolean
}

export interface AlertItem {
  kind: string
  severity: 'alta' | 'media' | 'baja'
  order_id: number
  order_number: number
  customer_name: string
  customer_phone: string
  carrier_name: string
  guide_number: string
  days: number
  days_left: number | null
  balance_amount: number
  message: string
}

export interface TypeSummary { sale_type: string; orders: number; sales: number; paid: number; balance: number }
export interface Summary {
  period: string
  by_type: TypeSummary[]
  total: TypeSummary
  gift_orders: number
  collected: number
  payments_by_method: { method: string; count: number; total: number }[]
  returns: number
  return_cost: number
  return_unpaid: number
}
export interface SalesReport {
  period: string
  lines: { kind: string; code: string; name: string; quantity: number; amount: number }[]
  units: { code: string; name: string; direct_independiente: number; direct_promo_tk: number; combo_independiente: number; combo_promo_tk: number; total: number }[]
}
export interface DebtCustomer {
  customer_id: number | null
  customer_name: string
  customer_phone: string
  balance: number
  b0_15: number
  b16_30: number
  b31_60: number
  b60_plus: number
  oldest_days: number
  orders: { order_id: number; order_number: number; order_date: string; total_amount: number; balance_amount: number; days: number; shipment_status: string }[]
}
export interface Collections { total: number; b0_15: number; b16_30: number; b31_60: number; b60_plus: number; customers: DebtCustomer[] }
export interface ReplenishRow {
  product_id: number; code: string; name: string; stock: number; monthly_avg: number; cover_days: number | null
  target: number; suggested: number; urgency: 'alta' | 'media' | 'ok'; months_of_data: number
}
export interface ProfitRow { sale_type: string; revenue: number; cogs: number; freight: number; profit: number; margin: number }
export interface ProfitReport { period: string; rows: ProfitRow[]; total: ProfitRow; return_cost: number; cost_coverage: number; missing_cost_products: string[] }
export interface ClosedPeriod { period: string; closed_at: string; products: number }

const pinHeader = (pin?: string) => (pin ? { headers: { 'X-Security-Pin': pin } } : undefined)

export const equiposControl = {
  listReturns: (status?: string) => api.get<{ data: EquipReturnView[] }>(`${base}/returns`, { params: { status } }).then((r) => r.data.data ?? []),
  createReturn: (b: ReturnInput) => api.post<{ data: EquipReturnView }>(`${base}/returns`, b).then((r) => r.data.data),
  updateReturn: (id: number, b: ReturnUpdate) => api.put<{ data: EquipReturnView }>(`${base}/returns/${id}`, b).then((r) => r.data.data),
  reship: (id: number) => api.post<{ data: OrderView }>(`${base}/returns/${id}/reship`).then((r) => r.data.data),

  dashboard: (period?: string) =>
    api.get<{ data: Dashboard; money_visible: boolean }>(`${base}/dashboard`, { params: { period } }).then((r) => ({ d: r.data.data, money: r.data.money_visible })),
  alerts: () => api.get<{ data: AlertItem[] }>(`${base}/alerts`).then((r) => r.data.data ?? []),

  summary: (period: string) => api.get<{ data: Summary }>(`${base}/reports/summary`, { params: { period } }).then((r) => r.data.data),
  sales: (period: string) => api.get<{ data: SalesReport }>(`${base}/reports/sales`, { params: { period } }).then((r) => r.data.data),
  collections: () => api.get<{ data: Collections }>(`${base}/reports/collections`).then((r) => r.data.data),
  replenishment: () => api.get<{ data: ReplenishRow[] }>(`${base}/reports/replenishment`).then((r) => r.data.data ?? []),
  profit: (period: string) => api.get<{ data: ProfitReport }>(`${base}/reports/profit`, { params: { period } }).then((r) => r.data.data),
  periods: () => api.get<{ data: ClosedPeriod[] }>(`${base}/periods`).then((r) => r.data.data ?? []),
  closePeriod: (period: string, pin?: string) => api.post(`${base}/periods/${period}/close`, undefined, pinHeader(pin)).then((r) => r.data.data as ClosedPeriod),
  reopenPeriod: (period: string, pin?: string) => api.post(`${base}/periods/${period}/reopen`, undefined, pinHeader(pin)).then((r) => r.data),
}
