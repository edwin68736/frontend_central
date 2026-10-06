import { describe, it, expect } from 'vitest'
import { rangeForPreset, normalizeRange, parseSearchQuery, formatLima, fiscalDocsToCsv } from './fiscalFilters'

describe('fiscalFilters', () => {
  // 2026-10-06 15:00 UTC = 10:00 en Lima
  const now = new Date('2026-10-06T15:00:00Z')

  it('los atajos de fecha usan el día calendario de Lima', () => {
    expect(rangeForPreset('today', now)).toEqual({ from: '2026-10-06', to: '2026-10-06' })
    expect(rangeForPreset('yesterday', now)).toEqual({ from: '2026-10-05', to: '2026-10-05' })
    expect(rangeForPreset('last7', now)).toEqual({ from: '2026-09-30', to: '2026-10-06' })
    expect(rangeForPreset('thisMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-06' })
    expect(rangeForPreset('lastMonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('a las 02:00 UTC todavía es el día anterior en Lima', () => {
    expect(rangeForPreset('today', new Date('2026-10-06T02:00:00Z')).from).toBe('2026-10-05')
  })

  it('normalizeRange invierte un rango al revés', () => {
    expect(normalizeRange('2026-10-10', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-10' })
    expect(normalizeRange('2026-10-01', undefined)).toEqual({ from: '2026-10-01', to: undefined })
  })

  it('parseSearchQuery distingue serie-número, RUC, correlativo y cliente', () => {
    expect(parseSearchQuery('f001-0123')).toEqual({ series: 'F001', number: '123' })
    expect(parseSearchQuery('20123456789')).toEqual({ company_ruc: '20123456789' })
    expect(parseSearchQuery('456')).toEqual({ number: '456' })
    expect(parseSearchQuery('Juan Pérez')).toEqual({ customer_name: 'Juan Pérez' })
    expect(parseSearchQuery('  ')).toEqual({})
  })

  it('formatLima muestra la hora de Lima y tolera vacíos', () => {
    expect(formatLima('2026-10-06T15:00:00Z')).toContain('10:00')
    expect(formatLima(null)).toBe('—')
  })

  it('fiscalDocsToCsv escapa comas y comillas', () => {
    const csv = fiscalDocsToCsv([
      {
        document_uuid: 'u',
        tenant_slug: 'demo',
        document_type: '01',
        series: 'F001',
        number: '1',
        customer_name: 'ACME, "SAC"',
        created_at: '2026-10-06T15:00:00Z',
        status: 'error',
        retry_count: 0,
      } as never,
    ])
    expect(csv).toContain('"ACME, ""SAC"""')
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})
