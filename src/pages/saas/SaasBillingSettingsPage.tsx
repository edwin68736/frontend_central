import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import {
  saasAssetUrl,
  saasSettingsService,
  type BankAccountConfig,
  type SaasPlatformSettings,
} from '@/services/saasSettings.service'

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const emptyBank = (): BankAccountConfig => ({
  bank: '',
  holder: '',
  account_number: '',
  cci: '',
  currency: 'PEN',
  enabled: true,
})

export default function SaasBillingSettingsPage() {
  const [form, setForm] = useState<SaasPlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reminderInput, setReminderInput] = useState('7,5,3,1')
  const [uploading, setUploading] = useState<'yape' | 'plin' | null>(null)
  const [opsNewKey, setOpsNewKey] = useState('')
  const [opsCurrentKey, setOpsCurrentKey] = useState('')
  const [opsSaving, setOpsSaving] = useState(false)

  useEffect(() => {
    saasSettingsService.get().then(data => {
      setForm(data)
      setReminderInput((data.reminder_days || [7, 5, 3, 1]).join(','))
    }).catch(() => toast.error('Error cargando configuración')).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      const days = reminderInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n) && n > 0)
      await saasSettingsService.save({ ...form, reminder_days: days })
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const uploadQr = async (kind: 'yape' | 'plin', file: File) => {
    setUploading(kind)
    try {
      const r = await saasSettingsService.uploadQr(kind, file)
      setForm(f => f ? (kind === 'yape' ? { ...f, yape_qr_url: r.url } : { ...f, plin_qr_url: r.url }) : f)
      toast.success(`QR ${kind} actualizado`)
    } catch {
      toast.error('Error subiendo QR')
    } finally {
      setUploading(null)
    }
  }

  const updateBank = (idx: number, patch: Partial<BankAccountConfig>) => {
    setForm(f => {
      if (!f) return f
      const banks = [...f.bank_accounts]
      banks[idx] = { ...banks[idx], ...patch }
      return { ...f, bank_accounts: banks }
    })
  }

  const runJobs = async () => {
    try {
      const r = await saasSettingsService.runJobs()
      toast.success(`Jobs: ${r.reminders} recordatorios, ${r.suspended} suspendidos`)
    } catch {
      toast.error('Error ejecutando jobs')
    }
  }

  if (loading || !form) {
    return <div className="flex justify-center py-16"><Spinner size={32} /></div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cobros SaaS</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administración global. Los tenants pagan en <strong>/subscription</strong> (panel tenant).
          </p>
        </div>
        <button type="button" onClick={runJobs} className="text-sm text-blue-600 hover:underline">
          Ejecutar jobs
        </button>
      </div>

      <Card>
        <CardHeader><h3 className="font-semibold text-slate-800">Reglas globales</h3></CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="text-xs text-slate-500">Recordatorios (días antes, separados por coma)</label>
            <input className={inputClass} value={reminderInput} onChange={e => setReminderInput(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Gracia (días)</label>
              <input type="number" className={inputClass} value={form.grace_period_days}
                onChange={e => setForm({ ...form, grace_period_days: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Reconexión (S/)</label>
              <input type="number" className={inputClass} value={form.reconnection_fee}
                onChange={e => setForm({ ...form, reconnection_fee: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Provisional (horas, máx 12)</label>
              <input type="number" className={inputClass} value={form.provisional_hours}
                onChange={e => setForm({ ...form, provisional_hours: Math.min(12, parseInt(e.target.value, 10) || 12) })} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Strikes máx. → bloqueo</label>
              <input type="number" className={inputClass} value={form.strike_max}
                onChange={e => setForm({ ...form, strike_max: parseInt(e.target.value, 10) || 2 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Cron evaluación (hora Lima)</label>
              <input type="number" min={0} max={23} className={inputClass} value={form.cron_eval_hour}
                onChange={e => setForm({ ...form, cron_eval_hour: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Minuto</label>
              <input type="number" min={0} max={59} className={inputClass} value={form.cron_eval_minute}
                onChange={e => setForm({ ...form, cron_eval_minute: parseInt(e.target.value, 10) || 5 })} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Zona horaria fija: {form.timezone || 'America/Lima'}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.auto_suspend_enabled}
              onChange={e => setForm({ ...form, auto_suspend_enabled: e.target.checked })} />
            Auto-suspensión tras gracia
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.provisional_reactivation_enabled}
              onChange={e => setForm({ ...form, provisional_reactivation_enabled: e.target.checked })} />
            Provisional al subir comprobante
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-slate-800">Métodos de pago (toggle)</h3></CardHeader>
        <CardBody className="space-y-2">
          {form.payment_methods.map((m, i) => (
            <label key={m.key} className="flex items-center justify-between text-sm py-1">
              <span>{m.label}</span>
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={e => {
                  const methods = [...form.payment_methods]
                  methods[i] = { ...m, enabled: e.target.checked }
                  setForm({ ...form, payment_methods: methods })
                }}
              />
            </label>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-slate-800">Cuentas bancarias</h3></CardHeader>
        <CardBody className="space-y-4">
          {form.bank_accounts.map((b, i) => (
            <div key={i} className="border border-slate-100 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={b.enabled} onChange={e => updateBank(i, { enabled: e.target.checked })} />
                  Activa
                </label>
                <button type="button" className="text-xs text-red-600"
                  onClick={() => setForm({ ...form, bank_accounts: form.bank_accounts.filter((_, j) => j !== i) })}>
                  Eliminar
                </button>
              </div>
              <input className={inputClass} placeholder="Banco" value={b.bank} onChange={e => updateBank(i, { bank: e.target.value })} />
              <input className={inputClass} placeholder="Titular" value={b.holder} onChange={e => updateBank(i, { holder: e.target.value })} />
              <input className={inputClass} placeholder="Número cuenta" value={b.account_number} onChange={e => updateBank(i, { account_number: e.target.value })} />
              <input className={inputClass} placeholder="CCI" value={b.cci} onChange={e => updateBank(i, { cci: e.target.value })} />
            </div>
          ))}
          <button type="button" className="text-sm text-blue-600"
            onClick={() => setForm({ ...form, bank_accounts: [...form.bank_accounts, emptyBank()] })}>
            + Agregar cuenta
          </button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-slate-800">QR Yape / Plin (upload)</h3></CardHeader>
        <CardBody className="space-y-4">
          {(['yape', 'plin'] as const).map(kind => (
            <div key={kind} className="flex flex-wrap items-start gap-4">
              <div>
                <p className="text-xs font-medium text-slate-600 capitalize mb-2">{kind}</p>
                {(kind === 'yape' ? form.yape_qr_url : form.plin_qr_url) && (
                  <img src={saasAssetUrl(kind === 'yape' ? form.yape_qr_url : form.plin_qr_url)} alt={kind} className="h-28 border rounded-lg" />
                )}
              </div>
              <label className="text-sm">
                <span className="block text-xs text-slate-500 mb-1">Subir imagen</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading === kind}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) void uploadQr(kind, f)
                  }}
                />
              </label>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-slate-800">Portal alternativo (opcional)</h3></CardHeader>
        <CardBody>
          <p className="text-xs text-slate-500 mb-2">
            Vacío = flujo oficial <code>/subscription</code> en panel tenant. Si define URL, aparece botón secundario “Portal alternativo”.
          </p>
          <input
            className={inputClass}
            value={form.portal_url_override}
            onChange={e => setForm({ ...form, portal_url_override: e.target.value })}
            placeholder="https://… (opcional)"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-slate-800">Clave de operaciones</h3>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-slate-600">
            Obligatoria para <strong>eliminar un tenant por completo</strong> (BD, registro central y archivos).
            No afecta el facturador Lycet/SUNAT.
          </p>
          <p className="text-xs">
            Estado:{' '}
            <span className={form.operations_key_configured ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {form.operations_key_configured ? 'Configurada' : 'Sin configurar'}
            </span>
          </p>
          {form.operations_key_configured && (
            <div>
              <label className="text-xs text-slate-600">Clave actual (solo para cambiar)</label>
              <input
                type="password"
                className={inputClass}
                value={opsCurrentKey}
                onChange={e => setOpsCurrentKey(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-600">
              {form.operations_key_configured ? 'Nueva clave' : 'Clave de operaciones (mín. 8 caracteres)'}
            </label>
            <input
              type="password"
              className={inputClass}
              value={opsNewKey}
              onChange={e => setOpsNewKey(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button
            type="button"
            disabled={opsSaving || opsNewKey.length < 8}
            onClick={async () => {
              setOpsSaving(true)
              try {
                await saasSettingsService.setOperationsKey({
                  new_operations_key: opsNewKey,
                  current_operations_key: opsCurrentKey || undefined,
                })
                setForm(f => (f ? { ...f, operations_key_configured: true } : f))
                setOpsNewKey('')
                setOpsCurrentKey('')
                toast.success('Clave de operaciones guardada')
              } catch (e: unknown) {
                const err = e as { response?: { data?: { error?: string } } }
                toast.error(err.response?.data?.error ?? 'Error al guardar clave')
              } finally {
                setOpsSaving(false)
              }
            }}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {opsSaving ? 'Guardando…' : 'Guardar clave de operaciones'}
          </button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-slate-800">Soporte para tenants</h3></CardHeader>
        <CardBody className="space-y-3">
          <input className={inputClass} placeholder="WhatsApp (+51…)" value={form.support.whatsapp}
            onChange={e => setForm({ ...form, support: { ...form.support, whatsapp: e.target.value } })} />
          <input className={inputClass} placeholder="Email" value={form.support.email}
            onChange={e => setForm({ ...form, support: { ...form.support, email: e.target.value } })} />
          <input className={inputClass} placeholder="Teléfono" value={form.support.phone}
            onChange={e => setForm({ ...form, support: { ...form.support, phone: e.target.value } })} />
        </CardBody>
      </Card>

      <button type="button" disabled={saving} onClick={save}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  )
}
