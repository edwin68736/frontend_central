import { api } from './api'

export type SAUserRow = {
  id: number
  name: string
  email: string
  role: 'admin' | 'superadmin' | string
  created_at?: string
  updated_at?: string
}

export type CreateSAUserInput = {
  name: string
  email: string
  password: string
  role: 'admin' | 'superadmin'
}

export type UpdateSAUserInput = {
  name?: string
  email?: string
  role?: 'admin' | 'superadmin'
}

export const saUsersService = {
  async list(): Promise<SAUserRow[]> {
    const { data } = await api.get<{ data: SAUserRow[] }>('/superadmin/users')
    return data.data ?? []
  },

  async create(input: CreateSAUserInput): Promise<SAUserRow> {
    const { data } = await api.post<{ success: boolean; data: SAUserRow }>('/superadmin/users', input)
    return data.data
  },

  async update(id: number, input: UpdateSAUserInput): Promise<void> {
    await api.put(`/superadmin/users/${id}`, input)
  },

  async resetPassword(id: number, input: { new_password: string }): Promise<void> {
    await api.post(`/superadmin/users/${id}/password`, input)
  },
}
