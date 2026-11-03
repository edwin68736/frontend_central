import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { equiposProvider, type ProviderLocation } from '@/services/equiposProvider.service'
import { INPUT, LABEL } from './common'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export interface PlaceValue { department: string; province: string; district: string }

/**
 * Departamento → provincia → distrito con el catálogo de ubicaciones de Shalom. Todo sale de la BD: los
 * departamentos y, al elegir uno por primera vez, sus provincias y distritos se sincronizan una sola vez con Shalom.
 * Si la integración no está activa (o falla), muestra `fallback` (los campos de texto de siempre).
 */
export default function ShalomLocationSelects({ value, canonicalDepartments, onChange, fallback }: {
  value: PlaceValue
  canonicalDepartments: readonly string[]
  onChange: (v: PlaceValue) => void
  fallback: ReactNode
}) {
  const [deps, setDeps] = useState<ProviderLocation[] | null>(null)
  const [provsRaw, setProvs] = useState<ProviderLocation[]>([])
  const [distsRaw, setDists] = useState<ProviderLocation[]>([])
  const [failed, setFailed] = useState(false)
  const [loadedDep, setLoadedDep] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    equiposProvider.departments().then((r) => alive && setDeps(r)).catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [])

  const dep = useMemo(() => deps?.find((d) => fold(d.name) === fold(value.department)), [deps, value.department])
  // Las listas solo valen mientras haya departamento/provincia elegidos (se derivan, no se limpian en el efecto).
  const provs = useMemo(() => (dep ? provsRaw : []), [dep, provsRaw])
  const loading = !!dep && loadedDep !== dep.external_id
  const prov = useMemo(() => provs.find((p) => fold(p.name) === fold(value.province)), [provs, value.province])

  useEffect(() => {
    if (!dep) return
    let alive = true
    const id = dep.external_id
    equiposProvider.provinces(id)
      .then((r) => alive && setProvs(r))
      .catch(() => alive && setProvs([]))
      .finally(() => alive && setLoadedDep(id))
    return () => { alive = false }
  }, [dep])

  useEffect(() => {
    if (!dep || !prov) return
    let alive = true
    equiposProvider.districts(dep.external_id, prov.external_id).then((r) => alive && setDists(r)).catch(() => alive && setDists([]))
    return () => { alive = false }
  }, [dep, prov])

  const dists = dep && prov ? distsRaw : []

  if (failed) return <>{fallback}</>
  if (!deps) return <p className="col-span-2 text-xs text-slate-400">Cargando ubicaciones…</p>

  // Se guarda con el nombre canónico del sistema (Cusco, Áncash…) para que coincida con el catálogo de agencias.
  const canonical = (name: string) => canonicalDepartments.find((c) => fold(c) === fold(name)) ?? name

  return (
    <>
      <div>
        <label className={LABEL}>Departamento</label>
        <select value={dep?.name ?? ''} onChange={(e) => onChange({ department: e.target.value ? canonical(e.target.value) : '', province: '', district: '' })} className={INPUT}>
          <option value="">{value.department && !dep ? value.department : 'Elegir…'}</option>
          {deps.map((d) => <option key={d.id} value={d.name}>{canonical(d.name)}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Provincia</label>
        <select value={prov?.name ?? ''} disabled={!dep || loading} onChange={(e) => onChange({ department: value.department, province: e.target.value, district: '' })} className={INPUT}>
          <option value="">{loading ? 'Cargando…' : value.province && !prov ? value.province : 'Elegir…'}</option>
          {provs.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className={LABEL}>Distrito</label>
        <select value={dists.find((d) => fold(d.name) === fold(value.district))?.name ?? ''} disabled={!prov} onChange={(e) => onChange({ department: value.department, province: value.province, district: e.target.value })} className={INPUT}>
          <option value="">{value.district && !dists.some((d) => fold(d.name) === fold(value.district)) ? value.district : 'Elegir…'}</option>
          {dists.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </div>
    </>
  )
}
