import type { LabelAfter } from './encode'

/** Medidas del rótulo (mm). Ajustables por quien imprime; por defecto 10 × 10 cm. */
export interface LabelSize {
  width: number
  height: number
}
export const LABEL_SIZE_MIN = 40
export const LABEL_SIZE_MAX = 200
export const DEFAULT_LABEL_SIZE: LabelSize = { width: 100, height: 100 }
export const LABEL_SIZE_PRESETS: { label: string; size: LabelSize }[] = [
  { label: '10 × 10 cm', size: { width: 100, height: 100 } },
  { label: '10 × 15 cm', size: { width: 100, height: 150 } },
  { label: '10 × 6 cm', size: { width: 100, height: 60 } },
  { label: '12 × 6 cm', size: { width: 120, height: 60 } },
]

const SIZE_KEY = 'tukifac_central_label_size_v1'
const PRINTER_KEY = 'tukifac_central_label_printer_v1'

export const clampSize = (n: number): number => (Number.isFinite(n) ? Math.min(LABEL_SIZE_MAX, Math.max(LABEL_SIZE_MIN, Math.round(n * 10) / 10)) : LABEL_SIZE_MIN)

export function loadLabelSize(): LabelSize {
  try {
    const p = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null') as Partial<LabelSize> | null
    if (p && Number.isFinite(p.width) && Number.isFinite(p.height)) return { width: clampSize(Number(p.width)), height: clampSize(Number(p.height)) }
  } catch {
    /* sin almacenamiento: tamaño por defecto */
  }
  return { ...DEFAULT_LABEL_SIZE }
}

export function saveLabelSize(s: LabelSize): void {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width: clampSize(s.width), height: clampSize(s.height) }))
  } catch {
    /* no crítico */
  }
}

export type LabelLanguage = 'tspl' | 'escpos'

/** Impresora de rótulos elegida (se recuerda en este navegador). */
export interface LabelPrinterChoice {
  /** windows = impresora instalada en este equipo (USB incluido); network = IP de la impresora (puerto 9100). */
  connection: 'windows' | 'network'
  printerName: string
  tcpHost: string
  tcpPort: number
  /** tspl = impresora de etiquetas en modo etiqueta (Hoin, Xprinter, TSC…); escpos = ticketera (imagen). */
  language: LabelLanguage
  /** Solo TSPL: espacio entre etiquetas del rollo (mm). */
  rollGapMm: number
  /** Resolución: 8 = 203 dpi (la mayoría), 12 = 300 dpi. */
  dotsPerMm: number
  /** Solo ticketera: ancho del rollo y qué hacer al terminar cada etiqueta. */
  paperWidthMm: 58 | 80
  after: LabelAfter
  /** Margen de seguridad (mm): el rótulo se dibuja dentro de este margen para que los bordes no se pierdan. */
  marginMm: number
  /** Desplazamiento del dibujo (mm): + derecha / abajo, − izquierda / arriba. Corrige una etiqueta mal centrada. */
  offsetXMm: number
  offsetYMm: number
  /** Solo TSPL: oscuridad (0–15) y velocidad (1–10). */
  density: number
  speed: number
}

export const DEFAULT_LABEL_PRINTER: LabelPrinterChoice = {
  connection: 'windows', printerName: '', tcpHost: '', tcpPort: 9100, language: 'tspl', rollGapMm: 2, dotsPerMm: 8, paperWidthMm: 80, after: 'cut',
  marginMm: 2, offsetXMm: 0, offsetYMm: 0, density: 10, speed: 4,
}

const num = (v: unknown, min: number, max: number, def: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, Number(v))) : def)

export function loadLabelPrinter(): LabelPrinterChoice {
  try {
    const p = JSON.parse(localStorage.getItem(PRINTER_KEY) ?? 'null') as Partial<LabelPrinterChoice> | null
    if (!p) return { ...DEFAULT_LABEL_PRINTER }
    return {
      connection: p.connection === 'network' ? 'network' : 'windows',
      printerName: p.printerName ?? '',
      tcpHost: p.tcpHost ?? '',
      tcpPort: Number.isInteger(p.tcpPort) && Number(p.tcpPort) > 0 && Number(p.tcpPort) < 65536 ? Number(p.tcpPort) : 9100,
      language: p.language === 'escpos' ? 'escpos' : 'tspl',
      rollGapMm: Number.isFinite(p.rollGapMm) ? Math.min(10, Math.max(0, Number(p.rollGapMm))) : 2,
      dotsPerMm: p.dotsPerMm === 12 || p.dotsPerMm === 16 ? p.dotsPerMm : 8,
      paperWidthMm: p.paperWidthMm === 58 ? 58 : 80,
      after: (['cut', 'feed', 'gap', 'none'] as const).includes(p.after as LabelAfter) ? (p.after as LabelAfter) : 'cut',
      marginMm: num(p.marginMm, 0, 10, 2),
      offsetXMm: num(p.offsetXMm, -10, 10, 0),
      offsetYMm: num(p.offsetYMm, -10, 10, 0),
      density: Math.round(num(p.density, 0, 15, 10)),
      speed: Math.round(num(p.speed, 1, 10, 4)),
    }
  } catch {
    return { ...DEFAULT_LABEL_PRINTER }
  }
}

export function saveLabelPrinter(c: LabelPrinterChoice): void {
  try {
    localStorage.setItem(PRINTER_KEY, JSON.stringify(c))
  } catch {
    /* no crítico */
  }
}
