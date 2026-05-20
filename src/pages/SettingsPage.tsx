import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ajustesService, type CentralAjuste, type UpdateAjusteInput } from '@/services/ajustes.service'
import { authService } from '@/services/auth.service'
import Spinner from '@/components/ui/Spinner'

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function SettingsPage() {
  const [ajustes, setAjustes] = useState<CentralAjuste | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPass, setSavingPass] = useState(false)
  const [form, setForm] = useState<UpdateAjusteInput & { token_consulta_placeholder?: string }>({
    nombre_sistema: '',
    slogan: '',
    direccion: '',
    ubigeo: '',
    email_contacto: '',
    telefono: '',
    token_consulta_placeholder: '',
  })
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    ajustesService
      .get()
      .then((data) => {
        setAjustes(data)
        setForm({
          nombre_sistema: data.nombre_sistema ?? '',
          slogan: data.slogan ?? '',
          direccion: data.direccion ?? '',
          ubigeo: data.ubigeo ?? '',
          email_contacto: data.email_contacto ?? '',
          telefono: data.telefono ?? '',
          token_consulta_placeholder: '',
        })
      })
      .catch(() => toast.error('Error cargando ajustes'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: UpdateAjusteInput = {
        nombre_sistema: form.nombre_sistema,
        slogan: form.slogan,
        direccion: form.direccion,
        ubigeo: form.ubigeo,
        email_contacto: form.email_contacto,
        telefono: form.telefono,
      }
      if (form.token_consulta_placeholder) {
        payload.token_consulta = form.token_consulta_placeholder
      }
      await ajustesService.update(payload)
      toast.success('Ajustes guardados')
      if (payload.token_consulta) {
        setForm((f) => ({ ...f, token_consulta_placeholder: '' }))
      }
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
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
        <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">Ajustes generales del sistema central</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-700">Ajustes del sistema</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nombre del sistema, slogan, dirección, ubigeo y token para consultas externas (apiperu.dev).
          </p>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size={28} />
            </div>
          ) : (
            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del sistema</label>
                <input
                  className={inputClass}
                  value={form.nombre_sistema ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, nombre_sistema: e.target.value }))}
                  placeholder="Tukifac"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Slogan</label>
                <input
                  className={inputClass}
                  value={form.slogan ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, slogan: e.target.value }))}
                  placeholder="Tu negocio en la nube"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                <input
                  className={inputClass}
                  value={form.direccion ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                  placeholder="Calle, número, ciudad"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ubigeo</label>
                <input
                  className={inputClass}
                  value={form.ubigeo ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, ubigeo: e.target.value }))}
                  placeholder="Código ubigeo (ej. 150101)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email de contacto</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email_contacto ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email_contacto: e.target.value }))}
                  placeholder="contacto@ejemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input
                  className={inputClass}
                  value={form.telefono ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  placeholder="+51 ..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Token consulta (apiperu.dev)</label>
                <input
                  type="password"
                  className={inputClass}
                  value={form.token_consulta_placeholder ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, token_consulta_placeholder: e.target.value }))}
                  placeholder="Dejar vacío para no cambiar el token actual"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Se usa para consultas de DNI y RUC desde el panel central y desde los tenants.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? 'Guardando...' : 'Guardar ajustes'}
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-700">Mi cuenta</h2>
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

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-700">API Endpoints disponibles</h2>
        </CardHeader>
        <CardBody>
          <div className="space-y-2 text-sm font-mono text-slate-600">
            {[
              'POST   /api/superadmin/login',
              'GET    /api/superadmin/stats',
              'GET    /api/superadmin/tenants',
              'GET    /api/superadmin/tenants/:id',
              'POST   /api/superadmin/tenants',
              'PUT    /api/superadmin/tenants/:id',
              'GET    /api/superadmin/ajustes',
              'PUT    /api/superadmin/ajustes',
              'POST   /api/superadmin/consulta/dni',
              'POST   /api/superadmin/consulta/ruc',
            ].map((ep) => (
              <div key={ep} className="bg-slate-50 px-3 py-2 rounded border border-slate-100">
                {ep}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
