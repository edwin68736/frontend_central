import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export interface SearchSelectOption {
  value: string | number
  label: string
  /** Texto secundario (se muestra atenuado y también se busca). */
  hint?: string
}

interface Props {
  value: string | number | null | undefined
  onChange: (value: string | number | null, option?: SearchSelectOption) => void
  options: SearchSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  /** Muestra una «x» para limpiar la selección. */
  clearable?: boolean
  className?: string
  ariaLabel?: string
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Select con buscador (estilo select2): escribe para filtrar, flechas + Enter para elegir, Esc para cerrar. */
export default function SearchSelect({ value, onChange, options, placeholder = 'Seleccionar…', searchPlaceholder = 'Buscar…', disabled, clearable, className = '', ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => String(o.value) === String(value ?? ''))
  const filtered = useMemo(() => {
    const n = norm(q.trim())
    if (!n) return options
    return options.filter((o) => norm(`${o.label} ${o.hint ?? ''}`).includes(n))
  }, [options, q])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      setTimeout(() => input.current?.focus(), 0)
    }
  }, [open])

  const pick = (o: SearchSelectOption) => {
    onChange(o.value, o)
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[cursor]) pick(filtered[cursor]) }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-left focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
      >
        <span className={`truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selected && !disabled && (
            <span role="button" aria-label="Quitar selección" onClick={(e) => { e.stopPropagation(); onChange(null) }} className="text-slate-400 hover:text-slate-600"><X size={14} /></span>
          )}
          <ChevronDown size={15} className="text-slate-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-56 bg-white border border-slate-200 rounded-lg shadow-lg" onKeyDown={onKey}>
          <div className="relative p-2 border-b border-slate-100">
            <Search size={14} className="absolute left-4 top-4 text-slate-400" />
            <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setCursor(0) }} placeholder={searchPlaceholder}
              className="w-full border border-slate-200 rounded-md pl-8 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <ul role="listbox" className="max-h-60 overflow-auto py-1">
            {filtered.map((o, i) => {
              const on = String(o.value) === String(value ?? '')
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => pick(o)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 ${i === cursor ? 'bg-indigo-50' : ''}`}>
                    <span className="truncate"><span className="text-slate-800">{o.label}</span>{o.hint && <span className="ml-2 text-xs text-slate-400">{o.hint}</span>}</span>
                    {on && <Check size={14} className="text-indigo-600 shrink-0" />}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">Sin resultados</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
