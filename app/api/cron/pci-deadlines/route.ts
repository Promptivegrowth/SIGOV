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
  // Los avisos vivos aún sin enviar: los nuevos y los que empeoraron (el
  // cálculo los vuelve a dejar sin enviar; ya no se repiten, REV3-OBS-46)
  const { data: pending } = await admin
    .from('notifications')
    .select('id, profile_id, title, body, url, severity, service_id, type, data')
    .in('type', ['pci_por_vencer', 'pci_vence_hoy', 'pci_fuera_de_plazo', 'pci_vencido'])
    .is('pushed_at', null)
    .is('resuelta_at', null)
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
      // Se cuentan ítems, no avisos: cada aviso agrupa los ítems de un PCI (REV3-OBS-24)
      const itemsDe = (n: any) => Number(n.data?.items ?? 1)
      const vencidos = items.filter((i) => i.type === 'pci_vencido' || i.type === 'pci_fuera_de_plazo').reduce((s, n) => s + itemsDe(n), 0)
      const porVencer = items.filter((i) => i.type === 'pci_por_vencer' || i.type === 'pci_vence_hoy').reduce((s, n) => s + itemsDe(n), 0)
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
            ? `${vencidos} ítem${vencidos === 1 ? '' : 's'} PCI fuera de plazo`
            : `${porVencer} ítem${porVencer === 1 ? '' : 's'} PCI por vencer`,
          body: vencidos
            ? 'Requieren levantamiento inmediato con evidencia fotográfica.'
            : 'Vencen en las próximas 48 horas. Revisa tus asignaciones.',
          url: items.length === 1 ? items[0].url ?? '/pci' : '/pci',
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
