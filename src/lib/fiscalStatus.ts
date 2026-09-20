import axios from 'axios'
import { apiErrorMessage } from '@/utils/apiError'

/**
 * Semántica visual y de acciones ÚNICA para el estado fiscal en todo el panel central
 * (FiscalDocumentsPage y OperacionesFiscalesPage). La fuente de verdad es siempre lo que
 * `facturador_lycet` ya decidió y devuelve en `status`/`error_type`/`retryable` — este módulo
 * NUNCA reclasifica por `sunat_message`/`pse_message`/`sunat_code`/texto libre. Solo traduce
 * esos 3 campos a: (a) una etiqueta visual, (b) si una acción normal debe presentarse
 * disponible, (c) un texto explicativo para el operador.
 *
 * Ver backend_go/docs/AUDITORIA-PANEL-CENTRAL-FISCAL-FASE0-PLAN.md — Fase 3.
 */

export type FiscalBadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray'

export interface FiscalGroup {
  label: string
  variant: FiscalBadgeVariant
}

const BLOCKED_ERROR_TYPES = ['business', 'permanent', 'manual_only'] as const

/**
 * Colapsa status + error_type a una etiqueta/color para el operador. Mismo criterio que
 * `FiscalBulkActionService::isBlockedForNormalAction()` del backend para las categorías que
 * bloquean acciones — aquí solo se usa para decidir el texto/color, no para bloquear nada por
 * sí mismo (eso lo hace `isNormalActionBlocked`).
 */
export function fiscalGroup(
  status: string,
  errorType?: string | null,
  retryable?: boolean | null
): FiscalGroup {
  switch (status) {
    case 'accepted':
      return { label: 'Aceptado', variant: 'green' }
    case 'observed':
      return { label: 'Con observaciones', variant: 'yellow' }
    case 'rejected':
      // `business` siempre implica status=rejected (nunca al revés necesariamente, por eso el
      // fallback genérico se mantiene para rechazos legados sin error_type).
      return errorType === 'business'
        ? { label: 'Rechazado (negocio)', variant: 'red' }
        : { label: 'Rechazado', variant: 'red' }
    case 'cancelled':
      return { label: 'Anulado', variant: 'gray' }
    case 'error':
      if (errorType === 'transient') {
        // Agotado (retryable=false tras el límite de 5 intentos automáticos) sigue siendo
        // distinto de "requiere acción": el reintento MANUAL explícito sigue siendo válido
        // (decisión aprobada Fase 1) — nunca lo presentamos como terminal/imposible.
        return retryable === false
          ? { label: 'Automático agotado (reintento manual)', variant: 'yellow' }
          : { label: 'En proceso', variant: 'blue' }
      }
      if (errorType === 'manual_only') {
        return { label: 'Requiere acción manual', variant: 'red' }
      }
      if (errorType === 'permanent') {
        return { label: 'Error permanente', variant: 'red' }
      }
      // error_type null/desconocido (legado): mismo fallback genérico de siempre.
      return { label: 'Requiere acción', variant: 'red' }
    default: // pending, queued, sending, sent, retrying
      return { label: 'En proceso', variant: 'blue' }
  }
}

/**
 * ¿Debe presentarse send/retry NORMAL como disponible? Espejo exacto de
 * `FiscalBulkActionService::isBlockedForNormalAction()` (facturador_lycet) — accepted, o
 * error_type en {business, permanent, manual_only}, sin importar status. El frontend NO decide
 * esta regla, solo la refleja para no ofrecer una acción que el backend va a rechazar con 409.
 */
export function isNormalActionBlocked(status: string, errorType?: string | null): boolean {
  if (status === 'accepted') return true
  return !!errorType && (BLOCKED_ERROR_TYPES as readonly string[]).includes(errorType)
}

/**
 * ¿"force" sobre este documento merece una confirmación explícita antes de ejecutar? Mínimo
 * pedido: accepted, business, manual_only — force sigue disponible siempre, esto solo agrega
 * fricción de UX para los casos más sensibles (re-emitir algo ya aceptado, o forzar un rechazo
 * de negocio / algo que requiere revisión manual).
 */
export function needsForceConfirmation(status: string, errorType?: string | null): boolean {
  return status === 'accepted' || errorType === 'business' || errorType === 'manual_only'
}

/**
 * Texto explicativo para el operador — SOLO a partir de status/error_type/retryable ya
 * decididos por el backend, nunca de sunat_message/pse_message/sunat_code.
 */
export function fiscalExplanation(
  status: string,
  errorType?: string | null,
  retryable?: boolean | null
): string | null {
  if (status === 'error') {
    if (errorType === 'transient') {
      return retryable === false
        ? 'Se agotaron los reintentos automáticos. Puede realizarse un reintento manual.'
        : 'El documento presenta un error temporal y se está reintentando automáticamente.'
    }
    if (errorType === 'manual_only') {
      return 'Este documento requiere una acción manual — no se reintenta solo.'
    }
    if (errorType === 'permanent') {
      return 'El documento presenta un error permanente (certificado/configuración).'
    }
  }
  if (status === 'rejected' && errorType === 'business') {
    return 'El documento fue rechazado por una validación de negocio de SUNAT/PSE.'
  }
  return null
}

/**
 * Etiqueta informativa de intentos — usa el `retry_count` real recibido, nunca un contador
 * propio. El calificativo "agotado" viene de `retryable` (ya decidido por el backend), NO de
 * comparar retry_count contra un límite hardcodeado en el frontend.
 */
export function retryProgressLabel(
  retryCount: number | null | undefined,
  errorType?: string | null,
  retryable?: boolean | null
): string | null {
  if (!retryCount || retryCount <= 0) return null
  if (errorType === 'transient' && retryable === false) {
    return `Intentos: ${retryCount} (automático agotado)`
  }
  return `Intentos: ${retryCount}`
}

/**
 * Mensaje de error para acciones fiscales (send/retry/force/...), incluyendo el `hint` que
 * devuelve el backend en un 409 por guard (Fase 1) además del `error` genérico. Reutiliza
 * `apiErrorMessage` como base en vez de reimplementar la extracción — solo agrega el `hint`.
 */
export function fiscalActionErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    const data = err.response.data as { error?: string; hint?: string } | undefined
    const parts = [data?.error, data?.hint].filter((s): s is string => !!s && s.trim() !== '')
    if (parts.length > 0) return parts.join(' — ')
  }
  return apiErrorMessage(err, fallback)
}

/**
 * Traducciones de enums crudos del backend a texto en español para mostrar al operador.
 * Son SOLO traducción de presentación (mismo valor 1:1, nunca reclasifican nada) — la lista
 * de valores posibles de cada enum está confirmada contra el código real de facturador_lycet
 * (Empresa::connectionStatus, FiscalHealthService, FiscalEmailProcessor/FiscalCustomerEmailNormalizer).
 */

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  connected: 'Conectado',
  testing: 'Probando…',
  invalid_credentials: 'Credenciales inválidas',
  configuration_missing: 'Configuración incompleta',
  certificate_expired: 'Certificado vencido',
  error: 'Error de conexión',
}

export function connectionStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin configurar'
  return CONNECTION_STATUS_LABELS[status] ?? status
}

const HEALTH_STATUS_LABELS: Record<string, string> = {
  healthy: 'Saludable',
  degraded: 'Degradado',
  critical: 'Crítico',
}

export function healthStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return HEALTH_STATUS_LABELS[status] ?? status
}

const SEND_MODE_LABELS: Record<string, string> = {
  sunat_direct: 'SUNAT directo',
  pse: 'PSE',
}

export function sendModeLabel(mode: string | null | undefined): string {
  if (!mode) return '—'
  return SEND_MODE_LABELS[mode] ?? mode
}

const EMAIL_STATUS_LABELS: Record<string, string> = {
  sent: 'Enviado',
  failed: 'Falló',
  invalid: 'Correo inválido',
  email_not_available: 'Sin correo',
}

export function emailStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Pendiente'
  return EMAIL_STATUS_LABELS[status] ?? status
}

const QUEUE_TAB_LABELS: Record<string, string> = {
  queued: 'En cola',
  processing: 'Procesando',
  failed: 'Con error',
  retrying: 'Reintentando',
}

export function queueTabLabel(tab: string): string {
  return QUEUE_TAB_LABELS[tab] ?? tab
}

const ACTION_LABELS: Record<string, string> = {
  retry: 'Reintentar',
  send: 'Enviar',
  force: 'Forzar',
  poll: 'Consultar',
  email: 'Correo',
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}
