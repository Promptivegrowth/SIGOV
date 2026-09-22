'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, CalendarRange, TriangleAlert, Camera, Users, ArrowRight,
  CircleCheck, CircleAlert, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState, ProgressBar, SemaforoBadge } from '@/components/shared/misc'
import { Anillo } from '@/components/dashboard/anillo'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonList } from '@/components/ui/skeleton'
import { fmtDate, fmtNumber, toISODate, startOfWeek, addDays, cn } from '@/lib/utils'
import { PLAN_ITEM_STATUS } from '@/lib/constants'

/**
 * Mi Avance (apartado 4.11).
 *
 * El cumplimiento de la cuadrilla, de la semana y del día. Mide por
 * actividades cerradas y no por metrado sumado: una cuadrilla hace metros
 * de cuneta, metros cuadrados de parchado y unidades de señal el mismo
 * día, y sumarlos daría una cifra sin unidad que no significa nada.
 */
export function AvanceClient() {
  const { service, crew } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const semana = React.useMemo(() => {
    const lunes = startOfWeek()
    return { desde: toISODate(lunes), hasta: toISODate(addDays(lunes, 6)) }
  }, [])
  const hoy = React.useMemo(() => toISODate(new Date()), [])

  const datos = useQuery({
    queryKey: ['mi-avance', service.id, crew?.id, semana.desde],
    queryFn: async () => {
      const [plan, pci, fotos] = await Promise.all([
        sb.from('v_plan_items').select('*')
          .eq('service_id', service.id).eq('crew_id', crew?.id ?? '')
          .gte('scheduled_on', semana.desde).lte('scheduled_on', semana.hasta)
          .order('scheduled_on'),
        sb.from('v_pci_items').select('id, pci_code, item_number, description, status, days_left, semaforo, due_date, fotos_antes, fotos_despues, requires_evidence')
          .eq('service_id', service.id).eq('assigned_crew_id', crew?.id ?? '')
          .order('due_date').limit(60),
        sb.from('v_evidences').select('id, phase, work_date, activity_name')
          .eq('service_id', service.id).eq('crew_id', crew?.id ?? '')
          .gte('work_date', semana.desde).lte('work_date', semana.hasta).limit(400),
      ])
      return { plan: plan.data ?? [], pci: pci.data ?? [], fotos: fotos.data ?? [] }
    },
    enabled: !!crew?.id,
  })

  if (!crew) {
    return (
      <>
        <PageHeader icon={BarChart3} title="Mi Avance" description="Cumplimiento de tu cuadrilla." />
        <PageBody>
          <Card><CardContent className="p-0">
            <EmptyState icon={Users} title="No diriges ninguna cuadrilla"
              description="Pide al administrador que te asigne una para ver tu avance." className="py-14" />
          </CardContent></Card>
        </PageBody>
      </>
    )
  }

  const plan = datos.data?.plan ?? []
  const pci = datos.data?.pci ?? []
  const fotos = datos.data?.fotos ?? []

  const cerradas = (f: any[]) => f.filter((p) => ['ejecutado', 'por_validar'].includes(p.status)).length
  const ejecutadas = cerradas(plan)
  const enCurso = plan.filter((p: any) => p.status === 'en_curso').length
  const pendientes = plan.filter((p: any) => p.status === 'programado').length
  const avance = plan.length ? Math.round((ejecutadas / plan.length) * 100) : 0

  const delDia = plan.filter((p: any) => p.scheduled_on === hoy)
  const pciAtendidos = pci.filter((p: any) => ['levantado', 'validado'].includes(p.status)).length
  const pciAbiertos = pci.filter((p: any) => ['pendiente', 'en_atencion'].includes(p.status))

  // La evidencia se cuenta por actividad, no por foto suelta: lo que el
  // cliente exige es el antes y el después de cada trabajo.
  const porActividad = new Map<string, Set<string>>()
  for (const f of fotos) {
    const k = f.activity_name ?? '—'
    if (f.phase) porActividad.set(k, (porActividad.get(k) ?? new Set()).add(f.phase))
  }
  const completas = [...porActividad.values()].filter((s) => s.has('antes') && s.has('despues')).length
  const incompletas = porActividad.size - completas

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Mi Avance"
        description={`${crew.name}. Semana del ${fmtDate(semana.desde)} al ${fmtDate(semana.hasta)}.`}
      />

      <PageBody className="space-y-4">
        {datos.isLoading ? (
          <SkeletonList rows={8} />
        ) : (
          <>
            {/* ═══ Programación semanal ══════════════════════════════════ */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-[15px]">Programación semanal</CardTitle>
                  <CardDescription className="text-[12px]">Actividades cerradas sobre asignadas</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4 pb-6">
                  <Anillo valor={avance} detalle={`${ejecutadas}/${plan.length}`} />
                  <div className="grid w-full grid-cols-3 gap-2 text-center">
                    <Dato label="Asignadas" valor={plan.length} />
                    <Dato label="En curso" valor={enCurso} tono="info" />
                    <Dato label="Pendientes" valor={pendientes} tono="warning" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start gap-2 pb-1">
                  <div className="min-w-0">
                    <CardTitle className="text-[15px]">PCI</CardTitle>
                    <CardDescription className="text-[12px]">Requerimientos de tu cuadrilla</CardDescription>
                  </div>
                  <CardAction className="ml-auto shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/pci">Ver<ArrowRight className="size-3.5" /></Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2.5 pt-2">
                  <Fila label="Asignados" valor={pci.length} />
                  <Fila label="Atendidos" valor={pciAtendidos} tono="success" />
                  <Fila label="Abiertos" valor={pciAbiertos.length} tono="warning" />
                  <Fila label="Vencidos"
                    valor={pciAbiertos.filter((p: any) => (p.days_left ?? 1) < 0).length} tono="danger" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex-row items-start gap-2 pb-1">
                  <div className="min-w-0">
                    <CardTitle className="text-[15px]">Fotos y evidencias</CardTitle>
                    <CardDescription className="text-[12px]">Por actividad de la semana</CardDescription>
                  </div>
                  <CardAction className="ml-auto shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/evidencias">Ver<ArrowRight className="size-3.5" /></Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2.5 pt-2">
                  <Fila label="Con antes y después" valor={completas} tono="success" />
                  <Fila label="Incompletas" valor={incompletas} tono={incompletas ? 'warning' : 'success'} />
                  <Fila label="Fotos tomadas" valor={fotos.length} />
                  <p className="text-muted-foreground pt-1 text-[11px] leading-snug">
                    Una actividad está completa cuando tiene la foto del antes y la del después.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ═══ Lo de hoy, partida por partida ════════════════════════ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Hoy, partida por partida</CardTitle>
                <CardDescription className="text-[12px]">{fmtDate(hoy, 'long')}</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {!delDia.length ? (
                  <EmptyState icon={CalendarRange} title="Hoy no te programaron partidas"
                    description="Cuando el supervisor publique el plan, aparecerá aquí." className="py-10" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-[12.5px]">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border text-left text-[11px] uppercase tracking-wide">
                          <th className="px-4 py-2 font-medium">Actividad</th>
                          <th className="px-3 py-2 font-medium">Tramo · progresiva</th>
                          <th className="px-3 py-2 text-right font-medium">Meta</th>
                          <th className="px-3 py-2 font-medium">Avance</th>
                          <th className="px-4 py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delDia.map((a: any) => {
                          const st = PLAN_ITEM_STATUS[a.status as keyof typeof PLAN_ITEM_STATUS]
                          return (
                            <tr key={a.id} className="hover:bg-secondary/40 border-b border-border/60 last:border-0">
                              <td className="px-4 py-2.5 font-medium">{a.activity_name}</td>
                              <td className="text-muted-foreground px-3 py-2.5">
                                {a.section_name} · {a.prog_start_txt}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {fmtNumber(a.target_qty, 1)} <span className="text-muted-foreground">{a.unit_symbol}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <ProgressBar value={Number(a.progress_pct ?? 0)} className="min-w-[100px]" />
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge variant="outline" className={st?.className}>{st?.label ?? a.status}</Badge>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ═══ Lo que aprieta ════════════════════════════════════════ */}
            {pciAbiertos.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[15px]">PCI por atender</CardTitle>
                  <CardDescription className="text-[12px]">Lo que vence primero va arriba</CardDescription>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <ul className="space-y-0.5">
                    {pciAbiertos.slice(0, 8).map((p: any) => (
                      <li key={p.id} className="hover:bg-secondary/50 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium">
                            {p.pci_code} · ítem {p.item_number}
                          </span>
                          <span className="text-muted-foreground block truncate text-[11px]">{p.description}</span>
                        </span>
                        {p.requires_evidence && p.fotos_despues === 0 && (
                          <span className="text-warning hidden items-center gap-1 text-[11px] sm:flex">
                            <Camera className="size-3" />
                            Falta el después
                          </span>
                        )}
                        <SemaforoBadge value={p.semaforo} days={p.days_left} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </PageBody>
    </>
  )
}

function Dato({ label, valor, tono }: { label: string; valor: number; tono?: 'info' | 'warning' }) {
  return (
    <div className="bg-secondary/50 rounded-lg px-2 py-2">
      <span className={cn('block text-[16px] font-bold tabular-nums',
        tono === 'info' && 'text-info', tono === 'warning' && 'text-warning')}>
        {fmtNumber(valor)}
      </span>
      <span className="text-muted-foreground block text-[10.5px] leading-tight">{label}</span>
    </div>
  )
}

function Fila({ label, valor, tono }: { label: string; valor: number; tono?: 'success' | 'warning' | 'danger' }) {
  const color = {
    success: 'text-success', warning: 'text-warning', danger: 'text-destructive',
  }
  const icono = tono === 'success' ? CircleCheck : tono === 'danger' ? CircleAlert : Clock
  const Icono = icono
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12.5px]">
        <Icono className={cn('size-3.5 shrink-0', tono && color[tono])} />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('shrink-0 text-[15px] font-bold tabular-nums', tono && color[tono])}>
        {fmtNumber(valor)}
      </span>
    </div>
  )
}
