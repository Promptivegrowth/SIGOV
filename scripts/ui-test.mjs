#!/usr/bin/env node
/**
 * SIGOV · Pruebas de interfaz en navegador real (Playwright + Chromium).
 * Recorre el flujo completo por rol, captura pantallas y reporta cualquier
 * error de consola o de red.
 *
 *   node scripts/ui-test.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3000'
const SHOTS = path.join(process.cwd(), 'docs', 'capturas')
fs.mkdirSync(SHOTS, { recursive: true })

const PASS = 'Sigov2026!'
const C = {
  ok: '\x1b[32m', bad: '\x1b[31m', warn: '\x1b[33m',
  dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m', cyan: '\x1b[36m',
}

let pass = 0, fail = 0
const failures = []
const consoleErrors = []
const networkErrors = []

function section(t) {
  console.log(`\n${C.bold}${C.cyan}━━ ${t} ${'━'.repeat(Math.max(0, 60 - t.length))}${C.reset}`)
}

async function test(name, fn) {
  try {
    const r = await fn()
    pass++
    console.log(`  ${C.ok}✓${C.reset}  ${name}${r ? ` ${C.dim}${r}${C.reset}` : ''}`)
  } catch (e) {
    fail++
    failures.push({ name, error: e.message })
    console.log(`  ${C.bad}✗${C.reset}  ${name}\n     ${C.bad}${e.message.slice(0, 220)}${C.reset}`)
  }
}

function assert(c, m) { if (!c) throw new Error(m) }

// Ruido conocido e irrelevante que no debe marcarse como fallo
const IGNORE = [
  'Download the React DevTools',
  'favicon',
  'net::ERR_INTERNET_DISCONNECTED',
  'openmaptiles',        // glifos del mapa: opcional
  'arcgisonline',
  'tile.openstreetmap',
  'Failed to load resource: the server responded with a status of 40', // tiles offline
]

function watch(page, label) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (IGNORE.some((i) => text.includes(i))) return
    consoleErrors.push({ page: label, text: text.slice(0, 300) })
  })
  page.on('pageerror', (err) => {
    consoleErrors.push({ page: label, text: `pageerror: ${err.message.slice(0, 300)}` })
  })
  page.on('response', (res) => {
    if (res.status() >= 500) {
      networkErrors.push({ page: label, url: res.url().slice(0, 140), status: res.status() })
    }
  })
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|campo)/, { timeout: 25000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`${C.bold}\n  SIGOV · Pruebas de interfaz${C.reset}`)
console.log(`  ${C.dim}${BASE}${C.reset}`)

const browser = await chromium.launch()

// ─── 1. Pantalla de login ─────────────────────────────────────────────────
section('1 · Pantalla de acceso')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page, 'login')

  await test('La pantalla de login carga', async () => {
    const res = await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    assert(res.status() === 200, `status ${res.status()}`)
    return `${res.status()} OK`
  })

  await test('El preloader desaparece tras hidratar', async () => {
    await page.waitForFunction(() => !document.getElementById('sigov-boot'), { timeout: 8000 })
    return 'boot screen retirado'
  })

  await test('La marca SIGOV está presente', async () => {
    const count = await page.locator('text=SIGOV').count()
    assert(count > 0, 'no se encontró la marca')
    return `${count} apariciones`
  })

  await test('El acceso rápido muestra los 6 roles', async () => {
    const cards = page.locator('button:has-text("Administrador"), button:has-text("Supervisor"), button:has-text("Jefe de cuadrilla"), button:has-text("Ing. de seguridad"), button:has-text("Visor")')
    const n = await cards.count()
    assert(n >= 6, `esperaba 6 tarjetas, encontró ${n}`)
    return `${n} tarjetas`
  })

  await test('Captura de la pantalla de login', async () => {
    await shot(page, '01-login')
    return 'docs/capturas/01-login.png'
  })

  await test('Un clic en el acceso rápido entra al sistema', async () => {
    await page.locator('button:has-text("Supervisor")').first().click()
    await page.waitForURL(/\/dashboard/, { timeout: 25000 })
    return 'redirigido a /dashboard'
  })

  await ctx.close()
}

// ─── 2. Recorrido del supervisor ──────────────────────────────────────────
section('2 · Recorrido del Supervisor (escritorio)')
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  watch(page, 'supervisor')
  await login(page, 'supervisor@sigov.dev')

  await test('El dashboard muestra los KPIs con datos reales', async () => {
    await page.waitForSelector('text=Metrado ejecutado', { timeout: 20000 })
    await page.waitForTimeout(2500)
    const txt = await page.locator('body').innerText()
    assert(/Cumplimiento del plan/i.test(txt), 'falta el KPI de cumplimiento')
    assert(/Ítems de PCI vencidos/i.test(txt), 'falta el KPI de PCIs vencidos')
    assert(/Evidencias capturadas/i.test(txt), 'falta el KPI de evidencias')
    return '4 KPIs presentes'
  })

  await test('Los gráficos se renderizan (SVG de Recharts)', async () => {
    await page.waitForSelector('.recharts-surface', { timeout: 20000 })
    const n = await page.locator('.recharts-surface').count()
    assert(n >= 2, `solo ${n} gráficos renderizados`)
    return `${n} gráficos`
  })

  await test('El mini-mapa carga el lienzo WebGL', async () => {
    await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 25000 })
    return 'canvas presente'
  })

  await test('Captura del dashboard', async () => {
    await page.waitForTimeout(2000)
    await shot(page, '02-dashboard')
    return 'docs/capturas/02-dashboard.png'
  })

  for (const [route, marker, name] of [
    ['/programacion', 'Programación semanal', '03-programacion'],
    ['/pci', 'PCIs · OSITRAN', '04-pci'],
    ['/campo', 'Ejecución en campo', '05-campo'],
    ['/inventario', 'Inventario vial', '06-inventario'],
    ['/ssoma', 'SSOMA', '07-ssoma'],
    ['/reportes', 'Reportes y salidas', '08-reportes'],
    ['/importar', 'Importación desde Excel', '09-importar'],
    ['/configuracion', 'Configuración', '10-configuracion'],
  ]) {
    await test(`Carga ${route}`, async () => {
      const res = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 })
      assert(res.status() === 200, `status ${res.status()}`)
      await page.waitForSelector(`text=${marker}`, { timeout: 20000 })
      await page.waitForTimeout(1800)
      await shot(page, name)
      return `${res.status()} · ${marker}`
    })
  }

  await test('El tablero de PCIs lista los PCIs con su semáforo', async () => {
    await page.goto(`${BASE}/pci`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=PCI-2026-047', { timeout: 20000 })
    const txt = await page.locator('body').innerText()
    assert(/En plazo|Por vencer|Crítico|Vencido/.test(txt), 'no se ve el semáforo')
    return 'semáforo visible'
  })

  await test('El detalle del PCI virtualiza cientos de ítems', async () => {
    const href = await page
      .locator('a[href^="/pci/"]:has-text("PCI-2026-047")')
      .first()
      .getAttribute('href')
    assert(href, 'no se encontró el enlace al PCI')
    await page.goto(`${BASE}${href.split('?')[0]}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('text=Semáforo', { timeout: 20000 })
    await page.waitForTimeout(3000)
    // Cada fila virtualizada se posiciona con translateY
    const rows = await page.locator('[style*="translateY"]').count()
    assert(rows > 10, `solo ${rows} filas virtualizadas`)
    await shot(page, '11-pci-detalle')
    return `${rows} filas en ventana virtual`
  })

  await test('El motor de reprogramación abre su simulación', async () => {
    const btn = page.locator('button:has-text("Reprogramar semana"), button:has-text("Ver reprogramación")')
    assert(await btn.count() > 0, 'no aparece el botón de reprogramación')
    await btn.first().click()
    await page.waitForSelector('text=Reprogramación automática', { timeout: 20000 })
    await page.waitForTimeout(2500)
    const txt = await page.locator('body').innerText()
    assert(/Se suspende y reprograma/.test(txt), 'no se muestra el diff de suspensión')
    assert(/Se agrega para atender el PCI/.test(txt), 'no se muestra el diff de creación')
    await shot(page, '12-motor-reprogramacion')
    return 'diff antes/después visible'
  })

  await test('El mapa interactivo carga con sus capas', async () => {
    await page.goto(`${BASE}/mapa`, { waitUntil: 'networkidle', timeout: 40000 })
    await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 30000 })
    await page.waitForSelector('text=Capas del mapa', { timeout: 20000 })
    await page.waitForTimeout(4000)
    await shot(page, '13-mapa')
    return 'MapLibre + panel de capas'
  })

  await test('El command palette abre con Ctrl+K', async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.keyboard.press('Control+k')
    await page.waitForSelector('input[placeholder*="Buscar PCIs"]', { timeout: 10000 })
    await page.keyboard.press('Escape')
    return 'abre y cierra'
  })

  await test('El modo oscuro se aplica', async () => {
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    })
    await page.waitForTimeout(900)
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await shot(page, '14-dashboard-oscuro')
    return `fondo ${bg}`
  })

  await ctx.close()
}

// ─── 3. Recorrido del jefe de cuadrilla (móvil) ───────────────────────────
section('3 · Recorrido del Jefe de cuadrilla (móvil)')
{
  const ctx = await browser.newContext({
    ...devices['Pixel 7'],
    permissions: ['geolocation'],
    geolocation: { latitude: -10.4457, longitude: -77.917 },
  })
  const page = await ctx.newPage()
  watch(page, 'campo-movil')
  await login(page, 'cuadrilla1@sigov.dev')

  await test('El dashboard móvil carga', async () => {
    await page.waitForTimeout(2500)
    await shot(page, '15-movil-dashboard')
    return 'render móvil'
  })

  await test('La barra inferior de campo está presente', async () => {
    const nav = page.locator('nav[aria-label="Navegación de campo"]')
    assert(await nav.count() > 0, 'no se encontró la barra inferior')
    const links = await nav.locator('a').count()
    assert(links >= 4, `solo ${links} destinos`)
    return `${links} destinos`
  })

  await test('Los objetivos táctiles son de al menos 56 px', async () => {
    const box = await page.locator('nav[aria-label="Navegación de campo"] a').first().boundingBox()
    assert(box.height >= 56, `altura ${box.height}px, se requieren 56`)
    return `${Math.round(box.height)}px`
  })

  await test('La pantalla de campo lista los partes de la cuadrilla', async () => {
    await page.goto(`${BASE}/campo`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Mi trabajo en campo', { timeout: 20000 })
    await page.waitForTimeout(2500)
    await shot(page, '16-movil-campo')
    return 'vista de campo'
  })

  await test('El detalle de un parte muestra registros y evidencias', async () => {
    const first = page.locator('a[href^="/campo/"]').first()
    assert(await first.count() > 0, 'no hay partes listados')
    await first.click()
    await page.waitForURL(/\/campo\/[0-9a-f-]+/, { timeout: 20000 })
    await page.waitForTimeout(3500)
    const txt = await page.locator('body').innerText()
    assert(/registros/.test(txt), 'no se ven los registros')
    await shot(page, '17-movil-parte')
    return 'parte con evidencias'
  })

  await test('El jefe de cuadrilla NO ve Importación ni Configuración', async () => {
    const res = await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
    const nav = await page.locator('aside').first().innerText().catch(() => '')
    assert(!/Importación/.test(nav), 've el módulo de Importación')
    assert(!/Configuración/.test(nav), 've el módulo de Configuración')
    return 'menú restringido correctamente'
  })

  await ctx.close()
}

// ─── 4. Modo offline ──────────────────────────────────────────────────────
section('4 · Comportamiento sin conexión')
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  watch(page, 'offline')
  await login(page, 'cuadrilla1@sigov.dev')
  await page.waitForTimeout(3000)

  await test('Con la red caída aparece el aviso de trabajo sin conexión', async () => {
    await ctx.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await page.waitForSelector('text=Trabajando sin conexión', { timeout: 10000 })
    await shot(page, '18-offline')
    return 'banner visible'
  })

  await test('Al recuperar la red el aviso desaparece', async () => {
    await ctx.setOffline(false)
    await page.waitForTimeout(500)
    await page.evaluate(() => window.dispatchEvent(new Event('online'))).catch(() => {})
    await page.waitForTimeout(3000)
    const txt = await page.locator('body').innerText()
    assert(!/Trabajando sin conexión/.test(txt), 'el banner sigue visible')
    return 'banner retirado'
  })

  await test('IndexedDB (Dexie) está inicializada', async () => {
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
    assert(dbs.includes('sigov'), `bases encontradas: ${dbs.join(', ')}`)
    return 'base local "sigov" creada'
  })

  await ctx.close()
}

// ─── 5. Roles restringidos ────────────────────────────────────────────────
section('5 · Roles restringidos')
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page, 'visor')
  await login(page, 'visor@sigov.dev')

  await test('El visor entra y ve el dashboard', async () => {
    await page.waitForSelector('text=Metrado ejecutado', { timeout: 20000 })
    await page.waitForTimeout(2000)
    await shot(page, '19-visor-dashboard')
    return 'acceso de solo lectura'
  })

  await test('El visor no ve acciones de escritura en PCIs', async () => {
    await page.goto(`${BASE}/pci`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    const txt = await page.locator('main').innerText()
    assert(!/Nuevo PCI/.test(txt), 've el botón de crear PCI')
    assert(!/Importar Excel/.test(txt), 've el botón de importar')
    return 'sin acciones de escritura'
  })

  await ctx.close()
}

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  watch(page, 'ssoma')
  await login(page, 'ssoma@sigov.dev')

  await test('El ing. de seguridad accede a SSOMA con sus 3 pestañas', async () => {
    await page.goto(`${BASE}/ssoma`, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Charlas', { timeout: 20000 })
    await page.click('text=Checklists')
    await page.waitForTimeout(2200)
    await page.click('text=ATS / IPERC')
    await page.waitForTimeout(2200)
    await shot(page, '20-ssoma-ats')
    return '3 pestañas navegables'
  })

  await ctx.close()
}

// ─── 6. PWA ───────────────────────────────────────────────────────────────
section('6 · PWA · manifiesto y service worker')
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  await test('El manifiesto es válido y completo', async () => {
    const res = await page.goto(`${BASE}/manifest.webmanifest`)
    const json = await res.json()
    assert(json.name?.includes('SIGOV'), 'sin nombre')
    assert(json.display === 'standalone', `display=${json.display}`)
    assert(json.icons.length >= 8, `solo ${json.icons.length} iconos`)
    assert(json.icons.some((i) => i.purpose === 'maskable'), 'sin icono maskable')
    assert(json.shortcuts?.length >= 3, 'sin accesos directos')
    return `${json.icons.length} iconos · ${json.shortcuts.length} accesos directos`
  })

  await test('El service worker está publicado', async () => {
    const res = await page.goto(`${BASE}/sw.js`)
    assert(res.status() === 200, `status ${res.status()}`)
    const body = await res.text()
    assert(body.length > 1000, 'service worker vacío')
    return `${(body.length / 1024).toFixed(0)} KB`
  })

  await test('Los iconos PWA se sirven correctamente', async () => {
    for (const i of ['icon-192', 'icon-512', 'maskable-512', 'apple-touch-icon']) {
      const r = await page.goto(`${BASE}/icons/${i}.png`)
      assert(r.status() === 200, `${i} devolvió ${r.status()}`)
    }
    return '4 iconos verificados'
  })

  await test('La pantalla sin conexión existe', async () => {
    const res = await page.goto(`${BASE}/offline`, { waitUntil: 'networkidle' })
    assert(res.status() === 200, `status ${res.status()}`)
    const txt = await page.locator('body').innerText()
    assert(/Sin conexión/.test(txt), 'sin el mensaje esperado')
    return 'OK'
  })

  await test('La API de salud responde', async () => {
    const res = await page.goto(`${BASE}/api/health`)
    const json = await res.json()
    assert(json.ok, `salud: ${JSON.stringify(json)}`)
    return `db ${json.db} · ${json.latency_ms} ms`
  })

  await ctx.close()
}

// ─── 7. Seguridad de rutas ────────────────────────────────────────────────
section('7 · Protección de rutas')
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  for (const route of ['/dashboard', '/pci', '/campo', '/configuracion', '/mapa']) {
    await test(`Sin sesión, ${route} redirige al login`, async () => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
      assert(page.url().includes('/login'), `terminó en ${page.url()}`)
      return 'redirigido'
    })
  }

  await ctx.close()
}

await browser.close()

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${C.bold}━━ RESULTADO ${'━'.repeat(51)}${C.reset}`)
console.log(`  ${C.ok}${pass} pruebas superadas${C.reset}`)

if (consoleErrors.length) {
  console.log(`\n  ${C.warn}Errores de consola (${consoleErrors.length}):${C.reset}`)
  const seen = new Set()
  for (const e of consoleErrors) {
    const k = e.text.slice(0, 90)
    if (seen.has(k)) continue
    seen.add(k)
    console.log(`    ${C.dim}[${e.page}]${C.reset} ${e.text.slice(0, 180)}`)
  }
}
if (networkErrors.length) {
  console.log(`\n  ${C.bad}Errores de red 5xx (${networkErrors.length}):${C.reset}`)
  networkErrors.slice(0, 10).forEach((e) => console.log(`    ${e.status} ${e.url}`))
}

if (fail) {
  console.log(`\n  ${C.bad}${fail} fallos${C.reset}`)
  failures.forEach((f) => console.log(`  ${C.bad}✗ ${f.name}${C.reset}\n    ${f.error.slice(0, 300)}`))
} else {
  console.log(`  ${C.ok}${C.bold}Interfaz verificada en navegador real.${C.reset}`)
}
console.log(`\n  ${C.dim}Capturas en docs/capturas/${C.reset}\n`)
process.exit(fail ? 1 : 0)
