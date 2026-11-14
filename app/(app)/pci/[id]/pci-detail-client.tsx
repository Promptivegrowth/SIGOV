'use client'

import { usePlazosPci, etiquetaPlazo } from '@/lib/hooks/use-plazos-pci'
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowLeft, TriangleAlert, Zap, Search, Camera, CircleCheck,
  Download, Users, RotateCcw, ChevronDown, Send, Image as ImageIcon, ArrowUpDown, Gauge,
} from 'lucide-react'
import { createClient, fetchAll } from '@/lib/supabase/client'
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
import { PciItemSheet } from '@/components/pci/pci-item-sheet'
import { FormDialog } from '@/components/forms/form-dialog'
import { FotosReferencialesLote } from '@/components/pci/fotos-referenciales-lote'
import { VencimientosPorPlazo } from '@/components/pci/vencimientos-por-plazo'
import { CuadrillasDelPci } from '@/components/pci/cuadrillas-del-pci'
import { descargarPdf, descargarExcel, type ReportMeta } from '@/lib/reports'
import { PCI_PRIORITY, SEMAFORO, estadoPci, type Semaforo } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, truncate, toISODate } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Los estados por los que se filtra un PCI, como se ven en el mapa y la app:
 * «Por validar» espera a SERVICON, «Validado SERVICON» espera la conformidad
 * de COVINCA y «Conforme COVINCA» ya la tiene (OBS 8). «Por revisar» es lo
 * que espera a COVINCA, haya o no validado SERVICON.
 */
const ESTADOS_FILTRO = [
  { clave: 'pendiente', label: 'Por atender', color: '#94A3B8' },
  { clave: 'en_atencion', label: 'En ejecución', color: '#2563EB' },
  { clave: 'por_validar', label: 'Por validar', color: '#0891B2' },
  { clave: 'validado_servicon', label: 'Validado SERVICON', color: '#0E7490' },
  { clave: 'observado', label: 'Observado', color: '#7C3AED' },
  { clave: 'validado', label: 'Conforme COVINCA', color: '#16A34A' },
  { clave: 'por_revisar', label: 'Por revisar (COVINCA)', color: '#0891B2' },
] as const

function coincideEstado(r: any, clave: string): boolean {
  const e = estadoPci(r).clave
  if (clave === 'por_validar') return e === 'levantado' || e === 'subsanado'
  if (clave === 'por_revisar') return ['levantado', 'subsanado', 'validado_servicon'].includes(e)
  return e === clave
}

export function PciDetailClient({ pciId }: { pciId: string }) {
  const { service, can, profile, role } = useSession()
  const params = useSearchParams()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [q, setQ] = React.useState('')
  const [semFilter, setSemFilter] = React.useState<string>('todos')
  // El aviso abre el PCI ya filtrado: «PCI 70 tiene 8 ítems observados» (CASO 41)
  const [statusFilter, setStatusFilter] = React.useState<string>(() => {
    const e = params.get('estado')
    if (e === 'por_validar') return role === 'visor' ? 'por_revisar' : 'por_validar'
    return e && ESTADOS_FILTRO.some((x) => x.clave === e) ? e : 'todos'
  })
  const [reasignar, setReasignar] = React.useState<{ crewId: string; motivo: string } | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [suspOpen, setSuspOpen] = React.useState(params.get('suspension') === '1')
  const [sheetItem, setSheetItem] = React.useState<any>(null)
  const [exporting, setExporting] = React.useState<string | null>(null)
  // Por km para que la cuadrilla avance en orden por la vía (Elvis, 21/10)
  const [orden, setOrden] = React.useState<'item' | 'km_asc' | 'km_desc' | 'vence'>('item')
  const [lote, setLote] = React.useState(false)

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
      // Un PCI puede traer más de 1 000 ítems: se pagina para no perder ninguno
      return await fetchAll((from, to) =>
        sb.from('v_pci_items')
          .select('*')
          .eq('pci_id', pciId)
          .order('item_number')
          .order('id')
          .range(from, to)
      )
    },
  })

  const filtered = React.useMemo(() => {
    let rows = items.data ?? []
    if (semFilter !== 'todos') rows = rows.filter((r: any) => r.semaforo === semFilter)
    if (statusFilter !== 'todos') rows = rows.filter((r: any) => coincideEstado(r, statusFilter))
    if (q) {
      const s = q.toLowerCase()
      rows = rows.filter(
        (r: any) =>
          r.description?.toLowerCase().includes(s) ||
          String(r.item_number).includes(s) ||
          r.section_name?.toLowerCase().includes(s)
      )
    }
    const km = (r: any, sinDato: number) => (r.prog_start_m == null ? sinDato : Number(r.prog_start_m))
    const porItem = (a: any, b: any) => (a.item_number ?? 0) - (b.item_number ?? 0)
    if (orden === 'km_asc') rows = [...rows].sort((a, b) => km(a, Infinity) - km(b, Infinity) || porItem(a, b))
    else if (orden === 'km_desc') rows = [...rows].sort((a, b) => km(b, -Infinity) - km(a, -Infinity) || porItem(a, b))
    else if (orden === 'vence') rows = [...rows].sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')) || porItem(a, b))
    return rows
  }, [items.data, semFilter, statusFilter, q, orden])

  const conReferencia = React.useMemo(() => (items.data ?? []).filter((r: any) => r.foto_referencia_path).length, [items.data])

  // Virtualización: un PCI puede traer cientos de ítems
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 62,
    overscan: 12,
  })

  // El aviso de un ítem abre su ficha (?item=)
  const itemPedido = params.get('item')
  React.useEffect(() => {
    if (!itemPedido || !items.data) return
    const it = items.data.find((r: any) => r.id === itemPedido)
    if (it) setSheetItem(it)
  }, [itemPedido, items.data])

  // Cuántos hay en cada estado real (OBS 8: «Por validar» y «Conforme» aparte)
  const porEstado = React.useMemo(() => {
    const acc: Record<string, number> = {}
    for (const r of items.data ?? []) for (const e of ESTADOS_FILTRO) if (coincideEstado(r, e.clave)) acc[e.clave] = (acc[e.clave] ?? 0) + 1
    return acc
  }, [items.data])

  const counts = React.useMemo(() => {
    const acc: Record<string, number> = {}
    for (const r of items.data ?? []) acc[r.semaforo!] = (acc[r.semaforo!] ?? 0) + 1
    return acc
  }, [items.data])

  // Cuántos ítems tiene cada plazo, para la tabla de vencimientos
  const porPlazo = React.useMemo(() => {
    const acc: Record<number, number> = {}
    for (const r of items.data ?? []) if (r.term_days != null) acc[r.term_days] = (acc[r.term_days] ?? 0) + 1
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

  // Asignar pasa por la base: queda quién, cuándo, de qué cuadrilla a cuál y
  // el motivo, y a la cuadrilla nueva le llega un aviso por PCI (CASO 6, 36)
  const bulkAssign = async (crewId: string, motivo?: string) => {
    const ids = [...selected]
    const yaTenian = (items.data ?? []).some((r: any) => selected.has(r.id) && r.assigned_crew_id && r.assigned_crew_id !== crewId)
    if (yaTenian && !motivo) { setReasignar({ crewId, motivo: '' }); return }
    const { data, error } = await sb.rpc('reasignar_cuadrilla', { p_tipo: 'pci', p_ids: ids, p_crew: crewId, p_motivo: motivo })
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`${(data as any)?.cambiados ?? ids.length} ítems asignados`)
    setSelected(new Set())
    setReasignar(null)
    qc.invalidateQueries({ queryKey: ['pci-items', pciId] })
  }

  // El plazo se elige de la lista cerrada del contrato (OBS-08)
  const { plazos } = usePlazosPci()
  const bulkPlazo = async (plazo: string) => {
    const ids = [...selected]
    const { data, error } = await sb.rpc('pci_fijar_plazo' as any, { p_items: ids, p_plazo: Number(plazo) } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Plazo de ${etiquetaPlazo(Number(plazo))} fijado`, { description: `${(data as any)?.items ?? ids.length} ítems; su vencimiento se recalculó` })
    setSelected(new Set())
    qc.invalidateQueries({ queryKey: ['pci-items', pciId] })
  }

  // OBS-07: el PCI es borrador hasta que se publica; recién ahí lo ven las
  // cuadrillas y a cada jefe le llega el aviso. Volver a publicar tras
  // reasignar avisa solo a los jefes que faltaban.
  const [publicando, setPublicando] = React.useState(false)
  const publicar = async () => {
    setPublicando(true)
    const { data, error } = await sb.rpc('publicar_pci', { p_pci_id: pciId })
    setPublicando(false)
    if (error) return toast.error(mensajeAmigable(error))
    const r = data as { avisados: number; sin_cuadrilla: number }
    const yaEstaba = !!pci.data?.published_at
    toast.success(yaEstaba ? 'Aviso enviado a los jefes que faltaban' : 'PCI publicado a las cuadrillas', {
      description: [
        r.avisados === 0 ? 'Ningún jefe nuevo por avisar' : `${r.avisados} jefe${r.avisados === 1 ? '' : 's'} de cuadrilla avisado${r.avisados === 1 ? '' : 's'}`,
        r.sin_cuadrilla > 0 && `${r.sin_cuadrilla} ítem${r.sin_cuadrilla === 1 ? '' : 's'} sin cuadrilla: nadie los verá hasta asignarlos`,
      ].filter(Boolean).join(' · '),
      duration: 8000,
    })
    qc.invalidateQueries({ queryKey: ['pci', pciId] })
    qc.invalidateQueries({ queryKey: ['pcis'] })
  }

  const exportar = async (format: 'pdf' | 'excel') => {
    setExporting(format)
    try {
      const rows = filtered.map((i: any) => ({
        item: i.item_number,
        descripcion: truncate(i.description, 120),
        tramo: i.section_name ?? '-',
        progresiva: i.prog_start_txt ?? '-',
        plazo: i.term_days + ' d',
        vence: fmtDate(i.due_date),
        semaforo: SEMAFORO[i.semaforo as Semaforo]?.label ?? i.semaforo,
        estado: estadoPci(i).label,
        cuadrilla: i.crew_name ?? '-',
        // Como la columna ENCARGADO del control del PCI: quién lo ejecutó
        encargado: i.ejecutado_por ?? i.encargado ?? '-',
        fotos: i.evidence_count,
      }))
      const cols = [
        { header: 'Item', key: 'item', align: 'right' as const, width: 8 },
        { header: 'Descripcion', key: 'descripcion', width: 62 },
        { header: 'Tramo', key: 'tramo', width: 24 },
        { header: 'Progresiva', key: 'progresiva', width: 14 },
        { header: 'Plazo', key: 'plazo', align: 'right' as const, width: 10 },
        { header: 'Vence', key: 'vence', width: 13 },
        { header: 'Semaforo', key: 'semaforo', width: 14 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Cuadrilla', key: 'cuadrilla', width: 20 },
        { header: 'Encargado', key: 'encargado', width: 18 },
        { header: 'Fotos', key: 'fotos', align: 'center' as const, width: 8 },
      ]
      const meta: ReportMeta = {
        titulo: 'PCI ' + (p?.code ?? ''),
        subtitulo: p?.title,
        servicio: service.name,
        cliente: service.client_name,
        contrato: service.contract_code,
        periodo: 'Notificado el ' + fmtDate(p?.notified_on) + ' - plazo base ' + (p?.default_days ?? 0) + ' dias',
        generadoPor: profile.full_name,
        // Lo que se filtró y cuántos ítems salen (OBS 9)
        filtros: [
          statusFilter !== 'todos' && 'Estado: ' + (ESTADOS_FILTRO.find((x) => x.clave === statusFilter)?.label ?? statusFilter),
          semFilter !== 'todos' && 'Plazo: ' + (SEMAFORO[semFilter as Semaforo]?.label ?? semFilter),
          q && `Búsqueda: «${q}»`,
        ].filter(Boolean).join(' · ') || undefined,
        registros: rows.length,
        cuadrilla: [...new Set(filtered.map((i: any) => i.crew_name).filter(Boolean))].join(', ') || null,
      }
      const stamp = toISODate(new Date())
      if (format === 'pdf') {
        await descargarPdf('SIGOV_' + (p?.code ?? 'PCI') + '_' + stamp, meta, cols, rows, {
          landscape: true,
          kpis: [
            { label: 'Items', value: fmtNumber(filtered.length) },
            { label: 'Por validar', value: fmtNumber((porEstado.por_validar ?? 0) + (porEstado.validado_servicon ?? 0)) },
            { label: 'Conformes COVINCA', value: fmtNumber(porEstado.validado ?? 0) },
            { label: 'Observados', value: fmtNumber(porEstado.observado ?? 0) },
            { label: 'Vencidos', value: fmtNumber(counts.vencido ?? 0) },
            { label: 'Criticos', value: fmtNumber(counts.rojo ?? 0) },
          ],
        })
      } else {
        await descargarExcel('SIGOV_' + (p?.code ?? 'PCI') + '_' + stamp, meta, [
          { name: 'Items PCI', columns: cols, rows },
        ])
      }
      toast.success('Reporte generado')
    } catch (e: any) {
      toast.error(mensajeAmigable(e, 'No se pudo generar el reporte'))
    } finally {
      setExporting(null)
    }
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
            {/* La lámina de seguimiento que COVINCA arma para cada PCI (Elvis, 26/10) */}
            <Button variant="outline" asChild>
              <Link href={`/pci/${pciId}/estado`}>
                <Gauge className="size-4" />
                Estado situacional
              </Link>
            </Button>
            {can.manage && p && (
              <Button
                variant={p.published_at ? 'outline' : 'default'}
                loading={publicando}
                onClick={publicar}
                title={p.published_at ? 'Avisa a los jefes de cuadrilla que recibieron ítems después de publicar' : undefined}
              >
                <Send className="size-4" />
                {p.published_at ? 'Avisar a nuevas cuadrillas' : 'Publicar a las cuadrillas'}
              </Button>
            )}
            {can.manage && ['alta', 'critica'].includes(p?.priority ?? '') && (
              <Button
                variant={p?.suspension_applied_at ? 'outline' : 'destructive'}
                onClick={() => setSuspOpen(true)}
              >
                <Zap className="size-4" />
                {p?.suspension_applied_at ? 'Ver reprogramación' : 'Reprogramar semana'}
              </Button>
            )}
            {(can.manage || role === 'visor') && (
              <Button variant="outline" onClick={() => setLote(true)} title="Cargar las fotos del panel fotográfico de COVINCA, una por ítem">
                <ImageIcon className="size-4" />
                Fotos referenciales
              </Button>
            )}
            <Button variant="outline" loading={exporting === 'pdf'} onClick={() => exportar('pdf')}>
              <Download className="size-4" />
              PDF
            </Button>
            <Button variant="outline" loading={exporting === 'excel'} onClick={() => exportar('excel')}>
              <Download className="size-4" />
              Excel
            </Button>
          </>
        }
      >
        {p && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Badge className={prio!.className}>Prioridad {prio!.label}</Badge>
            {p.published_at ? (
              <span className="text-muted-foreground text-[12.5px]">
                Publicado el <strong className="text-foreground">{fmtDate(p.published_at)}</strong>
              </span>
            ) : (
              <Badge variant="warning" title="Las cuadrillas no lo ven hasta que se publique">
                Borrador · sin publicar
              </Badge>
            )}
            <span className="text-muted-foreground text-[12.5px]">
              Notificado el <strong className="text-foreground">{fmtDate(p.notified_on)}</strong>
            </span>
            <span className="text-muted-foreground text-[12.5px]">
              Registrado el <strong className="text-foreground">{fmtDate(p.registered_on)}</strong>
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
        {p && (
          <VencimientosPorPlazo
            pci={{ id: p.id, registered_on: p.registered_on, vencimientos: (p.vencimientos ?? {}) as Record<string, string> }}
            porPlazo={porPlazo}
            editable={can.manage}
            onGuardado={() => {
              qc.invalidateQueries({ queryKey: ['pci', pciId] })
              qc.invalidateQueries({ queryKey: ['pci-items', pciId] })
            }}
          />
        )}

        {p?.published_at && <CuadrillasDelPci pciId={pciId} items={items.data ?? []} />}

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
          {/* El semáforo es del plazo; el estado va en su propia fila */}
          {(['verde', 'ambar', 'rojo', 'vencido'] as Semaforo[]).map((k) => (
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

        <div className="flex flex-wrap gap-2">
          {ESTADOS_FILTRO.filter((e) => e.clave !== 'por_revisar').map((e) => (
            <button
              key={e.clave}
              onClick={() => setStatusFilter(statusFilter === e.clave ? 'todos' : e.clave)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
                statusFilter === e.clave ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/30'
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: e.color }} />
              {e.label}
              <span className="font-bold tabular-nums">{porEstado[e.clave] ?? 0}</span>
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
              {ESTADOS_FILTRO.map((e) => (
                <SelectItem key={e.clave} value={e.clave}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={orden} onValueChange={(v) => setOrden(v as typeof orden)}>
            <SelectTrigger className="w-60" aria-label="Ordenar">
              <ArrowUpDown className="text-muted-foreground size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="item">Por n.º de ítem</SelectItem>
              <SelectItem value="km_asc">Por km, de menor a mayor</SelectItem>
              <SelectItem value="km_desc">Por km, de mayor a menor</SelectItem>
              <SelectItem value="vence">Por vencimiento</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {fmtNumber(filtered.length)} ítems · {fmtNumber(conReferencia)} con foto referencial
          </span>
        </div>

        {/* Acciones masivas */}
        {selected.size > 0 && can.manage && (
          <div className="bg-primary/8 border-primary/25 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5">
            <span className="text-[13px] font-semibold">{selected.size} seleccionados</span>
            <Select onValueChange={(v) => void bulkAssign(v)}>
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
            <Select onValueChange={bulkPlazo}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue placeholder="Fijar plazo…" />
              </SelectTrigger>
              <SelectContent>
                {plazos.map((d) => <SelectItem key={d} value={String(d)}>{etiquetaPlazo(d)}</SelectItem>)}
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
                        'absolute inset-x-0 flex cursor-pointer items-center gap-3 border-b border-border px-4 text-[12.5px] transition-colors',
                        isSel ? 'bg-primary/6' : 'hover:bg-secondary/50'
                      )}
                      style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                    >
                      {can.manage && (
                        <span className="relative z-10">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => {
                              const next = new Set(selected)
                              isSel ? next.delete(r.id) : next.add(r.id)
                              setSelected(next)
                            }}
                            aria-label={'Seleccionar item ' + r.item_number}
                          />
                        </span>
                      )}
                      <span className="text-muted-foreground flex w-10 items-center gap-1 font-mono text-[11.5px] tabular-nums">
                        {r.item_number}
                        {r.foto_referencia_path && <ImageIcon className="text-primary size-3" aria-label="Con foto referencial" />}
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
                      <button
                        onClick={() => setSheetItem(r)}
                        className="absolute inset-0 z-0"
                        aria-label={'Abrir item ' + r.item_number}
                      />
                      <span className="relative z-10 w-16 text-center">
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

      <FotosReferencialesLote open={lote} onOpenChange={setLote} items={(items.data ?? []) as any} />

      {/* Reasignar ítems que ya tenían cuadrilla: el motivo queda en el historial */}
      <FormDialog
        open={!!reasignar}
        onOpenChange={(v) => !v && setReasignar(null)}
        title="Motivo de la reasignación"
        description="Algunos ítems ya tenían cuadrilla. Queda registrado quién, cuándo, de qué cuadrilla a cuál y por qué."
        fields={[{ name: 'motivo', label: 'Motivo', type: 'textarea', required: true, span: 2 }]}
        size="sm"
        submitLabel="Reasignar"
        onSubmit={async (v) => { if (reasignar) await bulkAssign(reasignar.crewId, String(v.motivo).trim()) }}
      />

      <PciItemSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        crews={crews.data ?? []}
      />

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
