import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Banknote,
  Clock,
  CreditCard,
  KeyRound,
  Play,
  QrCode,
  Save,
  Settings2,
  Headphones,
  AlertTriangle,
  Trash2,
  Upload,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'
import {
  saasAssetUrl,
  saasSettingsService,
  type BankAccountConfig,
  type SaasPlatformSettings,
} from '@/services/saasSettings.service'
import { apiErrorMessage } from '@/utils/apiError'

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

const hintClass = 'text-xs text-slate-500 mt-1 leading-snug'

type SaveSection = 'reglas' | 'pagos' | 'bancos' | 'portal' | 'soporte'

function SectionSaveFooter({
  section,
  savingSection,
  onSave,
  label = 'Guardar sección',
}: {
  section: SaveSection
  savingSection: SaveSection | null
  onSave: () => void
  label?: string
}) {
  const busy = savingSection === section
  const disabled = savingSection !== null && !busy
  return (
    <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end">
      <button
        type="button"
        disabled={disabled}
        onClick={onSave}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <Save size={16} />
        {busy ? 'Guardando…' : label}
      </button>
    </div>
  )
}

const emptyBank = (): BankAccountConfig => ({
  bank: '',
  holder: '',
  account_number: '',
  cci: '',
  currency: 'PEN',
  enabled: true,
})

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Clock; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
  )
}

export default function SaasBillingSettingsPage() {
  const [form, setForm] = useState<SaasPlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<SaveSection | null>(null)
  const [reminderInput, setReminderInput] = useState('7,5,3,1')
  const [uploading, setUploading] = useState<'yape' | 'plin' | null>(null)
  const [clearingQr, setClearingQr] = useState<'yape' | 'plin' | null>(null)
  const [qrPreviewVersion, setQrPreviewVersion] = useState({ yape: 0, plin: 0 })
  const yapeFileRef = useRef<HTMLInputElement>(null)
  const plinFileRef = useRef<HTMLInputElement>(null)
  const [opsNewKey, setOpsNewKey] = useState('')
  const [opsCurrentKey, setOpsCurrentKey] = useState('')
  const [opsSaving, setOpsSaving] = useState(false)
  const [showCronConfirm, setShowCronConfirm] = useState(false)
  const [runningCron, setRunningCron] = useState(false)

  useEffect(() => {
    saasSettingsService
      .get()
      .then((data) => {
        setForm(data)
        setReminderInput((data.reminder_days || [7, 5, 3, 1]).join(','))
      })
      .catch(() => toast.error('Error cargando configuración'))
      .finally(() => setLoading(false))
  }, [])

  const buildPayload = (): SaasPlatformSettings | null => {
    if (!form) return null
    const days = reminderInput
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0)
    return { ...form, reminder_days: days }
  }

  const saveSection = async (section: SaveSection, successLabel: string) => {
    const payload = buildPayload()
    if (!payload) return
    setSavingSection(section)
    try {
      await saasSettingsService.save(payload)
      toast.success(successLabel)
    } catch {
      toast.error(`Error al guardar ${successLabel.toLowerCase()}`)
    } finally {
      setSavingSection(null)
    }
  }

  const qrFileRef = (kind: 'yape' | 'plin') => (kind === 'yape' ? yapeFileRef : plinFileRef)

  const qrPreviewSrc = (kind: 'yape' | 'plin', url: string) => {
    if (!url) return ''
    const v = qrPreviewVersion[kind]
    const base = saasAssetUrl(url)
    return v > 0 ? `${base}${base.includes('?') ? '&' : '?'}v=${v}` : base
  }

  const uploadQr = async (kind: 'yape' | 'plin', file: File) => {
    setUploading(kind)
    try {
      const r = await saasSettingsService.uploadQr(kind, file)
      setForm((f) =>
        f ? (kind === 'yape' ? { ...f, yape_qr_url: r.url } : { ...f, plin_qr_url: r.url }) : f,
      )
      setQrPreviewVersion((v) => ({ ...v, [kind]: Date.now() }))
      toast.success(`QR ${kind} actualizado`)
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error subiendo QR'))
    } finally {
      setUploading(null)
      const input = qrFileRef(kind).current
      if (input) input.value = ''
    }
  }

  const clearQr = async (kind: 'yape' | 'plin') => {
    const payload = buildPayload()
    if (!payload) return
    if (kind === 'yape') payload.yape_qr_url = ''
    else payload.plin_qr_url = ''
    setClearingQr(kind)
    try {
      await saasSettingsService.save(payload)
      setForm((f) =>
        f ? (kind === 'yape' ? { ...f, yape_qr_url: '' } : { ...f, plin_qr_url: '' }) : f,
      )
      setQrPreviewVersion((v) => ({ ...v, [kind]: 0 }))
      toast.success(`QR ${kind} eliminado`)
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error al quitar QR'))
    } finally {
      setClearingQr(null)
    }
  }

  const updateBank = (idx: number, patch: Partial<BankAccountConfig>) => {
    setForm((f) => {
      if (!f) return f
      const banks = [...f.bank_accounts]
      banks[idx] = { ...banks[idx], ...patch }
      return { ...f, bank_accounts: banks }
    })
  }

  const runJobs = async () => {
    setRunningCron(true)
    try {
      const r = await saasSettingsService.runJobs()
      const parts = [
        `${r.reminders} recordatorio(s) encolado(s)`,
        `${r.notifications} notificación(es) procesada(s)`,
        `${r.status_updates} actualización(es) de estado`,
        `${r.suspended} tenant(s) suspendido(s)`,
        `${r.overdue_cycles} ciclo(s) marcado(s) vencido(s)`,
      ]
      toast.success(`Jobs ejecutados: ${parts.join(', ')}`)
      setShowCronConfirm(false)
    } catch {
      toast.error('Error ejecutando jobs')
    } finally {
      setRunningCron(false)
    }
  }

  const reminderDaysLabel = reminderInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(', ') || '—'

  if (loading || !form) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Settings2 size={20} />
            <span className="text-xs font-semibold uppercase tracking-wide">Administración SaaS</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Cobros SaaS</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Configuración global de cobros, métodos de pago y reglas de suspensión. Los tenants pagan en{' '}
            <strong>/subscription</strong> desde su panel.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCronConfirm(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Play size={16} />
            Ejecutar jobs
          </button>
        </div>
      </div>

      <Modal
        open={showCronConfirm}
        onClose={() => !runningCron && setShowCronConfirm(false)}
        title="Confirmar ejecución de jobs SaaS"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
            <p>
              Esta acción ejecuta <strong>ahora</strong> las mismas tareas que el cron programado. Puede cambiar
              estados de suscripciones y tenants según las reglas guardadas.
            </p>
          </div>

          <div className="text-sm text-slate-600 space-y-3">
            <p className="font-medium text-slate-800">Jobs horarios (recordatorios y cola)</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Revisa todas las suscripciones activas (excluye canceladas y expiradas).</li>
              <li>
                Encola recordatorios in-app a tenants cuya suscripción vence en{' '}
                <strong>{reminderDaysLabel}</strong> día(s) antes (solo si siguen activos).
              </li>
              <li>Crea el ciclo de cobro pendiente si aún no existe para cada suscripción.</li>
              <li>Procesa hasta 100 notificaciones en cola (las marca como enviadas).</li>
            </ul>

            <p className="font-medium text-slate-800 pt-1">Evaluación diaria (zona {form.timezone || 'America/Lima'})</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Actualiza el estado de suscripciones por día calendario (gracia, vencido, etc.).</li>
              <li>
                Cierra reactivaciones provisionales vencidas y suspende la suscripción y el tenant si corresponde.
              </li>
              <li>Marca ciclos de cobro pendientes como vencidos cuando la fecha de vencimiento ya pasó.</li>
              <li>
                {form.auto_suspend_enabled ? (
                  <>
                    Suspende automáticamente tenants en mora tras <strong>{form.grace_period_days}</strong> día(s) de
                    gracia.
                  </>
                ) : (
                  <>
                    La auto-suspensión está <strong>desactivada</strong>; no suspenderá tenants por mora.
                  </>
                )}
              </li>
              <li>Expira paquetes de documentos cuya vigencia ya terminó.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCronConfirm(false)}
              disabled={runningCron}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void runJobs()}
              disabled={runningCron}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Play size={16} />
              {runningCron ? 'Ejecutando…' : 'Confirmar y ejecutar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Fila 1: Reglas + Métodos de pago */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card id="reglas" className="scroll-mt-24">
          <CardHeader>
            <SectionTitle
              icon={Clock}
              title="Reglas globales"
              description="Recordatorios, gracia, suspensión y cron de evaluación"
            />
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className={labelClass}>Recordatorios (días antes, separados por coma)</label>
              <input className={inputClass} value={reminderInput} onChange={(e) => setReminderInput(e.target.value)} />
              <p className={hintClass}>
                Avisos in-app al tenant antes de que venza su suscripción. Ejemplo: 7,5,3,1 envía recordatorio a 7, 5, 3 y 1 día del vencimiento.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Gracia (días)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.grace_period_days}
                  onChange={(e) => setForm({ ...form, grace_period_days: parseInt(e.target.value, 10) || 0 })}
                />
                <p className={hintClass}>
                  Días de tolerancia tras el vencimiento. Durante la gracia puede seguir operando; después entra en mora.
                </p>
              </div>
              <div>
                <label className={labelClass}>Reconexión (S/)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.reconnection_fee}
                  onChange={(e) => setForm({ ...form, reconnection_fee: parseFloat(e.target.value) || 0 })}
                />
                <p className={hintClass}>
                  Cargo extra si el tenant estaba suspendido y paga para volver a usar el sistema.
                </p>
              </div>
              <div>
                <label className={labelClass}>Provisional (horas, máx. 12)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.provisional_hours}
                  onChange={(e) =>
                    setForm({ ...form, provisional_hours: Math.min(12, parseInt(e.target.value, 10) || 12) })
                  }
                />
                <p className={hintClass}>
                  Tiempo de acceso temporal mientras se revisa un comprobante subido (una vez por ciclo de cobro).
                </p>
              </div>
              <div>
                <label className={labelClass}>Rechazos máx. antes de bloqueo</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.strike_max}
                  onChange={(e) => setForm({ ...form, strike_max: parseInt(e.target.value, 10) || 2 })}
                />
                <p className={hintClass}>
                  Pagos rechazados consecutivos permitidos. Al alcanzar el límite, el tenant queda bloqueado y no puede subir más comprobantes.
                </p>
              </div>
              <div>
                <label className={labelClass}>Cron evaluación (hora Lima)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  className={inputClass}
                  value={form.cron_eval_hour}
                  onChange={(e) => setForm({ ...form, cron_eval_hour: parseInt(e.target.value, 10) || 0 })}
                />
                <p className={hintClass}>Hora del día (0–23) en que corre la evaluación automática de estados y suspensiones.</p>
              </div>
              <div>
                <label className={labelClass}>Minuto</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className={inputClass}
                  value={form.cron_eval_minute}
                  onChange={(e) => setForm({ ...form, cron_eval_minute: parseInt(e.target.value, 10) || 5 })}
                />
                <p className={hintClass}>Minuto exacto de la evaluación diaria automática.</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Zona horaria fija: {form.timezone || 'America/Lima'} — todas las reglas de vencimiento usan día calendario en esta zona.
            </p>
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 mt-0.5 shrink-0"
                  checked={form.auto_suspend_enabled}
                  onChange={(e) => setForm({ ...form, auto_suspend_enabled: e.target.checked })}
                />
                <span>
                  Auto-suspensión tras gracia
                  <span className={`${hintClass} block font-normal`}>
                    Suspende al tenant automáticamente cuando supera los días de gracia sin pagar.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 mt-0.5 shrink-0"
                  checked={form.provisional_reactivation_enabled}
                  onChange={(e) => setForm({ ...form, provisional_reactivation_enabled: e.target.checked })}
                />
                <span>
                  Provisional al subir comprobante
                  <span className={`${hintClass} block font-normal`}>
                    Permite acceso temporal al tenant cuando sube un comprobante de pago pendiente de revisión.
                  </span>
                </span>
              </label>
            </div>
            <SectionSaveFooter
              section="reglas"
              savingSection={savingSection}
              onSave={() => void saveSection('reglas', 'Reglas globales guardadas')}
              label="Guardar reglas"
            />
          </CardBody>
        </Card>

        <Card id="pagos" className="scroll-mt-24">
          <CardHeader>
            <SectionTitle icon={CreditCard} title="Métodos de pago" description="Activa o desactiva opciones visibles en /subscription" />
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {form.payment_methods.map((m, i) => (
                <label
                  key={m.key}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                    m.enabled ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <span className="font-medium text-slate-700">{m.label}</span>
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => {
                      const methods = [...form.payment_methods]
                      methods[i] = { ...m, enabled: e.target.checked }
                      setForm({ ...form, payment_methods: methods })
                    }}
                  />
                </label>
              ))}
            </div>
            <SectionSaveFooter
              section="pagos"
              savingSection={savingSection}
              onSave={() => void saveSection('pagos', 'Métodos de pago guardados')}
              label="Guardar métodos"
            />
          </CardBody>
        </Card>
      </div>

      {/* Cuentas bancarias */}
      <Card id="bancos" className="scroll-mt-24">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SectionTitle icon={Banknote} title="Cuentas bancarias" description="Datos para transferencia en el portal de pago" />
          <button
            type="button"
            className="text-sm text-blue-600 font-medium hover:underline shrink-0 self-start sm:self-center"
            onClick={() => setForm({ ...form, bank_accounts: [...form.bank_accounts, emptyBank()] })}
          >
            + Agregar cuenta
          </button>
        </CardHeader>
        <CardBody>
          {form.bank_accounts.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No hay cuentas configuradas.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
              {form.bank_accounts.map((b, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/30">
                  <div className="flex justify-between items-center gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={b.enabled} onChange={(e) => updateBank(i, { enabled: e.target.checked })} />
                      Cuenta activa
                    </label>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() =>
                        setForm({ ...form, bank_accounts: form.bank_accounts.filter((_, j) => j !== i) })
                      }
                    >
                      Eliminar
                    </button>
                  </div>
                  <input className={inputClass} placeholder="Banco" value={b.bank} onChange={(e) => updateBank(i, { bank: e.target.value })} />
                  <input className={inputClass} placeholder="Titular" value={b.holder} onChange={(e) => updateBank(i, { holder: e.target.value })} />
                  <input
                    className={inputClass}
                    placeholder="Número cuenta"
                    value={b.account_number}
                    onChange={(e) => updateBank(i, { account_number: e.target.value })}
                  />
                  <input className={inputClass} placeholder="CCI" value={b.cci} onChange={(e) => updateBank(i, { cci: e.target.value })} />
                </div>
              ))}
            </div>
          )}
          <SectionSaveFooter
            section="bancos"
            savingSection={savingSection}
            onSave={() => void saveSection('bancos', 'Cuentas bancarias guardadas')}
            label="Guardar cuentas"
          />
        </CardBody>
      </Card>

      {/* QR + Portal + Soporte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card id="qr" className="scroll-mt-24">
          <CardHeader>
            <SectionTitle icon={QrCode} title="QR Yape / Plin" description="Imágenes para pago móvil en el portal tenant" />
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['yape', 'plin'] as const).map((kind) => {
                const url = kind === 'yape' ? form.yape_qr_url : form.plin_qr_url
                const busy = uploading === kind || clearingQr === kind
                const previewSrc = qrPreviewSrc(kind, url)
                return (
                  <div key={kind} className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-700 capitalize">{kind}</p>
                    {url && previewSrc ? (
                      <img
                        key={previewSrc}
                        src={previewSrc}
                        alt={`QR ${kind}`}
                        className="h-32 w-full object-contain border border-slate-100 rounded-lg bg-white"
                      />
                    ) : (
                      <div className="h-32 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
                        Sin imagen
                      </div>
                    )}
                    <input
                      ref={qrFileRef(kind)}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadQr(kind, f)
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => qrFileRef(kind).current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Upload size={14} />
                        {uploading === kind ? 'Subiendo…' : url ? 'Cambiar imagen' : 'Subir imagen'}
                      </button>
                      {url ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void clearQr(kind)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          {clearingQr === kind ? 'Quitando…' : 'Quitar QR'}
                        </button>
                      ) : null}
                    </div>
                    {url ? (
                      <p className="text-[11px] text-slate-400 break-all">{url}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Las imágenes se guardan al subirlas (JPG, PNG o WebP, máx. 10 MB) en{' '}
              <code className="text-slate-600 bg-slate-100 px-1 rounded">storage/saas/</code>. Al reemplazar
              una imagen, use <strong>Cambiar imagen</strong>; la vista previa se actualiza de inmediato.
            </p>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card className="scroll-mt-24">
            <CardHeader>
              <SectionTitle icon={Settings2} title="Portal alternativo" description="Opcional — botón secundario en /subscription" />
            </CardHeader>
            <CardBody>
              <input
                className={inputClass}
                value={form.portal_url_override}
                onChange={(e) => setForm({ ...form, portal_url_override: e.target.value })}
                placeholder="https://… (vacío = flujo oficial)"
              />
              <SectionSaveFooter
                section="portal"
                savingSection={savingSection}
                onSave={() => void saveSection('portal', 'Portal alternativo guardado')}
                label="Guardar portal"
              />
            </CardBody>
          </Card>

          <Card id="soporte" className="scroll-mt-24">
            <CardHeader>
              <SectionTitle icon={Headphones} title="Soporte para tenants" description="Contacto visible en el portal de suscripción" />
            </CardHeader>
            <CardBody className="space-y-3">
              <div>
                <label className={labelClass}>WhatsApp</label>
                <input
                  className={inputClass}
                  placeholder="+51 999 000 000"
                  value={form.support.whatsapp}
                  onChange={(e) => setForm({ ...form, support: { ...form.support, whatsapp: e.target.value } })}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  className={inputClass}
                  placeholder="soporte@empresa.com"
                  value={form.support.email}
                  onChange={(e) => setForm({ ...form, support: { ...form.support, email: e.target.value } })}
                />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  className={inputClass}
                  placeholder="+51 …"
                  value={form.support.phone}
                  onChange={(e) => setForm({ ...form, support: { ...form.support, phone: e.target.value } })}
                />
              </div>
              <SectionSaveFooter
                section="soporte"
                savingSection={savingSection}
                onSave={() => void saveSection('soporte', 'Datos de soporte guardados')}
                label="Guardar soporte"
              />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Seguridad */}
      <Card id="seguridad" className="scroll-mt-24 max-w-3xl">
        <CardHeader>
          <SectionTitle
            icon={KeyRound}
            title="Clave de operaciones"
            description="Requerida para eliminar un tenant por completo (BD, central y archivos)"
          />
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs">
            Estado:{' '}
            <span className={form.operations_key_configured ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {form.operations_key_configured ? 'Configurada' : 'Sin configurar'}
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {form.operations_key_configured && (
              <div>
                <label className={labelClass}>Clave actual (solo para cambiar)</label>
                <input
                  type="password"
                  className={inputClass}
                  value={opsCurrentKey}
                  onChange={(e) => setOpsCurrentKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
            <div className={form.operations_key_configured ? '' : 'sm:col-span-2'}>
              <label className={labelClass}>
                {form.operations_key_configured ? 'Nueva clave' : 'Clave de operaciones (mín. 8 caracteres)'}
              </label>
              <input
                type="password"
                className={inputClass}
                value={opsNewKey}
                onChange={(e) => setOpsNewKey(e.target.value)}
                autoComplete="new-password"
              />
            </div>
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
                setForm((f) => (f ? { ...f, operations_key_configured: true } : f))
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
    </div>
  )
}
