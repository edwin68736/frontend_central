import { api } from './api'

export type EquipKind = 'equipo' | 'consumible' | 'etiqueta' | 'accesorio'

export const EQUIP_KIND_LABEL: Record<EquipKind, string> = {
  equipo: 'Equipo',
  consumible: 'Consumible (rollos)',
  etiqueta: 'Etiqueta',
  accesorio: 'Accesorio',
}

export interface EquipProduct {
  id: number
  code: string
  name: string
  kind: EquipKind
  notes: string
  reference_price: number
  yellow_threshold: number
  green_threshold: number
  active: boolean
  stock: number
  semaphore: '' | 'suficiente' | 'moderado' | 'bajo'
}

export interface EquipProductInput {
  code: string
  name: string
  kind: EquipKind
  notes: string
  reference_price: number
  yellow_threshold: number
  green_threshold: number
  active?: boolean
}

export interface EquipComboComponent {
  product_id: number
  product_code: string
  product_name: string
  quantity: number
}

export interface EquipCombo {
  id: number
  code: string
  name: string
  reference_price: number
  active: boolean
  components: EquipComboComponent[]
}

export interface EquipComboInput {
  code: string
  name: string
  reference_price: number
  active?: boolean
  items: { product_id: number; quantity: number }[]
}

export interface EquipCarrier {
  id: number
  code: string
  name: string
  dispatch_days: string
  pickup_days: number
  guide_label: string
  guide_format: string
  tracking_url_template: string
  label_template: string
  is_default: boolean
  active: boolean
  sort_order: number
}

export type EquipCarrierInput = Omit<EquipCarrier, 'id'>

export interface EquipSettings {
  default_carrier_id: number | null
  stock_manager: string
  alert_yellow_days: number
  alert_red_days: number
  next_order_number: number
}

export interface EquipStockRow {
  product_id: number
  code: string
  name: string
  kind: EquipKind
  opening: number
  ingresos: number
  direct_independiente: number
  direct_promo_tk: number
  combo_independiente: number
  combo_promo_tk: number
  total_out: number
  reingresos: number
  adjustments: number
  current: number
  yellow_threshold: number
  green_threshold: number
  semaphore: 'suficiente' | 'moderado' | 'bajo'
}

export interface EquipMovement {
  id: number
  product_id: number
  occurred_at: string
  movement_type: string
  quantity: number
  sale_type_snapshot: string
  note: string
  order_number: number | null
  combo_code: string
}

export type MovementKind = 'ingreso' | 'ajuste' | 'baja' | 'apertura'

export interface EquipMovementInput {
  product_id: number
  movement_type: MovementKind
  quantity: number
  occurred_at?: string
  note: string
  unit_cost?: number
}

export interface ImportIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  sheet: string
  row?: number
  order?: number
  message: string
}

export interface ImportStockCols {
  opening: number
  direct_independiente: number
  direct_promo_tk: number
  combo_independiente: number
  combo_promo_tk: number
  total_out: number
  reingresos: number
  current: number
}

export interface ImportReconRow {
  code: string
  excel: ImportStockCols
  system: ImportStockCols
  match: boolean
}

export interface ImportBatch {
  id: number
  period: string
  file_name: string
  products: number
  combos: number
  orders: number
  payments: number
  returns: number
  movements: number
  created_at: string
}

export interface ImportPreview {
  period: string
  file_name: string
  stock_manager: string
  counts: {
    products: number
    new_products: number
    combos: number
    orders: number
    items: number
    payments: number
    returns: number
    movements: number
    new_customers: number
    orders_without_customer: number
  }
  sales_total: number
  collected_total: number
  issues: ImportIssue[]
  issues_truncated: boolean
  severity_counts: Record<string, number>
  code_counts: Record<string, number>
  reconciliation: ImportReconRow[]
  reconciliation_ok: boolean
  already_imported: ImportBatch | null
  can_commit: boolean
  blocked_by: string[] | null
}

/** Filas de cada hoja tal como las lee el navegador; el backend normaliza y valida todo. */
export interface ImportPayload {
  file_name: string
  sheets: Record<'catalogo' | 'combos' | 'detalle' | 'envios' | 'retornos' | 'stock', unknown[][]>
}

const base = '/superadmin/equipos'

export const equiposService = {
  listProducts: (params?: { q?: string; kind?: string; include_inactive?: boolean }) =>
    api
      .get<{ data: EquipProduct[]; stock_visible: boolean }>(`${base}/products`, {
        params: { q: params?.q, kind: params?.kind, include_inactive: params?.include_inactive ? 1 : undefined },
      })
      .then((r) => ({ products: r.data.data ?? [], stockVisible: r.data.stock_visible })),
  createProduct: (body: EquipProductInput) => api.post(`${base}/products`, body).then((r) => r.data.data as EquipProduct),
  updateProduct: (id: number, body: EquipProductInput) => api.put(`${base}/products/${id}`, body).then((r) => r.data.data as EquipProduct),

  listCombos: (includeInactive = false) =>
    api.get<{ data: EquipCombo[] }>(`${base}/combos`, { params: { include_inactive: includeInactive ? 1 : undefined } }).then((r) => r.data.data ?? []),
  createCombo: (body: EquipComboInput) => api.post(`${base}/combos`, body).then((r) => r.data.data as EquipCombo),
  updateCombo: (id: number, body: EquipComboInput) => api.put(`${base}/combos/${id}`, body).then((r) => r.data.data as EquipCombo),

  listCarriers: (includeInactive = true) =>
    api.get<{ data: EquipCarrier[] }>(`${base}/carriers`, { params: { include_inactive: includeInactive ? 1 : undefined } }).then((r) => r.data.data ?? []),
  createCarrier: (body: EquipCarrierInput) => api.post(`${base}/carriers`, body).then((r) => r.data.data as EquipCarrier),
  updateCarrier: (id: number, body: EquipCarrierInput) => api.put(`${base}/carriers/${id}`, body).then((r) => r.data.data as EquipCarrier),

  getSettings: () => api.get<{ data: EquipSettings }>(`${base}/settings`).then((r) => r.data.data),
  updateSettings: (body: EquipSettings) => api.put<{ data: EquipSettings }>(`${base}/settings`, body).then((r) => r.data.data),

  stock: (period?: string) =>
    api.get<{ period: string; data: EquipStockRow[] }>(`${base}/stock`, { params: { period } }).then((r) => ({ period: r.data.period, rows: r.data.data ?? [] })),
  movements: (productId: number, limit = 200) =>
    api.get<{ data: EquipMovement[] }>(`${base}/stock/${productId}/movements`, { params: { limit } }).then((r) => r.data.data ?? []),
  addMovement: (body: EquipMovementInput) => api.post(`${base}/stock/movements`, body).then((r) => r.data.data),

  importPreview: (payload: ImportPayload) => api.post<{ data: ImportPreview }>(`${base}/import/preview`, payload).then((r) => r.data.data),
  importCommit: (payload: ImportPayload) =>
    api.post<{ data: { batch: ImportBatch; preview: ImportPreview } }>(`${base}/import/commit`, payload).then((r) => r.data.data),
  importBatches: () => api.get<{ data: ImportBatch[] }>(`${base}/import/batches`).then((r) => r.data.data ?? []),
}
