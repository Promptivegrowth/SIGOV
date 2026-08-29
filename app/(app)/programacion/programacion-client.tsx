'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  CalendarRange, ChevronLeft, ChevronRight, Plus, Upload, Send,
  Zap, CircleCheck, Users, LayoutGrid, List, TriangleAlert,
  Pencil, Trash2, Search, X,
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormDialog, ConfirmDialog, type FormField } from '@/components/forms/form-dialog'
import { PLAN_ITEM_STATUS } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, startOfWeek, toISODate, addDays, isoWeek, truncate, parseProgresiva, fmtProgresiva } from '@/lib/utils'
import { toast } from 'sonner'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function ProgramacionClient() {
  const { service, can, crew, role, profile } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [offset, setOffset] = React.useState(0)
  const [view, setView] = React.useState<'tablero' | 'lista'>('tablero')
  const [itemForm, setItemForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [confirm, setConfirm] = React.useState<any>(null)
  const [q, setQ] = React.useState('')
  const [crewFilter, setCrewFilter] = React.useState('todas')
  const [statusFilter, setStatusFilter] = React.useState('todos')

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
    let all = items.data ?? []
    if (role === 'jefe_cuadrilla' && crew) all = all.filter((r: any) => r.crew_id === crew.id)
    if (crewFilter !== 'todas') all = all.filter((r: any) => r.crew_id === crewFilter)
    if (statusFilter !== 'todos') all = all.filter((r: any) => r.status === statusFilter)
    if (q) {
      const t = q.toLowerCase()
      all = all.filter((r: any) =>
        r.activity_name?.toLowerCase().includes(t) ||
        r.section_name?.toLowerCase().includes(t) ||
        r.crew_name?.toLowerCase().includes(t) ||
        r.prog_start_txt?.includes(t)
      )
    }
    return all
  }, [items.data, role, crew, crewFilter, statusFilter, q])

  const catalogs = useQuery({
    queryKey: ['prog-catalogs', service.id],
    queryFn: async () => {
      const [acts, secs] = await Promise.all([
        sb.from('activities_catalog').select('id, code, name, category, color, unit_id')
          .eq('service_id', service.id).eq('is_active', true).is('deleted_at', null).order('code'),
        sb.from('road_sections').select('id, code, name, prog_start_m, prog_end_m')
          .eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      return { activities: acts.data ?? [], sections: secs.data ?? [] }
    },
    staleTime: 5 * 60_000,
  })

  const itemFields: FormField[] = [
    {
      name: 'activity_id', label: 'Actividad', type: 'select', required: true, span: 2,
      options: (catalogs.data?.activities ?? []).map((a: any) => ({
        value: a.id, label: `${a.code} · ${a.name}`, color: a.color,
      })),
    },
    {
      name: 'section_id', label: 'Tramo', type: 'select', required: true, span: 2,
      options: (catalogs.data?.sections ?? []).map((sx: any) => ({ value: sx.id, label: `${sx.code} · ${sx.name}` })),
    },
    { name: 'prog_start', label: 'Progresiva inicio', type: 'progresiva', required: true, placeholder: '12+450' },
    { name: 'prog_end', label: 'Progresiva fin', type: 'progresiva', required: true, placeholder: '15+200' },
    {
      name: 'crew_id', label: 'Cuadrilla', type: 'select',
      options: (crews.data ?? []).map((c: any) => ({ value: c.id, label: c.name, color: c.color })),
    },
    { name: 'scheduled_on', label: 'Fecha programada', type: 'date', required: true },
    { name: 'target_qty', label: 'Meta', type: 'number', required: true, step: 0.1, placeholder: '3800' },
    {
      name: 'status', label: 'Estado', type: 'select', defaultValue: 'programado',
      options: Object.entries(PLAN_ITEM_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
    },
    { name: 'notes', label: 'Nota', type: 'textarea', span: 2, placeholder: 'Indicaciones para la cuadrilla…' },
  ]

  const ensurePlan = async () => {
    if (p?.id) return p.id
    const { data, error } = await sb.from('weekly_plans').insert({
      service_id: service.id,
      year: monday.getFullYear(),
      week: weekNo,
      starts_on: toISODate(monday),
      ends_on: toISODate(sunday),
      status: 'borrador',
      created_by: profile.id,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id
  }

  const saveItem = async (v: any) => {
    const start = parseProgresiva(String(v.prog_start))
    const end = parseProgresiva(String(v.prog_end))
    if (start == null || end == null) { toast.error('Progresivas no válidas. Usa el formato 12+450'); return }
    if (end <= start) { toast.error('La progresiva final debe ser mayor que la inicial'); return }

    const act = catalogs.data?.activities.find((a: any) => a.id === v.activity_id)
    try {
      const planId = await ensurePlan()
      const payload = {
        plan_id: planId,
        service_id: service.id,
        activity_id: v.activity_id,
        section_id: v.section_id,
        crew_id: v.crew_id || null,
        scheduled_on: v.scheduled_on,
        prog_start_m: start,
        prog_end_m: end,
        target_qty: Number(v.target_qty) || 0,
        unit_id: act?.unit_id ?? null,
        status: v.status || 'programado',
        notes: v.notes || null,
      }
      const { error } = itemForm.row
        ? await sb.from('plan_items').update(payload).eq('id', itemForm.row.id)
        : await sb.from('plan_items').insert({ ...payload, created_by: profile.id })
      if (error) { toast.error(error.message); return }
      toast.success(itemForm.row ? 'Actividad actualizada' : 'Actividad programada')
      qc.invalidateQueries()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar')
    }
  }

  const deleteItem = async (row: any) => {
    const { error } = await sb.from('plan_items')
      .update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    toast.success('Actividad retirada de la programación')
    qc.invalidateQueries()
  }

  const publish = async () => {
    try {
      const planId = await ensurePlan()
      const { error } = await sb.from('weekly_plans').update({
        status: 'publicado',
        published_at: new Date().toISOString(),
        published_by: profile.id,
      }).eq('id', planId)
      if (error) { toast.error(error.message); return }
      toast.success('Programación publicada', { description: 'Las cuadrillas ya la ven en sus celulares.' })
      qc.invalidateQueries()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo publicar')
    }
  }

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
              {p?.status !== 'publicado' && p?.status !== 'cerrado' && (
                <Button variant="outline" onClick={publish} disabled={!rows.length}>
                  <Send className="size-4" />
                  Publicar a campo
                </Button>
              )}
              <Button onClick={() => setItemForm({ open: true })}>
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
        {/* Filtros y busqueda */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Buscar actividad, tramo o progresiva..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                aria-label="Limpiar busqueda"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {role !== 'jefe_cuadrilla' && (
            <Select value={crewFilter} onValueChange={setCrewFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Cuadrilla" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuadrillas</SelectItem>
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
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(PLAN_ITEM_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {fmtNumber(rows.length)} de {fmtNumber(items.data?.length ?? 0)} actividades
          </span>
        </div>

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
          <BoardView
            rows={rows}
            crews={visibleCrews}
            monday={monday}
            canEdit={can.manage}
            onEdit={(row) => setItemForm({ open: true, row })}
          />
        ) : (
          <ListView
            rows={rows}
            canEdit={can.manage}
            onEdit={(row) => setItemForm({ open: true, row })}
            onDelete={(row) => setConfirm({
              title: 'Retirar ' + row.activity_name + ' de la programacion?',
              description: row.section_name + ' - ' + row.prog_start_txt + ' - ' + fmtDate(row.scheduled_on) + '. El avance ya registrado en campo se conserva.',
              action: () => deleteItem(row),
            })}
          />
        )}
      </PageBody>

      <FormDialog
        open={itemForm.open}
        onOpenChange={(v) => setItemForm({ open: v, row: v ? itemForm.row : undefined })}
        title={itemForm.row ? 'Editar actividad programada' : 'Programar actividad'}
        description={'Semana ' + weekNo + ' - del ' + fmtDate(monday) + ' al ' + fmtDate(sunday) + '. La cuadrilla la vera en su celular al publicar.'}
        fields={itemFields}
        initial={itemForm.row ? {
          ...itemForm.row,
          prog_start: fmtProgresiva(itemForm.row.prog_start_m),
          prog_end: fmtProgresiva(itemForm.row.prog_end_m),
        } : { scheduled_on: toISODate(monday) }}
        submitLabel={itemForm.row ? 'Guardar cambios' : 'Programar'}
        onSubmit={saveItem}
      />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="Si, retirar"
        onConfirm={async () => { await confirm?.action?.() }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function BoardView({
  rows, crews, monday, canEdit, onEdit,
}: {
  rows: any[]; crews: any[]; monday: Date
  canEdit?: boolean; onEdit?: (row: any) => void
}) {
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
                      <PlanChip key={r.id} item={r} canEdit={canEdit} onEdit={onEdit} />
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
                    {cell.map((r) => <PlanChip key={r.id} item={r} canEdit={canEdit} onEdit={onEdit} />)}
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

function PlanChip({ item, canEdit, onEdit }: { item: any; canEdit?: boolean; onEdit?: (row: any) => void }) {
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
        onClick={() => canEdit && onEdit?.(item)}
        className={cn(
          'group rounded-md border-l-[3px] bg-card px-2 py-1.5 shadow-sm transition-all hover:shadow-md',
          canEdit ? 'cursor-pointer hover:ring-1 hover:ring-primary/30' : 'cursor-default',
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
function ListView({
  rows, canEdit, onEdit, onDelete,
}: {
  rows: any[]
  canEdit?: boolean
  onEdit?: (row: any) => void
  onDelete?: (row: any) => void
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40">
            <tr className="text-muted-foreground text-[11px] tracking-wide uppercase">
              {['Fecha', 'Actividad', 'Tramo / progresiva', 'Cuadrilla', 'Meta', 'Avance', 'Estado', ''].map((h) => (
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
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canEdit && (
                      <span className="flex justify-end gap-1">
                        <Tip label="Editar">
                          <Button variant="ghost" size="icon-sm" onClick={() => onEdit?.(r)}>
                            <Pencil className="size-3.5" />
                          </Button>
                        </Tip>
                        <Tip label="Retirar de la programacion">
                          <Button variant="ghost" size="icon-sm" onClick={() => onDelete?.(r)}>
                            <Trash2 className="text-destructive size-3.5" />
                          </Button>
                        </Tip>
                      </span>
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
