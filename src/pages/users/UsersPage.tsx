import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, KeyRound, Shield, UserCog, Power, Trash2 } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { apiErrorMessage } from '@/utils/apiError'
import {
  saUsersService,
  type SAUserRow,
  type CreateSAUserInput,
  type UpdateSAUserInput,
} from '@/services/saUsers.service'
import { rolesService, type SARole } from '@/services/roles.service'

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
  const { user: currentUser, hasPermission } = useAuth()
  const [users, setUsers] = useState<SAUserRow[]>([])
  const [roles, setRoles] = useState<SARole[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SAUserRow | null>(null)
  const [form, setForm] = useState<CreateSAUserInput & { email: string; name: string }>({
    name: '',
    email: '',
    password: '',
    role_id: undefined,
  })

  const [passwordTarget, setPasswordTarget] = useState<SAUserRow | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [roleTarget, setRoleTarget] = useState<SAUserRow | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<number | ''>('')
  const [savingRole, setSavingRole] = useState(false)

  const [systemRoleTarget, setSystemRoleTarget] = useState<SAUserRow | null>(null)
  const [savingSystemRole, setSavingSystemRole] = useState(false)

  // system-role (Role: admin/superadmin) es EXCLUSIVO del superadmin real — no es un permiso
  // granular otorgable (el catálogo no tiene ninguno para esto, y el backend lo protege con
  // RequireSuperAdminOnly(), no con RequireSAPermission). Es la ÚNICA comprobación de este
  // archivo que compara `role` directamente, y es intencional (Fase 9 §9) — no confundir con
  // usar `role === 'superadmin'` como sustituto general del RBAC granular en el resto del archivo.
  const isRealSuperadmin = (currentUser?.role ?? '').toLowerCase() === 'superadmin'

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const title = useMemo(() => (editing ? 'Editar usuario' : 'Nuevo usuario'), [editing])

  const load = async () => {
    setLoading(true)
    try {
      const [userList, roleList] = await Promise.all([
        saUsersService.list(),
        hasPermission('roles.view') ? rolesService.list() : Promise.resolve([]),
      ])
      setUsers(userList)
      setRoles(roleList)
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error cargando usuarios'))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const canEditBasicInfo = (u: SAUserRow) => currentUser?.id === u.id || hasPermission('usuarios_central.update')

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', email: '', password: '', role_id: undefined })
    setShowModal(true)
  }

  const openEdit = (u: SAUserRow) => {
    if (!canEditBasicInfo(u)) return
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role_id: undefined })
    setShowModal(true)
  }

  const handleSave = async () => {
    const name = form.name.trim()
    const email = form.email.trim().toLowerCase()
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
        const payload: UpdateSAUserInput = { name, email }
        await saUsersService.update(editing.id, payload)
        toast.success('Usuario actualizado')
      } else {
        await saUsersService.create({ name, email, password, role_id: form.role_id })
        toast.success('Usuario creado')
      }
      setShowModal(false)
      load()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error guardando usuario'))
    } finally {
      setSaving(false)
    }
  }

  const openResetPassword = (u: SAUserRow) => {
    setPasswordTarget(u)
    setNewPassword('')
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
      setPasswordTarget(null)
      setNewPassword('')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'No se pudo actualizar la contraseña'))
    } finally {
      setSavingPassword(false)
    }
  }

  const openChangeRole = (u: SAUserRow) => {
    setRoleTarget(u)
    setSelectedRoleId(u.role_id ?? '')
  }

  const handleChangeRole = async () => {
    if (!roleTarget || selectedRoleId === '') return
    setSavingRole(true)
    try {
      await saUsersService.changeRole(roleTarget.id, Number(selectedRoleId))
      toast.success('Rol actualizado')
      setRoleTarget(null)
      load()
    } catch (e) {
      // El backend decide con CanDelegateAll si este rol es delegable — el frontend no lo
      // adivina, solo muestra lo que el backend respondió (Fase 9 §8).
      toast.error(apiErrorMessage(e, 'No tienes permisos para asignar este rol.'))
    } finally {
      setSavingRole(false)
    }
  }

  const handleChangeSystemRole = async (u: SAUserRow, newRole: 'admin' | 'superadmin') => {
    setSavingSystemRole(true)
    try {
      await saUsersService.changeSystemRole(u.id, newRole)
      toast.success(newRole === 'superadmin' ? 'Usuario promovido a superadmin' : 'Usuario degradado a admin')
      setSystemRoleTarget(null)
      load()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'No se pudo cambiar el rol de sistema'))
    } finally {
      setSavingSystemRole(false)
    }
  }

  const handleToggleStatus = async (u: SAUserRow) => {
    const nextActive = !u.active
    if (!confirm(`¿${nextActive ? 'Activar' : 'Desactivar'} a ${u.email}?`)) return
    try {
      await saUsersService.changeStatus(u.id, nextActive)
      toast.success(nextActive ? 'Usuario activado' : 'Usuario desactivado')
      load()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'No se pudo cambiar el estado'))
    }
  }

  const handleDestroy = async (u: SAUserRow) => {
    if (!confirm(`¿Eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return
    try {
      await saUsersService.destroy(u.id)
      toast.success('Usuario eliminado')
      load()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'No se pudo eliminar el usuario'))
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
        {hasPermission('usuarios_central.create') && (
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
                    {['Nombre', 'Sistema', 'Rol granular', 'Estado', 'Creado', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const roleName = u.role_id != null ? roleById.get(u.role_id)?.name : null
                    return (
                      <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.role === 'superadmin' ? 'blue' : 'gray'}>
                            {u.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'superadmin' ? (
                            <span className="text-xs text-slate-400 italic">No aplica (bypass total)</span>
                          ) : roleName ? (
                            <Badge variant="gray">{roleName}</Badge>
                          ) : (
                            <span className="text-xs text-amber-600">Sin rol asignado</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.active ? 'green' : 'red'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-3 flex-wrap justify-end">
                            {canEditBasicInfo(u) && (
                              <button
                                type="button"
                                onClick={() => openEdit(u)}
                                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                              >
                                <Pencil size={12} /> Editar
                              </button>
                            )}
                            {hasPermission('usuarios_central.change_role') && u.role !== 'superadmin' && (
                              <button
                                type="button"
                                onClick={() => openChangeRole(u)}
                                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                              >
                                <Shield size={12} /> Rol
                              </button>
                            )}
                            {isRealSuperadmin && currentUser?.id !== u.id && (
                              <button
                                type="button"
                                onClick={() => setSystemRoleTarget(u)}
                                className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
                              >
                                <UserCog size={12} /> Sistema
                              </button>
                            )}
                            {hasPermission('usuarios_central.change_status') && (
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                              >
                                <Power size={12} /> {u.active ? 'Desactivar' : 'Activar'}
                              </button>
                            )}
                            {hasPermission('usuarios_central.reset_password') && (
                              <button
                                type="button"
                                onClick={() => openResetPassword(u)}
                                className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                              >
                                <KeyRound size={12} /> Contraseña
                              </button>
                            )}
                            {hasPermission('usuarios_central.destroy') && (
                              <button
                                type="button"
                                onClick={() => handleDestroy(u)}
                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                              >
                                <Trash2 size={12} /> Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Crear/editar datos básicos */}
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
          {!editing && (
            <>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Rol granular <span className="text-slate-400 font-normal">(opcional)</span>
                </label>
                <select
                  className={inputClass}
                  value={form.role_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value ? Number(e.target.value) : undefined }))}
                >
                  <option value="">Sin rol (sin permisos hasta asignarle uno)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Todo usuario nuevo se crea como "admin" de sistema — nunca como superadmin. El
                  rol de sistema superadmin solo se otorga después, desde "Sistema".
                </p>
              </div>
            </>
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

      {/* Reset de contraseña */}
      <Modal
        open={!!passwordTarget}
        onClose={() => { if (!savingPassword) { setPasswordTarget(null); setNewPassword('') } }}
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
              onClick={() => { setPasswordTarget(null); setNewPassword('') }}
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

      {/* Asignar rol granular (RoleID) */}
      <Modal open={!!roleTarget} onClose={() => setRoleTarget(null)} title="Asignar rol granular">
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Usuario: <span className="font-medium text-slate-800">{roleTarget?.email}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
            <select
              className={inputClass}
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Sin rol</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Solo puedes asignar roles cuyos permisos tú mismo posees — si el backend rechaza la
              asignación, verás el motivo aquí.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRoleTarget(null)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              disabled={savingRole}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleChangeRole}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              disabled={savingRole || selectedRoleId === ''}
            >
              {savingRole ? 'Guardando...' : 'Asignar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rol de SISTEMA (admin ↔ superadmin) — deliberadamente en su propio modal, visualmente
          separado del rol granular (Fase 9 §9): son conceptos completamente distintos. */}
      <Modal open={!!systemRoleTarget} onClose={() => setSystemRoleTarget(null)} title="Rol de sistema">
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            Usuario: <span className="font-medium text-slate-800">{systemRoleTarget?.email}</span>
          </div>
          <p className="text-sm text-slate-500">
            Este es el rol de <strong>sistema</strong> (el bypass total de superadmin), no el rol
            granular. Actualmente es{' '}
            <Badge variant={systemRoleTarget?.role === 'superadmin' ? 'blue' : 'gray'}>
              {systemRoleTarget?.role === 'superadmin' ? 'Superadmin' : 'Admin'}
            </Badge>
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSystemRoleTarget(null)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              disabled={savingSystemRole}
            >
              Cancelar
            </button>
            {systemRoleTarget && (
              <button
                type="button"
                onClick={() =>
                  handleChangeSystemRole(systemRoleTarget, systemRoleTarget.role === 'superadmin' ? 'admin' : 'superadmin')
                }
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                disabled={savingSystemRole}
              >
                {savingSystemRole
                  ? 'Guardando...'
                  : systemRoleTarget.role === 'superadmin'
                    ? 'Degradar a Admin'
                    : 'Promover a Superadmin'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
