#!/usr/bin/env node
/**
 * Versión clara del logotipo, para fondos oscuros.
 *
 * El logotipo de Grupo Servicon lleva la palabra en el mismo azul profundo
 * que usamos de fondo en la pantalla de ingreso y en la barra lateral: puesto
 * ahí, desaparece. Esto genera una variante donde el azul pasa a blanco y el
 * verde y el naranja del isotipo se quedan como están, que es lo que da la
 * identidad.
 *
 *   node scripts/gen-logo-claro.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const MARCA = path.join(process.cwd(), 'public', 'marca')

/** Un pixel es «azul de la marca» si tira a azul y es oscuro. */
function esAzulProfundo(r, g, b) {
  const luz = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return b > r && b > g && luz < 0.55
}

async function aclarar(origen, destino) {
  const { data, info } = await sharp(origen)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let cambiados = 0
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 8) continue
    if (esAzulProfundo(r, g, b)) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      cambiados++
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(destino)

  console.log(`  ${path.basename(destino)} · ${info.width}×${info.height} · ${cambiados} píxeles aclarados`)
}

if (!fs.existsSync(MARCA)) {
  console.error('No existe public/marca. Copia primero el logotipo procesado.')
  process.exit(1)
}

console.log('\n  Variantes para fondo oscuro')
await aclarar(path.join(MARCA, 'logo-servicon.png'), path.join(MARCA, 'logo-servicon-claro.png'))
await aclarar(path.join(MARCA, 'simbolo-servicon.png'), path.join(MARCA, 'simbolo-servicon-claro.png'))
console.log()
