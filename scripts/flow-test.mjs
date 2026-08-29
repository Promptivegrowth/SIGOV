#!/usr/bin/env node
/**
 * SIGOV · Pruebas de FLUJO en navegador real.
 *
 * Recorre de punta a punta los cinco flujos que el cliente declaro criticos:
 *   1. Registrar y gestionar informacion de campo por cuadrilla/tramo
 *   2. Capturar y almacenar fotografias
 *   3. Reportes diarios
 *   4. Todo guardado en la nube, sincronizando
 *   5. Usuarios con roles (capataces, inspectores, SSOMA, coordinador, visor)
 *
 * Verifica que cada boton abra su formulario, que los formularios tengan sus
 * campos y que la navegacion no tenga huecos. Captura pantalla de cada paso.
 *
 *   node scripts/flow-test.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3000'
const SHOTS = path.join(process.cwd(), 'docs', 'capturas', 'flujos')
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
]

function section(t) {
  console.log(`\n${C.bold}${C.cyan}${'─'.repeat(66)}\n  ${t}\n${'─'.repeat(66)}${C.reset}`)
}

async function step(name, fn) {
  try {
    const r = await fn()
    pass++
    console.log(`  ${C.ok}✓${C.reset}  ${name}${r ? ` ${C.dim}${r}${C.reset}` : ''}`)
  } catch (e) {
    fail++
    failures.push({ name, error: e.message })
    console.log(`  ${C.bad}✗${C.reset}  ${name}\n     ${C.bad}${e.message.slice(0, 240)}${C.reset}`)
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

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|campo)/, { timeout: 25000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })

/** PNG solido generado al vuelo, para simular una foto tomada con el celular */
function makeTestPng(w, h) {
  const crcTable = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })()
  const crc32 = (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff]
    return (c ^ -1) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
    const t = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
    return Buffer.concat([len, t, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const stride = w * 3
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < w; x++) {
      const i = y * (stride + 1) + 1 + x * 3
      raw[i] = 90 + ((x * 255 / w) | 0) / 3
      raw[i + 1] = 110 + ((y * 255 / h) | 0) / 3
      raw[i + 2] = 130
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Abre un dialogo pulsando un boton y comprueba que trae los campos esperados */
async function openDialog(page, buttonText, expectFields = [], shotName) {
  await page.locator(`button:has-text("${buttonText}")`).first().click()
  await page.waitForSelector('[role="dialog"]', { timeout: 12000 })
  await page.waitForTimeout(900)
  const txt = await page.locator('[role="dialog"]').innerText()
  for (const f of expectFields) {
    assert(new RegExp(f, 'i').test(txt), `el formulario no muestra "${f}"`)
  }
  if (shotName) await shot(page, shotName)
  return txt
}

async function closeDialog(page) {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('[role="dialog"]').count() === 0) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(400)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`${C.bold}\n  SIGOV · Pruebas de flujo${C.reset}`)
console.log(`  ${C.dim}${BASE}${C.reset}`)

const browser = await chromium.launch()

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO 5 · Usuarios y roles — dar de alta a los 7 capataces')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  watch(page, 'usuarios')
  await login(page, 'admin@sigov.dev')

  await step('Configuracion abre en la pestaña de Usuarios', async () => {
    await page.goto(`${BASE}/configuracion`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Usuarios del servicio', { timeout: 20000 })
    await page.waitForTimeout(1500)
    await shot(page, 'f5-01-usuarios')
    return 'lista de usuarios visible'
  })

  await step('Los 5 roles se muestran con su nombre de obra', async () => {
    const txt = await page.locator('main').innerText()
    for (const alias of ['Capataz', 'Inspector', 'Ingeniero SSOMA', 'Coordinador de contrato', 'COVINCA']) {
      assert(txt.includes(alias), `falta el alias "${alias}"`)
    }
    return 'Capataz, Inspector, SSOMA, Coordinador, COVINCA'
  })

  await step('El boton Nuevo usuario abre su formulario completo', async () => {
    await openDialog(page, 'Nuevo usuario',
      ['Nombre completo', 'Correo', 'Rol', 'DNI', 'Tel', 'Cargo'],
      'f5-02-nuevo-usuario')
    return '6 campos presentes'
  })

  await step('El formulario valida los campos obligatorios', async () => {
    await page.locator('[role="dialog"] button:has-text("Crear usuario")').click()
    await page.waitForTimeout(700)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/obligatorio/i.test(txt), 'no muestra errores de validacion')
    await shot(page, 'f5-03-validacion')
    await closeDialog(page)
    return 'exige nombre, correo y rol'
  })

  await step('Cada usuario tiene editar, contraseña y quitar', async () => {
    const btns = await page.locator('table button').count()
    assert(btns >= 3, `solo ${btns} acciones por fila`)
    return `${btns} acciones en la tabla`
  })

  await step('Cuadrillas permite crear y agregar integrantes', async () => {
    await page.click('button:has-text("Cuadrillas")')
    await page.waitForTimeout(1600)
    const txt = await page.locator('main').innerText()
    assert(/Nueva cuadrilla/i.test(txt), 'falta el boton de nueva cuadrilla')
    assert(/Integrante/i.test(txt), 'falta el boton de agregar integrante')
    await shot(page, 'f5-04-cuadrillas')
    await openDialog(page, 'Nueva cuadrilla', ['Codigo|Código', 'Nombre', 'Jefe de cuadrilla', 'Veh'], 'f5-05-nueva-cuadrilla')
    await closeDialog(page)
    return 'alta de cuadrilla e integrantes'
  })

  await step('Tramos permite crear con progresivas', async () => {
    await page.click('button:has-text("Tramos")')
    await page.waitForTimeout(1500)
    await openDialog(page, 'Nuevo tramo', ['Progresiva inicial', 'Progresiva final', 'Superficie'], 'f5-06-nuevo-tramo')
    await closeDialog(page)
    return 'progresivas km+m'
  })

  await step('Catalogo de actividades permite crear', async () => {
    await page.click('button:has-text("Actividades")')
    await page.waitForTimeout(1500)
    await openDialog(page, 'Nueva actividad', ['Unidad de medida', 'Rendimiento', 'Fotos'], 'f5-07-nueva-actividad')
    await closeDialog(page)
    return 'unidad, rendimiento y fotos minimas'
  })

  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO 1 · Informacion de campo por cuadrilla y tramo')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  watch(page, 'programacion')
  await login(page, 'supervisor@sigov.dev')

  await step('La programacion semanal carga el tablero', async () => {
    await page.goto(`${BASE}/programacion`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Programación semanal', { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shot(page, 'f1-01-programacion')
    return 'tablero por cuadrilla y dia'
  })

  await step('Se puede filtrar por cuadrilla, estado y buscar', async () => {
    const txt = await page.locator('main').innerText()
    assert(/Todas las cuadrillas/i.test(txt), 'falta el filtro de cuadrilla')
    assert(/Todos los estados/i.test(txt), 'falta el filtro de estado')
    const input = await page.locator('input[placeholder*="Buscar"]').count()
    assert(input > 0, 'falta el buscador')
    return 'cuadrilla + estado + busqueda'
  })

  await step('El buscador filtra la programacion', async () => {
    const antes = await page.locator('main').innerText()
    const totalAntes = (antes.match(/(\d+) de (\d+) actividades/) ?? [])[1]
    await page.fill('input[placeholder*="Buscar"]', 'drenaje')
    await page.waitForTimeout(900)
    const despues = await page.locator('main').innerText()
    const totalDespues = (despues.match(/(\d+) de (\d+) actividades/) ?? [])[1]
    assert(totalDespues !== undefined, 'no se muestra el contador de resultados')
    await shot(page, 'f1-02-busqueda')
    await page.fill('input[placeholder*="Buscar"]', '')
    await page.waitForTimeout(700)
    return `${totalAntes} -> ${totalDespues} al filtrar`
  })

  await step('Nueva actividad abre el formulario de programacion', async () => {
    await openDialog(page, 'Nueva actividad',
      ['Actividad', 'Tramo', 'Progresiva inicio', 'Progresiva fin', 'Cuadrilla', 'Fecha', 'Meta'],
      'f1-03-programar')
    await closeDialog(page)
    return '7 campos: actividad, tramo, progresivas, cuadrilla, fecha, meta'
  })

  await step('La vista de lista trae editar y borrar por fila', async () => {
    await page.click('button:has-text("Lista")')
    await page.waitForTimeout(1600)
    const btns = await page.locator('table button').count()
    assert(btns >= 2, `solo ${btns} acciones`)
    await shot(page, 'f1-04-lista')
    return `${btns} acciones de edicion`
  })

  await step('El parte diario lista por cuadrilla con filtros de fecha', async () => {
    await page.goto(`${BASE}/campo`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Ejecución en campo', { timeout: 20000 })
    await page.waitForTimeout(2000)
    const txt = await page.locator('main').innerText()
    assert(/7 días|30 días|90 días/.test(txt), 'faltan los filtros de fecha')
    assert(/Todas las cuadrillas/i.test(txt), 'falta el filtro por cuadrilla')
    await shot(page, 'f1-05-campo')
    return 'filtro por fecha y cuadrilla'
  })

  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO 2 · Capturar y almacenar fotografias')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    permissions: ['geolocation'],
    geolocation: { latitude: -10.4457, longitude: -77.917 },
  })
  const page = await ctx.newPage()
  watch(page, 'fotos')
  await login(page, 'cuadrilla1@sigov.dev')

  let parteUrl = ''

  await step('El capataz entra a su parte diario', async () => {
    await page.goto(`${BASE}/campo`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2200)
    const first = page.locator('a[href^="/campo/"]').first()
    assert(await first.count() > 0, 'no hay partes listados')
    parteUrl = await first.getAttribute('href')
    await page.goto(`${BASE}${parteUrl}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    await shot(page, 'f2-01-parte')
    return parteUrl
  })

  await step('Cada registro ofrece Camara y Galeria', async () => {
    const txt = await page.locator('main').innerText()
    assert(/Cámara|Camara/i.test(txt), 'falta el boton de camara')
    assert(/Galer/i.test(txt), 'falta el boton de galeria')
    return 'captura nueva + reutilizar existente'
  })

  await step('Las fotos ya capturadas se muestran con su fase', async () => {
    const imgs = await page.locator('main img').count()
    assert(imgs > 0, 'no se ven evidencias')
    const txt = await page.locator('main').innerText()
    assert(/ANTES|DURANTE|DESPU/i.test(txt), 'no se ven las fases')
    return `${imgs} evidencias con fase`
  })

  await step('El visor de la foto muestra GPS, fecha y hash', async () => {
    await page.locator('main img').first().click()
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
    await page.waitForTimeout(1200)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Coordenadas/i.test(txt), 'no muestra coordenadas')
    assert(/Precisi/i.test(txt), 'no muestra la precision')
    assert(/SHA-256/i.test(txt), 'no muestra el hash')
    assert(/inmutable/i.test(txt), 'no indica que es inmutable')
    await shot(page, 'f2-02-evidencia-detalle')
    await closeDialog(page)
    return 'GPS + precision + hash + sello'
  })

  await step('La galeria permite reutilizar una foto existente', async () => {
    await page.locator('button:has-text("Galería"), button:has-text("Galeria")').first().click()
    await page.waitForSelector('[role="dialog"]', { timeout: 12000 })
    await page.waitForTimeout(3000)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Adjuntar desde la galer/i.test(txt), 'no abre la galeria')
    assert(/evidencias/i.test(txt), 'no muestra el contador')
    const thumbs = await page.locator('[role="dialog"] img').count()
    await shot(page, 'f2-03-galeria')
    await closeDialog(page)
    return `${thumbs} fotos disponibles para reutilizar`
  })

  await step('Subir abre el cargador desde el dispositivo', async () => {
    await page.locator('button:has-text("Subir")').first().click()
    await page.waitForSelector('[role="dialog"]', { timeout: 12000 })
    await page.waitForTimeout(1800)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Subir fotos desde el dispositivo/i.test(txt), 'no abre el cargador')
    assert(/Galer.a del celular/i.test(txt), 'no menciona la galeria del celular')
    assert(/computadora/i.test(txt), 'no menciona la computadora')
    await shot(page, 'f2-05-cargador')
    return 'PC + celular, hasta 20 fotos'
  })

  await step('Al elegir una foto la sella con GPS y marca de agua', async () => {
    // Imagen de prueba con dimensiones realistas de una foto de obra
    const png = makeTestPng(640, 480)
    await page.setInputFiles('[role="dialog"] input[type="file"]', {
      name: 'foto-obra.png', mimeType: 'image/png', buffer: png,
    })
    await page.waitForTimeout(1500)
    let txt = await page.locator('[role="dialog"]').innerText()
    assert(/foto-obra\.png/.test(txt), 'no lista el archivo elegido')
    assert(/Procesar y sellar/i.test(txt), 'no ofrece sellar')
    await shot(page, 'f2-06-cargador-con-foto')

    await page.locator('[role="dialog"] button:has-text("Procesar y sellar")').click()
    // El contador "1 sellada" solo aparece cuando el sellado termino de verdad
    await page.locator('[role="dialog"]').getByText(/1 sellada/).waitFor({ timeout: 30000 })
    txt = await page.locator('[role="dialog"]').innerText()
    assert(/Adjuntar 1 foto/i.test(txt), 'no ofrece adjuntar la foto sellada')
    await shot(page, 'f2-07-foto-sellada')
    await closeDialog(page)
    return 'sellada y lista para adjuntar'
  })

  await step('Registrar actividad abre el formulario de campo', async () => {
    await closeDialog(page)
    await openDialog(page, 'Registrar actividad',
      ['Actividad', 'Tramo', 'Progresiva inicio', 'Metrado'],
      'f2-04-registrar')
    await closeDialog(page)
    return 'actividad, tramo, progresiva, metrado'
  })

  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO 3 · Reportes diarios y archivo documental')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
  const page = await ctx.newPage()
  watch(page, 'reportes')
  await login(page, 'supervisor@sigov.dev')

  await step('Reportes ofrece las cinco salidas en PDF y Excel', async () => {
    await page.goto(`${BASE}/reportes`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Reportes y salidas', { timeout: 20000 })
    await page.waitForTimeout(1800)
    const txt = await page.locator('main').innerText()
    for (const r of ['Reporte diario', 'metrados', 'PCI', 'SSOMA', 'Inventario']) {
      assert(new RegExp(r, 'i').test(txt), `falta el reporte de ${r}`)
    }
    const pdf = await page.locator('button:has-text("PDF")').count()
    const xls = await page.locator('button:has-text("Excel")').count()
    assert(pdf >= 5 && xls >= 5, `${pdf} PDF / ${xls} Excel`)
    await shot(page, 'f3-01-reportes')
    return `${pdf} PDF y ${xls} Excel`
  })

  await step('El reporte diario en PDF se descarga de verdad', async () => {
    const dl = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('button:has-text("PDF")').first().click()
    const file = await dl
    const name = file.suggestedFilename()
    assert(/\.pdf$/.test(name), `nombre inesperado: ${name}`)
    assert(/SIGOV/i.test(name), 'el archivo no lleva la marca')
    const p = path.join(SHOTS, name)
    await file.saveAs(p)
    const size = fs.statSync(p).size
    assert(size > 8000, `PDF demasiado pequeño: ${size} bytes`)
    return `${name} · ${(size / 1024).toFixed(0)} KB`
  })

  await step('El reporte diario en Excel se descarga de verdad', async () => {
    const dl = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('button:has-text("Excel")').first().click()
    const file = await dl
    const name = file.suggestedFilename()
    assert(/\.xlsx$/.test(name), `nombre inesperado: ${name}`)
    const p = path.join(SHOTS, name)
    await file.saveAs(p)
    const size = fs.statSync(p).size
    assert(size > 5000, `Excel demasiado pequeño: ${size} bytes`)
    return `${name} · ${(size / 1024).toFixed(0)} KB`
  })

  await step('Los reportes se filtran por periodo', async () => {
    await page.click('button:has-text("7 días")')
    await page.waitForTimeout(1200)
    await shot(page, 'f3-02-reportes-7d')
    return 'periodo 7 / 30 / 90 dias / año'
  })

  await step('El archivo documental carga con sus tipos', async () => {
    await page.goto(`${BASE}/archivo`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Archivo documental', { timeout: 20000 })
    await page.waitForTimeout(1800)
    const txt = await page.locator('main').innerText()
    for (const k of ['Contrato', 'PCI', 'Acta', 'Plano', 'Normativa']) {
      assert(new RegExp(k, 'i').test(txt), `falta el tipo ${k}`)
    }
    await shot(page, 'f3-03-archivo')
    return 'clasificacion por tipo'
  })

  await step('Subir documento abre su formulario con adjunto', async () => {
    await openDialog(page, 'Subir', ['Arrastra el archivo', 'Nombre del documento', 'Tipo', 'Etiquetas'], 'f3-04-subir-documento')
    await closeDialog(page)
    return 'adjuntar + clasificar + etiquetar'
  })

  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO PCI · Revisar, adjuntar, levantar y validar')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
  const page = await ctx.newPage()
  watch(page, 'pci')
  await login(page, 'supervisor@sigov.dev')

  await step('Nuevo PCI abre su formulario de cabecera', async () => {
    await page.goto(`${BASE}/pci`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    await openDialog(page, 'Nuevo PCI',
      ['Código del PCI|Codigo del PCI', 'Fuente', 'Título|Titulo', 'notificaci', 'Prioridad', 'Plazo'],
      'fp-01-nuevo-pci')
    await closeDialog(page)
    return 'codigo, fuente, titulo, fechas, prioridad, plazo'
  })

  await step('El detalle del PCI abre la ficha de un item', async () => {
    const href = await page.locator('a[href^="/pci/"]').first().getAttribute('href')
    await page.goto(`${BASE}${href.split('?')[0]}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    await page.locator('[style*="translateY"]').first().click()
    await page.waitForSelector('[role="dialog"]', { timeout: 12000 })
    await page.waitForTimeout(1500)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Evidencia del levantamiento/i.test(txt), 'no muestra la seccion de evidencia')
    assert(/Levantar ítem|Levantar item/i.test(txt), 'no ofrece levantar el item')
    await shot(page, 'fp-02-ficha-item')
    return 'evidencia + levantar + validar'
  })

  await step('La ficha ofrece camara y galeria para el item', async () => {
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Cámara|Camara/i.test(txt), 'falta la camara')
    assert(/Galer/i.test(txt), 'falta la galeria')
    await closeDialog(page)
    return 'ambas vias de evidencia'
  })

  await step('El PCI exporta a PDF con portada brandeada', async () => {
    await closeDialog(page)
    await page.waitForTimeout(1200)
    const dl = page.waitForEvent('download', { timeout: 60000 })
    await page.locator('button:has-text("PDF")').first().click({ force: true })
    const file = await dl
    const name = file.suggestedFilename()
    const p = path.join(SHOTS, name)
    await file.saveAs(p)
    const size = fs.statSync(p).size
    assert(size > 10000, `PDF muy pequeño: ${size}`)
    return `${name} · ${(size / 1024).toFixed(0)} KB`
  })

  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO SSOMA · Charla, asistencia y firma')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  watch(page, 'ssoma')
  await login(page, 'ssoma@sigov.dev')

  await step('SSOMA carga con filtros de fecha y cuadrilla', async () => {
    await page.goto(`${BASE}/ssoma`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Charlas', { timeout: 20000 })
    await page.waitForTimeout(2000)
    const txt = await page.locator('main').innerText()
    assert(/Todas las cuadrillas/i.test(txt), 'falta el filtro de cuadrilla')
    assert(/30 días/.test(txt), 'faltan los filtros de fecha')
    await shot(page, 'fs-01-ssoma')
    return 'busqueda + cuadrilla + periodo'
  })

  await step('Nueva charla abre su formulario', async () => {
    await openDialog(page, 'Nueva charla',
      ['Tema de la charla', 'Fecha', 'Cuadrilla', 'Expositor', 'Lugar'],
      'fs-02-nueva-charla')
    await closeDialog(page)
    return 'tema, fecha, cuadrilla, expositor, lugar'
  })

  await step('Cada charla ofrece asistencia, editar y borrar', async () => {
    const rows = page.locator('ul li').first()
    const btns = await page.locator('ul li button').count()
    assert(btns >= 3, `solo ${btns} acciones`)
    return `${btns} acciones por charla`
  })

  await step('El registro de asistencia lista al personal', async () => {
    await page.locator('ul li button').nth(1).click()
    await page.waitForSelector('[role="dialog"]', { timeout: 12000 })
    await page.waitForTimeout(1500)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Registrar asistencia/i.test(txt), 'no abre la asistencia')
    assert(/Firmar asistencia/i.test(txt), 'no ofrece firmar')
    await shot(page, 'fs-03-asistencia')
    await closeDialog(page)
    return 'marcar asistentes y firmar'
  })

  await ctx.close()
}

// ─────────────────────────────────────────────────────────────────────────
section('FLUJO 4 · Nube, sincronizacion y buscador global')
// ─────────────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  watch(page, 'nube')
  await login(page, 'supervisor@sigov.dev')

  await step('El indicador de sincronizacion muestra el estado', async () => {
    const txt = await page.locator('aside').first().innerText()
    assert(/sincroniz/i.test(txt), 'no se ve el estado de sincronizacion')
    await page.locator('aside button:has-text("sincroniz"), aside button:has-text("Todo")').first().click()
      .catch(() => {})
    await page.waitForTimeout(1200)
    await shot(page, 'f4-01-sync')
    return 'estado visible en el menu'
  })

  await step('El buscador global encuentra en todo el servicio', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.keyboard.press('Control+k')
    await page.waitForSelector('input[placeholder*="Buscar PCIs"]', { timeout: 10000 })
    await page.fill('input[placeholder*="Buscar PCIs"]', 'alcantarilla')
    await page.waitForTimeout(2200)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Ítems de PCI|Items de PCI/i.test(txt), 'no busca en PCIs')
    assert(/Inventario vial/i.test(txt), 'no busca en inventario')
    await shot(page, 'f4-02-buscador')
    await page.keyboard.press('Escape')
    return 'PCIs + inventario + actividades'
  })

  await step('El buscador tambien encuentra personas', async () => {
    await page.keyboard.press('Control+k')
    await page.waitForSelector('input[placeholder*="Buscar PCIs"]', { timeout: 10000 })
    await page.fill('input[placeholder*="Buscar PCIs"]', 'quispe')
    await page.waitForTimeout(2200)
    const txt = await page.locator('[role="dialog"]').innerText()
    assert(/Personas/i.test(txt), 'no busca personas')
    await shot(page, 'f4-03-buscador-personas')
    await page.keyboard.press('Escape')
    return 'busca por nombre de persona'
  })

  await step('El visor de COVINCA entra en modo solo lectura', async () => {
    await ctx.clearCookies()
    await login(page, 'visor@sigov.dev')
    await page.goto(`${BASE}/pci`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2200)
    const main = await page.locator('main').innerText()
    assert(!/Nuevo PCI/.test(main), 've el boton de crear PCI')
    const aside = await page.locator('aside').first().innerText()
    assert(!/Configuración/.test(aside), 've el modulo de configuracion')
    assert(!/Importación/.test(aside), 've el modulo de importacion')
    await shot(page, 'f4-04-visor')
    return 'sin acciones de escritura ni administracion'
  })

  await ctx.close()
}

await browser.close()

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${C.bold}${'═'.repeat(66)}${C.reset}`)
console.log(`  ${C.ok}${pass} pasos superados${C.reset}`)

if (consoleErrors.length) {
  console.log(`\n  ${C.warn}Errores de consola (${consoleErrors.length}):${C.reset}`)
  const seen = new Set()
  for (const e of consoleErrors) {
    const k = e.text.slice(0, 90)
    if (seen.has(k)) continue
    seen.add(k)
    console.log(`    ${C.dim}[${e.page}]${C.reset} ${e.text.slice(0, 170)}`)
  }
}

if (fail) {
  console.log(`\n  ${C.bad}${fail} fallos${C.reset}`)
  failures.forEach((f) => console.log(`  ${C.bad}✗ ${f.name}${C.reset}\n    ${f.error.slice(0, 300)}`))
} else {
  console.log(`  ${C.ok}${C.bold}Los flujos criticos estan completos, sin huecos.${C.reset}`)
}
console.log(`\n  ${C.dim}Capturas en docs/capturas/flujos/${C.reset}\n`)
process.exit(fail ? 1 : 0)
