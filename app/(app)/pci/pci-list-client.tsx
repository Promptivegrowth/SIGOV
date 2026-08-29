'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  TriangleAlert, Plus, FileText, Calendar, ChevronRight,
  Zap, CircleCheck, Timer, Filter,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState, ProgressBar } from '@/components/shared/misc'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SkeletonKpi, SkeletonList } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PCI_PRIORITY, SEMAFORO } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, truncate } from '@/lib/utils'

export function PciListClient() {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [q, setQ] = React.useState('')
  const [priority, setPriority] = React.useState<string>('todas')

  const { data, isLoading } = useQuery({
    queryKey: ['pcis', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('pcis')
        .select('*')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('notified_on', { ascending: false })
      return data ?? []
    },
  })

  const { data: semaforos } = useQuery({
    queryKey: ['pci-semaforos', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('v_pci_items')
        .select('pci_id, semaforo')
        .eq('service_id', service.id)
      const acc: Record<string, Record<string, number>> = {}
      for (const r of data ?? []) {
        acc[r.pci_id!] ??= {}
        acc[r.pci_id!][r.semaforo!] = (acc[r.pci_id!][r.semaforo!] ?? 0) + 1
      }
      return acc
    },
  })

  const filtered = (data ?? []).filter((p: any) => {
    if (priority !== 'todas' && p.priority !== priority) return false
    if (!q) return true
    const s = q.toLowerCase()
    return p.code.toLowerCase().includes(s) || p.title.toLowerCase().includes(s)
  })

  const totals = React.useMemo(() => {
    const all = Object.values(semaforos ?? {}).reduce(
      (acc, s) => {
        for (const [k, v] of Object.entries(s)) acc[k] = (acc[k] ?? 0) + v
        return acc
      },
      {} as Record<string, number>
    )
    return {
      items: Object.values(all).reduce((a, b) => a + b, 0),
      vencidos: all.vencido ?? 0,
      criticos: all.rojo ?? 0,
      levantados: all.ok ?? 0,
      abiertos: (data ?? []).filter((p: any) => ['abierto', 'en_atencion'].includes(p.status)).length,
    }
  }, [semaforos, data])

  const pendienteSuspension = (data ?? []).find(
    (p: any) => ['alta', 'critica'].includes(p.priority) && !p.suspension_applied_at
  )

  return (
    <>
      <PageHeader
        icon={TriangleAlert}
        title="PCIs · OSITRAN"
        description="Pedidos de Corrección de Incumplimiento con plazos diferenciados por ítem, semáforo de vencimientos y evidencia obligatoria de levantamiento."
        actions={
          can.manage && (
            <>
              <Button variant="outline" asChild>
                <Link href="/importar?kind=pci">
                  <FileText className="size-4" />
                  Importar Excel
                </Link>
              </Button>
              <Button>
                <Plus className="size-4" />
                Nuevo PCI
              </Button>
            </>
          )
        }
      />

      <PageBody className="space-y-5">
        {/* KPIs */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard index={0} label="PCIs abiertos" value={totals.abiertos} icon={FileText} tone="primary" hint={`${data?.length ?? 0} en total`} />
            <StatCard index={1} label="Ítems totales" value={totals.items} icon={Filter} hint={`${fmtNumber(totals.levantados)} levantados`} />
            <StatCard index={2} label="Ítems críticos" value={totals.criticos} icon={Timer} tone="warning" hint="20% o menos del plazo" />
            <StatCard index={3} label="Ítems vencidos" value={totals.vencidos} icon={TriangleAlert} tone={totals.vencidos ? 'danger' : 'success'} hint="pasaron la fecha límite" />
          </div>
        )}

        {/* Aviso del motor de reprogramación */}
        {pendienteSuspension && can.manage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/8 border-destructive/30 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3.5"
          >
            <span className="bg-destructive/15 text-destructive pulse-ring flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Zap className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">
                {pendienteSuspension.code} es un PCI {PCI_PRIORITY[pendienteSuspension.priority as keyof typeof PCI_PRIORITY].label.toLowerCase()} sin reprogramar
              </p>
              <p className="text-muted-foreground text-[12px]">
                El sistema puede suspender y reordenar automáticamente la programación semanal en conflicto.
              </p>
            </div>
            <Button variant="destructive" size="sm" asChild>
              <Link href={`/pci/${pendienteSuspension.id}?suspension=1`}>
                Revisar reprogramación
                <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </motion.div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por código o título…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las prioridades</SelectItem>
              {Object.entries(PCI_PRIORITY).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto text-[12px]">
            {filtered.length} de {data?.length ?? 0} PCIs
          </span>
        </div>

        {/* Lista */}
        {isLoading ? (
          <SkeletonList rows={4} />
        ) : !filtered.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={TriangleAlert}
                title="Sin PCIs registrados"
                description="Importa el Excel de OSITRAN o crea un PCI manualmente para empezar a gestionar los plazos."
                action={can.manage && <Button asChild><Link href="/importar?kind=pci">Importar Excel</Link></Button>}
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="stagger space-y-3">
            {filtered.map((p: any) => (
              <PciCard key={p.id} pci={p} semaforo={semaforos?.[p.id] ?? {}} />
            ))}
          </ul>
        )}
      </PageBody>
    </>
  )
}

function PciCard({ pci, semaforo }: { pci: any; semaforo: Record<string, number> }) {
  const total = Object.values(semaforo).reduce((a, b) => a + b, 0) || pci.items_total || 1
  const done = semaforo.ok ?? pci.items_done ?? 0
  const pct = (done / total) * 100
  const prio = PCI_PRIORITY[pci.priority as keyof typeof PCI_PRIORITY]
  const overdue = semaforo.vencido ?? 0

  return (
    <li>
      <Link
        href={`/pci/${pci.id}`}
        className="bg-card group block rounded-xl border border-border p-4 transition-all hover:border-primary/40 hover:shadow-md"
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] font-bold tracking-tight">{pci.code}</span>
              <Badge className={prio.className}>{prio.label}</Badge>
              {pci.suspends_plan && (
                <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
                  <Zap className="size-2.5" />
                  Programación reordenada
                </Badge>
              )}
              {overdue > 0 && (
                <Badge variant="destructive" className="gap-1">
                  {overdue} vencido{overdue === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            <h3 className="mt-1.5 text-[14.5px] font-semibold leading-snug">{pci.title}</h3>
            <p className="text-muted-foreground mt-1 line-clamp-2 text-[12.5px] leading-snug">
              {truncate(pci.description, 190)}
            </p>
            <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                Notificado {fmtDate(pci.notified_on)}
              </span>
              <span>Fuente: {pci.source}</span>
              <span>Plazo base: {pci.default_days} días</span>
            </div>
          </div>

          <div className="w-full shrink-0 sm:w-56">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[11.5px] text-muted-foreground">Levantamiento</span>
              <span className="text-[13px] font-bold tabular-nums">
                {fmtNumber(done)}<span className="text-muted-foreground">/{fmtNumber(total)}</span>
              </span>
            </div>
            <ProgressBar value={pct} showValue={false} />

            {/* Barra de semáforo: el color ES el dato */}
            <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full">
              {(['ok', 'verde', 'ambar', 'rojo', 'vencido'] as const).map((k) => {
                const v = semaforo[k] ?? 0
                if (!v) return null
                return (
                  <span
                    key={k}
                    title={`${SEMAFORO[k].label}: ${v}`}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ width: `${(v / total) * 100}%`, background: `var(--sem-${k})` }}
                  />
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {(['verde', 'ambar', 'rojo', 'vencido'] as const).map((k) => {
                const v = semaforo[k] ?? 0
                if (!v) return null
                return (
                  <span key={k} className="flex items-center gap-1 text-[10.5px]">
                    <span className="size-1.5 rounded-full" style={{ background: `var(--sem-${k})` }} />
                    <span className="text-muted-foreground">{SEMAFORO[k].label}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </span>
                )
              })}
            </div>
          </div>

          <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </Link>
    </li>
  )
}
