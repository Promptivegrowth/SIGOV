'use client'

import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { createClient } from '@/lib/supabase/client'
import { toISODate } from '@/lib/utils'
import { db } from '@/lib/offline/db'
import { useSession } from './use-session'

/**
 * Contadores para los badges de navegación.
 * Los pendientes de sincronización salen de IndexedDB (instantáneo, offline).
 * Los del servidor se refrescan cada 2 minutos.
 */
export function usePendingCounts() {
  const { service } = useSession()

  const pendingSync = useLiveQuery(
    () => db.outbox.where('status').anyOf('pendiente', 'error').count(),
    [],
    0
  )

  const { data } = useQuery({
    queryKey: ['pending-counts', service.id],
    queryFn: async () => {
      const sb = createClient()
      const today = toISODate(new Date())
      const in7 = toISODate(new Date(Date.now() + 7 * 86400000))

      const [critical, partes, unread] = await Promise.all([
        sb
          .from('pci_items')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', service.id)
          .is('deleted_at', null)
          .not('status', 'in', '(levantado,validado)')
          .lte('due_date', in7),
        sb
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', service.id)
          .eq('status', 'enviado')
          .is('deleted_at', null),
        sb
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null),
      ])

      return {
        pciCritical: critical.count ?? 0,
        partesPorValidar: partes.count ?? 0,
        unreadNotifications: unread.count ?? 0,
      }
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  })

  return {
    pendingSync: pendingSync ?? 0,
    pciCritical: data?.pciCritical ?? 0,
    partesPorValidar: data?.partesPorValidar ?? 0,
    unreadNotifications: data?.unreadNotifications ?? 0,
  }
}
