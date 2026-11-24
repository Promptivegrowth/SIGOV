'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { HardHat, Truck, Wrench, Users, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, toISODate } from '@/lib/utils'
import { aptitud } from './vehiculos'
import { SupervisorDashboard } from '@/app/(app)/dashboard/supervisor-dashboard'

/**
 * «Cuadrillas y recursos» del Residente (guía 6.2.1): todo el contrato en
 * consulta — cada cuadrilla con su jefe, supervisor, sectores, integrantes
 * vigentes y los vehículos y equipos asignados hoy, con su aptitud. La
 * asignación se gestiona en Recursos (Administrador); aquí no se edita.
 */
export function CuadrillasYRecursos() {
  const { role } = useSession()
  if (role !== 'residente' && role !== 'admin') return <SupervisorDashboard />
  return <VistaContrato />
}

function VistaContrato() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [q, setQ] = React.useState('')
  const hoy = toISODate(new Date())
  const datos = useQuery({
    queryKey: ['cuadrillas-recursos', service.id],
    queryFn: async () => {
      const [{ data: c }, { data: va }, { data: ea }, { data: m }] = await Promise.all([
        sb.from('crews').select('id, code, name, sectores, is_active, leader:profiles!crews_leader_id_fkey(full_name), sup:profiles!crews_supervisor_id_fkey(full_name)')
          .eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('crew_vehicle_assignments').select('crew_id, start_on, end_on, kind, vehicles(id, plate, code, status, soat_expires_on, inspection_expires_on)')
          .eq('service_id', service.id).lte('start_on', hoy).or(`end_on.is.null,end_on.gt.${hoy}`),
        sb.from('equipo_asignaciones').select('crew_id, desde, hasta, horas, equipos(codigo, nombre)').eq('service_id', service.id).lte('desde', hoy).or(`hasta.is.null,hasta.gte.${hoy}`),
        sb.from('crew_members').select('crew_id, is_active, hasta'),
      ])
      return { crews: (c ?? []) as any[], vehs: (va ?? []) as any[], eqs: (ea ?? []) as any[], miembros: (m ?? []) as any[] }
    },
  })
  const d = datos.data
  const filas = (d?.crews ?? []).filter((c) => !q || `${c.code} ${c.name} ${c.leader?.full_name ?? ''} ${c.sup?.full_name ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const total = (k: 'vehs' | 'eqs') => (d?.[k] ?? []).length
  return (
    <>
      <PageHeader title="Cuadrillas y recursos" description="Todo el contrato: jefes, supervisores, sectores, integrantes y los vehículos y equipos asignados hoy." />
      <PageBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[[HardHat, 'Cuadrillas', d?.crews.length], [Users, 'Integrantes vigentes', (d?.miembros ?? []).filter((x) => x.is_active && (!x.hasta || x.hasta >= hoy)).length],
            [Truck, 'Vehículos asignados', total('vehs')], [Wrench, 'Equipos asignados', total('eqs')]].map(([I, t, v]: any) => (
            <div key={t} className="bg-card flex items-center gap-3 rounded-xl border border-border px-4 py-3"><I className="text-info size-5" /><div><p className="text-xl font-bold">{v ?? '—'}</p><p className="text-muted-foreground text-[12px]">{t}</p></div></div>
          ))}
        </div>
        <div className="relative max-w-md"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cuadrilla, jefe o supervisor" className="pl-8" /></div>
        <Card><CardContent className="overflow-x-auto p-0">
          {datos.isLoading ? <div className="p-4"><SkeletonList rows={5} /></div> : (
            <table className="w-full text-[12.5px]">
              <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
                {['Cuadrilla', 'Jefe', 'Supervisor', 'Sectores', 'Integrantes', 'Vehículos asignados', 'Equipos asignados'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}
              </tr></thead>
              <tbody>
                {filas.map((c) => {
                  const vehs = (d?.vehs ?? []).filter((x) => x.crew_id === c.id)
                  const eqs = (d?.eqs ?? []).filter((x) => x.crew_id === c.id)
                  const integ = (d?.miembros ?? []).filter((x) => x.crew_id === c.id && x.is_active && (!x.hasta || x.hasta >= hoy)).length
                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="px-3 py-2"><strong>{c.code}</strong><span className="text-muted-foreground block">{c.name}</span></td>
                      <td className="px-3 py-2">{c.leader?.full_name ?? <span className="text-warning">Sin jefe</span>}</td>
                      <td className="px-3 py-2">{c.sup?.full_name ?? <span className="text-warning">Sin supervisor</span>}</td>
                      <td className="px-3 py-2">{(c.sectores ?? []).join(', ') || '—'}</td>
                      <td className="px-3 py-2">{integ}</td>
                      <td className="px-3 py-2">{vehs.length === 0 ? '—' : vehs.map((x, i) => {
                        const a = aptitud(x.vehicles ?? {})
                        return <span key={i} className="block">{x.vehicles?.plate ?? x.vehicles?.code} <span className={cn('rounded-full px-1.5 text-[10.5px] font-semibold', a.apto ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive')}>{a.apto ? 'Apto' : a.motivo}</span>
                          <span className="text-muted-foreground"> · desde {fmtDate(x.start_on)}{x.end_on ? ` hasta ${fmtDate(x.end_on)}` : ''}</span></span>
                      })}</td>
                      <td className="px-3 py-2">{eqs.length === 0 ? '—' : eqs.map((x, i) => <span key={i} className="block">{x.equipos?.codigo} · {x.equipos?.nombre}<span className="text-muted-foreground"> · {fmtDate(x.desde)}{x.hasta ? `–${fmtDate(x.hasta)}` : ''}</span></span>)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent></Card>
        <p className="text-muted-foreground text-[12px]">Consulta. Las asignaciones de vehículos y equipos las registra el Administrador en <Link href="/recursos" className="text-primary underline">Recursos</Link>; la programación y el avance de cada cuadrilla están en Inicio y Programación.</p>
      </PageBody>
    </>
  )
}
