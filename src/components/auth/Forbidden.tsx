import { ShieldAlert } from 'lucide-react'

/** Pantalla de acceso denegado — NUNCA redirige (a diferencia de una sesión inválida). Se ve al
 *  navegar a una ruta cuyo permiso el usuario no tiene, o al intentar una acción cuyo backend
 *  respondió 403 desde un lugar que decide mostrar esta pantalla en vez de un simple toast. */
export default function Forbidden({
  message = 'No tienes permisos para acceder a esta sección.',
}: {
  message?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <ShieldAlert size={28} className="text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-800">Acceso denegado</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-sm">{message}</p>
    </div>
  )
}
