import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useAuth } from '@/contexts/AuthContext'
import { authService } from '@/services/auth.service'
import { saUsersService } from '@/services/saUsers.service'

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [email, setEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    setEmail(user?.email ?? '')
  }, [user?.email])

  const handleChangeEmail = async () => {
    if (!user?.id) return
    const next = email.trim().toLowerCase()
    if (!next) {
      toast.error('Ingrese un correo electrónico')
      return
    }
    if (!emailPattern.test(next)) {
      toast.error('Ingrese un correo electrónico válido')
      return
    }
    if (next === user.email) {
      toast.info('El correo no ha cambiado')
      return
    }
    setSavingEmail(true)
    try {
      await saUsersService.update(user.id, { email: next })
      updateUser({ email: next })
      toast.success('Correo actualizado')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo actualizar el correo')
    } finally {
      setSavingEmail(false)
    }
  }

  const handleChangePassword = async () => {
    const current = currentPassword.trim()
    const next = newPassword.trim()
    if (!current || !next) {
      toast.error('Ingrese su contraseña actual y la nueva contraseña')
      return
    }
    if (next.length < 8) {
      toast.error('La nueva contraseña debe tener mínimo 8 caracteres')
      return
    }
    setSavingPass(true)
    try {
      await authService.changeMyPassword({ current_password: current, new_password: next })
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Contraseña actualizada')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo actualizar la contraseña')
    } finally {
      setSavingPass(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Perfil</h1>
        <p className="text-slate-500 text-sm mt-1">Información de tu cuenta</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-700">Datos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Actualiza el correo con el que inicias sesión.</p>
        </CardHeader>
        <CardBody>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="tu@correo.com"
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-500">Rol</span>
              <span className="font-medium text-slate-800 capitalize">{user?.role ?? '—'}</span>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleChangeEmail}
                disabled={savingEmail}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {savingEmail ? 'Guardando...' : 'Actualizar correo'}
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-700">Seguridad</h2>
          <p className="text-xs text-slate-500 mt-0.5">Cambia tu contraseña del panel central.</p>
        </CardHeader>
        <CardBody>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña actual</label>
              <input
                type="password"
                className={inputClass}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Tu contraseña actual"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nueva contraseña</label>
              <input
                type="password"
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={savingPass}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {savingPass ? 'Guardando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
