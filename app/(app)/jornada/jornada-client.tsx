'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList, Calendar, Users, User, MapPin, Wallet, CloudUpload,
  CalendarRange, TriangleAlert, FileText, Camera, ArrowRight, CircleCheck,
  Play, Clock, Flag, Package,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState, ProgressBar } from '@/components/shared/misc'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonList } from '@/components/ui/skeleton'
import { usePendingCounts } from '@/lib/hooks/use-pending-counts'
import { fmtDate, fmtNumber, toISODate, cn } from '@/lib/utils'
import { PLAN_ITEM_STATUS } from '@/lib/constants'

/**
 * Mi Jornada (apartado 4.3).
 *
 * Lo primero que abre el jefe de cuadrilla al llegar al frente: qué le toca
 * hoy, con quién, cuánto lleva y qué le falta por cerrar. No duplica las
 * otras pantallas — las resume y lleva a ellas.
 *
 * Todo lo de aquí sale del día de hoy. Mirar la jornada de ayer es otra
 * cosa y se hace desde Programación, que sí tiene selector de fecha.
 */
export function JornadaClient() {
  const { service, profile, crew } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const pendientes = usePendingCounts()
  const hoy = React.useMemo(() => toISODate(new Date()), [])

  const dia = useQuery({
    queryKey: ['mi-jornada', service.id, crew?.id, hoy],
    queryFn: async () => {
      const [plan, pci, caja, parte] = await Promise.all([
        sb.from('v_plan_items').select('*')
          .eq('service_id', service.id).eq('scheduled_on', hoy)
          .eq('crew_id', crew?.id ?? '').order('sort_order'),
        sb.from('v_pci_items').select('id, status, days_left, semaforo')
          .eq('service_id', service.id).eq('assigned_crew_id', crew?.id ?? '')
          .in('status', ['pendiente', 'en_atencion']),
        sb.from('v_cash_boxes').select('balance, currency')
          .eq('service_id', service.id).eq('crew_id', crew?.id ?? '').maybeSingle(),
        sb.from('work_orders').select('id, status, start_time, end_time')
          .eq('service_id', service.id).eq('crew_id', crew?.id ?? '')
          .eq('work_date', hoy).is('deleted_at', null).maybeSingle(),
      ])
      return {
        plan: plan.data ?? [],
        pci: pci.data ?? [],
        caja: caja.data,
        parte: parte.data,
      }
    },
    enabled: !!crew?.id,
  })

  const supervisor = useQuery({
    queryKey: ['mi-supervisor', service.id, crew?.id],
    queryFn: async () => {
      const { data } = await sb.from('crews')
        .select('profiles!crews_supervisor_id_fkey(full_name)')
        .eq('id', crew!.id).maybeSingle()
      return (data as any)?.profiles?.full_name ?? null
    },
    enabled: !!crew?.id,
  })

  // Sin cuadrilla no hay jornada que mostrar, y decirlo es más útil que
  // pintar seis tarjetas en cero.
  if (!crew) {
    return (
      <>
        <PageHeader icon={ClipboardList} title="Mi Jornada"
          description="El resumen del día de tu cuadrilla." />
        <PageBody>
          <Card><CardContent className="p-0">
            <EmptyState icon={Users} title="No diriges ninguna cuadrilla"
              description="Pide al administrador que te asigne una para poder ver tu jornada."
              className="py-14" />
          </CardContent></Card>
        </PageBody>
      </>
    )
  }

  const d = dia.data
  const plan = d?.plan ?? []
  const culminadas = plan.filter((p: any) => ['ejecutado', 'por_validar'].includes(p.status)).length
  const enCurso = plan.filter((p: any) => p.status === 'en_curso').length
  const observadas = plan.filter((p: any) => ['suspendido', 'reprogramado'].includes(p.status)).length
  const pendientesPlan = plan.filter((p: any) => p.status === 'programado').length
  const avance = plan.length ? Math.round((culminadas / plan.length) * 100) : 0
  const tramo = plan[0]?.section_name ?? null

  const contexto = [
    { icon: Calendar, label: 'Fecha', valor: fmtDate(hoy), tono: 'primary' as const },
    { icon: Users, label: 'Cuadrilla', valor: crew.code, tono: 'success' as const },
    { icon: User, label: 'Supervisor asignado', valor: supervisor.data ?? 'Sin asignar', tono: 'primary' as const },
    { icon: MapPin, label: 'Sector / Tramo', valor: tramo ?? '—', tono: 'accent' as const },
    { icon: Wallet, label: 'Saldo disponible',
      valor: d?.caja ? `S/ ${fmtNumber(Number(d.caja.balance), 2)}` : '—', tono: 'success' as const },
    { icon: CloudUpload, label: 'Registros pendientes',
      valor: String(pendientes.pendingSync), tono: 'accent' as const },
  ]

  const atajos = [
    { href: '/programacion', icon: CalendarRange, titulo: 'Actividades del día',
      detalle: `${plan.length} asignadas`, tono: 'primary' as const },
    { href: '/pci', icon: TriangleAlert, titulo: 'PCI asignados',
      detalle: `${d?.pci.length ?? 0} por atender`, tono: 'accent' as const },
    { href: '/campo', icon: FileText, titulo: 'Reporte diario',
      detalle: d?.parte ? `En ${d.parte.status}` : 'Sin abrir', tono: 'primary' as const },
    { href: '/evidencias', icon: Camera, titulo: 'Fotos y evidencias',
      detalle: 'Antes · durante · después', tono: 'success' as const },
    { href: '/caja', icon: Wallet, titulo: 'Mi caja', detalle: 'Gastos y depósitos', tono: 'success' as const },
    { href: '/materiales', icon: Package, titulo: 'Materiales', detalle: 'Solicitar insumos', tono: 'primary' as const },
  ]

  return (
    <>
      <PageHeader
        icon={ClipboardList}
        title="Mi Jornada"
        description={`${profile.full_name.split(' ')[0]} · ${crew.name}. Consulta y gestiona tu jornada de trabajo.`}
      />

      <PageBody className="space-y-5">
        {/* ═══ El contexto del día ══════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
          {contexto.map((c) => (
            <div key={c.label} className="bg-card flex items-center gap-3 rounded-xl border border-border p-3">
              <span className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                c.tono === 'primary' && 'bg-primary/10 text-primary',
                c.tono === 'success' && 'bg-success/12 text-success',
                c.tono === 'accent' && 'bg-accent/12 text-accent',
              )}>
                <c.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="text-muted-foreground block text-[10.5px] leading-tight">{c.label}</span>
                <span className="block truncate text-[13px] font-semibold leading-tight">{c.valor}</span>
              </span>
            </div>
          ))}
        </div>

        {/* ═══ Funciones rápidas ════════════════════════════════════════ */}
        <section aria-label="Funciones rápidas">
          <h2 className="text-muted-foreground mb-2 text-[11.5px] font-semibold uppercase tracking-wide">
            Funciones rápidas
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {atajos.map((a) => (
              <Link key={a.href + a.titulo} href={a.href}
                className="group bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border border-border p-3.5 transition-all hover:shadow-sm">
                <span className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg',
                  a.tono === 'primary' && 'bg-primary/10 text-primary',
                  a.tono === 'success' && 'bg-success/12 text-success',
                  a.tono === 'accent' && 'bg-accent/12 text-accent',
                )}>
                  <a.icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{a.titulo}</span>
                  <span className="text-muted-foreground block text-[11.5px]">{a.detalle}</span>
                </span>
                <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>

        {/* ═══ Resumen del día y estado ═════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Resumen del día</CardTitle>
              <CardDescription className="text-[12px]">
                Lo que el supervisor te asignó para hoy
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dia.isLoading ? (
                <SkeletonList rows={4} />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <Mini icon={CircleCheck} label="Completadas" valor={culminadas} tono="success" />
                    <Mini icon={Play} label="En proceso" valor={enCurso} tono="info" />
                    <Mini icon={Clock} label="Pendientes" valor={pendientesPlan} tono="muted" />
                    <Mini icon={Flag} label="Observadas" valor={observadas} tono="warning" />
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">Avance de actividades</span>
                      <span className="font-semibold tabular-nums">{avance}%</span>
                    </div>
                    <ProgressBar value={avance} showValue={false} />
                  </div>

                  {plan.length > 0 && (
                    <ul className="mt-4 space-y-0.5">
                      {plan.slice(0, 6).map((a: any) => {
                        const st = PLAN_ITEM_STATUS[a.status as keyof typeof PLAN_ITEM_STATUS]
                        return (
                          <li key={a.id} className="hover:bg-secondary/50 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors">
                            <span className="size-2 shrink-0 rounded-full"
                              style={{ background: a.activity_color ?? 'var(--primary)' }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-medium">{a.activity_name}</span>
                              <span className="text-muted-foreground block truncate text-[11px]">
                                {a.section_name} · {a.prog_start_txt}
                              </span>
                            </span>
                            <Badge variant="outline" className={cn('shrink-0', st?.className)}>
                              {st?.label ?? a.status}
                            </Badge>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Estado de la jornada</CardTitle>
              <CardDescription className="text-[12px]">Tu parte diario de hoy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={cn(
                'rounded-xl border px-3.5 py-3',
                d?.parte ? 'bg-success/8 border-success/25' : 'bg-secondary border-border'
              )}>
                <p className="text-[13px] font-semibold">
                  {d?.parte ? 'Jornada en curso' : 'Jornada sin iniciar'}
                </p>
                <p className="text-muted-foreground text-[11.5px]">
                  {d?.parte?.start_time
                    ? `Iniciada a las ${d.parte.start_time}`
                    : 'Se abre al registrar la primera actividad.'}
                </p>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <Link href="/campo">
                  <FileText className="size-4" />
                  {d?.parte ? 'Continuar el reporte' : 'Abrir el reporte del día'}
                </Link>
              </Button>

              {pendientes.pendingSync > 0 && (
                <Link href="/sincronizacion"
                  className="bg-accent/10 border-accent/25 flex items-center gap-2.5 rounded-xl border px-3.5 py-3 transition-colors hover:shadow-sm">
                  <CloudUpload className="text-accent size-4 shrink-0" />
                  <span className="text-[12px]">
                    <span className="block font-semibold">
                      {pendientes.pendingSync} {pendientes.pendingSync === 1 ? 'registro' : 'registros'} por sincronizar
                    </span>
                    <span className="text-muted-foreground">Completa tus registros del día.</span>
                  </span>
                </Link>
              )}

              {observadas > 0 && (
                <Link href="/programacion"
                  className="bg-warning/10 border-warning/30 flex items-center gap-2.5 rounded-xl border px-3.5 py-3 transition-colors hover:shadow-sm">
                  <Flag className="text-warning size-4 shrink-0" />
                  <span className="text-[12px]">
                    <span className="block font-semibold">
                      {observadas} {observadas === 1 ? 'actividad observada' : 'actividades observadas'}
                    </span>
                    <span className="text-muted-foreground">Revisa lo que reportaste como impedido.</span>
                  </span>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  )
}

function Mini({
  icon: Icon, label, valor, tono,
}: {
  icon: React.ElementType
  label: string
  valor: number
  tono: 'success' | 'info' | 'warning' | 'muted'
}) {
  const color = {
    success: 'bg-success/12 text-success',
    info: 'bg-info/12 text-info',
    warning: 'bg-warning/15 text-warning',
    muted: 'bg-secondary text-muted-foreground',
  }[tono]
  return (
    <div className="bg-secondary/40 rounded-lg px-3 py-2.5">
      <span className={cn('mb-1.5 flex size-7 items-center justify-center rounded-md', color)}>
        <Icon className="size-3.5" />
      </span>
      <span className="block text-[17px] font-bold leading-none tabular-nums">{fmtNumber(valor)}</span>
      <span className="text-muted-foreground block text-[10.5px]">{label}</span>
    </div>
  )
}
