import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Banknote,
  Clock,
  CreditCard,
  KeyRound,
  Play,
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
  saasQrPreviewUrl,
  saasSettingsService,
  type BankAccountConfig,
  type PaymentMethodConfig,
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

/** id estable para una cuenta bancaria — permite asociarle un logo propio (ver upload-logo). */
function genBankAccountId(): string {
  return `ba_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const emptyBank = (): BankAccountConfig => ({
  id: genBankAccountId(),
  bank: '',
  holder: '',
  account_number: '',
  cci: '',
  currency: 'PEN',
  enabled: true,
})

/** key estable a partir del label ("Yape Empresa" -> "yape_empresa"), única contra existingKeys
 *  (agrega sufijo numérico si choca) — la key es lo que identifica al método para el upload de
 *  QR y para saas_payments.payment_method, así que no puede quedar vacía ni repetirse. */
function slugifyMethodKey(label: string, existingKeys: string[]): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'metodo'
  let key = base
  let n = 2
  while (existingKeys.includes(key)) {
    key = `${base}_${n}`
    n += 1
  }
  return key
}

const emptyMethod = (existingKeys: string[]): PaymentMethodConfig => ({
  key: slugifyMethodKey('Nuevo método', existingKeys),
  label: 'Nuevo método',
  enabled: true,
  kind: 'bank_account',
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
  // Keyed por payment method key: cualquier método con kind='qr' puede tener su propio QR, no
  // solo yape/plin (ver PaymentMethodConfig.kind/qr_url).
  const [uploading, setUploading] = useState<string | null>(null)
  const [clearingQr, setClearingQr] = useState<string | null>(null)
  const [qrPreviewVersion, setQrPreviewVersion] = useState<Record<string, number>>({})
  const qrFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Logo: mismo patrón que el QR de arriba, pero compartido entre métodos de pago (target=
  // 'method', kind=key) y cuentas bancarias (target='bank', kind=id) — la key de estos estados
  // combina ambos ("method:yape" / "bank:ba_...") para no chocar entre sí.
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null)
  const [clearingLogo, setClearingLogo] = useState<string | null>(null)
  const [logoPreviewVersion, setLogoPreviewVersion] = useState<Record<string, number>>({})
  const logoFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [opsNewKey, setOpsNewKey] = useState('')
  const [opsCurrentKey, setOpsCurrentKey] = useState('')
  const [opsSaving, setOpsSaving] = useState(false)
  const [showCronConfirm, setShowCronConfirm] = useState(false)
  const [runningCron, setRunningCron] = useState(false)

  useEffect(() => {
    saasSettingsService
      .get()
      .then((data) => {
        // Cuentas guardadas antes de que existiera el campo "id" no lo traen — se les asigna
        // uno recién ahora, así el logo queda asociable desde la primera vez que se editan.
        const bank_accounts = data.bank_accounts.map((b) => (b.id ? b : { ...b, id: genBankAccountId() }))
        setForm({ ...data, bank_accounts })
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

  const qrFileRef = (key: string) => {
    if (!qrFileRefs.current[key]) qrFileRefs.current[key] = null
    return {
      get current() {
        return qrFileRefs.current[key] ?? null
      },
      set current(el: HTMLInputElement | null) {
        qrFileRefs.current[key] = el
      },
    }
  }

  const qrPreviewSrc = (key: string, url: string) => {
    if (!url) return ''
    const v = qrPreviewVersion[key] || form?.updated_at || ''
    return saasQrPreviewUrl(url, v)
  }

  const uploadQr = async (key: string, file: File) => {
    setUploading(key)
    try {
      const r = await saasSettingsService.uploadQr(key, file)
      setForm((f) => {
        if (!f) return f
        const methods = f.payment_methods.map((m) => (m.key === key ? { ...m, qr_url: r.url } : m))
        return { ...f, payment_methods: methods }
      })
      setQrPreviewVersion((v) => ({ ...v, [key]: Date.now() }))
      toast.success('QR actualizado')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error subiendo QR'))
    } finally {
      setUploading(null)
      const input = qrFileRef(key).current
      if (input) input.value = ''
    }
  }

  const clearQr = async (key: string) => {
    const payload = buildPayload()
    if (!payload) return
    payload.payment_methods = payload.payment_methods.map((m) => (m.key === key ? { ...m, qr_url: '' } : m))
    setClearingQr(key)
    try {
      await saasSettingsService.save(payload)
      setForm((f) => {
        if (!f) return f
        const methods = f.payment_methods.map((m) => (m.key === key ? { ...m, qr_url: '' } : m))
        return { ...f, payment_methods: methods }
      })
      setQrPreviewVersion((v) => ({ ...v, [key]: 0 }))
      toast.success('QR eliminado')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error al quitar QR'))
    } finally {
      setClearingQr(null)
    }
  }

  const logoKeyFor = (target: 'method' | 'bank', kind: string) => `${target}:${kind}`

  const logoFileRef = (key: string) => {
    if (!logoFileRefs.current[key]) logoFileRefs.current[key] = null
    return {
      get current() {
        return logoFileRefs.current[key] ?? null
      },
      set current(el: HTMLInputElement | null) {
        logoFileRefs.current[key] = el
      },
    }
  }

  const logoPreviewSrc = (key: string, url: string) => {
    if (!url) return ''
    const v = logoPreviewVersion[key] || form?.updated_at || ''
    return saasQrPreviewUrl(url, v)
  }

  const uploadLogo = async (target: 'method' | 'bank', kind: string, file: File) => {
    const stateKey = logoKeyFor(target, kind)
    setUploadingLogo(stateKey)
    try {
      const r = await saasSettingsService.uploadLogo(target, kind, file)
      setForm((f) => {
        if (!f) return f
        if (target === 'method') {
          const methods = f.payment_methods.map((m) => (m.key === kind ? { ...m, logo_url: r.url } : m))
          return { ...f, payment_methods: methods }
        }
        const banks = f.bank_accounts.map((b) => (b.id === kind ? { ...b, logo_url: r.url } : b))
        return { ...f, bank_accounts: banks }
      })
      setLogoPreviewVersion((v) => ({ ...v, [stateKey]: Date.now() }))
      toast.success('Logo actualizado')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error subiendo logo'))
    } finally {
      setUploadingLogo(null)
      const input = logoFileRef(stateKey).current
      if (input) input.value = ''
    }
  }

  const clearLogo = async (target: 'method' | 'bank', kind: string) => {
    const stateKey = logoKeyFor(target, kind)
    const payload = buildPayload()
    if (!payload) return
    if (target === 'method') {
      payload.payment_methods = payload.payment_methods.map((m) => (m.key === kind ? { ...m, logo_url: '' } : m))
    } else {
      payload.bank_accounts = payload.bank_accounts.map((b) => (b.id === kind ? { ...b, logo_url: '' } : b))
    }
    setClearingLogo(stateKey)
    try {
      await saasSettingsService.save(payload)
      setForm((f) => {
        if (!f) return f
        if (target === 'method') {
          const methods = f.payment_methods.map((m) => (m.key === kind ? { ...m, logo_url: '' } : m))
          return { ...f, payment_methods: methods }
        }
        const banks = f.bank_accounts.map((b) => (b.id === kind ? { ...b, logo_url: '' } : b))
        return { ...f, bank_accounts: banks }
      })
      setLogoPreviewVersion((v) => ({ ...v, [stateKey]: 0 }))
      toast.success('Logo eliminado')
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Error al quitar logo'))
    } finally {
      setClearingLogo(null)
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

  const updateMethod = (idx: number, patch: Partial<PaymentMethodConfig>) => {
    setForm((f) => {
      if (!f) return f
      const methods = [...f.payment_methods]
      methods[idx] = { ...methods[idx], ...patch }
      return { ...f, payment_methods: methods }
    })
  }

  const addMethod = () => {
    setForm((f) => {
      if (!f) return f
      return { ...f, payment_methods: [...f.payment_methods, emptyMethod(f.payment_methods.map((m) => m.key))] }
    })
  }

  const removeMethod = (idx: number) => {
    setForm((f) => {
      if (!f) return f
      return { ...f, payment_methods: f.payment_methods.filter((_, j) => j !== idx) }
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
                <label className={labelClass}>Plazo de pago (días)</label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={form.payment_window_days}
                  onChange={(e) => setForm({ ...form, payment_window_days: parseInt(e.target.value, 10) || 3 })}
                />
                <p className={hintClass}>
                  Días para pagar un cobro recién emitido. Aplica a quien ya está usando el sistema sin haberlo pagado (alta nueva): al agotarse, el cobro aparece como vencido en la campana de cobranza para que decidas suspender o anular. Las renovaciones se rigen por su fecha de vencimiento.
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

      {/* Métodos de pago: cada uno puede tener su propio QR (kind="qr") o mostrar la lista de
          cuentas bancarias de la sección de abajo (kind="bank_account"). Antes esto vivía en dos
          tarjetas sueltas sin ninguna relación entre sí — un QR de Yape/Plin fijo y aparte de la
          lista de métodos habilitados. */}
      <Card id="pagos" className="scroll-mt-24">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SectionTitle
            icon={CreditCard}
            title="Métodos de pago"
            description="Visibles en /subscription. Cada uno puede tener su propio QR o mostrar las cuentas bancarias."
          />
          <button
            type="button"
            className="text-sm text-blue-600 font-medium hover:underline shrink-0 self-start sm:self-center"
            onClick={addMethod}
          >
            + Agregar método
          </button>
        </CardHeader>
        <CardBody className="space-y-4">
          {form.payment_methods.map((m, i) => {
            const busy = uploading === m.key || clearingQr === m.key
            const previewSrc = qrPreviewSrc(m.key, m.qr_url ?? '')
            return (
              <div
                key={m.key}
                className={`border rounded-xl p-4 space-y-3 ${
                  m.enabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 shrink-0">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) => updateMethod(i, { enabled: e.target.checked })}
                    />
                    <span className="text-xs text-slate-500">Activo</span>
                  </label>
                  <input
                    className={`${inputClass} flex-1 min-w-[10rem]`}
                    placeholder="Nombre (ej. Yape)"
                    value={m.label}
                    onChange={(e) => updateMethod(i, { label: e.target.value })}
                  />
                  <select
                    className={`${inputClass} w-auto`}
                    value={m.kind}
                    onChange={(e) => updateMethod(i, { kind: e.target.value as PaymentMethodConfig['kind'] })}
                  >
                    <option value="qr">QR</option>
                    <option value="bank_account">Cuenta bancaria</option>
                  </select>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline shrink-0"
                    onClick={() => removeMethod(i)}
                  >
                    Eliminar
                  </button>
                </div>

                {m.kind === 'qr' ? (
                  <>
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      {m.qr_url && previewSrc ? (
                        <img
                          key={previewSrc}
                          src={previewSrc}
                          alt={`QR ${m.label}`}
                          className="h-28 w-28 shrink-0 object-contain border border-slate-100 rounded-lg bg-white"
                        />
                      ) : (
                        <div className="h-28 w-28 shrink-0 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-[11px] text-slate-400 text-center px-1">
                          Sin imagen
                        </div>
                      )}
                      <div className="flex flex-col gap-2 min-w-0">
                        <input
                          ref={(el) => {
                            qrFileRefs.current[m.key] = el
                          }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/*"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadQr(m.key, f)
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => qrFileRef(m.key).current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            <Upload size={14} />
                            {uploading === m.key ? 'Subiendo…' : m.qr_url ? 'Cambiar imagen' : 'Subir imagen'}
                          </button>
                          {m.qr_url ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void clearQr(m.key)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                              {clearingQr === m.key ? 'Quitando…' : 'Quitar QR'}
                            </button>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-400">JPG, PNG o WebP, máx. 10 MB. Se guarda al subirla.</p>
                      </div>
                    </div>

                    {/* Logo + datos adicionales: se muestran al costado del QR en /subscription
                        (ej. Yape: logo + "Número: ... / Titular: ..."). Logo se guarda en la MISMA
                        carpeta que el QR (storage/saas), solo cambia el prefijo del archivo. */}
                    {(() => {
                      const logoKey = logoKeyFor('method', m.key)
                      const logoBusy = uploadingLogo === logoKey || clearingLogo === logoKey
                      const logoSrc = logoPreviewSrc(logoKey, m.logo_url ?? '')
                      return (
                        <div className="flex flex-col sm:flex-row gap-4 items-start pt-1">
                          {m.logo_url && logoSrc ? (
                            <img
                              key={logoSrc}
                              src={logoSrc}
                              alt={`Logo ${m.label}`}
                              className="h-14 w-14 shrink-0 object-contain border border-slate-100 rounded-lg bg-white"
                            />
                          ) : (
                            <div className="h-14 w-14 shrink-0 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-400 text-center px-1">
                              Sin logo
                            </div>
                          )}
                          <div className="flex flex-col gap-2 shrink-0">
                            <input
                              ref={(el) => {
                                logoFileRefs.current[logoKey] = el
                              }}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/*"
                              className="hidden"
                              disabled={logoBusy}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void uploadLogo('method', m.key, f)
                              }}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={logoBusy}
                                onClick={() => logoFileRef(logoKey).current?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                              >
                                <Upload size={14} />
                                {uploadingLogo === logoKey ? 'Subiendo…' : m.logo_url ? 'Cambiar logo' : 'Subir logo'}
                              </button>
                              {m.logo_url ? (
                                <button
                                  type="button"
                                  disabled={logoBusy}
                                  onClick={() => void clearLogo('method', m.key)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 size={14} />
                                  {clearingLogo === logoKey ? 'Quitando…' : 'Quitar logo'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex-1 min-w-[12rem]">
                            <label className={labelClass}>Datos adicionales (se muestran junto al QR)</label>
                            <textarea
                              className={`${inputClass} min-h-[72px] resize-y`}
                              placeholder={'Ej:\n**Número**: 987654321\n**Titular**: Juan Pérez'}
                              value={m.extra_info ?? ''}
                              onChange={(e) => updateMethod(i, { extra_info: e.target.value })}
                            />
                            <p className={hintClass}>Envuelve un texto entre **asteriscos** para mostrarlo en negrita.</p>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Banknote size={14} className="shrink-0" />
                    Muestra las cuentas bancarias activas de la sección de abajo.
                  </p>
                )}
              </div>
            )
          })}
          {form.payment_methods.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No hay métodos configurados.</p>
          )}
          <SectionSaveFooter
            section="pagos"
            savingSection={savingSection}
            onSave={() => void saveSection('pagos', 'Métodos de pago guardados')}
            label="Guardar métodos"
          />
        </CardBody>
      </Card>

      {/* Cuentas bancarias */}
      <Card id="bancos" className="scroll-mt-24">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SectionTitle
            icon={Banknote}
            title="Cuentas bancarias"
            description="Se muestran para cualquier método de pago con tipo 'Cuenta bancaria' (arriba)"
          />
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
              {form.bank_accounts.map((b, i) => {
                const bankId = b.id || String(i)
                const logoKey = logoKeyFor('bank', bankId)
                const logoBusy = uploadingLogo === logoKey || clearingLogo === logoKey
                const logoSrc = logoPreviewSrc(logoKey, b.logo_url ?? '')
                return (
                  <div key={bankId} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/30">
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

                    {/* Logo del banco + datos adicionales: se muestran junto a los datos de la
                        cuenta en /subscription. Logo en la misma carpeta storage/saas que los QR. */}
                    <div className="flex items-start gap-3 pt-1">
                      {b.logo_url && logoSrc ? (
                        <img
                          key={logoSrc}
                          src={logoSrc}
                          alt={`Logo ${b.bank || 'banco'}`}
                          className="h-12 w-12 shrink-0 object-contain border border-slate-100 rounded-lg bg-white"
                        />
                      ) : (
                        <div className="h-12 w-12 shrink-0 flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-[9px] text-slate-400 text-center px-1">
                          Sin logo
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <input
                          ref={(el) => {
                            logoFileRefs.current[logoKey] = el
                          }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/*"
                          className="hidden"
                          disabled={logoBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadLogo('bank', bankId, f)
                          }}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={logoBusy}
                            onClick={() => logoFileRef(logoKey).current?.click()}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
                          >
                            <Upload size={12} />
                            {uploadingLogo === logoKey ? 'Subiendo…' : b.logo_url ? 'Cambiar logo' : 'Subir logo'}
                          </button>
                          {b.logo_url ? (
                            <button
                              type="button"
                              disabled={logoBusy}
                              onClick={() => void clearLogo('bank', bankId)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                              Quitar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <textarea
                      className={`${inputClass} min-h-[60px] resize-y`}
                      placeholder={'Datos adicionales (ej. horario, instrucciones). **texto** = negrita'}
                      value={b.extra_info ?? ''}
                      onChange={(e) => updateBank(i, { extra_info: e.target.value })}
                    />
                  </div>
                )
              })}
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

      {/* Portal + Soporte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
