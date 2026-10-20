import { enqueueBlob } from '@/lib/offline/db'
import type { SealedPhoto } from '@/lib/camera'

/**
 * Deja en cola el original JPG 4080 × 3060 de una foto (OBS-23) y devuelve
 * los campos que lo registran en la evidencia. Sube detrás de la foto, con
 * su mismo identificador más «-original».
 */
export async function encolarOriginal(photo: SealedPhoto, serviceId: string, clientId: string) {
  if (!photo.master) return {}
  const ahora = new Date()
  const path = `${serviceId}/originales/${ahora.getFullYear()}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${clientId}.jpg`
  await enqueueBlob({ client_id: `${clientId}-original`, bucket: 'evidencias', path, blob: photo.master.blob })
  return {
    master_path: path,
    master_width: photo.master.width,
    master_height: photo.master.height,
    master_bytes: photo.master.blob.size,
    master_sha256: photo.master.sha256,
  }
}
