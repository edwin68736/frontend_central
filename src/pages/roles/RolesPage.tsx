import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { apiErrorMessage } from '@/utils/apiError'
import {
  rolesService,
  groupPermissionsByModule,
  isReservedRoleName,
  type SARole,
  type SAPermission,
} from '@/services/roles.service'

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

export default function RolesPage() {
  const { hasPermission } = useAuth()
  const [roles, setRoles] = useState<SARole[]>([])
  const [catalog, setCatalog] = useState<SAPermission[]>([])
  const [loading, setLoading] = useState(true)

  const [showRoleModal, setShowRoleModal] = useState(false)
  const [editingRole, setEditingRole] = useState<SARole | null>(null)
  const [roleForm, setRoleForm] = useState({ name: '', description: '' })
  const [savingRole, setSavingRole] = useState(false)

  const [permsRole, setPermsRole] = useState<SARole | null>(null)
  const [selectedPermIds, setSelectedPermIds] = useState<Set<number>>(new Set())
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)

  const grouped = useMemo(() => groupPermissionsByModule(catalog), [catalog])
  const [permCounts, setPermCounts] = useState<Map<number, number>>(new Map())

  const canManage = hasPermission('roles.manage')
  const canCreate = hasPermission('roles.create')
  const canUpdate = hasPermission('roles.update')
  const canDelete = hasPermission('roles.delete')

  const load = async () => {
    setLoading(true)
    try {
      const [roleList, permCatalog] = await Promise.all([
        rolesService.list(),
        rolesService.listPermissionsCatalog(),
      ])
      setRoles(roleList)
      setCatalog(permCatalog)
      const counts = new Map<number, number>()
      await Promise.all(
        roleList.map(async (r) => {
          try {
            const ids = await rolesService.getRolePermissionIds(r.id)
            counts.set(r.id, ids.length)
          } catch {
            counts.set(r.id, 0)
          }
        })
      )
      setPermCounts(counts)
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error cargando roles'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingRole(null)
    setRoleForm({ name: '', description: '' })
    setShowRoleModal(true)
  }

  const openEditRole = (r: SARole) => {
    setEditingRole(r)
    setRoleForm({ name: r.name, description: r.description })
    setShowRoleModal(true)
  }

  const handleSaveRole = async () => {
    const name = roleForm.name.trim()
    const description = roleForm.description.trim()
    if (!name) {
      toast.error('El nombre del rol es requerido')
      return
    }
    if (isReservedRoleName(name)) {
      toast.error('El nombre "Superadmin" está reservado')
      return
    }
    setSavingRole(true)
    try {
      if (editingRole) {
        await rolesService.update(editingRole.id, { name, description })
        toast.success('Rol actualizado')
      } else {
        await rolesService.create({ name, description })
        toast.success('Rol creado')
      }
      setShowRoleModal(false)
      load()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error guardando el rol'))
    } finally {
      setSavingRole(false)
    }
  }

  const handleDeleteRole = async (r: SARole) => {
    if (r.is_system) return
    if (!confirm(`¿Eliminar el rol "${r.name}"? Esta acción no se puede deshacer.`)) return
    try {
      await rolesService.remove(r.id)
      toast.success('Rol eliminado')
      load()
    } catch (e) {
      toast.error(apiErrorMessage(e, 'No se pudo eliminar el rol'))
    }
  }

  const openPermissions = async (r: SARole) => {
    setPermsRole(r)
    setLoadingPerms(true)
    try {
      const ids = await rolesService.getRolePermissionIds(r.id)
      setSelectedPermIds(new Set(ids))
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error cargando los permisos del rol'))
      setSelectedPermIds(new Set())
    } finally {
      setLoadingPerms(false)
    }
  }

  const togglePerm = (id: number) => {
    setSelectedPermIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSavePermissions = async () => {
    if (!permsRole) return
    setSavingPerms(true)
    try {
      await rolesService.setRolePermissions(permsRole.id, Array.from(selectedPermIds))
      toast.success('Permisos actualizados')
      setPermsRole(null)
      load()
    } catch (e) {
      // El backend puede rechazar con 403 si el actor intenta delegar un permiso que él mismo no
      // posee (techo de delegación, CanDelegateAll) — el frontend nunca precalcula esto, solo
      // muestra lo que el backend respondió (Fase 9 §17: no duplicar la autorización real).
      toast.error(apiErrorMessage(e, 'No se pudieron guardar los permisos'))
    } finally {
      setSavingPerms(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Roles</h1>
          <p className="text-sm text-slate-500 mt-1">Administra los roles granulares del panel central</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nuevo rol
          </button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <p className="text-sm text-slate-500">{roles.length} rol(es)</p>
        </CardHeader>
        <CardBody>
          {roles.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">No hay roles</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-100">
                  <tr>
                    {['Nombre', 'Descripción', 'Tipo', 'Permisos', 'Creado', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.description || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={r.is_system ? 'yellow' : 'gray'}>
                          {r.is_system ? 'Protegido (sistema)' : 'Personalizado'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{permCounts.get(r.id) ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openPermissions(r)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                              <ShieldCheck size={12} /> Permisos
                            </button>
                          )}
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => openEditRole(r)}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                            >
                              <Pencil size={12} /> Editar
                            </button>
                          )}
                          {canDelete && !r.is_system && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(r)}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                            >
                              <Trash2 size={12} /> Eliminar
                            </button>
                          )}
                          {r.is_system && !canManage && !canUpdate && (
                            <span className="text-xs text-slate-400">Protegido</span>
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

      {/* Crear/editar nombre+descripción */}
      <Modal open={showRoleModal} onClose={() => setShowRoleModal(false)} title={editingRole ? 'Editar rol' : 'Nuevo rol'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              className={inputClass}
              value={roleForm.name}
              onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del rol"
              disabled={editingRole?.is_system}
            />
            {editingRole?.is_system && (
              <p className="text-xs text-slate-400 mt-1">Los roles de sistema no pueden renombrarse.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              className={inputClass}
              value={roleForm.description}
              onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descripción del rol"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRoleModal(false)}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              disabled={savingRole}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveRole}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              disabled={savingRole}
            >
              {savingRole ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Matriz de permisos, agrupada por módulo — nunca solo IDs (Fase 9 §7) */}
      <Modal
        open={!!permsRole}
        onClose={() => setPermsRole(null)}
        title={`Permisos de "${permsRole?.name ?? ''}"`}
        maxWidth="max-w-3xl"
      >
        {loadingPerms ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="space-y-5">
            {Array.from(grouped.entries()).map(([module, perms]) => (
              <div key={module}>
                <h3 className="text-sm font-semibold text-slate-700 capitalize mb-2">{module}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {perms.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-start gap-2 text-sm text-slate-700 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer"
                      title={p.label}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedPermIds.has(p.id)}
                        onChange={() => togglePerm(p.id)}
                      />
                      <span>
                        <span className="font-mono text-xs text-slate-500">{p.action}</span>
                        <span className="block text-xs text-slate-400">{p.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPermsRole(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
                disabled={savingPerms}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                disabled={savingPerms}
              >
                {savingPerms ? 'Guardando...' : 'Guardar permisos'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
