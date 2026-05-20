import { api } from './api'

export interface ConsultaRUCResult {
  success: boolean
  ruc?: string
  razon_social?: string
  direccion?: string
  direccion_completa?: string
  estado?: string
  condicion?: string
  departamento?: string
  provincia?: string
  distrito?: string
  ubigeo?: string
}

export interface ConsultaDNIResult {
  success: boolean
  nombre_completo?: string
  nombres?: string
  apellido_paterno?: string
  apellido_materno?: string
  doc_number?: string
}

export const consultaService = {
  /** Consulta RUC (apiperu.dev vía backend central). Panel central: tenants. */
  ruc: (ruc: string): Promise<ConsultaRUCResult> =>
    api.post<ConsultaRUCResult>('/superadmin/consulta/ruc', { ruc: ruc.trim() }).then((r) => r.data),

  /** Consulta DNI (apiperu.dev vía backend central). */
  dni: (dni: string): Promise<ConsultaDNIResult> =>
    api.post<ConsultaDNIResult>('/superadmin/consulta/dni', { dni: dni.trim() }).then((r) => r.data),
}
