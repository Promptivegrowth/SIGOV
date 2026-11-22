'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Download, Search, Eye, ArrowRight, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'
import { descargarExcel } from '@/lib/reports'
import { mensajeAmigable } from '@/lib/errores'
import { ChipSsoma, abrirArchivoSsoma } from './comun-ssoma'

/**
 * «Historial» (SSOMA_13/14): eventos inmutables del objeto — actor, fecha,
 * versión y resultado— con el antes/después de cada cambio. Solo lectura:
 * el estado actual no borra la observación anterior.
 */
const EVENTO: Record<string, string> = {
  inspeccion_registrada: 'Nueva inspección', revision: 'Revisión', borrador: 'Borrador de revisión', nueva_version: 'Nueva versión',
  hallazgo_creado: 'Hallazgo creado', respuesta: 'Respuesta', verificacion_pendiente: 'Verificación pendiente',
  hallazgo_cerrado: 'Hallazgo cerrado', hallazgo_reabierto: 'Hallazgo reabierto', evidencia: 'Evidencia',
}

export function HistorialSsoma({ eventos, titulo }: { eventos: any[]; titulo: string }) {
  const { service, profile } = useSession()
  const [f, setF] = React.useState({ actor: '', evento: '', desde: '', hasta: '', q: '' })
  const [abierto, setAbierto] = React.useState('')
  const actores = [...new Set(eventos.map((e) => e.actor))]
  const filas = eventos.filter((e) => (!f.actor || e.actor === f.actor) && (!f.evento || e.tipo === f.evento)
    && (!f.desde || e.cuando.slice(0, 10) >= f.desde) && (!f.hasta || e.cuando.slice(0, 10) <= f.hasta)
    && (!f.q || `${e.codigo} ${e.titulo} ${e.detalle ?? ''} ${e.actor} v${e.version ?? ''}`.toLowerCase().includes(f.q.toLowerCase())))
  const exportar = () => descargarExcel(`Historial_${titulo.replace(/\W+/g, '_')}`, {
    titulo: `Historial · ${titulo}`, servicio: service.name, periodo: fmtDateTime(new Date()), generadoPor: profile.full_name,
  }, [{ name: 'Historial', columns: [
    { header: 'Código', key: 'codigo', width: 10 }, { header: 'Fecha/hora', key: 'fecha', width: 18 }, { header: 'Actor', key: 'actor', width: 22 },
    { header: 'Evento', key: 'titulo', width: 40 }, { header: 'Detalle', key: 'detalle', width: 50 }, { header: 'Versión', key: 'ver', width: 8 }, { header: 'Resultado', key: 'resultado', width: 14 },
  ], rows: filas.map((e) => ({ ...e, fecha: fmtDateTime(e.cuando), ver: e.version ? `v${e.version}` : '' })) }])

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-2 text-[12px]">
          <Sel etiqueta="Actor" valor={f.actor} cambiar={(v) => setF({ ...f, actor: v })} opciones={actores.map((a) => [a, a])} />
          <Sel etiqueta="Evento" valor={f.evento} cambiar={(v) => setF({ ...f, evento: v })} opciones={Object.entries(EVENTO)} />
          <label><span className="text-muted-foreground block">Desde</span><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} className="h-9" /></label>
          <label><span className="text-muted-foreground block">Hasta</span><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} className="h-9" /></label>
          <div className="relative min-w-56 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar evento (código, descripción, actor, versión...)" className="pl-8" /></div>
          <Button size="sm" variant="outline" onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar historial</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
              <th className="w-6" /><th className="px-2 py-2 text-left font-medium">Fecha/hora</th><th className="text-left font-medium">Actor</th>
              <th className="text-left font-medium">Evento</th><th className="text-left font-medium">Versión</th><th className="text-left font-medium">Resultado</th><th />
            </tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={7} className="text-muted-foreground py-6 text-center">Sin eventos.</td></tr>}
              {filas.map((e) => (
                <React.Fragment key={e.id}>
                  <tr className={cn('border-t border-border', abierto === e.id && 'bg-primary/[0.05]')}>
                    <td className="pl-2"><button onClick={() => setAbierto(abierto === e.id ? '' : e.id)} aria-label="Ver evento">{abierto === e.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                    <td className="px-2 py-2 whitespace-nowrap">{fmtDateTime(e.cuando)}</td>
                    <td>{e.actor}</td>
                    <td>{e.hallazgo_codigo ? String(e.titulo).replace(e.hallazgo_codigo, '').trim() : e.titulo}{e.hallazgo_id && <Link href={`/ssoma/hallazgos/${e.hallazgo_id}`} className="text-primary ml-1 underline">{e.hallazgo_codigo}</Link>}</td>
                    <td>{e.version ? <span className="bg-secondary rounded-full px-2 py-0.5 text-[11px]">v{e.version}</span> : '—'}</td>
                    <td>{e.resultado ? <ChipSsoma estado={e.resultado} /> : '—'}</td>
                    <td className="pr-2 text-right"><Button size="sm" variant="outline" onClick={() => setAbierto(abierto === e.id ? '' : e.id)}><Eye className="size-3.5" />Ver evento</Button></td>
                  </tr>
                  {abierto === e.id && (
                    <tr><td colSpan={7} className="bg-secondary/30 px-4 py-3">
                      <p className="mb-2 font-semibold">{e.codigo} · {e.titulo}</p>
                      {e.detalle && <p className="mb-2">{e.detalle}</p>}
                      {(e.antes || e.despues) && (
                        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                          <Bloque titulo="Antes (versión anterior)" datos={e.antes} />
                          <ArrowRight className="text-muted-foreground mx-auto size-5" />
                          <Bloque titulo="Después (versión actual)" datos={e.despues} destacado />
                        </div>
                      )}
                      {(e.evidencias ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(e.evidencias as any[]).map((x) => (
                            <Button key={x.id} size="sm" variant="outline" onClick={() => abrirArchivoSsoma(x.storage_path).catch((er) => toast.error(mensajeAmigable(er)))}>
                              <Eye className="size-3.5" />{x.codigo} {x.nombre}</Button>
                          ))}
                        </div>
                      )}
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-info flex items-start gap-2 text-[12px]"><Info className="mt-0.5 size-3.5" />Solo lectura · No editar ni borrar eventos. El estado actual no borra la observación anterior; el evento histórico se mantiene registrado.</p>
      </CardContent>
    </Card>
  )
}

function Bloque({ titulo, datos, destacado }: { titulo: string; datos: any; destacado?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3 text-[12px]', destacado ? 'border-info/40 bg-info/[0.05]' : 'border-border bg-card')}>
      <p className={cn('mb-1 font-semibold', destacado && 'text-info')}>{titulo}{datos?.version ? ` · v${datos.version}` : ''}</p>
      {!datos ? <p className="text-muted-foreground">—</p> : Object.entries(datos).filter(([k]) => k !== 'version').map(([k, v]) => (
        <p key={k} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{k === 'vence_on' ? 'Vence' : k === 'revision' || k === 'ultima_revision' ? 'Revisión' : k === 'estado' ? 'Estado' : k}</span>
          <span>{k === 'vence_on' ? fmtDate(String(v)) : <ChipSsoma estado={String(v)} />}</span></p>
      ))}
    </div>
  )
}

function Sel({ etiqueta, valor, cambiar, opciones }: { etiqueta: string; valor: string; cambiar: (v: string) => void; opciones: [string, string][] }) {
  return (
    <label><span className="text-muted-foreground block">{etiqueta}</span>
      <Select value={valor || '__'} onValueChange={(v) => cambiar(v === '__' ? '' : v)}>
        <SelectTrigger className="h-9 min-w-36"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="__">Todos</SelectItem>{opciones.map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}
