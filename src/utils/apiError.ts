import axios from 'axios'

/** Mensaje legible desde respuesta del backend Go (fiber.Map error) o red. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data
    if (data && typeof data === 'object' && 'error' in data) {
      const msg = (data as { error?: unknown }).error
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
    }
    if (err.response?.status === 413) {
      return 'Archivo demasiado grande (revisa límite de Nginx client_max_body_size)'
    }
    if (err.message) return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
