#!/usr/bin/env node
/**
 * SIGOV · Generador de iconos PWA
 * Rasteriza la marca (escudo + calzada en perspectiva + marcas ámbar)
 * a PNG sin dependencias externas: encoder PNG propio sobre zlib.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = path.join(process.cwd(), 'public', 'icons')
fs.mkdirSync(OUT, { recursive: true })

// ─── Encoder PNG (RGBA, 8 bits) ───────────────────────────────────────────
function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filtro None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ─── Utilidades de dibujo ────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const smooth = (edge, w, d) => clamp01(0.5 - (d - edge) / w)

function mix(dst, i, [r, g, b], a) {
  if (a <= 0) return
  const ia = 1 - a
  dst[i] = Math.round(dst[i] * ia + r * a)
  dst[i + 1] = Math.round(dst[i + 1] * ia + g * a)
  dst[i + 2] = Math.round(dst[i + 2] * ia + b * a)
  dst[i + 3] = Math.round(dst[i + 3] * ia + 255 * a)
}

/** Distancia con signo a un rect redondeado centrado (positiva fuera) */
function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r
  const qy = Math.abs(py) - hh + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/**
 * Dibuja la marca SIGOV.
 * @param maskable si true, deja 12% de padding seguro alrededor (safe zone)
 */
function drawIcon(size, { maskable = false, transparent = false } = {}) {
  const px = Buffer.alloc(size * size * 4, 0)

  // Fondo del lienzo: para maskable pintamos todo el cuadro
  const inset = maskable ? size * 0.14 : size * 0.045
  const box = size - inset * 2
  const cx = size / 2
  const cy = size / 2
  const aa = Math.max(1, size / 220)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const fx = x + 0.5
      const fy = y + 0.5

      // ── Placa de fondo ──────────────────────────────────────────────
      let d
      if (maskable) {
        d = sdRoundRect(fx - cx, fy - cy, size / 2, size / 2, 0)
      } else {
        d = sdRoundRect(fx - cx, fy - cy, box / 2, box / 2, box * 0.235)
      }
      const inPlate = smooth(0, aa * 1.6, d)
      if (inPlate > 0 && !transparent) {
        // Gradiente diagonal azul profundo
        const t = clamp01(((fx - inset) / box) * 0.5 + ((fy - inset) / box) * 0.5)
        const r = Math.round(lerp(43, 16, t))
        const g = Math.round(lerp(79, 28, t))
        const b = Math.round(lerp(214, 94, t))
        mix(px, i, [r, g, b], inPlate)
      }

      // Coordenadas normalizadas dentro de la placa (0..1)
      const u = (fx - (cx - box / 2)) / box
      const v = (fy - (cy - box / 2)) / box
      if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) continue

      // ── Calzada en perspectiva ──────────────────────────────────────
      // Trapecio: arriba estrecho (y=0.24), abajo ancho (y=0.9)
      const top = 0.245
      const bot = 0.905
      if (v >= top - 0.01 && v <= bot + 0.01) {
        const t = clamp01((v - top) / (bot - top))
        const halfW = lerp(0.088, 0.235, t * t * 0.55 + t * 0.45)
        const dx = Math.abs(u - 0.5)
        const edge = (halfW - dx) * box
        const inRoad = smooth(0, aa * 1.4, -edge) *
                       smooth(0, aa * 1.4, -((v - top) * box)) *
                       smooth(0, aa * 1.4, -((bot - v) * box))
        if (inRoad > 0) {
          const alpha = lerp(0.42, 0.97, t)
          mix(px, i, [255, 255, 255], inRoad * alpha)
        }

        // ── Marcas centrales ámbar (3 segmentos que crecen) ───────────
        const dashes = [
          [0.285, 0.375, 0.022],
          [0.44, 0.565, 0.027],
          [0.635, 0.80, 0.033],
        ]
        for (const [y0, y1, hw] of dashes) {
          if (v >= y0 && v <= y1) {
            const dEdge = Math.min(
              (hw - dx) * box,
              (v - y0) * box,
              (y1 - v) * box
            )
            const a = smooth(0, aa * 1.3, -dEdge)
            if (a > 0) mix(px, i, [245, 163, 20], a)
          }
        }
      }

      // ── Barra de horizonte ámbar ────────────────────────────────────
      const hb = sdRoundRect(u - 0.5, v - 0.205, 0.145, 0.026, 0.026)
      const inBar = smooth(0, (aa * 1.3) / box, hb)
      if (inBar > 0) mix(px, i, [245, 163, 20], inBar * 0.95)
    }
  }

  return encodePNG(size, size, px)
}

// ─── Generación ───────────────────────────────────────────────────────────
const targets = [
  { name: 'icon-72.png', size: 72 },
  { name: 'icon-96.png', size: 96 },
  { name: 'icon-128.png', size: 128 },
  { name: 'icon-144.png', size: 144 },
  { name: 'icon-152.png', size: 152 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-256.png', size: 256 },
  { name: 'icon-384.png', size: 384 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180, maskable: true },
  { name: 'maskable-192.png', size: 192, maskable: true },
  { name: 'maskable-512.png', size: 512, maskable: true },
]

for (const t of targets) {
  const buf = drawIcon(t.size, { maskable: t.maskable })
  fs.writeFileSync(path.join(OUT, t.name), buf)
  console.log(`  ✓ icons/${t.name.padEnd(24)} ${String(buf.length).padStart(7)} bytes`)
}

// favicon.ico no es necesario: usamos icon-32 + el SVG del navegador
fs.writeFileSync(path.join(process.cwd(), 'public', 'favicon.png'), drawIcon(48))
console.log('  ✓ favicon.png')
console.log(`\n${targets.length + 1} iconos generados en public/icons`)
