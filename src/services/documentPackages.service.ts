import { api } from './api'

export interface DocumentPackage {
  id: number
  name: string
  description: string
  documents_qty: number
  price: number
  currency: string
  is_active: boolean
  sort_order: number
}

export interface PackagePurchaseRequest {
  id: number
  tenant_id: number
  package_id: number
  documents_qty: number
  amount: number
  status: string
  receipt_url: string
  reference: string
  created_at: string
  tenant_name?: string
  package_name?: string
}

export const documentPackagesService = {
  list: () => api.get<{ packages: DocumentPackage[] }>('/superadmin/document-packages').then(r => r.data.packages),
  save: (body: Partial<DocumentPackage> & { id?: number }) =>
    body.id
      ? api.put(`/superadmin/document-packages/${body.id}`, body).then(r => r.data)
      : api.post('/superadmin/document-packages', body).then(r => r.data),
  remove: (id: number) => api.delete(`/superadmin/document-packages/${id}`),
  listPending: () =>
    api.get<{ requests: PackagePurchaseRequest[] }>('/superadmin/document-packages/purchases/pending').then(r => r.data.requests),
  approve: (id: number, notes?: string) =>
    api.patch(`/superadmin/document-packages/purchases/${id}/approve`, { notes }),
  reject: (id: number, reason: string) =>
    api.patch(`/superadmin/document-packages/purchases/${id}/reject`, { reason }),
}
