#!/usr/bin/env node
/**
 * SIGOV Android · recursos gráficos a partir del logo de la marca.
 *
 * Del `logo.png` de Grupo Servicon salen dos cosas distintas:
 *   · el logo completo (símbolo + palabra), para la pantalla de arranque y
 *     los encabezados;
 *   · el símbolo solo —las tres figuras—, que es lo único que cabe en el
 *     ícono de la aplicación.
 *
 * El PNG del logo viene con paleta indexada, así que aquí se decodifica a
 * mano, se recorta y se vuelve a escribir en RGBA.
 *
 *   node scripts/gen-android-assets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const RAIZ = process.cwd()
const RES = path.join(RAIZ, 'android/app/src/main/res')
const C = { ok: '\x1b[32m', dim: '\x1b[90m', bad: '\x1b[31m', reset: '\x1b[0m' }

// ─── Lectura del PNG ──────────────────────────────────────────────────────
function leerPNG(archivo) {
  const buf = fs.readFileSync(archivo)
  let p = 8, W = 0, H = 0, bd = 8, ct = 6
  const idat = []
  let plte = null, trns = null

  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const tipo = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (tipo === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (tipo === 'PLTE') plte = data
    else if (tipo === 'tRNS') trns = data
    else if (tipo === 'IDAT') idat.push(data)
    else if (tipo === 'IEND') break
    p += 12 + len
  }

  const canales = ct === 6 ? 4 : ct === 2 ? 3 : 1
  const bitsPorPixel = canales * bd
  const stride = Math.ceil((W * bitsPorPixel) / 8)
  const crudo = zlib.inflateSync(Buffer.concat(idat))
  const plano = Buffer.alloc(H * stride)
  const bpp = Math.max(1, Math.ceil(bitsPorPixel / 8))

  let pos = 0
  for (let y = 0; y < H; y++) {
    const filtro = crudo[pos++]
    const linea = crudo.subarray(pos, pos + stride)
    pos += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? plano[y * stride + x - bpp] : 0
      const b = y > 0 ? plano[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? plano[(y - 1) * stride + x - bpp] : 0
      let v = linea[x]
      if (filtro === 1) v += a
      else if (filtro === 2) v += b
      else if (filtro === 3) v += (a + b) >> 1
      else if (filtro === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      plano[y * stride + x] = v & 255
    }
  }

  // Todo se normaliza a RGBA para trabajar cómodo
  const rgba = Buffer.alloc(W * H * 4)
  const leerIndice = (y, x) => {
    if (bd === 8) return plano[y * stride + x]
    const porByte = 8 / bd
    const byte = plano[y * stride + Math.floor(x / porByte)]
    return (byte >> ((porByte - 1 - (x % porByte)) * bd)) & ((1 << bd) - 1)
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = (y * W + x) * 4
      if (ct === 3) {
        const i = leerIndice(y, x)
        rgba[d] = plte[i * 3]; rgba[d + 1] = plte[i * 3 + 1]; rgba[d + 2] = plte[i * 3 + 2]
        rgba[d + 3] = trns && trns[i] !== undefined ? trns[i] : 255
      } else {
        const s = y * stride + x * canales
        rgba[d] = plano[s]
        rgba[d + 1] = canales >= 3 ? plano[s + 1] : plano[s]
        rgba[d + 2] = canales >= 3 ? plano[s + 2] : plano[s]
        rgba[d + 3] = canales === 4 ? plano[s + 3] : 255
      }
    }
  }
  return { W, H, rgba }
}

// ─── Escritura del PNG ────────────────────────────────────────────────────
const tablaCrc = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b) {
  let c = 0xffffffff
  for (const v of b) c = tablaCrc[(c ^ v) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloque(tipo, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([len, cuerpo, crc])
}

function escribirPNG(archivo, W, H, rgba) {
  const crudo = Buffer.alloc((W * 4 + 1) * H)
  for (let y = 0; y < H; y++) {
    crudo[y * (W * 4 + 1)] = 0
    rgba.copy(crudo, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6
  fs.mkdirSync(path.dirname(archivo), { recursive: true })
  fs.writeFileSync(archivo, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]))
}

// ─── Operaciones sobre la imagen ──────────────────────────────────────────
/** Qué parte de la imagen tiene tinta, para recortar el aire sobrante. */
function recuadroConTinta(img, x0 = 0, x1 = img.W) {
  let minX = x1, minY = img.H, maxX = x0, maxY = 0
  for (let y = 0; y < img.H; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.W + x) * 4
      const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]]
      if (a < 40) continue
      if (r > 238 && g > 238 && b > 238) continue    // el blanco del fondo
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Busca la columna vacía que separa el símbolo de la palabra «SERVICON». */
function columnaDeCorte(img) {
  const tinta = new Array(img.W).fill(0)
  for (let x = 0; x < img.W; x++) {
    for (let y = 0; y < img.H; y++) {
      const i = (y * img.W + x) * 4
      const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]]
      if (a >= 40 && !(r > 238 && g > 238 && b > 238)) tinta[x]++
    }
  }
  // El símbolo ocupa la primera cuarta parte; entre él y la palabra hay un
  // respiro corto —unos 30 px en el original—, así que el umbral es fino y la
  // búsqueda se limita a esa zona para no cortar entre dos letras.
  const inicio = tinta.findIndex((n) => n > 0)
  const limite = Math.floor(img.W * 0.4)
  const minimo = Math.max(12, Math.floor(img.W * 0.008))
  let vacias = 0
  for (let x = inicio + 1; x < limite; x++) {
    if (tinta[x] === 0) {
      vacias++
      if (vacias >= minimo) return x - vacias
    } else vacias = 0
  }
  return Math.floor(img.W * 0.25)
}

function recortar(img, { x, y, w, h }) {
  const out = Buffer.alloc(w * h * 4)
  for (let j = 0; j < h; j++) {
    img.rgba.copy(out, j * w * 4, ((y + j) * img.W + x) * 4, ((y + j) * img.W + x + w) * 4)
  }
  return { W: w, H: h, rgba: out }
}

/** Reescala con muestreo por área: conserva bordes limpios al achicar. */
function escalar(img, W, H) {
  const out = Buffer.alloc(W * H * 4)
  const fx = img.W / W, fy = img.H / H
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx))
      const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = y0; sy < y1 && sy < img.H; sy++) {
        for (let sx = x0; sx < x1 && sx < img.W; sx++) {
          const i = (sy * img.W + sx) * 4
          const al = img.rgba[i + 3] / 255
          r += img.rgba[i] * al; g += img.rgba[i + 1] * al; b += img.rgba[i + 2] * al
          a += img.rgba[i + 3]; n++
        }
      }
      const d = (y * W + x) * 4
      const alfa = a / n
      const peso = alfa / 255 || 1
      out[d] = Math.round(r / n / peso)
      out[d + 1] = Math.round(g / n / peso)
      out[d + 2] = Math.round(b / n / peso)
      out[d + 3] = Math.round(alfa)
    }
  }
  return { W, H, rgba: out }
}

/** El blanco del fondo pasa a transparente: el logo se usa sobre azul. */
function blancoATransparente(img, umbral = 238) {
  const out = Buffer.from(img.rgba)
  for (let i = 0; i < out.length; i += 4) {
    if (out[i] > umbral && out[i + 1] > umbral && out[i + 2] > umbral) out[i + 3] = 0
  }
  return { W: img.W, H: img.H, rgba: out }
}

/** Coloca la imagen centrada dentro de un lienzo cuadrado transparente. */
function enLienzo(img, lado, ocupacion = 0.68) {
  const out = Buffer.alloc(lado * lado * 4)
  const escala = Math.min((lado * ocupacion) / img.W, (lado * ocupacion) / img.H)
  const w = Math.max(1, Math.round(img.W * escala))
  const h = Math.max(1, Math.round(img.H * escala))
  const chico = escalar(img, w, h)
  const ox = Math.floor((lado - w) / 2)
  const oy = Math.floor((lado - h) / 2)
  for (let y = 0; y < h; y++) {
    chico.rgba.copy(out, ((oy + y) * lado + ox) * 4, y * w * 4, (y + 1) * w * 4)
  }
  return { W: lado, H: lado, rgba: out }
}

// ─── Proceso ──────────────────────────────────────────────────────────────
const logo = leerPNG(path.join(RAIZ, 'logo.png'))
console.log(`\n  logo original · ${logo.W}×${logo.H}`)

// 1) Logo completo, sin aire ni fondo, para la marca dentro de la app
const completo = blancoATransparente(recortar(logo, recuadroConTinta(logo)))
escribirPNG(path.join(RES, 'drawable-nodpi/logo_servicon.png'), completo.W, completo.H, completo.rgba)
console.log(`  ${C.ok}✓${C.reset} logo_servicon.png ${C.dim}${completo.W}×${completo.H}${C.reset}`)

// 2) Símbolo solo, para el ícono de la aplicación
const corte = columnaDeCorte(logo)
const simbolo = blancoATransparente(recortar(logo, recuadroConTinta(logo, 0, corte)))
escribirPNG(path.join(RES, 'drawable-nodpi/simbolo_servicon.png'), simbolo.W, simbolo.H, simbolo.rgba)
console.log(`  ${C.ok}✓${C.reset} simbolo_servicon.png ${C.dim}${simbolo.W}×${simbolo.H} (corte en x=${corte})${C.reset}`)

// 3) Íconos de la aplicación, en las cinco densidades de pantalla
const densidades = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]
for (const [nombre, lado, ladoAdaptativo] of densidades) {
  const clasico = enLienzo(simbolo, lado, 0.82)
  escribirPNG(path.join(RES, `mipmap-${nombre}/ic_launcher.png`), lado, lado, clasico.rgba)
  escribirPNG(path.join(RES, `mipmap-${nombre}/ic_launcher_round.png`), lado, lado, clasico.rgba)
  // En el ícono adaptativo el sistema recorta los bordes: el símbolo va más chico
  const adaptativo = enLienzo(simbolo, ladoAdaptativo, 0.58)
  escribirPNG(path.join(RES, `mipmap-${nombre}/ic_launcher_foreground.png`), ladoAdaptativo, ladoAdaptativo, adaptativo.rgba)
}
console.log(`  ${C.ok}✓${C.reset} íconos de la aplicación ${C.dim}en 5 densidades${C.reset}`)

// 4) Declaración del ícono adaptativo, con el blanco del logo como fondo
fs.mkdirSync(path.join(RES, 'mipmap-anydpi-v26'), { recursive: true })
const adaptativoXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/blanco" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptativoXml)
fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptativoXml)
console.log(`  ${C.ok}✓${C.reset} ícono adaptativo declarado\n`)
