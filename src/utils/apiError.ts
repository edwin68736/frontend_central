import axios from 'axios'

/** true si el error es un 403 del backend (sesión válida, sin el permiso requerido — distinto de
 *  401, sesión inválida/expirada). Ver Fase 9 §13: 401 → login, 403 → mensaje de acceso denegado,
 *  nunca redirige. */
export function isForbiddenError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 403
}

/** Mensaje legible desde respuesta del backend Go (fiber.Map error) o red. Para 403 sin mensaje
 *  propio del backend, usa un fallback claro de "acceso denegado" en vez del fallback genérico del
 *  caller — así ningún catch necesita saber de antemano que puede recibir un 403. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data
    if (data && typeof data === 'object' && 'error' in data) {
      const msg = (data as { error?: unknown }).error
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
    }
    if (err.response?.status === 403) {
      return 'No tienes permiso para realizar esta acción'
    }
    if (err.response?.status === 413) {
      return 'Archivo demasiado grande (revisa límite de Nginx client_max_body_size)'
    }
    if (err.message) return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
