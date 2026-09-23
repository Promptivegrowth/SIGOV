import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUR = '22222222-2222-4222-8222-222222222221'
const HUA = '22222222-2222-4222-8222-222222222222'

const TABLAS = ['road_assets','asset_interventions','evidences','evidence_links','work_entries','plan_items','pci_items']

for (const correo of ['supervisor@sigov.dev','cuadrilla1@sigov.dev','cuadrilla4@sigov.dev','visor@sigov.dev']) {
  const sb = createClient(URL, ANON)
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: 'Sigov2026!' })
  if (error) { console.log('no entra', correo); continue }
  const linea = []
  for (const t of TABLAS) {
    const { count: sur } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('service_id', SUR)
    const { count: hua } = await sb.from(t).select('id', { count: 'exact', head: true }).eq('service_id', HUA)
    linea.push(`${t.slice(0,9)}: SUR=${sur ?? 0} HUA=${hua ?? 0}`)
  }
  console.log(correo.padEnd(24), linea.join(' | '))
  await sb.auth.signOut()
}

// Sin sesión: no debe ver nada
const anon = createClient(URL, ANON)
const { count } = await anon.from('road_assets').select('id', { count: 'exact', head: true })
console.log('sin sesión               road_assets:', count ?? 0)
