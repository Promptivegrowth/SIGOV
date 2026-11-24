'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, FolderOpen, Image as ImageIcon, TriangleAlert, Clock, Users, Truck, User, Calendar, Wrench, FileText, ClipboardCheck, ShieldX, Eye, CheckCircle2, Save, Paperclip, Plus, ExternalLink, Home } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime, toISODate, addDays } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { ChipSsoma, TIPOS_INSPECCION, NotaSsoma, abrirArchivoSsoma, subirArchivoSsoma, adjuntarEvidenciaSsoma } from './comun-ssoma'
import { EvidenciasSsoma } from './evidencias-ssoma'
import { HistorialSsoma } from './historial-ssoma'
import { DocumentosSsoma } from './documentos-ssoma'
import { Elegir } from './control-ssoma'

/**
 * «Detalle de inspección · INS-NNN» (SSOMA_02/05, 11–14). Un único detalle
 * con pestañas General · Documentos · Evidencias · Hallazgos · Historial,
 * cuatro estados separados (mecánico, vigencia documental, última revisión,
 * aptitud) y «Registrar revisión» (resultado, motivo y evidencia). Registrar
 * no cierra hallazgos; cada revisión conserva actor, fecha y evidencia y no
 * modifica avance PCI.
 */
type Tab = 'general' | 'documentos' | 'evidencias' | 'hallazgos' | 'historial'

export function InspeccionDetalle({ id }: { id: string }) {
  const { role, service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'general'
  const irA = (t: Tab) => { const n = new URLSearchParams(sp.toString()); n.set('tab', t); router.replace(`${pathname}?${n.toString()}`, { scroll: false }) }
  const q = useQuery({
    queryKey: ['ssoma-insp', id],
    queryFn: async () => { const { data, error } = await sb.rpc('ssoma_inspeccion' as any, { p_id: id } as any); if (error) throw error; return data as any },
  })
  const hist = useQuery({
    queryKey: ['ssoma-hist', id],
    queryFn: async () => ((await sb.rpc('ssoma_historial' as any, { p_inspeccion: id } as any)).data ?? []) as any[],
  })
  const refrescar = () => { for (const k of ['ssoma-insp', 'ssoma-hist']) qc.invalidateQueries({ queryKey: [k, id] }); qc.invalidateQueries({ queryKey: ['ssoma-panel'] }) }
  const puedeRevisar = ['ing_seguridad', 'admin'].includes(role)
  const [nuevoHz, setNuevoHz] = React.useState(false)

  if (q.isLoading) return <PageBody><SkeletonList rows={6} /></PageBody>
  if (q.error || !q.data) return <PageBody><p className="text-destructive text-[13px]">{mensajeAmigable(q.error ?? 'No existe')}</p></PageBody>
  const d = q.data
  const i = d.inspeccion
  const tipo = TIPOS_INSPECCION[i.tipo] ?? TIPOS_INSPECCION.otro
  const vencidos = (d.documentos as any[]).filter((x) => x.vigencia === 'vencido')
  const banner = i.aptitud === 'no_apto'
    ? (vencidos.length ? `${vencidos.map((x) => x.nombre.split(' · ')[0]).join(', ')} vencido: no apto hasta regularización y revisión`
      : i.hallazgos_abiertos > 0 ? 'Hallazgo abierto: no apto hasta subsanar y verificar' : 'Revisión observada: no apto hasta nueva revisión conforme')
    : null

  return (
    <>
      <PageHeader title={`Detalle de inspección · ${i.codigo}`} description={`${tipo.t}${i.objeto ? ' · ' + i.objeto : ''} · ${i.crew_name ?? 'Sin cuadrilla'}`}
        actions={puedeRevisar && (
          <>
            <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('ssoma-revision', { detail: 'borrador' }))}><Save className="size-4" />Guardar borrador</Button>
            <Button onClick={() => window.dispatchEvent(new CustomEvent('ssoma-revision', { detail: 'registrar' }))}><CheckCircle2 className="size-4" />Registrar revisión</Button>
          </>
        )}>
        <nav className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[12.5px]"><Home className="size-3.5" />
          <Link href="/dashboard" className="hover:text-foreground">Inicio</Link> › <Link href="/ssoma/inspecciones" className="hover:text-foreground">Inspecciones</Link> › <strong className="text-foreground">{i.codigo}</strong></nav>
      </PageHeader>
      <PageBody className="space-y-4">
        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {([['general', 'General', Info], ['documentos', 'Documentos', FolderOpen], ['evidencias', 'Evidencias', ImageIcon], ['hallazgos', `Hallazgos (${d.hallazgos.length})`, TriangleAlert], ['historial', 'Historial', Clock]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => irA(k)} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
              tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}><I className="size-3.5" />{t}</button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-4">
            <Card>
              <CardContent className="grid grid-cols-2 gap-3 p-4 text-[12.5px] sm:grid-cols-4">
                {[[Users, 'Cuadrilla', i.crew_name ?? '—'], [i.vehicle_id ? Truck : tipo.i, i.vehicle_id ? 'Vehículo' : 'Objeto', i.objeto ?? tipo.t],
                  [User, 'Inspector', i.inspector_nombre ?? '—'], [Calendar, 'Fecha', fmtDateTime(i.fecha)]].map(([I, k, v]: any) => (
                  <div key={k} className="flex items-center gap-2"><I className="text-muted-foreground size-4" /><div><p className="text-muted-foreground text-[11px]">{k}</p><p className="font-semibold">{v}</p></div></div>
                ))}
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[[Wrench, 'Estado mecánico', i.estado_mecanico ? i.estado_mecanico.toLowerCase().replace(/ /g, '_') : 'no_aplica', i.estado_mecanico],
                [FileText, 'Vigencia documental', i.vigencia, undefined], [ClipboardCheck, 'Última revisión', i.ultima_revision, undefined], [ShieldX, 'Aptitud', i.aptitud, undefined]].map(([I, t, e, txt]: any) => (
                <div key={t} className="bg-card rounded-xl border border-border px-3 py-2.5">
                  <p className="text-muted-foreground flex items-center gap-1.5 text-[11.5px]"><I className="size-3.5" />{t}</p>
                  <ChipSsoma estado={e} texto={txt} mayus className="mt-1" />
                </div>
              ))}
            </div>
            {banner && <NotaSsoma tono="rojo">{banner}</NotaSsoma>}

            {(tab === 'general' || tab === 'documentos') && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-[14px]">Documentos y controles</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>{['Tipo', 'Referencia', 'Vencimiento', 'Resultado', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead>
                    <tbody>
                      {(d.documentos as any[]).map((x) => (
                        <tr key={x.id} className="border-t border-border">
                          <td className="px-3 py-2"><FileText className="text-muted-foreground mr-1 inline size-3.5" />{x.nombre.split(' · ')[0]}</td>
                          <td className="px-3">{x.codigo} · v{x.version}</td>
                          <td className="px-3">{x.vence_on ? fmtDate(x.vence_on) : '—'}</td>
                          <td className="px-3"><span className="flex gap-1"><ChipSsoma estado={x.vigencia} /><ChipSsoma estado={x.revision} /></span></td>
                          <td className="px-3"><Button size="sm" variant="outline" disabled={!x.archivo_path} onClick={() => abrirArchivoSsoma(x.archivo_path).catch((e) => toast.error(mensajeAmigable(e)))}><Eye className="size-3.5" />Ver archivo</Button></td>
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td className="px-3 py-2"><ClipboardCheck className="text-muted-foreground mr-1 inline size-3.5" />{tipo.t === 'Vehículo' ? 'Checklist' : tipo.t}</td>
                        <td className="px-3">{i.codigo}</td><td className="px-3">{fmtDate(i.fecha)}</td>
                        <td className="px-3"><ChipSsoma estado={i.ultima_revision} /></td>
                        <td className="px-3"><Button size="sm" variant="outline" onClick={() => irA('evidencias')}><Eye className="size-3.5" />Ver detalle</Button></td>
                      </tr>
                    </tbody>
                  </table>
                  {tab === 'documentos' && (i.vehicle_id || i.equipment_id) && (
                    <div className="border-t border-border p-3"><DocumentosSsoma filtroObjeto={{ vehicle_id: i.vehicle_id, equipment_id: i.equipment_id }} /></div>
                  )}
                </CardContent>
              </Card>
            )}

            {(tab === 'general' || tab === 'hallazgos') && (
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Hallazgos vinculados</CardTitle>
                  {puedeRevisar && <Button size="sm" onClick={() => setNuevoHz(true)}><Plus className="size-4" />Registrar hallazgo</Button>}</CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>{['Código', 'Descripción', 'Responsable', 'Fecha', 'Estado', 'Acciones'].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}</tr></thead>
                    <tbody>
                      {(d.hallazgos as any[]).length === 0 && <tr><td colSpan={6} className="text-muted-foreground px-3 py-4 text-center">Sin hallazgos.</td></tr>}
                      {(d.hallazgos as any[]).map((h) => (
                        <tr key={h.id} className="border-t border-border">
                          <td className="px-3 py-2"><Link href={`/ssoma/hallazgos/${h.id}`} className="text-primary font-semibold underline">{h.codigo}</Link></td>
                          <td className="px-3">{h.descripcion}</td><td className="px-3">{h.responsable ?? '—'}</td>
                          <td className={cn('px-3', h.vencido && 'text-destructive font-semibold')}>{fmtDate(h.fecha_limite)}</td>
                          <td className="px-3"><span className="flex gap-1"><ChipSsoma estado={h.estado} />{h.vencido && <ChipSsoma estado="vencido" />}</span></td>
                          <td className="px-3"><Link href={`/ssoma/hallazgos/${h.id}`}><Button size="sm" variant="outline"><Eye className="size-3.5" />Ver</Button></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {tab === 'evidencias' && <EvidenciasSsoma objetoTipo="inspeccion" objetoId={id} codigoObjeto={i.codigo} evidencias={d.evidencias} fotosOrigen={d.fotos_origen ?? []} alCambiar={refrescar} />}
            {tab === 'historial' && <HistorialSsoma eventos={hist.data ?? []} titulo={i.codigo} />}
          </div>

          <div className="space-y-4">
            {puedeRevisar && <FormRevision id={id} borrador={d.revision_borrador} alCambiar={refrescar} />}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Historial</CardTitle>
                <button onClick={() => irA('historial')} className="text-primary flex items-center gap-1 text-[12px] underline"><ExternalLink className="size-3" />Ver historial</button></CardHeader>
              <CardContent>
                <ul className="space-y-2 border-l-2 border-info/30 pl-3 text-[12.5px]">
                  {(hist.data ?? []).slice(0, 4).map((e: any, k: number) => (
                    <li key={e.id} className="relative"><span className={cn('absolute top-1.5 -left-[17px] size-2.5 rounded-full', k === 0 ? 'bg-info' : 'bg-info/40')} />
                      <strong>{fmtDate(e.cuando)}</strong><span className="block">{e.titulo}</span></li>
                  ))}
                  <li className="relative"><span className="bg-info/40 absolute top-1.5 -left-[17px] size-2.5 rounded-full" /><strong>{fmtDate(i.fecha)}</strong><span className="block">Inspección registrada</span></li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
        <NotaSsoma>Cada revisión conserva actor, fecha y evidencia · No modifica avance PCI</NotaSsoma>
      </PageBody>
      {nuevoHz && <NuevoHallazgo inspeccion={i} documentos={d.documentos} cerrar={() => setNuevoHz(false)} alCrear={(hid) => { refrescar(); router.push(`/ssoma/hallazgos/${hid}`) }} />}
    </>
  )
}

function FormRevision({ id, borrador, alCambiar }: { id: string; borrador: any; alCambiar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [resultado, setResultado] = React.useState<string>(borrador?.resultado ?? '')
  const [motivo, setMotivo] = React.useState<string>(borrador?.motivo ?? '')
  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [ocupado, setOcupado] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  // Los botones de la cabecera usan este mismo formulario (no solo desplazan)
  const enviarRef = React.useRef<(b: boolean) => void>(() => {})
  React.useEffect(() => {
    const oir = (e: Event) => {
      const accion = (e as CustomEvent).detail
      document.getElementById('form-revision')?.scrollIntoView({ behavior: 'smooth' })
      if (accion === 'registrar' && (!resultado || !motivo.trim())) { toast.error('Completa el resultado y el motivo para registrar la revisión'); return }
      enviarRef.current(accion === 'borrador')
    }
    window.addEventListener('ssoma-revision', oir)
    return () => window.removeEventListener('ssoma-revision', oir)
  }, [resultado, motivo])
  const enviar = async (esBorrador: boolean) => {
    setOcupado(true)
    try {
      let evidencias: string[] = []
      if (archivo) {
        const r = await adjuntarEvidenciaSsoma({ serviceId: service.id, objetoTipo: 'inspeccion', objetoId: id, archivo, descripcion: motivo || 'Evidencia de la revisión', borrador: esBorrador })
        evidencias = [r.id]
      }
      const { error } = await sb.rpc('ssoma_revisar' as any, { p_objeto_tipo: 'inspeccion', p_objeto_id: id, p_resultado: resultado || null, p_motivo: motivo, p_evidencias: evidencias, p_borrador: esBorrador } as any)
      if (error) throw error
      toast.success(esBorrador ? 'Borrador de revisión guardado' : 'Revisión registrada', { description: esBorrador ? undefined : 'Registrar no cierra hallazgos automáticamente.' })
      setArchivo(null); alCambiar()
    } catch (e) { toast.error(mensajeAmigable(e)) } finally { setOcupado(false) }
  }
  enviarRef.current = enviar
  return (
    <Card id="form-revision">
      <CardHeader className="pb-2"><CardTitle className="text-[14px]">Registrar revisión</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <Elegir etiqueta="Resultado" valor={resultado} cambiar={setResultado} todos="Seleccionar" opciones={[['conforme', '● Conforme'], ['observado', '● Observado']]} />
        <label className="block space-y-1"><span className="font-medium">Motivo</span>
          <Textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo o detalle de la revisión" /></label>
        <input ref={input} type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}><Paperclip className="size-3.5" />Adjuntar evidencia</Button>
          {archivo && <span className="bg-secondary flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px]"><ImageIcon className="size-3" />{archivo.name}<button onClick={() => setArchivo(null)}>✕</button></span>}
        </div>
        <NotaSsoma>Registrar no cierra hallazgos automáticamente</NotaSsoma>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => enviar(true)} loading={ocupado}><Save className="size-4" />Guardar borrador</Button>
          <Button onClick={() => enviar(false)} loading={ocupado} disabled={!resultado || !motivo.trim()}><CheckCircle2 className="size-4" />Registrar revisión</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function NuevoHallazgo({ inspeccion, documentos, cerrar, alCrear }: { inspeccion: any; documentos: any[]; cerrar: () => void; alCrear: (id: string) => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ descripcion: '', limite: toISODate(addDays(new Date(), 1)), responsable: '', documento: '', bloquea: true })
  const crear = async () => {
    const { data, error } = await sb.rpc('ssoma_hallazgo_crear' as any, { p_inspeccion: inspeccion.id, p_descripcion: v.descripcion, p_fecha_limite: v.limite,
      p_responsable: null, p_responsable_texto: v.responsable || null, p_documento: v.documento || null, p_bloquea: v.bloquea } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Hallazgo ${(data as any).codigo} registrado`, { description: 'Se avisó al responsable.' })
    alCrear((data as any).id)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar hallazgo · {inspeccion.codigo}</DialogTitle>
          <DialogDescription>Queda abierto hasta que el responsable responda y SSOMA verifique la subsanación.</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          <Textarea rows={2} maxLength={300} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Ej.: Renovar SOAT" />
          <label className="block"><span className="text-muted-foreground text-[12px]">Fecha límite</span><Input type="date" value={v.limite} onChange={(e) => setV({ ...v, limite: e.target.value })} /></label>
          <Input value={v.responsable} onChange={(e) => setV({ ...v, responsable: e.target.value })} placeholder="Responsable (vacío = jefe de la cuadrilla)" />
          {documentos.length > 0 && <Elegir etiqueta="Documento relacionado" valor={v.documento} cambiar={(x) => setV({ ...v, documento: x })} todos="Ninguno" opciones={documentos.map((x) => [x.id, x.nombre])} />}
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.bloquea} onChange={(e) => setV({ ...v, bloquea: e.target.checked })} />No apto hasta subsanar y verificar</label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={crear} disabled={!v.descripcion.trim()}>Registrar hallazgo</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
