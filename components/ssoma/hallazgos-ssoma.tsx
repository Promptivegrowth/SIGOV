'use client'

import { SiPuede } from '@/components/shared/si-puede'
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert, ClipboardList, CheckCircle2, CalendarX, Search, Filter, Download, Eye, MessageSquare, Paperclip, History, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { useCuadrillasDelAlcance } from '@/lib/hooks/use-cuadrillas-alcance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, fmtNumber, toISODate, addDays } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { descargarExcel } from '@/lib/reports'
import { ChipSsoma, NotaSsoma, abrirArchivoSsoma, usePagina, Paginador } from './comun-ssoma'
import { Elegir } from './control-ssoma'

/**
 * «Seguimiento de hallazgos» (SSOMA_09/10). Flujo: Abierto → Subsanación
 * enviada → Por verificar → Cerrado. «Vencido» es la condición de la fecha
 * límite pasada, no un estado aparte. SSOMA verifica antes de cerrar; no
 * cambia avance PCI ni genera cierre automático.
 */
export const PASOS_HALLAZGO = [['abierto', 'Abierto'], ['subsanacion_enviada', 'Subsanación enviada'], ['por_verificar', 'Por verificar'], ['cerrado', 'Cerrado']] as const

export function FlujoHallazgo({ estado }: { estado: string }) {
  const orden = ['abierto', 'subsanacion_enviada', 'por_verificar', 'cerrado']
  const actual = estado === 'por_verificar' ? 2 : orden.indexOf(estado)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {PASOS_HALLAZGO.map(([k, t], i) => (
        <React.Fragment key={k}>
          <span className={cn('rounded-md border px-2.5 py-1 font-semibold',
            i === actual ? 'border-warning bg-warning/15 text-warning' : i < actual ? 'border-success/40 bg-success/10 text-success' : 'border-border text-muted-foreground',
            i === actual && k === 'cerrado' && 'border-success bg-success/15 text-success', i === actual && k === 'abierto' && 'border-destructive bg-destructive/10 text-destructive')}>
            {i < actual ? '✓ ' : ''}{t}</span>
          {i < 3 && <span className="text-muted-foreground">›</span>}
        </React.Fragment>
      ))}
    </div>
  )
}

export function HallazgosSsoma() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [f, setF] = React.useState({ q: '', crew: '', responsable: '', estado: '', desde: toISODate(addDays(new Date(), -60)), hasta: toISODate(new Date()) })
  const [aplicado, setAplicado] = React.useState(f)
  const [sel, setSel] = React.useState('')
  const datos = useQuery({
    queryKey: ['ssoma-hallazgos', service.id, aplicado],
    queryFn: async () => {
      const { data, error } = await sb.rpc('ssoma_hallazgos_lista' as any, {
        p_service: service.id, p_crew: aplicado.crew || null, p_responsable: aplicado.responsable || null, p_estado: aplicado.estado || null,
        p_desde: aplicado.desde || null, p_hasta: aplicado.hasta || null, p_q: aplicado.q || null,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  // Selector de cuadrillas con el alcance del rol (el Jefe, solo la suya)
  const cuadrillas = useCuadrillasDelAlcance('id, code, name')
  const filas = (datos.data?.filas ?? []) as any[]
  const pag = usePagina(filas)
  const k = datos.data?.kpis ?? {}
  const h = filas.find((x) => x.id === sel) ?? filas[0]
  const exportar = () => descargarExcel('Hallazgos_SSOMA', { titulo: 'Seguimiento de hallazgos', servicio: service.name, periodo: `${fmtDate(aplicado.desde)} – ${fmtDate(aplicado.hasta)}`, generadoPor: profile.full_name },
    [{ name: 'Hallazgos', columns: [
      { header: 'Hallazgo', key: 'codigo', width: 10 }, { header: 'Descripción', key: 'descripcion', width: 40 }, { header: 'Inspección origen', key: 'inspeccion_codigo', width: 14 },
      { header: 'Cuadrilla', key: 'crew_name', width: 22 }, { header: 'Responsable', key: 'responsable', width: 22 }, { header: 'Fecha límite', key: 'limite', width: 12 },
      { header: 'Estado', key: 'estado_txt', width: 16 }, { header: 'Respuesta más reciente', key: 'resp', width: 40 },
    ], rows: filas.map((x) => ({ ...x, limite: fmtDate(x.fecha_limite), estado_txt: x.vencido ? `${x.estado} (vencido)` : x.estado, resp: x.respuesta?.detalle ?? '' })) }])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[TriangleAlert, k.abiertos, 'Abiertos', 'text-destructive'], [ClipboardList, k.por_verificar, 'Por verificar', 'text-warning'],
          [CheckCircle2, k.cerrados, 'Cerrados', 'text-success'], [CalendarX, k.vencidos, 'Vencidos', 'text-destructive']].map(([I, v, t, c]: any) => (
          <div key={t} className="bg-card rounded-xl border border-border px-4 py-3"><p className="flex items-center gap-1.5 text-[12px]"><I className={cn('size-4', c)} />{t}</p>
            <p className={cn('text-2xl font-bold tabular-nums', c)}>{v == null ? '—' : fmtNumber(v)}</p></div>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar código o descripción del hallazgo..." className="pl-8" /></div>
          <Elegir etiqueta="Cuadrilla:" valor={f.crew} cambiar={(v) => setF({ ...f, crew: v })} todos="Todas" opciones={(cuadrillas.data ?? []).map((c) => [c.id, c.name])} />
          <Elegir etiqueta="Responsable:" valor={f.responsable} cambiar={(v) => setF({ ...f, responsable: v })} todos="Todos" opciones={((datos.data?.responsables ?? []) as any[]).map((r) => [r.id, r.nombre])} />
          <Elegir etiqueta="Estado:" valor={f.estado} cambiar={(v) => setF({ ...f, estado: v })} todos="Todos" opciones={[['abierto', 'Abierto'], ['por_verificar', 'Por verificar'], ['cerrado', 'Cerrado'], ['vencido', 'Vencido (fecha límite pasada)']]} />
          <label className="text-[12px]"><span className="text-muted-foreground block">Desde:</span><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="h-9" /></label>
          <label className="text-[12px]"><span className="text-muted-foreground block">Hasta:</span><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} className="h-9" /></label>
          <Button onClick={() => setAplicado(f)}><Filter className="size-4" />Aplicar</Button>
          <SiPuede modulo="ssoma" accion="exportar"><Button variant="outline" onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar</Button></SiPuede>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {datos.isLoading ? <div className="p-4"><SkeletonList rows={4} /></div> : (
            <table className="w-full text-[12.5px]">
              <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
                {['Hallazgo', 'Inspección origen', 'Cuadrilla', 'Responsable', 'Fecha límite', 'Estado', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}
              </tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={7} className="text-muted-foreground px-3 py-6 text-center">Sin hallazgos en el filtro.</td></tr>}
                {pag.visibles.map((x) => (
                  <tr key={x.id} onClick={() => setSel(x.id)} className={cn('cursor-pointer border-t border-border', h?.id === x.id && 'bg-info/[0.07]')}>
                    <td className="px-3 py-2"><strong>{x.codigo}</strong> <span className="text-muted-foreground">{x.descripcion}</span></td>
                    <td className="px-3">{x.inspeccion_id ? <Link href={`/ssoma/inspecciones/${x.inspeccion_id}`} className="text-primary underline" onClick={(e) => e.stopPropagation()}>{x.inspeccion_codigo}</Link> : '—'}</td>
                    <td className="px-3">{x.crew_name ?? '—'}</td>
                    <td className="px-3">{x.responsable ?? '—'}</td>
                    <td className={cn('px-3 whitespace-nowrap', x.vencido && 'text-destructive font-semibold')}>{fmtDate(x.fecha_limite)}</td>
                    <td className="px-3"><span className="flex flex-wrap gap-1"><ChipSsoma estado={x.estado} />{x.vencido && <ChipSsoma estado="vencido" />}</span></td>
                    <td className="px-3"><Link href={`/ssoma/hallazgos/${x.id}`} onClick={(e) => e.stopPropagation()}><Button size="sm" variant="outline"><Eye className="size-3.5" />Ver detalle</Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Paginador p={pag} />
        </CardContent>
      </Card>
      {h && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="bg-info/[0.07] pb-2"><CardTitle className="text-[14px]">Hallazgo seleccionado: {h.codigo} – {h.descripcion}</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-3 text-[12.5px]">
              {h.respuesta ? (
                <>
                  <p className="flex items-center gap-2"><MessageSquare className="size-4" /><strong>Respuesta del responsable</strong> · {fmtDateTime(h.respuesta.cuando)} · {h.respuesta.actor_nombre}</p>
                  <p className="bg-secondary rounded-md px-3 py-2 italic">“{h.respuesta.detalle}”</p>
                </>
              ) : <p className="text-muted-foreground">Aún sin respuesta del responsable.</p>}
              <div className="flex flex-wrap gap-2">
                <Link href={`/ssoma/hallazgos/${h.id}?tab=historial`}><Button size="sm" variant="outline"><MessageSquare className="size-3.5" />Ver respuesta</Button></Link>
                <Link href={`/ssoma/hallazgos/${h.id}?tab=evidencias`}><Button size="sm" variant="outline"><Paperclip className="size-3.5" />Ver archivo</Button></Link>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Flujo del hallazgo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <FlujoHallazgo estado={h.estado} />
              <div className="flex flex-wrap gap-2">
                {h.inspeccion_id && <Link href={`/ssoma/inspecciones/${h.inspeccion_id}`}><Button size="sm"><ClipboardCheck className="size-3.5" />Ver inspección</Button></Link>}
                <Link href={`/ssoma/hallazgos/${h.id}?tab=historial`}><Button size="sm" variant="outline"><History className="size-3.5" />Ver historial</Button></Link>
                <Link href={`/ssoma/hallazgos/${h.id}`}><Button size="sm" className="bg-success hover:bg-success/90"><CheckCircle2 className="size-3.5" />Revisar respuesta</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <NotaSsoma><strong>SSOMA verifica antes de cerrar;</strong> no cambia avance PCI. No se genera nueva captura ni cierre automático.</NotaSsoma>
    </div>
  )
}

