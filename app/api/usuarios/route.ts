import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Alta y mantenimiento de usuarios.
 * Crear una cuenta exige la SERVICE_ROLE (Auth Admin API), por eso vive en el
 * servidor. Solo administradores y supervisores del servicio pueden usarla.
 */

async function guard(req: NextRequest, serviceId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role === 'admin') return { user, admin }

  if (serviceId) {
    const { data: member } = await admin
      .from('service_members')
      .select('role')
      .eq('service_id', serviceId)
      .eq('profile_id', user.id)
      .maybeSingle()
    if (member && ['admin', 'supervisor'].includes(member.role)) return { user, admin }
  }

  return { error: NextResponse.json({ error: 'Sin permisos para gestionar usuarios' }, { status: 403 }) }
}

// ─── Crear usuario ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.full_name || !body?.role || !body?.service_id) {
    return NextResponse.json(
      { error: 'Faltan datos: correo, nombre, rol y servicio son obligatorios' },
      { status: 400 }
    )
  }

  const g = await guard(req, body.service_id)
  if (g.error) return g.error
  const admin = g.admin!

  const password: string = body.password || `Sigov${Math.random().toString(36).slice(2, 8)}!`

  // 1. Cuenta en Auth
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: body.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name, role: body.role },
  })

  if (authErr) {
    const msg = authErr.message.includes('already been registered')
      ? 'Ya existe un usuario con ese correo'
      : authErr.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const uid = created.user.id

  // 2. Perfil
  const { error: profErr } = await admin.from('profiles').upsert({
    id: uid,
    full_name: body.full_name,
    email: body.email,
    phone: body.phone ?? null,
    dni: body.dni ?? null,
    position: body.position ?? null,
    role: body.role,
    is_active: true,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(uid)
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  // 3. Membresía en el servicio
  const { error: memErr } = await admin.from('service_members').upsert(
    { service_id: body.service_id, profile_id: uid, role: body.role },
    { onConflict: 'service_id,profile_id' }
  )
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 })

  // 4. Si es jefe de cuadrilla y se indicó cuadrilla, se le asigna
  if (body.crew_id && body.role === 'jefe_cuadrilla') {
    await admin.from('crews').update({ leader_id: uid }).eq('id', body.crew_id)
    await admin.from('crew_members').insert({
      crew_id: body.crew_id,
      profile_id: uid,
      full_name: body.full_name,
      dni: body.dni ?? null,
      position: 'Jefe de cuadrilla',
    })
  }

  return NextResponse.json({ ok: true, id: uid, email: body.email, password })
}

// ─── Actualizar usuario ───────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Falta el id del usuario' }, { status: 400 })

  const g = await guard(req, body.service_id)
  if (g.error) return g.error
  const admin = g.admin!

  const patch: Record<string, any> = {}
  for (const k of ['full_name', 'phone', 'dni', 'position', 'is_active', 'role']) {
    if (body[k] !== undefined) patch[k] = body[k]
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from('profiles').update(patch as any).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.role && body.service_id) {
    await admin
      .from('service_members')
      .update({ role: body.role })
      .eq('service_id', body.service_id)
      .eq('profile_id', body.id)
  }

  if (body.new_password) {
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.new_password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

// ─── Quitar del servicio (no borra la cuenta) ─────────────────────────────
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const serviceId = req.nextUrl.searchParams.get('service_id')
  if (!id || !serviceId) {
    return NextResponse.json({ error: 'Faltan id y service_id' }, { status: 400 })
  }

  const g = await guard(req, serviceId)
  if (g.error) return g.error

  const { error } = await g.admin!
    .from('service_members')
    .delete()
    .eq('profile_id', id)
    .eq('service_id', serviceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
