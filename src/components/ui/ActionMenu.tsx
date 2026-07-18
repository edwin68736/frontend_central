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
 * Se renderiza en un portal con posición fija (no lo recorta el overflow de la tabla)
 * y se abre hacia arriba automáticamente cuando no hay espacio suficiente abajo
 * (p. ej. en la última fila de la lista). El posicionamiento se aplica por ref para
 * evitar renders extra y medir la altura real del menú.
 */
export default function ActionMenu({
  items,
  ariaLabel = 'Acciones',
}: {
  items: ActionMenuItem[]
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const visible = items.filter((i) => !i.hidden)
  const MENU_WIDTH = 224
  const MARGIN = 8

  // Mide la altura real del menú ya renderizado y decide abajo/arriba; aplica estilos por ref.
  useLayoutEffect(() => {
    if (!open) return
    const btn = btnRef.current
    const menu = menuRef.current
    if (!btn || !menu) return
    const r = btn.getBoundingClientRect()
    const menuH = menu.offsetHeight
    const left = Math.max(MARGIN, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MARGIN))
    const spaceBelow = window.innerHeight - r.bottom
    let top = r.bottom + 4
    // Sin espacio abajo y con más espacio arriba → abrir hacia arriba (última fila).
    if (spaceBelow < menuH + MARGIN && r.top > spaceBelow) {
      top = Math.max(MARGIN, r.top - menuH - 4)
    }
    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.visibility = 'visible'
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
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              // Inicia oculto fuera de pantalla; el layout effect lo posiciona y lo hace visible.
              style={{ position: 'fixed', top: -9999, left: 0, width: MENU_WIDTH, visibility: 'hidden' }}
              className="z-50 origin-top rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
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
