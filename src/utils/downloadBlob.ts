/**
 * Descarga un blob en el navegador. A diferencia del mismo helper en frontend_tenant, no hay
 * rama Capacitor/Android — el panel central es solo web.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}
