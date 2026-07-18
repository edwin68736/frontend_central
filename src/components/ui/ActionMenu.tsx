import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export type ActionMenuItem = {
  key: string
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  hidden?: boolean
  tone?: 'default' | 'danger' | 'success'
}

/**
 * Menú de acciones en dropdown (kebab). Cada ítem muestra su ícono + label.
 * Se renderiza en un portal con posición fija para no ser recortado por
 * contenedores con overflow (p. ej. tablas con overflow-x-auto).
 */
export default function ActionMenu({
  items,
  ariaLabel = 'Acciones',
}: {
  items: ActionMenuItem[]
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const visible = items.filter((i) => !i.hidden)
  const MENU_WIDTH = 224

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
    setPos({ top: r.bottom + 4, left })
  }

  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (visible.length === 0) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <MoreVertical size={16} />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH }}
              className="z-50 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {visible.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onClick()
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    item.tone === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : item.tone === 'success'
                        ? 'text-emerald-700 hover:bg-emerald-50'
                        : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.icon ? <span className="flex-shrink-0 inline-flex">{item.icon}</span> : null}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
