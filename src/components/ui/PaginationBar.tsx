import { PER_PAGE_OPTIONS, type PerPageOption } from '@/services/pagination'

interface PaginationBarProps {
  page: number
  perPage: PerPageOption
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: PerPageOption) => void
  itemLabel?: string
}

export default function PaginationBar({
  page,
  perPage,
  total,
  totalPages,
  onPageChange,
  onPerPageChange,
  itemLabel = 'registros',
}: PaginationBarProps) {
  const safeTotalPages = totalPages > 0 ? totalPages : 1

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100 px-4 pb-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span>
          {total} {itemLabel} · Pág. {page} de {safeTotalPages}
        </span>
        <label className="flex items-center gap-2">
          <span>Por página</span>
          <select
            value={perPage}
            onChange={e => onPerPageChange(Number(e.target.value) as PerPageOption)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1 border border-slate-200 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50 transition-colors"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={page >= safeTotalPages || total === 0}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1 border border-slate-200 rounded-lg text-sm disabled:opacity-40 hover:bg-slate-50 transition-colors"
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}
