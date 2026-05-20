import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, KeyRound } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { saUsersService, type SAUserRow, type CreateSAUserInput, type UpdateSAUserInput } from '@/services/saUsers.service'

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

function formatDate(s?: string): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<SAUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SAUserRow | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<SAUserRow | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [form, setForm] = useState<CreateSAUserInput>({
    name: '',
    email: '',
    password: '',
    role: 'admin',
  })

  const title = useMemo(() => (editing ? 'Editar usuario' : 'Nuevo usuario'), [editing])
  const isSuperAdmin = (currentUser?.role ?? '').toLowerCase() === 'superadmin'

  const load = async () => {
    setLoading(true)
    try {
      const list = await saUsersService.list()
      setUsers(list)
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error cargando usuarios')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    if (!isSuperAdmin) {
      toast.error('No autorizado')
      return
    }
    setEditing(null)
    setForm({ name: '', email: '', password: '', role: 'admin' })
    setShowModal(true)
  }

  const openEdit = (u: SAUserRow) => {
    if (!isSuperAdmin && currentUser?.id !== u.id) {
      toast.error('No autorizado')
      return
    }
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role: (u.role as any) ?? 'admin' })
    setShowModal(true)
  }

  const openResetPassword = (u: SAUserRow) => {
    if (!isSuperAdmin) {
      toast.error('No autorizado')
      return
    }
    setPasswordTarget(u)
    setNewPassword('')
    setShowPasswordModal(true)
  }

  const handleSave = async () => {
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
    const role = form.role
    const password = form.password.trim()

    if (!name || !email) {
      toast.error('Nombre y email son requeridos')
      return
    }
    if (!editing && password.length < 8) {
      toast.error('La contraseña debe tener mínimo 8 caracteres')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const payload: UpdateSAUserInput = isSuperAdmin ? { name, email, role } : { name, email }
        await saUsersService.update(editing.id, payload)
        toast.success('Usuario actualizado')
      } else {
        await saUsersService.create({ name, email, password, role })
        toast.success('Usuario creado')
      }
      setShowModal(false)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Error guardando usuario')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (!passwordTarget) return
    const pwd = newPassword.trim()
    if (pwd.length < 8) {
      toast.error('La contraseña debe tener mínimo 8 caracteres')
      return
    }
    setSavingPassword(true)
    try {
      await saUsersService.resetPassword(passwordTarget.id, { new_password: pwd })
      toast.success('Contraseña actualizada')
      setShowPasswordModal(false)
      setPasswordTarget(null)
      setNewPassword('')
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'No se pudo actualizar la contraseña')
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>
          <p className="text-sm text-slate-500 mt-1">Gestiona los usuarios del panel central</p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nuevo usuario
          </button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <p className="text-sm text-slate-500">{users.length} usuario(s)</p>
        </CardHeader>
        <CardBody>
          {users.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">No hay usuarios</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-100">
                  <tr>
                    {['Nombre', 'Email', 'Rol', 'Creado', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-500">ID {u.id}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          u.role === 'superadmin' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                        }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          {(isSuperAdmin || currentUser?.id === u.id) && (
                            <button
                              type="button"
                              onClick={() => openEdit(u)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => openResetPassword(u)}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                            >
                              <KeyRound size={12} /> Contraseña
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={title}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del usuario"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="usuario@dominio.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
            <select
              className={inputClass}
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as any }))}
              disabled={!isSuperAdmin}
            >
              <option value="admin">admin</option>
              <option value="superadmin">superadmin</option>
            </select>
          </div>
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                type="password"
                autoComplete="new-password"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showPasswordModal}
        onClose={() => {
          if (savingPassword) return
          setShowPasswordModal(false)
          setPasswordTarget(null)
          setNewPassword('')
        }}
        title="Cambiar contraseña"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Usuario: <span className="font-medium text-slate-800">{passwordTarget?.email}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nueva contraseña</label>
            <input
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              type="password"
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowPasswordModal(false)
                setPasswordTarget(null)
                setNewPassword('')
              }}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              disabled={savingPassword}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleResetPassword}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              disabled={savingPassword}
            >
              {savingPassword ? 'Guardando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
