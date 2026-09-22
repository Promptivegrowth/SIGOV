#!/usr/bin/env node
/**
 * Iconos de la aplicación web, a partir del isotipo de Grupo Servicon.
 *
 * El icono se ve a 48 px en la pantalla de inicio de un celular, así que va
 * el isotipo solo —las tres figuras enlazadas—, nunca el logotipo completo:
 * la palabra a ese tamaño es una mancha. El fondo es el azul de la marca,
 * que además es el color del tema.
 *
 *   node scripts/gen-iconos-servicon.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const RAIZ = process.cwd()
const ISOTIPO = path.join(RAIZ, 'public', 'marca', 'simbolo-servicon-claro.png')
const ICONOS = path.join(RAIZ, 'public', 'icons')
const AZUL = '#072D70'

const TAMANOS = [72, 96, 128, 144, 152, 192, 256, 384, 512]

if (!fs.existsSync(ISOTIPO)) {
  console.error('Falta el isotipo claro. Ejecuta antes gen-logo-claro.mjs')
  process.exit(1)
}
fs.mkdirSync(ICONOS, { recursive: true })

/** El isotipo centrado sobre el azul, con aire alrededor. */
async function icono(lado, destino, margen = 0.16, fondo = AZUL) {
  const util = Math.round(lado * (1 - margen * 2))
  const marca = await sharp(ISOTIPO)
    .resize(util, util, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  await sharp({
    create: { width: lado, height: lado, channels: 4, background: fondo },
  })
    .composite([{ input: marca, gravity: 'centre' }])
    .png()
    .toFile(destino)
}

console.log('\n  Iconos de Grupo Servicon')
for (const lado of TAMANOS) {
  await icono(lado, path.join(ICONOS, `icon-${lado}.png`))
  console.log(`  icon-${lado}.png`)
}

// Los enmascarables llevan más aire: Android les recorta un círculo
for (const lado of [192, 512]) {
  await icono(lado, path.join(ICONOS, `maskable-${lado}.png`), 0.26)
  console.log(`  maskable-${lado}.png`)
}

// El de iOS no admite transparencia y se recorta con esquinas redondeadas
await icono(180, path.join(ICONOS, 'apple-touch-icon.png'), 0.14)
console.log('  apple-touch-icon.png')

// El favicon se mira a 16 px: menos aire, para que la figura se reconozca
await icono(64, path.join(RAIZ, 'public', 'favicon.png'), 0.08)
console.log('  favicon.png')
console.log()
