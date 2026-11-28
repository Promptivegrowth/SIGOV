'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Eye, FileSpreadsheet, FileText, Image as ImageIcon, MapPin, Pencil, MoreVertical, Target, Filter, User, CalendarDays,
  Building2, Info, Download, Loader2, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Activity,
  PackageOpen, Layers, X, CircleSlash,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { Kpi } from '@/components/gestion/gestion-nav'
import { cn, fmtDate, fmtDateTime, fmtNumber, toISODate, addDays } from '@/lib/utils'
import { pdfBlob, excelBlob, guardarArchivo, nombreCliente, type ReportMeta } from '@/lib/reports'
import { fotosOficiales } from '@/lib/fotos-oficiales'
import { panelJpg, type FilaPanel } from '@/lib/panel-jpg'
import { usuarioDeCorreo } from '@/lib/usuario'
import { mensajeAmigable } from '@/lib/errores'
import { toast } from 'sonner'
import { FAMILIAS, type Familia, type Columna } from './familias'

/**
 * Centro de reportes (ADMIN_Reportes_WEB_V2 / MOVIL_V2; guía, función 15).
 *
 * Familia → fechas y filtros → vista previa → Excel / PDF / Panel JPG /
 * Mapa. Todo sale de la misma consulta filtrada que se ve en la tabla (o de
 * lo seleccionado, si se marcan filas). Cada exportación queda en el
 * Historial con sus filtros originales y su archivo; al descargarla, el
 * servidor vuelve a comprobar el permiso.
 */
type Formato = 'excel' | 'pdf' | 'jpg' | 'mapa'
const FORMATO: Record<Formato, { t: string; i: any; c: string; ext: string }> = {
  excel: { t: 'Excel', i: FileSpreadsheet, c: 'text-success bg-success/10', ext: 'xlsx' },
  pdf: { t: 'PDF', i: FileText, c: 'text-destructive bg-destructive/10', ext: 'pdf' },
  jpg: { t: 'Panel JPG', i: ImageIcon, c: 'text-info bg-info/10', ext: 'jpg' },
  mapa: { t: 'Mapa', i: MapPin, c: 'text-info bg-info/10', ext: 'geojson' },
}
const POR_PAGINA = [10, 25, 50, 100]

export function CentroReportes() {
  const { service, profile, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  // ── Filtros en la URL: volver atrás conserva la consulta ──────────────
  const hoy = toISODate(new Date())
  const f = {
    fam: sp.get('f') ?? '',
    desde: sp.get('desde') ?? '',
    hasta: sp.get('hasta') ?? hoy,
    estado: sp.get('estado') ?? '',
    q: sp.get('q') ?? '',
  }
  const poner = (cambios: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(cambios)) (v ? n.set(k, v) : n.delete(k))
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const permitidas = useQuery({
    queryKey: ['familias-permitidas', service.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('familias_permitidas' as any, { p_service: service.id })
      if (error) throw error
      return (data ?? []) as string[]
    },
  })
  const familias = FAMILIAS.filter((x) => permitidas.data?.includes(x.key))
  const fam: Familia | undefined = familias.find((x) => x.key === f.fam) ?? familias[0]
  if (!f.desde) f.desde = fam?.desdeDefecto?.() ?? toISODate(addDays(new Date(), -30))
  const sel = (k: string) => sp.get(`s_${k}`) ?? ''

  const datos = useQuery({
    queryKey: ['centro-reportes', service.id, fam?.key, f.desde, f.hasta],
    enabled: !!fam,
    queryFn: async () => ({ filas: await fam!.cargar({ sb, serviceId: service.id, desde: f.desde, hasta: f.hasta, visor: role === 'visor' }), corte: new Date().toISOString() }),
  })
  const todas = datos.data?.filas ?? []

  const filtradas = React.useMemo(() => {
    if (!fam) return []
    const t = f.q.trim().toLowerCase()
    const est = fam.estados?.find((e) => e[0] === f.estado)
    return todas.filter((r) =>
      fam.selectores.every((s) => !sel(s.k) || s.valor(r) === sel(s.k))
      && (!est || est[2](r))
      && (!t || fam.texto(r).toLowerCase().includes(t)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, fam, sp])

  // ── Orden, selección y páginas ────────────────────────────────────────
  const [orden, setOrden] = React.useState<{ k: string; asc: boolean } | null>(null)
  const [seleccion, setSeleccion] = React.useState<Set<number>>(new Set())
  const [porPagina, setPorPagina] = React.useState(10)
  const [pagina, setPagina] = React.useState(0)
  React.useEffect(() => { setSeleccion(new Set()); setPagina(0); setOrden(null) }, [fam?.key, f.desde, f.hasta])
  React.useEffect(() => { setPagina(0) }, [filtradas.length, porPagina])

  const ordenadas = React.useMemo(() => {
    if (!orden || !fam) return filtradas
    const col = fam.columnas.find((c) => c.k === orden.k)
    if (!col) return filtradas
    return [...filtradas].sort((a, b) => {
      const x = col.v(a)
      const y = col.v(b)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true })
      return orden.asc ? r : -r
    })
  }, [filtradas, orden, fam])
  const indice = React.useMemo(() => new Map(todas.map((r, i) => [r, i])), [todas])
  const paginas = Math.max(1, Math.ceil(ordenadas.length / porPagina))
  const visibles = ordenadas.slice(pagina * porPagina, pagina * porPagina + porPagina)
  const elegidas = seleccion.size ? ordenadas.filter((r) => seleccion.has(indice.get(r)!)) : ordenadas
  const todasMarcadas = ordenadas.length > 0 && ordenadas.every((r) => seleccion.has(indice.get(r)!))

  // ── Alcance ───────────────────────────────────────────────────────────
  const etiquetaSel = (s: Familia['selectores'][number], v: string) => (s.nombre ? s.nombre(v) : v)
  const aplicados: string[] = fam?.sinFechas ? ['Registro maestro vigente'] : [`Fechas: ${fmtDate(f.desde)} – ${fmtDate(f.hasta)}`]
  for (const s of fam?.selectores ?? []) aplicados.push(`${s.t}: ${sel(s.k) ? etiquetaSel(s, sel(s.k)) : 'Todos'}`)
  aplicados.push(`Estado: ${fam?.estados?.find((e) => e[0] === f.estado)?.[1] ?? 'Todos'}`)
  if (f.q) aplicados.push(`Búsqueda: «${f.q}»`)
  if (seleccion.size) aplicados.push(`Selección: ${seleccion.size} registros`)
  const nFiltros = (fam?.selectores ?? []).filter((s) => sel(s.k)).length + (f.estado ? 1 : 0) + (f.q ? 1 : 0) + 2
  const corte = datos.data?.corte ?? new Date().toISOString()
  const usuario = usuarioDeCorreo(profile.email) || profile.full_name
  const cliente = nombreCliente((service as any).client_name)

  // ── Historial de exportaciones ────────────────────────────────────────
  const historial = useQuery({
    queryKey: ['exportaciones', service.id],
    queryFn: async () => ((await sb.from('exportaciones' as any).select('*').eq('service_id', service.id)
      .order('created_at', { ascending: false }).limit(12)).data ?? []) as any[],
    refetchInterval: (q) => ((q.state.data as any[] | undefined)?.some((e) => e.estado === 'en_proceso') ? 3000 : false),
  })
  // Retención (Configuración › Exportación): las copias temporales vencidas se eliminan;
  // los originales y la bitácora no se tocan
  React.useEffect(() => {
    const vencidas = async () => {
      const filas = (historial.data ?? []).filter((e) => e.estado === 'listo' && e.archivo)
      if (!filas.length) return
      const { data } = await sb.rpc('config_vigente' as any, { p_service: service.id, p_seccion: 'exportacion' } as any)
      const dias = Number((data as any)?.retencion_dias ?? 30)
      const limite = Date.now() - dias * 86_400_000
      const viejas = filas.filter((e) => new Date(e.created_at).getTime() < limite)
      if (!viejas.length) return
      await sb.storage.from('exportaciones').remove(viejas.map((e) => e.archivo))
      await sb.from('exportaciones' as any).update({ estado: 'expirado' }).in('id', viejas.map((e) => e.id))
      qc.invalidateQueries({ queryKey: ['exportaciones', service.id] })
    }
    vencidas().catch(() => { /* la limpieza no interrumpe la pantalla */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial.data])
  const [progreso, setProgreso] = React.useState<{ id: string; texto: string } | null>(null)
  const cancelar = React.useRef<string | null>(null)

  // ── Generación ────────────────────────────────────────────────────────
  const meta = (): ReportMeta => ({
    titulo: fam!.titulo,
    servicio: service.name,
    cliente,
    contrato: (service as any).contract_code,
    periodo: `${fam!.sinFechas ? 'Vigente' : `Del ${fmtDate(f.desde)} al ${fmtDate(f.hasta)}`} · corte ${fmtDateTime(corte)}`,
    generadoPor: `${profile.full_name} (${usuario})`,
    filtros: aplicados.join(' · '),
    registros: elegidas.length,
  })
  const columnasExport = (fam?.columnas ?? []).filter((c) => c.k !== '_')
  const filasExport = (rs: any[]) => rs.map((r) => Object.fromEntries(columnasExport.map((c) => [c.k, c.v(r)])))
  const anchoPdf = (cols: Columna[]) => {
    const suma = cols.reduce((s, c) => s + (c.ancho ?? 12), 0)
    const k = Math.min(1.7, 268 / suma)
    return cols.map((c) => ({ header: c.t, key: c.k, align: c.alinear, width: (c.ancho ?? 12) * k }))
  }

  const fotosDe = async (rs: any[]): Promise<FilaPanel[]> => {
    const def = fam!.fotos!
    const ids = rs.filter((r) => fam!.conFotos?.(r)).map(def.id)
    const porId = new Map<string, any[]>()
    for (let i = 0; i < ids.length; i += 150) {
      const parte = ids.slice(i, i + 150)
      let q: any
      if (def.tipo === 'pci') q = sb.from('v_evidences').select('id, phase, storage_path, taken_at, created_at, pci_item_id').in('pci_item_id', parte).eq('autorizacion_pendiente', false)
      else if (def.tipo === 'entrada') q = sb.from('v_evidences').select('id, phase, storage_path, taken_at, created_at, work_entry_id').in('work_entry_id', parte)
      else q = sb.from('evidences').select('id, phase, storage_path, taken_at, created_at, work_entries!inner(work_order_id)').in('work_entries.work_order_id', parte).is('deleted_at', null)
      const { data, error } = await q
      if (error) throw error
      for (const e of (data ?? []) as any[]) {
        const k = def.tipo === 'pci' ? e.pci_item_id : def.tipo === 'entrada' ? e.work_entry_id : e.work_entries?.work_order_id
        porId.set(k, [...(porId.get(k) ?? []), e])
      }
    }
    const salida: FilaPanel[] = []
    for (const r of rs) {
      const fotos = porId.get(def.id(r)) ?? []
      if (!fotos.length) continue
      const of = fotosOficiales(def.tipo === 'pci' ? r.item : def.id(r).slice(0, 6), fotos)
      // Una por fase en la lámina: Antes (1), Durante (2) y la Después oficial (3)
      const rutas = of.oficiales.filter((o) => o.fase !== 3 || o.nombre.endsWith('(3).jpg'))
      const firmadas = await sb.storage.from('evidencias').createSignedUrls(rutas.map((o) => o.foto.storage_path), 3600)
      const url = new Map((firmadas.data ?? []).map((d: any) => [d.path, d.signedUrl]))
      salida.push({
        titulo: def.titulo(r), detalle: def.detalle(r),
        fotos: rutas.map((o) => ({ fase: o.fase === 1 ? 'antes' : o.fase === 2 ? 'durante' : 'despues', url: url.get(o.foto.storage_path) ?? null,
          nombre: def.tipo === 'pci' ? o.nombre : undefined, captura: o.foto.taken_at ? fmtDateTime(o.foto.taken_at) : undefined })) as any,
      })
    }
    return salida
  }

  const puntosDe = async (rs: any[]) => {
    if (fam!.key === 'pci') {
      const ids = rs.filter((r) => r.con_coordenadas).map((r) => r.item_id)
      const feats: any[] = []
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await sb.from('v_evidences').select('pci_item_id, phase, lat, lng, taken_at').in('pci_item_id', ids.slice(i, i + 150)).not('lat', 'is', null)
        const deItem = new Map(rs.map((r) => [r.item_id, r]))
        for (const e of (data ?? []) as any[]) {
          const r = deItem.get(e.pci_item_id)
          feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
            properties: { pci: r?.pci, item: r?.item, fase: e.phase, captura: e.taken_at, ejecucion: r?.ejecucion, conformidad: r?.conformidad } })
        }
      }
      return feats
    }
    return rs.map((r) => ({ r, p: fam!.punto?.(r) })).filter((x) => x.p).map(({ r, p }) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: p },
      properties: Object.fromEntries(columnasExport.map((c) => [c.t, c.v(r)])),
    }))
  }

  const exportar = async (formato: Formato) => {
    if (!fam) return
    const rs = elegidas
    if (!rs.length) { toast.info('Sin registros con estos filtros: no hay nada que exportar'); return }
    const stamp = `${hoy.replaceAll('-', '')}_${new Date().toTimeString().slice(0, 5).replace(':', '')}`
    const base = `SIGOV_${fam.key.toUpperCase()}_${stamp}`
    const { data: fila, error } = await sb.from('exportaciones' as any).insert({
      service_id: service.id, familia: fam.key, formato, nombre: base, registros: formato === 'jpg' ? null : rs.length,
      filtros: { desde: f.desde, hasta: f.hasta, estado: f.estado, q: f.q, seleccion: seleccion.size,
        selectores: Object.fromEntries((fam.selectores).map((s) => [s.k, sel(s.k)])) },
      filtros_texto: aplicados.join(' · '), corte,
    }).select('id').single()
    if (error || !fila) { toast.error(mensajeAmigable(error, 'No tienes permiso para exportar esta familia')); return }
    const id = (fila as any).id as string
    cancelar.current = null
    qc.invalidateQueries({ queryKey: ['exportaciones', service.id] })
    try {
      let blob: Blob
      let archivo = `${base}.${FORMATO[formato].ext}`
      let registros: number | null = rs.length
      setProgreso({ id, texto: 'Preparando…' })
      if (formato === 'excel') {
        blob = await excelBlob(meta(), [{ name: fam.label.slice(0, 28), columns: columnasExport.map((c) => ({ header: c.t, key: c.k, width: c.ancho ?? 12 })), rows: filasExport(rs) }])
      } else if (formato === 'pdf') {
        blob = await pdfBlob(meta(), anchoPdf(columnasExport), filasExport(rs), {
          landscape: true, cover: false, kpis: fam.kpis(rs).map((k) => ({ label: k.t, value: k.v })),
          intro: fam.key === 'pci' ? 'Atendido no equivale a evidencia completa ni a conformidad del cliente: cada columna se informa por separado.' : undefined,
        })
      } else if (formato === 'jpg') {
        setProgreso({ id, texto: 'Reuniendo fotos…' })
        const panel = await fotosDe(rs)
        if (!panel.length) throw new Error('Sin evidencias en el filtro: no se genera un JPG vacío')
        if (cancelar.current === id) throw new Error('cancelado')
        setProgreso({ id, texto: `Componiendo ${panel.length} registros…` })
        const r = await panelJpg(base, `${fam.titulo} · Panel fotográfico`, [
          `${service.name} · ${cliente} · corte ${fmtDateTime(corte)} · ${usuario}`, aplicados.join(' · '),
        ], panel)
        blob = r.blob
        archivo = r.archivo
        registros = panel.length
      } else {
        const feats = await puntosDe(rs)
        if (!feats.length) throw new Error('Sin coordenadas en lo filtrado: no se genera el mapa')
        blob = new Blob([JSON.stringify({ type: 'FeatureCollection', name: base, sigov: { familia: fam.key, corte, filtros: aplicados, usuario }, features: feats })],
          { type: 'application/geo+json' })
        registros = feats.length
      }
      if (cancelar.current === id) throw new Error('cancelado')
      setProgreso({ id, texto: 'Guardando en el historial…' })
      const ruta = `${profile.id}/${id}/${archivo}`
      const up = await sb.storage.from('exportaciones').upload(ruta, blob, { contentType: blob.type || 'application/octet-stream', upsert: false })
      if (up.error) throw up.error
      await sb.from('exportaciones' as any).update({ estado: 'listo', archivo: ruta, registros, terminado_at: new Date().toISOString() }).eq('id', id)
      guardarArchivo(blob, archivo)
      toast.success(`${FORMATO[formato].t} listo · ${registros ?? 0} registros`)
    } catch (e: any) {
      const cancelado = e?.message === 'cancelado'
      await sb.from('exportaciones' as any).update({ estado: cancelado ? 'cancelado' : 'error', error: cancelado ? null : String(e?.message ?? e).slice(0, 300), terminado_at: new Date().toISOString() }).eq('id', id)
      if (cancelado) toast.info('Exportación cancelada; los registros de origen no cambian')
      else toast.error(mensajeAmigable(e, 'No se pudo generar la exportación'))
    } finally {
      setProgreso(null)
      qc.invalidateQueries({ queryKey: ['exportaciones', service.id] })
    }
  }

  const descargar = async (e: any) => {
    const { data, error } = await sb.storage.from('exportaciones').download(e.archivo)
    if (error || !data) { toast.error('Ya no tienes permiso para descargar esta exportación o el archivo no está disponible'); return }
    guardarArchivo(data, e.archivo.split('/').pop())
  }

  // ── Vista previa: el mismo PDF, antes de bajarlo ──────────────────────
  const [previa, setPrevia] = React.useState<{ url: string | null; cargando: boolean } | null>(null)
  const abrirPrevia = async () => {
    if (!fam) return
    setPrevia({ url: null, cargando: true })
    if (!elegidas.length) { setPrevia({ url: null, cargando: false }); return }
    try {
      const b = await pdfBlob(meta(), anchoPdf(columnasExport), filasExport(elegidas.slice(0, 300)), { landscape: true, cover: false, kpis: fam.kpis(elegidas).map((k) => ({ label: k.t, value: k.v })) })
      setPrevia({ url: URL.createObjectURL(b), cargando: false })
    } catch (e) {
      setPrevia(null)
      toast.error(mensajeAmigable(e, 'No se pudo armar la vista previa'))
    }
  }
  const cerrarPrevia = () => { if (previa?.url) URL.revokeObjectURL(previa.url); setPrevia(null) }

  const hayFotos = !!fam?.fotos && elegidas.some((r) => fam.conFotos?.(r))
  const hayPuntos = !!fam?.conCoordenadas && elegidas.some((r) => fam.conCoordenadas!(r))
  const ocupado = !!progreso

  if (permitidas.isLoading) return <PageBody><SkeletonList rows={8} /></PageBody>
  if (!fam) {
    return (
      <>
        <PageHeader title="Centro de reportes" description="Generación y descarga de informes filtrados" />
        <PageBody><p className="text-muted-foreground text-[13px]">Tu rol no tiene familias de reporte habilitadas en este contrato.</p></PageBody>
      </>
    )
  }
  const principales = familias.filter((x) => !x.extra)
  const extras = familias.filter((x) => x.extra)
  const columnasPantalla = fam.columnas.filter((c) => !c.soloExport)

  return (
    <>
      <PageHeader title="Centro de reportes" description="Generación y descarga de informes filtrados" />
      <PageBody className="space-y-4">
        {role !== 'ing_seguridad' && permitidas.data?.includes('pci') && (
          <Link href="/reportes/expediente" className="bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border border-border px-4 py-2.5 text-[13px] transition-colors">
            <PackageOpen className="text-primary size-5" />
            <span className="flex-1"><strong>Exportar expediente PCI</strong> <span className="text-muted-foreground">· carpetas PCI › plazo › ítem con fotos ITEM_n(1)(2)(3), manifiesto e historial</span></span>
            <ChevronRight className="text-muted-foreground size-4" />
          </Link>
        )}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            {/* Familias */}
            <div className="bg-card flex flex-wrap items-center gap-1 rounded-xl border border-border p-1">
              {principales.map((x) => (
                <button key={x.key} onClick={() => poner({ f: x.key, desde: null, estado: null, q: null, ...Object.fromEntries(fam.selectores.map((s) => [`s_${s.k}`, null])) })}
                  className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
                    x.key === fam.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-secondary')}>
                  <x.icono className="size-4" />{x.label}
                </button>
              ))}
              {extras.length > 0 && (
                <Select value={fam.extra ? fam.key : '__'} onValueChange={(v) => v !== '__' && poner({ f: v, desde: null, estado: null, q: null, ...Object.fromEntries(fam.selectores.map((s) => [`s_${s.k}`, null])) })}>
                  <SelectTrigger className={cn('h-9 w-auto min-w-36 border-0 text-[13px] font-semibold', fam.extra ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__">Más familias</SelectItem>
                    {extras.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* KPIs: de la misma consulta filtrada */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {fam.kpis(filtradas).map((k) => <Kpi key={k.t} icono={k.i} valor={datos.isLoading ? '…' : k.v} etiqueta={k.t} tono={k.tono} />)}
            </div>

            {/* Búsqueda y salidas */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input defaultValue={f.q} key={fam.key} placeholder={fam.buscar} className="h-10 pl-9"
                  onChange={(e) => { const v = e.target.value; window.clearTimeout((window as any).__qRep); (window as any).__qRep = window.setTimeout(() => poner({ q: v || null }), 300) }} />
              </div>
              <Button variant="outline" onClick={abrirPrevia} className="text-info border-info/40"><Eye className="size-4" />Vista previa</Button>
              <Button variant="outline" onClick={() => exportar('excel')} disabled={ocupado}><FileSpreadsheet className="text-success size-4" />Exportar Excel</Button>
              <Button variant="outline" onClick={() => exportar('pdf')} disabled={ocupado} className="text-destructive"><FileText className="size-4" />PDF</Button>
              <Button variant="outline" onClick={() => exportar('jpg')} disabled={ocupado || !hayFotos}
                title={hayFotos ? 'Lámina JPG con las fotos oficiales' : 'Sin evidencias en lo filtrado'} className="text-info"><ImageIcon className="size-4" />Panel JPG</Button>
              <Button variant="outline" onClick={() => exportar('mapa')} disabled={ocupado || !hayPuntos}
                title={hayPuntos ? 'GeoJSON con los puntos georreferenciados' : 'Sin coordenadas en lo filtrado'} className="text-info"><MapPin className="size-4" />Mapa</Button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
              {!fam.sinFechas && <>
                <Campo icono={CalendarDays} t="Fecha inicial"><input type="date" value={f.desde} max={f.hasta} onChange={(e) => e.target.value && poner({ desde: e.target.value })} className="bg-transparent text-[13px] outline-none" /></Campo>
                <Campo icono={CalendarDays} t="Fecha final"><input type="date" value={f.hasta} min={f.desde} onChange={(e) => e.target.value && poner({ hasta: e.target.value })} className="bg-transparent text-[13px] outline-none" /></Campo>
              </>}
              {fam.selectores.map((s) => {
                const opciones = [...new Set(todas.map(s.valor).filter(Boolean) as string[])]
                  .sort((a, b) => (s.orden === 'num' ? Number(a) - Number(b) : a.localeCompare(b, 'es', { numeric: true })))
                return (
                  <Campo key={s.k} icono={s.icono} t={s.t}>
                    <select value={sel(s.k)} onChange={(e) => poner({ [`s_${s.k}`]: e.target.value || null })} className="max-w-40 bg-transparent text-[13px] outline-none">
                      <option value="">Todos</option>
                      {opciones.map((o) => <option key={o} value={o}>{etiquetaSel(s, o)}</option>)}
                    </select>
                  </Campo>
                )
              })}
              {fam.estados && (
                <Campo icono={Activity} t="Estado">
                  <select value={f.estado} onChange={(e) => poner({ estado: e.target.value || null })} className="max-w-44 bg-transparent text-[13px] outline-none">
                    <option value="">Todos</option>
                    {fam.estados.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                  </select>
                </Campo>
              )}
              {(nFiltros > 2 || seleccion.size > 0) && (
                <Button variant="ghost" size="sm" className="self-center" onClick={() => { setSeleccion(new Set()); poner({ estado: null, q: null, ...Object.fromEntries(fam.selectores.map((s) => [`s_${s.k}`, null])) }) }}>
                  <X className="size-3.5" />Limpiar filtros
                </Button>
              )}
            </div>

            {/* Tabla */}
            <Card>
              <CardContent className="p-0">
                {datos.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : datos.isError ? (
                  <p className="text-destructive p-6 text-[13px]">{mensajeAmigable(datos.error, 'No se pudo cargar el reporte')}</p>
                ) : ordenadas.length === 0 ? (
                  <div className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-[13px]"><CircleSlash className="size-6" />Sin registros con estos filtros.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-secondary/50 text-left">
                        <tr>
                          <th className="w-10 px-3 py-2.5">
                            <input type="checkbox" aria-label="Seleccionar todo" checked={todasMarcadas}
                              onChange={() => setSeleccion(todasMarcadas ? new Set() : new Set(ordenadas.map((r) => indice.get(r)!)))} />
                          </th>
                          {columnasPantalla.map((c) => (
                            <th key={c.k} className={cn('px-3 py-2.5 font-semibold whitespace-nowrap', c.alinear === 'right' && 'text-right', c.alinear === 'center' && 'text-center')}>
                              {c.orden ? (
                                <button className="inline-flex items-center gap-1" onClick={() => setOrden(orden?.k === c.k ? { k: c.k, asc: !orden.asc } : { k: c.k, asc: true })}>
                                  {c.t}<ArrowUpDown className={cn('size-3.5', orden?.k === c.k ? 'text-primary' : 'text-muted-foreground')} />
                                </button>
                              ) : c.t}
                            </th>
                          ))}
                          <th className="px-3 py-2.5 text-center font-semibold">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {visibles.map((r) => {
                          const i = indice.get(r)!
                          return (
                            <tr key={i} className={cn('hover:bg-secondary/30', seleccion.has(i) && 'bg-primary/5')}>
                              <td className="px-3 py-2"><input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(i)}
                                onChange={() => { const n = new Set(seleccion); n.has(i) ? n.delete(i) : n.add(i); setSeleccion(n) }} /></td>
                              {columnasPantalla.map((c) => (
                                <td key={c.k} className={cn('px-3 py-2', c.alinear === 'right' && 'text-right tabular-nums', c.alinear === 'center' && 'text-center')}>
                                  {c.ver ? c.ver(r) : c.v(r)}
                                </td>
                              ))}
                              <td className="px-3 py-1.5"><Acciones fam={fam} r={r} rol={role} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Paginación */}
            {ordenadas.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2">Mostrar
                  <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="bg-card rounded-md border border-border px-2 py-1">
                    {POR_PAGINA.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select> por página
                </span>
                <Paginas pagina={pagina} paginas={paginas} ir={setPagina} />
                <span className="bg-secondary rounded-md px-3 py-1 tabular-nums">{fmtNumber(visibles.length)} de {fmtNumber(ordenadas.length)}</span>
              </div>
            )}
          </div>

          {/* Columna derecha: alcance e historial */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[15px]"><Target className="text-primary size-5" />Alcance</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-[12.5px]">
                <div>
                  <p className="flex items-center gap-2 font-semibold"><Filter className="size-4" />Filtros aplicados
                    <span className="bg-success/12 text-success ml-auto rounded-full px-2 py-0.5 text-[11.5px]">{nFiltros} filtros</span></p>
                  <ul className="text-muted-foreground mt-1 space-y-0.5 pl-6">{aplicados.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
                <Dato i={User} t="Usuario" v={usuario} />
                <Dato i={CalendarDays} t="Corte" v={fmtDateTime(corte)} />
                <Dato i={Building2} t="Cliente" v={cliente} />
                <Dato i={Layers} t="Registros" v={`${fmtNumber(elegidas.length)}${seleccion.size ? ' seleccionados' : ' filtrados'}`} />
                <p className="bg-info/8 text-info flex gap-2 rounded-lg p-2.5"><Info className="mt-0.5 size-4 shrink-0" />La exportación respeta los filtros aplicados y los permisos del usuario.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[15px]"><Layers className="text-primary size-5" />Historial de exportaciones</CardTitle></CardHeader>
              <CardContent className="p-0">
                {(historial.data ?? []).length === 0 ? <p className="text-muted-foreground px-4 pb-4 text-[12.5px]">Aún no exportas nada desde aquí.</p> : (
                  <ul className="divide-y divide-border">
                    {(historial.data ?? []).map((e) => {
                      const F = FORMATO[e.formato as Formato] ?? FORMATO.pdf
                      const viejo = e.estado === 'en_proceso' && Date.now() - new Date(e.created_at).getTime() > 30 * 60_000
                      const familia = FAMILIAS.find((x) => x.key === e.familia)?.label ?? e.familia
                      return (
                        <li key={e.id} className="flex items-center gap-2.5 px-4 py-2.5 text-[12px]" title={e.filtros_texto ?? ''}>
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', F.c)}><F.i className="size-4" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{new Date(e.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} · {F.t}</p>
                            <p className="text-muted-foreground truncate">{familia} · {e.registros != null ? `${fmtNumber(e.registros)} registros` : '—'}{progreso?.id === e.id ? ` · ${progreso?.texto}` : ''}</p>
                          </div>
                          {e.estado === 'listo' ? (
                            <>
                              <span className="bg-success/12 text-success rounded-full px-2 py-0.5 font-semibold">Listo</span>
                              <button onClick={() => descargar(e)} className="text-info flex items-center gap-1 font-semibold hover:underline"><Download className="size-3.5" />Descargar</button>
                            </>
                          ) : e.estado === 'en_proceso' && !viejo ? (
                            <>
                              <span className="bg-info/10 text-info flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"><Loader2 className="size-3 animate-spin" />En proceso</span>
                              {progreso?.id === e.id && <button onClick={() => { cancelar.current = e.id }} className="text-muted-foreground hover:text-foreground" title="Cancelar"><X className="size-3.5" /></button>}
                            </>
                          ) : (
                            <span className={cn('rounded-full px-2 py-0.5 font-semibold', e.estado === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground')} title={e.error ?? ''}>
                              {e.estado === 'error' ? 'Error' : e.estado === 'cancelado' ? 'Cancelada' : e.estado === 'expirado' ? 'Expirada' : 'Interrumpida'}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>

      <Dialog open={!!previa} onOpenChange={(o) => !o && cerrarPrevia()}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Vista previa · {fam.titulo}</DialogTitle>
            <DialogDescription>{fmtNumber(elegidas.length)} registros · corte {fmtDateTime(corte)} · {aplicados.join(' · ')}</DialogDescription>
          </DialogHeader>
          {previa?.cargando ? <div className="grid h-[calc(var(--vh)_*_60)] place-items-center"><Loader2 className="text-primary size-6 animate-spin" /></div>
            : !previa?.url ? <div className="text-muted-foreground grid h-40 place-items-center text-[13px]">Sin registros: no hay nada que previsualizar.</div>
            : (
              <>
                <iframe src={previa.url} className="h-[calc(var(--vh)_*_65)] w-full rounded-lg border border-border" title="Vista previa del PDF" />
                {elegidas.length > 300 && <p className="text-muted-foreground text-[12px]">La vista previa muestra los primeros 300 registros; la exportación los incluye todos ({fmtNumber(elegidas.length)}).</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => { cerrarPrevia(); exportar('excel') }}><FileSpreadsheet className="text-success size-4" />Exportar Excel</Button>
                  <Button onClick={() => { cerrarPrevia(); exportar('pdf') }}><FileText className="size-4" />Exportar PDF</Button>
                </div>
              </>
            )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Campo({ icono: I, t, children }: { icono: any; t: string; children: React.ReactNode }) {
  return (
    <label className="bg-card flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
      <I className="text-muted-foreground size-4" />
      <span className="flex flex-col"><span className="text-[11.5px] font-semibold">{t}</span>{children}</span>
    </label>
  )
}

function Dato({ i: I, t, v }: { i: any; t: string; v: React.ReactNode }) {
  return <p className="flex items-center gap-2 border-t border-border pt-2"><I className="text-muted-foreground size-4" /><span className="w-20 font-semibold">{t}</span><span className="min-w-0 flex-1 truncate">{v}</span></p>
}

function Acciones({ fam, r, rol }: { fam: Familia; r: any; rol: string }) {
  const [abierto, setAbierto] = React.useState(false)
  const ver = fam.ver?.(r)
  // «Editar autorizado»: solo quien puede editar el registro de origen (el servidor lo vuelve a comprobar)
  const editar = ['admin', 'supervisor', 'residente'].includes(rol) ? fam.editar?.(r) : null
  const ev = fam.evidencias?.(r)
  const items = [ver && { href: ver, t: 'Ver registro', i: Eye }, editar && { href: editar, t: 'Editar autorizado', i: Pencil }, ev && { href: ev, t: 'Ver evidencias', i: ImageIcon }].filter(Boolean) as { href: string; t: string; i: any }[]
  return (
    <div className="relative flex items-center justify-center gap-1">
      {items.map((x) => (
        <Link key={x.t} href={x.href} title={x.t} className="hover:bg-secondary hidden size-8 place-items-center rounded-md border border-border md:grid"><x.i className="size-4" /></Link>
      ))}
      <button onClick={() => setAbierto(!abierto)} className="hover:bg-secondary grid size-8 place-items-center rounded-md" aria-label="Más acciones"><MoreVertical className="size-4" /></button>
      {abierto && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={() => setAbierto(false)} aria-label="Cerrar" />
          <div className="bg-popover absolute top-9 right-0 z-20 w-48 rounded-lg border border-border p-1 shadow-lg">
            {items.map((x) => (
              <Link key={x.t} href={x.href} className="hover:bg-secondary flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px]"><x.i className="size-4" />{x.t}</Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Paginas({ pagina, paginas, ir }: { pagina: number; paginas: number; ir: (p: number) => void }) {
  const nums: (number | '…')[] = []
  for (let p = 0; p < paginas; p++) {
    if (p < 5 || p === paginas - 1 || Math.abs(p - pagina) <= 1) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const B = ({ p, children, off }: { p: number; children: React.ReactNode; off?: boolean }) => (
    <button disabled={off} onClick={() => ir(p)} className="hover:bg-secondary grid size-8 place-items-center rounded-md disabled:opacity-40">{children}</button>
  )
  return (
    <div className="flex items-center gap-0.5">
      <B p={0} off={pagina === 0}><ChevronsLeft className="size-4" /></B>
      <B p={pagina - 1} off={pagina === 0}><ChevronLeft className="size-4" /></B>
      {nums.map((p, k) => p === '…' ? <span key={`e${k}`} className="px-1">…</span> : (
        <button key={p} onClick={() => ir(p)} className={cn('grid size-8 place-items-center rounded-md tabular-nums', p === pagina ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}>{p + 1}</button>
      ))}
      <B p={pagina + 1} off={pagina >= paginas - 1}><ChevronRight className="size-4" /></B>
      <B p={paginas - 1} off={pagina >= paginas - 1}><ChevronsRight className="size-4" /></B>
    </div>
  )
}
