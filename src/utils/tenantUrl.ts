/**
 * URLs de tenants: {slug}.{root_domain} (ej. doricontdemo.tukifac.com).
 * El panel central (app.tukifac.com) no forma parte del host del tenant.
 */

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h.startsWith('127.')
}

/** Dominio raíz para tenants (VITE_ROOT_DOMAIN). Dev: localhost:5173 del tenant frontend. */
export function getRootDomain(): string {
  const fromEnv = import.meta.env.VITE_ROOT_DOMAIN as string | undefined
  if (fromEnv) {
    return fromEnv.replace(/^https?:\/\//, '').split('/')[0]
  }
  if (isLocalHost()) return 'localhost:5173'
  return 'tukifac.com'
}

/** Host del tenant sin protocolo (ej. miempresa.tukifac.com). */
export function getTenantHost(slug: string): string {
  const root = getRootDomain()
  const clean = slug.trim().toLowerCase()
  const label = clean || 'subdominio'
  return `${label}.${root}`
}

export function getTenantUrl(slug: string): string {
  const host = getTenantHost(slug)
  const protocol = host.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}

/** Prefiere tenant_url de la API; si no, construye con root domain. */
export function resolveTenantUrl(tenant: { slug: string; tenant_url?: string }): string {
  if (tenant.tenant_url) return tenant.tenant_url
  return getTenantUrl(tenant.slug)
}
