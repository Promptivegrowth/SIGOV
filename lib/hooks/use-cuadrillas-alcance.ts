'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Las cuadrillas que el rol puede elegir en un selector (ronda 5, SUP-02 y
 * CP-03): el Supervisor, solo las que supervisa (las mismas de «Mis
 * cuadrillas» y de la revisión de reportes); el Jefe, la suya; el resto
 * del contrato, todas. El servidor aplica el mismo alcance a los datos.
 */
export function useCuadrillasDelAlcance(campos = 'id, code, name, color') {
  const { service, role, crew } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['cuadrillas-alcance', service.id, role, crew?.id, campos],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await sb.from('crews').select(campos).eq('service_id', service.id).is('deleted_at', null).order('code')
      const todas = (data ?? []) as any[]
      if (role === 'jefe_cuadrilla') return todas.filter((c) => c.id === crew?.id)
      if (role === 'supervisor') {
        const { data: mias } = await sb.rpc('mis_cuadrillas' as any, { p_service_id: service.id } as any)
        const ids = new Set(((mias ?? []) as any[]).map((x) => (typeof x === 'string' ? x : x?.id ?? x?.mis_cuadrillas)))
        return todas.filter((c) => ids.has(c.id))
      }
      return todas
    },
  })
}
