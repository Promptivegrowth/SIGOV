'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Ruler, ClipboardCheck, TriangleAlert, HardHat, Camera,
  ShieldCheck, Boxes, CalendarRange, ArrowRight, CircleAlert, Clock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import {
  DateRangeTabs, rangeFromPreset, type DatePresetKey,
  EmptyState, SemaforoBadge, Progresiva, ProgressBar,
} from '@/components/shared/misc'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SkeletonKpi, SkeletonChart, SkeletonList } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { fmtNumber, fmtDate, fmtRelative, truncate, cn } from '@/lib/utils'
import { PCI_PRIORITY, WORK_ORDER_STATUS } from '@/lib/constants'

// ── Lazy: los gráficos y el mapa no deben pesar en el bundle inicial ──────
const ProductionChart = dynamic(() => import('@/components/dashboard/production-chart').then((m) => m.ProductionChart), {
  ssr: false,
  loading: () => <SkeletonChart />,
})
const CrewChart = dynamic(() => import('@/components/dashboard/crew-chart').then((m) => m.CrewChart), {
  ssr: false,
  loading: () => <SkeletonChart />,
})
const SemaforoDonut = dynamic(() => import('@/components/dashboard/semaforo-donut').then((m) => m.SemaforoDonut), {
  ssr: false,
  loading: () => <SkeletonChart />,
})
const MiniMap = dynamic(() => import('@/components/dashboard/mini-map').then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <div className="skeleton h-[320px] rounded-xl" />,
})

export function DashboardClient() {
  const { service, profile, role, hasModule } = useSession()
  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])
  const sb = React.useMemo(() => createClient(), [])

  const kpis = useQuery({
    queryKey: ['dashboard-kpis', service.id, range.from, range.to],
    queryFn: async () => {
      const { data, error } = await sb.rpc('dashboard_kpis', {
        p_service_id: service.id,
        p_from: range.from,
        p_to: range.to,
      })
      if (error) throw error
      return data as any
    },
  })

  const series = useQuery({
    queryKey: ['dashboard-series', service.id, range.from, range.to],
    queryFn: async () => {
      const { data, error } = await sb.rpc('dashboard_daily_series', {
        p_service_id: service.id,
        p_from: range.from,
        p_to: range.to,
      })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const k = kpis.data
  const spark = (series.data ?? []).slice(-14).map((d: any) => Number(d.metrado) || 0)

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  })()

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title={`${greeting}, ${profile.full_name.split(' ')[0]}`}
        description={`${service.name}${service.client_name ? ` · ${service.client_name}` : ''}. Datos del ${fmtDate(range.from)} al ${fmtDate(range.to)}.`}
        actions={<DateRangeTabs value={preset} onChange={setPreset} />}
      />

      <PageBody className="space-y-6">
        {/* ═══ KPIs principales ═════════════════════════════════════════ */}
        <section aria-label="Indicadores principales">
          {kpis.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                index={0}
                label="Metrado ejecutado"
                value={Number(k?.produccion?.metrado ?? 0)}
                unit="und"
                icon={Ruler}
                tone="primary"
                hint={`${fmtNumber(k?.produccion?.registros ?? 0)} registros de campo`}
                sparkline={spark}
              />
              <StatCard
                index={1}
                label="Cumplimiento del plan"
                value={Number(k?.programacion?.cumplimiento ?? 0)}
                unit="%"
                decimals={1}
                icon={ClipboardCheck}
                tone={Number(k?.programacion?.cumplimiento ?? 0) >= 85 ? 'success' : 'warning'}
                hint={`${fmtNumber(k?.programacion?.ejecutados ?? 0)} de ${fmtNumber(k?.programacion?.items ?? 0)} ítems`}
                href="/programacion"
              />
              <StatCard
                index={2}
                label="Ítems de PCI vencidos"
                value={Number(k?.pci?.vencidos ?? 0)}
                icon={TriangleAlert}
                tone={Number(k?.pci?.vencidos ?? 0) > 0 ? 'danger' : 'success'}
                hint={`${fmtNumber(k?.pci?.por_vencer_7d ?? 0)} vencen en 7 días`}
                href="/pci"
              />
              <StatCard
                index={3}
                label="Evidencias capturadas"
                value={Number(k?.produccion?.evidencias ?? 0)}
                icon={Camera}
                tone="info"
                hint={`${fmtNumber(k?.produccion?.partes ?? 0)} partes diarios`}
                href="/campo"
              />
            </div>
          )}
        </section>

        {/* ═══ Alertas accionables ══════════════════════════════════════ */}
        {k && <AlertStrip kpis={k} />}

        {/* ═══ Gráficos ═════════════════════════════════════════════════ */}
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            {series.isLoading ? (
              <SkeletonChart />
            ) : (
              <ProductionChart data={series.data ?? []} />
            )}
          </div>
          <div>
            {kpis.isLoading ? (
              <SkeletonChart />
            ) : hasModule('pci') ? (
              <SemaforoDonut data={k?.pci?.semaforo ?? {}} total={Number(k?.pci?.items_total ?? 0)} />
            ) : (
              <InventoryCard data={k?.inventario} />
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <CrewChart serviceId={service.id} from={range.from} to={range.to} />
          </div>
          <div className="space-y-4">
            <PendingReviewCard serviceId={service.id} />
            {hasModule('ssoma') && <SsomaCard data={k?.ssoma} />}
          </div>
        </div>

        {/* ═══ Mapa + actividad reciente ════════════════════════════════ */}
        <div className="grid gap-4 xl:grid-cols-3">
          {hasModule('mapa') && (
            <Card className="overflow-hidden xl:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-[15px]">Actividad georreferenciada</CardTitle>
                  <CardDescription className="text-[12px]">
                    Registros de campo del periodo sobre los tramos del servicio
                  </CardDescription>
                </div>
                <CardAction>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/mapa">
                      Ver mapa completo
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <MiniMap serviceId={service.id} from={range.from} to={range.to} />
              </CardContent>
            </Card>
          )}
          <RecentActivity serviceId={service.id} />
        </div>
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function AlertStrip({ kpis }: { kpis: any }) {
  const alerts = [
    {
      show: Number(kpis.pci?.vencidos ?? 0) > 0,
      tone: 'danger' as const,
      icon: CircleAlert,
      title: `${kpis.pci.vencidos} ítems de PCI vencidos`,
      body: 'Requieren levantamiento inmediato con evidencia.',
      href: '/pci?semaforo=vencido',
      cta: 'Atender',
    },
    {
      show: Number(kpis.alertas?.planes_suspendidos ?? 0) > 0,
      tone: 'warning' as const,
      icon: CalendarRange,
      title: `${kpis.alertas.planes_suspendidos} programación suspendida por PCI prioritario`,
      body: 'La semana fue reordenada automáticamente.',
      href: '/programacion',
      cta: 'Revisar',
    },
    {
      show: Number(kpis.alertas?.partes_por_validar ?? 0) > 0,
      tone: 'info' as const,
      icon: ClipboardCheck,
      title: `${kpis.alertas.partes_por_validar} partes diarios por validar`,
      body: 'Enviados por las cuadrillas, esperando revisión.',
      href: '/campo?status=enviado',
      cta: 'Validar',
    },
    {
      show: Number(kpis.alertas?.partes_sin_evidencia ?? 0) > 0,
      tone: 'warning' as const,
      icon: Camera,
      title: `${kpis.alertas.partes_sin_evidencia} registros sin las fotos mínimas`,
      body: 'La actividad exige evidencia y no la tiene completa.',
      href: '/campo?filter=sin-evidencia',
      cta: 'Ver',
    },
  ].filter((a) => a.show)

  if (!alerts.length) {
    return (
      <div className="bg-success/8 border-success/25 flex items-center gap-3 rounded-xl border px-4 py-3">
        <ShieldCheck className="text-success size-5 shrink-0" />
        <p className="text-[13px] font-medium">
          Sin alertas abiertas. La operación está al día en PCIs, validaciones y evidencias.
        </p>
      </div>
    )
  }

  const tones = {
    danger: 'bg-destructive/8 border-destructive/25 text-destructive',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-info/8 border-info/25 text-info',
  }

  return (
    <div className="stagger grid gap-3 md:grid-cols-2">
      {alerts.map((a) => (
        <Link
          key={a.title}
          href={a.href}
          className={cn(
            'group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:shadow-sm',
            tones[a.tone]
          )}
        >
          <a.icon className="size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-[13px] font-semibold">{a.title}</p>
            <p className="text-muted-foreground truncate text-[11.5px]">{a.body}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold">
            {a.cta}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function PendingReviewCard({ serviceId }: { serviceId: string }) {
  const sb = React.useMemo(() => createClient(), [])
  const { data, isLoading } = useQuery({
    queryKey: ['pending-review', serviceId],
    queryFn: async () => {
      const { data } = await sb
        .from('work_orders')
        .select('id, work_date, status, crews(name, color), work_entries(count)')
        .eq('service_id', serviceId)
        .in('status', ['enviado', 'observado'])
        .is('deleted_at', null)
        .order('work_date', { ascending: false })
        .limit(5)
      return data ?? []
    },
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">Partes por validar</CardTitle>
        <CardDescription className="text-[12px]">Enviados por las cuadrillas</CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : !data?.length ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-[12.5px]">
            No hay partes pendientes de validación.
          </p>
        ) : (
          <ul className="space-y-1">
            {data.map((w: any) => (
              <li key={w.id}>
                <Link
                  href={`/campo/${w.id}`}
                  className="hover:bg-secondary flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: w.crews?.color ?? 'var(--muted-foreground)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{w.crews?.name}</span>
                    <span className="text-muted-foreground block text-[11px]">
                      {fmtDate(w.work_date)} · {w.work_entries?.[0]?.count ?? 0} registros
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={WORK_ORDER_STATUS[w.status as keyof typeof WORK_ORDER_STATUS]?.className}
                  >
                    {WORK_ORDER_STATUS[w.status as keyof typeof WORK_ORDER_STATUS]?.label}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SsomaCard({ data }: { data: any }) {
  const items = [
    { label: 'Charlas de 5 min', value: data?.charlas ?? 0, icon: ShieldCheck },
    { label: 'Asistencias firmadas', value: data?.asistentes ?? 0, icon: ClipboardCheck },
    { label: 'Checklists', value: data?.checklists ?? 0, icon: ClipboardCheck },
    { label: 'ATS / IPERC', value: data?.ats ?? 0, icon: HardHat },
  ]
  const findings = Number(data?.hallazgos ?? 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px]">Cumplimiento SSOMA</CardTitle>
        <CardDescription className="text-[12px]">Registros del periodo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.map((i) => (
          <div key={i.label} className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
              <i.icon className="size-3.5" />
              {i.label}
            </span>
            <span className="text-[14px] font-bold tabular-nums">{fmtNumber(i.value)}</span>
          </div>
        ))}
        {findings > 0 && (
          <div className="bg-warning/10 text-warning mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px]">
            <CircleAlert className="size-3.5 shrink-0" />
            {findings} checklist{findings === 1 ? '' : 's'} con hallazgos registrados
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function InventoryCard({ data }: { data: any }) {
  const total = Number(data?.total ?? 0)
  const rows = [
    { label: 'Bueno', value: Number(data?.bueno ?? 0), color: 'var(--sem-verde)' },
    { label: 'Regular', value: Number(data?.regular ?? 0), color: 'var(--sem-ambar)' },
    { label: 'Malo', value: Number(data?.malo ?? 0), color: 'var(--sem-rojo)' },
    { label: 'Crítico', value: Number(data?.critico ?? 0), color: 'var(--sem-vencido)' },
  ]
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px]">Estado del inventario vial</CardTitle>
        <CardDescription className="text-[12px]">{fmtNumber(total)} elementos registrados</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: r.color }} />
                {r.label}
              </span>
              <span className="font-semibold tabular-nums">{fmtNumber(r.value)}</span>
            </div>
            <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${total ? (r.value / total) * 100 : 0}%`, background: r.color }}
              />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" className="mt-2 w-full" asChild>
          <Link href="/inventario">
            <Boxes className="size-3.5" />
            Ver inventario
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function RecentActivity({ serviceId }: { serviceId: string }) {
  const sb = React.useMemo(() => createClient(), [])
  const { data, isLoading } = useQuery({
    queryKey: ['recent-activity', serviceId],
    queryFn: async () => {
      const { data } = await sb
        .from('v_work_entries')
        .select('id, activity_name, activity_color, section_name, prog_start_m, prog_end_m, quantity, unit_symbol, crew_name, created_at, evidence_count')
        .eq('service_id', serviceId)
        .order('created_at', { ascending: false })
        .limit(8)
      return data ?? []
    },
    refetchInterval: 60_000,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">Últimos registros de campo</CardTitle>
        <CardDescription className="text-[12px]">En vivo desde las cuadrillas</CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {isLoading ? (
          <SkeletonList rows={5} />
        ) : !data?.length ? (
          <EmptyState icon={HardHat} title="Sin registros aún" description="Cuando las cuadrillas registren actividad, aparecerá aquí." className="py-8" />
        ) : (
          <ul className="space-y-0.5">
            {data.map((e: any) => (
              <li key={e.id} className="hover:bg-secondary/60 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: e.activity_color ?? 'var(--primary)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{e.activity_name}</p>
                  <p className="text-muted-foreground flex items-center gap-1.5 truncate text-[11px]">
                    {e.section_name} · <Progresiva from={e.prog_start_m} to={e.prog_end_m} className="text-[10.5px]" />
                  </p>
                  <p className="text-muted-foreground/80 mt-0.5 flex items-center gap-2 text-[10.5px]">
                    <Clock className="size-2.5" />
                    {fmtRelative(e.created_at)} · {e.crew_name}
                    {e.evidence_count > 0 && (
                      <span className="text-success flex items-center gap-0.5">
                        <Camera className="size-2.5" />
                        {e.evidence_count}
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold tabular-nums">{fmtNumber(e.quantity, 1)}</span>
                  <span className="text-muted-foreground block text-[10px]">{e.unit_symbol}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
