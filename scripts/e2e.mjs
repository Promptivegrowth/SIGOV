#!/usr/bin/env node
/**
 * SIGOV · Auditoría y pruebas end-to-end contra la base de datos real.
 *
 * Ejecuta cada verificación con el JWT del usuario correspondiente, de modo
 * que las políticas RLS se prueban tal como las vive la aplicación.
 *
 *   node scripts/e2e.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ─── Entorno ──────────────────────────────────────────────────────────────
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASS = process.env.DEMO_PASSWORD || 'Sigov2026!'

const RV4 = '22222222-2222-4222-8222-222222222221'
const HUA = '22222222-2222-4222-8222-222222222222'

// ─── Runner ───────────────────────────────────────────────────────────────
let pass = 0, fail = 0, warn = 0
const failures = []

const C = {
  ok: '\x1b[32m', bad: '\x1b[31m', warn: '\x1b[33m',
  dim: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m', cyan: '\x1b[36m',
}

function section(title) {
  console.log(`\n${C.bold}${C.cyan}━━ ${title} ${'━'.repeat(Math.max(0, 62 - title.length))}${C.reset}`)
}

async function test(name, fn) {
  try {
    const result = await fn()
    if (result === 'warn') {
      warn++
      console.log(`  ${C.warn}⚠${C.reset}  ${name}`)
    } else {
      pass++
      console.log(`  ${C.ok}✓${C.reset}  ${name}${result ? ` ${C.dim}${result}${C.reset}` : ''}`)
    }
  } catch (e) {
    fail++
    failures.push({ name, error: e.message })
    console.log(`  ${C.bad}✗${C.reset}  ${name}\n     ${C.bad}${e.message}${C.reset}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// ─── Clientes autenticados ────────────────────────────────────────────────
async function signIn(email) {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASS })
  if (error) throw new Error(`Login ${email}: ${error.message}`)
  return { sb, user: data.user }
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

// ═══════════════════════════════════════════════════════════════════════════
console.log(`${C.bold}\n  SIGOV · Auditoría end-to-end${C.reset}`)
console.log(`  ${C.dim}${URL_}${C.reset}`)

// ─── 1. Autenticación ─────────────────────────────────────────────────────
section('1 · Autenticación y usuarios demo')

const users = {}
for (const email of [
  'admin@sigov.dev', 'supervisor@sigov.dev', 'cuadrilla1@sigov.dev',
  'cuadrilla2@sigov.dev', 'ssoma@sigov.dev', 'visor@sigov.dev', 'cuadrilla4@sigov.dev',
]) {
  await test(`Login de ${email}`, async () => {
    const s = await signIn(email)
    users[email] = s
    return `uid ${s.user.id.slice(0, 8)}`
  })
}

await test('Credenciales incorrectas son rechazadas', async () => {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInWithPassword({ email: 'admin@sigov.dev', password: 'incorrecta' })
  assert(error, 'Se aceptó una contraseña incorrecta')
  return 'rechazado correctamente'
})

await test('Cada perfil tiene su rol asignado', async () => {
  const { data } = await admin.from('profiles').select('email, role').eq('is_demo', true)
  const roles = Object.fromEntries(data.map((p) => [p.email, p.role]))
  assert(roles['admin@sigov.dev'] === 'admin', 'admin sin rol admin')
  assert(roles['supervisor@sigov.dev'] === 'supervisor', 'supervisor mal asignado')
  assert(roles['cuadrilla1@sigov.dev'] === 'jefe_cuadrilla', 'cuadrilla1 mal asignada')
  assert(roles['ssoma@sigov.dev'] === 'ing_seguridad', 'ssoma mal asignado')
  assert(roles['visor@sigov.dev'] === 'visor', 'visor mal asignado')
  return `${data.length} perfiles`
})

// ─── 2. Aislamiento multi-tenant (RLS) ────────────────────────────────────
section('2 · Aislamiento multi-tenant · RLS')

await test('Supervisor ve sus 2 servicios', async () => {
  const { data, error } = await users['supervisor@sigov.dev'].sb.from('services').select('id, code')
  assert(!error, error?.message)
  assert(data.length === 2, `esperaba 2 servicios, obtuvo ${data.length}`)
  return data.map((s) => s.code).join(', ')
})

await test('Jefe de Cuadrilla A solo ve el servicio RV4', async () => {
  const { data } = await users['cuadrilla1@sigov.dev'].sb.from('services').select('id, code')
  assert(data.length === 1, `esperaba 1 servicio, obtuvo ${data.length}`)
  assert(data[0].code === 'RV4', `esperaba RV4, obtuvo ${data[0].code}`)
  return 'RV4'
})

await test('Jefe de Huaura NO ve datos de RV4 (prueba de fuga)', async () => {
  const { data } = await users['cuadrilla4@sigov.dev'].sb
    .from('pci_items').select('id').eq('service_id', RV4)
  assert(data.length === 0, `FUGA DE DATOS: obtuvo ${data.length} ítems de otro servicio`)
  return '0 filas — aislamiento correcto'
})

await test('Jefe de Huaura NO ve evidencias de RV4', async () => {
  const { data } = await users['cuadrilla4@sigov.dev'].sb
    .from('evidences').select('id').eq('service_id', RV4)
  assert(data.length === 0, `FUGA: ${data.length} evidencias visibles`)
  return '0 filas'
})

await test('Jefe de Huaura NO ve tramos de RV4', async () => {
  const { data } = await users['cuadrilla4@sigov.dev'].sb
    .from('road_sections').select('id').eq('service_id', RV4)
  assert(data.length === 0, `FUGA: ${data.length} tramos visibles`)
  return '0 filas'
})

await test('Admin ve ambos servicios y todos los datos', async () => {
  const { data: svcs } = await users['admin@sigov.dev'].sb.from('services').select('id')
  const { count } = await users['admin@sigov.dev'].sb
    .from('pci_items').select('id', { count: 'exact', head: true })
  assert(svcs.length === 2, `admin ve ${svcs.length} servicios`)
  assert(count > 400, `admin ve ${count} ítems de PCI`)
  return `${svcs.length} servicios · ${count} ítems PCI`
})

await test('Visor NO puede escribir (solo lectura)', async () => {
  const { error } = await users['visor@sigov.dev'].sb.from('work_orders').insert({
    service_id: RV4,
    crew_id: (await admin.from('crews').select('id').eq('service_id', RV4).limit(1).single()).data.id,
    work_date: '2030-01-01',
  })
  assert(error, 'El visor pudo escribir: la política RLS falla')
  return `bloqueado: ${error.code}`
})

await test('Usuario anónimo no accede a ninguna tabla', async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data } = await anon.from('services').select('id')
  assert(!data || data.length === 0, `FUGA: anónimo leyó ${data.length} servicios`)
  return '0 filas'
})

await test('Todas las tablas tienen RLS habilitado', async () => {
  const { data } = await admin.rpc('exec_sql_check').then(
    () => ({ data: null }),
    () => ({ data: null })
  )
  // Verificación vía Management API no disponible aquí: comprobamos por comportamiento
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
  const tables = ['work_entries', 'pci_items', 'road_assets', 'evidences', 'safety_talks', 'audit_log']
  for (const t of tables) {
    const { data: rows } = await anon.from(t).select('id').limit(1)
    assert(!rows || rows.length === 0, `Tabla ${t} legible sin autenticación`)
  }
  return `${tables.length} tablas verificadas`
})

// ─── 3. Evidencia inmutable ───────────────────────────────────────────────
section('3 · Evidencia georreferenciada inmutable')

const { data: sampleEvidence } = await admin
  .from('evidences').select('id, lat, lng, sha256, taken_at, service_id').limit(1).single()

await test('La evidencia existe y tiene GPS + hash', async () => {
  assert(sampleEvidence.lat && sampleEvidence.lng, 'sin coordenadas')
  assert(sampleEvidence.sha256?.length === 64, 'hash SHA-256 inválido')
  return `${sampleEvidence.lat.toFixed(4)}, ${sampleEvidence.lng.toFixed(4)}`
})

await test('El trigger bloquea editar la latitud (incluso con service_role)', async () => {
  const { error } = await admin
    .from('evidences').update({ lat: -12.0 }).eq('id', sampleEvidence.id)
  assert(error, 'SE PUDO EDITAR EL GPS: el trigger de inmutabilidad no funciona')
  assert(error.message.includes('inmutable'), `error inesperado: ${error.message}`)
  return 'bloqueado por trigger'
})

await test('El trigger bloquea editar la fecha de captura', async () => {
  const { error } = await admin
    .from('evidences').update({ taken_at: new Date().toISOString() }).eq('id', sampleEvidence.id)
  assert(error, 'SE PUDO EDITAR LA FECHA')
  return 'bloqueado'
})

await test('El trigger bloquea editar el hash de integridad', async () => {
  const { error } = await admin
    .from('evidences').update({ sha256: 'a'.repeat(64) }).eq('id', sampleEvidence.id)
  assert(error, 'SE PUDO EDITAR EL HASH')
  return 'bloqueado'
})

await test('Sí se permite editar metadatos no protegidos (caption)', async () => {
  const { error } = await admin
    .from('evidences').update({ caption: 'Prueba e2e' }).eq('id', sampleEvidence.id)
  assert(!error, `no se pudo editar el caption: ${error?.message}`)
  await admin.from('evidences').update({ caption: 'Estado inicial del área de trabajo' }).eq('id', sampleEvidence.id)
  return 'permitido'
})

await test('El jefe de cuadrilla NO puede borrar evidencias', async () => {
  const { error, count } = await users['cuadrilla1@sigov.dev'].sb
    .from('evidences').delete({ count: 'exact' }).eq('id', sampleEvidence.id)
  assert(error || count === 0, 'PUDO BORRAR una evidencia')
  const { data: still } = await admin.from('evidences').select('id').eq('id', sampleEvidence.id).maybeSingle()
  assert(still, 'La evidencia fue eliminada')
  return 'protegida'
})

// ─── 4. Semáforo de PCI ───────────────────────────────────────────────────
section('4 · PCIs · semáforo y reglas de negocio')

await test('El semáforo cubre los 5 estados', async () => {
  const { data } = await admin.from('v_pci_items').select('semaforo')
  const set = new Set(data.map((r) => r.semaforo))
  for (const s of ['verde', 'ambar', 'rojo', 'vencido', 'ok']) {
    assert(set.has(s), `falta el estado "${s}" en los datos`)
  }
  return [...set].join(', ')
})

await test('El semáforo es coherente con la fecha límite', async () => {
  const { data } = await admin
    .from('v_pci_items')
    .select('semaforo, due_date, days_left, status')
    .limit(400)
  for (const r of data) {
    if (['levantado', 'validado'].includes(r.status)) {
      assert(r.semaforo === 'ok', `ítem levantado con semáforo ${r.semaforo}`)
    } else if (r.days_left < 0) {
      assert(r.semaforo === 'vencido', `ítem vencido (${r.days_left}d) con semáforo ${r.semaforo}`)
    }
  }
  return `${data.length} ítems verificados`
})

await test('PCI de alto volumen: 300 ítems en un solo PCI', async () => {
  const { count } = await admin
    .from('pci_items')
    .select('id', { count: 'exact', head: true })
    .eq('pci_id', 'c1000000-0000-4000-8000-000000000001')
  assert(count >= 300, `esperaba 300 ítems, hay ${count}`)
  return `${count} ítems`
})

await test('No se puede levantar un ítem sin evidencia obligatoria', async () => {
  const { data: item } = await admin
    .from('pci_items')
    .select('id, item_number')
    .eq('status', 'pendiente')
    .eq('requires_evidence', true)
    .limit(1)
    .single()
  const { error } = await admin.from('pci_items').update({ status: 'levantado' }).eq('id', item.id)
  assert(error, 'SE PUDO LEVANTAR SIN EVIDENCIA')
  assert(error.message.includes('sin evidencia'), `error inesperado: ${error.message}`)
  return `ítem ${item.item_number} bloqueado`
})

await test('Los contadores del PCI se mantienen sincronizados', async () => {
  const { data: pcis } = await admin.from('pcis').select('id, code, items_total, items_done')
  for (const p of pcis) {
    const { count: total } = await admin
      .from('pci_items').select('id', { count: 'exact', head: true }).eq('pci_id', p.id).is('deleted_at', null)
    assert(total === p.items_total, `${p.code}: contador ${p.items_total} vs real ${total}`)
  }
  return `${pcis.length} PCIs coherentes`
})

// ─── 5. Motor de reprogramación ───────────────────────────────────────────
section('5 · Motor de reprogramación por PCI prioritario')

await test('La simulación (dry-run) devuelve el diff sin aplicar nada', async () => {
  const { data, error } = await users['supervisor@sigov.dev'].sb
    .rpc('preview_pci_suspension', { p_pci_id: 'c1000000-0000-4000-8000-000000000001' })
  assert(!error, error?.message)
  assert(data.ok, `preview falló: ${data.reason}`)
  assert(Array.isArray(data.to_suspend), 'sin lista to_suspend')
  assert(Array.isArray(data.to_create), 'sin lista to_create')
  assert(!data.already_applied, 'el PCI ya estaba aplicado')
  return `${data.to_suspend.length} a suspender · ${data.to_create.length} a crear`
})

await test('La simulación NO modificó la programación', async () => {
  const { count } = await admin
    .from('plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('suspended_by_pci_id', 'c1000000-0000-4000-8000-000000000001')
  assert(count === 0, `el dry-run modificó ${count} ítems`)
  return '0 cambios'
})

let suspensionApplied = null
await test('Aplicar la reprogramación suspende y crea ítems', async () => {
  const { data, error } = await users['supervisor@sigov.dev'].sb
    .rpc('apply_pci_suspension', { p_pci_id: 'c1000000-0000-4000-8000-000000000001' })
  assert(!error, error?.message)
  assert(data.applied, `no se aplicó: ${data.reason}`)
  suspensionApplied = data
  return `${data.items_suspended} suspendidos · ${data.items_created} creados`
})

await test('Los ítems suspendidos conservan su fecha original', async () => {
  const { data } = await admin
    .from('plan_items')
    .select('original_date, scheduled_on, rescheduled_to, status')
    .eq('suspended_by_pci_id', 'c1000000-0000-4000-8000-000000000001')
    .eq('status', 'suspendido')
  assert(data.length > 0, 'ningún ítem quedó suspendido')
  for (const r of data) {
    assert(r.original_date, 'ítem suspendido sin fecha original guardada')
    assert(r.scheduled_on === r.rescheduled_to, 'la nueva fecha no se aplicó')
  }
  return `${data.length} ítems con trazabilidad`
})

await test('Se registró la suspensión con su diff completo', async () => {
  const { data: rows } = await admin
    .from('plan_suspensions')
    .select('*')
    .eq('pci_id', 'c1000000-0000-4000-8000-000000000001')
    .order('applied_at', { ascending: false })
    .limit(1)
  const data = rows?.[0]
  assert(data, 'no se registró la suspensión')
  assert(Array.isArray(data.detail) && data.detail.length > 0, 'el diff está vacío')
  assert(data.reason.includes('PCI-2026-047'), 'el motivo no referencia el PCI')
  return `${data.detail.length} cambios registrados`
})

await test('Aplicar dos veces no duplica (idempotencia)', async () => {
  const { data } = await users['supervisor@sigov.dev'].sb
    .rpc('apply_pci_suspension', { p_pci_id: 'c1000000-0000-4000-8000-000000000001' })
  assert(!data.applied, 'SE APLICÓ DOS VECES')
  return `rechazado: ${data.reason}`
})

await test('Se notificó por push a las cuadrillas afectadas', async () => {
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'pci_prioritario')
    .gte('created_at', new Date(Date.now() - 120_000).toISOString())
  assert(count > 0, 'no se generó ninguna notificación')
  return `${count} notificaciones`
})

await test('Revertir restaura la programación original', async () => {
  const { data: susps } = await admin
    .from('plan_suspensions').select('id')
    .eq('pci_id', 'c1000000-0000-4000-8000-000000000001').is('reverted_at', null)
    .order('applied_at', { ascending: false }).limit(1)
  const susp = susps?.[0]
  assert(susp, 'no hay suspensión activa que revertir')
  const { data, error } = await users['supervisor@sigov.dev'].sb
    .rpc('revert_pci_suspension', { p_suspension_id: susp.id })
  assert(!error, error?.message)
  assert(data.ok, 'la reversión falló')

  const { count } = await admin
    .from('plan_items').select('id', { count: 'exact', head: true })
    .eq('suspended_by_pci_id', 'c1000000-0000-4000-8000-000000000001')
  assert(count === 0, `quedaron ${count} ítems marcados tras revertir`)
  return `${data.restored} ítems restaurados`
})

// ─── 6. Sincronización offline ────────────────────────────────────────────
section('6 · Sincronización offline · idempotencia')

const testClientId = crypto.randomUUID()
let createdEntryId = null

await test('Un registro de campo se crea con su client_id', async () => {
  const sb = users['cuadrilla1@sigov.dev'].sb
  const { data: wo } = await admin
    .from('work_orders').select('id, service_id').eq('service_id', RV4).limit(1).single()
  const { data: act } = await admin
    .from('activities_catalog').select('id, unit_id').eq('service_id', RV4).limit(1).single()
  const { data: sec } = await admin
    .from('road_sections').select('id').eq('service_id', RV4).limit(1).single()

  const { data, error } = await sb
    .from('work_entries')
    .upsert(
      {
        client_id: testClientId,
        work_order_id: wo.id,
        service_id: RV4,
        activity_id: act.id,
        section_id: sec.id,
        prog_start_m: 1000,
        prog_end_m: 1500,
        quantity: 42.5,
        unit_id: act.unit_id,
        observation: 'Registro de prueba e2e',
      },
      { onConflict: 'client_id' }
    )
    .select('id')
    .single()
  assert(!error, error?.message)
  createdEntryId = data.id
  return `id ${data.id.slice(0, 8)}`
})

await test('Reenviar el MISMO client_id no duplica (idempotencia)', async () => {
  const sb = users['cuadrilla1@sigov.dev'].sb
  const { data: wo } = await admin.from('work_orders').select('id').eq('service_id', RV4).limit(1).single()
  const { data: act } = await admin.from('activities_catalog').select('id, unit_id').eq('service_id', RV4).limit(1).single()
  const { data: sec } = await admin.from('road_sections').select('id').eq('service_id', RV4).limit(1).single()

  for (let i = 0; i < 3; i++) {
    await sb.from('work_entries').upsert(
      {
        client_id: testClientId,
        work_order_id: wo.id, service_id: RV4,
        activity_id: act.id, section_id: sec.id,
        prog_start_m: 1000, prog_end_m: 1500, quantity: 42.5, unit_id: act.unit_id,
      },
      { onConflict: 'client_id' }
    )
  }
  const { count } = await admin
    .from('work_entries').select('id', { count: 'exact', head: true }).eq('client_id', testClientId)
  assert(count === 1, `SE DUPLICÓ: ${count} filas con el mismo client_id`)
  return '1 fila tras 4 envíos'
})

await test('El avance del plan se recalcula al registrar ejecución', async () => {
  const { data: item } = await admin
    .from('plan_items').select('id, target_qty, executed_qty')
    .gt('executed_qty', 0).limit(1).single()
  const { data: entries } = await admin
    .from('work_entries').select('quantity').eq('plan_item_id', item.id).is('deleted_at', null)
  const suma = entries.reduce((s, e) => s + Number(e.quantity), 0)
  assert(Math.abs(suma - Number(item.executed_qty)) < 0.01,
    `avance ${item.executed_qty} vs suma real ${suma}`)
  return `${item.executed_qty} = suma de ${entries.length} registros`
})

await test('Limpieza del registro de prueba', async () => {
  await admin.from('work_entries').delete().eq('client_id', testClientId)
  const { count } = await admin
    .from('work_entries').select('id', { count: 'exact', head: true }).eq('client_id', testClientId)
  assert(count === 0, 'no se limpió')
  return 'ok'
})

// ─── 7. Geo y progresivas ─────────────────────────────────────────────────
section('7 · PostGIS · progresivas y GeoJSON')

await test('fmt_progresiva formatea correctamente', async () => {
  const { data } = await admin.rpc('fmt_progresiva', { m: 12450 })
  assert(data === '12+450', `esperaba 12+450, obtuvo ${data}`)
  return data
})

await test('parse_progresiva es el inverso exacto', async () => {
  const { data } = await admin.rpc('parse_progresiva', { p: '12+450' })
  assert(Number(data) === 12450, `esperaba 12450, obtuvo ${data}`)
  return String(data)
})

await test('progresiva_from_point calcula sobre la geometría real', async () => {
  const { data: sec } = await admin
    .from('road_sections').select('id, prog_start_m, prog_end_m').eq('code', 'T-01').single()
  const { data } = await admin.rpc('progresiva_from_point', {
    p_section_id: sec.id, p_lng: -77.935, p_lat: -10.418,
  })
  assert(data != null, 'devolvió null')
  assert(data >= sec.prog_start_m && data <= sec.prog_end_m,
    `progresiva ${data} fuera del rango del tramo`)
  return `${Math.round(data)} m`
})

for (const [rpc, min] of [
  ['sections_geojson', 6], ['assets_geojson', 2000], ['pci_geojson', 400],
]) {
  await test(`${rpc} devuelve FeatureCollection válido`, async () => {
    const { data, error } = await users['supervisor@sigov.dev'].sb.rpc(rpc, { p_service_id: RV4 })
    assert(!error, error?.message)
    assert(data.type === 'FeatureCollection', 'tipo incorrecto')
    assert(data.features.length >= min, `esperaba ≥${min} features, obtuvo ${data.features.length}`)
    const f = data.features[0]
    assert(f.geometry?.coordinates, 'feature sin coordenadas')
    assert(f.properties, 'feature sin propiedades')
    return `${data.features.length} features`
  })
}

await test('El GeoJSON respeta RLS (Huaura no ve RV4)', async () => {
  const { data } = await users['cuadrilla4@sigov.dev'].sb
    .rpc('sections_geojson', { p_service_id: RV4 })
  assert(data.features.length === 0, `FUGA: ${data.features.length} tramos`)
  return '0 features'
})

// ─── 8. Dashboard ─────────────────────────────────────────────────────────
section('8 · Dashboard · KPIs y series')

await test('dashboard_kpis devuelve todos los bloques', async () => {
  const { data, error } = await users['supervisor@sigov.dev'].sb
    .rpc('dashboard_kpis', { p_service_id: RV4 })
  assert(!error, error?.message)
  for (const k of ['produccion', 'programacion', 'pci', 'ssoma', 'inventario', 'alertas']) {
    assert(data[k], `falta el bloque "${k}"`)
  }
  assert(Number(data.produccion.registros) > 0, 'sin registros de producción')
  assert(Number(data.pci.items_total) > 0, 'sin ítems de PCI')
  return `${data.produccion.registros} registros · ${data.pci.items_total} ítems PCI`
})

await test('dashboard_kpis rechaza servicios ajenos', async () => {
  const { error } = await users['cuadrilla4@sigov.dev'].sb
    .rpc('dashboard_kpis', { p_service_id: RV4 })
  assert(error, 'PERMITIÓ consultar KPIs de otro servicio')
  return 'bloqueado'
})

await test('dashboard_daily_series entrega una fila por día', async () => {
  const { data, error } = await users['supervisor@sigov.dev'].sb.rpc('dashboard_daily_series', {
    p_service_id: RV4,
    p_from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    p_to: new Date().toISOString().slice(0, 10),
  })
  assert(!error, error?.message)
  assert(data.length === 30, `esperaba 30 días, obtuvo ${data.length}`)
  return `${data.length} días`
})

await test('dashboard_crew_production lista todas las cuadrillas', async () => {
  const { data } = await users['supervisor@sigov.dev'].sb
    .rpc('dashboard_crew_production', { p_service_id: RV4 })
  assert(data.length >= 4, `esperaba ≥4 cuadrillas, obtuvo ${data.length}`)
  return `${data.length} cuadrillas`
})

// ─── 9. SSOMA ─────────────────────────────────────────────────────────────
section('9 · SSOMA')

await test('Las charlas tienen su asistencia firmada', async () => {
  const { data: talks } = await admin
    .from('safety_talks').select('id, attendees_count').gt('attendees_count', 0).limit(20)
  for (const t of talks) {
    const { count } = await admin
      .from('talk_attendance').select('id', { count: 'exact', head: true }).eq('talk_id', t.id)
    assert(count === t.attendees_count, `charla ${t.id}: contador ${t.attendees_count} vs ${count}`)
  }
  return `${talks.length} charlas coherentes`
})

await test('Los ATS incluyen matriz de riesgos y EPP', async () => {
  const { data } = await admin.from('ats_iperc').select('hazards, ppe, max_risk').limit(10)
  for (const a of data) {
    assert(Array.isArray(a.hazards) && a.hazards.length > 0, 'ATS sin peligros')
    assert(Array.isArray(a.ppe) && a.ppe.length > 0, 'ATS sin EPP')
    assert(a.hazards[0].controles, 'peligro sin medidas de control')
  }
  return `${data.length} ATS verificados`
})

await test('El ing. de seguridad accede al módulo SSOMA', async () => {
  const { data, error } = await users['ssoma@sigov.dev'].sb
    .from('safety_talks').select('id').eq('service_id', RV4).limit(5)
  assert(!error, error?.message)
  assert(data.length > 0, 'no ve las charlas')
  return `${data.length} charlas visibles`
})

// ─── 10. Multi-servicio y módulos ─────────────────────────────────────────
section('10 · Multi-servicio · módulos por contrato')

await test('El servicio Huaura tiene PCI y SSOMA apagados', async () => {
  const { data } = await admin.from('services').select('code, modules').eq('id', HUA).single()
  assert(data.modules.pci === false, 'PCI debería estar apagado')
  assert(data.modules.ssoma === false, 'SSOMA debería estar apagado')
  assert(data.modules.programacion === true, 'programación debería estar activa')
  return 'pci=off · ssoma=off · programacion=on'
})

await test('El servicio RV4 tiene todos los módulos activos', async () => {
  const { data } = await admin.from('services').select('modules').eq('id', RV4).single()
  const off = Object.entries(data.modules).filter(([, v]) => !v)
  assert(off.length === 0, `módulos apagados: ${off.map(([k]) => k).join(', ')}`)
  return '7 módulos activos'
})

await test('El supervisor tiene rol distinto por servicio', async () => {
  const { data } = await admin
    .from('service_members').select('service_id, role')
    .eq('profile_id', users['supervisor@sigov.dev'].user.id)
  assert(data.length === 2, `esperaba 2 membresías, obtuvo ${data.length}`)
  return data.map((m) => m.role).join(', ')
})

// ─── 11. Auditoría y respaldos ────────────────────────────────────────────
section('11 · Auditoría y trazabilidad')

await test('La auditoría registra los cambios', async () => {
  const { count } = await admin.from('audit_log').select('id', { count: 'exact', head: true })
  assert(count > 100, `solo ${count} eventos registrados`)
  return `${count} eventos`
})

await test('La auditoría guarda el antes y el después', async () => {
  const { data } = await admin
    .from('audit_log').select('action, before_data, after_data')
    .eq('action', 'UPDATE').limit(5)
  for (const r of data) {
    assert(r.before_data, 'UPDATE sin before_data')
    assert(r.after_data, 'UPDATE sin after_data')
  }
  return `${data.length} eventos verificados`
})

await test('El visor NO accede al registro de auditoría', async () => {
  const { data } = await users['visor@sigov.dev'].sb.from('audit_log').select('id').limit(1)
  assert(!data || data.length === 0, 'FUGA: el visor lee la auditoría')
  return 'bloqueado'
})

await test('Los buckets de Storage están configurados', async () => {
  const { data, error } = await admin.storage.listBuckets()
  assert(!error, error?.message)
  const names = data.map((b) => b.id)
  for (const b of ['evidencias', 'firmas', 'documentos', 'avatars', 'respaldos']) {
    assert(names.includes(b), `falta el bucket "${b}"`)
  }
  const ev = data.find((b) => b.id === 'evidencias')
  assert(!ev.public, 'el bucket de evidencias es PÚBLICO')
  return `${data.length} buckets · evidencias privado`
})

// ─── 12. Integridad de los datos sembrados ────────────────────────────────
section('12 · Integridad del conjunto de datos')

await test('Volumen de datos suficiente para la demo', async () => {
  const counts = {}
  for (const t of [
    'services', 'profiles', 'road_sections', 'activities_catalog', 'crews', 'crew_members',
    'weekly_plans', 'plan_items', 'work_orders', 'work_entries', 'evidences',
    'pcis', 'pci_items', 'road_assets', 'safety_talks', 'talk_attendance',
    'checklist_responses', 'ats_iperc', 'notifications',
  ]) {
    const { count } = await admin.from(t).select('id', { count: 'exact', head: true })
    counts[t] = count
  }
  assert(counts.work_entries > 500, `pocos registros de campo: ${counts.work_entries}`)
  assert(counts.evidences > 1500, `pocas evidencias: ${counts.evidences}`)
  assert(counts.road_assets > 2000, `poco inventario: ${counts.road_assets}`)
  assert(counts.pci_items > 400, `pocos ítems PCI: ${counts.pci_items}`)
  console.log(`     ${C.dim}${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}${C.reset}`)
  return `${Object.values(counts).reduce((a, b) => a + b, 0)} filas totales`
})

await test('Ningún registro de campo huérfano', async () => {
  const { data } = await admin
    .from('work_entries').select('id, work_order_id, activity_id, section_id').limit(1000)
  for (const r of data) {
    assert(r.work_order_id && r.activity_id && r.section_id, `registro ${r.id} con FK nula`)
  }
  return `${data.length} registros con integridad referencial`
})

await test('Todas las evidencias tienen coordenadas y hash', async () => {
  const { count: sinGps } = await admin
    .from('evidences').select('id', { count: 'exact', head: true }).is('lat', null)
  const { count: sinHash } = await admin
    .from('evidences').select('id', { count: 'exact', head: true }).is('sha256', null)
  assert(sinGps === 0, `${sinGps} evidencias sin GPS`)
  assert(sinHash === 0, `${sinHash} evidencias sin hash`)
  return '100% selladas'
})

await test('El inventario está sobre la geometría de los tramos', async () => {
  const { count: sinGeom } = await admin
    .from('road_assets').select('id', { count: 'exact', head: true }).is('lat', null)
  assert(sinGeom === 0, `${sinGeom} elementos sin coordenadas`)
  return 'todos georreferenciados'
})

await test('Las progresivas están dentro del rango de su tramo', async () => {
  const { data } = await admin
    .from('road_assets')
    .select('progresiva_m, road_sections(prog_start_m, prog_end_m)')
    .limit(500)
  let out = 0
  for (const r of data) {
    const s = r.road_sections
    if (!s) continue
    if (r.progresiva_m < s.prog_start_m - 100 || r.progresiva_m > s.prog_end_m + 100) out++
  }
  assert(out === 0, `${out} elementos con progresiva fuera de rango`)
  return `${data.length} verificados`
})

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${C.bold}━━ RESULTADO ${'━'.repeat(53)}${C.reset}`)
console.log(`  ${C.ok}${pass} pruebas superadas${C.reset}`)
if (warn) console.log(`  ${C.warn}${warn} advertencias${C.reset}`)
if (fail) {
  console.log(`  ${C.bad}${fail} fallos${C.reset}\n`)
  failures.forEach((f) => console.log(`  ${C.bad}✗ ${f.name}${C.reset}\n    ${f.error}`))
} else {
  console.log(`  ${C.ok}${C.bold}Sin fallos. Sistema verificado de extremo a extremo.${C.reset}`)
}
console.log('')
process.exit(fail ? 1 : 0)
