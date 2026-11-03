import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { equiposProvider, type ShalomSettings } from '@/services/equiposProvider.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, formatDateTime, INPUT, LABEL } from './common'

/** Integración con Shalom API Perú: API key (cifrada en la BD), sincronización de agencias y webhook de seguimiento. */
export default function ShalomIntegrationModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('equipos.carriers')
  const canSyncShipments = hasPermission('equipos.shipments')
  const [st, setSt] = useState<ShalomSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [proEmail, setProEmail] = useState('')
  const [proPassword, setProPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await equiposProvider.getSettings()
      setSt(s)
      setWebhookUrl(s.webhook_url)
      setProEmail(s.pro_email)
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cargar la integración'))
    }
  }, [])

  useEffect(() => {
    if (open) { setApiKey(''); setProPassword(''); void load() }
  }, [open, load])

  const run = async <T,>(key: string, fn: () => Promise<T>, ok: (r: T) => string) => {
    setBusy(key)
    try {
      const r = await fn()
      toast.success(ok(r))
      await load()
      onChanged()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo completar la acción'))
    } finally {
      setBusy(null)
    }
  }

  const save = () => run('save', () => equiposProvider.saveSettings({
    ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
    webhook_url: webhookUrl.trim(),
  }), () => { setApiKey(''); return 'Configuración guardada' })

  const savePro = () => run('pro', () => equiposProvider.saveSettings({
    pro_email: proEmail.trim(),
    ...(proPassword.trim() ? { pro_password: proPassword } : {}),
  }), () => { setProPassword(''); return 'Cuenta de Shalom Pro guardada' })

  const toggle = (enabled: boolean) => run('enable', () => equiposProvider.saveSettings({ enabled }), () => (enabled ? 'Integración activada' : 'Integración desactivada'))

  return (
    <Modal open={open} onClose={onClose} title="Integración con Shalom">
      {!st ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4 text-sm">
          {!st.encryption_ready && (
            <div className="flex gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>Falta <code>SECRETS_ENCRYPTION_KEY</code> en el servidor: sin ella no se puede guardar la API key.</span>
            </div>
          )}

          <section className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase">API key</p>
            <p className="text-slate-500">
              Se guarda cifrada en la base de datos y nunca se vuelve a mostrar{st.api_key_set && <> (actual: <span className="font-mono">••••{st.api_key_hint}</span>)</>}.
            </p>
            {canEdit && (
              <div className="flex gap-2">
                <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={st.api_key_set ? 'Escribe una nueva para reemplazarla' : 'Pega la API key de Shalom'} className={INPUT} />
                <button type="button" className={BTN_PRIMARY} disabled={busy !== null || (!apiKey.trim() && webhookUrl.trim() === st.webhook_url)} onClick={() => void save()}>
                  <KeyRound size={14} /> Guardar
                </button>
              </div>
            )}
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" className="rounded" checked={st.enabled} disabled={!canEdit || busy !== null || !st.api_key_set} onChange={(e) => void toggle(e.target.checked)} />
              Integración activa (sin esto el sistema nunca llama a Shalom)
            </label>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase">Cuenta de Shalom Pro (para cotizar fletes)</p>
            <p className="text-slate-500">
              Solo se usa para consultar tarifas; no crea guías. La clave se guarda cifrada y no se vuelve a mostrar{st.pro_password_set && <> (clave guardada)</>}.
            </p>
            {canEdit && (
              <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                <input type="email" autoComplete="off" value={proEmail} onChange={(e) => setProEmail(e.target.value)} placeholder="Correo de Shalom Pro" aria-label="Correo de Shalom Pro" className={INPUT} />
                <input type="password" autoComplete="new-password" value={proPassword} onChange={(e) => setProPassword(e.target.value)} placeholder={st.pro_password_set ? 'Nueva clave (opcional)' : 'Clave de Shalom Pro'} aria-label="Clave de Shalom Pro" className={INPUT} />
                <button type="button" className={BTN_SECONDARY} disabled={busy !== null || !st.enabled || !proEmail.trim() || (!st.pro_password_set && !proPassword.trim()) || (proEmail.trim() === st.pro_email && !proPassword.trim())} onClick={() => void savePro()}>Guardar</button>
              </div>
            )}
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase">Agencias</p>
            <p className="text-slate-500">
              El panel usa siempre el catálogo guardado ({st.agency_count} agencias enlazadas). Se actualiza solo una vez al día; también puedes hacerlo a mano.
              {st.last_agencies_sync_at ? <> Última sincronización: <b>{formatDateTime(st.last_agencies_sync_at)}</b> ({st.last_agencies_sync_count} agencias).</> : ' Aún no se sincronizó.'}
            </p>
            {canEdit && (
              <button type="button" className={BTN_SECONDARY} disabled={busy !== null || !st.enabled}
                onClick={() => void run('agencies', () => equiposProvider.syncAgencies(), (r) => `Agencias: ${r.created} nuevas, ${r.updated} actualizadas de ${r.total}`)}>
                <RefreshCw size={13} className={busy === 'agencies' ? 'animate-spin' : ''} /> Sincronizar agencias ahora
              </button>
            )}
            <p className="text-xs text-slate-400">Departamentos, provincias y distritos se traen solo cuando eliges un departamento y quedan guardados.</p>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase">Seguimiento automático (webhook)</p>
            <p className="text-slate-500">Shalom avisa cada cambio de estado a esta URL pública (https). El sistema marca solo la salida, la llegada a agencia y la entrega.</p>
            <label className={LABEL} htmlFor="shalom-webhook-url">URL del webhook</label>
            <input id="shalom-webhook-url" value={webhookUrl} disabled={!canEdit} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://api.tukifac.com/api/internal/webhooks/shalom" className={INPUT + ' font-mono text-xs'} />
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <button type="button" className={BTN_SECONDARY} disabled={busy !== null || !st.enabled || !st.webhook_url || webhookUrl.trim() !== st.webhook_url}
                    title={webhookUrl.trim() !== st.webhook_url ? 'Guarda primero la URL' : ''}
                    onClick={() => void run('hook', () => equiposProvider.registerWebhook(), (r) => (r.webhook_verified ? 'Webhook registrado y verificado' : 'Webhook registrado: esperando la verificación de Shalom'))}>
                    Registrar webhook
                  </button>
                  <button type="button" className={BTN_SECONDARY} disabled={busy !== null || !st.enabled || !st.webhook_secret_set}
                    onClick={() => void run('rotate', () => equiposProvider.rotateWebhook(), () => 'Secreto de firma rotado')}>
                    Rotar secreto
                  </button>
                </>
              )}
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.webhook_verified ? 'text-emerald-700' : 'text-amber-700'}`}>
                {st.webhook_verified ? <><CheckCircle2 size={13} /> Verificado</> : 'Sin verificar'}
              </span>
            </div>
          </section>

          {canSyncShipments && (
            <section className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold text-slate-400 uppercase">Alinear envíos existentes</p>
              <p className="text-slate-500">Consulta a Shalom (de a 50 guías) los envíos pendientes, en tránsito o en agencia cuya guía tenga el formato «número - código» (ej. 100439617 - M7JK), y corrige sus fechas y estados.</p>
              <button type="button" className={BTN_SECONDARY} disabled={busy !== null || !st.enabled}
                onClick={() => void run('ship', () => equiposProvider.syncShipments(), (r) => `Revisados ${r.checked}: ${r.changed} actualizados, ${r.failed} sin datos en Shalom${r.skipped ? `, ${r.skipped} sin guía con formato Shalom` : ""}`)}>
                <RefreshCw size={13} className={busy === 'ship' ? 'animate-spin' : ''} /> Alinear con Shalom
              </button>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
