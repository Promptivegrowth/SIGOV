'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowLeft, TriangleAlert, Zap, Search, Camera, CircleCheck,
  Download, Users, RotateCcw, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/primitives'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, SemaforoBadge, Progresiva, ProgressBar } from '@/components/shared/misc'
import { SuspensionDialog } from '@/components/pci/suspension-dialog'
import { PCI_PRIORITY, PCI_ITEM_STATUS, SEMAFORO, type Semaforo } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, truncate } from '@/lib/utils'
import { toast } from 'sonner'

export function PciDetailClient({ pciId }: { pciId: string }) {
  const { service, can } = useSession()
  const params = useSearchParams()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [q, setQ] = React.useState('')
  const [semFilter, setSemFilter] = React.useState<string>('todos')
  const [statusFilter, setStatusFilter] = React.useState<string>('todos')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [suspOpen, setSuspOpen] = React.useState(params.get('suspension') === '1')

  const scrollRef = React.useRef<HTMLDivElement>(null)

  const pci = useQuery({
    queryKey: ['pci', pciId],
    queryFn: async () => {
      const { data, error } = await sb.from('pcis').select('*').eq('id', pciId).single()
      if (error) throw error
      return data
    },
  })

  const items = useQuery({
    queryKey: ['pci-items', pciId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_pci_items')
        .select('*')
        .eq('pci_id', pciId)
        .order('item_number')
      if (error) throw error
      return data ?? []
    },
  })

  const filtered = React.useMemo(() => {
    let rows = items.data ?? []
    if (semFilter !== 'todos') rows = rows.filter((r: any) => r.semaforo === semFilter)
    if (statusFilter !== 'todos') rows = rows.filter((r: any) => r.status === statusFilter)
    if (q) {
      const s = q.toLowerCase()
      rows = rows.filter(
        (r: any) =>
          r.description?.toLowerCase().includes(s) ||
          String(r.item_number).includes(s) ||
          r.section_name?.toLowerCase().includes(s)
      )
    }
    return rows
  }, [items.data, semFilter, statusFilter, q])

  // Virtualización: un PCI puede traer cientos de ítems
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 62,
    overscan: 12,
  })

  const counts = React.useMemo(() => {
    const acc: Record<string, number> = {}
    for (const r of items.data ?? []) acc[r.semaforo!] = (acc[r.semaforo!] ?? 0) + 1
    return acc
  }, [items.data])

  const p = pci.data
  const prio = p ? PCI_PRIORITY[p.priority as keyof typeof PCI_PRIORITY] : null
  const total = items.data?.length ?? 0
  const done = counts.ok ?? 0

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((r: any) => r.id)))
  }

  const bulkAssign = async (crewId: string) => {
    const ids = [...selected]
    const { error } = await sb.from('pci_items').update({ assigned_crew_id: crewId }).in('id', ids)
    if (error) return toast.error(error.message)
    toast.success(`${ids.length} ítems asignados`)
    setSelected(new Set())
    qc.invalidateQueries({ queryKey: ['pci-items', pciId] })
  }

  const crews = useQuery({
    queryKey: ['crews', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('crews')
        .select('id, name, color')
        .eq('service_id', service.id)
        .is('deleted_at', null)
      return data ?? []
    },
  })

  return (
    <>
      <PageHeader
        title={p?.code ?? 'PCI'}
        description={p?.title}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/pci">
                <ArrowLeft className="size-4" />
                Volver
              </Link>
            </Button>
            {can.manage && ['alta', 'critica'].includes(p?.priority ?? '') && (
              <Button
                variant={p?.suspension_applied_at ? 'outline' : 'destructive'}
                onClick={() => setSuspOpen(true)}
              >
                <Zap className="size-4" />
                {p?.suspension_applied_at ? 'Ver reprogramación' : 'Reprogramar semana'}
              </Button>
            )}
            <Button variant="outline">
              <Download className="size-4" />
              Exportar
            </Button>
          </>
        }
      >
        {p && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Badge className={prio!.className}>Prioridad {prio!.label}</Badge>
            <span className="text-muted-foreground text-[12.5px]">
              Notificado el <strong className="text-foreground">{fmtDate(p.notified_on)}</strong>
            </span>
            <span className="text-muted-foreground text-[12.5px]">
              Fuente <strong className="text-foreground">{p.source}</strong>
            </span>
            {p.suspension_applied_at && (
              <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
                <Zap className="size-2.5" />
                Programación reordenada el {fmtDate(p.suspension_applied_at)}
              </Badge>
            )}
            <div className="ml-auto w-full max-w-xs">
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="text-muted-foreground">Levantamiento</span>
                <span className="font-semibold tabular-nums">
                  {fmtNumber(done)}/{fmtNumber(total)} ítems
                </span>
              </div>
              <ProgressBar value={total ? (done / total) * 100 : 0} showValue={false} />
            </div>
          </div>
        )}
      </PageHeader>

      <PageBody className="space-y-4">
        {/* Filtros por semáforo — el color con su etiqueta y su cifra */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSemFilter('todos')}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-all',
              semFilter === 'todos' ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/30'
            )}
          >
            Todos
            <span className="font-bold tabular-nums">{total}</span>
          </button>
          {(['verde', 'ambar', 'rojo', 'vencido', 'ok'] as Semaforo[]).map((k) => (
            <button
              key={k}
              onClick={() => setSemFilter(semFilter === k ? 'todos' : k)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-all',
                semFilter === k ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/30'
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: `var(--sem-${k})` }} />
              {SEMAFORO[k].label}
              <span className="font-bold tabular-nums">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Buscar ítem, descripción o tramo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(PCI_ITEM_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {fmtNumber(filtered.length)} ítems
          </span>
        </div>

        {/* Acciones masivas */}
        {selected.size > 0 && can.manage && (
          <div className="bg-primary/8 border-primary/25 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5">
            <span className="text-[13px] font-semibold">{selected.size} seleccionados</span>
            <Select onValueChange={bulkAssign}>
              <SelectTrigger size="sm" className="w-52">
                <SelectValue placeholder="Asignar a cuadrilla…" />
              </SelectTrigger>
              <SelectContent>
                {(crews.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpiar
            </Button>
          </div>
        )}

        {/* Tabla virtualizada */}
        {items.isLoading ? (
          <SkeletonTable rows={10} cols={6} />
        ) : !filtered.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState icon={TriangleAlert} title="Sin ítems que coincidan" description="Ajusta los filtros para ver más resultados." />
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="bg-muted/40 text-muted-foreground flex items-center gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold tracking-wide uppercase">
              {can.manage && (
                <Checkbox
                  checked={selected.size > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                  aria-label="Seleccionar todos"
                />
              )}
              <span className="w-10">#</span>
              <span className="flex-1">Descripción</span>
              <span className="hidden w-40 lg:block">Ubicación</span>
              <span className="hidden w-28 md:block">Vence</span>
              <span className="w-28">Semáforo</span>
              <span className="hidden w-24 xl:block">Cuadrilla</span>
              <span className="w-16 text-center">Fotos</span>
            </div>

            <div ref={scrollRef} className="max-h-[62vh] overflow-auto">
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const r: any = filtered[v.index]
                  const isSel = selected.has(r.id)
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'absolute inset-x-0 flex items-center gap-3 border-b border-border px-4 text-[12.5px] transition-colors',
                        isSel ? 'bg-primary/6' : 'hover:bg-secondary/50'
                      )}
                      style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                    >
                      {can.manage && (
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => {
                            const next = new Set(selected)
                            isSel ? next.delete(r.id) : next.add(r.id)
                            setSelected(next)
                          }}
                          aria-label={`Seleccionar ítem ${r.item_number}`}
                        />
                      )}
                      <span className="text-muted-foreground w-10 font-mono text-[11.5px] tabular-nums">
                        {r.item_number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{truncate(r.description, 110)}</span>
                        <span className="text-muted-foreground block text-[11px]">
                          {r.activity_name ?? 'Sin actividad asignada'}
                        </span>
                      </span>
                      <span className="hidden w-40 lg:block">
                        <span className="block truncate text-[11.5px]">{r.section_name ?? '—'}</span>
                        <Progresiva from={r.prog_start_m} className="text-[10.5px] text-muted-foreground" />
                      </span>
                      <span className="hidden w-28 md:block">
                        <span className="block text-[11.5px] tabular-nums">{fmtDate(r.due_date)}</span>
                        <span className="text-muted-foreground block text-[10.5px]">
                          plazo {r.term_days}d
                        </span>
                      </span>
                      <span className="w-28">
                        <SemaforoBadge value={r.semaforo} days={r.days_left} />
                      </span>
                      <span className="hidden w-24 truncate text-[11.5px] xl:block">
                        {r.crew_name ?? <span className="text-muted-foreground">—</span>}
                      </span>
                      <span className="w-16 text-center">
                        {r.evidence_count > 0 ? (
                          <span className="text-success inline-flex items-center gap-1 text-[11.5px] font-semibold">
                            <Camera className="size-3" />
                            {r.evidence_count}
                          </span>
                        ) : r.requires_evidence ? (
                          <span className="text-muted-foreground/60 text-[11px]">—</span>
                        ) : (
                          <CircleCheck className="text-muted-foreground/40 mx-auto size-3.5" />
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )}
      </PageBody>

      {p && (
        <SuspensionDialog
          open={suspOpen}
          onOpenChange={setSuspOpen}
          pci={p}
          onApplied={() => {
            qc.invalidateQueries({ queryKey: ['pci', pciId] })
            qc.invalidateQueries({ queryKey: ['plan-items'] })
          }}
        />
      )}
    </>
  )
}
