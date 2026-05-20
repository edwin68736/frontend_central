import { api } from './api'

export interface CentralAjuste {
  id: number
  nombre_sistema: string
  slogan: string
  direccion: string
  ubigeo: string
  email_contacto: string
  telefono: string
}

export interface UpdateAjusteInput {
  nombre_sistema?: string
  slogan?: string
  direccion?: string
  ubigeo?: string
  token_consulta?: string
  email_contacto?: string
  telefono?: string
}

export const ajustesService = {
  get: (): Promise<CentralAjuste> =>
    api.get<{ data: CentralAjuste }>('/superadmin/ajustes').then((r) => r.data.data),

  update: (body: UpdateAjusteInput): Promise<void> =>
    api.put('/superadmin/ajustes', body).then(() => undefined),
}
