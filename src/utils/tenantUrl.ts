/**
 * Construye la URL completa del tenant (slug + dominio central).
 * Producción: https://slug.app.tukifac.cloud
 * Desarrollo: http://slug.localhost:5173 (tenant frontend)
 */
export function getTenantUrl(slug: string): string {
  const domain = import.meta.env.VITE_APP_DOMAIN as string | undefined
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isLocal = host === 'localhost' || host.startsWith('127.')
  const baseDomain = domain || (isLocal ? 'localhost:5173' : host || 'app.tukifac.cloud')
  const protocol = baseDomain.startsWith('localhost') ? 'http' : 'https'
  const cleanDomain = baseDomain.replace(/^https?:\/\//, '').split('/')[0]
  return `${protocol}://${slug}.${cleanDomain}`
}
