import { useEffect, useMemo, useState } from 'react'
import type { PerPageOption } from '@/services/pagination'

/** Valor con retraso: evita disparar una búsqueda por cada tecla. */
export function useDebounced<T>(value: T, delay = 450): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/** Paginación en el navegador para listas ya cargadas completas. */
export function usePaging<T>(items: T[], initialPerPage: PerPageOption = 25) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<PerPageOption>(initialPerPage)
  const totalPages = Math.max(1, Math.ceil(items.length / perPage))
  // Si la lista se acorta (filtros), vuelve a una página válida.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  const rows = useMemo(() => items.slice((page - 1) * perPage, page * perPage), [items, page, perPage])
  return {
    rows,
    reset: () => setPage(1),
    barProps: {
      page, perPage, total: items.length, totalPages,
      onPageChange: setPage,
      onPerPageChange: (n: PerPageOption) => { setPerPage(n); setPage(1) },
    },
  }
}
