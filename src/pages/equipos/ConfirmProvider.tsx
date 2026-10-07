import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  /** Botón rojo para acciones destructivas. */
  danger?: boolean
  /** Pide el PIN de seguridad antes de ejecutar. */
  pin?: boolean
  /** Campo de texto (motivo, nota…). */
  input?: { label: string; required?: boolean; placeholder?: string }
}

export interface ConfirmResult {
  pin: string
  text: string
}

type Ask = (o: ConfirmOptions) => Promise<ConfirmResult | null>

const Ctx = createContext<Ask | null>(null)

/** Devuelve `confirm(opciones)`: abre un modal y resuelve con {pin, text} si el usuario acepta, o null si cancela. */
export function useConfirm(): Ask {
  const ask = useContext(Ctx)
  if (!ask) throw new Error('useConfirm requiere <ConfirmProvider>')
  return ask
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [pin, setPin] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const resolver = useRef<((r: ConfirmResult | null) => void) | null>(null)

  const ask = useCallback<Ask>((o) => {
    setPin(''); setText(''); setError('')
    setOpts(o)
    return new Promise((resolve) => { resolver.current = resolve })
  }, [])

  const finish = (r: ConfirmResult | null) => {
    resolver.current?.(r)
    resolver.current = null
    setOpts(null)
  }

  const accept = () => {
    if (opts?.input?.required && !text.trim()) return setError(`${opts.input.label} es obligatorio`)
    if (opts?.pin && !/^\d{4,6}$/.test(pin)) return setError('Ingresa tu PIN de seguridad (4 a 6 dígitos)')
    finish({ pin, text: text.trim() })
  }

  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal open={opts != null} onClose={() => finish(null)} title={opts?.title ?? ''}>
        {opts && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); accept() }}>
            {opts.message && (
              <div className="flex gap-2 text-sm text-slate-600">
                {opts.danger && <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />}
                <div>{opts.message}</div>
              </div>
            )}
            {opts.input && (
              <div>
                <label className={LABEL}>{opts.input.label}{opts.input.required && ' *'}</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={opts.input.placeholder} className={INPUT} autoFocus />
              </div>
            )}
            {opts.pin && (
              <div>
                <label className={LABEL + ' flex items-center gap-1'}><ShieldCheck size={14} className="text-indigo-600" /> PIN de seguridad *</label>
                <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className={INPUT + ' tracking-[0.4em] text-center'} autoFocus={!opts.input} />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_SECONDARY} onClick={() => finish(null)}>Cancelar</button>
              <button type="submit" className={opts.danger ? 'inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium' : BTN_PRIMARY}>{opts.confirmLabel ?? 'Confirmar'}</button>
            </div>
          </form>
        )}
      </Modal>
    </Ctx.Provider>
  )
}
