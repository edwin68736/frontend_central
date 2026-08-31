import axios from 'axios'

// URL del backend: en build se usa VITE_API_URL. Si no está definida (p. ej. build sin .env.production),
// en producción derivamos desde el host del panel central si no hay VITE_API_URL
function getBaseURL(): string {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv && fromEnv.startsWith('http')) return fromEnv
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'app.tukifac.com') return 'https://api.tukifac.com/api'
    if (host === 'app.tukifac.cloud') return 'https://api.tukifac.cloud/api'
  }
  return fromEnv || '/api'
}

const BASE_URL = getBaseURL()

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sa_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 vs 403 (Fase 9 §13): son casos completamente distintos y NUNCA deben tratarse igual.
//   401 = sesión inválida/expirada (JWT vencido, revocado, o el usuario fue desactivado/eliminado
//         — ver middleware.verifySuperAdminSession en el backend) → no hay nada que mostrar salvo
//         volver a iniciar sesión, así que este interceptor SÍ redirige.
//   403 = sesión perfectamente válida, pero sin el permiso requerido (RequireSAPermission /
//         CanDelegateAll / cuenta protegida en el backend) → NO es un problema de autenticación,
//         así que este interceptor NUNCA redirige ni borra la sesión. El componente que hizo la
//         llamada es quien debe mostrar el mensaje (ver apiErrorMessage en utils/apiError.ts, que
//         ya da un fallback claro de "No tienes permiso..." para cualquier 403 sin mensaje propio
//         del backend) — el interceptor solo deja pasar el rechazo tal cual.
//
// shouldRedirectToLogin está separada de la lógica de efecto (borrar storage, navegar) para poder
// probar la DECISIÓN 401→sí / 403→no sin tener que simular una request axios completa.
export function shouldRedirectToLogin(status: number | undefined, url: string | undefined): boolean {
  const isLoginEndpoint = (url ?? '').includes('/superadmin/login')
  return status === 401 && !isLoginEndpoint
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (shouldRedirectToLogin(err.response?.status, err.config?.url)) {
      localStorage.removeItem('sa_token')
      localStorage.removeItem('sa_user')
      window.location.href = '/login'
    }
    // 403: deliberadamente sin manejo especial aquí — nunca login, nunca se toca la sesión. El
    // rechazo sigue su curso normal hacia el componente/servicio que hizo la llamada.
    return Promise.reject(err)
  }
)
