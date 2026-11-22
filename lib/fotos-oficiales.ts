'use client'

/**
 * Las fotos oficiales de un ítem y sus nombres de exportación
 * (guía de roles 2.7, 8.3 y decisión confirmada n.º 3).
 *
 *   · Una foto Antes (fase 1), una Durante (fase 2) y hasta tres Después
 *     (fase 3): ITEM_800(1).jpg, ITEM_800(2).jpg, ITEM_800(3).jpg; las
 *     Después adicionales conservan la fase 3: ITEM_800(3)_A.jpg y _B.jpg.
 *     Nunca «fase 4» ni espacio antes del paréntesis.
 *   · Las demás se conservan como adicionales (no se exportan como fase).
 *   · General / complementaria no reemplaza una fase ausente.
 *   · Se exporta un JPEG real (se recodifica la imagen), nunca un PNG o WebP
 *     con la extensión cambiada; el original queda intacto en SIGOV.
 */

export type FotoItem = {
  id: string
  phase: string | null
  storage_path: string
  master_path?: string | null
  taken_at?: string | null
  created_at?: string | null
}

export type FotoOficial<T extends FotoItem = FotoItem> = { foto: T; nombre: string; fase: 1 | 2 | 3 }

export function fotosOficiales<T extends FotoItem>(numeroItem: number | string, fotos: T[]) {
  const orden = (a: T, b: T) => String(a.taken_at ?? a.created_at ?? '').localeCompare(String(b.taken_at ?? b.created_at ?? ''))
  const de = (f: string) => fotos.filter((x) => x.phase === f).sort(orden)
  const antes = de('antes')
  const durante = de('durante')
  const despues = de('despues')
  const base = `ITEM_${numeroItem}`
  const oficiales: FotoOficial<T>[] = []
  if (antes[0]) oficiales.push({ foto: antes[0], nombre: `${base}(1).jpg`, fase: 1 })
  if (durante[0]) oficiales.push({ foto: durante[0], nombre: `${base}(2).jpg`, fase: 2 })
  despues.slice(0, 3).forEach((f, i) =>
    oficiales.push({ foto: f, nombre: i === 0 ? `${base}(3).jpg` : `${base}(3)_${String.fromCharCode(64 + i)}.jpg`, fase: 3 }))
  const usados = new Set(oficiales.map((o) => o.foto.id))
  const faltan: string[] = []
  if (!antes[0]) faltan.push('Antes')
  if (!durante[0]) faltan.push('Durante')
  if (!despues[0]) faltan.push('Después')
  return { oficiales, adicionales: fotos.filter((f) => !usados.has(f.id)), faltan }
}

/** Recodifica a JPEG real (calidad 0,92), sin tocar el archivo original. */
export async function aJpegReal(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/jpeg') {
    // Un JPEG ya es JPEG: se verifica la firma FF D8 en vez de fiarse del tipo
    const cab = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
    if (cab[0] === 0xff && cab[1] === 0xd8) return blob
  }
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo convertir a JPG'))), 'image/jpeg', 0.92))
}
