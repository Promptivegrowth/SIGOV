#!/usr/bin/env node
/**
 * SIGOV · Ejecutor de SQL contra Supabase (Management API)
 *   node scripts/sql.mjs file <ruta.sql>
 *   node scripts/sql.mjs query "select 1"
 *
 * .env.local tiene PRECEDENCIA sobre el entorno del shell.
 */
import fs from 'node:fs'

try {
  const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
} catch {}

const ref = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !token) {
  console.error('Falta SUPABASE_PROJECT_REF o SUPABASE_ACCESS_TOKEN en .env.local')
  process.exit(1)
}

const [mode, arg] = process.argv.slice(2)
const query = mode === 'file' ? fs.readFileSync(arg, 'utf8') : arg
if (!query) {
  console.error('Uso: node scripts/sql.mjs file <ruta.sql> | query "<sql>"')
  process.exit(1)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})

const text = await res.text()
if (!res.ok) {
  console.error(`\n❌ ERROR ${res.status}\n${text}\n`)
  process.exit(1)
}

let data
try {
  data = JSON.parse(text)
} catch {
  console.log(text)
  process.exit(0)
}

if (Array.isArray(data) && data.length === 0) console.log('✅ OK (sin filas)')
else console.log(JSON.stringify(data, null, 2).slice(0, 20000))
