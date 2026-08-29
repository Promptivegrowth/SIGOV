'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  CalendarRange, ChevronLeft, ChevronRight, Plus, Upload, Send,
  Zap, CircleCheck, Users, LayoutGrid, List, TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, Progresiva, ProgressBar } from '@/components/shared/misc'
import { Tip } from '@/components/ui/primitives'
import { PLAN_ITEM_STATUS } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, startOfWeek, toISODate, addDays, isoWeek, truncate } from '@/lib/utils'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function ProgramacionClient() {
  const { service, can, crew, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [offset, setOffset] = React.useState(0)
  const [view, setView] = React.useState<'tablero' | 'lista'>('tablero')

  const monday = React.useMemo(() => addDays(startOfWeek(), offset * 7), [offset])
  const sunday = React.useMemo(() => addDays(monday, 6), [monday])
  const weekNo = isoWeek(monday)

  const plan = useQuery({
    queryKey: ['weekly-plan', service.id, toISODate(monday)],
    queryFn: async () => {
      const { data } = await sb
        .from('weekly_plans')
        .select('*')
        .eq('service_id', service.id)
        .eq('starts_on', toISODate(monday))
        .is('deleted_at', null)
        .maybeSingle()
      return data
    },
  })

  const items = useQuery({
    queryKey: ['plan-items', service.id, toISODate(monday)],
    queryFn: async () => {
      const { data } = await sb
        .from('v_plan_items')
        .select('*')
        .eq('service_id', service.id)
        .gte('scheduled_on', toISODate(monday))
        .lte('scheduled_on', toISODate(sunday))
        .order('scheduled_on')
        .order('sort_order')
      return data ?? []
    },
  })

  const crews = useQuery({
    queryKey: ['crews', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('crews')
        .select('id, code, name, color')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('code')
      return data ?? []
    },
  })

  // El jefe de cuadrilla solo ve lo suyo
  const visibleCrews = React.useMemo(() => {
    const all = crews.data ?? []
    if (role === 'jefe_cuadrilla' && crew) return all.filter((c: any) => c.id === crew.id)
    return all
  }, [crews.data, role, crew])

  const rows = React.useMemo(() => {
    const all = items.data ?? []
    if (role === 'jefe_cuadrilla' && crew) return all.filter((r: any) => r.crew_id === crew.id)
    return all
  }, [items.data, role, crew])

  const stats = React.useMemo(() => {
    const meta = rows.reduce((s: number, r: any) => s + Number(r.target_qty ?? 0), 0)
    const avance = rows.reduce((s: number, r: any) => s + Number(r.executed_qty ?? 0), 0)
    return {
      items: rows.length,
      meta,
      avance,
      pct: meta ? (avance / meta) * 100 : 0,
      suspendidos: rows.filter((r: any) => r.status === 'suspendido').length,
      ejecutados: rows.filter((r: any) => r.status === 'ejecutado').length,
    }
  }, [rows])

  const p = plan.data

  return (
    <>
      <PageHeader
        icon={CalendarRange}
        title="Programación semanal"
        description="Asignación de actividades por tramo, progresiva, cuadrilla y fecha. Se reordena automáticamente ante un PCI prioritario."
        actions={
          can.manage && (
            <>
              <Button variant="outline" asChild>
                <Link href="/importar?kind=programacion">
                  <Upload className="size-4" />
                  Importar
                </Link>
              </Button>
              <Button>
                <Plus className="size-4" />
                Nueva actividad
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Navegador de semanas */}
          <div className="bg-card flex items-center gap-1 rounded-lg border border-border p-1">
            <Button variant="ghost" size="icon-sm" onClick={() => setOffset((v) => v - 1)} aria-label="Semana anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="px-2 text-center">
              <div className="text-[13px] font-semibold leading-tight">Semana {weekNo}</div>
              <div className="text-muted-foreground text-[10.5px] leading-tight">
                {fmtDate(monday)} – {fmtDate(sunday)}
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setOffset((v) => v + 1)} aria-label="Semana siguiente">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {offset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>
              Hoy
            </Button>
          )}

          {p && (
            <Badge
              variant="outline"
              className={cn(
                p.status === 'publicado' && 'border-success/40 text-success',
                p.status === 'suspendido' && 'border-destructive/40 text-destructive',
                p.status === 'cerrado' && 'text-muted-foreground'
              )}
            >
              {p.status === 'suspendido' && <Zap className="size-2.5" />}
              {p.status === 'publicado' ? 'Publicado' : p.status === 'suspendido' ? 'Suspendido por PCI' : p.status === 'cerrado' ? 'Cerrado' : 'Borrador'}
            </Badge>
          )}

          <div className="bg-muted ml-auto inline-flex rounded-lg p-0.5">
            {[
              { k: 'tablero' as const, icon: LayoutGrid, label: 'Tablero' },
              { k: 'lista' as const, icon: List, label: 'Lista' },
            ].map((v) => (
              <button
                key={v.k}
                onClick={() => setView(v.k)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all',
                  view === v.k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <v.icon className="size-3.5" />
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <PageBody className="space-y-4">
        {/* Resumen de la semana */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Actividades programadas', value: fmtNumber(stats.items), sub: `${stats.ejecutados} ejecutadas` },
            { label: 'Meta de la semana', value: fmtNumber(stats.meta), sub: 'unidades' },
            { label: 'Avance registrado', value: fmtNumber(stats.avance), sub: `${stats.pct.toFixed(1)}% de cumplimiento` },
            { label: 'Suspendidas por PCI', value: fmtNumber(stats.suspendidos), sub: stats.suspendidos ? 'reordenadas automáticamente' : 'ninguna', danger: stats.suspendidos > 0 },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl border border-border px-4 py-3"
            >
              <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{s.label}</p>
              <p className={cn('mt-1 text-xl font-bold tabular-nums', s.danger && 'text-destructive')}>{s.value}</p>
              <p className="text-muted-foreground text-[11px]">{s.sub}</p>
            </motion.div>
          ))}
        </div>

        {items.isLoading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : !rows.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={CalendarRange}
                title="Sin programación para esta semana"
                description={can.manage ? 'Importa el Excel de programación o crea las actividades manualmente.' : 'El supervisor aún no ha publicado la programación de esta semana.'}
                action={can.manage && <Button asChild><Link href="/importar?kind=programacion"><Upload className="size-4" />Importar programación</Link></Button>}
              />
            </CardContent>
          </Card>
        ) : view === 'tablero' ? (
          <BoardView rows={rows} crews={visibleCrews} monday={monday} />
        ) : (
          <ListView rows={rows} />
        )}
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function BoardView({ rows, crews, monday }: { rows: any[]; crews: any[]; monday: Date }) {
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i))
  const today = toISODate(new Date())

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[900px]">
        {/* Cabecera de días */}
        <div className="grid gap-2" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}>
          <div />
          {days.map((d) => {
            const iso = toISODate(d)
            const isToday = iso === today
            return (
              <div
                key={iso}
                className={cn(
                  'rounded-lg px-2 py-2 text-center',
                  isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/40'
                )}
              >
                <div className={cn('text-[11.5px] font-semibold', isToday && 'text-primary')}>
                  {DIAS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                </div>
                <div className="text-muted-foreground text-[10.5px] tabular-nums">
                  {d.getDate()}/{String(d.getMonth() + 1).padStart(2, '0')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Filas por cuadrilla */}
        <div className="mt-2 space-y-2">
          {crews.map((c: any) => (
            <div
              key={c.id}
              className="grid gap-2"
              style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}
            >
              <div className="bg-card flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold leading-tight">{c.code}</span>
                  <span className="text-muted-foreground block truncate text-[10.5px] leading-tight">
                    {c.name.replace(/^Cuadrilla \w+ · /, '')}
                  </span>
                </span>
              </div>

              {days.map((d) => {
                const iso = toISODate(d)
                const cell = rows.filter((r) => r.crew_id === c.id && r.scheduled_on === iso)
                return (
                  <div key={iso} className="min-h-[76px] space-y-1.5 rounded-lg bg-muted/25 p-1.5">
                    {cell.map((r) => (
                      <PlanChip key={r.id} item={r} />
                    ))}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Sin cuadrilla asignada */}
          {rows.some((r) => !r.crew_id) && (
            <div className="grid gap-2" style={{ gridTemplateColumns: `160px repeat(${days.length}, minmax(0,1fr))` }}>
              <div className="bg-card flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                <Users className="text-muted-foreground size-3.5" />
                <span className="text-muted-foreground text-[12px]">Sin asignar</span>
              </div>
              {days.map((d) => {
                const iso = toISODate(d)
                const cell = rows.filter((r) => !r.crew_id && r.scheduled_on === iso)
                return (
                  <div key={iso} className="min-h-[76px] space-y-1.5 rounded-lg bg-muted/25 p-1.5">
                    {cell.map((r) => <PlanChip key={r.id} item={r} />)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanChip({ item }: { item: any }) {
  const st = PLAN_ITEM_STATUS[item.status as keyof typeof PLAN_ITEM_STATUS]
  const pct = Number(item.progress_pct ?? 0)
  const suspended = item.status === 'suspendido'
  const fromPci = !!item.pci_code && !suspended

  return (
    <Tip
      label={
        <span className="block max-w-56">
          <span className="block font-semibold">{item.activity_name}</span>
          <span className="block">{item.section_name}</span>
          <span className="block">{item.prog_start_txt} → {item.prog_end_txt}</span>
          <span className="block">
            Meta {fmtNumber(item.target_qty, 1)} {item.unit_symbol} · Avance {fmtNumber(item.executed_qty, 1)}
          </span>
          {item.pci_code && <span className="block text-accent">Origen: {item.pci_code}</span>}
        </span>
      }
    >
      <div
        className={cn(
          'group cursor-default rounded-md border-l-[3px] bg-card px-2 py-1.5 shadow-sm transition-all hover:shadow-md',
          suspended && 'opacity-70 ring-1 ring-destructive/30',
          fromPci && 'ring-1 ring-accent/40'
        )}
        style={{ borderLeftColor: item.activity_color ?? 'var(--primary)' }}
      >
        <p className="truncate text-[11px] font-medium leading-tight">
          {truncate(item.activity_name, 26)}
        </p>
        <p className="text-muted-foreground truncate text-[10px] leading-tight">
          {item.section_code} · {item.prog_start_txt}
        </p>
        <div className="mt-1 flex items-center gap-1">
          {suspended ? (
            <Badge variant="destructive" className="h-3.5 px-1 text-[8.5px]">
              <Zap className="size-2" />
              Suspendida
            </Badge>
          ) : fromPci ? (
            <Badge variant="accent" className="h-3.5 px-1 text-[8.5px]">{item.pci_code}</Badge>
          ) : (
            <span className="bg-secondary h-1 flex-1 overflow-hidden rounded-full">
              <span
                className={cn('block h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </span>
          )}
          {!suspended && !fromPci && (
            <span className="text-muted-foreground text-[9px] tabular-nums">{pct.toFixed(0)}%</span>
          )}
        </div>
      </div>
    </Tip>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function ListView({ rows }: { rows: any[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40">
            <tr className="text-muted-foreground text-[11px] tracking-wide uppercase">
              {['Fecha', 'Actividad', 'Tramo / progresiva', 'Cuadrilla', 'Meta', 'Avance', 'Estado'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const st = PLAN_ITEM_STATUS[r.status as keyof typeof PLAN_ITEM_STATUS]
              return (
                <tr key={r.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{fmtDate(r.scheduled_on)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: r.activity_color }} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.activity_name}</span>
                        <span className="text-muted-foreground block text-[10.5px]">{r.activity_category}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block">{r.section_name}</span>
                    <Progresiva from={r.prog_start_m} to={r.prog_end_m} className="text-[11px] text-muted-foreground" />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.crew_name ? (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: r.crew_color }} />
                        {r.crew_name.replace(/^Cuadrilla /, '')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {fmtNumber(r.target_qty, 1)} <span className="text-muted-foreground">{r.unit_symbol}</span>
                  </td>
                  <td className="w-32 px-3 py-2.5">
                    <ProgressBar value={Number(r.progress_pct ?? 0)} showValue />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={st.className}>
                      {r.status === 'suspendido' && <Zap className="size-2.5" />}
                      {st.label}
                    </Badge>
                    {r.pci_code && (
                      <span className="text-muted-foreground mt-0.5 block text-[10px]">{r.pci_code}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
