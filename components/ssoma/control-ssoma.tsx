'use client'

import { SiPuede } from '@/components/shared/si-puede'
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, ClipboardCheck, FileText, TriangleAlert, Filter, Search, Plus, Download, Eye, Bell, RefreshCw, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, fmtNumber, toISODate, addDays } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { descargarExcel } from '@/lib/reports'
import { ChipSsoma, TipoInspeccion, TIPOS_INSPECCION } from './comun-ssoma'
import { DocumentosSsoma } from './documentos-ssoma'
import { HallazgosSsoma } from './hallazgos-ssoma'

/**
 * «Control SSOMA» (SSOMA_01/03): KPIs (cuadrillas, revisiones pendientes,
 * documentos vencidos, hallazgos abiertos), filtros, pestañas Inspecciones ·
 * Documentos · Hallazgos, bandeja de inspecciones con sus estados separados
 * y alertas prioritarias. La revisión SSOMA no valida ejecución PCI.
 */
type Pestana = 'inspecciones' | 'documentos' | 'hallazgos'
const RUTA: Record<Pestana, string> = { inspecciones: '/ssoma/inspecciones', documentos: '/ssoma/documentos', hallazgos: '/ssoma/hallazgos' }

export function ControlSsoma({ pestana, titulo, subtitulo, esInicio }: { pestana: Pestana; titulo: string; subtitulo: string; esInicio?: boolean }) {
  const { service, role, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const f = {
    desde: sp.get('desde') ?? toISODate(addDays(new Date(), -21)), hasta: sp.get('hasta') ?? toISODate(new Date()),
    crew: sp.get('crew') ?? '', tipo: sp.get('tipo') ?? '', estado: sp.get('estado') ?? '', q: sp.get('q') ?? '', p: Number(sp.get('p') ?? 0),
  }
  const [borrador, setBorrador] = React.useState(f)
  React.useEffect(() => { setBorrador(f) }, [sp.toString()]) // eslint-disable-line react-hooks/exhaustive-deps
  const aplicar = (c: Partial<typeof f>) => {
    const n = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...borrador, ...c, p: c.p ?? 0 })) if (v !== '' && v != null && !(k === 'p' && !v)) n.set(k, String(v))
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const POR = 10
  const panel = useQuery({
    queryKey: ['ssoma-panel', service.id, f],
    queryFn: async () => {
      const { data, error } = await sb.rpc('ssoma_panel' as any, {
        p_service: service.id, p_desde: f.desde, p_hasta: f.hasta, p_crew: f.crew || null, p_tipo: f.tipo || null,
        p_estado: f.estado || null, p_q: f.q || null, p_limite: POR, p_desde_fila: f.p * POR,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const cuadrillas = useQuery({
    queryKey: ['ssoma-crews', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
  const d = panel.data
  const k = d?.kpis ?? {}
  const puedeRevisar = ['ing_seguridad', 'admin'].includes(role)
  const [nueva, setNueva] = React.useState(false)
  // La hora se pinta en el navegador: renderizarla en el servidor no coincidiría al hidratar
  const [ahora, setAhora] = React.useState('')
  React.useEffect(() => { setAhora(fmtDateTime(new Date())) }, [panel.dataUpdatedAt])
  const total = Number(d?.total ?? 0)
  const exportar = async () => {
    const { data } = await sb.rpc('ssoma_panel' as any, { p_service: service.id, p_desde: f.desde, p_hasta: f.hasta, p_crew: f.crew || null, p_tipo: f.tipo || null,
      p_estado: f.estado || null, p_q: f.q || null, p_limite: 5000, p_desde_fila: 0 } as any)
    await descargarExcel('Inspecciones_SSOMA', { titulo: 'Inspecciones SSOMA', servicio: service.name, periodo: `${fmtDate(f.desde)} – ${fmtDate(f.hasta)}`, generadoPor: profile.full_name },
      [{ name: 'Inspecciones', columns: [
        { header: 'Inspección', key: 'codigo', width: 10 }, { header: 'Cuadrilla', key: 'crew_name', width: 22 }, { header: 'Tipo', key: 'tipo', width: 12 },
        { header: 'Objeto', key: 'objeto', width: 12 }, { header: 'Fecha', key: 'fecha_txt', width: 12 }, { header: 'Vigencia', key: 'vigencia', width: 12 },
        { header: 'Última revisión', key: 'ultima_revision', width: 14 }, { header: 'Aptitud', key: 'aptitud', width: 10 }, { header: 'Hallazgos', key: 'hallazgos', width: 10 },
      ], rows: ((data as any)?.filas ?? []).map((x: any) => ({ ...x, fecha_txt: fmtDate(x.fecha) })) }])
  }

  return (
    <>
      <PageHeader title={titulo} description={subtitulo}>
        {!esInicio && <Link href="/dashboard" className="text-primary mt-1 inline-flex items-center gap-1 text-[12.5px]"><ArrowLeft className="size-3.5" />Control SSOMA</Link>}
      </PageHeader>
      <PageBody className="space-y-4">
        {pestana === 'inspecciones' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [Users, k.cuadrillas, 'Cuadrillas', 'border-info text-info bg-info/[0.05]'],
              [ClipboardCheck, k.revisiones_pendientes, 'Revisiones pendientes', 'border-warning text-warning bg-warning/[0.06]'],
              [FileText, k.documentos_vencidos, 'Documentos vencidos', 'border-destructive text-destructive bg-destructive/[0.05]'],
              [TriangleAlert, k.hallazgos_abiertos, 'Hallazgos abiertos', 'border-destructive text-destructive bg-destructive/[0.06]'],
            ].map(([I, v, t, c]: any) => (
              <div key={t} className={cn('flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3', c)}>
                <I className="size-6" /><div><p className="text-2xl font-bold tabular-nums">{v == null ? '—' : fmtNumber(v)}</p><p className="text-foreground text-[12px]">{t}</p></div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {([['inspecciones', 'Inspecciones', ClipboardCheck], ['documentos', 'Documentos', FileText], ['hallazgos', 'Hallazgos', TriangleAlert]] as const).map(([t, l, I]) => (
            <Link key={t} href={esInicio && t === 'inspecciones' ? '/dashboard' : RUTA[t]} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
              pestana === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}><I className="size-3.5" />{l}</Link>
          ))}
        </div>

        {pestana === 'documentos' ? <DocumentosSsoma /> : pestana === 'hallazgos' ? <HallazgosSsoma /> : (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 p-4 text-[12px]">
                <label><span className="text-muted-foreground block">Fecha inicial:</span><Input type="date" value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} className="h-9" /></label>
                <label><span className="text-muted-foreground block">Fecha final:</span><Input type="date" value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} className="h-9" /></label>
                <Elegir etiqueta="Cuadrilla:" valor={borrador.crew} cambiar={(v) => setBorrador({ ...borrador, crew: v })} todos="Todas"
                  opciones={(cuadrillas.data ?? []).map((c) => [c.id, c.name])} />
                <Elegir etiqueta="Tipo:" valor={borrador.tipo} cambiar={(v) => setBorrador({ ...borrador, tipo: v })} todos="Todos"
                  opciones={Object.entries(TIPOS_INSPECCION).map(([k2, v]) => [k2, v.t])} />
                <Elegir etiqueta="Estado:" valor={borrador.estado} cambiar={(v) => setBorrador({ ...borrador, estado: v })} todos="Todos"
                  opciones={[['pendiente', 'Revisión pendiente'], ['observado', 'Observado'], ['conforme', 'Conforme'], ['vencido', 'Vencido'], ['no_apto', 'No apto']]} />
                <Button onClick={() => aplicar({})}><Filter className="size-4" />Aplicar</Button>
              </CardContent>
            </Card>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                <Input value={borrador.q} onChange={(e) => setBorrador({ ...borrador, q: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && aplicar({})}
                  placeholder="Buscar inspección, cuadrilla o equipo..." className="pl-8" /></div>
              {puedeRevisar && <Button onClick={() => setNueva(true)}><Plus className="size-4" />Nueva inspección</Button>}
              <SiPuede modulo="ssoma" accion="exportar"><Button variant="outline" onClick={exportar}><Download className="size-4" />Exportar</Button></SiPuede>
            </div>
            {panel.error && <p className="text-destructive text-[13px]">{mensajeAmigable(panel.error)}</p>}
            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <Card className="min-w-0">
                <CardContent className="overflow-x-auto p-0">
                  {panel.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : (
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
                        {['Inspección', 'Cuadrilla', 'Tipo', 'Fecha', 'Vigencia', 'Última revisión', 'Aptitud', 'Hallazgos', 'Acción'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}
                      </tr></thead>
                      <tbody>
                        {(d?.filas ?? []).length === 0 && <tr><td colSpan={9} className="text-muted-foreground px-3 py-6 text-center">Sin inspecciones en el filtro.</td></tr>}
                        {(d?.filas ?? []).map((x: any) => (
                          <tr key={x.id} className="border-t border-border">
                            <td className="px-3 py-2 font-bold">{x.codigo}</td>
                            <td className="px-3">{x.crew_name ?? '—'}</td>
                            <td className="px-3"><TipoInspeccion tipo={x.tipo} />{x.objeto && <span className="text-muted-foreground"> · {x.objeto}</span>}</td>
                            <td className="px-3 whitespace-nowrap">{fmtDate(x.fecha)}</td>
                            <td className="px-3"><ChipSsoma estado={x.vigencia} /></td>
                            <td className="px-3"><ChipSsoma estado={x.ultima_revision} /></td>
                            <td className="px-3"><ChipSsoma estado={x.aptitud} /></td>
                            <td className="px-3 text-center tabular-nums">{x.hallazgos}</td>
                            <td className="px-3"><Link href={`/ssoma/inspecciones/${x.id}`}><Button size="sm" variant="outline"><Eye className="size-3.5" />Ver detalle</Button></Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[12px]">
                    <span className="text-muted-foreground">{total ? `${f.p * POR + 1}–${Math.min((f.p + 1) * POR, total)} de ${fmtNumber(total)}` : '0 de 0'}</span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={f.p === 0} onClick={() => aplicar({ p: f.p - 1 })}>‹ Anterior</Button>
                      <Button size="sm" variant="outline" disabled={(f.p + 1) * POR >= total} onClick={() => aplicar({ p: f.p + 1 })}>Siguiente ›</Button>
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card className="h-fit">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><Bell className="text-info size-4" />Alertas prioritarias</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(d?.alertas ?? []).length === 0 && <p className="text-muted-foreground text-[12.5px]">Sin alertas.</p>}
                  {(d?.alertas ?? []).map((a: any, i: number) => {
                    const cuerpo = <p className={cn('flex items-start gap-2 rounded-md px-2.5 py-2 text-[12px]', a.nivel === 'rojo' ? 'bg-destructive/10 text-destructive' : 'bg-warning/12 text-warning')}>
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /><span><strong>{a.texto}</strong>{a.cuadrilla ? ` · ${a.cuadrilla}` : ''} · {a.estado}</span></p>
                    return a.id ? <Link key={i} href={`/ssoma/hallazgos/${a.id}`}>{cuerpo}</Link> : <div key={i}>{cuerpo}</div>
                  })}
                </CardContent>
              </Card>
            </div>
          </>
        )}
        <p className="text-muted-foreground flex items-center gap-2 text-[12px]"><RefreshCw className="size-3.5" />Última sincronización: {ahora || '—'} · La revisión SSOMA no valida ejecución PCI.</p>
      </PageBody>
      {nueva && <NuevaInspeccion cerrar={() => setNueva(false)} cuadrillas={cuadrillas.data ?? []} alCrear={(id) => { qc.invalidateQueries({ queryKey: ['ssoma-panel'] }); router.push(`/ssoma/inspecciones/${id}`) }} />}
    </>
  )
}

function NuevaInspeccion({ cerrar, cuadrillas, alCrear }: { cerrar: () => void; cuadrillas: any[]; alCrear: (id: string) => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ tipo: 'vehiculo', crew: '', objeto: '', notas: '' })
  const objetos = useQuery({
    queryKey: ['ssoma-objetos', service.id, v.tipo, v.crew],
    enabled: ['vehiculo', 'extintor', 'botiquin', 'equipo'].includes(v.tipo),
    queryFn: async () => v.tipo === 'vehiculo'
      ? ((await sb.from('vehicles').select('id, code, plate').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []).map((x: any) => [x.id, x.code ?? x.plate])
      : ((await sb.from('safety_equipment').select('id, code, kind').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? [])
          .filter((x: any) => v.tipo === 'equipo' || x.kind === v.tipo).map((x: any) => [x.id, x.code ?? x.kind]),
  })
  const crear = async () => {
    const { data, error } = await sb.rpc('ssoma_inspeccion_crear' as any, {
      p_service: service.id, p_tipo: v.tipo, p_crew: v.crew || null, p_vehicle: v.tipo === 'vehiculo' ? v.objeto || null : null,
      p_equipment: ['extintor', 'botiquin', 'equipo'].includes(v.tipo) ? v.objeto || null : null, p_notas: v.notas || null,
    } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Inspección ${(data as any).codigo} registrada`)
    alCrear((data as any).id)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nueva inspección</DialogTitle>
          <DialogDescription>Una inspección propia de SSOMA. Lo que la cuadrilla registra en campo ya entra solo a la bandeja.</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <Elegir etiqueta="Tipo" valor={v.tipo} cambiar={(x) => setV({ ...v, tipo: x || 'otro', objeto: '' })} opciones={Object.entries(TIPOS_INSPECCION).map(([k, d]) => [k, d.t])} />
          <Elegir etiqueta="Cuadrilla" valor={v.crew} cambiar={(x) => setV({ ...v, crew: x })} todos="Sin cuadrilla" opciones={cuadrillas.map((c) => [c.id, c.name])} />
          {objetos.data && <Elegir etiqueta={v.tipo === 'vehiculo' ? 'Vehículo' : 'Equipo'} valor={v.objeto} cambiar={(x) => setV({ ...v, objeto: x })} todos="Elegir" opciones={objetos.data as any} />}
          <Textarea rows={2} value={v.notas} onChange={(e) => setV({ ...v, notas: e.target.value })} placeholder="Notas (opcional)" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={crear}><Plus className="size-4" />Registrar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Elegir({ etiqueta, valor, cambiar, opciones, todos }: { etiqueta: string; valor: string; cambiar: (v: string) => void; opciones: [string, string][]; todos?: string }) {
  return (
    <label className="text-[12px]"><span className="text-muted-foreground block">{etiqueta}</span>
      <Select value={valor || '__'} onValueChange={(v) => cambiar(v === '__' ? '' : v)}>
        <SelectTrigger className="h-9 min-w-36"><SelectValue /></SelectTrigger>
        <SelectContent>{todos && <SelectItem value="__">{todos}</SelectItem>}{opciones.map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}
