import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { correoDeUsuario, usuarioDeCorreo } from '@/lib/usuario'

/**
 * Historial de accesos (revisión visual 18/11, A05): ingresos, salidas,
 * intentos fallidos y bloqueos, con IP, dispositivo y plataforma.
 *
 * · ingreso / salida: con la sesión de quien entra o sale (cookie en la web,
 *   «Authorization: Bearer» en la app).
 * · fallido: el servidor comprueba la credencial contra Supabase antes de
 *   anotarla; así nadie puede bloquear a otro inventando intentos. Cinco
 *   fallos en 15 minutos bloquean la cuenta 30 minutos y avisan al
 *   Administrador, que puede desbloquearla antes.
 */
const VENTANA_MIN = 15
const MAX_FALLOS = 5
const BLOQUEO = '30m'

function dispositivoDe(ua: string, plataforma?: string) {
  if (plataforma === 'android') return /bluestacks/i.test(ua) ? 'BlueStacks' : 'Android físico'
  const nav = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : 'Navegador'
  return `${/android/i.test(ua) ? 'Android' : 'Web'} ${nav}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const evento = String(body?.evento ?? '')
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0].trim() || null
  const ua = req.headers.get('user-agent') ?? ''
  // Ciudad aproximada que entrega el hosting (sin geolocalización externa)
  const ciudad = (() => {
    const c = req.headers.get('x-vercel-ip-city'); const r = req.headers.get('x-vercel-ip-country-region'); const p = req.headers.get('x-vercel-ip-country')
    try { return [c ? decodeURIComponent(c) : null, r, p].filter(Boolean).join(', ') || null } catch { return c ?? null }
  })()
  const plataforma = body?.plataforma === 'android' ? 'android' : 'web'
  const dispositivo = String(body?.dispositivo ?? '').slice(0, 80) || dispositivoDe(ua, plataforma)
  const admin = createAdminClient()
  const anotar = (fila: Record<string, any>) => admin.from('accesos' as any).insert({ ip, ciudad, user_agent: ua.slice(0, 300), dispositivo, plataforma, ...fila } as any)

  if (evento === 'ingreso' || evento === 'salida') {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const { data: { user } } = token ? await admin.auth.getUser(token) : await (await createClient()).auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (evento === 'ingreso') {
      const { data: previo } = await admin.from('accesos' as any).select('dispositivo').eq('profile_id', user.id).eq('evento', 'ingreso')
        .order('cuando', { ascending: false }).limit(1).maybeSingle()
      if ((previo as any)?.dispositivo && (previo as any).dispositivo !== dispositivo) {
        await anotar({ profile_id: user.id, usuario: usuarioDeCorreo(user.email ?? ''), evento: 'cambio_dispositivo', resultado: 'exitoso', detalle: `Antes: ${(previo as any).dispositivo}` })
      }
      await admin.from('profiles').update({ last_seen_at: new Date().toISOString() } as any).eq('id', user.id)
    }
    await anotar({ profile_id: user.id, usuario: usuarioDeCorreo(user.email ?? ''), evento, resultado: 'exitoso', detalle: evento === 'salida' ? 'Sesión cerrada' : null })
    return NextResponse.json({ ok: true })
  }

  if (evento === 'fallido') {
    const usuario = String(body?.usuario ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    if (!usuario) return NextResponse.json({ error: 'Falta el usuario' }, { status: 400 })
    const email = correoDeUsuario(usuario)
    // Verificar: solo se anota si la credencial de verdad no entra
    const anon = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await anon.auth.signInWithPassword({ email, password })
    if (!error) return NextResponse.json({ ok: true, verificado: false })
    const { data: perfil } = await admin.from('profiles').select('id, full_name').eq('email', email).maybeSingle()
    const baneado = /banned/i.test(error.message)
    await anotar({ profile_id: perfil?.id ?? null, usuario, evento: baneado ? 'bloqueado' : 'fallido', resultado: baneado ? 'bloqueado' : 'fallido',
      detalle: baneado ? 'Intento con la cuenta bloqueada' : 'Credenciales incorrectas' })
    if (baneado || !perfil) return NextResponse.json({ ok: true, bloqueado: baneado })
    const desde = new Date(Date.now() - VENTANA_MIN * 60000).toISOString()
    const { count } = await admin.from('accesos' as any).select('id', { count: 'exact', head: true })
      .eq('profile_id', perfil.id).eq('evento', 'fallido').gte('cuando', desde)
    if ((count ?? 0) >= MAX_FALLOS) {
      await admin.auth.admin.updateUserById(perfil.id, { ban_duration: BLOQUEO })
      await anotar({ profile_id: perfil.id, usuario, evento: 'bloqueado', resultado: 'bloqueado', detalle: 'Múltiples intentos fallidos' })
      // Aviso a los administradores de sus contratos
      const { data: contratos } = await admin.from('service_members').select('service_id').eq('profile_id', perfil.id)
      for (const c of contratos ?? []) {
        const { data: admins } = await admin.from('service_members').select('profile_id').eq('service_id', c.service_id).eq('role', 'admin')
        for (const a of admins ?? []) {
          await admin.rpc('aviso_vivo' as any, {
            p_service: c.service_id, p_profile: a.profile_id, p_tipo: 'usuario_bloqueado', p_clave: 'bloq:' + perfil.id,
            p_titulo: `Usuario bloqueado · ${usuario}`, p_cuerpo: `${perfil.full_name ?? usuario} superó ${MAX_FALLOS} intentos fallidos en ${VENTANA_MIN} minutos. Bloqueado 30 minutos.`,
            p_url: '/gestion/usuarios?tab=accesos', p_severidad: 'danger', p_data: { profile_id: perfil.id },
          } as any)
        }
      }
      return NextResponse.json({ ok: true, bloqueado: true })
    }
    return NextResponse.json({ ok: true, fallos: count ?? 0 })
  }

  return NextResponse.json({ error: 'Evento no válido' }, { status: 400 })
}
