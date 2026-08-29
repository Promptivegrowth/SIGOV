import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron diario (Vercel · 12:00 UTC = 07:00 Perú).
 * Evalúa los vencimientos de PCI, genera las notificaciones en la bandeja
 * y dispara el push a los responsables.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-cron-secret')
  const expected = process.env.CRON_SECRET

  const authorized =
    (expected && secret === expected) ||
    (auth && auth === `Bearer ${process.env.CRON_SECRET}`) ||
    req.headers.get('user-agent')?.includes('vercel-cron')

  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1. Generar las notificaciones en base de datos
  const { data: result, error } = await admin.rpc('evaluate_pci_deadlines')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 2. Enviar push por las notificaciones recién creadas
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: pending } = await admin
    .from('notifications')
    .select('id, profile_id, title, body, url, severity, service_id, type')
    .in('type', ['pci_por_vencer', 'pci_vencido'])
    .is('pushed_at', null)
    .gte('created_at', since)
    .limit(500)

  let pushed = 0
  if (pending?.length && process.env.VAPID_PRIVATE_KEY) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
    // Agrupamos por usuario para no saturar con una notificación por ítem
    const byUser = new Map<string, any[]>()
    for (const n of pending) {
      const arr = byUser.get(n.profile_id) ?? []
      arr.push(n)
      byUser.set(n.profile_id, arr)
    }

    for (const [profileId, items] of byUser) {
      const vencidos = items.filter((i) => i.type === 'pci_vencido').length
      const porVencer = items.length - vencidos
      const res = await fetch(`${base}/api/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET ?? '',
        },
        body: JSON.stringify({
          profile_ids: [profileId],
          type: vencidos ? 'pci_vencido' : 'pci_por_vencer',
          title: vencidos
            ? `${vencidos} ítem${vencidos === 1 ? '' : 's'} de PCI vencido${vencidos === 1 ? '' : 's'}`
            : `${porVencer} ítem${porVencer === 1 ? '' : 's'} de PCI por vencer`,
          body: vencidos
            ? 'Requieren levantamiento inmediato con evidencia fotográfica.'
            : 'Vencen en las próximas 48 horas. Revisa tus asignaciones.',
          url: '/pci',
          severity: vencidos ? 'danger' : 'warning',
          service_id: items[0].service_id,
        }),
      })
      if (res.ok) pushed++
    }

    await admin
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .in('id', pending.map((n) => n.id))
  }

  return NextResponse.json({
    ok: true,
    evaluated: result,
    notifications: pending?.length ?? 0,
    pushed_users: pushed,
    at: new Date().toISOString(),
  })
}
