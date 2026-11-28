'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, fmtNumber } from '@/lib/utils'

type Version = {
  version: number
  accion: 'enviado' | 'observado' | 'validado'
  nota: string | null
  at: string
  por: string | null
  actividades: number | null
  metrado_total: number | null
}

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(iso))

/**
 * El historial del reporte diario (CASO 14): cada envío, observación y
 * validación con su nota, quién y cuándo. Plegado, muestra lo último.
 */
export function HistorialDelParte({ orderId, estado, revisadoEn }: { orderId: string; estado?: string; revisadoEn?: string | null }) {
  const sb = createClient()
  const [abierto, setAbierto] = React.useState(false)
  const q = useQuery({
    queryKey: ['parte-historial', orderId],
    queryFn: async () => {
      const { data, error } = await sb.rpc('parte_historial', { p_id: orderId })
      if (error) throw error
      return (data ?? []) as unknown as Version[]
    },
  })
  const registrados = q.data ?? []
  // JEF-01 / TR-07: un parte observado o validado sin ese evento (carga histórica) lo dice, sin inventar motivo ni autor
  const sinEvento = (estado === 'observado' || estado === 'validado') && registrados.length > 0 && !registrados.some((f) => f.accion === estado)
  const filas: (Version & { historico?: boolean })[] = sinEvento
    ? [...registrados, { version: Math.max(...registrados.map((f) => f.version)), accion: estado as any, nota: null, at: revisadoEn ?? registrados[registrados.length - 1].at, por: null, actividades: null, metrado_total: null, historico: true }]
    : registrados
  if (!filas.length) return null
  const visibles = abierto ? [...filas].reverse() : filas.slice(-1)
  const ultima = Math.max(...filas.map((f) => f.version))

  return (
    <div className="bg-card rounded-xl border px-4 py-3">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <History className="text-muted-foreground size-4" />
        <span className="flex-1 text-[13px] font-semibold">Historial del reporte</span>
        <span className="text-muted-foreground text-[12px]">Versión {ultima} · {filas.length} movimiento{filas.length === 1 ? '' : 's'}</span>
        <ChevronDown className={cn('text-muted-foreground size-4 transition-transform', abierto && 'rotate-180')} />
      </button>
      <ol className="mt-2.5 space-y-2.5">
        {visibles.map((v, i) => {
          const titulo = v.accion === 'enviado'
            ? v.version > 1 ? `Reenviado · versión ${v.version}` : 'Enviado · versión 1'
            : v.accion === 'observado' ? 'Observado por el supervisor' : 'Validado'
          const color = v.accion === 'observado' ? 'bg-destructive' : v.accion === 'validado' ? 'bg-success' : 'bg-primary'
          return (
            <li key={`${v.at}-${i}`} className="flex gap-2.5">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', color)} />
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">{titulo}</p>
                <p className="text-muted-foreground text-[11.5px]">
                  {[fechaHora(v.at), v.por,
                    v.accion === 'enviado' && v.actividades ? `${v.actividades} actividades · metrado ${fmtNumber(Number(v.metrado_total ?? 0))}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {v.nota && <p className="mt-0.5 text-[12px]">«{v.nota}»</p>}
                {(v as any).historico && (
                  <p className="text-warning mt-0.5 text-[12px]">{v.accion === 'observado' ? 'Motivo y autor no registrados en SIGOV:' : 'Autor no registrado en SIGOV:'} el estado llegó con la carga histórica.</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
