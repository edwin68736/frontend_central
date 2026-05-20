import { api } from './api'

export interface SAUser {
  id: number
  email: string
  role: string
}

export interface LoginResponse {
  token: string
  expires_in: number
  user: SAUser
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/superadmin/login', { email, password })
    return data
  },

  async changeMyPassword(input: { current_password: string; new_password: string }): Promise<{ success: boolean }> {
    const { data } = await api.post<{ success: boolean }>('/superadmin/me/password', input)
    return data
  },
}
