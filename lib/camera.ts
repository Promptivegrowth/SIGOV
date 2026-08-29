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
export interface WatermarkData {
  servicio: string
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

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  drawWatermark(ctx, w, h, data)

  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), 'image/webp', 0.82)
  )

  // Miniatura para listados y para el mapa
  const tScale = THUMB_EDGE / Math.max(w, h)
  const tCanvas = document.createElement('canvas')
  tCanvas.width = Math.round(w * tScale)
  tCanvas.height = Math.round(h * tScale)
  tCanvas.getContext('2d')!.drawImage(canvas, 0, 0, tCanvas.width, tCanvas.height)
  const thumb = await new Promise<Blob>((res) =>
    tCanvas.toBlob((b) => res(b!), 'image/webp', 0.7)
  )

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

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: WatermarkData
) {
  const scale = w / 1600
  const pad = Math.round(22 * scale)
  const lineH = Math.round(30 * scale)
  const fontBase = Math.round(23 * scale)

  const left = [
    `${d.gps.lat.toFixed(6)}, ${d.gps.lng.toFixed(6)}`,
    `Precisión ±${d.gps.accuracy.toFixed(0)} m${d.gps.altitude != null ? ` · Alt ${d.gps.altitude.toFixed(0)} m` : ''}`,
    d.takenAt.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
  ]

  const right = [
    d.tramo ? `${d.tramo}${d.progresivaM != null ? ` · ${fmtProgresiva(d.progresivaM)}` : ''}` : null,
    d.actividad ?? null,
    [d.cuadrilla, d.fase ? d.fase.toUpperCase() : null].filter(Boolean).join(' · ') || null,
  ].filter(Boolean) as string[]

  const rows = Math.max(left.length, right.length)
  const boxH = rows * lineH + pad * 2 + Math.round(30 * scale)

  // Banda inferior con degradado
  const grad = ctx.createLinearGradient(0, h - boxH - 40 * scale, 0, h)
  grad.addColorStop(0, 'rgba(6,12,32,0)')
  grad.addColorStop(0.35, 'rgba(6,12,32,0.72)')
  grad.addColorStop(1, 'rgba(6,12,32,0.9)')
  ctx.fillStyle = grad
  ctx.fillRect(0, h - boxH - 40 * scale, w, boxH + 40 * scale)

  // Cinta ámbar de señalización
  ctx.fillStyle = '#F5A314'
  ctx.fillRect(0, h - boxH, w, Math.max(2, 3 * scale))

  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 4 * scale

  // Encabezado
  const headY = h - boxH + Math.round(12 * scale)
  ctx.font = `700 ${Math.round(fontBase * 0.92)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = '#F5A314'
  ctx.textAlign = 'left'
  ctx.fillText('SIGOV', pad, headY)
  ctx.font = `500 ${Math.round(fontBase * 0.8)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(d.servicio, pad + ctx.measureText('SIGOV').width + 46 * scale, headY + 2 * scale)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `500 ${Math.round(fontBase * 0.72)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText('EVIDENCIA GEORREFERENCIADA', w - pad, headY + 4 * scale)

  // Columnas de datos
  const bodyY = headY + Math.round(34 * scale)
  ctx.font = `600 ${fontBase}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'left'
  left.forEach((t, i) => ctx.fillText(t, pad, bodyY + i * lineH))

  ctx.textAlign = 'right'
  ctx.font = `500 ${Math.round(fontBase * 0.95)}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  right.forEach((t, i) => ctx.fillText(t, w - pad, bodyY + i * lineH))

  ctx.shadowBlur = 0
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
