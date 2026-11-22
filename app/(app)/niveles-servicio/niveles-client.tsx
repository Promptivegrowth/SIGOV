'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Search, Layers, MapPin, Camera, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
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

  const cuadrillas = useQuery({
    queryKey: ['ns-crews', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
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
                    <Opcion key={s.sector} activa={f.sector === s.sector} onClick={() => fijar({ sector: s.sector === 'Sin sector' ? '' : s.sector })}
                      texto={s.sector === 'Sin sector' ? 'Sin sector' : `Sector ${s.sector}`} n={s.intervenciones} />
                  ))}
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
                <CardDescription>{fmtNumber((d.intervenciones as any[]).length)} en el filtro (hasta 300 más recientes).</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {(d.intervenciones as any[]).length === 0 ? <p className="text-muted-foreground px-4 pb-6 text-[13px]">Sin registros.</p> : (
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-secondary/50 text-muted-foreground text-[11.5px]"><tr>
                      <th className="px-3 py-2 text-left font-medium">Fecha</th><th className="text-left font-medium">Sector</th>
                      <th className="text-left font-medium">Actividad</th><th className="text-left font-medium">Progresiva</th>
                      <th className="text-right font-medium">Metrado</th><th className="text-left font-medium">Cuadrilla</th>
                      <th className="text-center font-medium">Fotos</th><th />
                    </tr></thead>
                    <tbody>
                      {(d.intervenciones as any[]).map((x) => (
                        <tr key={x.id} className="border-t border-border">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(x.fecha)}</td>
                          <td>{x.sector ?? '—'}</td>
                          <td><strong>{x.codigo}</strong> · {x.actividad}{x.pci_item_id && <Badge variant="info" className="ml-1">PCI</Badge>}</td>
                          <td className="whitespace-nowrap"><MapPin className="mr-1 inline size-3" />{fmtProgresiva(x.prog_inicio)}{x.prog_fin && x.prog_fin !== x.prog_inicio ? ` – ${fmtProgresiva(x.prog_fin)}` : ''}</td>
                          <td className="text-right tabular-nums">{fmtNumber(Number(x.metrado), 2)} {x.unidad}</td>
                          <td>{x.cuadrilla}</td>
                          <td className="text-center"><Camera className="mr-1 inline size-3" />{x.fotos}</td>
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
