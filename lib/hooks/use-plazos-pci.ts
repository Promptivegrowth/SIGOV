'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Los plazos de PCI que admite el contrato (OBS-08): por omisión 1, 2, 3, 7
 * y 14 días, los de las carpetas de la estructura documental COVINCA.
 */
export function usePlazosPci(): { plazos: number[]; tolerancia: number } {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const ajustes = useQuery({
    queryKey: ['ajustes', service.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('ajustes_del_servicio', { p_service_id: service.id })
      if (error) throw error
      return data as any
    },
    staleTime: 10 * 60_000,
  })
  const pci = ajustes.data?.pci ?? {}
  return {
    plazos: Array.isArray(pci.plazos) ? pci.plazos.map(Number) : [1, 2, 3, 7, 14],
    tolerancia: Number(pci.tolerancia ?? 1),
  }
}

export const etiquetaPlazo = (d: number) => (d === 1 ? '1 día' : `${d} días`)
