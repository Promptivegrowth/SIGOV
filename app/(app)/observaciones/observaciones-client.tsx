'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Map as MLMap } from 'maplibre-gl'
import {
  MessageSquareWarning, Download, Search, X, CalendarPlus, CircleCheck, Undo2, FileSpreadsheet, ImageDown, Trash2,
} from 'lucide-react'
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
import { ConfirmDialog } from '@/components/forms/form-dialog'
import { ProgramarObservacion } from '@/components/observaciones/programar-observacion'
import { codigoDeLado, etiquetaDeLado } from '@/lib/lados'
import { descargarExcel, descargarPdf, type ReportMeta } from '@/lib/reports'
import { cn, fmtDate, fmtNumber, toISODate } from '@/lib/utils'
import type { MapCanvasHandle } from '@/components/mapa/map-canvas'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

const MapCanvas = dynamic(() => import('@/components/mapa/map-canvas').then((m) => m.MapCanvas), { ssr: false })

/**
 * Observaciones de campo (videos de Elvis del 14/10 y 26/10).
 *
 * Lo que el jefe de cuadrilla o el supervisor registran en la vía y no está
 * en el inventario —un desmonte, basura, una señal caída— con su tipo de
 * actividad, progresiva o intervalo, metrado y fotos. Aquí se ven en el mapa
 * y en la lista (por kilómetro), se filtran por tipo de actividad, el
 * supervisor las jala a la programación y se exportan a Excel y PDF con la
 * foto de referencia, y el mapa como imagen.
 */

const ESTADOS = {
  pendiente: { label: 'Pendiente', color: '#dc2626', className: 'bg-destructive/15 text-destructive' },
  programada: { label: 'Programada', color: '#f59e0b', className: 'bg-warning/20 text-warning' },
  atendida: { label: 'Atendida', color: '#16a34a', className: 'bg-success/15 text-success' },
} as const
type Estado = keyof typeof ESTADOS

/** Las de antes del 26/10 no tienen tipo de actividad. */
const SIN_TIPO = 'Sin tipo de actividad'
const categoriaDe = (o: any): string => o.activity_category ?? SIN_TIPO
const tramoDe = (o: any) => (o.section_numero ? `Tramo ${o.section_numero}` : (o.section_code ?? '-'))
const kmDe = (o: any) => (o.progresiva_txt ? o.progresiva_txt + (o.progresiva_fin_txt && o.progresiva_fin_m !== o.progresiva_m ? ' → ' + o.progresiva_fin_txt : '') : null)
const metradoDe = (o: any) => (o.metrado != null ? `${fmtNumber(Number(o.metrado))}${o.unit_symbol ? ' ' + o.unit_symbol : ''}` : null)

export function ObservacionesClient() {
  const { service, can, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const mapaRef = React.useRef<MapCanvasHandle>(null)
  const [mapa, setMapa] = React.useState<MLMap | null>(null)
  const [estado, setEstado] = React.useState<Estado | 'todas'>('pendiente')
  const [tramo, setTramo] = React.useState('todos')
  const [categoria, setCategoria] = React.useState('todas')
  // Filtros combinables (REV3-OBS-39)
  const [sector, setSector] = React.useState('todos')
  const [actividad, setActividad] = React.useState('todas')
  const [autor, setAutor] = React.useState('todos')
  const [desde, setDesde] = React.useState('')
  const [hasta, setHasta] = React.useState('')
  const [q, setQ] = React.useState('')
  const [abierta, setAbierta] = React.useState<any | null>(null)
  const [elegida, setElegida] = React.useState<string | null>(null)
  const [exportando, setExportando] = React.useState<string | null>(null)

  const datos = useQuery({
    queryKey: ['observaciones-campo', service.id],
    queryFn: async () => {
      const { data, error } = await sb.from('v_observaciones_campo').select('*')
        .eq('service_id', service.id).order('created_at', { ascending: false }).limit(2000)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const todas = datos.data ?? []
  const tramos = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const o of todas) if (o.section_id) m.set(o.section_id, tramoDe(o))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todas])

  const enEstado = React.useMemo(() => todas.filter((o) => estado === 'todas' || o.estado === estado), [todas, estado])
  // Por tipo de actividad: alcantarillas, muros, puentes, berma… (Elvis, 26/10)
  const categorias = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const o of enEstado) m.set(categoriaDe(o), (m.get(categoriaDe(o)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => (a[0] === SIN_TIPO ? 1 : b[0] === SIN_TIPO ? -1 : a[0].localeCompare(b[0])))
  }, [enEstado])

  const opciones = React.useMemo(() => ({
    sectores: [...new Set(todas.map((o) => o.sector_code).filter(Boolean))].sort() as string[],
    actividades: [...new Map(todas.filter((o) => o.activity_code).map((o) => [o.activity_code, `${o.activity_code} · ${o.activity_name}`])).entries()].sort(),
    autores: [...new Set(todas.map((o) => o.created_by_name).filter(Boolean))].sort() as string[],
  }), [todas])

  const visibles = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    return enEstado
      .filter((o) =>
        (tramo === 'todos' || o.section_id === tramo) &&
        (categoria === 'todas' || categoriaDe(o) === categoria) &&
        (sector === 'todos' || o.sector_code === sector) &&
        (actividad === 'todas' || o.activity_code === actividad) &&
        (autor === 'todos' || o.created_by_name === autor) &&
        (!desde || (o.observado_on ?? '') >= desde) &&
        (!hasta || (o.observado_on ?? '') <= hasta) &&
        (!t || [o.descripcion, o.section_name, o.progresiva_txt, o.crew_name, o.created_by_name, o.activity_name, o.activity_code, o.sector_code]
          .filter(Boolean).some((v: string) => v.toLowerCase().includes(t))))
      // Por tramo y kilómetro, como se recorre la vía
      .sort((a, b) => (a.section_code ?? '~').localeCompare(b.section_code ?? '~') || (a.progresiva_m ?? 1e12) - (b.progresiva_m ?? 1e12))
  }, [enEstado, tramo, categoria, sector, actividad, autor, desde, hasta, q])

  const cuantas = (e: Estado | 'todas') => todas.filter((o) => e === 'todas' || o.estado === e).length

  // ── El mapa ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!mapa) return
    const fc = {
      type: 'FeatureCollection',
      // Un marcador por punto aunque tenga varias actividades (REV3-OBS-34):
      // el color de la más atrasada y más grande cuantas más tenga
      features: [...visibles.filter((o) => o.lat != null && o.lng != null)
        .reduce((m, o) => m.set(o.punto_id ?? o.id, [...(m.get(o.punto_id ?? o.id) ?? []), o]), new Map<string, any[]>()).values()]
        .map((grupo) => {
          const o = grupo.find((x: any) => x.estado === 'pendiente') ?? grupo.find((x: any) => x.estado === 'programada') ?? grupo[0]
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [o.lng, o.lat] },
            properties: { id: o.id, n: grupo.length, ids: grupo.map((x: any) => x.id).join(','), color: ESTADOS[o.estado as Estado]?.color ?? '#64748b' },
          }
        }),
    }
    if (!mapa.getSource('src-obs')) {
      mapa.addSource('src-obs', { type: 'geojson', data: fc as any })
      // El halo de la elegida en la lista
      mapa.addLayer({
        id: 'l-obs-sel', type: 'circle', source: 'src-obs', filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-color': '#f96414', 'circle-opacity': 0.35, 'circle-radius': 22 },
      })
      mapa.addLayer({
        id: 'l-obs', type: 'circle', source: 'src-obs',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['+', ['interpolate', ['linear'], ['zoom'], 7, 5, 12, 9, 16, 13], ['*', 2, ['-', ['get', 'n'], 1]]],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      })
      mapa.on('click', 'l-obs', (e) => {
        const id = e.features?.[0]?.properties?.id
        const o = (qc.getQueryData(['observaciones-campo', service.id]) as any[] | undefined)?.find((x) => x.id === id)
        if (o) { setElegida(o.id); setAbierta(o) }
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
  }, [mapa, visibles, qc, service.id])

  React.useEffect(() => {
    if (mapa?.getLayer('l-obs-sel')) mapa.setFilter('l-obs-sel', ['in', elegida ?? '-', ['get', 'ids']])
  }, [mapa, elegida, visibles])

  // Tocar una de la lista lleva el mapa a ese punto (Elvis, 26/10)
  const elegir = (o: any) => {
    setElegida(o.id)
    if (o.lat != null && o.lng != null) mapaRef.current?.flyTo(o.lng, o.lat, 15)
    setAbierta(o)
  }

  const refrescar = () => qc.invalidateQueries({ queryKey: ['observaciones-campo'] })

  const cambiarEstado = async (o: any, nuevo: Estado, nota?: string) => {
    const { error } = await sb.from('observaciones_campo')
      .update({ estado: nuevo, ...(nota != null ? { nota_atencion: nota || null } : {}) } as any).eq('id', o.id)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(nuevo === 'atendida' ? 'Observación atendida' : nuevo === 'programada' ? 'Observación programada' : 'Observación pendiente otra vez')
    refrescar()
    setAbierta(null)
  }

  // ── Exportar (Elvis, 26/10) ─────────────────────────────────────────
  const filtroLegible = [
    estado === 'todas' ? 'Todas' : ESTADOS[estado].label + 's',
    categoria !== 'todas' && categoria,
    tramo !== 'todos' && tramos.find(([id]) => id === tramo)?.[1],
  ].filter(Boolean).join(' · ')

  const meta = (): ReportMeta => ({
    titulo: 'Observaciones de campo',
    subtitulo: filtroLegible,
    servicio: service.name,
    cliente: (service as any).client_name,
    contrato: (service as any).contract_code,
    periodo: `Al ${fmtDate(new Date())}`,
    generadoPor: profile.full_name ?? '',
  })

  /** La primera foto de cada una, firmada: va en la última columna. */
  const fotosDeLaLista = async () => {
    const rutas = visibles.map((o) => (o.fotos ?? [])[0] ?? null)
    const conRuta = rutas.filter(Boolean) as string[]
    if (!conRuta.length) return rutas.map(() => null)
    const { data } = await sb.storage.from('evidencias').createSignedUrls(conRuta, 3600)
    const porRuta = new Map((data ?? []).map((f) => [f.path, f.signedUrl]))
    return rutas.map((r) => (r ? porRuta.get(r) ?? null : null))
  }

  const filas = () => visibles.map((o, i) => ({
    n: i + 1,
    codigo: o.codigo ?? '-',
    sector: o.sector_code ?? '-',
    tramo: tramoDe(o),
    prog_ini: o.progresiva_txt ?? '-',
    prog_fin: o.progresiva_fin_txt && o.progresiva_fin_m !== o.progresiva_m ? o.progresiva_fin_txt : '-',
    lado: o.side ? etiquetaDeLado(o.side) : '-',
    tipo: o.activity_category ?? '-',
    cod_act: o.activity_code ?? '-',
    actividad: o.activity_name ?? '-',
    actividad_cod: [o.activity_code, o.activity_name].filter(Boolean).join(' · ') || '-',
    observacion: o.descripcion,
    metrado: o.metrado != null ? Number(o.metrado) : '-',
    unidad: o.unit_symbol ?? '-',
    metrado_txt: metradoDe(o) ?? '-',
    estado: ESTADOS[o.estado as Estado]?.label ?? o.estado,
    fecha: fmtDate(o.observado_on),
    registro: [o.created_by_name, o.crew_name].filter(Boolean).join(' · '),
    foto: '',
  }))

  const exportarExcel = async () => {
    setExportando('excel')
    try {
      await descargarExcel('SIGOV_OBSERVACIONES_' + toISODate(new Date()), meta(), [{
        name: 'Observaciones',
        // El orden del consolidado (REV3-OBS-40); varias actividades de un
        // punto salen en filas propias, con la misma ubicación
        columns: [
          { header: 'ID', key: 'codigo', width: 11 },
          { header: 'Fecha de registro', key: 'fecha', width: 12 },
          { header: 'Tramo', key: 'tramo', width: 10 },
          { header: 'Sector', key: 'sector', width: 9 },
          { header: 'Tipo de actividad', key: 'tipo', width: 22 },
          { header: 'Código', key: 'cod_act', width: 13 },
          { header: 'Actividad', key: 'actividad', width: 34 },
          { header: 'Progresiva inicial', key: 'prog_ini', width: 15 },
          { header: 'Progresiva final', key: 'prog_fin', width: 15 },
          { header: 'Lado', key: 'lado', width: 12 },
          { header: 'Metrado', key: 'metrado', width: 10 },
          { header: 'Unidad', key: 'unidad', width: 8 },
          { header: 'Observación', key: 'observacion', width: 42 },
          { header: 'Estado', key: 'estado', width: 12 },
          { header: 'Registrado por', key: 'registro', width: 24 },
          { header: 'Fotografía de referencia', key: 'foto', width: 23 },
        ],
        rows: filas(),
        fotos: { key: 'foto', urls: await fotosDeLaLista() },
      }])
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo exportar'))
    } finally {
      setExportando(null)
    }
  }

  const exportarPdf = async () => {
    setExportando('pdf')
    try {
      await descargarPdf('SIGOV_OBSERVACIONES_' + toISODate(new Date()), meta(), [
        { header: 'ID', key: 'codigo', width: 17 },
        { header: 'Sector', key: 'sector', width: 13 },
        { header: 'Tramo', key: 'tramo', width: 15 },
        { header: 'Prog. inicial', key: 'prog_ini', width: 18 },
        { header: 'Prog. final', key: 'prog_fin', width: 18 },
        { header: 'Lado', key: 'lado', width: 16 },
        { header: 'Tipo de actividad', key: 'tipo', width: 25 },
        { header: 'Actividad', key: 'actividad_cod', width: 40 },
        // La observación se lleva el ancho que sobra de la hoja horizontal
        { header: 'Observación', key: 'observacion' },
        { header: 'Metrado', key: 'metrado_txt', width: 15 },
        { header: 'Estado', key: 'estado', width: 18 },
        { header: 'Foto', key: 'foto', width: 34 },
      ], filas(), {
        landscape: true,
        fotosEnTabla: { key: 'foto', urls: await fotosDeLaLista() },
        kpis: [
          { label: 'En este reporte', value: fmtNumber(visibles.length) },
          { label: 'Pendientes', value: fmtNumber(cuantas('pendiente')) },
          { label: 'Programadas', value: fmtNumber(cuantas('programada')) },
          { label: 'Atendidas', value: fmtNumber(cuantas('atendida')) },
        ],
      })
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo exportar'))
    } finally {
      setExportando(null)
    }
  }

  /** El mapa con los puntos del filtro, como imagen (Elvis: «exportar mapa»). */
  const exportarMapa = (comoPdf = false) => {
    if (!mapa) return
    setExportando('mapa')
    // El lienzo del mapa solo se puede leer en el cuadro que se acaba de pintar
    mapa.once('render', () => {
      try {
        const lienzo = mapa.getCanvas()
        const banda = 56
        const c = document.createElement('canvas')
        c.width = lienzo.width
        c.height = lienzo.height + banda * 2
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#072d70'
        ctx.fillRect(0, 0, c.width, banda)
        // El texto se recorta al ancho del mapa, que puede ser angosto
        const encajar = (t: string, max: number) => {
          let s = t
          while (s.length > 1 && ctx.measureText(s).width > max) s = s.slice(0, -2) + '…'
          return s
        }
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 20px system-ui, sans-serif'
        ctx.fillText(encajar('Observaciones de campo', c.width - 40), 20, 25)
        ctx.font = '13px system-ui, sans-serif'
        ctx.fillText(encajar(service.name, c.width - 40), 20, 45)
        ctx.drawImage(lienzo, 0, banda)
        // La leyenda, abajo
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, banda + lienzo.height, c.width, banda)
        ctx.font = '15px system-ui, sans-serif'
        let x = 20
        const y = banda + lienzo.height + 24
        for (const [k, v] of Object.entries(ESTADOS)) {
          const n = visibles.filter((o) => o.estado === k).length
          if (!n) continue
          ctx.fillStyle = v.color
          ctx.beginPath(); ctx.arc(x + 7, y - 5, 7, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = '#1c2238'
          const t = `${v.label}s: ${n}`
          ctx.fillText(t, x + 20, y)
          x += ctx.measureText(t).width + 44
        }
        // El filtro y la fecha, en la segunda línea de la leyenda
        ctx.fillStyle = '#6b7280'
        ctx.font = '13px system-ui, sans-serif'
        ctx.fillText(encajar(`${filtroLegible} · ${fmtDate(new Date())} · SIGOV`, c.width - 40), 20, y + 22)
        const png = c.toDataURL('image/png')
        if (comoPdf) {
          // En PDF para presentaciones: la misma imagen, con filtros, leyenda y fecha (REV3-REC-02)
          void import('jspdf').then(({ jsPDF }) => {
            const doc = new jsPDF({ orientation: c.width >= c.height ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
            const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight()
            const k = Math.min((W - 40) / c.width, (H - 40) / c.height)
            doc.addImage(png, 'PNG', (W - c.width * k) / 2, (H - c.height * k) / 2, c.width * k, c.height * k)
            doc.save(`SIGOV_MAPA_OBSERVACIONES_${toISODate(new Date())}.pdf`)
          })
        } else {
          const a = document.createElement('a')
          a.href = png
          a.download = `SIGOV_MAPA_OBSERVACIONES_${toISODate(new Date())}.png`
          a.click()
        }
      } catch (e) {
        toast.error(mensajeAmigable(e, 'No se pudo exportar el mapa'))
      } finally {
        setExportando(null)
      }
    })
    mapa.triggerRepaint()
  }

  return (
    <>
      <PageHeader
        icon={MessageSquareWarning}
        title="Observaciones de campo"
        description="Lo que la cuadrilla o el supervisor encuentran en la vía y no está en el inventario: con su tipo de actividad, progresiva, metrado y fotos, para programarlo."
        actions={
          <>
            <Button variant="outline" onClick={() => exportarMapa(false)} loading={exportando === 'mapa'} disabled={!mapa || !!exportando}>
              <ImageDown className="size-4" /> Mapa PNG
            </Button>
            <Button variant="outline" onClick={() => exportarMapa(true)} disabled={!mapa || !!exportando}>
              <ImageDown className="size-4" /> Mapa PDF
            </Button>
            <Button variant="outline" onClick={exportarExcel} loading={exportando === 'excel'} disabled={!visibles.length || !!exportando}>
              <FileSpreadsheet className="size-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportarPdf} loading={exportando === 'pdf'} disabled={!visibles.length || !!exportando}>
              <Download className="size-4" /> PDF
            </Button>
          </>
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
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las actividades</SelectItem>
              {categorias.map(([c, n]) => <SelectItem key={c} value={c}>{c} · {n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tramo} onValueChange={setTramo}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tramos</SelectItem>
              {tramos.map(([id, t]) => <SelectItem key={id} value={id}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los sectores</SelectItem>
              {opciones.sectores.map((x) => <SelectItem key={x} value={x}>Sector {x}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actividad} onValueChange={setActividad}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los códigos</SelectItem>
              {opciones.actividades.map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={autor} onValueChange={setAutor}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Registrado por: todos</SelectItem>
              {opciones.autores.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36" aria-label="Desde" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36" aria-label="Hasta" />
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input placeholder="Buscar observación, actividad, km…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            {q && <button onClick={() => setQ('')} className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2" aria-label="Limpiar"><X className="size-3.5" /></button>}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_480px]">
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
                      <button onClick={() => elegir(o)}
                        className={cn('hover:bg-secondary/40 flex w-full items-start gap-3 px-4 py-3 text-left', elegida === o.id && 'bg-primary/6')}>
                        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: ESTADOS[o.estado as Estado]?.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold">{o.descripcion}</span>
                          {(o.activity_name || o.activity_category) && (
                            <span className="text-primary block truncate text-[11.5px]">{[o.activity_category, o.activity_name].filter(Boolean).join(' · ')}</span>
                          )}
                          <span className="text-muted-foreground block text-[11.5px]">
                            {[o.sector_code ? `Sector ${o.sector_code}` : tramoDe(o), kmDe(o) && `km ${kmDe(o)}`,
                              o.side && `lado ${codigoDeLado(o.side)}`, metradoDe(o), fmtDate(o.observado_on), o.created_by_name].filter(Boolean).join(' · ')}
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

      {abierta && (
        <Ficha
          o={abierta}
          delPunto={todas.filter((x) => (x.punto_id ?? x.id) === (abierta.punto_id ?? abierta.id) && x.id !== abierta.id)}
          alAbrirOtra={(x) => { setElegida(x.id); setAbierta(x) }}
          puedeGestionar={can.manage}
          puedeEditar={can.manage || (abierta.created_by === profile.id && abierta.estado === 'pendiente')}
          alCerrar={() => setAbierta(null)}
          alCambiar={cambiarEstado}
          alActualizar={async () => {
            await refrescar()
            const nueva = (qc.getQueryData(['observaciones-campo', service.id]) as any[] | undefined)?.find((x) => x.id === abierta.id)
            setAbierta(nueva ?? null)
          }}
        />
      )}
    </>
  )
}

function Ficha({ o, delPunto = [], alAbrirOtra, puedeGestionar, puedeEditar, alCerrar, alCambiar, alActualizar }: {
  o: any
  /** Las otras actividades del mismo punto (REV3-OBS-34). */
  delPunto?: any[]
  alAbrirOtra?: (o: any) => void
  puedeGestionar: boolean
  puedeEditar: boolean
  alCerrar: () => void
  alCambiar: (o: any, e: Estado, nota?: string) => void
  alActualizar: () => Promise<void>
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [nota, setNota] = React.useState(o.nota_atencion ?? '')
  const [grande, setGrande] = React.useState<string | null>(null)
  const [programando, setProgramando] = React.useState(false)
  const [quitar, setQuitar] = React.useState<null | { tipo: 'obs' } | { tipo: 'foto'; llave: string }>(null)
  const urls = useQuery({
    queryKey: ['observacion-fotos', o.id, (o.fotos ?? []).join('|')],
    queryFn: async () => {
      const rutas = (o.fotos ?? []) as string[]
      if (!rutas.length) return []
      const { data } = await sb.storage.from('evidencias').createSignedUrls(rutas, 3600)
      return rutas.map((r, i) => ({ url: data?.[i]?.signedUrl ?? null, llave: (o.fotos_ids ?? [])[i] ?? null }))
    },
  })

  const quitarFoto = async (llave: string) => {
    const { error } = await sb.rpc('dar_de_baja_evidencia', { p_client_id: llave })
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success('Foto quitada')
    await alActualizar()
  }
  const quitarObservacion = async () => {
    const { error } = await sb.rpc('quitar_observacion', { p_id: o.id } as any)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success('Observación quitada')
    await alActualizar()
    alCerrar()
  }

  const dato = (t: string, v: React.ReactNode, ancho?: boolean) => (
    <div className={cn(ancho && 'col-span-2')}><dt className="text-muted-foreground text-[11px]">{t}</dt><dd>{v || '—'}</dd></div>
  )

  return (
    <Dialog open onOpenChange={(v) => !v && alCerrar()}>
      <SheetContent side="right" className="w-full max-w-lg gap-0 overflow-y-auto p-0">
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Badge className={ESTADOS[o.estado as Estado]?.className}>{ESTADOS[o.estado as Estado]?.label}</Badge>
            {o.codigo && <span className="text-muted-foreground font-mono text-[12px]">{o.codigo}</span>}
          </div>
          <h2 className="text-[16px] font-semibold leading-snug">{o.descripcion}</h2>
          {o.gps_distancia_m > 2000 && (
            <p className="text-destructive text-[12.5px] font-medium">
              La ubicación GPS quedó a {(o.gps_distancia_m / 1000).toFixed(1)} km de la progresiva registrada. Verifique el dato.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
            {dato('Tipo de actividad', o.activity_category)}
            {dato('Actividad', [o.activity_code, o.activity_name].filter(Boolean).join(' · '))}
            {dato('Tramo', `${o.section_numero ? `Tramo ${o.section_numero} · ` : ''}${o.section_name ?? ''}`)}
            {dato('Sector', o.sector_code)}
            {dato('Progresiva inicial', o.progresiva_txt)}
            {dato('Progresiva final', o.progresiva_fin_txt && o.progresiva_fin_m !== o.progresiva_m ? o.progresiva_fin_txt : null)}
            {dato('Lado', o.side ? etiquetaDeLado(o.side) : null)}
            {dato('Metrado', metradoDe(o))}
            {dato('Fecha', fmtDate(o.observado_on))}
            {dato('Registró', [o.created_by_name, o.crew_name].filter(Boolean).join(' · '))}
            {o.programada_on && dato('Programada para', fmtDate(o.programada_on))}
            {o.atendida_at && dato('Atendida', fmtDate(o.atendida_at))}
          </dl>
          {delPunto.length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1 text-[11px]">También en este punto</p>
              <ul className="space-y-1">
                {delPunto.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => alAbrirOtra?.(x)} className="text-primary flex items-center gap-2 text-left text-[12.5px] hover:underline">
                      <span className="size-2 rounded-full" style={{ background: ESTADOS[x.estado as Estado]?.color }} />
                      {[x.activity_code, x.activity_name, metradoDe(x)].filter(Boolean).join(' · ') || x.descripcion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-muted-foreground mb-2 text-[11px]">Fotos ({(o.fotos ?? []).length})</p>
            <div className="flex flex-wrap gap-2">
              {(urls.data ?? []).map((f, i) => (
                <div key={f.llave ?? i} className="relative">
                  <button onClick={() => f.url && setGrande(f.url)} className="bg-secondary relative block size-28 overflow-hidden rounded-lg border border-border">
                    {f.url && <Image src={f.url} alt="" fill sizes="112px" className="object-cover" unoptimized />}
                  </button>
                  {/* La que salió mal se quita; la observación lleva al menos una */}
                  {puedeEditar && f.llave && (o.fotos ?? []).length > 1 && (
                    <button onClick={() => setQuitar({ tipo: 'foto', llave: f.llave! })} aria-label="Quitar foto"
                      className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {puedeGestionar && (
            <div className="space-y-2 border-t border-border pt-4">
              {o.estado === 'pendiente' && (
                <Button className="w-full" onClick={() => setProgramando(true)}>
                  <CalendarPlus className="size-4" />Programar (jalar a la programación)
                </Button>
              )}
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Nota: qué se hizo…" />
              <div className="flex flex-wrap gap-2">
                {o.estado !== 'atendida' && <Button variant="outline" onClick={() => alCambiar(o, 'atendida', nota)}><CircleCheck className="size-4" />Atendida</Button>}
                {o.estado === 'atendida' && <Button variant="ghost" onClick={() => alCambiar(o, 'pendiente', nota)}><Undo2 className="size-4" />Volver a pendiente</Button>}
              </div>
            </div>
          )}
          {puedeEditar && (
            <div className="border-t border-border pt-4">
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setQuitar({ tipo: 'obs' })}>
                <Trash2 className="size-4" />Quitar observación
              </Button>
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
      {programando && <ProgramarObservacion o={o} onClose={() => setProgramando(false)} onDone={() => { void alActualizar() }} />}
      <ConfirmDialog
        open={!!quitar}
        onOpenChange={() => setQuitar(null)}
        title={quitar?.tipo === 'foto' ? '¿Quitar esta foto?' : '¿Quitar la observación?'}
        description={quitar?.tipo === 'foto'
          ? 'Se quita de la observación; las demás fotos se quedan.'
          : `«${o.descripcion}» se quita con sus fotos${o.plan_item_id ? ' y su partida programada (si aún no empezó)' : ''}. Úsalo si se registró por error.`}
        confirmLabel="Sí, quitar"
        onConfirm={async () => {
          if (quitar?.tipo === 'foto') await quitarFoto(quitar.llave)
          else await quitarObservacion()
        }}
      />
    </Dialog>
  )
}
