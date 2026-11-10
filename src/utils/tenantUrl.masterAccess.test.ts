import { describe, expect, it } from 'vitest'
import { buildMasterAccessUrl } from '@/utils/tenantUrl'

const tenant = { slug: 'acme', tenant_url: 'https://acme.tukifac.com' }

describe('buildMasterAccessUrl', () => {
  it('con código de un solo uso la URL lleva el código y NUNCA el JWT', () => {
    const url = buildMasterAccessUrl(tenant, { code: 'abc_123-XYZ', token: 'eyJ.jwt.secreto' })
    expect(url).toBe('https://acme.tukifac.com/?master_code=abc_123-XYZ')
    expect(url).not.toContain('eyJ')
    expect(url).not.toContain('master_sso')
  })

  it('sin código (backend antiguo) usa el token heredado', () => {
    const url = buildMasterAccessUrl(tenant, { token: 'eyJ.jwt.secreto' })
    expect(url).toBe('https://acme.tukifac.com/?master_sso=eyJ.jwt.secreto')
  })

  it('codifica el código en la URL', () => {
    expect(buildMasterAccessUrl(tenant, { code: 'a b&c' })).toContain('master_code=a%20b%26c')
  })
})
