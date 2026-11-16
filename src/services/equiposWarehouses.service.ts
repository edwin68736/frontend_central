import { api } from './api'

const base = '/superadmin/equipos'

export interface Warehouse {
  id: number
  code: string
  name: string
  is_default: boolean
  active: boolean
  notes: string
}

export interface WarehouseStockRow {
  product_id: number
  code: string
  name: string
  kind: string
  by_warehouse: Record<string, number>
  total: number
}

export interface ProductLine {
  product_id: number
  code: string
  name: string
  quantity: number
  sent?: number
  pending?: number
}

export interface RequirementView {
  id: number
  number: number
  requesting_warehouse_id: number
  supplying_warehouse_id: number
  requesting_name: string
  supplying_name: string
  status: 'pendiente' | 'parcial' | 'atendido' | 'anulado'
  requested_at: string
  notes: string
  created_by_name: string
  cancelled_at: string | null
  cancel_reason: string
  items: ProductLine[]
  transfers: number[]
}

export interface TransferView {
  id: number
  number: number
  from_warehouse_id: number
  to_warehouse_id: number
  from_name: string
  to_name: string
  requirement_id: number | null
  requirement_number: number | null
  status: 'registrada' | 'anulada'
  transferred_at: string
  notes: string
  created_by_name: string
  cancelled_at: string | null
  cancel_reason: string
  items: ProductLine[]
}

export interface TransferListResult {
  rows: TransferView[]
  total: number
  page: number
  per_page: number
}

export interface TransferItemInput { product_id: number; quantity: number }

export interface RequirementInput {
  supplying_warehouse_id: number
  requesting_warehouse_id?: number
  date?: string
  notes: string
  items: TransferItemInput[]
}

export interface TransferInput {
  from_warehouse_id?: number
  to_warehouse_id?: number
  requirement_id?: number
  date?: string
  notes: string
  items: TransferItemInput[]
  allow_negative?: boolean
  negative_note?: string
}

const pinHeader = (pin?: string) => (pin ? { headers: { 'X-Security-Pin': pin } } : undefined)

export const REQUIREMENT_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', parcial: 'Atendido parcial', atendido: 'Atendido', anulado: 'Anulado',
}
export const docNumber = (prefix: 'RQ' | 'TR', n: number) => `${prefix}-${String(n).padStart(5, '0')}`

export const equiposWarehouses = {
  list: (includeInactive = false) =>
    api.get<{ data: Warehouse[] }>(`${base}/warehouses`, { params: includeInactive ? { include_inactive: 1 } : undefined }).then((r) => r.data.data ?? []),
  create: (body: { name: string; notes: string }) => api.post<{ data: Warehouse }>(`${base}/warehouses`, body).then((r) => r.data.data),
  update: (id: number, body: { name?: string; notes: string; active?: boolean }) => api.put<{ data: Warehouse }>(`${base}/warehouses/${id}`, body).then((r) => r.data.data),
  stock: () => api.get<{ data: WarehouseStockRow[] }>(`${base}/stock/warehouses`).then((r) => r.data.data ?? []),

  listRequirements: (status?: string) =>
    api.get<{ data: RequirementView[] }>(`${base}/requirements`, { params: { status } }).then((r) => r.data.data ?? []),
  createRequirement: (body: RequirementInput) => api.post<{ data: RequirementView }>(`${base}/requirements`, body).then((r) => r.data.data),
  cancelRequirement: (id: number, reason: string, pin?: string) =>
    api.post<{ data: RequirementView }>(`${base}/requirements/${id}/cancel`, { reason }, pinHeader(pin)).then((r) => r.data.data),

  listTransfers: (params: { from?: string; to?: string; warehouse_id?: number; product_id?: number; status?: string; page?: number; per_page?: number }) =>
    api.get<{ data: TransferListResult }>(`${base}/transfers`, { params }).then((r) => ({ ...r.data.data, rows: r.data.data.rows ?? [] })),
  createTransfer: (body: TransferInput) => api.post<{ data: TransferView }>(`${base}/transfers`, body).then((r) => r.data.data),
  cancelTransfer: (id: number, reason: string, pin?: string) =>
    api.post<{ data: TransferView }>(`${base}/transfers/${id}/cancel`, { reason }, pinHeader(pin)).then((r) => r.data.data),
}
