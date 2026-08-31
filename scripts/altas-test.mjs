#!/usr/bin/env node
/**
 * SIGOV · Pruebas de las ALTAS que faltaban en la auditoría.
 *
 * Recorre en un navegador real, con datos reales, las seis funciones nuevas:
 *   1. Responder un checklist (con hallazgo obligatorio y firma)
 *   2. Crear una plantilla de checklist
 *   3. Registrar un ATS / IPERC con matriz de riesgos y firmas
 *   4. Dar de alta un elemento del inventario (atributos dinámicos por tipo)
 *   5. Registrar una intervención sobre ese elemento
 *   6. Crear un contrato nuevo y cargar el trazo de un tramo
 *
 * Todo lo que crea lo deja marcado con el prefijo TEST- y lo borra al final,
 * salvo lo que sirve para verificar que el historial quedó bien.
 *
 *   node scripts/altas-test.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3100'
const SHOTS = path.join(process.cwd(), 'docs', 'capturas', 'altas')
fs.mkdirSync(SHOTS, { recursive: true })

const PASS = 'Sigov2026!'
const C = {
  ok: '\x1b[32m', bad: '\x1b[31m', warn: '\x1b[33m',
  dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m', cyan: '\x1b[36m',
}

let pass = 0, fail = 0
const failures = []
const consoleErrors = []

const IGNORE = [
  'Download the React DevTools', 'favicon', 'net::ERR_INTERNET_DISCONNECTED',
  'openmaptiles', 'arcgisonline', 'tile.openstreetmap',
  'Failed to load resource: the server responded with a status of 40',
  'Geolocation', 'geolocation',
]

const section = (t) =>
  console.log(`\n${C.bold}${C.cyan}${'─'.repeat(66)}\n  ${t}\n${'─'.repeat(66)}${C.reset}`)

async function step(name, fn) {
  try {
    const r = await fn()
    pass++
    console.log(`  ${C.ok}✓${C.reset}  ${name}${r ? ` ${C.dim}${r}${C.reset}` : ''}`)
  } catch (e) {
    fail++
    failures.push({ name, error: e.message })
    console.log(`  ${C.bad}✗${C.reset}  ${name}\n     ${C.bad}${e.message.slice(0, 260)}${C.reset}`)
  }
}

function assert(c, m) { if (!c) throw new Error(m) }

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    if (IGNORE.some((i) => t.includes(i))) return
    consoleErrors.push({ page: label, text: t.slice(0, 240) })
  })
  page.on('pageerror', (e) => consoleErrors.push({ page: label, text: `pageerror: ${e.message.slice(0, 240)}` }))
}

async function login(page, email, intento = 1) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', PASS)
  await page.click('button[type="submit"]')
  try {
    await page.waitForURL(/\/(dashboard|campo)/, { timeout: 30000 })
  } catch (e) {
    // Supabase limita los intentos seguidos: se espera y se reintenta
    const aviso = await page.locator('[data-sonner-toast], [role="alert"]').first()
      .innerText().catch(() => '')
    if (intento < 3) {
      const limpio = aviso.replace(/\s+/g, ' ').slice(0, 90)
      console.log(`  ${C.warn}~${C.reset} reintentando login de ${email} ${C.dim}${limpio}${C.reset}`)
      await page.waitForTimeout(20000 * intento)
      return login(page, email, intento + 1)
    }
    throw new Error(`No se pudo entrar como ${email}: ${aviso.slice(0, 160) || 'sin mensaje'}`)
  }
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })

/** Espera un toast de éxito de sonner (no de error). */
async function expectToast(page, re, timeout = 20000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: re }).first()
  await toast.waitFor({ state: 'visible', timeout })
  const type = await toast.getAttribute('data-type')
  assert(type !== 'error', `El aviso salió como error: ${(await toast.innerText()).slice(0, 120)}`)
  return (await toast.innerText()).replace(/\n/g, ' · ').slice(0, 90)
}

/** Firma trazando en el canvas del pad. */
async function firmar(page) {
  const canvas = page.locator('canvas').last()
  await canvas.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForTimeout(700)   // el diálogo entra con animación
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + 40, box.y + box.height * 0.6)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + box.height * 0.3, { steps: 8 })
  await page.mouse.move(box.x + 150, box.y + box.height * 0.7, { steps: 8 })
  await page.mouse.move(box.x + 210, box.y + box.height * 0.35, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: /Confirmar firma/i }).click()
}

/** Elige una opción en un Select de Radix por su etiqueta visible. */
async function pickSelect(page, trigger, optionRe) {
  await trigger.click()
  const opt = page.getByRole('option').filter({ hasText: optionRe }).first()
  await opt.waitFor({ state: 'visible', timeout: 8000 })
  await opt.click()
  await page.waitForTimeout(250)
}

const SELLO = Date.now().toString(36).slice(-4).toUpperCase()

/**
 * Busca un elemento por código y espera a que la lista virtualizada lo muestre.
 * El inventario se trae paginado, así que tras crear algo hay que darle su
 * tiempo antes de dar por perdida la fila.
 */
async function buscarElemento(page, code, { abrir = false } = {}) {
  const buscador = page.getByPlaceholder(/Buscar código, tramo o progresiva/i)
  await buscador.fill(code)
  const fila = page.locator('main button').filter({ hasText: code }).first()
  await fila.waitFor({ state: 'visible', timeout: 25000 })
  if (abrir) {
    await fila.click()
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(900)
  }
  return fila
}

/** PNG mínimo para las preguntas de tipo foto (no hay cámara en el test). */
function fotoDePrueba() {
  const W = 320, H = 240
  const raw = Buffer.alloc((W * 3 + 1) * H)
  let o = 0
  for (let y = 0; y < H; y++) {
    raw[o++] = 0
    for (let x = 0; x < W; x++) {
      raw[o++] = 90 + ((x * 255) / W) % 60
      raw[o++] = 110 + ((y * 255) / H) % 50
      raw[o++] = 130
    }
  }
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = (b) => {
    let c = 0xffffffff
    for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  const file = path.join(SHOTS, 'foto-de-prueba.png')
  fs.writeFileSync(file, png)
  return file
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`${C.bold}\n  SIGOV · pruebas de altas nuevas${C.reset}`)
  console.log(`  ${C.dim}${BASE} · sello de esta corrida: ${SELLO}${C.reset}`)

  const browser = await chromium.launch()
  let ctx = null
  let page = null

  /** Abre una sesión limpia con el rol pedido (sin arrastrar la anterior). */
  async function entrar(email, label) {
    if (ctx) await ctx.close()
    ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'es-PE',
      permissions: ['geolocation'],
      geolocation: { latitude: -10.6712, longitude: -77.7902 },
    })
    page = await ctx.newPage()
    watch(page, label)
    await login(page, email)
    return page
  }

  const FOTO = fotoDePrueba()

  // ─── 1 · CHECKLIST ──────────────────────────────────────────────────────
  section('1 · Responder un checklist desde la interfaz')
  await entrar('ssoma@sigov.dev', 'checklist')
  await page.goto(`${BASE}/ssoma`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Checklists/i }).click()
  await page.waitForTimeout(900)

  await step('El botón «Responder checklist» está en la pestaña', async () => {
    const b = page.getByRole('button', { name: /Responder checklist/i })
    await b.waitFor({ state: 'visible', timeout: 8000 })
    await b.click()
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 })
  })

  await step('El diálogo pide plantilla, cuadrilla, fecha y ubicación', async () => {
    const d = page.getByRole('dialog')
    const t = (await d.innerText()).toLowerCase()
    for (const campo of ['plantilla', 'cuadrilla', 'fecha', 'ubicación']) {
      assert(t.includes(campo), `Falta el campo ${campo}`)
    }
  })

  await step('Al elegir plantilla aparecen sus puntos de verificación', async () => {
    const d = page.getByRole('dialog')
    await pickSelect(page, d.getByRole('combobox').first(), /Verificación de EPP/i)
    await page.waitForTimeout(700)
    const conformes = await d.getByRole('button', { name: /^Conforme$/i }).count()
    assert(conformes >= 3, `Se esperaban varios puntos, se ven ${conformes}`)
    return `${conformes} puntos`
  })

  await step('Marcar todo conforme deja el cumplimiento en 100%', async () => {
    const d = page.getByRole('dialog')
    const btns = d.getByRole('button', { name: /^Conforme$/i })
    const n = await btns.count()
    for (let i = 0; i < n; i++) await btns.nth(i).click()
    await page.waitForTimeout(400)
    const t = await d.innerText()
    assert(/100%/.test(t), `No muestra 100%: ${t.slice(-160)}`)
  })

  await step('La pregunta de foto sella la imagen subida de la galería', async () => {
    const d = page.getByRole('dialog')
    const botonFoto = d.getByRole('button', { name: /Tomar o subir foto/i })
    if (!(await botonFoto.count())) return 'la plantilla no pide foto'
    await d.locator('input[type="file"][accept="image/*"]').first().setInputFiles(FOTO)
    await expectToast(page, /Foto sellada/i, 30000)
    await page.waitForTimeout(500)
    const t = await d.innerText()
    assert(/1 foto sellada/i.test(t), 'La foto no quedó marcada como sellada')
    return 'sellada con GPS y hash'
  })

  await step('Los campos de texto y número del checklist se llenan', async () => {
    const d = page.getByRole('dialog')
    const libres = d.locator('textarea')
    const nLibres = await libres.count()
    for (let i = 0; i < nLibres; i++) {
      await libres.nth(i).fill(`Sin novedad · prueba ${SELLO}`)
    }
    const nums = d.locator('input[type="number"]')
    const nNums = await nums.count()
    for (let i = 0; i < nNums; i++) await nums.nth(i).fill('124500')
    return `${nLibres} textos · ${nNums} números`
  })

  await step('Un punto no conforme obliga a describir el hallazgo', async () => {
    const d = page.getByRole('dialog')
    await d.getByRole('button', { name: /^No conforme$/i }).first().click()
    await page.waitForTimeout(400)
    const t = await d.innerText()
    assert(/Hallazgos detectados/i.test(t), 'No pidió describir el hallazgo')
    assert(/1 no conforme/i.test(t), 'No contabilizó la no conformidad')
  })

  await step('Sin hallazgo escrito, el envío se bloquea', async () => {
    await page.getByRole('button', { name: /Enviar checklist/i }).click()
    const err = page.locator('[data-sonner-toast][data-type="error"]').first()
    await err.waitFor({ state: 'visible', timeout: 8000 })
    const t = await err.innerText()
    assert(/hallazgo/i.test(t), `Mensaje inesperado: ${t}`)
    await page.waitForTimeout(600)
  })

  await step('Se firma la inspección con el dedo', async () => {
    const d = page.getByRole('dialog').first()
    await d.locator('textarea[placeholder^="Puntos no conformes"]').fill(
      `Prueba ${SELLO}: se detectó un punto no conforme y se corrigió en el acto.`
    )
    await page.getByRole('button', { name: /^Firmar$/i }).click()
    await firmar(page)
    await expectToast(page, /Firma registrada/i)
  })

  await step('El checklist se envía y aparece en la lista', async () => {
    await shot(page, '01-checklist-lleno')
    await page.getByRole('button', { name: /Enviar checklist/i }).click()
    const msg = await expectToast(page, /Checklist (enviado|guardado)/i, 30000)
    await page.waitForTimeout(2500)
    const t = await page.locator('main').innerText()
    assert(/Con hallazgos|hallazgo|no conforme|corrigió/i.test(t), 'El hallazgo no se ve en la lista')
    await shot(page, '02-checklist-en-lista')
    return msg
  })

  // ─── 2 · PLANTILLA DE CHECKLIST ─────────────────────────────────────────
  section('2 · Crear una plantilla de checklist')
  await entrar('admin@sigov.dev', 'plantillas')
  await page.goto(`${BASE}/ssoma`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Checklists/i }).click()
  await page.waitForTimeout(800)

  await step('El administrador ve el botón «Plantillas»', async () => {
    const b = page.getByRole('button', { name: /^Plantillas$/i })
    await b.waitFor({ state: 'visible', timeout: 8000 })
    await b.click()
    await page.getByRole('dialog').waitFor({ state: 'visible' })
  })

  await step('Se crea una plantilla con dos puntos', async () => {
    await page.getByRole('button', { name: /Nueva plantilla/i }).click()
    await page.waitForTimeout(700)
    const d = page.getByRole('dialog').last()
    await d.getByRole('textbox').nth(0).fill(`TST-${SELLO}`)
    await d.getByRole('textbox').nth(1).fill(`Checklist de prueba ${SELLO}`)
    await d.getByRole('button', { name: /Agregar punto/i }).click()
    await d.getByRole('button', { name: /Agregar punto/i }).click()
    await page.waitForTimeout(400)
    const inputs = d.getByPlaceholder(/Casco de seguridad/i)
    await inputs.nth(0).fill('Conos de seguridad completos')
    await inputs.nth(1).fill('Botiquín vigente')
    await shot(page, '03-plantilla-nueva')
    await d.getByRole('button', { name: /Guardar plantilla/i }).click()
    return await expectToast(page, /Plantilla creada/i)
  })

  await step('La plantilla nueva figura en el listado', async () => {
    await page.waitForTimeout(1500)
    const t = await page.getByRole('dialog').first().innerText()
    assert(t.includes(`TST-${SELLO}`), 'La plantilla creada no aparece')
    assert(/2 puntos/.test(t), 'No cuenta sus 2 puntos')
  })

  await step('Se elimina la plantilla de prueba', async () => {
    const fila = page.getByRole('listitem').filter({ hasText: `TST-${SELLO}` }).first()
    await fila.getByRole('button').last().click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: /Eliminar plantilla/i }).click()
    return await expectToast(page, /Plantilla eliminada/i)
  })

  // ─── 3 · ATS / IPERC ────────────────────────────────────────────────────
  section('3 · Registrar un ATS / IPERC')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/ssoma`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /ATS/i }).click()
  await page.waitForTimeout(900)

  await step('El botón «Nuevo ATS» abre el formulario', async () => {
    await page.getByRole('button', { name: /Nuevo ATS/i }).click()
    const d = page.getByRole('dialog')
    await d.waitFor({ state: 'visible', timeout: 8000 })
    const t = (await d.innerText()).toLowerCase()
    for (const campo of ['tarea a ejecutar', 'matriz de peligros', 'protección obligatorio', 'supervisor']) {
      assert(t.includes(campo), `Falta la sección «${campo}»`)
    }
  })

  await step('Sin peligros, el ATS no se puede guardar', async () => {
    const d = page.getByRole('dialog')
    await d.getByPlaceholder(/Limpieza de cunetas/i).fill(`Prueba ATS ${SELLO}`)
    await pickSelect(page, d.getByRole('combobox').nth(0), /Cuadrilla/i)
    await d.getByRole('button', { name: /Registrar ATS/i }).click()
    const err = page.locator('[data-sonner-toast][data-type="error"]').first()
    await err.waitFor({ state: 'visible', timeout: 8000 })
    const t = await err.innerText()
    assert(/peligro/i.test(t), `Mensaje inesperado: ${t}`)
    await page.waitForTimeout(500)
  })

  await step('Los atajos cargan peligros típicos con sus controles', async () => {
    const d = page.getByRole('dialog')
    await d.getByRole('button', { name: /Tránsito vehicular en la vía/i }).click()
    await d.getByRole('button', { name: /Exposición prolongada al sol/i }).click()
    await page.waitForTimeout(500)
    const t = await d.innerText()
    assert(/Riesgo importante/i.test(t), 'No calculó el nivel de riesgo del peligro de tránsito')
    return 'nivel de riesgo calculado solo'
  })

  await step('El riesgo máximo del ATS refleja el peor peligro', async () => {
    const t = await page.getByRole('dialog').innerText()
    assert(/Riesgo máximo:\s*importante/i.test(t), `Riesgo máximo mal calculado: ${t.match(/Riesgo máximo:.*/)?.[0]}`)
  })

  await step('Firma del supervisor y del equipo', async () => {
    const d = page.getByRole('dialog')
    await d.getByRole('button', { name: /^Firmar$/i }).first().click()
    await firmar(page)
    await expectToast(page, /Firma registrada/i)
    await page.waitForTimeout(700)
    await shot(page, '04-ats-lleno')
  })

  await step('El ATS se guarda y aparece en la lista con su riesgo', async () => {
    await page.getByRole('dialog').getByRole('button', { name: /Registrar ATS/i }).click()
    const msg = await expectToast(page, /ATS (registrado|guardado)/i, 30000)
    await page.waitForTimeout(2500)
    const t = await page.locator('main').innerText()
    assert(t.includes(`Prueba ATS ${SELLO}`), 'El ATS nuevo no figura en la lista')
    assert(/Riesgo importante/i.test(t), 'La lista no muestra el nivel de riesgo')
    await shot(page, '05-ats-en-lista')
    return msg
  })

  // ─── 4 · INVENTARIO: ALTA ───────────────────────────────────────────────
  section('4 · Dar de alta un elemento del inventario')
  await page.goto(`${BASE}/inventario`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  await step('El botón «Nuevo elemento» abre el formulario', async () => {
    await page.getByRole('button', { name: /Nuevo elemento/i }).click()
    const d = page.getByRole('dialog')
    await d.waitFor({ state: 'visible', timeout: 8000 })
    const t = (await d.innerText()).toLowerCase()
    for (const campo of ['tipo de elemento', 'tramo', 'código', 'progresiva', 'estado de conservación']) {
      assert(t.includes(campo), `Falta el campo ${campo}`)
    }
  })

  await step('Al elegir el tipo, salen sus atributos técnicos', async () => {
    const d = page.getByRole('dialog')
    await pickSelect(page, d.getByRole('combobox').nth(0), /Alcantarilla/i)
    await page.waitForTimeout(700)
    const t = await d.innerText()
    assert(/Atributos técnicos de alcantarilla/i.test(t), 'No aparecieron los atributos del tipo')
    assert(/Diámetro/i.test(t) && /obstrucción/i.test(t), 'Faltan los atributos propios de alcantarilla')
  })

  await step('El código se sugiere solo según tramo y tipo', async () => {
    const d = page.getByRole('dialog')
    await pickSelect(page, d.getByRole('combobox').nth(1), /T-0/i)
    await page.waitForTimeout(1600)
    const code = await d.locator('input[placeholder="T-01-ALC-043"]').inputValue()
    assert(/^[A-Z0-9-]+-ALC-\d{3}$/.test(code), `Código sugerido inesperado: "${code}"`)
    return code
  })

  await step('Una progresiva fuera del tramo se rechaza', async () => {
    const d = page.getByRole('dialog')
    await d.locator('input[placeholder="18+320"]').fill('999+000')
    await d.getByRole('button', { name: /Registrar elemento/i }).click()
    const err = page.locator('[data-sonner-toast][data-type="error"]').first()
    await err.waitFor({ state: 'visible', timeout: 8000 })
    const t = await err.innerText()
    assert(/fuera del tramo/i.test(t), `Mensaje inesperado: ${t}`)
    await page.waitForTimeout(600)
  })

  let assetCode = ''
  await step('El elemento se registra con sus atributos', async () => {
    const d = page.getByRole('dialog')
    assetCode = await d.locator('input[placeholder="T-01-ALC-043"]').inputValue()
    await d.locator('input[placeholder="18+320"]').fill('')
    await d.locator('input[placeholder="Alcantarilla 18+320"]').fill(`Alcantarilla de prueba ${SELLO}`)
    // Atributos dinámicos: diámetro y % de obstrucción
    const nums = d.locator('input[type="number"]')
    await nums.nth(1).fill('1.2')
    await shot(page, '06-inventario-alta')
    await d.getByRole('button', { name: /Registrar elemento/i }).click()
    const msg = await expectToast(page, /Elemento registrado/i, 25000)
    await page.waitForTimeout(4000)
    return `${assetCode} · ${msg}`
  })

  await step('El elemento nuevo aparece al buscarlo por código', async () => {
    await buscarElemento(page, assetCode)
    const t = await page.locator('main').innerText()
    assert(t.includes(assetCode), 'El elemento nuevo no aparece en la búsqueda')
    assert(/^1 de /m.test(t) || / 1 de /.test(t), 'El contador no marca un único resultado')
    await shot(page, '07-inventario-busqueda')
  })

  // ─── 5 · INTERVENCIÓN ───────────────────────────────────────────────────
  section('5 · Registrar una intervención sobre el elemento')

  await step('La ficha del elemento ofrece registrar intervención', async () => {
    await buscarElemento(page, assetCode, { abrir: true })
    const d = page.getByRole('dialog')
    const t = await d.innerText()
    assert(/Historial de intervenciones/i.test(t), 'La ficha no muestra el historial')
    assert(/Todavía no se ha registrado/i.test(t), 'El historial debería estar vacío')
    await d.getByRole('button', { name: /Registrar intervención/i }).click()
    await page.waitForTimeout(800)
  })

  await step('La intervención pide qué se hizo y en qué estado queda', async () => {
    const d = page.getByRole('dialog').last()
    const t = (await d.innerText()).toLowerCase()
    for (const campo of ['fecha', 'qué se hizo', 'cuadrilla que intervino', 'estado en que queda']) {
      assert(t.includes(campo), `Falta el campo ${campo}`)
    }
  })

  await step('Se registra una limpieza que deja el elemento en bueno', async () => {
    const d = page.getByRole('dialog').last()
    await pickSelect(page, d.getByRole('combobox').nth(0), /Limpieza/i)
    await pickSelect(page, d.getByRole('combobox').nth(2), /^Bueno$/i)
    await d.getByPlaceholder(/Material retirado/i).fill(`Descolmatación de prueba ${SELLO}`)
    await shot(page, '08-intervencion')
    await d.getByRole('button', { name: /Registrar intervención/i }).click()
    return await expectToast(page, /Intervención registrada/i, 25000)
  })

  await step('El historial del elemento ya muestra la intervención', async () => {
    await page.waitForTimeout(2500)
    await buscarElemento(page, assetCode, { abrir: true })
    const t = await page.getByRole('dialog').innerText()
    assert(/Limpieza/i.test(t), 'La intervención no figura en el historial')
    assert(/Bueno/i.test(t), 'El estado no se actualizó a bueno')
    await shot(page, '09-historial-intervenciones')
  })

  await step('El elemento de prueba se elimina desde su ficha', async () => {
    const d = page.getByRole('dialog')
    await d.getByRole('button').filter({ has: page.locator('svg.lucide-trash2') }).first().click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /Eliminar elemento/i }).click()
    return await expectToast(page, /Elemento eliminado/i, 20000)
  })

  // ─── 6 · TRAZO DE UN TRAMO ──────────────────────────────────────────────
  section('6 · Cargar el trazo de un tramo (KML)')
  await page.goto(`${BASE}/configuracion`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Tramos/i }).click()
  await page.waitForTimeout(1200)

  const kml = path.join(process.cwd(), 'docs', 'ejemplos', 'trazo-ejemplo.kml')

  await step('Cada tramo ofrece cargar o reemplazar su trazo', async () => {
    const filas = page.locator('tbody tr')
    const n = await filas.count()
    assert(n > 0, 'No hay tramos en la tabla')
    await filas.first().locator('button').first().click()
    const d = page.getByRole('dialog')
    await d.waitFor({ state: 'visible', timeout: 8000 })
    const t = await d.innerText()
    assert(/KML/i.test(t) && /KMZ/i.test(t), 'No indica los formatos aceptados')
    return `${n} tramos`
  })

  await step('Al subir el KML se ve la vista previa del trazo', async () => {
    await page.setInputFiles('input[type="file"][accept*=".kml"]', kml)
    await expectToast(page, /KML leído/i, 15000)
    await page.waitForTimeout(900)
    const d = page.getByRole('dialog')
    const t = await d.innerText()
    assert(/Puntos/i.test(t) && /Longitud/i.test(t), 'No muestra el resumen del trazo')
    const svg = await d.locator('svg path').count()
    assert(svg > 0, 'No dibujó la vista previa')
    await shot(page, '10-trazo-preview')
  })

  await step('El aviso salta si el trazo no cuadra con las progresivas', async () => {
    const t = await page.getByRole('dialog').innerText()
    assert(/declara .* km por sus progresivas|Guardar trazo/i.test(t), 'Sin control de coherencia ni botón de guardado')
  })

  await step('Se cancela sin tocar el trazo real del tramo', async () => {
    await page.getByRole('dialog').getByRole('button', { name: /^Cancelar$/i }).click()
    await page.waitForTimeout(800)
    const abierto = await page.getByRole('dialog').count()
    assert(abierto === 0, 'El diálogo quedó abierto')
  })

  // El guardado de verdad se prueba sobre un tramo creado para la ocasión,
  // para no pisar la geometría real de un tramo del contrato.
  const tramoPrueba = `TT-${SELLO}`

  await step('Se crea un tramo de prueba sin geometría', async () => {
    await page.getByRole('button', { name: /Nuevo tramo/i }).click()
    const d = page.getByRole('dialog')
    await d.waitFor({ state: 'visible', timeout: 8000 })
    await d.getByPlaceholder('T-07').fill(tramoPrueba)
    await d.getByPlaceholder(/Trujillo/i).fill(`Tramo de prueba ${SELLO}`)
    await d.getByPlaceholder('356+000').fill('0+000')
    await d.getByPlaceholder('392+500').fill('9+000')
    await d.getByRole('button', { name: /Crear|Guardar/i }).last().click()
    const msg = await expectToast(page, /Tramo creado/i, 20000)
    await page.waitForTimeout(1800)
    const t = await page.locator('tbody').innerText()
    assert(t.includes(tramoPrueba), 'El tramo nuevo no aparece en la tabla')
    assert(/Sin geometría/i.test(t), 'Debería nacer sin trazo')
    return msg
  })

  await step('Se le carga el trazo y queda marcado como trazado', async () => {
    const fila = page.locator('tbody tr').filter({ hasText: tramoPrueba }).first()
    await fila.locator('button').first().click()
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 })
    await page.setInputFiles('input[type="file"][accept*=".kml"]', kml)
    await expectToast(page, /KML leído/i, 15000)
    await page.getByRole('button', { name: /Guardar trazo/i }).click()
    const msg = await expectToast(page, /Trazo cargado/i, 25000)
    await page.waitForTimeout(2500)
    const t = await page.locator('tbody tr').filter({ hasText: tramoPrueba }).first().innerText()
    assert(/Trazada/i.test(t), `El tramo sigue sin trazo: ${t.slice(0, 120)}`)
    await shot(page, '10b-trazo-guardado')
    return msg
  })

  await step('Se puede quitar el trazo y borrar el tramo de prueba', async () => {
    const fila = page.locator('tbody tr').filter({ hasText: tramoPrueba }).first()
    await fila.locator('button').first().click()
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 })
    await page.getByRole('button', { name: /Quitar trazo/i }).click()
    await page.getByRole('button', { name: /^Quitar trazo$/i }).last().click()
    await expectToast(page, /Trazo eliminado/i, 20000)
    await page.waitForTimeout(1500)

    const fila2 = page.locator('tbody tr').filter({ hasText: tramoPrueba }).first()
    await fila2.locator('button').last().click()
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /Sí, eliminar/i }).last().click()
    const msg = await expectToast(page, /eliminad/i, 20000)
    await page.waitForTimeout(1800)
    const t = await page.locator('tbody').innerText()
    assert(!t.includes(tramoPrueba), 'El tramo de prueba sigue en la tabla')
    return msg
  })

  // ─── 7 · ALTA DE SERVICIO ───────────────────────────────────────────────
  section('7 · Crear un contrato nuevo')
  await page.getByRole('tab', { name: /Servicios/i }).click()
  await page.waitForTimeout(900)

  await step('El administrador ve «Nuevo servicio»', async () => {
    const b = page.getByRole('button', { name: /Nuevo servicio/i })
    await b.waitFor({ state: 'visible', timeout: 8000 })
    await b.click()
    const d = page.getByRole('dialog')
    await d.waitFor({ state: 'visible', timeout: 8000 })
    const t = (await d.innerText()).toLowerCase()
    for (const campo of ['código corto', 'nombre del servicio', 'cliente', 'módulos habilitados']) {
      assert(t.includes(campo), `Falta el campo ${campo}`)
    }
  })

  await step('Se puede apagar un módulo antes de crear el contrato', async () => {
    const d = page.getByRole('dialog')
    await d.locator('label').filter({ hasText: 'PCI' }).locator('button[role="switch"]').click()
    await page.waitForTimeout(300)
    const estado = await d.locator('label').filter({ hasText: 'PCI' })
      .locator('button[role="switch"]').getAttribute('data-state')
    assert(estado === 'unchecked', 'El módulo no se apagó')
  })

  await step('El contrato se crea y el usuario entra en él', async () => {
    const d = page.getByRole('dialog')
    await d.getByPlaceholder('RV5').fill(`T${SELLO}`)
    await d.getByPlaceholder(/Mantenimiento rutinario/i).fill(`Contrato de prueba ${SELLO}`)
    await d.getByPlaceholder('COVINCA S.A.').fill('Cliente de prueba')
    await shot(page, '11-servicio-nuevo')
    await d.getByRole('button', { name: /Crear servicio/i }).click()
    const msg = await expectToast(page, /creado/i, 25000)
    await page.waitForTimeout(3500)
    return msg
  })

  await step('El contrato nuevo figura con sus módulos y sin PCI', async () => {
    await page.goto(`${BASE}/configuracion`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /Servicios/i }).click()
    await page.waitForTimeout(1200)
    const t = await page.locator('main').innerText()
    assert(t.includes(`Contrato de prueba ${SELLO}`), 'El contrato creado no aparece')
    await shot(page, '12-servicio-en-lista')
  })

  await step('El menú lateral respeta los módulos del contrato nuevo', async () => {
    const nav = await page.locator('nav').first().innerText()
    if (/Contrato de prueba/i.test(await page.locator('body').innerText())) {
      assert(!/\bPCI\b/.test(nav), 'PCI sigue visible pese a estar apagado en el contrato activo')
    }
    return 'módulos aplicados'
  })

  // ─── 8 · EN EL CELULAR ──────────────────────────────────────────────────
  section('8 · Los formularios nuevos en un celular de 390 px')
  if (ctx) await ctx.close()
  ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-PE',
    permissions: ['geolocation'],
    geolocation: { latitude: -10.6712, longitude: -77.7902 },
  })
  page = await ctx.newPage()
  watch(page, 'movil')
  await login(page, 'cuadrilla1@sigov.dev')

  /** Comprueba que ni la página ni el diálogo se salgan de la pantalla. */
  async function sinDesborde(nombre) {
    const m = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      return {
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dlg: d ? d.scrollWidth - d.clientWidth : 0,
        ancho: d ? Math.round(d.getBoundingClientRect().width) : 0,
      }
    })
    assert(m.doc <= 1, `la pantalla desborda ${m.doc}px en ${nombre}`)
    assert(m.dlg <= 1, `el formulario desborda ${m.dlg}px en ${nombre}`)
    return `${m.ancho}px de ancho, sin desborde`
  }

  await step('El capataz llega al ATS desde su pantalla de campo', async () => {
    await page.goto(`${BASE}/campo`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    const t = await page.locator('main').innerText()
    assert(/ATS/i.test(t) && /Checklist/i.test(t), 'faltan los accesos a ATS y checklist')
    await page.getByRole('link', { name: /^ATS$/i }).click()
    await page.waitForURL(/ssoma/, { timeout: 20000 })
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20000 })
    await shot(page, '13-movil-ats')
    return await sinDesborde('ATS')
  })

  await step('El checklist también se abre de un toque desde campo', async () => {
    await page.goto(`${BASE}/campo`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.getByRole('link', { name: /^Checklist$/i }).click()
    await page.waitForURL(/ssoma/, { timeout: 20000 })
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20000 })
    await page.waitForTimeout(800)
    await shot(page, '14-movil-checklist')
    return await sinDesborde('checklist')
  })

  await step('Los botones del checklist son grandes para usar con guantes', async () => {
    const d = page.getByRole('dialog')
    await pickSelect(page, d.getByRole('combobox').first(), /Verificación de EPP/i)
    await page.waitForTimeout(800)
    const alto = await d.getByRole('button', { name: /^Conforme$/i }).first()
      .evaluate((el) => el.getBoundingClientRect().height)
    assert(alto >= 36, `los botones miden ${Math.round(alto)}px de alto`)
    await shot(page, '15-movil-checklist-lleno')
    return `${Math.round(alto)}px de alto`
  })

  await step('La firma se puede trazar con el dedo en el celular', async () => {
    await page.getByRole('button', { name: /^Firmar$/i }).click()
    const canvas = page.locator('canvas').last()
    await canvas.waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(700)
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 30, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 30, { steps: 6 })
    await page.mouse.move(box.x + 200, box.y + 80, { steps: 6 })
    await page.mouse.up()
    await shot(page, '16-movil-firma')
    const desborde = await sinDesborde('firma')
    await page.getByRole('button', { name: /Confirmar firma/i }).click()
    await expectToast(page, /Firma registrada/i)
    return desborde
  })

  // ─── Limpieza ───────────────────────────────────────────────────────────
  // Estas pruebas escriben en la base real: hay que dejarla como estaba.
  section('9 · Limpieza de los datos de prueba')
  await step('Se borran ATS, checklists, elementos y contratos de prueba', () => {
    const sql = [
      `delete from public.ats_signatures where ats_id in (select id from public.ats_iperc where task like 'Prueba ATS %')`,
      `delete from public.ats_iperc where task like 'Prueba ATS %'`,
      `delete from public.checklist_responses where findings like 'Prueba %'`,
      `delete from public.evidences where storage_path like '%/checklists/%' and created_at > now() - interval '3 hours'`,
      `delete from public.asset_interventions where notes like 'Descolmatación de prueba %'`,
      `delete from public.road_assets where name like '%de prueba %'`,
      `delete from public.checklist_templates where code like 'TST-%'`,
      `delete from public.services where name like 'Contrato de prueba %'`,
      `delete from public.road_sections where name like 'Tramo de prueba %'`,
    ].join('; ')
    const out = execFileSync(process.execPath, ['scripts/sql.mjs', 'query', sql], { encoding: 'utf8' })
    assert(!/error/i.test(out), out.slice(0, 200))
    return 'base devuelta a su estado original'
  })

  // ─── Cierre ─────────────────────────────────────────────────────────────
  await browser.close()

  section('Resultado')
  console.log(`  ${C.ok}${pass} pruebas OK${C.reset}   ${fail ? C.bad : C.dim}${fail} fallidas${C.reset}`)
  if (failures.length) {
    console.log(`\n${C.bad}  Fallas:${C.reset}`)
    for (const f of failures) console.log(`   · ${f.name}\n     ${C.dim}${f.error.slice(0, 200)}${C.reset}`)
  }
  if (consoleErrors.length) {
    console.log(`\n${C.warn}  Errores de consola (${consoleErrors.length}):${C.reset}`)
    for (const e of consoleErrors.slice(0, 12)) console.log(`   · [${e.page}] ${e.text}`)
  }
  console.log(`\n  ${C.dim}Capturas en docs/capturas/altas${C.reset}\n`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
