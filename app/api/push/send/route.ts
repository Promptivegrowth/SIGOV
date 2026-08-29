import { NextResponse, type NextRequest } from 'next/server'
import webpush from 'web-push'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails('mailto:soporte@promptivedev.com', pub, priv)
  return true
}

/**
 * Envía una notificación push a los destinatarios indicados y deja
 * constancia en `notifications`. Se usa desde la app y desde los cron.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET

  if (!isCron) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  if (!configured()) {
    return NextResponse.json(
      { error: 'Push no configurado: faltan las claves VAPID', hint: 'npm run gen:vapid' },
      { status: 503 }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body?.title) {
    return NextResponse.json({ error: 'Falta el campo title' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Destinatarios: lista explícita o todos los miembros de un servicio con un rol
  let profileIds: string[] = body.profile_ids ?? []
  if (!profileIds.length && body.service_id) {
    const { data } = await admin
      .from('service_members')
      .select('profile_id')
      .eq('service_id', body.service_id)
      .in('role', body.roles ?? ['admin', 'supervisor', 'jefe_cuadrilla', 'ing_seguridad'])
    profileIds = (data ?? []).map((m: any) => m.profile_id)
  }

  if (!profileIds.length) {
    return NextResponse.json({ sent: 0, reason: 'Sin destinatarios' })
  }

  // Registrar en la bandeja
  await admin.from('notifications').insert(
    profileIds.map((id) => ({
      service_id: body.service_id ?? null,
      profile_id: id,
      type: body.type ?? 'sistema',
      title: body.title,
      body: body.body ?? null,
      url: body.url ?? null,
      severity: body.severity ?? 'info',
      data: body.data ?? {},
      pushed_at: new Date().toISOString(),
    }))
  )

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('profile_id', profileIds)
    .eq('is_active', true)

  const payload = JSON.stringify({
    title: body.title,
    body: body.body ?? '',
    url: body.url ?? '/dashboard',
    severity: body.severity ?? 'info',
    tag: body.tag,
    data: body.data ?? {},
  })

  let sent = 0
  const dead: string[] = []

  await Promise.all(
    (subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        sent++
      } catch (e: any) {
        // 404/410: la suscripción ya no existe
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id)
      }
    })
  )

  if (dead.length) {
    await admin.from('push_subscriptions').update({ is_active: false }).in('id', dead)
  }

  return NextResponse.json({ sent, recipients: profileIds.length, deactivated: dead.length })
}
