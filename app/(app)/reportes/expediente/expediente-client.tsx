'use client'

import { SiPuede } from '@/components/shared/si-puede'
import * as React from 'react'
import Link from 'next/link'
import { MenuFila } from '@/components/shared/menu-fila'
import { useQuery } from '@tanstack/react-query'
import { Search, Layers, Image as ImageIcon, AlertCircle, Eye, Download, FolderOpen, Info, FileSpreadsheet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, fmtNumber, fmtProgresiva } from '@/lib/utils'
import { fotosOficiales, aJpegReal } from '@/lib/fotos-oficiales'
import { reportePdf, nombreCliente, type ReportMeta } from '@/lib/reports'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Exportar expediente» (maquetas V04/V08; guía 9.9 y decisión n.º 3).
 *
 * Exactamente lo seleccionado: PCI_<n>/PLAZO_<n>_DIAS/ITEM_<n>/ con las fotos
 * oficiales ITEM_<n>(1).jpg, (2), (3) y las Después adicionales (3)_A y
 * (3)_B, en JPEG real; manifiesto con los faltantes (no se rellenan fotos);
 * Excel con la foto anclada a su fila; PDF y panel fotográfico; mapa solo
 * si hay coordenadas. Los filtros se aplican al paquete y al reporte. Al
 * Visor solo le llega lo publicado (lo recorta la base).
 */
type Fila = {
  id: string; pci_id: string; pci_code: string; item_number: number; term_days: number; due_date: string
  activity_name: string | null; prog_start_m: number | null; prog_end_m: number | null; crew_name: string | null
  status: string; fotos: any[]; observado: boolean
}
const corto = (c: string) => String(c).replace(/^PCI-\d{4}-0*/, '')

export function ExpedienteClient() {
  const { service, profile, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [pci, setPci] = React.useState('')
  const [plazo, setPlazo] = React.useState('')
  const [crew, setCrew] = React.useState('')
  const [estado, setEstado] = React.useState('')
  const [q, setQ] = React.useState('')
  // Desde / Hasta (V04/V08): por fecha de vencimiento del ítem
  const [desde, setDesde] = React.useState('')
  const [hasta, setHasta] = React.useState('')
  // SUP-03: se guardan las exclusiones del usuario; buscar o filtrar no reactiva lo que desmarcó
  const [excl, setExcl] = React.useState<Set<string>>(new Set())
  const alternar = (id: string, incluir: boolean) => setExcl((x) => { const n = new Set(x); if (incluir) n.delete(id); else n.add(id); return n })
  const [formatos, setFormatos] = React.useState({ excel: true, pdf: true, panel: true, jpg: true, mapa: false })
  const [historial, setHistorial] = React.useState(true)
  const [previa, setPrevia] = React.useState(false)
  const [estadoPaquete, setEstadoPaquete] = React.useState<'' | 'En preparación' | 'Listo' | 'Error'>('')

  const pcis = useQuery({
    queryKey: ['exp-pcis', service.id],
    queryFn: async () => ((await sb.from('pcis').select('id, code').eq('service_id', service.id).is('deleted_at', null).order('code', { ascending: false })).data ?? []) as any[],
  })
  React.useEffect(() => { if (!pci && pcis.data?.[0]) setPci(pcis.data[0].id) }, [pcis.data, pci])

  const items = useQuery({
    queryKey: ['exp-items', pci],
    enabled: !!pci,
    queryFn: async () => {
      const { data: its } = await sb.from('v_pci_items')
        .select('id, pci_id, pci_code, item_number, term_days, due_date, activity_name, prog_start_m, prog_end_m, crew_name, status, assigned_crew_id')
        .eq('pci_id', pci).order('item_number')
      const { data: ev } = await sb.from('v_evidences')
        .select('id, pci_item_id, phase, storage_path, master_path, thumb_path, taken_at, created_at, lat, lng, origen_captura')
        .eq('pci_id', pci).or('autorizacion_pendiente.is.null,autorizacion_pendiente.eq.false')
      const { data: obs } = await sb.from('revision_observaciones').select('pci_item_id, estado').eq('pci_id', pci).neq('estado', 'cerrada')
      const abiertas = new Set((obs ?? []).map((o: any) => o.pci_item_id))
      const porItem = new Map<string, any[]>()
      for (const e of (ev ?? []) as any[]) porItem.set(e.pci_item_id, [...(porItem.get(e.pci_item_id) ?? []), e])
      return ((its ?? []) as any[]).map((i) => ({ ...i, fotos: porItem.get(i.id) ?? [], observado: abiertas.has(i.id) || i.status === 'observado' })) as Fila[]
    },
  })
  const plazos = [...new Set((items.data ?? []).map((i) => i.term_days))].sort((a, b) => a - b)
  const cuadrillas = [...new Set((items.data ?? []).map((i) => i.crew_name).filter(Boolean))] as string[]

  const visibles = (items.data ?? []).filter((i) => {
    if (plazo && String(i.term_days) !== plazo) return false
    if (desde && String(i.due_date) < desde) return false
    if (hasta && String(i.due_date) > hasta) return false
    if (crew && i.crew_name !== crew) return false
    if (q && !String(i.item_number).includes(q.trim())) return false
    const { faltan } = fotosOficiales(i.item_number, i.fotos)
    if (estado === 'completo' && faltan.length) return false
    if (estado === 'incompleto' && !faltan.length) return false
    if (estado === 'observado' && !i.observado) return false
    // Los ítems sin fotos también van: salen como incompletos en el manifiesto de faltantes
    return true
  })
  React.useEffect(() => { setExcl(new Set()) }, [pci]) // otro PCI: selección nueva
  const sel = new Set(visibles.filter((i) => !excl.has(i.id)).map((i) => i.id))
  const elegidos = visibles.filter((i) => sel.has(i.id))
  const totalFotos = elegidos.reduce((s, i) => s + i.fotos.length, 0)
  const conFaltantes = elegidos.filter((i) => fotosOficiales(i.item_number, i.fotos).faltan.length > 0).length
  const soloObservados = elegidos.filter((i) => i.observado).length
  const observados = elegidos.filter((i) => i.observado || fotosOficiales(i.item_number, i.fotos).faltan.length > 0).length
  const conCoordenadas = elegidos.some((i) => i.fotos.some((f) => f.lat != null && f.lng != null))
  const carpeta = (i: Fila) => `PCI_${corto(i.pci_code)}/PLAZO_${i.term_days}_DIAS/ITEM_${i.item_number}`

  const archivos = () => {
    const lista: string[] = []
    for (const i of elegidos) {
      if (formatos.jpg) for (const o of fotosOficiales(i.item_number, i.fotos).oficiales) lista.push(`${carpeta(i)}/${o.nombre}`)
    }
    const base = `PCI_${corto(elegidos[0]?.pci_code ?? '')}`
    if (elegidos.length) lista.push(`${base}/MANIFIESTO.csv`)
    if (formatos.excel) lista.push(`${base}/SEGUIMIENTO_${base}.xlsx`)
    if (formatos.pdf) lista.push(`${base}/REPORTE_${base}.pdf`)
    if (formatos.panel) lista.push(`${base}/PANEL_FOTOGRAFICO_${base}.pdf`)
    if (formatos.mapa && conCoordenadas) lista.push(`${base}/MAPA_${base}.geojson`)
    if (historial) lista.push(`${base}/HISTORIAL_REVISIONES.csv`)
    return lista
  }

  const meta = (): ReportMeta => ({
    titulo: `Expediente PCI ${corto(elegidos[0]?.pci_code ?? '')}`, servicio: service.name,
    cliente: nombreCliente((service as any).client_name), periodo: `Al ${fmtDate(new Date())}`, generadoPor: profile.full_name,
    filtros: [plazo && `Plazo ${plazo} días`, crew && `Cuadrilla ${crew}`, estado && `Estado ${estado}`].filter(Boolean).join(' · ') || undefined,
    registros: elegidos.length,
  })

  const generar = async () => {
    if (!elegidos.length) { toast.info('Selecciona al menos un ítem'); return }
    setEstadoPaquete('En preparación')
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const base = `PCI_${corto(elegidos[0].pci_code)}`
      const manifiesto = ['carpeta,archivo,fase,captura,origen,estado']
      const urlsDespues: (string | null)[] = []
      for (const i of elegidos) {
        const { oficiales, faltan } = fotosOficiales(i.item_number, i.fotos)
        for (const o of oficiales) {
          if (formatos.jpg) {
            const { data } = await sb.storage.from('evidencias').download(o.foto.master_path ?? o.foto.storage_path)
            if (data) zip.file(`${carpeta(i)}/${o.nombre}`, await aJpegReal(data))
          }
          manifiesto.push(`${carpeta(i)},${o.nombre},${o.fase},${o.foto.taken_at ?? ''},${o.foto.origen_captura ?? 'camara_sigov'},incluida`)
        }
        for (const f of faltan) manifiesto.push(`${carpeta(i)},,${f},,,FALTA`)
        const despues = oficiales.find((o) => o.fase === 3)
        if (despues) {
          const { data: s } = await sb.storage.from('evidencias').createSignedUrl(despues.foto.thumb_path ?? despues.foto.storage_path, 3600)
          urlsDespues.push(s?.signedUrl ?? null)
        } else urlsDespues.push(null)
      }
      zip.file(`${base}/MANIFIESTO.csv`, manifiesto.join('\n'))
      const filas = elegidos.map((i) => {
        const { faltan } = fotosOficiales(i.item_number, i.fotos)
        return { pci: corto(i.pci_code), item: i.item_number, plazo: `${i.term_days} días`, vence: fmtDate(i.due_date), actividad: i.activity_name ?? '',
          progresiva: `${fmtProgresiva(i.prog_start_m)}${i.prog_end_m && i.prog_end_m !== i.prog_start_m ? ` – ${fmtProgresiva(i.prog_end_m)}` : ''}`,
          cuadrilla: i.crew_name ?? '', evidencia: faltan.length ? `Falta ${faltan.join(', ')}` : 'Completo', fotos: i.fotos.length, foto: '' }
      })
      const cols = [
        { header: 'PCI', key: 'pci', width: 8 }, { header: 'Ítem', key: 'item', width: 8 }, { header: 'Plazo', key: 'plazo', width: 10 },
        { header: 'Vence', key: 'vence', width: 12 }, { header: 'Actividad', key: 'actividad', width: 34 }, { header: 'Progresiva', key: 'progresiva', width: 20 },
        { header: 'Cuadrilla', key: 'cuadrilla', width: 16 }, { header: 'Evidencia', key: 'evidencia', width: 22 }, { header: 'Fotos', key: 'fotos', width: 8 },
      ]
      if (formatos.excel) {
        const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
        const wb = new (ExcelJS as any).Workbook()
        const ws = wb.addWorksheet('Expediente', { views: [{ state: 'frozen', ySplit: 1 }] })
        ws.columns = [...cols, { header: 'Foto Después', key: 'foto', width: 22 }]
        ws.getRow(1).font = { bold: true }
        filas.forEach((f) => ws.addRow(f))
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length + 1 } }
        for (let k = 0; k < urlsDespues.length; k++) {
          const u = urlsDespues[k]
          if (!u) continue
          const blob = await fetch(u).then((r) => r.blob()).catch(() => null)
          if (!blob) continue
          const jpg = await aJpegReal(blob)
          const b64 = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(jpg) })
          ws.getRow(k + 2).height = 70
          const id = wb.addImage({ base64: b64, extension: 'jpeg' })
          // Anclada a su celda: se oculta y se mueve con la fila al filtrar u ordenar
          ws.addImage(id, { tl: { col: cols.length + 0.05, row: k + 1 + 0.05 }, br: { col: cols.length + 0.95, row: k + 1 + 0.95 }, editAs: 'twoCell' })
        }
        zip.file(`${base}/SEGUIMIENTO_${base}.xlsx`, await wb.xlsx.writeBuffer())
      }
      if (formatos.pdf) {
        const doc = await reportePdf(meta(), cols.map((c) => ({ header: c.header, key: c.key })), filas, { cover: false, landscape: true,
          intro: 'Atendido no equivale a expediente completo ni a conformidad del cliente. Los faltantes constan en el manifiesto.' })
        zip.file(`${base}/REPORTE_${base}.pdf`, doc.output('arraybuffer'))
      }
      if (formatos.panel) {
        const fotosPanel: { url: string; titulo: string; pie: string }[] = []
        for (const i of elegidos) {
          for (const o of fotosOficiales(i.item_number, i.fotos).oficiales) {
            const { data: s } = await sb.storage.from('evidencias').createSignedUrl(o.foto.storage_path, 3600)
            if (s?.signedUrl) fotosPanel.push({ url: s.signedUrl, titulo: o.nombre, pie: `Ítem ${i.item_number} · captura ${fmtDateTime(o.foto.taken_at)}` })
          }
        }
        const doc = await reportePdf({ ...meta(), titulo: `Panel fotográfico · ${base}` }, [{ header: 'Ítem', key: 'item' }, { header: 'Evidencia', key: 'evidencia' }],
          filas.map((f) => ({ item: f.item, evidencia: f.evidencia })), { cover: false, fotos: fotosPanel })
        zip.file(`${base}/PANEL_FOTOGRAFICO_${base}.pdf`, doc.output('arraybuffer'))
      }
      if (formatos.mapa && conCoordenadas) {
        const features = elegidos.flatMap((i) => i.fotos.filter((f) => f.lat != null).map((f) => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
          properties: { pci: corto(i.pci_code), item: i.item_number, fase: f.phase, captura: f.taken_at } })))
        zip.file(`${base}/MAPA_${base}.geojson`, JSON.stringify({ type: 'FeatureCollection', features }))
      }
      if (historial) {
        const lineas = ['item,fecha,usuario,origen,evento,version']
        for (const i of elegidos) {
          const { data } = await sb.rpc('pci_item_historial', { p_item: i.id })
          for (const h of (data ?? []) as any[]) lineas.push(`${i.item_number},${h.cuando},"${h.quien ?? ''}",${h.entidad ?? ''},"${String(h.detalle).replace(/"/g, "'")}",${h.version ?? ''}`)
        }
        zip.file(`${base}/HISTORIAL_REVISIONES.csv`, lineas.join('\n'))
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `EXPEDIENTE_${base}${plazo ? `_PLAZO_${plazo}_DIAS` : ''}.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      setEstadoPaquete('Listo')
    } catch (e) {
      setEstadoPaquete('Error')
      toast.error(mensajeAmigable(e, 'No se pudo generar el paquete; reintenta'))
    }
  }

  const casilla = (k: keyof typeof formatos, t: string, deshabilitado?: string) => (
    <label className={cn('flex items-center gap-2 text-[13px]', deshabilitado && 'text-muted-foreground')}>
      <input type="checkbox" checked={formatos[k] && !deshabilitado} disabled={!!deshabilitado} onChange={(e) => setFormatos((x) => ({ ...x, [k]: e.target.checked }))} />
      {t}{deshabilitado && <span className="text-[11.5px]">({deshabilitado})</span>}
    </label>
  )

  return (
    <>
      <PageHeader title="Exportar expediente" description={`${pcis.data?.find((p) => p.id === pci)?.code ?? 'PCI'}${plazo ? ` / Plazo ${plazo} días` : ''}`} />
      <PageBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[[elegidos.length, `Ítems seleccionados de ${fmtNumber(visibles.length)} en el filtro`, Layers, 'text-primary'], [totalFotos, 'Fotos', ImageIcon, 'text-success'],
            [conFaltantes, 'Con fases faltantes (no son observaciones)', AlertCircle, 'text-violet-600'], [soloObservados, 'Observados (SERVICON o COVINCA)', AlertCircle, 'text-destructive']].map(([v, t, I, c]: any) => (
            <div key={t} className="bg-card flex items-center gap-3 rounded-xl border border-border p-4"><I className={cn('size-6', c)} />
              <span><strong className="block text-[22px] tabular-nums">{fmtNumber(v)}</strong><span className="text-muted-foreground text-[12.5px]">{t}</span></span></div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={pci} onValueChange={setPci}><SelectTrigger className="h-9"><SelectValue placeholder="PCI" /></SelectTrigger>
                  <SelectContent>{(pcis.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code}</SelectItem>)}</SelectContent></Select>
                <Select value={plazo || '__t'} onValueChange={(v) => setPlazo(v === '__t' ? '' : v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__t">Plazo: Todos</SelectItem>{plazos.map((p) => <SelectItem key={p} value={String(p)}>{p} {p === 1 ? 'día' : 'días'}</SelectItem>)}</SelectContent></Select>
                <Select value={crew || '__t'} onValueChange={(v) => setCrew(v === '__t' ? '' : v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__t">Cuadrilla: Todas</SelectItem>{cuadrillas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                <Select value={estado || '__t'} onValueChange={(v) => setEstado(v === '__t' ? '' : v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__t">Estado: Todos</SelectItem><SelectItem value="completo">Completo</SelectItem>
                    <SelectItem value="incompleto">Con faltantes</SelectItem><SelectItem value="observado">Observado</SelectItem></SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <label><span className="text-muted-foreground block">Desde</span><Input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className="h-9" /></label>
                <label><span className="text-muted-foreground block">Hasta</span><Input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className="h-9" /></label>
              </div>
              <div className="relative"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ítem..." className="pl-8" /></div>
              <div className="flex items-center justify-between text-[13px]">
                <strong>Selección de ítems</strong>
                <span className="flex items-center gap-3"><span className="text-muted-foreground">Total: {fmtNumber(totalFotos)} archivos</span>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={visibles.length > 0 && elegidos.length === visibles.length}
                    onChange={(e) => setExcl((x) => { const n = new Set(x); visibles.forEach((i) => (e.target.checked ? n.delete(i.id) : n.add(i.id))); return n })} />Seleccionar todos los del filtro</label></span>
              </div>
              {items.isLoading ? <SkeletonList rows={5} /> : visibles.length === 0 ? <p className="text-muted-foreground text-[13px]">{items.isError ? 'No se pudo cargar la lista de ítems; vuelve a intentarlo.' : 'Ningún ítem cumple este filtro (no es un error de carga).'}</p> : (
                <div className="max-h-[calc(var(--vh)_*_50)] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {visibles.map((i) => {
                    const { faltan } = fotosOficiales(i.item_number, i.fotos)
                    return (
                      <label key={i.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                        <input type="checkbox" checked={sel.has(i.id)} onChange={(e) => alternar(i.id, e.target.checked)} />
                        <strong className="w-12">{i.item_number}</strong>
                        <span className={cn('rounded-md px-2 py-0.5 text-[11.5px] font-semibold', faltan.length ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300' : 'bg-success/12 text-success')}>
                          {faltan.length ? `Falta ${faltan.join(', ')}` : 'Completo'}</span>
                        {i.observado && <span className="bg-destructive/10 text-destructive rounded-md px-2 py-0.5 text-[11.5px] font-semibold">Observado</span>}
                        <span className="text-muted-foreground ml-auto flex items-center gap-1"><ImageIcon className="size-3.5" />{i.fotos.length} fotos</span>
                        <Link href={`/pci/${i.pci_id}/item/${i.id}`} onClick={(e) => e.stopPropagation()}><Eye className="text-muted-foreground size-4" /></Link>
                        <span onClick={(e) => e.preventDefault()}><MenuFila opciones={[
                          { t: 'Ver ítem', href: `/pci/${i.pci_id}/item/${i.id}` },
                          { t: 'Ver evidencia', href: `/pci/${i.pci_id}/item/${i.id}?tab=evidencia` },
                          { t: 'Ver documentos', href: `/pci/${i.pci_id}/item/${i.id}?tab=documentos` },
                          { t: 'Historial del ítem', href: `/pci/${i.pci_id}/item/${i.id}?tab=historial` },
                          { t: sel.has(i.id) ? 'Quitar de la selección' : 'Agregar a la selección', onClick: () => alternar(i.id, !sel.has(i.id)) },
                        ]} /></span>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-[14px]">Formatos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {casilla('excel', 'Excel')}{casilla('pdf', 'PDF')}{casilla('panel', 'Panel fotográfico')}{casilla('jpg', 'Fotos JPG')}
                {casilla('mapa', 'Mapa', conCoordenadas ? undefined : 'Sin coordenadas')}
              </div>
              <p className="pt-1 text-[13px] font-semibold">Estructura de descarga</p>
              {elegidos[0] ? (
                <div className="bg-secondary/50 rounded-md px-3 py-2 font-mono text-[11.5px]">
                  <p className="flex items-center gap-1.5"><FolderOpen className="size-3.5" />{carpeta(elegidos[0])}</p>
                  {fotosOficiales(elegidos[0].item_number, elegidos[0].fotos).oficiales.map((o) => <p key={o.nombre} className="pl-5">{o.nombre}</p>)}
                </div>
              ) : <p className="text-muted-foreground text-[12.5px]">Selecciona ítems.</p>}
              {observados > 0 && (
                <p className="flex items-start gap-1.5 rounded-md bg-violet-500/[0.08] px-2.5 py-2 text-[12.5px] font-semibold text-violet-700 dark:text-violet-300">
                  <Info className="mt-0.5 size-3.5 shrink-0" />Se incluyen {observados} ítems observados o incompletos; los faltantes constan en el manifiesto.</p>
              )}
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={historial} onChange={(e) => setHistorial(e.target.checked)} />Incluir historial de revisiones</label>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setPrevia(true)} disabled={!elegidos.length}><Eye className="size-4" />Vista previa</Button>
                <SiPuede modulo="reportes" accion="exportar"><Button onClick={generar} loading={estadoPaquete === 'En preparación'} disabled={!elegidos.length}><Download className="size-4" />Generar paquete</Button></SiPuede>
              </div>
              {estadoPaquete && <p className={cn('text-[12.5px] font-medium', estadoPaquete === 'Error' ? 'text-destructive' : estadoPaquete === 'Listo' ? 'text-success' : 'text-info')}>
                Estado: {estadoPaquete}{estadoPaquete === 'Error' ? ' · puedes reintentar sin duplicar' : ''}</p>}
              <p className="text-muted-foreground text-[11.5px]">Los filtros se aplican al paquete y al reporte. {role === 'visor' ? 'Solo información publicada.' : ''}</p>
            </CardContent>
          </Card>
        </div>
      </PageBody>
      <Dialog open={previa} onOpenChange={setPrevia}>
        <DialogContent className="max-h-[calc(var(--vh)_*_80)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vista previa del paquete</DialogTitle>
            <DialogDescription>{elegidos.length} ítems · {archivos().length} archivos</DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-[12.5px] font-semibold">Ítems incluidos ({elegidos.length})</p>
            <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border text-[12px]">
              {elegidos.map((i) => {
                const { faltan } = fotosOficiales(i.item_number, i.fotos)
                return (
                  <p key={i.id} className="flex items-center gap-2 px-2 py-1">
                    <strong className="w-14">Ítem {i.item_number}</strong>
                    <span className={faltan.length ? 'text-violet-700 dark:text-violet-300' : 'text-success'}>{faltan.length ? `Falta ${faltan.join(', ')} (va en el manifiesto)` : 'Completo'}</span>
                    {i.observado && <span className="text-destructive">· Observado</span>}
                    <span className="text-muted-foreground ml-auto">{i.fotos.length} fotos</span>
                  </p>
                )
              })}
            </div>
          </div>
          <p className="text-[12.5px] font-semibold">Archivos que se generarán</p>
          <div className="font-mono text-[11.5px]">{archivos().map((a) => <p key={a} className="flex items-center gap-1.5">{a.endsWith('.xlsx') ? <FileSpreadsheet className="size-3" /> : null}{a}</p>)}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}
