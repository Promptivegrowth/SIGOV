'use client'

/**
 * «Panel JPG» del Centro de reportes (ADMIN_Reportes_V2; guía, función 15).
 *
 * Una lámina JPEG real (no un PNG con la extensión cambiada) con las fotos
 * oficiales de cada registro, una fila por ítem o intervención: Antes,
 * Durante y Después. Lo que falta se dice («Falta Durante»); no se rellena
 * con otra foto. Si los registros no caben en una lámina, salen varias
 * páginas dentro de un ZIP: nunca se recorta el lote.
 */

export interface FilaPanel {
  titulo: string
  detalle?: string
  fotos: { fase: 'antes' | 'durante' | 'despues'; url: string | null; nombre?: string; captura?: string }[]
}

const AZUL = '#072D70'
const W = 1800
const POR_PAGINA = 5
const FILA_H = 330
const CAB_H = 190

async function cargarImagen(url: string): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return await createImageBitmap(await r.blob())
  } catch {
    return null
  }
}

function encajar(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / img.width, h / img.height)
  const iw = img.width * k
  const ih = img.height * k
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}

async function lamina(filas: FilaPanel[], cab: { titulo: string; lineas: string[]; pagina: string }) {
  const H = CAB_H + filas.length * FILA_H + 60
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Cabecera: marca, título, alcance y corte
  ctx.fillStyle = AZUL
  ctx.fillRect(0, 0, W, 96)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 40px Arial, sans-serif'
  ctx.fillText('SIGOV', 40, 62)
  ctx.font = '600 28px Arial, sans-serif'
  ctx.fillText(cab.titulo, 210, 60)
  ctx.font = '22px Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(cab.pagina, W - 40, 60)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#334155'
  ctx.font = '21px Arial, sans-serif'
  cab.lineas.slice(0, 3).forEach((l, i) => ctx.fillText(l, 40, 132 + i * 26))

  const colTexto = 330
  const anchoFoto = (W - 80 - colTexto - 40) / 3
  for (let r = 0; r < filas.length; r++) {
    const f = filas[r]
    const y = CAB_H + r * FILA_H
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 2
    ctx.strokeRect(30, y, W - 60, FILA_H - 14)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 30px Arial, sans-serif'
    ctx.fillText(f.titulo, 50, y + 50)
    ctx.fillStyle = '#475569'
    ctx.font = '20px Arial, sans-serif'
    const palabras = (f.detalle ?? '').split(' ')
    let linea = ''
    let ly = y + 86
    for (const p of palabras) {
      if (ctx.measureText(linea + p).width > colTexto - 40) {
        ctx.fillText(linea, 50, ly)
        linea = ''
        ly += 26
        if (ly > y + FILA_H - 30) break
      }
      linea += p + ' '
    }
    if (ly <= y + FILA_H - 30) ctx.fillText(linea, 50, ly)

    const fases: ('antes' | 'durante' | 'despues')[] = ['antes', 'durante', 'despues']
    for (let k = 0; k < 3; k++) {
      const x = 30 + colTexto + k * (anchoFoto + 20)
      const fy = y + 14
      const fh = FILA_H - 80
      const foto = f.fotos.find((o) => o.fase === fases[k])
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(x, fy, anchoFoto, fh)
      const img = foto?.url ? await cargarImagen(foto.url) : null
      if (img) {
        encajar(ctx, img, x, fy, anchoFoto, fh)
        img.close?.()
      } else {
        ctx.fillStyle = '#b91c1c'
        ctx.font = '600 24px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`Falta ${fases[k] === 'antes' ? 'Antes' : fases[k] === 'durante' ? 'Durante' : 'Después'}`, x + anchoFoto / 2, fy + fh / 2)
        ctx.textAlign = 'left'
      }
      ctx.fillStyle = '#0f172a'
      ctx.font = '600 19px Arial, sans-serif'
      ctx.fillText(foto?.nombre ?? (fases[k] === 'antes' ? 'Antes' : fases[k] === 'durante' ? 'Durante' : 'Después'), x, fy + fh + 26)
      if (foto?.captura) {
        ctx.fillStyle = '#64748b'
        ctx.font = '17px Arial, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(foto.captura, x + anchoFoto, fy + fh + 26)
        ctx.textAlign = 'left'
      }
    }
  }
  ctx.fillStyle = '#64748b'
  ctx.font = '18px Arial, sans-serif'
  ctx.fillText('Fotos oficiales sin alterar: fecha de captura y sello originales. Lo que falta se indica; no se reemplaza con otra foto.', 40, H - 22)

  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar el JPG'))), 'image/jpeg', 0.9))
}

/** Una lámina JPG, o un ZIP con varias si el lote no cabe en una. */
export async function panelJpg(nombre: string, titulo: string, lineas: string[], filas: FilaPanel[]) {
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA))
  if (paginas === 1) {
    return { blob: await lamina(filas, { titulo, lineas, pagina: '1 / 1' }), archivo: `${nombre}.jpg`, tipo: 'image/jpeg' }
  }
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (let p = 0; p < paginas; p++) {
    const b = await lamina(filas.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA), { titulo, lineas, pagina: `${p + 1} / ${paginas}` })
    zip.file(`${nombre}_${String(p + 1).padStart(2, '0')}.jpg`, b)
  }
  return { blob: await zip.generateAsync({ type: 'blob' }), archivo: `${nombre}.zip`, tipo: 'application/zip' }
}
