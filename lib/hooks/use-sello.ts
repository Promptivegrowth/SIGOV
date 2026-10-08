'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { SELLO_POR_OMISION, type Sello } from '@/lib/camera'

/**
 * El sello fotográfico del contrato, para la cámara del panel.
 *
 * El mismo que baja la app de campo: si la web imprimiera otra cosa, la
 * misma partida tendría fotos con dos sellos distintos. Sin señal o mientras
 * carga, el de por omisión (solo fecha y hora).
 */
export function useSello(): Sello {
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
  return { ...SELLO_POR_OMISION, ...(ajustes.data?.sello ?? {}), fecha: true, hora: true }
}
