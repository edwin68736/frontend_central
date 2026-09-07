import { downloadBlob } from '@/utils/downloadBlob'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Guarda un .xlsx generado con `writeXlsx` (hucre). */
export function downloadXlsxBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: XLSX_MIME })
  downloadBlob(blob, filename)
}
