import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authService, SAUser } from '@/services/auth.service'

interface AuthState {
  user: SAUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (partial: Partial<SAUser>) => void
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

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
