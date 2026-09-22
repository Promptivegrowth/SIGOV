'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  TriangleAlert, Filter, ArrowRight, ListChecks, Camera, Users, Route,
  CalendarClock, FileDown, Plus, ClipboardList,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState, SemaforoBadge, ProgressBar } from '@/components/shared/misc'
import { Anillo } from '@/components/dashboard/anillo'

// Recharts pesa más que el resto del tablero junto: las cifras y las tablas
// se pintan mientras los gráficos llegan.
const PciPorPlazo = dynamic(() => import('@/components/dashboard/pci-charts').then((m) => m.PciPorPlazo), {
  ssr: false,
  loading: () => <SkeletonChart />,
})
const PciTendencia = dynamic(() => import('@/components/dashboard/pci-charts').then((m) => m.PciTendencia), {
  ssr: false,
  loading: () => <SkeletonChart />,
})
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SkeletonKpi, SkeletonChart, SkeletonList } from '@/components/ui/skeleton'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import type { LucideIcon } from 'lucide-react'
import { fmtNumber, fmtDate, toISODate, addDays, cn } from '@/lib/utils'
import { PCI_ITEM_STATUS } from '@/lib/constants'

/**
 * El tablero de PCI (lámina 5.5 de la especificación).
 *
 * Un PCI vencido es plata: el cliente descuenta por cada día de retraso.
 * Por eso lo primero que se ve no es cuántos hay, sino cuántos plazos se
 * están reventando y quién los arrastra.
 *
 * Los filtros de arriba estrechan todo el tablero a la vez —periodo, plazo,
 * tramo y cuadrilla—, porque la pregunta real nunca es «cuántos PCI hay»
 * sino «cuántos PCI de 7 días tiene la cuadrilla 2 en el tramo AQP-01».
 */

const PERIODOS = [
  { key: '30d', label: 'Últimos 30 días', dias: 30 },
  { key: '90d', label: 'Últimos 90 días', dias: 90 },
  { key: '180d', label: 'Últimos 6 meses', dias: 180 },
  { key: '365d', label: 'Último año', dias: 365 },
] as const

type PeriodoKey = (typeof PERIODOS)[number]['key']

const TODOS = '__todos__'

export function PciTableroClient() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])

  const [periodo, setPeriodo] = React.useState<PeriodoKey>('90d')
  const [plazo, setPlazo] = React.useState<string>(TODOS)
  const [tramo, setTramo] = React.useState<string>(TODOS)
  const [cuadrilla, setCuadrilla] = React.useState<string>(TODOS)

  const rango = React.useMemo(() => {
    const dias = PERIODOS.find((p) => p.key === periodo)!.dias
    return { from: toISODate(addDays(new Date(), -dias)), to: toISODate(new Date()) }
  }, [periodo])

  // ── Catálogos para los filtros ─────────────────────────────────────────
  const tramos = useQuery({
    queryKey: ['tramos', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('road_sections')
        .select('id, code, name')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('code')
      return data ?? []
    },
    staleTime: 10 * 60_000,
  })

  const cuadrillas = useQuery({
    queryKey: ['cuadrillas', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('crews')
        .select('id, code, name')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('code')
      return data ?? []
    },
    staleTime: 10 * 60_000,
  })

  // ── El tablero completo, en un solo viaje ──────────────────────────────
  const tablero = useQuery({
    queryKey: ['pci-tablero', service.id, rango.from, rango.to, plazo, tramo, cuadrilla],
    queryFn: async () => {
      const { data, error } = await sb.rpc('pci_tablero', {
        p_service_id: service.id,
        p_from: rango.from,
        p_to: rango.to,
        p_term: plazo === TODOS ? undefined : Number(plazo),
        p_section: tramo === TODOS ? undefined : tramo,
        p_crew: cuadrilla === TODOS ? undefined : cuadrilla,
      })
      if (error) throw error
      return data as any
    },
  })

  const t = tablero.data
  const resumen = t?.resumen

  // Un PCI entra con cien ítems el mismo día, así que el conteo diario deja
  // la línea de levantamientos pegada al eje. Acumulado sí se lee: la brecha
  // entre ambas líneas es el pasivo abierto.
  const acumulado = React.useMemo(() => {
    let entran = 0
    let salen = 0
    return ((t?.tendencia ?? []) as any[]).map((d) => {
      entran += Number(d.agregados) || 0
      salen += Number(d.atendidos) || 0
      return {
        label: new Date(`${d.dia}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }),
        Agregados: entran,
        Levantados: salen,
      }
    })
  }, [t])
  const conFiltro = plazo !== TODOS || tramo !== TODOS || cuadrilla !== TODOS

  const limpiar = () => {
    setPlazo(TODOS)
    setTramo(TODOS)
    setCuadrilla(TODOS)
  }

  return (
    <>
      <PageHeader
        icon={TriangleAlert}
        title="Tablero de PCI"
        description="Cumplimiento, plazos y responsables de los requerimientos de OSITRAN."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/pci">
              <ClipboardList className="size-3.5" />
              Ver documentos
            </Link>
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {/* ═══ Filtros ══════════════════════════════════════════════════ */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <Campo label="Periodo">
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
                <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODOS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo label="Plazo">
              <Select value={plazo} onValueChange={setPlazo}>
                <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos los plazos</SelectItem>
                  {(t?.por_plazo ?? []).map((p: any) => (
                    <SelectItem key={p.plazo} value={String(p.plazo)}>
                      {p.plazo} días
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo label="Tramo">
              <Select value={tramo} onValueChange={setTramo}>
                <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos los tramos</SelectItem>
                  {(tramos.data ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo label="Cuadrilla">
              <Select value={cuadrilla} onValueChange={setCuadrilla}>
                <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas las cuadrillas</SelectItem>
                  {(cuadrillas.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            {conFiltro && (
              <Button variant="ghost" size="sm" onClick={limpiar} className="mb-0.5">
                <Filter className="size-3.5" />
                Quitar filtros
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ═══ Contadores ═══════════════════════════════════════════════ */}
        {tablero.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard index={0} label="Ítems en el periodo" value={Number(resumen?.total ?? 0)} icon={ListChecks} tone="primary" hint={`del ${fmtDate(rango.from)} al ${fmtDate(rango.to)}`} />
            <StatCard index={1} label="Pendientes" value={Number(resumen?.pendientes ?? 0)} icon={ClipboardList} tone="warning" hint="sin empezar" />
            <StatCard index={2} label="En atención" value={Number(resumen?.en_atencion ?? 0)} icon={CalendarClock} tone="info" hint="cuadrilla trabajando" />
            <StatCard index={3} label="Levantados" value={Number(resumen?.levantados ?? 0) + Number(resumen?.validados ?? 0)} icon={ListChecks} tone="success" hint={`${fmtNumber(resumen?.validados ?? 0)} ya validados`} />
            <StatCard index={4} label="Vencidos" value={Number(resumen?.vencidos ?? 0)} icon={TriangleAlert} tone={Number(resumen?.vencidos ?? 0) > 0 ? 'danger' : 'success'} hint={`${fmtNumber(resumen?.por_vencer ?? 0)} por vencer`} />
            <StatCard index={5} label="Sin evidencia" value={Number(resumen?.sin_evidencia ?? 0)} icon={Camera} tone={Number(resumen?.sin_evidencia ?? 0) > 0 ? 'warning' : 'success'} hint="abiertos y exigen foto" />
          </div>
        )}

        {/* ═══ Cumplimiento + plazos ════════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[15px]">% de cumplimiento</CardTitle>
              <CardDescription className="text-[12px]">Levantados sobre el total del periodo</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 pb-6">
              {tablero.isLoading ? <SkeletonChart /> : (
                <>
                  <Anillo
                    valor={Number(resumen?.cumplimiento ?? 0)}
                    detalle={`${fmtNumber(Number(resumen?.levantados ?? 0) + Number(resumen?.validados ?? 0))}/${fmtNumber(resumen?.total ?? 0)}`}
                    tamano={150}
                  />
                  <p className="text-muted-foreground text-center text-[11.5px]">
                    {Number(resumen?.vencidos ?? 0) > 0
                      ? `${fmtNumber(resumen.vencidos)} ítems pasaron su fecha límite.`
                      : 'Ningún ítem pasó su fecha límite.'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="pb-1">
              <CardTitle className="text-[15px]">PCI por plazo</CardTitle>
              <CardDescription className="text-[12px]">
                Cuántos se atienden y cuántos se vencen en cada plazo contractual
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tablero.isLoading ? <SkeletonChart /> : !t?.por_plazo?.length ? (
                <EmptyState icon={CalendarClock} title="Sin ítems en el periodo" description="Amplía el periodo o quita los filtros." className="py-10" />
              ) : (
                <PciPorPlazo data={t.por_plazo} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ Tendencia ════════════════════════════════════════════════ */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[15px]">Estado de atención</CardTitle>
            <CardDescription className="text-[12px]">
              Acumulado de ítems que entran contra los que se levantan. La distancia
              entre las dos líneas es lo que sigue abierto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tablero.isLoading ? <SkeletonChart /> : (
              <PciTendencia data={acumulado} />
            )}
          </CardContent>
        </Card>

        {/* ═══ Por cuadrilla y por tramo ════════════════════════════════ */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TablaCumplimiento
            titulo="PCI por cuadrilla"
            descripcion="Quién arrastra los requerimientos abiertos"
            icono={Users}
            filas={(t?.por_cuadrilla ?? []).map((f: any) => ({
              clave: f.crew_id ?? f.cuadrilla,
              nombre: f.cuadrilla,
              ...f,
            }))}
            cargando={tablero.isLoading}
          />
          <TablaCumplimiento
            titulo="PCI por tramo"
            descripcion="Dónde se concentran los incumplimientos"
            icono={Route}
            filas={(t?.por_tramo ?? []).map((f: any) => ({
              clave: f.section_id ?? f.tramo,
              nombre: f.codigo ? `${f.codigo} · ${f.tramo}` : f.tramo,
              ...f,
            }))}
            cargando={tablero.isLoading}
          />
        </div>

        {/* ═══ Últimos agregados ════════════════════════════════════════ */}
        <Card>
          <CardHeader className="flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-[15px]">Últimos PCI agregados</CardTitle>
              <CardDescription className="text-[12px]">Los más recientes del periodo filtrado</CardDescription>
            </div>
            <CardAction className="ml-0 shrink-0 sm:ml-auto">
              <Button variant="outline" size="sm" asChild>
                <Link href="/pci">
                  Ver todos
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {tablero.isLoading ? (
              <div className="px-4"><SkeletonList rows={6} /></div>
            ) : !t?.ultimos?.length ? (
              <EmptyState icon={ListChecks} title="Sin ítems" description="No hay PCI que cumplan con el filtro." className="py-10" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-[12.5px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border text-left text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-2 font-medium">PCI</th>
                      <th className="px-3 py-2 font-medium">Requerimiento</th>
                      <th className="px-3 py-2 font-medium">Cuadrilla</th>
                      <th className="px-3 py-2 font-medium">Tramo</th>
                      <th className="px-3 py-2 font-medium">Vence</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.ultimos.map((i: any) => (
                      <tr key={i.id} className="hover:bg-secondary/40 border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Link href={`/pci/${i.pci_id ?? ''}`} className="font-medium hover:underline">
                            {i.pci_code ?? '—'}
                          </Link>
                          <span className="text-muted-foreground block text-[10.5px]">ítem {i.item_number}</span>
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <span className="block truncate">{i.description}</span>
                          <span className="text-muted-foreground block truncate text-[10.5px]">
                            {i.activity_name ?? '—'} · plazo {i.term_days} d
                          </span>
                        </td>
                        <td className="text-muted-foreground px-3 py-2.5">{i.crew_name ?? 'Sin asignar'}</td>
                        <td className="text-muted-foreground px-3 py-2.5">
                          {i.section_name ?? '—'}
                          {i.prog_start_txt && (
                            <span className="block text-[10.5px]">{i.prog_start_txt}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <SemaforoBadge value={i.semaforo} days={i.days_left} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant="outline"
                            className={PCI_ITEM_STATUS[i.status as keyof typeof PCI_ITEM_STATUS]?.className}
                          >
                            {PCI_ITEM_STATUS[i.status as keyof typeof PCI_ITEM_STATUS]?.label ?? i.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Acciones rápidas ═════════════════════════════════════════ */}
        <section aria-label="Acciones rápidas">
          <h2 className="text-muted-foreground mb-2 text-[11.5px] font-semibold uppercase tracking-wide">
            Acciones rápidas
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { href: '/pci', icon: Plus, titulo: 'Registrar un PCI', detalle: 'Cargar un nuevo requerimiento del cliente' },
              { href: '/importar', icon: FileDown, titulo: 'Importar desde Excel', detalle: 'Subir el PCI tal como lo envía OSITRAN' },
              { href: '/programacion', icon: CalendarClock, titulo: 'Programar el levantamiento', detalle: 'Llevar los ítems al plan de la semana' },
              { href: '/reportes', icon: ClipboardList, titulo: 'Reporte de cumplimiento', detalle: 'Generar el sustento para el cliente' },
            ].map((a) => (
              <Link
                key={a.href + a.titulo}
                href={a.href}
                className="group bg-card hover:border-primary/40 flex items-start gap-3 rounded-xl border border-border p-4 transition-all hover:shadow-sm"
              >
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <a.icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{a.titulo}</span>
                  <span className="text-muted-foreground block text-[11.5px] leading-snug">{a.detalle}</span>
                </span>
                <ArrowRight className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">{label}</span>
      {children}
    </label>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function TablaCumplimiento({
  titulo,
  descripcion,
  icono: Icono,
  filas,
  cargando,
}: {
  titulo: string
  descripcion: string
  icono: LucideIcon
  filas: any[]
  cargando: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">{titulo}</CardTitle>
        <CardDescription className="text-[12px]">{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {cargando ? (
          <div className="px-4"><SkeletonList rows={5} /></div>
        ) : !filas.length ? (
          <EmptyState icon={Icono} title="Sin datos" description="No hay ítems que cumplan con el filtro." className="py-10" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border text-left text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Vencidos</th>
                  <th className="px-4 py-2 font-medium">% cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.clave} className="hover:bg-secondary/40 border-b border-border/60 last:border-0">
                    <td className="max-w-[220px] px-4 py-2.5">
                      <span className="block truncate font-medium">{f.nombre}</span>
                      <span className="text-muted-foreground block text-[10.5px]">
                        {fmtNumber(f.atendidos)} levantados
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNumber(f.total)}</td>
                    <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', Number(f.vencidos) > 0 && 'text-destructive')}>
                      {fmtNumber(f.vencidos)}
                    </td>
                    <td className="px-4 py-2.5">
                      <ProgressBar value={Number(f.cumplimiento)} className="min-w-[110px]" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
