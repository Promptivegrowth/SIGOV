'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, Layers, MapPin, Camera, ArrowRight, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { useCuadrillasDelAlcance } from '@/lib/hooks/use-cuadrillas-alcance'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtNumber, fmtProgresiva, toISODate, addDays } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Niveles de servicio (guía 9.8): explorar lo ejecutado por Sector >
 * Actividad > Fecha > intervención, con su evidencia y su reporte diario.
 * Es consulta de las mismas intervenciones (al Visor, las publicadas): no
 * es otra captura ni otro conteo; si una intervención también atiende un
 * PCI, apunta al mismo registro.
 */
export function NivelesClient() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const f = {
    desde: sp.get('desde') ?? toISODate(addDays(new Date(), -30)), hasta: sp.get('hasta') ?? toISODate(new Date()),
    sector: sp.get('sector') ?? '', act: sp.get('act') ?? '', crew: sp.get('crew') ?? '', q: sp.get('q') ?? '',
  }
  const fijar = (c: Partial<typeof f>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(c)) { if (v) n.set(k, v); else n.delete(k) }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const [q, setQ] = React.useState(f.q)
  React.useEffect(() => { const t = setTimeout(() => q !== f.q && fijar({ q }), 400); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const cuadrillas = useCuadrillasDelAlcance('id, code, name')
  const datos = useQuery({
    queryKey: ['ns', service.id, f],
    queryFn: async () => {
      const { data, error } = await sb.rpc('niveles_servicio', {
        p_service: service.id, p_desde: f.desde, p_hasta: f.hasta, p_sector: f.sector || null,
        p_activity: f.act || null, p_crew: f.crew || null, p_q: f.q || null,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const d = datos.data
  // Selección y descarga (guía 9.8: «Descargar selección»), y fotos de cada intervención
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  React.useEffect(() => { setSel(new Set()) }, [datos.data])
  const [bajando, setBajando] = React.useState(false)
  const [fotosDe, setFotosDe] = React.useState<any | null>(null)
  const fotos = useQuery({
    queryKey: ['ns-fotos', fotosDe?.id], enabled: !!fotosDe,
    queryFn: async () => {
      const { data } = await sb.from('evidences').select('id, phase, storage_path, thumb_path, master_path, taken_at').eq('work_entry_id', fotosDe.id).is('deleted_at', null).order('taken_at')
      const lista = (data ?? []) as any[]
      const { data: f } = await sb.storage.from('evidencias').createSignedUrls(lista.map((x) => x.thumb_path ?? x.storage_path), 3600)
      const { data: o } = await sb.storage.from('evidencias').createSignedUrls(lista.map((x) => x.master_path ?? x.storage_path), 3600)
      return lista.map((x, i) => ({ ...x, mini: f?.[i]?.signedUrl, original: o?.[i]?.signedUrl }))
    },
  })
  const estadoTxt = (x: any) => x.publicado ? 'Publicado a COVINCA' : x.estado === 'validado' ? 'Validado SERVICON' : x.estado === 'enviado' ? 'Por validar' : x.estado === 'observado' ? 'Observado' : 'En borrador'
  const estadoTono = (x: any) => x.publicado ? 'info' : x.estado === 'validado' ? 'success' : x.estado === 'observado' ? 'destructive' : 'warning'
  const descargarSeleccion = async () => {
    const filas = ((d?.intervenciones ?? []) as any[]).filter((x) => sel.has(x.id))
    if (!filas.length) return
    setBajando(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const { data: ev } = await sb.from('evidences').select('id, work_entry_id, phase, storage_path, master_path, taken_at').in('work_entry_id', filas.map((x) => x.id)).is('deleted_at', null)
      const evs = (ev ?? []) as any[]
      const { data: urls } = await sb.storage.from('evidencias').createSignedUrls(evs.map((e) => e.master_path ?? e.storage_path), 3600)
      const n = { antes: 1, durante: 2, despues: 3 } as Record<string, number>
      await Promise.all(evs.map(async (e, i) => {
        const x = filas.find((f) => f.id === e.work_entry_id)
        const url = urls?.[i]?.signedUrl
        if (!x || !url) return
        const blob = await (await fetch(url)).blob()
        const ext = (e.master_path ?? e.storage_path).split('.').pop()
        zip.file(`${x.fecha}_${x.codigo}_${fmtProgresiva(x.prog_inicio).replace('+', '-')}/${x.codigo}(${n[e.phase] ?? 'G'})_${e.id.slice(0, 6)}.${ext}`, blob)
      }))
      const csv = ['Fecha;Sector;Código;Actividad;Progresiva;Metrado;Unidad;Cuadrilla;Fotos;Estado',
        ...filas.map((x) => [x.fecha, x.sector ?? '', x.codigo, x.actividad, `${fmtProgresiva(x.prog_inicio)}${x.prog_fin && x.prog_fin !== x.prog_inicio ? ' - ' + fmtProgresiva(x.prog_fin) : ''}`,
          String(x.metrado).replace('.', ','), x.unidad ?? '', x.cuadrilla ?? '', x.fotos, estadoTxt(x)].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
      zip.file('listado.csv', '\ufeff' + csv)
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Niveles_de_servicio_${f.desde}_${f.hasta}.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
      toast.success(`Descargadas ${filas.length} intervenciones`, { description: `${evs.length} fotos originales y el listado.` })
    } catch (e) { toast.error(mensajeAmigable(e, 'No se pudo preparar la descarga')) } finally { setBajando(false) }
  }
  return (
    <>
      <PageHeader title="Niveles de servicio" description="Sector › Actividad › Fecha › intervención, con su evidencia y reporte diario." />
      <PageBody className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-60 flex-[2]">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, actividad o cuadrilla" className="pl-8" />
            </div>
            <label className="text-[11px]"><span className="text-muted-foreground">Desde</span><Input type="date" value={f.desde} onChange={(e) => fijar({ desde: e.target.value })} className="h-9" /></label>
            <label className="text-[11px]"><span className="text-muted-foreground">Hasta</span><Input type="date" value={f.hasta} onChange={(e) => fijar({ hasta: e.target.value })} className="h-9" /></label>
            <Select value={f.crew || '__t'} onValueChange={(v) => fijar({ crew: v === '__t' ? '' : v })}>
              <SelectTrigger className="h-9 min-w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__t">Cuadrilla: Todas</SelectItem>
                {(cuadrillas.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>
        {datos.error && <p className="text-destructive text-[13px]">No se pudo cargar: {mensajeAmigable(datos.error)}</p>}
        {datos.isLoading ? <SkeletonList rows={6} /> : d && (
          <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-[14px]">Sector</CardTitle></CardHeader>
                <CardContent className="space-y-1 p-3 pt-0">
                  <Opcion activa={!f.sector} onClick={() => fijar({ sector: '' })} texto="Todos" n={null} />
                  {(d.sectores as any[]).map((s) => (
                    <Opcion key={s.sector} activa={f.sector === s.sector} onClick={() => fijar({ sector: s.sector })}
                      texto={s.sector === 'Sin sector' ? 'Sin sector' : `Sector ${s.sector}`} n={s.intervenciones} />
                  ))}
                  {/* VIS-02: el sector sale del subtramo y la progresiva (catálogo aprobado); lo que no encaja se explica, no se asigna */}
                  {((d as any).sin_sector ?? []).length > 0 && (
                    <div className="text-muted-foreground border-t border-border pt-2 text-[11.5px]">
                      <p className="font-medium">Por qué hay «Sin sector»:</p>
                      {((d as any).sin_sector as any[]).map((z) => <p key={z.motivo}>· {z.motivo}: {fmtNumber(z.intervenciones)}</p>)}
                      <p className="mt-1">No se asignan por suposición: corrige la progresiva o el subtramo en el parte de origen.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-[14px]">Actividad</CardTitle></CardHeader>
                <CardContent className="space-y-1 p-3 pt-0">
                  <Opcion activa={!f.act} onClick={() => fijar({ act: '' })} texto="Todas" n={null} />
                  {(d.actividades as any[]).map((a) => (
                    <Opcion key={a.activity_id} activa={f.act === a.activity_id} onClick={() => fijar({ act: a.activity_id })}
                      texto={`${a.codigo} · ${a.actividad}`} n={a.intervenciones} detalle={`${fmtNumber(Number(a.metrado), 2)} ${a.unidad ?? ''}`} />
                  ))}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-[14px]">Intervenciones</CardTitle>
                <CardDescription className="flex flex-wrap items-center justify-between gap-2">{fmtNumber((d.intervenciones as any[]).length)} en el filtro (hasta 300 más recientes).
                  <Button size="sm" variant="outline" onClick={descargarSeleccion} loading={bajando} disabled={!sel.size}><Download className="size-3.5" />Descargar selección{sel.size ? ` (${sel.size})` : ''}</Button></CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {(d.intervenciones as any[]).length === 0 ? <p className="text-muted-foreground px-4 pb-6 text-[13px]">Sin registros.</p> : (
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-secondary/50 text-muted-foreground text-[11.5px]"><tr>
                      <th className="w-8 pl-3"><input type="checkbox" aria-label="Seleccionar todas" checked={sel.size > 0 && sel.size === (d.intervenciones as any[]).length}
                        onChange={(e) => setSel(e.target.checked ? new Set((d.intervenciones as any[]).map((x) => x.id)) : new Set())} /></th>
                      <th className="px-3 py-2 text-left font-medium">Fecha</th><th className="text-left font-medium">Sector</th>
                      <th className="text-left font-medium">Actividad</th><th className="text-left font-medium">Progresiva</th>
                      <th className="text-right font-medium">Metrado</th><th className="text-left font-medium">Cuadrilla</th>
                      <th className="text-center font-medium">Fotos</th><th className="text-left font-medium">Estado de revisión</th><th />
                    </tr></thead>
                    <tbody>
                      {(d.intervenciones as any[]).map((x) => (
                        <tr key={x.id} className="border-t border-border">
                          <td className="pl-3"><input type="checkbox" aria-label="Seleccionar intervención" checked={sel.has(x.id)} onChange={(e) => setSel((s0) => { const n = new Set(s0); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n })} /></td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(x.fecha)}</td>
                          <td>{x.sector ?? <span className="text-warning cursor-help" title={x.sector_motivo ?? 'Sin sector'}>Sin sector</span>}{!x.sector && x.sector_motivo && <span className="text-muted-foreground block max-w-48 text-[10.5px] leading-tight">{x.sector_motivo}</span>}</td>
                          <td><strong>{x.codigo}</strong> · {x.actividad}{x.pci_item_id && <Badge variant="info" className="ml-1">PCI</Badge>}</td>
                          <td className="whitespace-nowrap"><MapPin className="mr-1 inline size-3" />{fmtProgresiva(x.prog_inicio)}{x.prog_fin && x.prog_fin !== x.prog_inicio ? ` – ${fmtProgresiva(x.prog_fin)}` : ''}</td>
                          <td className="text-right tabular-nums">{fmtNumber(Number(x.metrado), 2)} {x.unidad}</td>
                          <td>{x.cuadrilla}</td>
                          <td className="text-center"><button disabled={!x.fotos} onClick={() => setFotosDe(x)} className="text-primary disabled:text-muted-foreground inline-flex items-center gap-1"><Camera className="size-3" />{x.fotos}</button></td>
                          <td><Badge variant={estadoTono(x) as any}>{estadoTxt(x)}</Badge></td>
                          <td className="pr-3 text-right"><Link className="text-primary inline-flex items-center gap-1" href={`/campo/${x.work_order_id}`}>Reporte<ArrowRight className="size-3" /></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        <Dialog open={!!fotosDe} onOpenChange={(o) => !o && setFotosDe(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Fotos · {fotosDe?.codigo} · {fotosDe ? fmtDate(fotosDe.fecha) : ''}</DialogTitle>
              <DialogDescription>{fotosDe?.actividad} · {fotosDe?.cuadrilla}. Pulsa una foto para abrir el original.</DialogDescription></DialogHeader>
            {fotos.isLoading ? <SkeletonList rows={2} /> : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(fotos.data ?? []).map((x: any) => (
                  <a key={x.id} href={x.original} target="_blank" rel="noopener" className="space-y-1 text-[11.5px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.mini} alt="" className="bg-muted aspect-square w-full rounded-md object-cover" />
                    <span className="block capitalize">{x.phase ?? 'general'}{x.taken_at ? ` · ${fmtDate(x.taken_at)}` : ''}</span>
                  </a>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  )
}

function Opcion({ activa, onClick, texto, n, detalle }: { activa: boolean; onClick: () => void; texto: string; n: number | null; detalle?: string }) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px]', activa ? 'bg-primary/[0.09] text-primary font-semibold' : 'hover:bg-secondary')}>
      <span className="min-w-0 flex-1 truncate"><Layers className="mr-1 inline size-3" />{texto}{detalle && <span className="text-muted-foreground block pl-4 text-[11px] font-normal">{detalle}</span>}</span>
      {n != null && <span className="text-muted-foreground tabular-nums">{n}</span>}
    </button>
  )
}
