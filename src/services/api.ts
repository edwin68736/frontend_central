import axios from 'axios'

// URL del backend: en build se usa VITE_API_URL. Si no está definida (p. ej. build sin .env.production),
// en producción derivamos desde el host: app.tukifac.cloud → api.tukifac.cloud
function getBaseURL(): string {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv && fromEnv.startsWith('http')) return fromEnv
  if (typeof window !== 'undefined' && window.location.hostname === 'app.tukifac.cloud') {
    return 'https://api.tukifac.cloud/api'
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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Solo redirigir al login si el 401 viene de una ruta protegida (no del login mismo)
    const url: string = err.config?.url ?? ''
    const isLoginEndpoint = url.includes('/superadmin/login')
    if (err.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('sa_token')
      localStorage.removeItem('sa_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
