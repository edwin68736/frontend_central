import { describe, expect, it } from 'vitest'
import { apiFilters } from './fiscal.service'

describe('apiFilters (Incluir demo)', () => {
  it('por defecto oculta los documentos demo: manda exclude_demo', () => {
    expect(apiFilters({ tenant_slug: 'acme' })).toEqual({ tenant_slug: 'acme', exclude_demo: true })
  })

  it('con include_demo no manda exclude_demo ni deja include_demo en la API', () => {
    const q = apiFilters({ tenant_slug: 'acme', include_demo: true })
    expect(q).toEqual({ tenant_slug: 'acme' })
    expect('include_demo' in q).toBe(false)
  })
})
