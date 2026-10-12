import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { readXlsx } from 'hucre'
import { Check, MapPin, Pencil, Plus, Search, Star, Upload } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  equiposService, type AgencyImportResult, type AgencyImportRow, type AgencyLocationStatus, type EquipAgency,
  type EquipAgencyInput, type EquipCarrier, type EquipCarrierInput,
} from '@/services/equipos.service'
import { ubigeoService, type UbiDistrito, type UbiProvincia, type UbiRegion } from '@/services/ubigeo.service'
import { apiError, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './common'

const PAGE = 50
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const STATUS_STYLE: Record<AgencyLocationStatus, string> = {
  confirmada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sugerida: 'bg-amber-50 text-amber-700 border-amber-200',
  pendiente: 'bg-slate-100 text-slate-600 border-slate-200',
}
const STATUS_LABEL: Record<AgencyLocationStatus, string> = { confirmada: 'Confirmada', sugerida: 'Por revisar', pendiente: 'Sin ubicación' }

function StatusBadge({ s }: { s: AgencyLocationStatus }) {
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[s]}`}>{STATUS_LABEL[s]}</span>
}

const place = (a: { department: string; province: string; district: string }) =>
  [a.district, a.province, a.department].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ')

// ── Lectura del Excel ───────────────────────────────────────────────────────

const cellText = (v: unknown): string => (v == null ? '' : String(v).trim())

/**
 * Busca en el libro la hoja con las agencias. Acepta dos formatos:
 *  - con encabezados (código, nombre/agencia, departamento, provincia, distrito, dirección);
 *  - sin encabezados, como el «Formato Pro Masivo» de Shalom: columna A = código numérico, columna B = nombre.
 * Si hay varias hojas candidatas gana la que trae más agencias.
 */
function readAgencyRows(sheets: { name: string; rows?: unknown[][] }[]): AgencyImportRow[] {
  let best: AgencyImportRow[] = []
  for (const sh of sheets) {
    const rows = (sh.rows ?? []) as unknown[][]
    let found: AgencyImportRow[] = []
    const headerAt = rows.slice(0, 5).findIndex((r) => r.some((c) => /^(nombre|agencia|sucursal)/.test(fold(cellText(c)))))
    if (headerAt >= 0) {
      const h = rows[headerAt].map((c) => fold(cellText(c)))
      const col = (re: RegExp) => h.findIndex((x) => re.test(x))
      const iName = col(/^(nombre|agencia|sucursal)/), iCode = col(/^(cod|id)/), iDep = col(/^depart/), iProv = col(/^provin/), iDist = col(/^distrit/), iAddr = col(/^(direc|domic)/)
      found = rows.slice(headerAt + 1).map((r) => ({
        code: iCode >= 0 ? cellText(r[iCode]) : '', name: cellText(r[iName]), department: iDep >= 0 ? cellText(r[iDep]) : '',
        province: iProv >= 0 ? cellText(r[iProv]) : '', district: iDist >= 0 ? cellText(r[iDist]) : '', address: iAddr >= 0 ? cellText(r[iAddr]) : '',
      })).filter((r) => r.name)
    } else {
      found = rows
        .filter((r) => /^\d+$/.test(cellText(r[0])) && cellText(r[1]) && !/^\d+$/.test(cellText(r[1])))
        .map((r) => ({ code: cellText(r[0]), name: cellText(r[1]) }))
    }
    if (found.length > best.length) best = found
  }
  return best
}

// ── Selector de ubicación (departamento → provincia → distrito) ────────────

interface Loc { department: string; province: string; district: string; ubigeo: string }

function UbigeoPicker({ value, onChange }: { value: Loc; onChange: (l: Loc) => void }) {
  const [regions, setRegions] = useState<UbiRegion[]>([])
  const [provs, setProvs] = useState<UbiProvincia[]>([])
  const [dists, setDists] = useState<UbiDistrito[]>([])
  const reg = regions.find((r) => fold(r.nombre) === fold(value.department))
  const provList = provs.filter((p) => p.region_id === reg?.id)
  const prov = provList.find((p) => fold(p.nombre) === fold(value.province))
  const distList = dists.filter((d) => d.provincia_id === prov?.id)

  useEffect(() => { void ubigeoService.getRegiones().then(setRegions).catch(() => setRegions([])) }, [])
  useEffect(() => {
    if (!reg) return
    void ubigeoService.getProvincias(reg.id).then(setProvs).catch(() => setProvs([]))
  }, [reg?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!prov) return
    void ubigeoService.getDistritos(prov.id).then(setDists).catch(() => setDists([]))
  }, [prov?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className={LABEL}>Departamento</label>
        <select value={reg?.id ?? ''} onChange={(e) => onChange({ department: regions.find((r) => r.id === e.target.value)?.nombre ?? '', province: '', district: '', ubigeo: '' })} className={INPUT}>
          <option value="">Sin definir</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Provincia</label>
        <select value={prov?.id ?? ''} disabled={!reg} onChange={(e) => onChange({ ...value, province: provList.find((p) => p.id === e.target.value)?.nombre ?? '', district: '', ubigeo: '' })} className={INPUT}>
          <option value="">—</option>
          {provList.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Distrito</label>
        <select value={distList.find((d) => fold(d.nombre) === fold(value.district))?.id ?? ''} disabled={!prov}
          onChange={(e) => { const d = distList.find((x) => x.id === e.target.value); onChange({ ...value, district: d?.nombre ?? '', ubigeo: d?.id ?? '' }) }} className={INPUT}>
          <option value="">—</option>
          {distList.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </div>
    </div>
  )
}

// ── Modal principal ────────────────────────────────────────────────────────

interface Props {
  carrier: EquipCarrier | null
  onClose: () => void
  /** Se llama cuando cambian las agencias o el origen por defecto (para refrescar los transportistas). */
  onChanged: () => void
}

const EMPTY: EquipAgencyInput = { code: '', name: '', department: '', province: '', district: '', ubigeo: '', address: '', active: true }

const toInput = (a: EquipAgency): EquipAgencyInput => ({
  code: a.code, name: a.name, department: a.department, province: a.province, district: a.district, ubigeo: a.ubigeo, address: a.address, active: a.active,
})

export default function AgenciesModal({ carrier, onClose, onChanged }: Props) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('equipos.carriers')
  const [rows, setRows] = useState<EquipAgency[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [dep, setDep] = useState('')
  const [status, setStatus] = useState<'' | AgencyLocationStatus>('')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<{ open: boolean; id?: number; data: EquipAgencyInput }>({ open: false, data: EMPTY })
  const [saving, setSaving] = useState(false)
  const [originId, setOriginId] = useState<number | null>(null)
  const [imp, setImp] = useState<{ rows: AgencyImportRow[]; fileName: string; preview: AgencyImportResult } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const carrierId = carrier?.id
  const load = useCallback(async () => {
    if (!carrierId) return
    setLoading(true)
    try {
      setRows(await equiposService.listAgencies(carrierId, true))
    } catch (e) {
      toast.error(apiError(e, 'No se pudieron cargar las agencias'))
    } finally {
      setLoading(false)
    }
  }, [carrierId])

  // Solo al abrir otro transportista se reinicia la pantalla; refrescar el transportista no debe cerrar el formulario.
  useEffect(() => {
    setQ(''); setDep(''); setStatus(''); setPage(1); setImp(null); setRows([]); setForm((f) => ({ ...f, open: false }))
    if (carrierId) void load()
  }, [carrierId, load])
  useEffect(() => setOriginId(carrier?.default_origin_agency_id ?? null), [carrier?.default_origin_agency_id])

  const counts = useMemo(() => ({
    total: rows.length,
    sugerida: rows.filter((r) => r.location_status === 'sugerida').length,
    pendiente: rows.filter((r) => r.location_status === 'pendiente').length,
  }), [rows])
  const departments = useMemo(() => [...new Set(rows.map((r) => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [rows])
  const filtered = useMemo(() => {
    const n = fold(q)
    return rows.filter((r) =>
      (!dep || (dep === '__none__' ? !r.department : r.department === dep)) &&
      (!status || r.location_status === status) &&
      (!n || fold(`${r.name} ${r.code} ${r.address} ${r.district} ${r.province}`).includes(n)))
  }, [rows, q, dep, status])
  useEffect(() => setPage(1), [q, dep, status])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE)

  const save = async () => {
    if (!carrier) return
    const d = form.data
    if (!d.name.trim()) return toast.error('Indica el nombre de la agencia')
    setSaving(true)
    try {
      if (form.id) await equiposService.updateAgency(form.id, d)
      else await equiposService.createAgency(carrier.id, d)
      toast.success('Agencia guardada')
      setForm((f) => ({ ...f, open: false }))
      await load()
      onChanged()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar la agencia'))
    } finally {
      setSaving(false)
    }
  }

  // Confirmar una ubicación sugerida tal como está.
  const confirmLocation = async (a: EquipAgency) => {
    try {
      await equiposService.updateAgency(a.id, toInput(a))
      setRows((cur) => cur.map((r) => (r.id === a.id ? { ...r, location_status: 'confirmada' } : r)))
    } catch (e) {
      toast.error(apiError(e, 'No se pudo confirmar la ubicación'))
    }
  }

  const setOrigin = async (a: EquipAgency | null) => {
    if (!carrier) return
    const body: EquipCarrierInput = {
      code: carrier.code, name: carrier.name, dispatch_days: carrier.dispatch_days, pickup_days: carrier.pickup_days, guide_label: carrier.guide_label,
      guide_format: carrier.guide_format, tracking_url_template: carrier.tracking_url_template, label_template: carrier.label_template,
      is_default: carrier.is_default, active: carrier.active, sort_order: carrier.sort_order, default_origin_agency_id: a?.id ?? null,
    }
    try {
      await equiposService.updateCarrier(carrier.id, body)
      setOriginId(a?.id ?? null)
      toast.success(a ? `Origen por defecto: ${a.name}` : 'Se quitó el origen por defecto')
      onChanged()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo cambiar el origen'))
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file || !carrier) return
    try {
      const wb = await readXlsx(new Uint8Array(await file.arrayBuffer()))
      const parsed = readAgencyRows(wb.sheets as { name: string; rows?: unknown[][] }[])
      if (parsed.length === 0) return toast.error('No se encontraron agencias en el archivo. Se espera código y nombre en las columnas A y B, o encabezados «Código», «Nombre»…')
      const preview = await equiposService.importAgencies(carrier.id, parsed, false)
      setImp({ rows: parsed, fileName: file.name, preview })
    } catch (e) {
      toast.error(apiError(e, 'No se pudo leer el archivo'))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const commitImport = async () => {
    if (!carrier || !imp) return
    setImporting(true)
    try {
      const r = await equiposService.importAgencies(carrier.id, imp.rows, true)
      toast.success(`Importadas: ${r.created} nuevas, ${r.updated} actualizadas`)
      setImp(null)
      await load()
      onChanged()
    } catch (e) {
      toast.error(apiError(e, 'No se pudo importar'))
    } finally {
      setImporting(false)
    }
  }

  const openForm = (a?: EquipAgency) => setForm({ open: true, id: a?.id, data: a ? toInput(a) : EMPTY })
  const setData = (patch: Partial<EquipAgencyInput>) => setForm((f) => ({ ...f, data: { ...f.data, ...patch } }))

  return (
    <Modal open={!!carrier} onClose={onClose} title={carrier ? `Agencias de ${carrier.name}` : 'Agencias'} maxWidth="max-w-5xl">
      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <p className="text-sm text-slate-500">
              {counts.total} agencias
              {counts.sugerida > 0 && <> · <button type="button" className="text-amber-700 underline" onClick={() => setStatus('sugerida')}>{counts.sugerida} por revisar</button></>}
              {counts.pendiente > 0 && <> · <button type="button" className="text-slate-600 underline" onClick={() => setStatus('pendiente')}>{counts.pendiente} sin ubicación</button></>}
            </p>
            {canEdit && (
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
                <button type="button" className={BTN_SECONDARY} onClick={() => fileRef.current?.click()}><Upload size={13} /> Importar Excel</button>
                <button type="button" className={BTN_PRIMARY} onClick={() => openForm()}><Plus size={14} /> Nueva agencia</button>
              </div>
            )}
          </div>

          {imp && (
            <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-indigo-900">Vista previa de «{imp.fileName}»</p>
              <p className="text-sm text-indigo-900">
                {imp.preview.total} agencias: {imp.preview.created} nuevas, {imp.preview.updated} por actualizar, {imp.preview.unchanged} sin cambios.
                Ubicación: <b>{imp.preview.confirmed}</b> confirmadas, <b>{imp.preview.suggested}</b> sugeridas (por revisar), <b>{imp.preview.pending}</b> sin ubicación.
              </p>
              {(imp.preview.warnings ?? []).map((w) => <p key={w} className="text-xs text-amber-800">{w}</p>)}
              {imp.preview.duplicate > 0 && <p className="text-xs text-slate-600">{imp.preview.duplicate} nombres repetidos en el archivo se ignoraron.</p>}
              <p className="text-xs text-slate-600">La ubicación se infiere del nombre; lo marcado «por revisar» o «sin ubicación» lo puedes corregir después, una por una. Lo que ya confirmaste a mano no se toca.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={() => setImp(null)}>Cancelar</button>
                <button type="button" className={BTN_PRIMARY} disabled={importing} onClick={() => void commitImport()}>{importing ? 'Importando…' : 'Importar'}</button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar agencia, código, distrito…" className={INPUT + ' pl-9'} />
            </div>
            <select value={dep} onChange={(e) => setDep(e.target.value)} className={INPUT + ' !w-auto'} aria-label="Departamento">
              <option value="">Todos los departamentos</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="__none__">(Sin departamento)</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as '' | AgencyLocationStatus)} className={INPUT + ' !w-auto'} aria-label="Estado de ubicación">
              <option value="">Toda ubicación</option>
              <option value="confirmada">Confirmadas</option>
              <option value="sugerida">Por revisar</option>
              <option value="pendiente">Sin ubicación</option>
            </select>
          </div>

          <div className="overflow-auto max-h-[52vh] border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                <tr><th className="text-left px-3 py-2">Cód.</th><th className="text-left px-3 py-2">Agencia</th><th className="text-left px-3 py-2">Ubicación</th><th className="text-left px-3 py-2">Estado</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((a) => (
                  <tr key={a.id} className={a.active ? '' : 'opacity-50'}>
                    <td className="px-3 py-2 text-slate-400">{a.code || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-800">{a.name}</span>
                      {originId === a.id && <span className="ml-2 text-[11px] text-indigo-600 font-medium">Origen por defecto</span>}
                      {a.address && <span className="block text-xs text-slate-400">{a.address}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{place(a) || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2"><StatusBadge s={a.location_status} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canEdit && (
                        <>
                          {a.location_status === 'sugerida' && <button type="button" title="Confirmar la ubicación sugerida" aria-label="Confirmar ubicación" onClick={() => void confirmLocation(a)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={15} /></button>}
                          <button type="button" title={originId === a.id ? 'Quitar como origen por defecto' : 'Usar como origen por defecto (donde entregas los paquetes)'} aria-label="Origen por defecto" onClick={() => void setOrigin(originId === a.id ? null : a)} className={`p-1.5 rounded hover:bg-slate-100 ${originId === a.id ? 'text-indigo-600' : 'text-slate-300'}`}><Star size={15} fill={originId === a.id ? 'currentColor' : 'none'} /></button>
                          <button type="button" aria-label="Editar agencia" onClick={() => openForm(a)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"><Pencil size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-slate-400 py-10">
                    {rows.length === 0 ? 'Este transportista aún no tiene agencias. Impórtalas desde un Excel o agrégalas una por una.' : 'Ninguna agencia coincide con el filtro.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{filtered.length} resultados · página {page} de {pages}</span>
              <div className="flex gap-2">
                <button type="button" className={BTN_SECONDARY} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                <button type="button" className={BTN_SECONDARY} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={12} /> La estrella marca dónde entregas normalmente los paquetes: se propone como origen en cada envío.</p>
        </div>
      )}

      <Modal open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} title={form.id ? 'Editar agencia' : 'Nueva agencia'} maxWidth="max-w-2xl">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={LABEL}>Nombre *</label><input value={form.data.name} onChange={(e) => setData({ name: e.target.value })} className={INPUT} /></div>
            <div><label className={LABEL}>Código</label><input value={form.data.code} onChange={(e) => setData({ code: e.target.value })} className={INPUT} /></div>
          </div>
          <UbigeoPicker value={form.data} onChange={(l) => setData(l)} />
          <div><label className={LABEL}>Dirección (opcional)</label><input value={form.data.address} onChange={(e) => setData({ address: e.target.value })} placeholder="Av. Ejército 123" className={INPUT} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.data.active} onChange={(e) => setData({ active: e.target.checked })} className="rounded" /> Activa</label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setForm((f) => ({ ...f, open: false }))}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </Modal>
    </Modal>
  )
}
