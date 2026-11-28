'use client'

import { toast } from 'sonner'

/**
 * Archivos dentro de la app SIGOV (Android, WebView).
 *
 * El WebView no descarga los archivos que la web arma en el navegador
 * (`blob:` de jsPDF, Excel o ZIP): en la ronda 5 (TR-05) el usuario veía
 * «Listo» y la carpeta Descargas seguía vacía. Dentro de la app, cada
 * descarga pasa por el puente nativo `SigovApp`, queda en Descargas/SIGOV y
 * se avisa el nombre y la ruta, con «Abrir» y «Compartir».
 *
 * En el navegador de escritorio no cambia nada: descarga el navegador.
 */

type Puente = {
  iniciar(nombre: string, mime: string): string
  parte(id: string, base64: string): boolean
  terminar(id: string, modo: 'guardar' | 'abrir'): string
  abrir(uri: string, mime: string): void
  compartir(uri: string, mime: string): void
  abrirEnlace(url: string): void
}

function puente(): Puente | null {
  if (typeof window === 'undefined') return null
  return ((window as any).SigovApp as Puente) ?? null
}

export const enApp = () => !!puente()

const TROZO = 384 * 1024 // múltiplo de 3: cada trozo se codifica solo, sin relleno intermedio

function base64De(buf: Uint8Array): string {
  let bin = ''
  const paso = 0x8000
  for (let i = 0; i < buf.length; i += paso) bin += String.fromCharCode.apply(null, buf.subarray(i, i + paso) as any)
  return btoa(bin)
}

function nombreDeUrl(url: string, respaldo = 'SIGOV_archivo') {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || respaldo) } catch { return respaldo }
}

/**
 * Entrega un archivo al teléfono. `modo: 'guardar'` lo deja en
 * Descargas/SIGOV y avisa la ruta; `'abrir'` lo abre con la app que tenga el
 * teléfono (vista previa de un PDF). Devuelve false si no está en la app.
 */
export async function entregarArchivo(blob: Blob, nombre: string, modo: 'guardar' | 'abrir' = 'guardar'): Promise<boolean> {
  const p = puente()
  if (!p) return false
  const id = toast.loading(modo === 'guardar' ? `Guardando ${nombre}…` : `Abriendo ${nombre}…`)
  try {
    const sesion = p.iniciar(nombre, blob.type || '')
    if (!sesion) throw new Error('La app no aceptó el archivo')
    const datos = new Uint8Array(await blob.arrayBuffer())
    for (let i = 0; i < datos.length; i += TROZO) {
      if (!p.parte(sesion, base64De(datos.subarray(i, i + TROZO)))) throw new Error('Se interrumpió la copia del archivo')
    }
    const r = JSON.parse(p.terminar(sesion, modo) || '{}')
    if (!r.ok) throw new Error(r.error || 'No se pudo guardar el archivo')
    if (modo === 'guardar') {
      toast.success(`Guardado en ${r.ruta}`, {
        id,
        description: `${r.nombre} · ${(datos.length / 1024 / 1024).toFixed(datos.length > 1024 * 1024 ? 1 : 2)} MB. Ábrelo desde aquí o desde «Descargas» del teléfono.`,
        duration: 12000,
        action: { label: 'Abrir', onClick: () => p.abrir(r.uri, r.mime) },
        cancel: { label: 'Compartir', onClick: () => p.compartir(r.uri, r.mime) },
      })
    } else toast.dismiss(id)
    return true
  } catch (e: any) {
    toast.error('No se pudo guardar el archivo', {
      id,
      description: `${e?.message ?? e}. Vuelve a intentarlo; si persiste, descárgalo desde la web.`,
      action: { label: 'Reintentar', onClick: () => { void entregarArchivo(blob, nombre, modo) } },
    })
    return true
  }
}

async function blobDe(href: string): Promise<Blob> {
  const r = await fetch(href)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.blob()
}

let instalado = false

/**
 * Dentro de la app, desvía al puente nativo las descargas que hace la web
 * de cualquier forma: `<a download>` con `click()` (Excel, ZIP), jsPDF
 * `save()` (usa `dispatchEvent`), y `window.open` de un `blob:` (vista
 * previa de PDF) o de un enlace firmado (comprobantes, oficios).
 */
export function instalarPuenteArchivos() {
  const p = puente()
  if (!p || instalado || typeof window === 'undefined') return
  instalado = true

  // Atrás de Android: si hay un cuadro, menú o búsqueda abierta, lo cierra (Escape) y no sale de la página
  ;(window as any).__sigovAtras = () => {
    const abierto = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')
    if (!abierto) return false
    const ev = { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true } as KeyboardEventInit
    ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', ev))
    document.dispatchEvent(new KeyboardEvent('keydown', ev))
    return true
  }

  const desviar = (a: HTMLAnchorElement): boolean => {
    const href = a.href || ''
    const esLocal = href.startsWith('blob:') || href.startsWith('data:')
    if (!(a.hasAttribute('download') && (esLocal || href.startsWith('http')))) return false
    const nombre = a.getAttribute('download') || nombreDeUrl(href)
    blobDe(href).then((b) => entregarArchivo(b, nombre, 'guardar')).catch((e) =>
      toast.error('No se pudo preparar el archivo', { description: String(e?.message ?? e) }))
    return true
  }

  const clickOriginal = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (desviar(this)) return
    return clickOriginal.call(this)
  }
  const dispatchOriginal = HTMLAnchorElement.prototype.dispatchEvent
  HTMLAnchorElement.prototype.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) {
    if (ev.type === 'click' && desviar(this)) return false
    return dispatchOriginal.call(this, ev)
  }
  // Enlaces <a download> que el usuario pulsa directamente
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement | null)?.closest?.('a[download]') as HTMLAnchorElement | null
    if (a && desviar(a)) ev.preventDefault()
  }, true)

  const abrirOriginal = window.open.bind(window)
  window.open = ((url?: string | URL, target?: string, rasgos?: string) => {
    const u = url ? String(url) : ''
    if (u.startsWith('blob:') || u.startsWith('data:')) {
      blobDe(u).then((b) => {
        const ext = b.type === 'application/pdf' ? '.pdf' : b.type.startsWith('image/') ? '.' + b.type.split('/')[1] : ''
        return entregarArchivo(b, `SIGOV_vista_${Date.now()}${ext}`, 'abrir')
      }).catch((e) => toast.error('No se pudo abrir el archivo', { description: String(e?.message ?? e) }))
      return null
    }
    if (/^https?:/.test(u) && !u.startsWith(window.location.origin)) {
      p.abrirEnlace(u)
      return null
    }
    return abrirOriginal(url as any, target, rasgos)
  }) as typeof window.open
}
