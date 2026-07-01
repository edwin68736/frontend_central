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
    return fromEnv
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
  }
  if (isLocalHost()) return 'localhost:5173'
  return 'tukifac.com'
}

/**
 * URL pública del tenant sin puerto en producción (443/80 implícitos).
 * Evita enlaces tipo https://empresa.tukifac.com:8081/...
 */
export function normalizeTenantPublicUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  try {
    const u = new URL(trimmed)
    const host = u.hostname.toLowerCase()
    if (host !== 'localhost' && !host.endsWith('.localhost') && !host.startsWith('127.')) {
      u.protocol = 'https:'
      u.port = ''
    }
    return u.toString().replace(/\/$/, '')
  } catch {
    return trimmed.replace(/\/$/, '')
  }
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
  if (tenant.tenant_url) return normalizeTenantPublicUrl(tenant.tenant_url)
  return normalizeTenantPublicUrl(getTenantUrl(tenant.slug))
}
