/**
 * Cliente del «Servidor de impresión Tukifac» (programa de Windows, repo `tukifac_print_server`) que escucha en 127.0.0.1 y
 * entrega bytes RAW (ESC/POS o TSPL) a la impresora. Es el mismo protocolo que usa el panel de Tukifac (frontend_tenant):
 * el servidor ya acepta los orígenes *.tukifac.com y localhost, así que el panel central solo necesita vincularse una vez.
 */
export const PRINT_SERVER_DEFAULT_PORT = 17891
const STORAGE_KEY = 'tukifac_print_server_v1'
export const PRINT_SERVER_CHANGED_EVENT = 'tukifac-print-server-changed'

type Stored = { port: number; token: string }

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Stored>
    if (typeof v.token !== 'string' || !v.token) return null
    const port = Number(v.port)
    return { port: Number.isInteger(port) && port > 0 && port < 65536 ? port : PRINT_SERVER_DEFAULT_PORT, token: v.token }
  } catch {
    return null
  }
}

function writeStored(value: Stored | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* sin almacenamiento: la vinculación no se podrá recordar */
  }
  window.dispatchEvent(new Event(PRINT_SERVER_CHANGED_EVENT))
}

/** ¿Este navegador ya está vinculado con un servidor de impresión? (no comprueba que esté encendido) */
export function isPrintServerPaired(): boolean {
  return readStored() !== null
}

function baseUrl(port?: number): string {
  return `http://127.0.0.1:${port ?? readStored()?.port ?? PRINT_SERVER_DEFAULT_PORT}`
}

async function request<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null; port?: number; timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15_000)
  try {
    const res = await fetch(`${baseUrl(init.port)}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T
    if (!res.ok || json.ok === false) {
      const err = new Error(json.error || `El servidor de impresión respondió ${res.status}`) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    return json
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('El servidor de impresión no respondió a tiempo')
    if (e instanceof TypeError) {
      throw new Error('No se pudo conectar con el servidor de impresión. Verifica que esté instalado y en ejecución en este equipo.')
    }
    throw e
  } finally {
    window.clearTimeout(timer)
  }
}

export type PrintServerStatus = { reachable: boolean; paired: boolean; version?: string }

/** Consulta el estado actual. Nunca lanza: devuelve reachable=false si no hay servidor. */
export async function getPrintServerStatus(port?: number): Promise<PrintServerStatus> {
  try {
    const s = readStored()
    const r = await request<{ paired?: boolean; version?: string }>('/health', { token: s?.token, port: port ?? s?.port, timeoutMs: 3_000 })
    return { reachable: true, paired: Boolean(r.paired), version: r.version }
  } catch (e) {
    // 403 = el servidor está, pero rechaza este origen.
    if ((e as { status?: number }).status === 403) return { reachable: true, paired: false }
    return { reachable: false, paired: false }
  }
}

/** Vincula este navegador. El servidor muestra un cuadro en Windows y espera a que el usuario acepte (hasta 2 minutos). */
export async function pairPrintServer(port: number = PRINT_SERVER_DEFAULT_PORT): Promise<void> {
  const r = await request<{ token: string }>('/pair', { method: 'POST', port, timeoutMs: 120_000 })
  writeStored({ port, token: r.token })
}

export function forgetPrintServer() {
  writeStored(null)
}

export async function listPrintServerPrinters(): Promise<string[]> {
  const s = readStored()
  if (!s) throw new Error('Este navegador no está vinculado con el servidor de impresión')
  const r = await request<{ printers?: string[] }>('/printers', { token: s.token, port: s.port })
  return Array.isArray(r.printers) ? r.printers : []
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/** Envía bytes RAW por el servidor (spooler de Windows o TCP). */
export async function printViaPrintServer(
  connection: 'windows' | 'network',
  cfg: { printerName?: string; tcpHost?: string; tcpPort?: number },
  data: Uint8Array,
  docName?: string,
): Promise<string> {
  const s = readStored()
  if (!s) throw new Error('Este navegador no está vinculado con el servidor de impresión')
  try {
    const r = await request<{ message?: string }>('/print', {
      method: 'POST',
      token: s.token,
      port: s.port,
      timeoutMs: 30_000,
      body: {
        mode: connection,
        printer_name: cfg.printerName ?? '',
        tcp_host: cfg.tcpHost ?? '',
        tcp_port: cfg.tcpPort ?? 9100,
        data_base64: uint8ToBase64(data),
        doc_name: docName ?? null,
      },
    })
    return r.message || 'Enviado a la impresora'
  } catch (e) {
    if ((e as { status?: number }).status === 401) {
      forgetPrintServer()
      throw new Error('El servidor de impresión pide vincular de nuevo: pulsa Conectar.')
    }
    throw e
  }
}
