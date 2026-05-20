import { api } from './api'

export interface UbiRegion {
  id: string
  nombre: string
}

export interface UbiProvincia {
  id: string
  nombre: string
  region_id: string
}

export interface UbiDistrito {
  id: string
  nombre: string
  provincia_id: string
  region_id: string
}

export const ubigeoService = {
  getRegiones: () => api.get<{ data: UbiRegion[] }>('/superadmin/ubigeo/regiones').then((r) => r.data.data ?? []),
  getProvincias: (regionId: string) =>
    api.get<{ data: UbiProvincia[] }>('/superadmin/ubigeo/provincias', { params: { region_id: regionId } }).then((r) => r.data.data ?? []),
  getDistritos: (provinciaId: string) =>
    api.get<{ data: UbiDistrito[] }>('/superadmin/ubigeo/distritos', { params: { provincia_id: provinciaId } }).then((r) => r.data.data ?? []),
}
