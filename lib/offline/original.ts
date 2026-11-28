import { enqueueBlob } from '@/lib/offline/db'
import type { SealedPhoto } from '@/lib/camera'

/**
 * Deja en cola el original JPG 4080 × 3060 de una foto (OBS-23) y devuelve
 * los campos que lo registran en la evidencia. Sube detrás de la foto, con
 * su mismo identificador más «-original».
 */
export async function encolarOriginal(photo: SealedPhoto, serviceId: string, clientId: string) {
  const ahora = new Date()
  const carpeta = `${serviceId}/originales/${ahora.getFullYear()}/${String(ahora.getMonth() + 1).padStart(2, '0')}`
  // Ronda 5 (CP-11): el archivo de la galería o la PC, sin el sello SIGOV
  let archivo: Record<string, string> = {}
  if (photo.archivo) {
    const ext = photo.archivo.type === 'image/png' ? 'png' : photo.archivo.type === 'image/webp' ? 'webp' : 'jpg'
    const ruta = `${carpeta}/${clientId}-archivo.${ext}`
    await enqueueBlob({ client_id: `${clientId}-archivo`, bucket: 'evidencias', path: ruta, blob: photo.archivo })
    archivo = { archivo_original_path: ruta }
  }
  if (!photo.master) return archivo
  const path = `${carpeta}/${clientId}.jpg`
  await enqueueBlob({ client_id: `${clientId}-original`, bucket: 'evidencias', path, blob: photo.master.blob })
  return {
    ...archivo,
    master_path: path,
    master_width: photo.master.width,
    master_height: photo.master.height,
    master_bytes: photo.master.blob.size,
    master_sha256: photo.master.sha256,
  }
}
