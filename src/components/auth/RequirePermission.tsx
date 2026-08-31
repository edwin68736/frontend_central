import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Forbidden from './Forbidden'

/**
 * Gating de UX por permiso — NO es la autorización real (esa vive en el backend, ver
 * RequireSAPermission/CanDelegateAll). Si el usuario no tiene el permiso, muestra una pantalla
 * 403 en el propio lugar (nunca redirige a /login: eso es exclusivo de una sesión inválida, ver
 * api.ts). Uso: <RequirePermission permission="pagos.view"><PaymentsPage /></RequirePermission>
 */
export default function RequirePermission({
  permission,
  children,
  fallbackMessage,
}: {
  permission: string
  children: ReactNode
  fallbackMessage?: string
}) {
  const { hasPermission } = useAuth()
  if (!hasPermission(permission)) {
    return <Forbidden message={fallbackMessage} />
  }
  return <>{children}</>
}
