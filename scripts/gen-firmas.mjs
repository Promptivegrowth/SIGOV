#!/usr/bin/env node
/**
 * SIGOV · Firmas manuscritas para las asistencias sembradas.
 *
 * Las charlas de la demo decían tener firma pero el bucket estaba vacío: la
 * ruta apuntaba a un archivo inexistente. Este script dibuja una firma
 * distinta para cada persona (siempre la misma para el mismo nombre, como en
 * la vida real), la sube al bucket privado `firmas` y corrige la ruta.
 *
 *   node scripts/gen-firmas.mjs
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()

const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const C = { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m' }

// ─── PNG con transparencia ────────────────────────────────────────────────
const crcTable = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, c])
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6   // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Trazo de la firma ────────────────────────────────────────────────────
const W = 420, H = 160

/** Semilla estable a partir del nombre: la firma de alguien no cambia. */
function seedFrom(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

function firma(nombre) {
  const rnd = seedFrom(nombre)
  const px = Buffer.alloc(W * H * 4)   // transparente

  const tinta = [17, 24, 39]
  const punto = (x, y, a) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return
    const i = (yi * W + xi) * 4
    px[i] = tinta[0]; px[i + 1] = tinta[1]; px[i + 2] = tinta[2]
    px[i + 3] = Math.max(px[i + 3], Math.round(255 * a))
  }

  /** Traza un segmento con grosor variable, como una pluma. */
  const trazo = (x0, y0, x1, y1, grosor) => {
    const pasos = Math.max(2, Math.hypot(x1 - x0, y1 - y0) | 0)
    for (let s = 0; s <= pasos; s++) {
      const t = s / pasos
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      const g = grosor
      for (let dx = -g; dx <= g; dx += 0.5) {
        for (let dy = -g; dy <= g; dy += 0.5) {
          const d = Math.hypot(dx, dy)
          if (d <= g) punto(x + dx, y + dy, 1 - d / (g + 0.6))
        }
      }
    }
  }

  // Rúbrica: una onda principal más dos lazos, con inclinación propia
  const baseY = H * 0.62
  const amp = 26 + rnd() * 22
  const ciclos = 2.5 + rnd() * 2
  const inclina = -0.12 + rnd() * 0.2

  let px0 = 40, py0 = baseY
  for (let x = 40; x < W - 40; x += 3) {
    const t = (x - 40) / (W - 80)
    const y =
      baseY +
      Math.sin(t * Math.PI * ciclos + rnd() * 0.4) * amp * (1 - t * 0.35) +
      (x - 40) * inclina
    trazo(px0, py0, x, y, 1.5 + rnd() * 0.9)
    px0 = x; py0 = y
  }

  // El lazo final que casi todos hacen al cerrar
  const cx = W - 90, cy = baseY + (W - 130) * inclina
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const r = 16 + rnd() * 6
    const x = cx + Math.cos(a) * r * 1.6
    const y = cy + Math.sin(a) * r * 0.7
    trazo(x, y, cx + Math.cos(a + 0.08) * r * 1.6, cy + Math.sin(a + 0.08) * r * 0.7, 1.3)
  }

  // Subrayado
  trazo(50, baseY + 42, W - 60, baseY + 38 + rnd() * 8, 1.2)

  return encodePNG(W, H, px)
}

// ─── Proceso ──────────────────────────────────────────────────────────────
console.log(`${C.bold}\n  SIGOV · firmas de asistencia${C.reset}`)

const { data: filas, error } = await sb
  .from('talk_attendance')
  .select('id, talk_id, service_id, crew_member_id, full_name, signature_path')
  .order('id')
  .limit(5000)

if (error) { console.error(error); process.exit(1) }
console.log(`  ${C.dim}${filas.length} asistencias por firmar${C.reset}\n`)

// Una misma persona firma igual en todas las charlas: se genera una vez
const cache = new Map()
let subidas = 0, saltadas = 0, fallos = 0

for (const f of filas) {
  const nombre = f.full_name ?? 'Sin nombre'
  if (!cache.has(nombre)) cache.set(nombre, firma(nombre))
  const png = cache.get(nombre)

  const path = `${f.service_id}/charlas/${f.talk_id}/${f.crew_member_id ?? f.id}.png`

  const { error: upErr } = await sb.storage.from('firmas').upload(path, png, {
    contentType: 'image/png',
    upsert: true,
  })
  if (upErr) { fallos++; console.log(`  ${C.bad}✗${C.reset} ${nombre}: ${upErr.message}`); continue }

  if (f.signature_path !== path) {
    const { error: updErr } = await sb.from('talk_attendance')
      .update({ signature_path: path }).eq('id', f.id)
    if (updErr) { fallos++; continue }
  } else saltadas++

  subidas++
  if (subidas % 100 === 0) console.log(`  ${C.dim}${subidas}/${filas.length}…${C.reset}`)
}

console.log(`\n  ${C.ok}${subidas} firmas subidas${C.reset} ${C.dim}(${cache.size} rúbricas distintas)${C.reset}`)
if (fallos) console.log(`  ${C.bad}${fallos} con error${C.reset}`)
