import { describe, expect, it } from 'vitest'
import { afterLabelBytes, rgbaToEscPosRaster, tsplCalibrateCommand, tsplLabelCommand } from './encode'
import { clampSize, DEFAULT_LABEL_SIZE, loadLabelSize } from './settings'
import { printerConfigError, printerFitError } from './print'
import { DEFAULT_LABEL_PRINTER } from './settings'
import { fitText, wrapText, type Pen } from '@/pages/equipos/shippingLabel'

/** Pen de prueba: cada carácter mide size*0.2 mm. */
const pen: Pen = { text() {}, rect() {}, line() {}, width: (s, o) => s.length * o.size * 0.2 }

describe('encode', () => {
  it('ESC/POS: GS v 0 centrado y en franjas', () => {
    const rgba = new Uint8ClampedArray(8 * 2 * 4).fill(255)
    rgba[0] = rgba[1] = rgba[2] = 0
    const out = rgbaToEscPosRaster(rgba, 8, 2, 16)
    expect(Array.from(out.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 2, 0])
    expect(out[8]).toBe(0b00001000)
    expect(() => rgbaToEscPosRaster(new Uint8ClampedArray(32 * 4 * 4), 32, 4, 16)).toThrow()
  })

  it('TSPL: SIZE con las medidas elegidas, BITMAP con tinta en 0 y PRINT', () => {
    const rgba = new Uint8ClampedArray(8 * 1 * 4).fill(255)
    rgba[0] = rgba[1] = rgba[2] = 0 // primer punto negro
    const out = tsplLabelCommand(rgba, 8, 1, 100, 100, 2)
    const text = new TextDecoder('latin1').decode(out)
    const prefix = 'SIZE 100 mm,100 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 0\r\nREFERENCE 0,0\r\nSHIFT 0\r\nCLS\r\nBITMAP 0,0,1,1,0,'
    expect(text.startsWith(prefix)).toBe(true)
    expect(text.endsWith('\r\nPRINT 1,1\r\n')).toBe(true)
    const head = prefix.length
    expect(out[head]).toBe(0b01111111)
  })

  it('TSPL: densidad, velocidad, referencia y calibración del sensor', () => {
    const rgba = new Uint8ClampedArray(8 * 4).fill(255)
    const text = new TextDecoder('latin1').decode(tsplLabelCommand(rgba, 8, 1, 100, 100, 3, 160, { density: 12, speed: 3 }))
    expect(text.startsWith('SPEED 3\r\nDENSITY 12\r\nSIZE 100 mm,100 mm\r\nGAP 3 mm,0 mm\r\nDIRECTION 0\r\nREFERENCE 0,0\r\nSHIFT 0\r\nCLS\r\nBITMAP')).toBe(true)
    expect(new TextDecoder().decode(tsplCalibrateCommand(100, 100, 3))).toBe('SIZE 100 mm,100 mm\r\nGAP 3 mm,0 mm\r\nGAPDETECT\r\n')
  })

  it('comandos tras cada etiqueta', () => {
    expect(afterLabelBytes('cut')).toEqual([0x1d, 0x56, 0x41, 0x10])
    expect(afterLabelBytes('none')).toEqual([])
  })
})

describe('tamaño y validación de impresora', () => {
  it('por defecto 10 × 10 cm y el tamaño se limita a 40–200 mm', () => {
    expect(DEFAULT_LABEL_SIZE).toEqual({ width: 100, height: 100 })
    expect(loadLabelSize()).toEqual({ width: 100, height: 100 })
    expect(clampSize(10)).toBe(40)
    expect(clampSize(500)).toBe(200)
    expect(clampSize(NaN)).toBe(40)
  })

  it('una ticketera de 80 mm no admite un rótulo de 100 mm; TSPL sí', () => {
    expect(printerFitError({ width: 100, height: 100 }, { ...DEFAULT_LABEL_PRINTER, language: 'escpos' })).toMatch(/imprime hasta 72 mm/)
    expect(printerFitError({ width: 100, height: 100 }, { ...DEFAULT_LABEL_PRINTER, language: 'tspl' })).toBeNull()
    expect(printerConfigError({ ...DEFAULT_LABEL_PRINTER })).toMatch(/Elige la impresora/)
    expect(printerConfigError({ ...DEFAULT_LABEL_PRINTER, printerName: 'XP-460B' })).toBeNull()
  })
})

describe('ajuste de texto del rótulo', () => {
  it('parte por palabras y corta las palabras más largas que el ancho', () => {
    expect(wrapText(pen, 'AAA BBB CCC', 7, { size: 10 })).toEqual(['AAA', 'BBB', 'CCC']) // 3 letras = 6 mm
    expect(wrapText(pen, 'ABCDEFGH', 4, { size: 10 })).toEqual(['AB', 'CD', 'EF', 'GH'])
  })

  it('reduce el cuerpo para caber y corta con «…» al llegar al mínimo', () => {
    const roomy = fitText(pen, 'HOLA MUNDO', 30, 20, 10, 5)
    expect(roomy.size).toBe(10)
    const tight = fitText(pen, 'UNA DIRECCION MUY LARGA QUE NO CABE EN UNA SOLA LINEA DEL ROTULO', 12, 6, 10, 5)
    expect(tight.size).toBeLessThan(10)
    expect(tight.height).toBeLessThanOrEqual(6.01)
    const cut = fitText(pen, 'a '.repeat(200), 12, 4, 10, 5)
    expect(cut.lines[cut.lines.length - 1].endsWith('…')).toBe(true)
  })
})
