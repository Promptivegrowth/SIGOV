#!/usr/bin/env node
/**
 * SIGOV · Auditoría estática de la interfaz.
 * Busca huecos de navegación: botones que no hacen nada, enlaces rotos,
 * rutas declaradas sin página y acciones prometidas sin implementación.
 */
import fs from 'node:fs'
import path from 'node:path'

const C = {
  ok: '\x1b[32m', bad: '\x1b[31m', warn: '\x1b[33m',
  dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m', cyan: '\x1b[36m',
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(e.name)) continue
      walk(p, out)
    } else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const files = [...walk('app'), ...walk('components')]
const rel = (f) => f.split(path.sep).join('/')

// ─── 1. Botones sin acción ────────────────────────────────────────────────
const deadButtons = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const re = /<Button\b([\s\S]*?)>/g
  let m
  while ((m = re.exec(src))) {
    const attrs = m[1]
    if (attrs.includes('/')) { /* self-closing igual se evalúa */ }
    const hasAction = ['onClick', 'asChild', 'type="submit"', 'onSelect', 'href', 'disabled={true}']
      .some((k) => attrs.includes(k))
    if (hasAction) continue
    // Un Button dentro de un Trigger con asChild recibe su accion del padre
    const before = src.slice(Math.max(0, m.index - 260), m.index)
    if (/(Popover|DropdownMenu|Dialog|Tooltip|Select|Sheet)Trigger[^>]*asChild[^>]*>\s*$/.test(before)) continue
    const line = src.slice(0, m.index).split('\n').length
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 400)
    const label = after.split('</Button>')[0].replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, '').trim()
    deadButtons.push({ file: rel(f), line, label: label.replace(/\s+/g, ' ').slice(0, 55) })
  }
}

// ─── 2. Rutas declaradas en NAV vs páginas existentes ─────────────────────
const navSrc = fs.readFileSync('lib/constants.ts', 'utf8')
const navRoutes = [...navSrc.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1])
const missingPages = navRoutes.filter((r) => {
  const p = path.join('app', '(app)', r.replace(/^\//, ''), 'page.tsx')
  return !fs.existsSync(p)
})

// ─── 3. Enlaces internos hacia rutas inexistentes ─────────────────────────
const routeExists = (href) => {
  const clean = href.split('?')[0].split('#')[0]
  if (clean === '/' || clean === '') return true
  const seg = clean.replace(/^\//, '').split('/')
  // rutas dinámicas: /pci/[id], /campo/[id]
  const candidates = [
    path.join('app', '(app)', ...seg, 'page.tsx'),
    path.join('app', ...seg, 'page.tsx'),
    path.join('app', '(app)', seg[0], '[id]', 'page.tsx'),
    path.join('app', seg[0], 'page.tsx'),
  ]
  return candidates.some((c) => fs.existsSync(c))
}

const brokenLinks = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/href=["'`](\/[a-z0-9\-\/]*)/gi)) {
    const href = m[1]
    if (href.startsWith('/api') || href.startsWith('/icons')) continue
    if (!routeExists(href)) {
      brokenLinks.push({ file: rel(f), line: src.slice(0, m.index).split('\n').length, href })
    }
  }
}

// ─── 4. Formularios de alta declarados por módulo ─────────────────────────
const CRUD_EXPECTED = [
  { modulo: 'Usuarios',      pista: /Nuevo usuario|Invitar usuario|Agregar usuario/i },
  { modulo: 'Cuadrillas',    pista: /Nueva cuadrilla|Agregar cuadrilla/i },
  { modulo: 'Tramos',        pista: /Nuevo tramo|Agregar tramo/i },
  { modulo: 'Actividades',   pista: /Nueva actividad|Agregar actividad/i },
  { modulo: 'PCI',           pista: /Nuevo PCI/i },
  { modulo: 'Programación',  pista: /Nueva actividad|Programar actividad/i },
  { modulo: 'Charla SSOMA',  pista: /Nueva charla/i },
  { modulo: 'Parte diario',  pista: /Abrir parte|Nuevo parte/i },
  { modulo: 'Registro campo',pista: /Registrar actividad/i },
  { modulo: 'Evidencia',     pista: /Foto|Capturar/i },
  { modulo: 'Documentos',    pista: /Adjuntar|Subir documento/i },
  { modulo: 'Checklist',     pista: /Responder checklist/i },
  { modulo: 'Plantilla chk', pista: /Nueva plantilla/i },
  { modulo: 'ATS / IPERC',   pista: /Nuevo ATS/i },
  { modulo: 'Inventario',    pista: /Nuevo elemento/i },
  { modulo: 'Intervención',  pista: /Registrar intervención/i },
  { modulo: 'Servicio',      pista: /Nuevo servicio/i },
  { modulo: 'Trazo tramo',   pista: /Guardar trazo/i },
  { modulo: 'Firma',         pista: /Confirmar firma/i },
]
const allSrc = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const crud = CRUD_EXPECTED.map((c) => ({ ...c, presente: c.pista.test(allSrc) }))

// ─── Reporte ──────────────────────────────────────────────────────────────
console.log(`${C.bold}\n  SIGOV · Auditoría estática de navegación${C.reset}`)

console.log(`\n${C.bold}${C.cyan}━━ Botones sin acción ${'━'.repeat(44)}${C.reset}`)
if (!deadButtons.length) console.log(`  ${C.ok}✓ ninguno${C.reset}`)
for (const b of deadButtons) {
  console.log(`  ${C.bad}✗${C.reset} ${b.file}:${b.line}  ${C.dim}→${C.reset} "${b.label}"`)
}

console.log(`\n${C.bold}${C.cyan}━━ Rutas del menú sin página ${'━'.repeat(37)}${C.reset}`)
if (!missingPages.length) console.log(`  ${C.ok}✓ las ${navRoutes.length} rutas del menú tienen página${C.reset}`)
missingPages.forEach((r) => console.log(`  ${C.bad}✗${C.reset} ${r}`))

console.log(`\n${C.bold}${C.cyan}━━ Enlaces internos rotos ${'━'.repeat(40)}${C.reset}`)
if (!brokenLinks.length) console.log(`  ${C.ok}✓ ninguno${C.reset}`)
for (const b of brokenLinks) console.log(`  ${C.bad}✗${C.reset} ${b.file}:${b.line} → ${b.href}`)

console.log(`\n${C.bold}${C.cyan}━━ Acciones de alta por módulo ${'━'.repeat(35)}${C.reset}`)
for (const c of crud) {
  const mark = c.presente ? `${C.ok}✓${C.reset}` : `${C.bad}✗${C.reset}`
  console.log(`  ${mark} ${c.modulo}`)
}

const gaps = deadButtons.length + missingPages.length + brokenLinks.length + crud.filter((c) => !c.presente).length
console.log(`\n${C.bold}━━ ${'━'.repeat(60)}${C.reset}`)
console.log(gaps ? `  ${C.bad}${C.bold}${gaps} huecos detectados${C.reset}\n` : `  ${C.ok}${C.bold}Sin huecos de navegación${C.reset}\n`)
process.exit(gaps ? 1 : 0)
