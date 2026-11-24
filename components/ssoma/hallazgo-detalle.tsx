'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Image as ImageIcon, Clock, Truck, Users, ClipboardCheck, User, Calendar, Paperclip, Save, CheckCircle2, Send, Eye, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { ChipSsoma, NotaSsoma, abrirArchivoSsoma, subirArchivoSsoma, pesoArchivo, adjuntarEvidenciaSsoma } from './comun-ssoma'
import { EvidenciasSsoma } from './evidencias-ssoma'
import { FlujoHallazgo } from './hallazgos-ssoma'
import { Elegir } from './control-ssoma'
import { HistorialSsoma } from './historial-ssoma'

/**
 * «Hallazgo H-NNN» (SSOMA_04/06): seguimiento y verificación de la
 * subsanación. Línea de tiempo trazable; el responsable responde con
 * evidencia (pasa a «Por verificar») y SSOMA registra la revisión: cerrar
 * solo si resulta conforme y con la verificación expresa. Se conserva el
 * historial.
 */
type Tab = 'detalle' | 'evidencias' | 'historial'

export function HallazgoDetalle({ id }: { id: string }) {
  const { role, service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'historial'
  const irA = (t: Tab) => { const n = new URLSearchParams(sp.toString()); n.set('tab', t); router.replace(`${pathname}?${n.toString()}`, { scroll: false }) }
  const q = useQuery({
    queryKey: ['ssoma-hz', id],
    queryFn: async () => {
      const { data: h, error } = await sb.from('ssoma_hallazgos' as any).select('*, ssoma_inspecciones(id, codigo, tipo, vehicle_id), crews(name), profiles!ssoma_hallazgos_responsable_id_fkey(full_name)').eq('id', id).maybeSingle()
      if (error) throw error
      if (!h) return null
      const [{ data: ev }, { data: hist }, { data: doc }] = await Promise.all([
        sb.from('ssoma_evidencias' as any).select('*, profiles:autor(full_name)').eq('objeto_tipo', 'hallazgo').eq('objeto_id', id).order('numero'),
        sb.rpc('ssoma_historial' as any, { p_hallazgo: id } as any),
        (h as any).documento_id ? sb.from('ssoma_documentos' as any).select('nombre, ssoma_documento_versiones(version, vence_on, revision)').eq('id', (h as any).documento_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      return { h: h as any, evidencias: ((ev ?? []) as any[]).map((e) => ({ ...e, autor: e.profiles?.full_name })), historial: (hist ?? []) as any[], doc: doc as any }
    },
  })
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['ssoma-hz', id] }); qc.invalidateQueries({ queryKey: ['ssoma-hallazgos'] }) }
  if (q.isLoading) return <PageBody><SkeletonList rows={6} /></PageBody>
  if (!q.data) return <PageBody><p className="text-muted-foreground text-[13px]">El hallazgo no existe o no tienes acceso.</p></PageBody>
  const { h, evidencias, historial, doc } = q.data
  const vencido = h.estado !== 'cerrado' && h.fecha_limite < new Date().toISOString().slice(0, 10)
  const puedeRevisar = ['ing_seguridad', 'admin'].includes(role)
  const responsable = h.profiles?.full_name ?? h.responsable_texto ?? '—'
  const ultVersion = ((doc?.ssoma_documento_versiones ?? []) as any[]).sort((a, b) => b.version - a.version)[0]
  const vigenciaDoc = !ultVersion ? 'Pendiente de comprobar' : !ultVersion.vence_on ? 'No aplica' : ultVersion.vence_on < new Date().toISOString().slice(0, 10) ? `Vencido (${fmtDate(ultVersion.vence_on)})` : `Vigente hasta ${fmtDate(ultVersion.vence_on)}`
  const timeline = [...historial].reverse()

  return (
    <>
      <PageHeader title={`Hallazgo ${h.codigo}`} description="Seguimiento y verificación de subsanación" />
      <PageBody className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-4 text-[12.5px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[15px] font-bold"><Truck className="text-info size-5" />{h.descripcion}{h.ssoma_inspecciones?.tipo === 'vehiculo' ? '' : ''}</p>
              <span className="flex gap-1"><ChipSsoma estado={h.estado} />{vencido && <ChipSsoma estado="vencido" />}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[[Users, 'Cuadrilla', h.crews?.name ?? '—'], [ClipboardCheck, 'Origen', h.ssoma_inspecciones ? <Link key="o" href={`/ssoma/inspecciones/${h.ssoma_inspecciones.id}`} className="text-primary underline">{h.ssoma_inspecciones.codigo}</Link> : '—'],
                [User, 'Responsable', responsable], [Calendar, 'Fecha límite', fmtDate(h.fecha_limite)]].map(([I, k, v]: any) => (
                <div key={k} className="flex items-center gap-2"><I className="text-muted-foreground size-4" /><div><p className="text-muted-foreground text-[11px]">{k}</p><p className={cn('font-semibold', k === 'Fecha límite' && vencido && 'text-destructive')}>{v}</p></div></div>
              ))}
            </div>
            <FlujoHallazgo estado={h.estado} />
          </CardContent>
        </Card>
        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {([['detalle', 'Detalle', FileText], ['evidencias', 'Evidencias', ImageIcon], ['historial', 'Historial', Clock]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => irA(k)} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
              tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}><I className="size-3.5" />{t}</button>
          ))}
        </div>
        {h.estado !== 'cerrado' && h.bloquea_aptitud && <NotaSsoma tono="rojo">No apto hasta revisión documental conforme.</NotaSsoma>}

        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {tab === 'detalle' && (
              <Card><CardContent className="space-y-2 p-4 text-[13px]">
                <p><strong>Descripción:</strong> {h.descripcion}</p>
                <p><strong>Registrado:</strong> {fmtDateTime(h.creado_at)}</p>
                {doc && <p><strong>Documento:</strong> {doc.nombre} · v{ultVersion?.version} · <ChipSsoma estado={ultVersion?.revision} /></p>}
                {h.cerrado_at && <p><strong>Cerrado:</strong> {fmtDateTime(h.cerrado_at)}</p>}
                <p className="text-muted-foreground">«Vencido» es la condición de la fecha límite pasada; el estado del flujo se mantiene.</p>
              </CardContent></Card>
            )}
            {tab === 'evidencias' && <EvidenciasSsoma objetoTipo="hallazgo" objetoId={id} codigoObjeto={h.codigo} evidencias={evidencias} alCambiar={refrescar} />}
            {tab === 'historial' && <HistorialSsoma eventos={historial} titulo={h.codigo} />}
          </div>
          <div className="space-y-4">
            {h.estado !== 'cerrado' && !puedeRevisar && <Responder id={id} alCambiar={refrescar} />}
            {h.estado !== 'cerrado' && puedeRevisar && <NuevaRevision id={id} vigencia={vigenciaDoc} alCambiar={refrescar} />}
            {h.estado === 'cerrado' && <NotaSsoma>Hallazgo cerrado tras verificación. Se conserva el historial.</NotaSsoma>}
            <p className="text-muted-foreground flex items-center gap-2 text-[12px]"><RefreshCw className="size-3.5" />Sincronizado · {fmtDateTime(new Date())} · {profile.full_name}</p>
          </div>
        </div>
      </PageBody>
    </>
  )
}

function NuevaRevision({ id, vigencia, alCambiar }: { id: string; vigencia: string; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const { service } = useSession()
  const [resultado, setResultado] = React.useState('')
  const [motivo, setMotivo] = React.useState('')
  const [verificado, setVerificado] = React.useState(false)
  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [ocupado, setOcupado] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  // Recupera el borrador propio posterior a la última revisión registrada
  const borr = useQuery({
    queryKey: ['ssoma-borrador', 'hallazgo', id],
    queryFn: async () => ((await sb.rpc('ssoma_borrador' as any, { p_objeto_tipo: 'hallazgo', p_objeto_id: id } as any)).data ?? null) as any,
  })
  React.useEffect(() => {
    if (borr.data) { setResultado((r) => r || borr.data.resultado || ''); setMotivo((m) => m || borr.data.motivo || '') }
  }, [borr.data])
  const enviar = async (borrador: boolean) => {
    setOcupado(true)
    try {
      let evidencias: string[] = []
      if (archivo) {
        const r = await adjuntarEvidenciaSsoma({ serviceId: service.id, objetoTipo: 'hallazgo', objetoId: id, archivo, descripcion: motivo || 'Evidencia de la verificación', borrador: borrador })
        evidencias = [r.id]
      }
      const { error } = await sb.rpc('ssoma_revisar' as any, { p_objeto_tipo: 'hallazgo', p_objeto_id: id, p_resultado: resultado || null, p_motivo: motivo,
        p_evidencias: evidencias, p_borrador: borrador, p_verificado: verificado } as any)
      if (error) throw error
      toast.success(borrador ? 'Borrador guardado' : resultado === 'conforme' ? 'Hallazgo cerrado tras verificación' : 'Subsanación observada: el hallazgo vuelve a abierto')
      setArchivo(null); if (!borrador) { setMotivo(''); setResultado(''); setVerificado(false) }
      alCambiar()
    } catch (e) { toast.error(mensajeAmigable(e)) } finally { setOcupado(false) }
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[14px]">Nueva revisión</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        {borr.data && <p className="bg-warning/10 text-warning rounded-md px-2 py-1 text-[11.5px]">Borrador recuperado del {fmtDateTime(borr.data.cuando)}.</p>}
        <Elegir etiqueta="Resultado" valor={resultado} cambiar={setResultado} todos="Seleccionar" opciones={[['conforme', 'Conforme (cerrar)'], ['observado', 'Observado (vuelve a abierto)']]} />
        <label className="block"><span className="text-muted-foreground text-[12px]">Vigencia documental</span><Input readOnly value={vigencia} className="bg-secondary h-9" /></label>
        <label className="block space-y-1"><span className="font-medium">Motivo o detalle de la revisión</span>
          <Textarea rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ingrese el motivo o detalle de la revisión..." />
          <span className="text-muted-foreground block text-right text-[11px]">{motivo.length} / 500</span></label>
        <input ref={input} type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => input.current?.click()}><Paperclip className="size-3.5" />Adjuntar evidencia</Button>
          {archivo && <span className="text-[11.5px]">{archivo.name} <button onClick={() => setArchivo(null)}>✕</button></span>}</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={verificado} onChange={(e) => setVerificado(e.target.checked)} />He verificado el documento y el vehículo.</label>
        <NotaSsoma>Cerrar hallazgo solo si la revisión resulta conforme. Se conserva el historial.</NotaSsoma>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => enviar(true)} loading={ocupado}><Save className="size-4" />Guardar borrador</Button>
          <Button onClick={() => enviar(false)} loading={ocupado} disabled={!resultado || !motivo.trim() || (resultado === 'conforme' && !verificado)}><CheckCircle2 className="size-4" />Registrar revisión</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** El responsable (jefe, administración) envía la subsanación con su evidencia. */
function Responder({ id, alCambiar }: { id: string; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const { service } = useSession()
  const [texto, setTexto] = React.useState('')
  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [ocupado, setOcupado] = React.useState(false)
  const enviar = async () => {
    setOcupado(true)
    try {
      let evidencias: string[] = []
      if (archivo) {
        const r = await adjuntarEvidenciaSsoma({ serviceId: service.id, objetoTipo: 'hallazgo', objetoId: id, archivo, descripcion: texto || 'Subsanación', borrador: false })
        evidencias = [r.id]
      }
      const { error } = await sb.rpc('ssoma_hallazgo_responder' as any, { p_hallazgo: id, p_texto: texto, p_evidencias: evidencias } as any)
      if (error) throw error
      toast.success('Subsanación enviada', { description: 'SSOMA la verificará antes de cerrar el hallazgo.' })
      setTexto(''); setArchivo(null); alCambiar()
    } catch (e) { toast.error(mensajeAmigable(e)) } finally { setOcupado(false) }
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[14px]">Responder (subsanación)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <Textarea rows={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué se corrigió. Ej.: Adjunto SOAT vigente." />
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        <NotaSsoma tono="ambar">Responder no cierra el hallazgo: queda «Por verificar» hasta que SSOMA lo revise.</NotaSsoma>
        <Button className="w-full" onClick={enviar} loading={ocupado} disabled={!texto.trim()}><Send className="size-4" />Enviar subsanación</Button>
      </CardContent>
    </Card>
  )
}
