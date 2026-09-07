import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { writeXlsx, type CellValue } from 'hucre'

export interface ExportColumn<T = Record<string, unknown>> {
  key: keyof T | string
  label: string
  format?: (val: unknown, row: T) => string | number
  /** Si true, Excel recibe el valor numérico en bruto (útil para columnas numéricas). */
  excelNumber?: boolean
}

/** Mismo patrón que frontend_tenant/src/utils/exportExcel.ts, portado para el panel central. */
export async function exportTableToExcel<T extends object>(
  sheetName: string,
  columns: ExportColumn<T>[],
  data: T[],
  filename?: string,
): Promise<void> {
  const headers: CellValue[] = columns.map(c => c.label)
  const body: CellValue[][] = data.map(row =>
    columns.map(col => {
      const raw = row[col.key as keyof T]
      if (col.excelNumber) {
        const n = Number(raw)
        return Number.isFinite(n) ? n : ''
      }
      if (col.format) return col.format(raw, row) as CellValue
      return raw != null ? String(raw) : ''
    })
  )
  const rows: CellValue[][] = [headers, ...body]
  const bytes = await writeXlsx({
    sheets: [{ name: sheetName.slice(0, 31), rows }],
  })
  downloadXlsxBytes(bytes, filename ?? `${sheetName.replace(/\s+/g, '-')}.xlsx`)
}
