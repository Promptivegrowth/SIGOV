'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Map as MLMap } from 'maplibre-gl'
import { MessageSquareWarning, Download, Search, X, CalendarCheck, CircleCheck, Undo2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/misc'
import { ImageViewer } from '@/components/shared/image-viewer'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, SheetContent } from '@/components/ui/dialog'
import { SkeletonTable } from '@/components/ui/skeleton'
import { codigoDeLado } from '@/lib/lados'
import { descargarPdf, type ReportMeta } from '@/lib/reports'
import { cn, fmtDate, fmtNumber, toISODate } from '@/lib/utils'
import type { MapCanvasHandle } from '@/components/mapa/map-canvas'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

const MapCanvas = dynamic(() => import('@/components/mapa/map-canvas').then((m) => m.MapCanvas), { ssr: false })

/**
 * Observaciones de campo (video de Elvis del 14/10/2026).
 *
 * Lo que el jefe de cuadrilla o el supervisor registran en la vía y no está
 * en el inventario —un desmonte, basura, una señal caída— con su progresiva
 * y sus fotos. Aquí se ven en el mapa y en la lista, se marcan
 * «programada» al incluirlas en la programación y «atendida» cuando se
 * resuelven, y la lista de lo pendiente se exporta a PDF.
 */

const ESTADOS = {
  pendiente: { label: 'Pendiente', color: '#dc2626', className: 'bg-destructive/15 text-destructive' },
  programada: { label: 'Programada', color: '#f59e0b', className: 'bg-warning/20 text-warning' },
  atendida: { label: 'Atendida', color: '#16a34a', className: 'bg-success/15 text-success' },
} as const
type Estado = keyof typeof ESTADOS

export function ObservacionesClient() {
  const { service, can, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const mapaRef = React.useRef<MapCanvasHandle>(null)
  const [mapa, setMapa] = React.useState<MLMap | null>(null)
  const [estado, setEstado] = React.useState<Estado | 'todas'>('pendiente')
  const [tramo, setTramo] = React.useState('todos')
  const [q, setQ] = React.useState('')
  const [abierta, setAbierta] = React.useState<any | null>(null)
  const [exportando, setExportando] = React.useState(false)

  const datos = useQuery({
    queryKey: ['observaciones-campo', service.id],
    queryFn: async () => {
      const { data, error } = await sb.from('v_observaciones_campo' as any).select('*')
        .eq('service_id', service.id).order('created_at', { ascending: false }).limit(2000)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const todas = datos.data ?? []
  const tramos = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const o of todas) if (o.section_id) m.set(o.section_id, o.section_numero ? `Tramo ${o.section_numero}` : (o.section_code ?? 'Tramo'))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todas])

  const visibles = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    return todas.filter((o) =>
      (estado === 'todas' || o.estado === estado) &&
      (tramo === 'todos' || o.section_id === tramo) &&
      (!t || [o.descripcion, o.section_name, o.progresiva_txt, o.crew_name, o.created_by_name]
        .filter(Boolean).some((v: string) => v.toLowerCase().includes(t))))
  }, [todas, estado, tramo, q])

  const cuantas = (e: Estado | 'todas') => todas.filter((o) => e === 'todas' || o.estado === e).length

  // ── El mapa ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!mapa) return
    const fc = {
      type: 'FeatureCollection',
      features: visibles.filter((o) => o.lat != null && o.lng != null).map((o) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [o.lng, o.lat] },
        properties: { id: o.id, color: ESTADOS[o.estado as Estado]?.color ?? '#64748b' },
      })),
    }
    if (!mapa.getSource('src-obs')) {
      mapa.addSource('src-obs', { type: 'geojson', data: fc as any })
      mapa.addLayer({
        id: 'l-obs', type: 'circle', source: 'src-obs',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 5, 12, 9, 16, 13],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      })
      mapa.on('click', 'l-obs', (e) => {
        const id = e.features?.[0]?.properties?.id
        const o = (datos.data ?? []).find((x) => x.id === id)
        if (o) setAbierta(o)
      })
      mapa.on('mouseenter', 'l-obs', () => { mapa.getCanvas().style.cursor = 'pointer' })
      mapa.on('mouseleave', 'l-obs', () => { mapa.getCanvas().style.cursor = '' })
    } else {
      ;(mapa.getSource('src-obs') as any).setData(fc)
    }
    const pts = fc.features.map((f) => f.geometry.coordinates)
    if (pts.length) {
      const lngs = pts.map((c) => c[0]); const lats = pts.map((c) => c[1])
      mapaRef.current?.fitTo([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], 70)
    }
  }, [mapa, visibles, datos.data])

  const cambiarEstado = async (o: any, nuevo: Estado, nota?: string) => {
    const { error } = await sb.from('observaciones_campo' as any)
      .update({ estado: nuevo, ...(nota != null ? { nota_atencion: nota || null } : {}) } as any).eq('id', o.id)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(nuevo === 'atendida' ? 'Observación atendida' : nuevo === 'programada' ? 'Observación programada' : 'Observación pendiente otra vez')
    qc.invalidateQueries({ queryKey: ['observaciones-campo'] })
    setAbierta(null)
  }

  const exportar = async () => {
    setExportando(true)
    try {
      const meta: ReportMeta = {
        titulo: 'Observaciones de campo',
        subtitulo: estado === 'todas' ? 'Todas' : ESTADOS[estado].label + 's',
        servicio: service.name,
        cliente: (service as any).client_name,
        contrato: (service as any).contract_code,
        periodo: `Al ${fmtDate(new Date())}` + (tramo !== 'todos' ? ' · ' + (tramos.find(([id]) => id === tramo)?.[1] ?? '') : ''),
        generadoPor: profile.full_name ?? '',
      }
      const rows = visibles.map((o) => ({
        fecha: fmtDate(o.observado_on),
        tramo: o.section_numero ? `Tramo ${o.section_numero}` : (o.section_code ?? '-'),
        progresiva: o.progresiva_txt ?? '-',
        lado: o.side ? codigoDeLado(o.side) : '-',
        observacion: o.descripcion,
        registro: [o.created_by_name, o.crew_name].filter(Boolean).join(' · '),
        fotos: (o.fotos ?? []).length,
        estado: ESTADOS[o.estado as Estado]?.label ?? o.estado,
      }))
      // Una foto por observación, para ubicarla al programar (hasta 24)
      const conFoto = visibles.filter((o) => (o.fotos ?? []).length).slice(0, 24)
      const { data: firmadas } = conFoto.length
        ? await sb.storage.from('evidencias').createSignedUrls(conFoto.map((o) => o.fotos[0]), 3600)
        : { data: [] }
      const fotos = conFoto.flatMap((o, i) => {
        const url = firmadas?.[i]?.signedUrl
        if (!url) return []
        return [{
          url,
          titulo: o.descripcion,
          pie: [o.section_numero ? `Tramo ${o.section_numero}` : o.section_code, o.progresiva_txt && `km ${o.progresiva_txt}`,
            o.side && `lado ${codigoDeLado(o.side)}`, fmtDate(o.observado_on)].filter(Boolean).join(' · '),
        }]
      })
      await descargarPdf('SIGOV_OBSERVACIONES_' + toISODate(new Date()), meta, [
        // La observación se lleva el ancho que sobra de la hoja horizontal
        { header: 'Fecha', key: 'fecha', width: 20 },
        { header: 'Tramo', key: 'tramo', width: 17 },
        { header: 'Progresiva', key: 'progresiva', width: 21 },
        { header: 'Lado', key: 'lado', width: 12 },
        { header: 'Observación', key: 'observacion' },
        { header: 'Registró', key: 'registro', width: 52 },
        { header: 'Fotos', key: 'fotos', align: 'center' as const, width: 13 },
        { header: 'Estado', key: 'estado', width: 22 },
      ], rows, {
        landscape: true,
        fotos,
        kpis: [
          { label: 'Pendientes', value: fmtNumber(cuantas('pendiente')) },
          { label: 'Programadas', value: fmtNumber(cuantas('programada')) },
          { label: 'Atendidas', value: fmtNumber(cuantas('atendida')) },
        ],
      })
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo exportar'))
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <PageHeader
        icon={MessageSquareWarning}
        title="Observaciones de campo"
        description="Lo que la cuadrilla o el supervisor encuentran en la vía y no está en el inventario: desmonte, basura, señales caídas… con su progresiva y fotos, para programarlo."
        actions={
          <Button variant="outline" onClick={exportar} loading={exportando} disabled={!visibles.length}>
            <Download className="size-4" /> Exportar PDF
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['pendiente', 'programada', 'atendida', 'todas'] as const).map((e) => (
            <button key={e} onClick={() => setEstado(e)}
              className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium',
                estado === e ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/30')}>
              {e !== 'todas' && <span className="size-2.5 rounded-full" style={{ background: ESTADOS[e].color }} />}
              {e === 'todas' ? 'Todas' : ESTADOS[e].label + 's'}
              <span className="font-bold tabular-nums">{cuantas(e)}</span>
            </button>
          ))}
          <Select value={tramo} onValueChange={setTramo}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tramos</SelectItem>
              {tramos.map(([id, t]) => <SelectItem key={id} value={id}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input placeholder="Buscar observación, progresiva…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            {q && <button onClick={() => setQ('')} className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2" aria-label="Limpiar"><X className="size-3.5" /></button>}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_460px]">
          <div className="relative h-[calc(100dvh-17rem)] min-h-[440px] overflow-hidden rounded-xl border border-border">
            <MapCanvas ref={mapaRef} onReady={setMapa} className="absolute inset-0" initialZoom={6} showFullscreen />
          </div>
          <Card className="overflow-hidden">
            <CardContent className="max-h-[calc(100dvh-17rem)] overflow-y-auto p-0">
              {datos.isLoading ? <SkeletonTable rows={6} cols={2} /> : !visibles.length ? (
                <EmptyState icon={MessageSquareWarning} title="Sin observaciones en este filtro"
                  description="Las registran el jefe de cuadrilla o el supervisor desde el celular." className="py-14" />
              ) : (
                <ul className="divide-y divide-border">
                  {visibles.map((o) => (
                    <li key={o.id}>
                      <button onClick={() => setAbierta(o)} className="hover:bg-secondary/40 flex w-full items-start gap-3 px-4 py-3 text-left">
                        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: ESTADOS[o.estado as Estado]?.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold">{o.descripcion}</span>
                          <span className="text-muted-foreground block text-[11.5px]">
                            {[o.section_numero ? `Tramo ${o.section_numero}` : o.section_code, o.progresiva_txt && `km ${o.progresiva_txt}`,
                              o.side && `lado ${codigoDeLado(o.side)}`, fmtDate(o.observado_on), o.created_by_name].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <Badge className={ESTADOS[o.estado as Estado]?.className}>{ESTADOS[o.estado as Estado]?.label}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>

      {abierta && <Ficha o={abierta} puedeCambiar={can.manage} alCerrar={() => setAbierta(null)} alCambiar={cambiarEstado} />}
    </>
  )
}

function Ficha({ o, puedeCambiar, alCerrar, alCambiar }: {
  o: any; puedeCambiar: boolean; alCerrar: () => void; alCambiar: (o: any, e: Estado, nota?: string) => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [nota, setNota] = React.useState(o.nota_atencion ?? '')
  const [grande, setGrande] = React.useState<string | null>(null)
  const urls = useQuery({
    queryKey: ['observacion-fotos', o.id],
    queryFn: async () => {
      const rutas = (o.fotos ?? []) as string[]
      if (!rutas.length) return []
      const { data } = await sb.storage.from('evidencias').createSignedUrls(rutas, 3600)
      return (data ?? []).map((f) => f.signedUrl).filter(Boolean) as string[]
    },
  })
  return (
    <Dialog open onOpenChange={(v) => !v && alCerrar()}>
      <SheetContent side="right" className="w-full max-w-lg gap-0 overflow-y-auto p-0">
        <div className="space-y-4 p-5">
          <Badge className={ESTADOS[o.estado as Estado]?.className}>{ESTADOS[o.estado as Estado]?.label}</Badge>
          <h2 className="text-[16px] font-semibold leading-snug">{o.descripcion}</h2>
          <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div><dt className="text-muted-foreground text-[11px]">Tramo</dt><dd>{o.section_numero ? `Tramo ${o.section_numero} · ` : ''}{o.section_name ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground text-[11px]">Progresiva</dt><dd>{o.progresiva_txt ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground text-[11px]">Lado</dt><dd>{o.side ? codigoDeLado(o.side) : '—'}</dd></div>
            <div><dt className="text-muted-foreground text-[11px]">Fecha</dt><dd>{fmtDate(o.observado_on)}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground text-[11px]">Registró</dt><dd>{[o.created_by_name, o.crew_name].filter(Boolean).join(' · ') || '—'}</dd></div>
            {o.programada_on && <div><dt className="text-muted-foreground text-[11px]">Programada</dt><dd>{fmtDate(o.programada_on)}</dd></div>}
            {o.atendida_at && <div><dt className="text-muted-foreground text-[11px]">Atendida</dt><dd>{fmtDate(o.atendida_at)}</dd></div>}
          </dl>
          <div className="flex flex-wrap gap-2">
            {(urls.data ?? []).map((u) => (
              <button key={u} onClick={() => setGrande(u)} className="bg-secondary relative size-28 overflow-hidden rounded-lg border border-border">
                <Image src={u} alt="" fill sizes="112px" className="object-cover" unoptimized />
              </button>
            ))}
          </div>
          {puedeCambiar && (
            <div className="space-y-2 border-t border-border pt-4">
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Nota: cuándo se programó, qué se hizo…" />
              <div className="flex flex-wrap gap-2">
                {o.estado !== 'programada' && <Button variant="outline" onClick={() => alCambiar(o, 'programada', nota)}><CalendarCheck className="size-4" />Programada</Button>}
                {o.estado !== 'atendida' && <Button onClick={() => alCambiar(o, 'atendida', nota)}><CircleCheck className="size-4" />Atendida</Button>}
                {o.estado !== 'pendiente' && <Button variant="ghost" onClick={() => alCambiar(o, 'pendiente', nota)}><Undo2 className="size-4" />Volver a pendiente</Button>}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
      {grande && (
        <Dialog open onOpenChange={(v) => !v && setGrande(null)}>
          <SheetContent side="right" className="w-full max-w-4xl p-2">
            <ImageViewer src={grande} alt="Foto de la observación" className="h-[90vh]" />
          </SheetContent>
        </Dialog>
      )}
    </Dialog>
  )
}
