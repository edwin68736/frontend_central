/** Codifica un archivo binario (.pfx, .p12, etc.) en base64 estándar para el API. */
export function fileToBase64Binary(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const buf = reader.result
      if (!(buf instanceof ArrayBuffer)) {
        reject(new Error('No se pudo leer el archivo'))
        return
      }
      const bytes = new Uint8Array(buf)
      let binary = ''
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const slice = bytes.subarray(i, i + chunkSize)
        binary += String.fromCharCode(...slice)
      }
      resolve(btoa(binary))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error leyendo archivo'))
    reader.readAsArrayBuffer(file)
  })
}

/** Codifica texto/PEM en base64 (UTF-8). */
export function fileToBase64Text(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      resolve(btoa(text))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error leyendo archivo'))
    reader.readAsText(file)
  })
}
