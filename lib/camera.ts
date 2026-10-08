'use client'

import { sha256, fmtProgresiva } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// SIGOV · Captura de evidencia georreferenciada
//
// Requisito de la propuesta: "cada fotografía cuenta con GPS, fecha y marca
// de agua, y los datos de ubicación quedan protegidos contra edición".
//
// El sellado ocurre en el cliente, ANTES de guardar: los datos se queman en
// el pixel. En el servidor un trigger impide editar lat/lng/fecha/hash.
// ═══════════════════════════════════════════════════════════════════════════

export interface GpsFix {
  lat: number
  lng: number
  accuracy: number
  altitude: number | null
  heading: number | null
  timestamp: number
}

export const MAX_ACCURACY_M = 50

export function getGpsFix(options?: PositionOptions): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Este dispositivo no expone GPS al navegador'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        }),
      (err) => reject(new Error(gpsErrorMessage(err))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options }
    )
  })
}

/** Observa la posición y devuelve la mejor lectura conseguida */
export function watchGps(onFix: (fix: GpsFix) => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => {}
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        heading: pos.coords.heading,
        timestamp: pos.timestamp,
      }),
    () => {},
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 }
  )
  return () => navigator.geolocation.clearWatch(id)
}

function gpsErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Permiso de ubicación denegado. Habilítalo para poder registrar evidencia.'
    case err.POSITION_UNAVAILABLE:
      return 'No se pudo obtener la ubicación. Sal a cielo abierto e inténtalo de nuevo.'
    case err.TIMEOUT:
      return 'La búsqueda de señal GPS tardó demasiado.'
    default:
      return 'Error al obtener la ubicación.'
  }
}

// ─── Marca de agua ────────────────────────────────────────────────────────
/** Qué se imprime sobre la foto: lo fija el contrato (ajustes_del_servicio). */
export interface Sello {
  activo?: boolean
  fecha?: boolean
  hora?: boolean
  geo?: boolean
  precision?: boolean
  tramo?: boolean
  progresiva?: boolean
  actividad?: boolean
  pci?: boolean
  cuadrilla?: boolean
  marca?: boolean
}

/** Solo fecha y hora: lo que pidió COVINCA (reunión con Elvis, 05-10-2026). */
export const SELLO_POR_OMISION: Sello = {
  activo: true, fecha: true, hora: true,
  geo: false, precision: false, tramo: false, progresiva: false,
  actividad: false, pci: false, cuadrilla: false, marca: false,
}

export interface WatermarkData {
  servicio: string
  /** Qué imprimir; sin él, el sello por omisión. */
  sello?: Sello
  pci?: string | null
  /** La fecha y hora editadas del sello, si las hay. */
  stampedAt?: Date | null
  cuadrilla?: string | null
  actividad?: string | null
  tramo?: string | null
  progresivaM?: number | null
  fase?: string
  gps: GpsFix
  takenAt: Date
  usuario?: string
}

export interface SealedPhoto {
  blob: Blob
  thumb: Blob
  sha256: string
  width: number
  height: number
  takenAt: Date
  gps: GpsFix
}

const MAX_EDGE = 1600
const MIN_EDGE = 640      // por debajo de esto la marca de agua no es legible
const THUMB_EDGE = 360

/**
 * Redimensiona, quema la marca de agua y calcula el hash de integridad.
 * Devuelve la foto sellada lista para la cola de sincronización.
 */
export async function sealPhoto(source: Blob | HTMLVideoElement, data: WatermarkData): Promise<SealedPhoto> {
  const bitmap =
    source instanceof Blob
      ? await createImageBitmap(source)
      : await createImageBitmap(source as any)

  // Se reduce lo grande y se amplia lo diminuto: la marca de agua necesita un
  // lienzo minimo para ser legible y para que el texto tenga tamano valido.
  const maxSide = Math.max(bitmap.width, bitmap.height) || 1
  const scale = maxSide > MAX_EDGE
    ? MAX_EDGE / maxSide
    : maxSide < MIN_EDGE
      ? MIN_EDGE / maxSide
      : 1
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  drawWatermark(ctx, w, h, data)

  const blob = await toBlobSafe(canvas, 'image/webp', 0.82)

  // Miniatura para listados y para el mapa
  const tScale = THUMB_EDGE / Math.max(w, h)
  const tCanvas = document.createElement('canvas')
  tCanvas.width = Math.round(w * tScale)
  tCanvas.height = Math.round(h * tScale)
  tCanvas.getContext('2d')!.drawImage(canvas, 0, 0, tCanvas.width, tCanvas.height)
  const thumb = await toBlobSafe(tCanvas, 'image/webp', 0.7)

  return {
    blob,
    thumb,
    sha256: await sha256(blob),
    width: w,
    height: h,
    takenAt: data.takenAt,
    gps: data.gps,
  }
}

/**
 * `toBlob` puede devolver null si el formato no esta soportado. Se reintenta en
 * PNG y, como ultimo recurso, se falla explicitamente en vez de quedar colgado.
 */
async function toBlobSafe(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  const attempt = (t: string, q?: number) =>
    new Promise<Blob | null>((res) => {
      try {
        canvas.toBlob((b) => res(b), t, q)
      } catch {
        res(null)
      }
    })

  const timeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<T | null>((res) => setTimeout(() => res(null), ms))])

  const webp = await timeout(attempt(type, quality), 15000)
  if (webp) return webp
  const png = await timeout(attempt('image/png'), 15000)
  if (png) return png
  throw new Error('El navegador no pudo convertir la imagen')
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: WatermarkData
) {
  // El sello como en la app de campo (OBS-16/19): fecha y hora abajo a la
  // derecha, y encima solo lo que el contrato haya prendido. Sin franja que
  // tape la foto: letra blanca con borde oscuro.
  const s: Sello = { ...SELLO_POR_OMISION, ...(d.sello ?? {}), fecha: true, hora: true }
  if (s.activo === false) return

  const lado = Math.min(w, h)
  const grande = Math.max(14, Math.round(lado * 0.05))
  const chico = Math.round(grande * 0.62)
  const margen = Math.round(lado * 0.035)

  const momento = d.stampedAt ?? d.takenAt
  const fecha = momento.toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
  })
  const hora = momento.toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima',
  })

  const lugar = [
    s.tramo ? d.tramo : null,
    s.progresiva && d.progresivaM != null ? fmtProgresiva(d.progresivaM) : null,
  ].filter(Boolean).join(' · ')

  const extras = [
    s.marca ? 'SERVICON · SIGOV' : null,
    s.cuadrilla ? d.cuadrilla : null,
    [s.pci ? d.pci : null, s.actividad ? d.actividad : null].filter(Boolean).join(' · ') || null,
    lugar || null,
    s.geo
      ? `${d.gps.lat.toFixed(6)}, ${d.gps.lng.toFixed(6)}${s.precision ? `  ±${d.gps.accuracy.toFixed(0)} m` : ''}`
      : null,
  ].filter(Boolean) as string[]

  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  let y = h - margen
  const escribir = (texto: string, tam: number, negrita: boolean) => {
    ctx.font = `${negrita ? 700 : 500} ${tam}px ui-sans-serif, system-ui, sans-serif`
    ctx.lineWidth = tam * 0.14
    ctx.strokeStyle = 'rgba(0,0,0,0.86)'
    ctx.strokeText(texto, w - margen, y)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(texto, w - margen, y)
    y -= tam * 1.3
  }
  escribir(`${fecha} ${hora}`, grande, true)
  ;[...extras].reverse().forEach((t) => escribir(t, chico, false))
}

// ─── Cámara ───────────────────────────────────────────────────────────────
export async function openCamera(facing: 'environment' | 'user' = 'environment') {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1440 },
    },
    audio: false,
  })
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** Vibración háptica de confirmación en campo */
export function haptic(pattern: number | number[] = 40) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}
