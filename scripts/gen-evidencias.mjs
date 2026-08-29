#!/usr/bin/env node
/**
 * SIGOV · Generador de evidencias fotográficas para la demostración.
 *
 * La siembra creó los registros de evidencia en la base, pero sin archivo real
 * en Storage: la galería salía vacía. Este script dibuja fotografías de obra
 * procedurales —escena vial + banda inferior con GPS, fecha, tramo y actividad,
 * igual que la marca de agua real— y las sube al bucket `evidencias`.
 *
 * Genera un catálogo de escenas distintas y reparte los registros entre ellas,
 * de modo que el archivo ocupa poco y toda evidencia resuelve a una imagen.
 *
 *   node scripts/gen-evidencias.mjs
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

// ─── Entorno ──────────────────────────────────────────────────────────────
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const C = { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m' }

// ═══════════════════════════════════════════════════════════════════════════
// Encoder PNG (RGB, 8 bits) — sin dependencias externas
// ═══════════════════════════════════════════════════════════════════════════
function crc32(buf) {
  const table = crc32.t || (crc32.t = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
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
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

function encodePNG(w, h, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = w * 3
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig, chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 8 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ═══════════════════════════════════════════════════════════════════════════
// Tipografía de mapa de bits 5x7 — para quemar el texto de la marca de agua
// ═══════════════════════════════════════════════════════════════════════════
const FONT = {
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'C':['01110','10001','10000','10000','10000','10001','01110'],
  'D':['11110','10001','10001','10001','10001','10001','11110'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'F':['11111','10000','10000','11110','10000','10000','10000'],
  'G':['01110','10001','10000','10111','10001','10001','01111'],
  'H':['10001','10001','10001','11111','10001','10001','10001'],
  'I':['11111','00100','00100','00100','00100','00100','11111'],
  'J':['00111','00010','00010','00010','00010','10010','01100'],
  'K':['10001','10010','10100','11000','10100','10010','10001'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'Q':['01110','10001','10001','10001','10101','10010','01101'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'W':['10001','10001','10001','10101','10101','11011','10001'],
  'X':['10001','10001','01010','00100','01010','10001','10001'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'Z':['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00110','01000','10000','11111'],
  '3':['11111','00010','00100','00010','00001','10001','01110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','11110','00001','00001','10001','01110'],
  '6':['00110','01000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00010','01100'],
  '.':['00000','00000','00000','00000','00000','01100','01100'],
  ',':['00000','00000','00000','00000','01100','01100','11000'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  ':':['00000','01100','01100','00000','01100','01100','00000'],
  '/':['00001','00010','00010','00100','01000','01000','10000'],
  '(':['00010','00100','01000','01000','01000','00100','00010'],
  ')':['01000','00100','00010','00010','00010','00100','01000'],
  '_':['00000','00000','00000','00000','00000','00000','11111'],
  'º':['01100','10010','01100','00000','00000','00000','00000'],
  '±':['00100','11111','00100','00000','11111','00000','00000'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
}

function drawText(px, W, H, text, x0, y0, scale, color) {
  let x = x0
  for (const rawCh of text.toUpperCase()) {
    const ch = FONT[rawCh] ? rawCh : (FONT[rawCh.normalize('NFD')[0]] ? rawCh.normalize('NFD')[0] : '?')
    const glyph = FONT[ch] ?? FONT[' ']
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '1') continue
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px_ = x + gx * scale + sx
            const py_ = y0 + gy * scale + sy
            if (px_ < 0 || py_ < 0 || px_ >= W || py_ >= H) continue
            const i = (py_ * W + px_) * 3
            px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]
          }
        }
      }
    }
    x += 6 * scale
  }
  return x
}

const textWidth = (t, scale) => t.length * 6 * scale

// ═══════════════════════════════════════════════════════════════════════════
// Escenas de obra vial
// ═══════════════════════════════════════════════════════════════════════════
const W = 800, H = 600

// Generador pseudoaleatorio reproducible
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const set = (px, x, y, c) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 3
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]
}

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

function fillRect(px, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(px, x, y, c)
}

/** Cielo + cerros de la costa + calzada en perspectiva */
function baseScene(px, r, opts = {}) {
  const horizon = opts.horizon ?? 215

  // Cielo con degradado
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon
    const c = mix([132, 176, 214], [206, 220, 232], t)
    for (let x = 0; x < W; x++) set(px, x, y, c)
  }

  // Cerros áridos al fondo
  for (let x = 0; x < W; x++) {
    const h1 = horizon - 52 + Math.sin(x / 95) * 26 + Math.sin(x / 31) * 9
    for (let y = Math.floor(h1); y < horizon; y++) {
      const t = (y - h1) / (horizon - h1 + 1)
      set(px, x, y, mix([150, 133, 112], [116, 101, 84], t))
    }
    const h2 = horizon - 24 + Math.sin(x / 60 + 2) * 14
    for (let y = Math.floor(h2); y < horizon; y++) set(px, x, y, [128, 113, 94])
  }

  // Terreno / berma
  for (let y = horizon; y < H; y++) {
    const t = (y - horizon) / (H - horizon)
    const c = mix([154, 138, 112], [122, 108, 88], t)
    for (let x = 0; x < W; x++) {
      const n = (r() - 0.5) * 16
      set(px, x, y, [c[0] + n, c[1] + n, c[2] + n])
    }
  }

  // Calzada en perspectiva
  const cx = W / 2 + (opts.shift ?? 0)
  for (let y = horizon; y < H; y++) {
    const t = (y - horizon) / (H - horizon)
    const half = 22 + t * t * 300 + t * 90
    const shade = mix([88, 88, 92], [58, 58, 62], t)
    for (let x = Math.floor(cx - half); x < cx + half; x++) {
      const n = (r() - 0.5) * 14
      set(px, x, y, [shade[0] + n, shade[1] + n, shade[2] + n])
    }
    // Líneas de borde
    for (const s of [-1, 1]) {
      const bx = Math.round(cx + s * (half - 4 - t * 8))
      for (let d = 0; d < Math.max(1, Math.round(1 + t * 3)); d++) {
        set(px, bx + d, y, [226, 226, 222])
      }
    }
    // Eje discontinuo
    const seg = Math.floor((y * y) / 900) % 2
    if (seg === 0) {
      const wSeg = Math.max(1, Math.round(1 + t * 5))
      for (let d = -wSeg; d < wSeg; d++) set(px, Math.round(cx) + d, y, [236, 208, 96])
    }
  }
  return { horizon, cx }
}

function poste(px, x, yBase, h, c) {
  for (let y = yBase - h; y < yBase; y++) for (let d = 0; d < 3; d++) set(px, x + d, y, c)
}

/** Catálogo de escenas: cada una evoca una actividad distinta */
const SCENES = {
  alcantarilla(px, r) {
    const { horizon, cx } = baseScene(px, r, { shift: -40 })
    // Cabezal de alcantarilla a la derecha
    fillRect(px, 545, 415, 190, 95, [176, 172, 164])
    fillRect(px, 545, 415, 190, 8, [150, 146, 138])
    // Tubo
    for (let y = 440; y < 500; y++) {
      for (let x = 600; x < 685; x++) {
        const dx = (x - 642) / 42, dy = (y - 470) / 30
        if (dx * dx + dy * dy < 1) set(px, x, y, [38, 34, 30])
      }
    }
    // Material acumulado (obstrucción)
    for (let i = 0; i < 2600; i++) {
      const x = 600 + r() * 86, y = 478 + r() * 26
      set(px, Math.round(x), Math.round(y), mix([120, 104, 80], [92, 80, 62], r()))
    }
    return 'Limpieza de alcantarillas'
  },

  guardavia(px, r) {
    const { horizon, cx } = baseScene(px, r, { shift: 30 })
    // Guardavía metálica en el lado izquierdo, en perspectiva
    for (let i = 0; i < 9; i++) {
      const t = i / 9
      const x = 40 + t * 250
      const yBase = 420 + t * 130
      poste(px, Math.round(x), Math.round(yBase), Math.round(46 + t * 34), [122, 126, 132])
    }
    for (let x = 40; x < 300; x++) {
      const t = (x - 40) / 260
      const y = Math.round(378 + t * 108)
      for (let d = 0; d < Math.round(9 + t * 7); d++) {
        set(px, x, y + d, mix([196, 200, 206], [150, 154, 160], (d % 4) / 4))
      }
    }
    return 'Reparacion de guardavias'
  },

  senal(px, r) {
    const { horizon } = baseScene(px, r, { shift: 20 })
    // Señal preventiva romboidal
    const sx = 190, sy = 250, s = 62
    poste(px, sx - 2, sy + s + 96, 96, [138, 140, 146])
    for (let y = -s; y <= s; y++) {
      for (let x = -s; x <= s; x++) {
        if (Math.abs(x) + Math.abs(y) <= s) {
          const borde = Math.abs(x) + Math.abs(y) > s - 7
          set(px, sx + x, sy + y, borde ? [24, 24, 26] : [242, 186, 32])
        }
      }
    }
    // Símbolo interior
    fillRect(px, sx - 4, sy - 26, 8, 34, [24, 24, 26])
    fillRect(px, sx - 4, sy + 16, 8, 8, [24, 24, 26])
    return 'Reposicion de senales verticales'
  },

  bacheo(px, r) {
    const { horizon, cx } = baseScene(px, r)
    // Parche de bacheo sobre la calzada
    for (let y = 430; y < 520; y++) {
      const t = (y - 430) / 90
      const half = 70 + t * 60
      for (let x = Math.round(cx - half + 40); x < cx + half - 20; x++) {
        set(px, x, y, mix([30, 30, 32], [46, 46, 48], r()))
      }
    }
    // Cono de seguridad
    for (let y = 470; y < 530; y++) {
      const t = (y - 470) / 60
      const half = 3 + t * 13
      for (let x = Math.round(250 - half); x < 250 + half; x++) {
        const banda = (y % 22) < 8
        set(px, x, y, banda ? [238, 240, 240] : [232, 96, 24])
      }
    }
    fillRect(px, 232, 528, 36, 6, [212, 84, 20])
    return 'Bacheo superficial'
  },

  vegetacion(px, r) {
    const { horizon, cx } = baseScene(px, r, { shift: -20 })
    // Vegetación invasiva en el derecho de vía
    for (let i = 0; i < 5200; i++) {
      const x = r() * 300
      const y = horizon + 40 + r() * (H - horizon - 60)
      const t = (y - horizon) / (H - horizon)
      if (x > 120 + t * 180) continue
      set(px, Math.round(x), Math.round(y), mix([74, 108, 52], [116, 148, 66], r()))
    }
    for (let i = 0; i < 26; i++) {
      const bx = r() * 260, by = horizon + 60 + r() * 320
      for (let h = 0; h < 26 + r() * 30; h++) {
        set(px, Math.round(bx + Math.sin(h / 6) * 3), Math.round(by - h), [88, 122, 58])
      }
    }
    return 'Roce y desbroce'
  },

  cuneta(px, r) {
    const { horizon, cx } = baseScene(px, r, { shift: 60 })
    // Cuneta revestida a la izquierda
    for (let y = horizon + 30; y < H; y++) {
      const t = (y - horizon - 30) / (H - horizon - 30)
      const x0 = 30 + t * 90, w = 40 + t * 70
      for (let x = Math.round(x0); x < x0 + w; x++) {
        const prof = (x - x0) / w
        set(px, x, y, mix([168, 164, 156], [128, 124, 118], Math.abs(prof - 0.5) * 2))
      }
      // Sedimento en el fondo
      for (let x = Math.round(x0 + w * 0.3); x < x0 + w * 0.7; x++) {
        if (r() > 0.35) set(px, x, y, mix([124, 108, 82], [96, 84, 64], r()))
      }
    }
    return 'Limpieza de cunetas'
  },

  posteSOS(px, r) {
    const { horizon } = baseScene(px, r, { shift: 40 })
    // Poste SOS naranja
    const sx = 165
    fillRect(px, sx, 280, 26, 190, [232, 108, 28])
    fillRect(px, sx - 10, 262, 46, 30, [244, 244, 240])
    fillRect(px, sx - 6, 270, 38, 6, [30, 30, 34])
    // Panel solar
    fillRect(px, sx - 16, 240, 58, 16, [42, 56, 96])
    for (let x = sx - 16; x < sx + 42; x += 8) for (let y = 240; y < 256; y++) set(px, x, y, [70, 86, 130])
    return 'Mantenimiento de postes SOS'
  },

  senalizacionZona(px, r) {
    const { horizon, cx } = baseScene(px, r)
    // Fila de conos canalizando
    for (let i = 0; i < 6; i++) {
      const t = i / 6
      const bx = cx - 60 - t * 120
      const by = 430 + t * 110
      const hgt = 34 + t * 26
      for (let y = by - hgt; y < by; y++) {
        const tt = (y - (by - hgt)) / hgt
        const half = 2 + tt * (7 + t * 6)
        for (let x = Math.round(bx - half); x < bx + half; x++) {
          const banda = ((y - (by - hgt)) % Math.max(6, Math.round(hgt / 4))) < Math.max(2, hgt / 8)
          set(px, x, y, banda ? [238, 240, 240] : [232, 96, 24])
        }
      }
    }
    return 'Senalizacion de zona de trabajo'
  },
}

/** Banda inferior con la marca de agua, igual que la de la cámara real */
function watermark(px, data) {
  const boxH = 118
  const y0 = H - boxH

  // Degradado oscuro
  for (let y = y0 - 30; y < H; y++) {
    const t = Math.max(0, (y - (y0 - 30)) / (boxH + 30))
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      const a = Math.min(0.9, t * 1.15)
      px[i] = Math.round(px[i] * (1 - a) + 6 * a)
      px[i + 1] = Math.round(px[i + 1] * (1 - a) + 12 * a)
      px[i + 2] = Math.round(px[i + 2] * (1 - a) + 32 * a)
    }
  }

  // Cinta ámbar
  fillRect(px, 0, y0, W, 3, [245, 163, 20])

  const AMBER = [245, 163, 20]
  const WHITE = [255, 255, 255]
  const GREY = [176, 182, 196]

  // Encabezado
  drawText(px, W, H, 'SIGOV', 16, y0 + 14, 2, AMBER)
  drawText(px, W, H, data.servicio.slice(0, 34), 90, y0 + 16, 1, GREY)
  const et = 'EVIDENCIA GEORREFERENCIADA'
  drawText(px, W, H, et, W - 16 - textWidth(et, 1), y0 + 16, 1, GREY)

  // Columna izquierda: GPS y fecha
  drawText(px, W, H, data.coords, 16, y0 + 40, 2, WHITE)
  drawText(px, W, H, data.precision, 16, y0 + 62, 1, GREY)
  drawText(px, W, H, data.fecha, 16, y0 + 80, 2, WHITE)

  // Columna derecha: contexto
  const right = [data.tramo, data.actividad, data.fase]
  right.forEach((t, i) => {
    const s = (t ?? '').slice(0, 40)
    drawText(px, W, H, s, W - 16 - textWidth(s, 1), y0 + 42 + i * 16, 1, i === 0 ? WHITE : GREY)
  })
}

function buildScene(kind, seed, wm) {
  const px = Buffer.alloc(W * H * 3)
  const r = rng(seed)
  const actividad = SCENES[kind](px, r)
  watermark(px, { ...wm, actividad: wm.actividad ?? actividad })
  return encodePNG(W, H, px)
}

// ═══════════════════════════════════════════════════════════════════════════
// Generación y subida
// ═══════════════════════════════════════════════════════════════════════════
const KINDS = Object.keys(SCENES)
const FASES = ['ANTES', 'DURANTE', 'DESPUES']
const TRAMOS = [
  'PATIVILCA - HUARMEY', 'HUARMEY - CASMA', 'CASMA - CHIMBOTE',
  'CHIMBOTE - SANTA', 'SANTA - VIRU', 'VIRU - TRUJILLO',
]

console.log(`${C.bold}\n  SIGOV · Generador de evidencias fotográficas${C.reset}`)

// 1. Construir el catálogo: cada escena en sus 3 fases
const catalogo = []
let seed = 7
for (const kind of KINDS) {
  for (const fase of FASES) {
    const tramo = TRAMOS[seed % TRAMOS.length]
    const km = 3 + (seed * 37) % 350
    const m = (seed * 613) % 1000
    const lat = -10.7 + ((seed * 71) % 260) / 100
    const lng = -77.77 - ((seed * 53) % 130) / 100
    const buf = buildScene(kind, seed * 9973, {
      servicio: 'RED VIAL 4 PATIVILCA-TRUJILLO',
      coords: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      precision: `PRECISION ${(3 + (seed % 9))}.${seed % 10} M   ALT ${40 + (seed * 7) % 320} M`,
      fecha: `${String(1 + seed % 28).padStart(2, '0')}/0${1 + seed % 8}/2026  0${7 + seed % 3}:${String((seed * 13) % 60).padStart(2, '0')}:${String((seed * 29) % 60).padStart(2, '0')}`,
      tramo: `${tramo}  ${km}+${String(m).padStart(3, '0')}`,
      fase,
    })
    catalogo.push({ name: `${kind}_${fase.toLowerCase()}.png`, buf, kind, fase })
    seed++
  }
}

console.log(`  ${C.dim}${catalogo.length} escenas generadas (${KINDS.length} tipos x ${FASES.length} fases)${C.reset}`)

// 2. Subir el catálogo BAJO EL PREFIJO DE CADA SERVICIO
//    La política de Storage resuelve el servicio desde el primer segmento de
//    la ruta; una ruta fuera de ese prefijo no sería legible por los usuarios.
const { data: servicios } = await sb.from('services').select('id, code').is('deleted_at', null)
let subidas = 0
for (const svc of servicios ?? []) {
  for (const c of catalogo) {
    const key = `${svc.id}/catalogo/${c.name}`
    const { error } = await sb.storage
      .from('evidencias')
      .upload(key, c.buf, { contentType: 'image/png', upsert: true })
    if (error) console.log(`  ${C.bad}x${C.reset} ${key}: ${error.message}`)
    else subidas++
  }
}
console.log(`  ${C.ok}✓${C.reset} ${subidas} imágenes subidas (${catalogo.length} escenas x ${servicios.length} servicios)`)

// 3. Repartir las evidencias sembradas entre las escenas del catálogo
//    El trigger de inmutabilidad protege storage_path: se desactiva solo para
//    esta corrección de la siembra y se vuelve a activar de inmediato.
const REF = process.env.SUPABASE_PROJECT_REF
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

const byPhase = {}
for (const f of ['antes', 'durante', 'despues']) {
  byPhase[f] = catalogo.filter((c) => c.fase.toLowerCase() === f).map((c) => c.name)
}
const general = catalogo.map((c) => c.name)

// La ruta se compone con el service_id de cada evidencia
const arr = (list) => `array[${list.map((k) => `'catalogo/${k}'`).join(',')}]`

console.log(`  ${C.dim}asignando archivos a los registros sembrados…${C.reset}`)

const result = await sql(`
alter table public.evidences disable trigger t_ev_guard;

with numeradas as (
  select id, phase,
         row_number() over (partition by phase order by taken_at) as rn
    from public.evidences
   where deleted_at is null
)
update public.evidences e
   set storage_path = e.service_id || '/' || case n.phase
         when 'antes'   then (${arr(byPhase.antes)})[1 + (n.rn % ${byPhase.antes.length})]
         when 'durante' then (${arr(byPhase.durante)})[1 + (n.rn % ${byPhase.durante.length})]
         when 'despues' then (${arr(byPhase.despues)})[1 + (n.rn % ${byPhase.despues.length})]
         else (${arr(general)})[1 + (n.rn % ${general.length})]
       end,
       mime_type = 'image/png',
       thumb_path = null
  from numeradas n
 where n.id = e.id;

alter table public.evidences enable trigger t_ev_guard;

select count(*) as evidencias_con_archivo
  from public.evidences
 where storage_path like '%/catalogo/%';
`)

console.log(`  ${C.ok}✓${C.reset} ${result?.[0]?.evidencias_con_archivo ?? '?'} evidencias apuntando a un archivo real`)

// 4. Verificación: firmar una URL y comprobar que descarga
const { data: sample } = await sb
  .from('evidences').select('storage_path').limit(1).single()
const { data: signed } = await sb.storage
  .from('evidencias').createSignedUrl(sample.storage_path, 60)

if (signed?.signedUrl) {
  const check = await fetch(signed.signedUrl)
  console.log(
    check.ok
      ? `  ${C.ok}✓${C.reset} verificación: la imagen se descarga (${(Number(check.headers.get('content-length')) / 1024).toFixed(0)} KB)`
      : `  ${C.bad}x${C.reset} la URL firmada devolvió ${check.status}`
  )
}

console.log(`\n  ${C.ok}${C.bold}Galería de evidencias operativa.${C.reset}\n`)
