import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Alta y mantenimiento de usuarios.
 *
 * Crear una cuenta exige la SERVICE_ROLE (Auth Admin API), por eso vive en el
 * servidor. Y porque usa esa llave —que pasa por encima de toda regla de la
 * base—, cada comprobación de permisos tiene que hacerse aquí:
 *
 * · Un administrador de plataforma gestiona a cualquiera.
 * · Un supervisor gestiona a la gente de SU contrato y nada más: no crea
 *   administradores, no toca a un administrador y no cambia a alguien que
 *   no es miembro de su contrato (antes bastaba con conocer su id para
 *   cambiarle el rol o la contraseña).
 * · Desactivar una cuenta la bloquea en el acceso: la sesión que tenga
 *   abierta deja de renovarse, en la web y en el celular.
 */

const BLOQUEO = '876000h' // cien años: la forma que tiene Auth de decir «indefinido»

type Guardia = {
  user: { id: string }
  admin: ReturnType<typeof createAdminClient>
  esAdmin: boolean
}

async function guard(serviceId?: string | null): Promise<Guardia | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role, is_active').eq('id', user.id).single()

  if (!profile?.is_active) {
    return { error: NextResponse.json({ error: 'Tu cuenta está desactivada' }, { status: 403 }) }
  }
  if (profile.role === 'admin') return { user, admin, esAdmin: true }

  if (serviceId) {
    const { data: member } = await admin
      .from('service_members')
      .select('role')
      .eq('service_id', serviceId)
      .eq('profile_id', user.id)
      .maybeSingle()
    if (member && ['admin', 'supervisor'].includes(member.role)) return { user, admin, esAdmin: false }
  }

  return { error: NextResponse.json({ error: 'Sin permisos para gestionar usuarios' }, { status: 403 }) }
}

const prohibido = (error: string) => NextResponse.json({ error }, { status: 403 })

/**
 * ¿Puede quien llama tocar a este usuario? Tiene que ser miembro del
 * contrato que se gestiona y no ser administrador de plataforma.
 */
async function objetivoGestionable(g: Guardia, targetId: string, serviceId: string) {
  if (g.esAdmin) return null
  const [{ data: perfil }, { data: miembro }] = await Promise.all([
    g.admin.from('profiles').select('role').eq('id', targetId).maybeSingle(),
    g.admin.from('service_members').select('role')
      .eq('service_id', serviceId).eq('profile_id', targetId).maybeSingle(),
  ])
  if (!perfil) return NextResponse.json({ error: 'El usuario no existe' }, { status: 404 })
  if (!miembro) return prohibido('Ese usuario no pertenece a este contrato')
  if (perfil.role === 'admin' || miembro.role === 'admin') {
    return prohibido('A un administrador solo lo gestiona otro administrador')
  }
  if (targetId === g.user.id) return prohibido('Tus propios permisos los cambia otra persona')
  return null
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

  const g = await guard(body.service_id)
  if ('error' in g) return g.error
  const admin = g.admin

  if (body.role === 'admin' && !g.esAdmin) {
    return prohibido('Solo un administrador de la plataforma puede crear administradores')
  }

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
    await admin.from('crews').update({ leader_id: uid }).eq('id', body.crew_id).eq('service_id', body.service_id)
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
  if (!body?.service_id) return NextResponse.json({ error: 'Falta el contrato' }, { status: 400 })

  const g = await guard(body.service_id)
  if ('error' in g) return g.error
  const admin = g.admin

  const bloqueo = await objetivoGestionable(g, body.id, body.service_id)
  if (bloqueo) return bloqueo

  if (body.role === 'admin' && !g.esAdmin) {
    return prohibido('Solo un administrador de la plataforma puede dar el rol de administrador')
  }

  const { data: actual } = await admin.from('profiles').select('is_active').eq('id', body.id).single()

  // Los datos personales, siempre; el rol general de la cuenta, solo un
  // administrador: el supervisor cambia el rol en SU contrato (abajo).
  const patch: Record<string, any> = {}
  for (const k of ['full_name', 'phone', 'dni', 'position']) {
    if (body[k] !== undefined) patch[k] = body[k]
  }
  if (g.esAdmin && body.role !== undefined) patch.role = body.role

  // Desactivar una cuenta la quita de todos los contratos: un supervisor
  // solo puede hacerlo si la persona no trabaja en otros contratos.
  const cambiaActivo = body.is_active !== undefined && !!body.is_active !== !!actual?.is_active
  if (cambiaActivo) {
    if (!g.esAdmin) {
      const { data: suyos } = await admin.from('service_members').select('service_id').eq('profile_id', body.id)
      const otros = (suyos ?? []).filter((m) => m.service_id !== body.service_id)
      if (otros.length) {
        return prohibido('Esta persona trabaja también en otros contratos: quítala de este en vez de desactivarla')
      }
    }
    patch.is_active = !!body.is_active
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from('profiles').update(patch as any).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (cambiaActivo) {
    const { error } = await admin.auth.admin.updateUserById(body.id, {
      ban_duration: body.is_active ? 'none' : BLOQUEO,
    })
    if (error) return NextResponse.json({ error: `Se guardó, pero no se pudo ${body.is_active ? 'desbloquear' : 'bloquear'} el acceso: ${error.message}` }, { status: 400 })
  }

  if (body.role) {
    const { error } = await admin
      .from('service_members')
      .update({ role: body.role })
      .eq('service_id', body.service_id)
      .eq('profile_id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.new_password) {
    if (String(body.new_password).length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
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

  const g = await guard(serviceId)
  if ('error' in g) return g.error

  const bloqueo = await objetivoGestionable(g, id, serviceId)
  if (bloqueo) return bloqueo

  const { error } = await g.admin
    .from('service_members')
    .delete()
    .eq('profile_id', id)
    .eq('service_id', serviceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
