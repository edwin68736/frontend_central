import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authService, type SAUser } from '@/services/auth.service'
import { hasPermission as checkPermission } from '@/lib/permissions'

interface AuthState {
  user: SAUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (partial: Partial<SAUser>) => void
  /** Único punto de verdad de permisos en el frontend (ver src/lib/permissions.ts) — SOLO gating
   *  de UX, nunca reemplaza la autorización real del backend (Fase 9 §15). */
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SAUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('sa_token')
    const storedUser = localStorage.getItem('sa_user')
    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('sa_token')
        localStorage.removeItem('sa_user')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authService.login(email, password)
    localStorage.setItem('sa_token', res.token)
    localStorage.setItem('sa_user', JSON.stringify(res.user))
    setToken(res.token)
    setUser(res.user)
  }

  const logout = () => {
    localStorage.removeItem('sa_token')
    localStorage.removeItem('sa_user')
    setToken(null)
    setUser(null)
  }

  const updateUser = (partial: Partial<SAUser>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...partial }
      localStorage.setItem('sa_user', JSON.stringify(next))
      return next
    })
  }

  const hasPermission = useCallback(
    (permission: string) => checkPermission(user?.role, user?.permissions, permission),
    [user?.role, user?.permissions]
  )

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!token, isLoading, login, logout, updateUser, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
