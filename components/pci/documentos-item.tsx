'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Eye, ExternalLink, History, Search, Info, FileText, FileSpreadsheet, Layers, CalendarDays, User, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'
import { fotosOficiales } from '@/lib/fotos-oficiales'
import { pdfBlob, excelBlob, guardarArchivo, type ReportMeta } from '@/lib/reports'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Documentos» del ítem (V13/V14): oficio, seguimiento, reporte diario,
 * panel fotográfico, historial de revisión y manifiesto de evidencias, por
 * versión publicada. Filtros (buscar, tipo, versión, fecha), selección y
 * «Descargar selección» (ZIP), visor e historial de versiones. Para COVINCA
 * solo lo autorizado (lo publicado). Se consultan por versión; no se editan.
 */
type Doc = { id: string; nombre: string; tipo: string; version: number; fecha: string | null; por: string; ext: 'pdf' | 'xlsx' | 'csv'; nota?: string; p?: any; parteId?: string; ruta?: string }
const FASES: Record<number, string> = { 1: 'Antes', 2: 'Durante', 3: 'Después' }

export function DocumentosItem({ item, fotos, historial, publicaciones, esVisor, meta }: {
  item: any; fotos: any[]; historial: any[]; publicaciones: any[]; esVisor: boolean; meta: ReportMeta
}) {
  const sb = React.useMemo(() => createClient(), [])
  const corto = String(item.pci_code ?? '').replace(/^PCI-\d{4}-0*/, '')
  const extra = useQuery({
    queryKey: ['item-docs', item.id],
    queryFn: async () => {
      const [pci, partes] = await Promise.all([
        sb.from('pcis').select('id, code, document_path, notified_on, registered_on, created_at, plazos_version, profiles:created_by(full_name)').eq('id', item.pci_id).maybeSingle(),
        sb.from('work_entries').select('work_order_id, work_orders!inner(id, work_date, status, publicacion_version, publicado_at, reviewed_at, crews(code), revisor:profiles!work_orders_reviewed_by_fkey(full_name))').eq('pci_item_id', item.id).is('deleted_at', null),
      ])
      const unicos = new Map<string, any>()
      for (const w of (partes.data ?? []) as any[]) unicos.set(w.work_order_id, w.work_orders)
      return { pci: pci.data as any, partes: [...unicos.values()] }
    },
  })
  const ultima = publicaciones[publicaciones.length - 1]
  const docs: Doc[] = React.useMemo(() => {
    const out: Doc[] = []
    const pci = extra.data?.pci
    if (pci?.document_path) {
      const ext = (pci.document_path.split('.').pop() ?? 'pdf').toLowerCase()
      out.push({ id: 'oficio', nombre: `OficioPCI${corto}.${ext}`, tipo: 'Oficio', version: Number(pci.plazos_version || 1), fecha: pci.registered_on ?? pci.notified_on ?? pci.created_at,
        por: pci.profiles?.full_name ? `Residente · ${pci.profiles.full_name}` : 'Residente', ext: ext === 'pdf' ? 'pdf' : 'pdf', ruta: pci.document_path, nota: 'Oficio de notificación del PCI' })
    }
    if (ultima) out.push({ id: 'seguimiento', nombre: `SeguimientoPCI${corto}.xlsx`, tipo: 'Seguimiento', version: ultima.version, fecha: ultima.cuando, por: 'Residente', ext: 'xlsx', p: ultima })
    for (const o of extra.data?.partes ?? []) {
      if (esVisor && !(o.publicacion_version > 0)) continue
      out.push({ id: `parte-${o.id}`, nombre: `Reportediario${fmtDate(o.work_date).slice(0, 5).replace('/', '-')}.pdf`, tipo: 'Reporte diario', version: Math.max(1, o.publicacion_version || 1),
        fecha: o.publicado_at ?? o.reviewed_at ?? o.work_date, por: o.revisor?.full_name ? `Supervisor · ${o.revisor.full_name}` : 'Supervisor', ext: 'pdf', parteId: o.id, nota: `Parte ${o.crews?.code ?? ''} del ${fmtDate(o.work_date)}` })
    }
    for (const p of publicaciones) {
      const por = p.profiles?.full_name ? `Residente · ${p.profiles.full_name}` : 'Residente'
      out.push({ id: `panel-${p.version}`, nombre: `Panelfotografico${item.item_number}.pdf`, tipo: 'Panel', version: p.version, fecha: p.cuando, por, ext: 'pdf', p })
      out.push({ id: `hist-${p.version}`, nombre: `Historialrevision${item.item_number}.pdf`, tipo: 'Historial', version: p.version, fecha: p.cuando, por: 'Sistema', ext: 'pdf', p })
      out.push({ id: `man-${p.version}`, nombre: `Manifiestoevidencias${item.item_number}.csv`, tipo: 'Manifiesto', version: p.version, fecha: p.cuando, por: 'Sistema', ext: 'csv', p })
    }
    return out
  }, [extra.data, publicaciones, ultima, corto, item.item_number, esVisor])

  // ── Filtros ───────────────────────────────────────────────────────────
  const [f, setF] = React.useState({ q: '', tipo: '', version: 'vigente', desde: '', hasta: '' })
  const vigentes = new Map<string, number>()
  for (const d of docs) vigentes.set(d.tipo + (d.parteId ?? ''), Math.max(vigentes.get(d.tipo + (d.parteId ?? '')) ?? 0, d.version))
  const filas = docs.filter((d) => (!f.q || d.nombre.toLowerCase().includes(f.q.toLowerCase())) && (!f.tipo || d.tipo === f.tipo)
    && (f.version === 'todas' || (f.version === 'vigente' ? d.version === vigentes.get(d.tipo + (d.parteId ?? '')) : String(d.version) === f.version))
    && (!f.desde || (d.fecha ?? '') >= f.desde) && (!f.hasta || String(d.fecha ?? '').slice(0, 10) <= f.hasta))
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [elegido, setElegido] = React.useState<string | null>(null)
  const actual = filas.find((d) => d.id === elegido) ?? filas.find((d) => d.tipo === 'Panel') ?? filas[0]
  const [ocupado, setOcupado] = React.useState<string | null>(null)
  const [visor, setVisor] = React.useState<{ url: string; nombre: string; tipo: string } | null>(null)
  const [verHist, setVerHist] = React.useState(false)

  // ── Generación (el mismo archivo para ver, descargar o empaquetar) ────
  const generar = async (d: Doc): Promise<Blob> => {
    if (d.tipo === 'Oficio' && d.ruta) {
      const { data, error } = await sb.storage.from('documentos').download(d.ruta)
      if (error || !data) throw error ?? new Error('No se pudo obtener el oficio')
      return data
    }
    if (d.tipo === 'Reporte diario' && d.parteId) {
      const { datosFor001, for001Pdf } = await import('@/lib/formato-for001')
      const datos = await datosFor001(sb as any, d.parteId)
      const logo = await fetch('/marca/logo-servicon.png').then((r) => r.arrayBuffer()).catch(() => null)
      return (await for001Pdf(datos, logo)).output('blob') as Blob
    }
    if (d.tipo === 'Seguimiento') {
      const { data, error } = await sb.rpc('reporte_pci' as any, { p_service: item.service_id, p_pci: item.pci_id } as any)
      if (error) throw error
      const rows = ((data ?? []) as any[]).map((x) => ({ item: x.item, plazo: x.plazo, vence: fmtDate(x.vencimiento), crew: x.crew ?? '—', ejec: x.ejecucion === 'atendido' ? 'Atendido' : 'Sin atención',
        ev: !(x.faltantes ?? []).length ? 'Completa' : `Falta ${(x.faltantes as string[]).join(', ')}`, conf: x.conformidad === 'conforme' ? 'Conforme' : x.conformidad === 'observado' ? 'Observado' : 'Pendiente', fotos: x.fotos }))
      return excelBlob({ ...meta, titulo: `Seguimiento PCI ${corto}`, registros: rows.length }, [{ name: `PCI ${corto}`, rows, columns: [
        { header: 'Ítem', key: 'item', width: 7 }, { header: 'Plazo (días)', key: 'plazo', width: 11 }, { header: 'Vencimiento', key: 'vence', width: 12 }, { header: 'Cuadrilla', key: 'crew', width: 18 },
        { header: 'Ejecución', key: 'ejec', width: 13 }, { header: 'Evidencia', key: 'ev', width: 22 }, { header: 'Conformidad', key: 'conf', width: 13 }, { header: 'Fotos', key: 'fotos', width: 7 },
      ] }])
    }
    const fotosVersion = fotos.filter((x) => ((d.p?.evidencias ?? []) as string[]).includes(x.id))
    if (d.tipo === 'Manifiesto') {
      const { oficiales, adicionales, faltan } = fotosOficiales(item.item_number, fotosVersion)
      const csv = ['archivo,fase,captura,carga,origen,version', ...oficiales.map((o) => `${o.nombre},${o.fase},${o.foto.taken_at ?? ''},${(o.foto as any).cargada_at ?? ''},${(o.foto as any).origen_captura ?? ''},v${d.version}`),
        ...adicionales.map((a) => `ADICIONAL,${a.phase ?? 'general'},${a.taken_at ?? ''},,,v${d.version}`), ...faltan.map((x) => `FALTA,${x},,,,v${d.version}`)].join('\n')
      return new Blob([csv], { type: 'text/csv' })
    }
    if (d.tipo === 'Historial') {
      return pdfBlob({ ...meta, titulo: `Historial de revisión · ${meta.titulo}` },
        [{ header: 'Fecha', key: 'fecha', width: 32 }, { header: 'Usuario', key: 'quien', width: 38 }, { header: 'Origen', key: 'entidad', width: 22 }, { header: 'Evento', key: 'detalle' }, { header: 'Versión', key: 'version', width: 18 }],
        historial.filter((h) => !h.version || h.version <= d.version).map((h) => ({ fecha: fmtDateTime(h.cuando), quien: h.quien ?? '—', entidad: h.entidad ?? 'SERVICON', detalle: h.detalle, version: h.version ? `v${h.version}` : '—' })),
        { cover: false })
    }
    const { oficiales } = fotosOficiales(item.item_number, fotosVersion)
    return pdfBlob({ ...meta, titulo: `Panel fotográfico · ${meta.titulo} · v${d.version}` },
      [{ header: 'Archivo', key: 'archivo', width: 50 }, { header: 'Fase', key: 'fase', width: 25 }, { header: 'Captura', key: 'captura' }],
      oficiales.map((o) => ({ archivo: o.nombre, fase: FASES[o.fase], captura: fmtDateTime(o.foto.taken_at) })),
      { cover: false, fotos: oficiales.filter((o) => (o.foto as any).url).map((o) => ({ url: (o.foto as any).url, titulo: o.nombre, pie: `${FASES[o.fase]} · ${fmtDateTime(o.foto.taken_at)}` })) })
  }
  const descargar = async (d: Doc) => {
    setOcupado(d.id)
    try { guardarArchivo(await generar(d), d.nombre) } catch (e) { toast.error(mensajeAmigable(e, 'No se pudo generar el documento')) } finally { setOcupado(null) }
  }
  const abrir = async (d: Doc) => {
    setOcupado(d.id)
    try {
      const b = await generar(d)
      if (d.ext === 'pdf') { if (visor) URL.revokeObjectURL(visor.url); setVisor({ url: URL.createObjectURL(b), nombre: d.nombre, tipo: 'pdf' }) }
      else if (d.ext === 'csv') setVisor({ url: URL.createObjectURL(new Blob([await b.text()], { type: 'text/plain' })), nombre: d.nombre, tipo: 'csv' })
      else { guardarArchivo(b, d.nombre); toast.info('El Excel se abre con tu hoja de cálculo') }
    } catch (e) { toast.error(mensajeAmigable(e, 'No se pudo abrir el documento')) } finally { setOcupado(null) }
  }
  const descargarSeleccion = async () => {
    const elegidos = filas.filter((d) => sel.has(d.id))
    if (!elegidos.length) return
    setOcupado('zip')
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (const d of elegidos) zip.file(d.version > 1 && d.tipo !== 'Oficio' ? d.nombre.replace(/(\.\w+)$/, `_v${d.version}$1`) : d.nombre, await generar(d))
      guardarArchivo(await zip.generateAsync({ type: 'blob' }), `Documentos_PCI${corto}_ITEM_${item.item_number}.zip`)
    } catch (e) { toast.error(mensajeAmigable(e, 'No se pudo armar la selección')) } finally { setOcupado(null) }
  }
  const todasMarcadas = filas.length > 0 && filas.every((d) => sel.has(d.id))
  const versionesDe = actual ? docs.filter((d) => d.tipo === actual.tipo && (d.parteId ?? '') === (actual.parteId ?? '')).sort((a, b) => b.version - a.version) : []
  const Icono = (d: Doc) => (d.ext === 'xlsx' || d.ext === 'csv' ? <FileSpreadsheet className="text-success size-4" /> : <FileText className="text-destructive size-4" />)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px]">Documentos publicados · Ítem {item.item_number}</CardTitle>
          <CardDescription className="bg-info/8 text-info rounded-md px-2 py-1"><Info className="mr-1 inline size-3.5" />{esVisor ? 'Sólo documentos autorizados para COVINCA.' : 'Generados de la misma intervención para cada versión publicada.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <div className="relative min-w-44 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar documento" className="h-9 pl-8" /></div>
            <label className="flex items-center gap-1">Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className="bg-card h-9 rounded-md border border-border px-2">
              <option value="">Todos</option>{[...new Set(docs.map((d) => d.tipo))].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="flex items-center gap-1">Versión<select value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} className="bg-card h-9 rounded-md border border-border px-2">
              <option value="vigente">Vigente</option><option value="todas">Todas</option>{[...new Set(docs.map((d) => d.version))].sort().map((v) => <option key={v} value={String(v)}>v{v}</option>)}</select></label>
            <label className="flex items-center gap-1"><CalendarDays className="size-4" /><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="h-9 w-36" />–<Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} className="h-9 w-36" /></label>
            <Button variant="outline" onClick={descargarSeleccion} disabled={!sel.size} loading={ocupado === 'zip'}><Download className="size-4" />Descargar selección{sel.size ? ` (${sel.size})` : ''}</Button>
          </div>
          {extra.isLoading ? <p className="text-muted-foreground text-[13px]">Cargando documentos…</p> : filas.length === 0 ? (
            <p className="text-muted-foreground py-4 text-[13px]">{docs.length ? 'Sin documentos con estos filtros.' : 'Aún no hay documentos publicados de este ítem.'}</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
              <thead className="bg-secondary/50 text-left"><tr>
                <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="Seleccionar todo" checked={todasMarcadas} onChange={() => setSel(todasMarcadas ? new Set() : new Set(filas.map((d) => d.id)))} /></th>
                <th className="px-2 font-semibold">Documento</th><th className="px-2 font-semibold">Tipo</th><th className="px-2 font-semibold">Versión</th>
                <th className="px-2 font-semibold">Publicación</th><th className="px-2 font-semibold">Publicado por</th><th className="px-2 text-right font-semibold">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {filas.map((d) => (
                  <tr key={d.id} onClick={() => setElegido(d.id)} className={cn('cursor-pointer', actual?.id === d.id && 'bg-primary/[0.07] font-semibold outline outline-1 outline-primary/40')}>
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(d.id)} onChange={() => { const n = new Set(sel); n.has(d.id) ? n.delete(d.id) : n.add(d.id); setSel(n) }} aria-label="Seleccionar" /></td>
                    <td className="px-2"><span className="flex items-center gap-1.5">{Icono(d)}{d.nombre}</span></td><td className="px-2">{d.tipo}</td><td className="px-2">v{d.version}</td>
                    <td className="px-2">{fmtDate(d.fecha)}</td><td className="px-2">{d.por.split(' · ')[0]}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => abrir(d)} loading={ocupado === d.id}><Eye className="size-3.5" />Ver</Button>{' '}
                      <Button size="sm" variant="outline" onClick={() => descargar(d)}><Download className="size-3.5" />Descargar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="text-muted-foreground text-[11.5px]"><Info className="mr-1 inline size-3.5" />Los documentos se consultan por versión; {esVisor ? 'no se editan desde el rol cliente.' : 'no se editan desde aquí.'}</p>
        </CardContent>
      </Card>
      {actual && (
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-[14px]">Documento seleccionado</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-[12.5px]">
            <p className="flex items-center gap-2 font-semibold">{Icono(actual)}{actual.nombre}</p>
            <p><Layers className="mr-1 inline size-3.5" />Publicación: v{actual.version}</p>
            <p><CalendarDays className="mr-1 inline size-3.5" />Fecha: {fmtDate(actual.fecha)}</p>
            <p><User className="mr-1 inline size-3.5" />Publicado por: {actual.por}</p>
            <Button className="w-full" onClick={() => abrir(actual)} loading={ocupado === actual.id}><ExternalLink className="size-4" />Abrir visor</Button>
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => descargar(actual)}><Download className="size-4" />Descargar</Button>
              <Button variant="outline" className="flex-1" onClick={() => setVerHist(!verHist)}><History className="size-4" />Ver historial</Button></div>
            <p className="pt-2 font-semibold">Historial de versiones</p>
            <div className={cn('space-y-1.5', !verHist && 'max-h-64 overflow-y-auto')}>
              {versionesDe.map((d, k) => (
                <div key={d.id} className={cn('rounded-md border px-2.5 py-1.5', k === 0 ? 'border-success/40 bg-success/[0.07]' : 'border-info/30 bg-info/[0.05]')}>
                  <strong>● v{d.version} · {fmtDate(d.fecha)}</strong>
                  <p className="text-muted-foreground">{d.nota ?? d.p?.nota ?? (d.version === 1 ? 'Publicado' : 'Nueva versión publicada')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Dialog open={!!visor} onOpenChange={(o) => { if (!o && visor) { URL.revokeObjectURL(visor.url); setVisor(null) } }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{visor?.nombre}</DialogTitle><DialogDescription>Consulta por versión; no se edita.</DialogDescription></DialogHeader>
          {visor && <iframe src={visor.url} title={visor.nombre} className="h-[70vh] w-full rounded-lg border border-border bg-white" />}
          <div className="flex justify-end"><Button variant="outline" onClick={() => { if (visor) { URL.revokeObjectURL(visor.url); setVisor(null) } }}><X className="size-4" />Cerrar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
