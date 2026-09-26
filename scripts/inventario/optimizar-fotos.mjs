#!/usr/bin/env node
/**
 * SIGOV · Optimizar las fotos del inventario para subirlas.
 *
 *   node scripts/inventario/optimizar-fotos.mjs <indice.json> <carpeta-fotos> <carpeta-salida>
 *
 * Una salida por foto distinta, no por archivo: la huella del índice decide,
 * y la foto de calzada que venía copiada en tres carpetas se procesa una vez.
 *
 * Se pidió expresamente no perder calidad, y eso se midió en vez de darlo
 * por hecho. Sobre 180 fotos —sesenta grandes, sesenta medianas, sesenta
 * pequeñas— comparadas contra su original a la misma resolución:
 *
 *                  fotos a ≥ 40 dB    SSIM en el peor caso
 *   calidad 82          13 de 180           0,960
 *   calidad 88         118 de 180           0,980
 *   calidad 92         179 de 180           0,988
 *
 * Por encima de 40 dB de PSNR la diferencia no se ve. La cámara del sistema
 * usa 82, que va bien para una foto que se toma y se mira en el celular;
 * esto es la fuente de referencia del inventario oficial, y va a 92. Aun
 * así el conjunto baja de 1,8 GB a unos 650 MB.
 *
 * El lado mayor llega hasta 2048 px —la cámara usa 1600— para dejar zoom
 * sobre una fisura o imprimir la ficha. Lo que ya es pequeño no se amplía:
 * ampliar no añade detalle, solo peso. La miniatura sí queda como la del
 * sistema, 360 px a 70: es para listas y para el mapa.
 *
 * Reanudable: lo que ya está en la carpeta de salida no se vuelve a hacer.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const [INDICE, ORIGEN, SALIDA] = process.argv.slice(2)
if (!INDICE || !ORIGEN || !SALIDA) {
  console.error('uso: optimizar-fotos.mjs <indice.json> <carpeta-fotos> <carpeta-salida>')
  process.exit(1)
}

const LADO_MAX = 2048
const LADO_MINI = 360
const CALIDAD = 92
const CALIDAD_MINI = 70
// Con dos o tres fotos de 12 megapíxeles abiertas a la vez ya se van
// cientos de megas; más paralelismo no gana tiempo y sí arriesga memoria.
const A_LA_VEZ = 4
sharp.concurrency(2)

fs.mkdirSync(SALIDA, { recursive: true })
const indice = JSON.parse(fs.readFileSync(INDICE, 'utf8'))

// Una sola fuente por huella.
const porHuella = new Map()
for (const f of indice) if (!porHuella.has(f.sha256)) porHuella.set(f.sha256, f)
const pendientes = [...porHuella.values()]

const resultado = fs.existsSync(path.join(SALIDA, 'resultado.json'))
  ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'resultado.json'), 'utf8'))
  : {}

let hechas = 0
let saltadas = 0
let fallidas = 0
const inicio = Date.now()

async function procesar(f) {
  const destino = path.join(SALIDA, `${f.sha256}.webp`)
  const mini = path.join(SALIDA, `${f.sha256}_t.webp`)
  if (resultado[f.sha256] && fs.existsSync(destino) && fs.existsSync(mini)) {
    saltadas++
    return
  }
  try {
    const entrada = path.join(ORIGEN, f.ruta)
    // rotate() sin argumentos aplica la orientación EXIF antes de quitar los
    // metadatos; si no, una foto vertical sale tumbada.
    const principal = await sharp(entrada)
      .rotate()
      .resize({ width: LADO_MAX, height: LADO_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: CALIDAD, effort: 5 })
      .toFile(destino)
    const miniatura = await sharp(entrada)
      .rotate()
      .resize({ width: LADO_MINI, height: LADO_MINI, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: CALIDAD_MINI, effort: 4 })
      .toFile(mini)
    resultado[f.sha256] = {
      ancho: principal.width,
      alto: principal.height,
      bytes: principal.size,
      mini_ancho: miniatura.width,
      mini_alto: miniatura.height,
      mini_bytes: miniatura.size,
      bytes_original: f.bytes,
    }
    hechas++
  } catch (e) {
    fallidas++
    console.error(`  falló ${f.ruta}: ${e.message}`)
  }
}

// Una cola con A_LA_VEZ trabajadores.
let i = 0
async function trabajador() {
  while (i < pendientes.length) {
    const f = pendientes[i++]
    await procesar(f)
    const n = hechas + saltadas + fallidas
    if (n % 250 === 0) {
      fs.writeFileSync(path.join(SALIDA, 'resultado.json'), JSON.stringify(resultado))
      const seg = (Date.now() - inicio) / 1000
      console.error(`  ${n}/${pendientes.length}  · ${seg.toFixed(0)} s`)
    }
  }
}
await Promise.all(Array.from({ length: A_LA_VEZ }, trabajador))
fs.writeFileSync(path.join(SALIDA, 'resultado.json'), JSON.stringify(resultado))

const vals = Object.values(resultado)
const antes = vals.reduce((a, r) => a + r.bytes_original, 0)
const despues = vals.reduce((a, r) => a + r.bytes + r.mini_bytes, 0)
console.error(`\nhechas ${hechas} · ya estaban ${saltadas} · fallidas ${fallidas}`)
console.error(`peso: ${(antes / 2 ** 20).toFixed(0)} MB → ${(despues / 2 ** 20).toFixed(0)} MB (con miniaturas) · ${(100 - (despues / antes) * 100).toFixed(1)}% menos`)
