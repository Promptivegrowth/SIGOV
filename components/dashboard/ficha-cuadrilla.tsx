'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { HardHat, Truck, Wrench, Users, MapPin, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonList } from '@/components/ui/skeleton'
import { aptitud } from '@/components/recursos/vehiculos'
import { cn, fmtDate, toISODate } from '@/lib/utils'

/**
 * Ronda 5, CP-04: la ficha de una cuadrilla en «Mis cuadrillas» — jefe,
 * supervisor, sectores, personal vigente, vehículo y equipos asignados hoy,
 * y accesos a su programación, PCI, materiales y partes. Solo consulta: la
 * base solo devuelve lo que la cuadrilla tiene dentro del alcance de quien
 * pregunta.
 */
export function FichaDeCuadrilla({ crewId, desde, hasta }: { crewId: string; desde: string; hasta: string }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const hoy = toISODate(new Date())
  const d = useQuery({
    queryKey: ['ficha-cuadrilla', crewId, hoy],
    queryFn: async () => {
      const [{ data: c, error }, { data: m }, { data: va }, { data: ea }] = await Promise.all([
        sb.from('crews').select('id, code, name, sectores, vehicle, plate, leader:profiles!crews_leader_id_fkey(full_name), sup:profiles!crews_supervisor_id_fkey(full_name)')
          .eq('id', crewId).maybeSingle(),
        sb.from('crew_members').select('id, is_active, hasta, full_name, position').eq('crew_id', crewId),
        sb.from('crew_vehicle_assignments').select('start_on, end_on, vehicles(id, plate, code, status, soat_expires_on, inspection_expires_on)')
          .eq('crew_id', crewId).lte('start_on', hoy).or(`end_on.is.null,end_on.gt.${hoy}`),
        sb.from('equipo_asignaciones').select('desde, hasta, equipos(codigo, nombre)').eq('crew_id', crewId).lte('desde', hoy).or(`hasta.is.null,hasta.gte.${hoy}`),
      ])
      if (error) throw error
      return { c: c as any, miembros: (m ?? []) as any[], vehs: (va ?? []) as any[], eqs: (ea ?? []) as any[] }
    },
  })
  const x = d.data
  const vigentes = (x?.miembros ?? []).filter((p) => p.is_active && (!p.hasta || p.hasta >= hoy))
  const q = `crew=${crewId}`
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {d.isLoading ? <SkeletonList rows={3} /> : d.isError || !x?.c ? (
          <p className="text-muted-foreground text-[12.5px]">No se pudo cargar la ficha de la cuadrilla. <button className="text-primary underline" onClick={() => d.refetch()}>Reintentar</button></p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[15px] font-semibold">{x.c.name}</p>
              <span className="text-muted-foreground text-[12px]">{x.c.code} · semana {fmtDate(desde)} – {fmtDate(hasta)}</span>
            </div>
            <div className="grid gap-3 text-[12.5px] sm:grid-cols-2 xl:grid-cols-4">
              <Dato icon={HardHat} t="Jefe y supervisor">
                <p>{x.c.leader?.full_name ?? <span className="text-warning">Sin jefe</span>}</p>
                <p className="text-muted-foreground">Supervisor: {x.c.sup?.full_name ?? '—'}</p>
              </Dato>
              <Dato icon={MapPin} t="Sectores">
                <p>{(x.c.sectores ?? []).join(', ') || <span className="text-muted-foreground">Sin sectores asignados</span>}</p>
              </Dato>
              <Dato icon={Users} t={`Personal vigente (${vigentes.length})`}>
                {vigentes.length === 0 ? <p className="text-muted-foreground">Sin integrantes registrados</p>
                  : <p className="line-clamp-3">{vigentes.map((p) => p.full_name ?? '—').join(', ')}</p>}
              </Dato>
              <Dato icon={Truck} t="Vehículo y equipos hoy">
                {x.vehs.length === 0 && !x.c.plate ? <p className="text-muted-foreground">Sin vehículo asignado</p> : x.vehs.length === 0 ? <p>{x.c.plate}{x.c.vehicle ? ` · ${x.c.vehicle}` : ''}</p> : x.vehs.map((v, i) => {
                  const a = aptitud(v.vehicles ?? {})
                  return <p key={i}>{v.vehicles?.plate ?? v.vehicles?.code} <span className={cn('rounded-full px-1.5 text-[10.5px] font-semibold', a.apto ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive')}>{a.apto ? 'Apto' : a.motivo}</span></p>
                })}
                <p className="text-muted-foreground flex items-center gap-1"><Wrench className="size-3" />{x.eqs.length === 0 ? 'Sin equipos asignados' : x.eqs.map((e) => e.equipos?.codigo ?? e.equipos?.nombre).join(', ')}</p>
              </Dato>
            </div>
            <div className="flex flex-wrap gap-2">
              {[['Programación', `/programacion?${q}`], ['Revisión de PCI', `/revision?${q}`], ['Reportes diarios', `/campo?${q}`], ['Materiales', '/materiales'], ['Niveles de servicio', `/niveles-servicio?${q}`]].map(([t, h]) => (
                <Button key={t} size="sm" variant="outline" asChild><Link href={h}>{t}<ArrowRight className="size-3.5" /></Link></Button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Dato({ icon: I, t, children }: { icon: React.ElementType; t: string; children: React.ReactNode }) {
  return (
    <div className="bg-secondary/40 min-w-0 rounded-lg p-3">
      <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"><I className="size-3.5" />{t}</p>
      {children}
    </div>
  )
}
