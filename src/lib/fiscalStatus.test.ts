import { describe, it, expect } from 'vitest'
import {
  fiscalGroup,
  isNormalActionBlocked,
  needsForceConfirmation,
  fiscalExplanation,
  retryProgressLabel,
  connectionStatusLabel,
  healthStatusLabel,
  sendModeLabel,
  emailStatusLabel,
  queueTabLabel,
  isAttendable,
  attendedBadge,
  actionLabel,
} from './fiscalStatus'

describe('fiscalGroup — Fase 3, semántica visual única (frontend NO reclasifica por texto)', () => {
  it('Test 1: transient con retryable=true se muestra como proceso/reintento normal, no como error terminal', () => {
    const g = fiscalGroup('error', 'transient', true)
    expect(g.label).toBe('En proceso')
    expect(g.variant).toBe('blue')
  })

  it('Test 2: manual_only se identifica claramente como acción manual', () => {
    const g = fiscalGroup('error', 'manual_only', false)
    expect(g.label).toMatch(/acción manual/i)
    expect(g.variant).toBe('red')
  })

  it('Test 3: business (status=rejected) se identifica como rechazo de negocio', () => {
    const g = fiscalGroup('rejected', 'business', false)
    expect(g.label).toMatch(/negocio/i)
    expect(g.variant).toBe('red')
  })

  it('permanent se identifica como error permanente', () => {
    const g = fiscalGroup('error', 'permanent', false)
    expect(g.label).toMatch(/permanente/i)
    expect(g.variant).toBe('red')
  })

  it('Test 4: transient agotado (retryable=false, retry_count=5) NO se presenta como imposible de reintentar', () => {
    const g = fiscalGroup('error', 'transient', false)
    expect(g.label).not.toMatch(/imposible|nunca|terminal/i)
    expect(g.label).toMatch(/manual/i)
    // Ni azul "en proceso" (sería engañoso, ya no hay auto-retry) ni rojo "requiere acción"
    // (implicaría un problema real de config) — variante amarilla intermedia, sin inventar
    // un color nuevo (Badge solo soporta green/red/yellow/blue/gray).
    expect(g.variant).toBe('yellow')
  })

  it('rejected sin error_type (legado) conserva el fallback genérico, sin inventar "negocio"', () => {
    const g = fiscalGroup('rejected', null)
    expect(g.label).toBe('Rechazado')
  })

  it('accepted/observed/cancelled/default no cambian respecto al comportamiento previo', () => {
    expect(fiscalGroup('accepted').label).toBe('Aceptado')
    expect(fiscalGroup('observed').label).toBe('Con observaciones')
    expect(fiscalGroup('cancelled').label).toBe('Anulado')
    expect(fiscalGroup('queued').label).toBe('En proceso')
  })
})

describe('isNormalActionBlocked — espejo de FiscalBulkActionService::isBlockedForNormalAction()', () => {
  it('Test 5: status=accepted bloquea send/retry normal', () => {
    expect(isNormalActionBlocked('accepted', null)).toBe(true)
  })

  it('Test 2 (cont.): manual_only bloquea, sin importar status', () => {
    expect(isNormalActionBlocked('error', 'manual_only')).toBe(true)
    expect(isNormalActionBlocked('sent', 'manual_only')).toBe(true)
  })

  it('business bloquea (status=rejected, el caso real)', () => {
    expect(isNormalActionBlocked('rejected', 'business')).toBe(true)
  })

  it('permanent bloquea', () => {
    expect(isNormalActionBlocked('error', 'permanent')).toBe(true)
  })

  it('transient NUNCA bloquea, ni siquiera agotado — el retry manual sigue disponible', () => {
    expect(isNormalActionBlocked('error', 'transient')).toBe(false)
  })

  it('sin error_type (null/undefined) y status no-accepted no bloquea', () => {
    expect(isNormalActionBlocked('pending', null)).toBe(false)
    expect(isNormalActionBlocked('queued', undefined)).toBe(false)
  })
})

describe('needsForceConfirmation', () => {
  it('Test 6: accepted requiere confirmación antes de forzar', () => {
    expect(needsForceConfirmation('accepted', null)).toBe(true)
  })

  it('business y manual_only requieren confirmación', () => {
    expect(needsForceConfirmation('rejected', 'business')).toBe(true)
    expect(needsForceConfirmation('error', 'manual_only')).toBe(true)
  })

  it('transient normal no requiere confirmación especial', () => {
    expect(needsForceConfirmation('error', 'transient')).toBe(false)
  })
})

describe('fiscalExplanation — texto SOLO desde status/error_type/retryable, nunca desde mensajes SUNAT/PSE', () => {
  it('Test 8: la clasificación no depende de sunat_message/pse_message — la función ni los recibe como parámetro', () => {
    // La firma de fiscalExplanation() no acepta sunat_message/pse_message en absoluto: es
    // imposible que este helper use texto libre para decidir, por diseño de su propia firma.
    expect(fiscalExplanation.length).toBe(3) // (status, errorType, retryable) — nada de texto libre
  })

  it('transient no agotado explica reintento automático en curso', () => {
    expect(fiscalExplanation('error', 'transient', true)).toMatch(/reintentando automáticamente/i)
  })

  it('Test 4 (cont.): transient agotado explica reintento manual disponible', () => {
    expect(fiscalExplanation('error', 'transient', false)).toMatch(/reintento manual/i)
  })

  it('manual_only explica que requiere acción manual', () => {
    expect(fiscalExplanation('error', 'manual_only', false)).toMatch(/acción manual/i)
  })

  it('business explica rechazo de negocio', () => {
    expect(fiscalExplanation('rejected', 'business', false)).toMatch(/negocio/i)
  })

  it('permanent explica error permanente', () => {
    expect(fiscalExplanation('error', 'permanent', false)).toMatch(/permanente/i)
  })

  it('estados sin explicación especial devuelven null (no se inventa texto)', () => {
    expect(fiscalExplanation('accepted', null, null)).toBeNull()
  })
})

describe('retryProgressLabel — usa retry_count real, sin contador propio ni límite hardcodeado', () => {
  it('sin intentos no muestra nada', () => {
    expect(retryProgressLabel(0, null, null)).toBeNull()
    expect(retryProgressLabel(null, null, null)).toBeNull()
  })

  it('muestra el valor recibido tal cual', () => {
    expect(retryProgressLabel(3, 'transient', true)).toBe('Intentos: 3')
  })

  it('Test 4 (cont.): agotado se marca a partir de retryable, no de comparar contra 5', () => {
    expect(retryProgressLabel(5, 'transient', false)).toBe('Intentos: 5 (automático agotado)')
  })
})

describe('Traducciones de enums crudos del backend — /fiscal-operations y /fiscal mostraban valores en inglés', () => {
  it('connectionStatusLabel traduce los 6 valores reales de Empresa::connectionStatus', () => {
    expect(connectionStatusLabel('connected')).toBe('Conectado')
    expect(connectionStatusLabel('testing')).toBe('Probando…')
    expect(connectionStatusLabel('invalid_credentials')).toBe('Credenciales inválidas')
    expect(connectionStatusLabel('configuration_missing')).toBe('Configuración incompleta')
    expect(connectionStatusLabel('certificate_expired')).toBe('Certificado vencido')
    expect(connectionStatusLabel('error')).toBe('Error de conexión')
  })

  it('connectionStatusLabel no rompe con un valor nuevo no mapeado (fallback al valor crudo, no inventa texto)', () => {
    expect(connectionStatusLabel('algo_nuevo')).toBe('algo_nuevo')
    expect(connectionStatusLabel(null)).toBe('Sin configurar')
  })

  it('healthStatusLabel traduce los 3 valores de FiscalHealthService::resolveOverallStatus', () => {
    expect(healthStatusLabel('healthy')).toBe('Saludable')
    expect(healthStatusLabel('degraded')).toBe('Degradado')
    expect(healthStatusLabel('critical')).toBe('Crítico')
  })

  it('sendModeLabel traduce sunat_direct/pse', () => {
    expect(sendModeLabel('sunat_direct')).toBe('SUNAT directo')
    expect(sendModeLabel('pse')).toBe('PSE')
    expect(sendModeLabel(null)).toBe('—')
  })

  it('emailStatusLabel traduce los 4 valores reales de FiscalEmailProcessor', () => {
    expect(emailStatusLabel('sent')).toBe('Enviado')
    expect(emailStatusLabel('failed')).toBe('Falló')
    expect(emailStatusLabel('invalid')).toBe('Correo inválido')
    expect(emailStatusLabel('email_not_available')).toBe('Sin correo')
    expect(emailStatusLabel(null)).toBe('Pendiente')
  })

  it('queueTabLabel traduce las 4 pestañas de la cola de OperacionesFiscalesPage', () => {
    expect(queueTabLabel('queued')).toBe('En cola')
    expect(queueTabLabel('processing')).toBe('Procesando')
    expect(queueTabLabel('failed')).toBe('Con error')
    expect(queueTabLabel('retrying')).toBe('Reintentando')
  })
})

describe('"Atendido" (2026-09-22) — decisión administrativa, independiente del status técnico SUNAT/PSE', () => {
  it('isAttendable refleja exactamente ATTENDABLE_STATUSES de facturador_lycet (error/rejected/observed/cancelled)', () => {
    expect(isAttendable('error')).toBe(true)
    expect(isAttendable('rejected')).toBe(true)
    expect(isAttendable('observed')).toBe(true)
    expect(isAttendable('cancelled')).toBe(true)
  })

  it('isAttendable es false para todo status no terminal (el backend rechazaría con 409)', () => {
    expect(isAttendable('pending')).toBe(false)
    expect(isAttendable('queued')).toBe(false)
    expect(isAttendable('sending')).toBe(false)
    expect(isAttendable('sent')).toBe(false)
    expect(isAttendable('accepted')).toBe(false)
    expect(isAttendable('retrying')).toBe(false)
  })

  it('attendedBadge no reutiliza ninguna de las variantes/colores de fiscalGroup para no confundir ambos conceptos', () => {
    const attended = attendedBadge(true)
    const notAttended = attendedBadge(false)
    expect(attended.label).toBe('Atendido')
    expect(notAttended.label).toBe('No atendido')
    expect(attended.variant).not.toBe(notAttended.variant)
  })

  it('attendedBadge trata null/undefined igual que false (documento nunca atendido, valor por defecto del backend)', () => {
    expect(attendedBadge(null).label).toBe('No atendido')
    expect(attendedBadge(undefined).label).toBe('No atendido')
  })

  it('actionLabel traduce attend/unattend', () => {
    expect(actionLabel('attend')).toBe('Marcar atendido')
    expect(actionLabel('unattend')).toBe('Quitar atendido')
  })
})
