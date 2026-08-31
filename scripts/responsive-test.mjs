#!/usr/bin/env node
/**
 * SIGOV · Auditoría de responsividad.
 *
 * Recorre cada pantalla en anchos de celular reales y detecta:
 *   · desbordamiento horizontal de la página (la señal de que algo se corta)
 *   · qué elemento concreto lo provoca
 *   · texto que se sale de su contenedor
 *
 *   node scripts/responsive-test.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3000'
const SHOTS = path.join(process.cwd(), 'docs', 'capturas', 'responsive')
fs.mkdirSync(SHOTS, { recursive: true })

const C = {
  ok: '\x1b[32m', bad: '\x1b[31m', warn: '\x1b[33m',
  dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m', cyan: '\x1b[36m',
}

// Anchos reales de los celulares que usan en obra
const VIEWPORTS = [
  { name: 'movil-360', width: 360, height: 800 },   // gama de entrada
  { name: 'movil-390', width: 390, height: 844 },   // el mas comun
  { name: 'movil-430', width: 430, height: 932 },   // gama alta
  { name: 'tablet-768', width: 768, height: 1024 },
]

const RUTAS = [
  ['/dashboard', 'Dashboard'],
  ['/campo', 'Campo'],
  ['/programacion', 'Programacion'],
  ['/pci', 'PCIs'],
  ['/inventario', 'Inventario'],
  ['/ssoma', 'SSOMA'],
  ['/reportes', 'Reportes'],
  ['/archivo', 'Archivo'],
  ['/configuracion', 'Configuracion'],
  ['/perfil', 'Perfil'],
]

let problemas = 0
const detalle = []

const browser = await chromium.launch()

console.log(`${C.bold}\n  SIGOV · Auditoría de responsividad${C.reset}`)
console.log(`  ${C.dim}${BASE}${C.reset}`)

for (const vp of VIEWPORTS) {
  console.log(`\n${C.bold}${C.cyan}━━ ${vp.name} (${vp.width}px) ${'━'.repeat(44 - vp.name.length)}${C.reset}`)

  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.width < 768,
    hasTouch: vp.width < 768,
  })
  const page = await ctx.newPage()

  // Sesión de supervisor: ve todos los módulos
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', 'supervisor@sigov.dev')
  await page.fill('#password', 'Sigov2026!')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 25000 })
  await page.waitForTimeout(1500)

  for (const [ruta, label] of RUTAS) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2200)

    const info = await page.evaluate((vw) => {
      const docW = document.documentElement.scrollWidth
      const overflow = docW - vw

      // Elementos que sobresalen del viewport
      const culpables = []
      const vistos = new Set()
      for (const el of document.querySelectorAll('main *, header *, nav *')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const sobra = Math.round(r.right - vw)
        if (sobra <= 2) continue
        // Nos quedamos con el ancestro mas alto que desborda
        let padreDesborda = false
        let p = el.parentElement
        while (p && p !== document.body) {
          const pr = p.getBoundingClientRect()
          if (pr.right - vw > 2) { padreDesborda = true; break }
          p = p.parentElement
        }
        if (padreDesborda) continue

        const cls = (el.className && typeof el.className === 'string')
          ? el.className.slice(0, 90) : ''
        const key = el.tagName + cls
        if (vistos.has(key)) continue
        vistos.add(key)
        culpables.push({
          tag: el.tagName.toLowerCase(),
          cls,
          sobra,
          texto: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48),
        })
      }

      // Texto recortado dentro de su caja
      let recortados = 0
      for (const el of document.querySelectorAll('main span, main p, main h1, main h2, main h3, main td, main th')) {
        if (el.children.length) continue
        if (el.scrollWidth > el.clientWidth + 2) recortados++
      }

      return { docW, overflow, culpables: culpables.slice(0, 6), recortados }
    }, vp.width)

    const mal = info.overflow > 2
    if (mal) {
      problemas++
      detalle.push({ vp: vp.name, ruta, ...info })
      console.log(`  ${C.bad}✗${C.reset} ${label.padEnd(14)} ${C.bad}desborda ${info.overflow}px${C.reset}`)
      for (const c of info.culpables) {
        console.log(`      ${C.dim}<${c.tag} class="${c.cls}">${C.reset} +${c.sobra}px  ${C.dim}${c.texto}${C.reset}`)
      }
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${label.toLowerCase()}-MAL.png`) })
    } else {
      console.log(`  ${C.ok}✓${C.reset} ${label.padEnd(14)} ${C.dim}${info.docW}px${info.recortados ? ` · ${info.recortados} textos recortados` : ''}${C.reset}`)
    }
  }

  await ctx.close()
}

await browser.close()

console.log(`\n${C.bold}${'═'.repeat(62)}${C.reset}`)
if (problemas) {
  console.log(`  ${C.bad}${C.bold}${problemas} pantallas con desbordamiento horizontal${C.reset}\n`)
} else {
  console.log(`  ${C.ok}${C.bold}Ninguna pantalla desborda. Todo cabe en el celular.${C.reset}\n`)
}
process.exit(problemas ? 1 : 0)
