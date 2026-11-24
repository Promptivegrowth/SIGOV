'use client'

import { SiPuede } from '@/components/shared/si-puede'
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Eye, Layers, Pencil, Search, Filter, Download, Upload, FileText, Calendar, User, Save, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, fmtNumber } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { descargarExcel } from '@/lib/reports'
import { ChipSsoma, TIPOS_DOCUMENTO, NotaSsoma, abrirArchivoSsoma, subirArchivoSsoma, usePagina, Paginador } from './comun-ssoma'
import { Elegir } from './control-ssoma'

/**
 * «Documentos y vigencias» (SSOMA_07/08): SOAT, revisión técnica, póliza,
 * licencias y vencimientos de equipos, con versiones. Cargar una versión
 * nueva no otorga conformidad automática: cada versión se revisa
 * (Conforme / Observado, motivo obligatorio) y el historial se conserva.
 */
export function DocumentosSsoma({ filtroObjeto }: { filtroObjeto?: { vehicle_id?: string | null; equipment_id?: string | null } }) {
  const { service, role, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ q: '', crew: '', tipo: '', vigencia: '', revision: '' })
  const [aplicado, setAplicado] = React.useState(f)
  const [abierto, setAbierto] = React.useState('')
  const [nueva, setNueva] = React.useState<any | null>(null)
  const datos = useQuery({
    queryKey: ['ssoma-docs', service.id, aplicado],
    queryFn: async () => {
      const { data, error } = await sb.rpc('ssoma_documentos_lista' as any, {
        p_service: service.id, p_crew: aplicado.crew || null, p_tipo: aplicado.tipo || null, p_vigencia: aplicado.vigencia || null,
        p_revision: aplicado.revision || null, p_q: aplicado.q || null,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const cuadrillas = useQuery({
    queryKey: ['ssoma-crews', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
  let filas = (datos.data?.filas ?? []) as any[]
  if (filtroObjeto) filas = filas.filter((x) => (filtroObjeto.vehicle_id && x.vehicle_id === filtroObjeto.vehicle_id) || (filtroObjeto.equipment_id && x.equipment_id === filtroObjeto.equipment_id))
  const pag = usePagina(filas)
  const k = datos.data?.kpis ?? {}
  const puedeRevisar = ['ing_seguridad', 'admin'].includes(role)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ssoma-docs'] })
  const exportar = () => descargarExcel('Documentos_SSOMA', { titulo: 'SSOMA · Documentos y vigencias', servicio: service.name, periodo: fmtDate(new Date()), generadoPor: profile.full_name },
    [{ name: 'Documentos', columns: [
      { header: 'Código', key: 'codigo', width: 10 }, { header: 'Documento', key: 'nombre', width: 30 }, { header: 'Equipo/cuadrilla', key: 'crew_name', width: 22 },
      { header: 'Versión', key: 'ver', width: 8 }, { header: 'Vencimiento', key: 'vence', width: 12 }, { header: 'Vigencia', key: 'vigencia', width: 12 }, { header: 'Última revisión', key: 'rev', width: 14 },
    ], rows: filas.map((x) => ({ ...x, ver: `v${x.ultima?.version}`, vence: x.ultima?.vence_on ? fmtDate(x.ultima.vence_on) : 'No aplica', rev: x.ultima?.revision })) }])

  return (
    <div className="space-y-4">
      {!filtroObjeto && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[[k.documentos, 'Documentos', 'text-info'], [k.pendiente, 'Pendiente', 'text-warning'], [k.observado, 'Observado', 'text-destructive'], [k.conformes, 'Conformes', 'text-success']].map(([v, t, c]: any) => (
            <div key={t} className="bg-card rounded-xl border border-border px-4 py-3"><p className={cn('text-2xl font-bold tabular-nums', c)}>{v == null ? '—' : fmtNumber(v)}</p><p className="text-[12px]">{t}</p></div>
          ))}
        </div>
      )}
      {!filtroObjeto && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar documento (código, nombre, tipo)..." className="pl-8" /></div>
            <Elegir etiqueta="Cuadrilla:" valor={f.crew} cambiar={(v) => setF({ ...f, crew: v })} todos="Todas" opciones={(cuadrillas.data ?? []).map((c) => [c.id, c.name])} />
            <Elegir etiqueta="Tipo:" valor={f.tipo} cambiar={(v) => setF({ ...f, tipo: v })} todos="Todos" opciones={Object.entries(TIPOS_DOCUMENTO)} />
            <Elegir etiqueta="Vigencia:" valor={f.vigencia} cambiar={(v) => setF({ ...f, vigencia: v })} todos="Todas" opciones={[['vigente', 'Vigente'], ['vencido', 'Vencido'], ['no_aplica', 'No aplica']]} />
            <Elegir etiqueta="Última revisión:" valor={f.revision} cambiar={(v) => setF({ ...f, revision: v })} todos="Todas" opciones={[['pendiente', 'Pendiente'], ['conforme', 'Conforme'], ['observado', 'Observado']]} />
            <Button onClick={() => setAplicado(f)}><Filter className="size-4" />Aplicar</Button>
            <SiPuede modulo="ssoma" accion="exportar"><Button variant="outline" onClick={exportar} disabled={!filas.length}><Download className="size-4" />Exportar</Button></SiPuede>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {datos.isLoading ? <div className="p-4"><SkeletonList rows={5} /></div> : (
            <table className="w-full text-[12.5px]">
              <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
                <th className="w-8" />{['Documento', 'Equipo/cuadrilla', 'Versión', 'Vencimiento', 'Vigencia', 'Última revisión', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}
              </tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={8} className="text-muted-foreground px-3 py-6 text-center">Sin documentos.</td></tr>}
                {pag.visibles.map((x) => (
                  <React.Fragment key={x.id}>
                    <tr className={cn('border-t border-border', abierto === x.id && 'bg-info/[0.06]')}>
                      <td className="pl-2"><button onClick={() => setAbierto(abierto === x.id ? '' : x.id)} aria-label="Expandir">{abierto === x.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button></td>
                      <td className="px-3 py-2"><strong>{x.nombre}</strong><span className="text-muted-foreground block text-[11px]">{x.codigo} · {TIPOS_DOCUMENTO[x.tipo] ?? x.tipo}</span></td>
                      <td className="px-3">{x.crew_name ?? '—'}</td>
                      <td className="px-3"><span className="bg-secondary rounded-full px-2 py-0.5 text-[11px]">v{x.ultima?.version}</span></td>
                      <td className="px-3 whitespace-nowrap">{x.ultima?.vence_on ? fmtDate(x.ultima.vence_on) : 'No aplica'}</td>
                      <td className="px-3"><ChipSsoma estado={x.vigencia} /></td>
                      <td className="px-3"><ChipSsoma estado={x.ultima?.revision} /></td>
                      <td className="px-3">
                        <span className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" disabled={!x.ultima?.archivo_path} onClick={() => abrirArchivoSsoma(x.ultima.archivo_path).catch((e) => toast.error(mensajeAmigable(e)))}><Eye className="size-3.5" />Ver archivo</Button>
                          <Button size="sm" variant="outline" onClick={() => setAbierto(x.id)}><Layers className="size-3.5" />Ver versiones</Button>
                          {puedeRevisar && <Button size="sm" variant="outline" onClick={() => setAbierto(x.id)}><Pencil className="size-3.5" />Revisar</Button>}
                          {['jefe_cuadrilla', 'admin', 'residente'].includes(role) && <Button size="sm" variant="outline" onClick={() => setNueva(x)}><Upload className="size-3.5" />Nueva versión</Button>}
                        </span>
                      </td>
                    </tr>
                    {abierto === x.id && (
                      <tr><td colSpan={8} className="bg-info/[0.04] px-4 py-3"><PanelDocumento doc={x} puedeRevisar={puedeRevisar} alCambiar={refrescar} /></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
          <Paginador p={pag} />
          <p className="text-muted-foreground border-t border-border px-3 py-2 text-[12px]">{fmtNumber(filas.length)} documentos</p>
        </CardContent>
      </Card>
      {nueva && <NuevaVersion doc={nueva} cerrar={() => setNueva(null)} alGuardar={() => { setNueva(null); refrescar() }} />}
    </div>
  )
}

function PanelDocumento({ doc, puedeRevisar, alCambiar }: { doc: any; puedeRevisar: boolean; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [resultado, setResultado] = React.useState('')
  const [motivo, setMotivo] = React.useState('')
  const [ocupado, setOcupado] = React.useState(false)
  // La revisión va sobre la versión que se está viendo (por defecto, la última)
  const versiones = [...((doc.versiones ?? []) as any[])].sort((a, b) => b.version - a.version)
  const [verId, setVerId] = React.useState<string>(doc.ultima?.id ?? versiones[0]?.id ?? '')
  const u = versiones.find((v) => v.id === verId) ?? doc.ultima ?? {}
  const esUltima = !versiones.length || u.version === versiones[0]?.version
  const borr = useQuery({
    queryKey: ['ssoma-borrador', 'documento', doc.id, verId],
    enabled: puedeRevisar && !!verId,
    queryFn: async () => ((await sb.rpc('ssoma_borrador' as any, { p_objeto_tipo: 'documento', p_objeto_id: doc.id, p_version: verId } as any)).data ?? null) as any,
  })
  React.useEffect(() => { setResultado(borr.data?.resultado ?? ''); setMotivo(borr.data?.motivo ?? '') }, [borr.data, verId])
  const revisar = async (borrador: boolean) => {
    setOcupado(true)
    const { error } = await sb.rpc('ssoma_revisar' as any, { p_objeto_tipo: 'documento', p_objeto_id: doc.id, p_resultado: resultado || null, p_motivo: motivo, p_borrador: borrador, p_version: u.id ?? null } as any)
    setOcupado(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(borrador ? 'Borrador de revisión guardado' : `Revisión registrada en v${u.version}`)
    if (!borrador) { setResultado(''); setMotivo('') }
    alCambiar()
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 text-[12.5px]">
        <p className="flex items-center gap-2 font-semibold"><FileText className="size-4" />{doc.nombre} · versión {u.version}</p>
        <p className="text-muted-foreground flex flex-wrap gap-3"><span><Calendar className="mr-1 inline size-3.5" />Cargado el {fmtDate(u.cargado_at)}</span><span><User className="mr-1 inline size-3.5" />Por: {u.cargado_por ?? '—'}</span></p>
        <p className={cn('rounded-md px-3 py-1.5', doc.vigencia === 'vencido' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>📅 Vigencia: <strong>{doc.vigencia === 'vencido' ? 'Vencido' : doc.vigencia === 'vigente' ? 'Vigente' : 'No aplica'}</strong></p>
        <p className="bg-warning/10 text-warning rounded-md px-3 py-1.5">📋 Revisión: <strong>{u.revision === 'conforme' ? 'Conforme' : u.revision === 'observado' ? 'Observado' : 'Pendiente'}</strong>{u.motivo ? ` · ${u.motivo}` : ''}</p>
        {puedeRevisar ? (
          <>
            {!esUltima && <p className="bg-info/10 text-info rounded-md px-3 py-1.5 text-[12px]">Revisas la versión v{u.version} (hay una más reciente). Su fecha no cambia la aptitud del vehículo o equipo: rige la última versión.</p>}
            {borr.data && <p className="bg-warning/10 text-warning rounded-md px-2 py-1 text-[11.5px]">Borrador recuperado del {fmtDateTime(borr.data.cuando)}.</p>}
            <p className="font-medium">Resultado <span className="text-destructive">*</span></p>
            <div className="flex gap-2">
              {(['conforme', 'observado'] as const).map((r) => (
                <label key={r} className={cn('flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2',
                  resultado === r ? (r === 'conforme' ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10') : 'border-border')}>
                  <input type="radio" name={`res-${doc.id}`} checked={resultado === r} onChange={() => setResultado(r)} />{r === 'conforme' ? 'Conforme' : 'Observado'}
                </label>
              ))}
            </div>
            <label className="block space-y-1"><span className="font-medium">Motivo de revisión <span className="text-destructive">*</span></span>
              <Textarea rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ingrese el motivo de la revisión..." /></label>
            <NotaSsoma>La carga de una nueva versión no otorga conformidad automática.</NotaSsoma>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => revisar(true)} loading={ocupado}><Save className="size-4" />Guardar borrador</Button>
              <Button onClick={() => revisar(false)} loading={ocupado} disabled={!resultado || !motivo.trim()}><CheckCircle2 className="size-4" />Registrar revisión</Button>
            </div>
          </>
        ) : <NotaSsoma>La revisión la registra el Encargado SSOMA. La carga de una nueva versión no otorga conformidad automática.</NotaSsoma>}
      </div>
      <div className="text-[12.5px]">
        <p className="mb-2 flex items-center gap-2 font-semibold"><Layers className="size-4" />Historial de versiones</p>
        <table className="w-full">
          <thead className="text-muted-foreground text-[11.5px]"><tr><th className="py-1 text-left font-medium">Versión</th><th className="text-left font-medium">Estado</th><th className="text-left font-medium">Vencimiento</th><th className="text-left font-medium">Última revisión</th><th /></tr></thead>
          <tbody>
            {(doc.versiones as any[]).map((v) => (
              <tr key={v.id} className={cn('border-t border-border', v.id === u.id && 'bg-info/[0.07]')}>
                <td className="py-1.5">v{v.version}</td>
                <td><ChipSsoma estado={!v.vence_on ? 'no_aplica' : v.vence_on < new Date().toISOString().slice(0, 10) ? 'vencido' : 'vigente'} /></td>
                <td>{v.vence_on ? fmtDate(v.vence_on) : '—'}</td>
                <td><ChipSsoma estado={v.revision} /></td>
                <td className="space-x-1 text-right whitespace-nowrap"><Button size="sm" variant="outline" disabled={!v.archivo_path} onClick={() => abrirArchivoSsoma(v.archivo_path).catch((e) => toast.error(mensajeAmigable(e)))}><Eye className="size-3.5" />Ver archivo</Button>
                  {puedeRevisar && <Button size="sm" variant={v.id === u.id ? 'default' : 'outline'} onClick={() => setVerId(v.id)}><Pencil className="size-3.5" />{v.id === u.id ? 'En revisión' : 'Revisar esta'}</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(doc.versiones as any[]).some((v) => !v.archivo_path) && <p className="text-muted-foreground mt-2 text-[11.5px]">Las versiones sin archivo son fechas registradas antes del control de versiones.</p>}
      </div>
    </div>
  )
}

function NuevaVersion({ doc, cerrar, alGuardar }: { doc: any; cerrar: () => void; alGuardar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [vence, setVence] = React.useState('')
  const [nota, setNota] = React.useState('')
  const [ocupado, setOcupado] = React.useState(false)
  const guardar = async () => {
    if (!archivo) return
    setOcupado(true)
    try {
      const ruta = await subirArchivoSsoma(service.id, `documentos/${doc.id}`, archivo)
      const { data, error } = await sb.rpc('ssoma_documento_version' as any, { p_documento: doc.id, p_vence: vence || null, p_archivo_path: ruta, p_archivo_nombre: archivo.name, p_nota: nota || null } as any)
      if (error) throw error
      toast.success(`Versión v${(data as any).version} cargada`, { description: 'Queda pendiente de revisión SSOMA.' })
      alGuardar()
    } catch (e) { toast.error(mensajeAmigable(e)) } finally { setOcupado(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nueva versión · {doc.nombre}</DialogTitle>
          <DialogDescription>La versión anterior se conserva en el historial. Cargar no otorga conformidad: SSOMA la revisa.</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          {doc.tipo !== 'otro' && <label className="block"><span className="text-muted-foreground text-[12px]">Vence</span><Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></label>}
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={guardar} loading={ocupado} disabled={!archivo}><Upload className="size-4" />Cargar versión</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

