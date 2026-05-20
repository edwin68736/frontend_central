import { useEffect, useState } from 'react'
import {
  ubigeoService,
  type UbiRegion,
  type UbiProvincia,
  type UbiDistrito,
} from '@/services/ubigeo.service'

export interface UbigeoSelectsProps {
  /** Código región (departamento) seleccionado */
  regionId: string
  /** Código provincia seleccionada */
  provinciaId: string
  /** Código distrito seleccionado (6 dígitos = ubigeo final) */
  distritoId: string
  onChange: (regionId: string, provinciaId: string, distritoId: string) => void
  /** Clase para los select */
  selectClassName?: string
  /** Deshabilitar selects */
  disabled?: boolean
}

export function UbigeoSelects({
  regionId,
  provinciaId,
  distritoId,
  onChange,
  selectClassName = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white',
  disabled = false,
}: UbigeoSelectsProps) {
  const [regiones, setRegiones] = useState<UbiRegion[]>([])
  const [provincias, setProvincias] = useState<UbiProvincia[]>([])
  const [distritos, setDistritos] = useState<UbiDistrito[]>([])
  const [loadingRegiones, setLoadingRegiones] = useState(true)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingDistritos, setLoadingDistritos] = useState(false)

  useEffect(() => {
    ubigeoService.getRegiones().then((list) => {
      setRegiones(list)
      setLoadingRegiones(false)
    })
  }, [])

  useEffect(() => {
    if (!regionId) {
      setProvincias([])
      setDistritos([])
      return
    }
    setLoadingProvincias(true)
    ubigeoService.getProvincias(regionId).then((list) => {
      setProvincias(list)
      setDistritos([])
      setLoadingProvincias(false)
    })
  }, [regionId])

  useEffect(() => {
    if (!provinciaId) {
      setDistritos([])
      return
    }
    setLoadingDistritos(true)
    ubigeoService.getDistritos(provinciaId).then((list) => {
      setDistritos(list)
      setLoadingDistritos(false)
    })
  }, [provinciaId])

  const handleRegionChange = (v: string) => {
    onChange(v, '', '')
  }
  const handleProvinciaChange = (v: string) => {
    onChange(regionId, v, '')
  }
  const handleDistritoChange = (v: string) => {
    onChange(regionId, provinciaId, v)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Departamento</label>
        <select
          value={regionId}
          onChange={(e) => handleRegionChange(e.target.value)}
          className={selectClassName}
          disabled={disabled || loadingRegiones}
        >
          <option value="">Seleccione</option>
          {regiones.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Provincia</label>
        <select
          value={provinciaId}
          onChange={(e) => handleProvinciaChange(e.target.value)}
          className={selectClassName}
          disabled={disabled || !regionId || loadingProvincias}
        >
          <option value="">Seleccione</option>
          {provincias.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Distrito</label>
        <select
          value={distritoId}
          onChange={(e) => handleDistritoChange(e.target.value)}
          className={selectClassName}
          disabled={disabled || !provinciaId || loadingDistritos}
        >
          <option value="">Seleccione</option>
          {distritos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Parsea ubigeo (6 dígitos) en region_id (2 dígitos + 0000), provincia_id (4 + 00), distrito_id (6). */
export function ubigeoToIds(ubigeo: string): { regionId: string; provinciaId: string; distritoId: string } {
  if (!ubigeo || ubigeo.length < 6) return { regionId: '', provinciaId: '', distritoId: ubigeo || '' }
  return {
    regionId: ubigeo.slice(0, 2) + '0000',
    provinciaId: ubigeo.slice(0, 4) + '00',
    distritoId: ubigeo,
  }
}
