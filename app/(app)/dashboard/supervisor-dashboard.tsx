'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, ClipboardCheck, TriangleAlert, Boxes, Camera,
  ArrowRight, CircleAlert, Clock, MapPin, ShieldCheck, CalendarRange, Hammer,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState, ProgressBar } from '@/components/shared/misc'
import { SelectorDeSemana, useSemana } from '@/components/shared/semana'
import { Anillo } from '@/components/dashboard/anillo'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonKpi, SkeletonChart, SkeletonList } from '@/components/ui/skeleton'
import { fmtNumber, fmtRelative, cn } from '@/lib/utils'

const MiniMap = dynamic(() => import('@/components/dashboard/mini-map').then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <div className="skeleton h-[320px] rounded-xl" />,
})

/**
 * El panel del Supervisor de campo (lámina 5.2 de la especificación).
 *
 * La diferencia con el panel general no es de maquetación sino de alcance:
 * aquí solo salen las cuadrillas que el supervisor tiene a cargo. El recorte
 * lo hace la base de datos a partir de quién pregunta, no esta pantalla; si
 * viajara en la consulta, bastaría con editarla para ver las de otro.
 *
 * Y la unidad de tiempo es la semana, porque así se publica la programación.
 */

// ── Cómo se dice cada estado de cuadrilla en la tabla ─────────────────────
const ESTADO_CUADRILLA: Record<string, { label: string; className: string }> = {
  culminada:    { label: 'Culminada',    className: 'bg-success/12 text-success border-success/30' },
  en_ejecucion: { label: 'En ejecución', className: 'bg-info/12 text-info border-info/30' },
  con_retraso:  { label: 'Con retraso',  className: 'bg-warning/15 text-warning border-warning/35' },
  normal:       { label: 'En plazo',     className: 'bg-secondary text-muted-foreground border-border' },
  sin_programa: { label: 'Sin programa', className: 'bg-secondary text-muted-foreground border-border' },
}

interface FilaCuadrilla {
  crew_id: string
  code: string
  name: string
  color: string | null
  leader_name: string | null
  actividades: number
  ejecutadas: number
  avance: number
  pci_abiertos: number
  estado: string
}

interface FilaUltima {
  id: string
  reportado_en: string
  work_date: string
  crew_name: string | null
  crew_color: string | null
  activity_name: string | null
  progresiva: string
  cantidad: number | null
  unidad: string | null
  evidencias: number
  estado: string | null
}

export function SupervisorDashboard() {
  const { service, profile, hasModule } = useSession()
  const { semana, mover, volverAHoy } = useSemana()
  const sb = React.useMemo(() => createClient(), [])

  const resumen = useQuery({
    queryKey: ['panel-resumen', service.id, semana.from],
    queryFn: async () => {
      const { data, error } = await sb.rpc('panel_resumen', {
        p_service_id: service.id,
        p_from: semana.from,
        p_to: semana.to,
      })
      if (error) throw error
      return data as any
    },
  })

  const cuadrillas = useQuery({
    queryKey: ['panel-cuadrillas', service.id, semana.from],
    queryFn: async () => {
      const { data, error } = await sb.rpc('panel_cuadrillas', {
        p_service_id: service.id,
        p_from: semana.from,
        p_to: semana.to,
      })
      if (error) throw error
      return (data ?? []) as unknown as FilaCuadrilla[]
    },
  })

  const ultimas = useQuery({
    queryKey: ['panel-ultimas', service.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('panel_ultimas', {
        p_service_id: service.id,
        p_limite: 10,
      })
      if (error) throw error
      return (data ?? []) as unknown as FilaUltima[]
    },
    refetchInterval: 60_000,
  })

  const r = resumen.data
  const materiales = r?.materiales ?? {}

  const saludo = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  })()

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title={`${saludo}, ${profile.full_name.split(' ')[0]}`}
        description={`${fmtNumber(r?.cuadrillas ?? 0)} cuadrillas a tu cargo en ${service.name}.`}
        actions={<SelectorDeSemana semana={semana} onMover={mover} onHoy={volverAHoy} />}
      />

      <PageBody className="space-y-6">
        {/* ═══ Los seis contadores de la semana ═════════════════════════ */}
        <section aria-label="Resumen de la semana">
          {resumen.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <StatCard index={0} label="Cuadrillas" value={Number(r?.cuadrillas ?? 0)} icon={Users} tone="primary" hint="a tu cargo" />
              <StatCard index={1} label="Actividades asignadas" value={Number(r?.asignadas ?? 0)} icon={CalendarRange} tone="info" hint="en la semana" href="/programacion" />
              <StatCard index={2} label="En ejecución" value={Number(r?.en_ejecucion ?? 0)} icon={Hammer} tone="info" hint="empezadas y sin cerrar" />
              <StatCard index={3} label="Culminadas" value={Number(r?.culminadas ?? 0)} icon={ClipboardCheck} tone="success" hint={`de ${fmtNumber(r?.asignadas ?? 0)} programadas`} />
              <StatCard
                index={4}
                label="PCI vencidos"
                value={Number(r?.pci_vencidos ?? 0)}
                icon={TriangleAlert}
                tone={Number(r?.pci_vencidos ?? 0) > 0 ? 'danger' : 'success'}
                hint={`${fmtNumber(r?.pci_activos ?? 0)} sin levantar`}
                href="/pci"
              />
              <StatCard
                index={5}
                label="Pedidos por atender"
                value={Number(materiales.pendientes ?? 0) + Number(materiales.aprobadas ?? 0)}
                icon={Boxes}
                tone={Number(materiales.pendientes ?? 0) > 0 ? 'warning' : 'default'}
                hint={`${fmtNumber(materiales.pendientes ?? 0)} sin aprobar`}
                href="/materiales"
              />
            </div>
          )}
        </section>

        {/* ═══ Avance, PCI y materiales ═════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[15px]">Avance de la programación</CardTitle>
              <CardDescription className="text-[12px]">Semana {semana.numero} · {semana.etiqueta}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pb-6">
              {resumen.isLoading ? (
                <SkeletonChart />
              ) : (
                <>
                  <Anillo
                    valor={Number(r?.avance ?? 0)}
                    detalle={`${fmtNumber(r?.culminadas ?? 0)}/${fmtNumber(r?.asignadas ?? 0)}`}
                  />
                  <div className="grid w-full grid-cols-3 gap-2 text-center">
                    <Mini label="Pendientes" value={Number(r?.pendientes ?? 0)} />
                    <Mini label="En curso" value={Number(r?.en_ejecucion ?? 0)} tone="info" />
                    <Mini label="Observadas" value={Number(r?.observadas ?? 0)} tone="warning" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[15px]">Estado de los PCI</CardTitle>
              <CardDescription className="text-[12px]">Requerimientos de tus cuadrillas</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pb-6">
              {resumen.isLoading ? (
                <SkeletonChart />
              ) : (
                <>
                  <Anillo
                    valor={Number(r?.pci_cumplimiento ?? 0)}
                    detalle="levantados"
                  />
                  <div className="grid w-full grid-cols-3 gap-2 text-center">
                    <Mini label="Abiertos" value={Number(r?.pci_activos ?? 0)} />
                    <Mini label="Atendidos" value={Number(r?.pci_atendidos ?? 0)} tone="success" />
                    <Mini label="Vencidos" value={Number(r?.pci_vencidos ?? 0)} tone="danger" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start gap-2 pb-1">
              <div className="min-w-0">
                <CardTitle className="text-[15px]">Solicitudes de materiales</CardTitle>
                <CardDescription className="text-[12px]">Pedidos de tus cuadrillas</CardDescription>
              </div>
              <CardAction className="ml-auto shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/materiales">
                    Ver
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-2">
              {resumen.isLoading ? (
                <SkeletonList rows={4} />
              ) : (
                [
                  { label: 'Pendientes de aprobación', value: Number(materiales.pendientes ?? 0), color: 'var(--warning)' },
                  { label: 'Aprobadas, sin entregar', value: Number(materiales.aprobadas ?? 0), color: 'var(--info)' },
                  { label: 'Entregadas parcialmente', value: Number(materiales.parciales ?? 0), color: 'var(--primary)' },
                  { label: 'Entregadas', value: Number(materiales.entregadas ?? 0), color: 'var(--success)' },
                ].map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12.5px]">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: f.color }} />
                      <span className="truncate">{f.label}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-bold tabular-nums">{fmtNumber(f.value)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ Cuadrillas a cargo ═══════════════════════════════════════ */}
        <TablaCuadrillas
          filas={cuadrillas.data ?? []}
          cargando={cuadrillas.isLoading}
          semana={semana.etiqueta}
        />

        {/* ═══ Mapa + lo último reportado ═══════════════════════════════ */}
        {/* El mapa no debe estirarse hasta la altura de la lista: se alinea
            arriba y la lista lleva su propio desplazamiento */}
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
          {hasModule('mapa') && (
            <Card className="overflow-hidden xl:col-span-2">
              <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-[15px]">Mapa de ejecución</CardTitle>
                  <CardDescription className="text-[12px]">
                    Dónde está trabajando cada cuadrilla esta semana
                  </CardDescription>
                </div>
                <CardAction className="ml-0 shrink-0 sm:ml-auto">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/mapa">
                      Ver mapa completo
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <MiniMap serviceId={service.id} from={semana.from} to={semana.to} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Últimas actividades reportadas</CardTitle>
              <CardDescription className="text-[12px]">En vivo desde tus cuadrillas</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[420px] overflow-y-auto px-3 pb-3">
              {ultimas.isLoading ? (
                <SkeletonList rows={5} />
              ) : !ultimas.data?.length ? (
                <EmptyState
                  icon={Hammer}
                  title="Sin reportes todavía"
                  description="Cuando tus cuadrillas registren actividad desde la app, aparecerá aquí."
                  className="py-8"
                />
              ) : (
                <ul className="space-y-0.5">
                  {ultimas.data.map((e) => (
                    <li
                      key={e.id}
                      className="hover:bg-secondary/60 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors"
                    >
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full"
                        style={{ background: e.crew_color ?? 'var(--primary)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{e.activity_name ?? 'Actividad'}</p>
                        <p className="text-muted-foreground flex items-center gap-1 truncate text-[11px]">
                          <MapPin className="size-2.5 shrink-0" />
                          {e.progresiva}
                        </p>
                        <p className="text-muted-foreground/80 mt-0.5 flex items-center gap-2 text-[10.5px]">
                          <Clock className="size-2.5" />
                          {fmtRelative(e.reportado_en)} · {e.crew_name ?? '—'}
                          {e.evidencias > 0 && (
                            <span className="text-success flex items-center gap-0.5">
                              <Camera className="size-2.5" />
                              {e.evidencias}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-bold tabular-nums">
                          {fmtNumber(e.cantidad ?? 0, 1)}
                        </span>
                        <span className="text-muted-foreground block text-[10px]">{e.unidad ?? ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ Alertas y notificaciones ═════════════════════════════════ */}
        <AlertasDelSupervisor resumen={r} cuadrillas={cuadrillas.data ?? []} />
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function Mini({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'info' | 'warning' | 'danger' | 'success'
}) {
  const color = {
    info: 'text-info',
    warning: 'text-warning',
    danger: 'text-destructive',
    success: 'text-success',
  }
  return (
    <div className="bg-secondary/50 rounded-lg px-2 py-2">
      <span className={cn('block text-[16px] font-bold tabular-nums', tone && color[tone])}>
        {fmtNumber(value)}
      </span>
      <span className="text-muted-foreground block text-[10.5px] leading-tight">{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function TablaCuadrillas({
  filas,
  cargando,
  semana,
}: {
  filas: FilaCuadrilla[]
  cargando: boolean
  semana: string
}) {
  return (
    <Card>
      <CardHeader className="flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-[15px]">Cuadrillas a cargo</CardTitle>
          <CardDescription className="text-[12px]">Avance del {semana}</CardDescription>
        </div>
        <CardAction className="ml-0 shrink-0 sm:ml-auto">
          <Button variant="outline" size="sm" asChild>
            <Link href="/programacion">
              Ver programación
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="px-0 pb-2">
        {cargando ? (
          <div className="px-4"><SkeletonList rows={5} /></div>
        ) : !filas.length ? (
          <EmptyState
            icon={Users}
            title="Sin cuadrillas asignadas"
            description="Ninguna cuadrilla te figura como responsable. Pide al administrador que te las asigne."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border text-left text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Cuadrilla</th>
                  <th className="px-3 py-2 font-medium">Jefe</th>
                  <th className="px-3 py-2 text-right font-medium">Actividades</th>
                  <th className="px-3 py-2 font-medium">Avance</th>
                  <th className="px-3 py-2 text-right font-medium">PCI abiertos</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => {
                  const estado = ESTADO_CUADRILLA[c.estado] ?? ESTADO_CUADRILLA.normal
                  return (
                    <tr key={c.crew_id} className="hover:bg-secondary/40 border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: c.color ?? 'var(--primary)' }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{c.name}</span>
                            <span className="text-muted-foreground block text-[10.5px]">{c.code}</span>
                          </span>
                        </span>
                      </td>
                      <td className="text-muted-foreground px-3 py-2.5">
                        {c.leader_name ?? <span className="text-muted-foreground/60">Sin jefe asignado</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtNumber(c.ejecutadas)} <span className="text-muted-foreground">/ {fmtNumber(c.actividades)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ProgressBar value={Number(c.avance)} className="min-w-[110px]" />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {c.pci_abiertos > 0 ? (
                          <Link href="/pci" className="text-warning font-semibold hover:underline">
                            {fmtNumber(c.pci_abiertos)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={estado.className}>{estado.label}</Badge>
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
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function AlertasDelSupervisor({
  resumen,
  cuadrillas,
}: {
  resumen: any
  cuadrillas: FilaCuadrilla[]
}) {
  // Mientras no haya datos no se afirma nada: decir "ninguna alerta" antes
  // de haber mirado sería peor que no decir nada.
  if (!resumen) return null

  const conRetraso = cuadrillas.filter((c) => c.estado === 'con_retraso')
  const sinPrograma = cuadrillas.filter((c) => c.estado === 'sin_programa')

  // Las cifras se leen antes de armar los textos: mientras la consulta viaja
  // `resumen` llega vacío, y el título se evalúa aunque la alerta no se pinte.
  const vencidos = Number(resumen?.pci_vencidos ?? 0)
  const pedidos = Number(resumen?.materiales?.pendientes ?? 0)

  const alertas = [
    {
      show: vencidos > 0,
      tone: 'danger' as const,
      icon: CircleAlert,
      title: `${fmtNumber(vencidos)} PCI vencidos en tus cuadrillas`,
      body: 'Pasaron la fecha límite. Cada día suma penalidad.',
      href: '/pci/tablero',
      cta: 'Atender',
    },
    {
      show: conRetraso.length > 0,
      tone: 'warning' as const,
      icon: CalendarRange,
      title: `${conRetraso.length} cuadrilla${conRetraso.length === 1 ? '' : 's'} con actividades observadas`,
      body: conRetraso.map((c) => c.code).join(', '),
      href: '/programacion',
      cta: 'Revisar',
    },
    {
      show: pedidos > 0,
      tone: 'warning' as const,
      icon: Boxes,
      title: `${fmtNumber(pedidos)} solicitudes de material sin aprobar`,
      body: 'Las cuadrillas esperan tu visto bueno para salir a campo.',
      href: '/materiales',
      cta: 'Aprobar',
    },
    {
      show: sinPrograma.length > 0,
      tone: 'info' as const,
      icon: ClipboardCheck,
      title: `${sinPrograma.length} cuadrilla${sinPrograma.length === 1 ? '' : 's'} sin programa esta semana`,
      body: sinPrograma.map((c) => c.code).join(', '),
      href: '/programacion',
      cta: 'Programar',
    },
  ].filter((a) => a.show)

  if (!alertas.length) {
    return (
      <div className="bg-success/8 border-success/25 flex items-center gap-3 rounded-xl border px-4 py-3">
        <ShieldCheck className="text-success size-5 shrink-0" />
        <p className="text-[13px] font-medium">
          Ninguna alerta abierta en tus cuadrillas esta semana.
        </p>
      </div>
    )
  }

  const tonos = {
    danger: 'bg-destructive/8 border-destructive/25 text-destructive',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-info/8 border-info/25 text-info',
  }

  return (
    <section aria-label="Alertas y notificaciones">
      <h2 className="text-muted-foreground mb-2 text-[11.5px] font-semibold uppercase tracking-wide">
        Alertas y notificaciones
      </h2>
      <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
        {alertas.map((a) => (
          <Link
            key={a.title}
            href={a.href}
            className={cn(
              'group flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 transition-all hover:shadow-sm sm:px-4',
              tonos[a.tone]
            )}
          >
            <a.icon className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-[13px] font-semibold leading-snug">{a.title}</p>
              <p className="text-muted-foreground truncate text-[11.5px]">{a.body}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold">
              <span className="hidden sm:inline">{a.cta}</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
