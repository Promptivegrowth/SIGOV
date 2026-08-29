'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Boxes, Search, Upload, Plus, MapPin, Wrench, Calendar,
  TriangleAlert, Download, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SkeletonTable, SkeletonKpi } from '@/components/ui/skeleton'
import { EmptyState, Progresiva } from '@/components/shared/misc'
import { StatCard } from '@/components/shared/stat-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ASSET_CONDITION } from '@/lib/constants'
import { cn, fmtDate, fmtNumber } from '@/lib/utils'

export function InventarioClient() {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [q, setQ] = React.useState('')
  const [type, setType] = React.useState('todos')
  const [condition, setCondition] = React.useState('todos')
  const [detail, setDetail] = React.useState<any>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const types = useQuery({
    queryKey: ['asset-types'],
    queryFn: async () => {
      const { data } = await sb.from('asset_types').select('*').eq('is_active', true).order('name')
      return data ?? []
    },
    staleTime: 10 * 60_000,
  })

  const assets = useQuery({
    queryKey: ['assets', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('v_road_assets')
        .select('*')
        .eq('service_id', service.id)
        .order('section_name')
        .order('progresiva_m')
      return data ?? []
    },
  })

  const filtered = React.useMemo(() => {
    let rows = assets.data ?? []
    if (type !== 'todos') rows = rows.filter((r: any) => r.type_id === type)
    if (condition !== 'todos') rows = rows.filter((r: any) => r.condition === condition)
    if (q) {
      const s = q.toLowerCase()
      rows = rows.filter(
        (r: any) =>
          r.code?.toLowerCase().includes(s) ||
          r.name?.toLowerCase().includes(s) ||
          r.section_name?.toLowerCase().includes(s) ||
          r.progresiva_txt?.includes(s)
      )
    }
    return rows
  }, [assets.data, type, condition, q])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 14,
  })

  const stats = React.useMemo(() => {
    const rows = assets.data ?? []
    const byCondition = rows.reduce((acc: any, r: any) => {
      acc[r.condition] = (acc[r.condition] ?? 0) + 1
      return acc
    }, {})
    const overdue = rows.filter(
      (r: any) => r.next_inspection_on && new Date(r.next_inspection_on) < new Date()
    ).length
    return {
      total: rows.length,
      critico: byCondition.critico ?? 0,
      malo: byCondition.malo ?? 0,
      overdue,
      byCondition,
    }
  }, [assets.data])

  return (
    <>
      <PageHeader
        icon={Boxes}
        title="Inventario vial"
        description="Alcantarillas, guardavías, señales, postes SOS y demás elementos, ubicados por progresiva e integrados al mapa y al historial de intervenciones."
        actions={
          can.manage && (
            <>
              <Button variant="outline" asChild>
                <Link href="/importar?kind=inventario">
                  <Upload className="size-4" />
                  Importar
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/mapa">
                  <MapPin className="size-4" />
                  Ver en el mapa
                </Link>
              </Button>
            </>
          )
        }
      />

      <PageBody className="space-y-4">
        {assets.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index={0} label="Elementos registrados" value={stats.total} icon={Boxes} tone="primary" hint={`${types.data?.length ?? 0} tipos distintos`} />
            <StatCard index={1} label="En estado malo" value={stats.malo} icon={Wrench} tone="warning" hint="requieren intervención" />
            <StatCard index={2} label="En estado crítico" value={stats.critico} icon={TriangleAlert} tone={stats.critico ? 'danger' : 'success'} hint="atención prioritaria" />
            <StatCard index={3} label="Inspección vencida" value={stats.overdue} icon={Calendar} tone={stats.overdue ? 'warning' : 'default'} hint="pasó la fecha prevista" />
          </div>
        )}

        {/* Distribución por estado */}
        {!assets.isLoading && (
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-wide uppercase">
                Estado de conservación del inventario
              </p>
              <div className="flex h-2.5 overflow-hidden rounded-full">
                {(['bueno', 'regular', 'malo', 'critico', 'no_evaluado'] as const).map((k) => {
                  const v = stats.byCondition[k] ?? 0
                  if (!v) return null
                  return (
                    <span
                      key={k}
                      title={`${ASSET_CONDITION[k].label}: ${v}`}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${(v / stats.total) * 100}%`, background: ASSET_CONDITION[k].dot }}
                    />
                  )
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                {(['bueno', 'regular', 'malo', 'critico', 'no_evaluado'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setCondition(condition === k ? 'todos' : k)}
                    className={cn(
                      'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px] transition-colors',
                      condition === k ? 'bg-secondary' : 'hover:bg-secondary/60'
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ background: ASSET_CONDITION[k].dot }} />
                    <span className="text-muted-foreground">{ASSET_CONDITION[k].label}</span>
                    <span className="font-semibold tabular-nums">{fmtNumber(stats.byCondition[k] ?? 0)}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input placeholder="Buscar código, tramo o progresiva…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de elemento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {(types.data ?? []).map((t: any) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: t.color }} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(ASSET_CONDITION).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {fmtNumber(filtered.length)} de {fmtNumber(stats.total)}
          </span>
        </div>

        {/* Tabla virtualizada — miles de elementos sin perder fluidez */}
        {assets.isLoading ? (
          <SkeletonTable rows={12} cols={6} />
        ) : !filtered.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState icon={Boxes} title="Sin elementos" description="Ajusta los filtros o importa el inventario desde Excel." />
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="bg-muted/40 text-muted-foreground flex items-center gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">
              <span className="w-32">Código</span>
              <span className="flex-1">Elemento</span>
              <span className="hidden w-40 md:block">Tramo</span>
              <span className="w-24">Progresiva</span>
              <span className="hidden w-20 lg:block">Lado</span>
              <span className="w-24">Estado</span>
              <span className="hidden w-24 xl:block">Inspección</span>
              <span className="w-6" />
            </div>
            <div ref={scrollRef} className="max-h-[58vh] overflow-auto">
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const r: any = filtered[v.index]
                  const cond = ASSET_CONDITION[r.condition as keyof typeof ASSET_CONDITION]
                  const overdue = r.next_inspection_on && new Date(r.next_inspection_on) < new Date()
                  return (
                    <button
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className="hover:bg-secondary/50 absolute inset-x-0 flex items-center gap-3 border-b border-border px-4 text-left text-[12.5px] transition-colors"
                      style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                    >
                      <span className="w-32 truncate font-mono text-[11.5px]">{r.code}</span>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: r.type_color }} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name ?? r.type_name}</span>
                          <span className="text-muted-foreground block truncate text-[10.5px]">{r.type_name}</span>
                        </span>
                      </span>
                      <span className="text-muted-foreground hidden w-40 truncate md:block">{r.section_name ?? '—'}</span>
                      <span className="w-24">
                        <Progresiva from={r.progresiva_m} />
                      </span>
                      <span className="text-muted-foreground hidden w-20 capitalize lg:block">{r.side}</span>
                      <span className="w-24">
                        <Badge className={cond.className}>{cond.label}</Badge>
                      </span>
                      <span className={cn('hidden w-24 text-[11px] tabular-nums xl:block', overdue && 'text-destructive font-semibold')}>
                        {r.next_inspection_on ? fmtDate(r.next_inspection_on) : '—'}
                      </span>
                      <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        )}
      </PageBody>

      {/* Ficha del elemento */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent size="md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <span className="size-3 rounded-full" style={{ background: detail.type_color }} />
                  {detail.name ?? detail.code}
                </DialogTitle>
                <DialogDescription>
                  {detail.type_name} · {detail.type_category} · código {detail.code}
                </DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px]">
                {[
                  ['Tramo', detail.section_name],
                  ['Progresiva', detail.progresiva_txt],
                  ['Lado', detail.side],
                  ['Estado', ASSET_CONDITION[detail.condition as keyof typeof ASSET_CONDITION].label],
                  ['Año de instalación', detail.install_year],
                  ['Última inspección', detail.last_inspected_on ? fmtDate(detail.last_inspected_on) : '—'],
                  ['Próxima inspección', detail.next_inspection_on ? fmtDate(detail.next_inspection_on) : '—'],
                  ['Intervenciones', detail.interventions_count],
                  ['Coordenadas', `${detail.lat?.toFixed(5)}, ${detail.lng?.toFixed(5)}`],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt className="text-muted-foreground text-[11px]">{k}</dt>
                    <dd className="font-medium capitalize">{v ?? '—'}</dd>
                  </div>
                ))}
              </dl>

              {detail.attributes && Object.keys(detail.attributes).length > 0 && (
                <div className="border-border border-t pt-3">
                  <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                    Atributos técnicos
                  </p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                    {Object.entries(detail.attributes).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-muted-foreground text-[11px] capitalize">{k.replace(/_/g, ' ')}</dt>
                        <dd className="font-medium">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" asChild>
                  <Link href={`/mapa?focus=${detail.id}`}>
                    <MapPin className="size-4" />
                    Ver en el mapa
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
