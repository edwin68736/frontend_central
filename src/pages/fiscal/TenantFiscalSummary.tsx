import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Send, Search, FileSpreadsheet, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  fiscalOperationsService,
  TenantFiscalSummaryParams,
  TenantFiscalSummaryResponse,
  TenantFiscalSummaryRow,
} from '@/services/fiscal-operations.service'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import { DATE_PRESETS, DatePreset, agoText, rangeForPreset, formatLima, limaDate } from '@/lib/fiscalFilters'

const PAGE_SIZES = [25, 50, 100]

// Tipos que cuenta el resumen. 09/31 son guías de remisión (remitente / transportista).
const DOC_TYPES: { code: string; label: string }[] = [
  { code: '01', label: 'Factura' },
  { code: '03', label: 'Boleta' },
  { code: '07', label: 'Nota de crédito' },
  { code: '08', label: 'Nota de débito' },
  { code: '09', label: 'Guía remitente' },
  { code: '31', label: 'Guía transportista' },
]
const typeLabel = (code: string) => DOC_TYPES.find((t) => t.code === code)?.label ?? code

const SORTS: { v: NonNullable<TenantFiscalSummaryParams['sort']>; l: string }[] = [
  { v: 'to_send', l: 'Más por enviar' },
  { v: 'emitted', l: 'Más emitidos' },
  { v: 'accepted', l: 'Más aceptados' },
  { v: 'oldest', l: 'Pendiente más antiguo' },
  { v: 'scanned', l: 'Verificado hace más tiempo' },
  { v: 'name', l: 'Nombre (A-Z)' },
]

/** Antigüedad del pendiente más antiguo (la fecha viene como día, medianoche UTC). */
function ageDays(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return null
  return Math.max(0, Math.floor((Date.now() - d) / 86400000))
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className={`text-lg font-bold leading-tight ${tone ?? 'text-slate-800'}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  )
}

export default function TenantFiscalSummary() {
  const [preset, setPreset] = useState<DatePreset | 'all' | 'custom'>('thisMonth')
  const [from, setFrom] = useState(() => rangeForPreset('thisMonth').from)
  const [to, setTo] = useState(() => rangeForPreset('thisMonth').to)
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [ruc, setRuc] = useState('')
  const [q, setQ] = useState('')
  const [rucApplied, setRucApplied] = useState('')
  const [qApplied, setQApplied] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [staleOnly, setStaleOnly] = useState(false)
  const [resendTarget, setResendTarget] = useState<TenantFiscalSummaryRow | null>(null)
  const [resending, setResending] = useState(false)
  const [sort, setSort] = useState<NonNullable<TenantFiscalSummaryParams['sort']>>('to_send')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [data, setData] = useState<TenantFiscalSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [refreshing, setRefreshing] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  // Búsquedas de texto con espera: una consulta por pausa, no por tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      setRucApplied(ruc.trim())
      setQApplied(q.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [ruc, q])

  const params = useMemo<TenantFiscalSummaryParams>(
    () => ({
      from: preset === 'all' ? undefined : from || undefined,
      to: preset === 'all' ? undefined : to || undefined,
      doc_type: docTypes.length ? docTypes.join(',') : undefined,
      ruc: rucApplied || undefined,
      q: qApplied || undefined,
      only_pending: onlyPending,
      stale_only: staleOnly,
      sort,
      page,
      per_page: perPage,
    }),
    [preset, from, to, docTypes, rucApplied, qApplied, onlyPending, staleOnly, sort, page, perPage]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fiscalOperationsService.getTenantSummary(params)
      setData(res ?? null)
    } catch {
      toast.error('No se pudo cargar el resumen fiscal por tenant')
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    load()
  }, [load])

  const applyPreset = (p: DatePreset) => {
    const r = rangeForPreset(p)
    setPreset(p)
    setFrom(r.from)
    setTo(r.to)
    setPage(1)
  }

  const toggleType = (code: string) => {
    setDocTypes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
    setPage(1)
  }

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const verifyNow = async (row: TenantFiscalSummaryRow) => {
    setRefreshing(row.tenant_id)
    try {
      await fiscalOperationsService.refreshTenantSummary(row.tenant_id)
      toast.success(`${row.name}: verificado`)
      await load()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo verificar el tenant')
    } finally {
      setRefreshing(null)
    }
  }

  const confirmResend = async () => {
    if (!resendTarget) return
    setResending(true)
    try {
      const r = await fiscalOperationsService.resendTenantPending(resendTarget.tenant_id)
      if (r.found === 0) {
        toast.success('No hay pendientes con más de 10 min para reenviar')
      } else {
        const parts = [`${r.queued} reenviados`]
        if (r.already_accepted > 0) parts.push(`${r.already_accepted} ya aceptados (sincronizados)`)
        if (r.in_progress > 0) parts.push(`${r.in_progress} ya en proceso`)
        if (r.failed > 0) parts.push(`${r.failed} con error`)
        if (r.remaining > 0) parts.push(`${r.remaining} quedan para otra pasada`)
        toast.success(`${resendTarget.name}: ${parts.join(' · ')}`)
      }
      setResendTarget(null)
      await load()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'No se pudo reenviar los pendientes')
    } finally {
      setResending(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all: TenantFiscalSummaryRow[] = []
      for (let p = 1; p <= 20; p++) {
        const res = await fiscalOperationsService.getTenantSummary({ ...params, page: p, per_page: 100 })
        all.push(...(res?.items ?? []))
        if (!res || all.length >= res.total) break
      }
      const cell = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const head = ['Tenant', 'RUC', 'Estado tenant', 'Emitidos', 'Aceptados', 'Faltan enviar', 'En envío', 'Rechazados', 'Pendiente más antiguo', 'Último comprobante', 'Verificado', 'Error de escaneo']
      const lines = all.map((r) =>
        [r.name, r.ruc, r.tenant_status, r.emitted, r.accepted, r.to_send, r.sent, r.rejected, r.oldest_open_at?.slice(0, 10), r.last_issue_at?.slice(0, 10), formatLima(r.scanned_at), r.scan_error]
          .map(cell)
          .join(',')
      )
      const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resumen-fiscal-tenants-${limaDate(new Date())}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar')
    } finally {
      setExporting(false)
    }
  }

  const totals = data?.totals
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <div>
          <span className="font-semibold">Comprobantes por tenant</span>
          <p className="text-xs text-slate-500">
            Emitidos desde el ERP de cada tenant vs. lo que falta enviar a SUNAT. Se actualiza cada ~15 min
            {data?.oldest_scan ? ` · verificación más antigua: ${agoText(data.oldest_scan)}` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting}
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
        >
          <FileSpreadsheet size={13} /> {exporting ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </CardHeader>

      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`px-3 py-1 text-xs rounded-full border ${
                preset === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPreset('all')
              setPage(1)
            }}
            className={`px-3 py-1 text-xs rounded-full border ${
              preset === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Todo el historial
          </button>
          <input
            type="date"
            aria-label="Desde"
            value={preset === 'all' ? '' : from}
            onChange={(e) => {
              setPreset('custom')
              setFrom(e.target.value)
              setPage(1)
            }}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
          />
          <span className="text-xs text-slate-400">a</span>
          <input
            type="date"
            aria-label="Hasta"
            value={preset === 'all' ? '' : to}
            onChange={(e) => {
              setPreset('custom')
              setTo(e.target.value)
              setPage(1)
            }}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Tipo:</span>
          {DOC_TYPES.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => toggleType(t.code)}
              aria-pressed={docTypes.includes(t.code)}
              className={`px-2.5 py-1 text-xs rounded-full border ${
                docTypes.includes(t.code) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
          {docTypes.length > 0 && (
            <button type="button" onClick={() => setDocTypes([])} className="text-xs text-slate-500 hover:underline">
              Todos
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
            <input
              className="pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg w-48"
              placeholder="RUC"
              inputMode="numeric"
              value={ruc}
              onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
            <input
              className="pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg w-56"
              placeholder="Nombre o slug del tenant"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <label className="text-xs flex items-center gap-1.5 text-slate-600">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => {
                setOnlyPending(e.target.checked)
                setPage(1)
              }}
            />
            Solo con pendientes por enviar
          </label>
          <label className="text-xs flex items-center gap-1.5 text-slate-600" title="Tenants con un comprobante sin enviar desde hace 3 días o más">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => {
                setStaleOnly(e.target.checked)
                setPage(1)
              }}
            />
            Solo atrasados (3+ días)
          </label>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort)
              setPage(1)
            }}
            aria-label="Ordenar por"
            className="ml-auto border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>

        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <Stat label="Emitidos" value={totals.emitted} />
            <Stat label="Aceptados" value={totals.accepted} tone="text-emerald-700" />
            <Stat label="Faltan enviar" value={totals.to_send} tone={totals.to_send > 0 ? 'text-red-600' : undefined} />
            <Stat label="En envío" value={totals.sent} tone="text-amber-600" />
            <Stat label="Rechazados" value={totals.rejected} />
            <Stat label="Tenants con pendientes" value={totals.with_to_send} />
            <Stat label="Con pendientes de 3+ días" value={totals.stale} tone={totals.stale > 0 ? 'text-red-600' : undefined} />
          </div>
        )}
        {totals && totals.scan_errors > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} /> {totals.scan_errors} tenant(s) no pudieron verificarse en el último escaneo; sus datos pueden estar atrasados.
          </p>
        )}
      </CardBody>

      <CardBody className={`overflow-x-auto p-0 transition-opacity ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="w-8" />
              {['Tenant', 'RUC', 'Emitidos', 'Aceptados', 'Faltan enviar', 'En envío', 'Rechazados', 'Pendiente más antiguo', 'Último comprobante', 'Verificado', ''].map((h, i) => (
                <th key={i} className={`px-3 py-2 font-medium ${i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => {
              const open = expanded.has(r.tenant_id)
              const age = ageDays(r.oldest_open_at)
              return (
                <FragmentRows key={r.tenant_id}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="pl-2">
                      <button type="button" aria-label={open ? 'Ocultar detalle' : 'Ver detalle por tipo'} onClick={() => toggleExpand(r.tenant_id)} className="text-slate-400 hover:text-slate-700">
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400">
                        {r.slug}
                        {r.tenant_status !== 'active' && <span className="ml-1 text-amber-600">· {r.tenant_status}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.ruc || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.emitted.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.accepted.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {r.to_send > 0 ? <Badge variant="red">{r.to_send.toLocaleString()}</Badge> : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sent || <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rejected || <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.oldest_open_at ? (
                        <span className={r.stale ? 'text-red-600 font-medium' : 'text-slate-600'}>
                          {r.oldest_open_at.slice(0, 10)}
                          {age !== null && ` (${age} d)`}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.last_issue_at ? r.last_issue_at.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.scan_error ? (
                        <span className="text-amber-700" title={r.scan_error}>
                          Error de escaneo
                        </span>
                      ) : (
                        <span className="text-slate-500">{agoText(r.scanned_at)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <a
                          href={`/fiscal?tenant=${encodeURIComponent(r.slug)}`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200"
                          title="Ver sus documentos en el facturador"
                        >
                          <ExternalLink size={12} /> Documentos
                        </a>
                        {r.open_to_send > 0 && r.tenant_status === 'active' && (
                          <button
                            type="button"
                            onClick={() => setResendTarget(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded hover:bg-amber-100"
                            title="Reenviar a SUNAT los comprobantes pendientes o con error de este tenant"
                          >
                            <Send size={12} /> Reenviar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => verifyNow(r)}
                          disabled={refreshing === r.tenant_id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={refreshing === r.tenant_id ? 'animate-spin' : ''} /> Verificar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={11} className="px-3 py-2">
                        {Object.keys(r.by_type).length === 0 ? (
                          <span className="text-xs text-slate-400">Sin comprobantes en el rango y tipos elegidos.</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(r.by_type)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([code, v]) => (
                                <span key={code} className="text-xs border border-slate-200 bg-white rounded-lg px-2.5 py-1">
                                  <b>{typeLabel(code)}</b>: {v.emitted.toLocaleString()} emitidos
                                  {v.to_send > 0 && <span className="text-red-600"> · {v.to_send.toLocaleString()} por enviar</span>}
                                </span>
                              ))}
                          </div>
                        )}
                        {r.open_to_send > 0 && (
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            En total (sin importar el rango) este tenant tiene {r.open_to_send.toLocaleString()} comprobante(s) pendientes o con error de envío.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRows>
              )
            })}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                  Ningún tenant coincide con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardBody>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm">
        <span className="text-slate-500">
          {data && data.total > 0 ? `Mostrando ${(data.page - 1) * data.per_page + 1}-${Math.min(data.page * data.per_page, data.total)} de ${data.total}` : 'Sin tenants'}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Por página
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>
      <Modal open={resendTarget !== null} onClose={() => !resending && setResendTarget(null)} title="Reenviar pendientes a SUNAT" maxWidth="max-w-md">
        {resendTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <b>{resendTarget.name}</b> tiene <b>{resendTarget.open_to_send.toLocaleString()}</b> comprobante(s) sin enviar o con error de envío.
              Se reenviarán los más antiguos primero, hasta <b>100</b> por vez, solo los creados hace más de 10 minutos.
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Antes de reenviar cada uno se consulta al facturador: si SUNAT ya lo aceptó solo se actualiza su estado, sin duplicarlo. Los
              rechazados por SUNAT y las notas de venta no se reenvían. Queda registrado en la auditoría.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResendTarget(null)} disabled={resending} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmResend} disabled={resending} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {resending ? 'Reenviando…' : 'Reenviar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}

// Fragmento con key para agrupar la fila principal y la fila de detalle dentro de <tbody>.
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
