'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Home, Image as ImageIcon, MessageSquare, History, FileText, CheckCircle2, AlertCircle, Eye, Download,
  ExternalLink, ArrowLeftRight, Info, Upload, RotateCcw, Send, Calendar, Clock, MapPin, User, Ruler,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { ImageViewer } from '@/components/shared/image-viewer'
import { cn, fmtDate, fmtDateTime, fmtProgresiva, fmtNumber } from '@/lib/utils'
import { etiquetaDeLado } from '@/lib/lados'
import { fotosOficiales, aJpegReal } from '@/lib/fotos-oficiales'
import { descargarPdf, nombreCliente, type ReportMeta } from '@/lib/reports'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Revisión del ítem» (maquetas V02/V06, V11/V12, V13/V14; guía 3.6 y 9.3–9.7).
 *
 * El único detalle de un ítem PCI, para todos los roles: datos oficiales en
 * lectura, pestañas Evidencia · Observaciones · Historial · Documentos y el
 * panel de decisión que corresponde a quien mira:
 *   · Supervisor / Administrador: Validar SERVICON o Devolver al jefe.
 *   · Residente: Publicar a COVINCA u Observar (no repite la validación).
 *   · Visor COVINCA: Observar (motivo y fase) o Aceptar, solo sobre la
 *     versión publicada vigente y con la evidencia completa.
 * Los estados van separados: ejecución, evidencia, SERVICON, publicación,
 * COVINCA. Nada de esto crea otra ejecución: se revisa el mismo registro.
 */

const FASES = [
  { v: 'antes', t: 'Antes', n: 1 }, { v: 'durante', t: 'Durante', n: 2 }, { v: 'despues', t: 'Después', n: 3 },
] as const
const faseLegible = (f?: string | null) => ({ antes: 'Antes', durante: 'Durante', despues: 'Después', general: 'General', metrado: 'Metrado', otro: 'Otro' } as Record<string, string>)[f ?? ''] ?? '—'
const ORIGEN: Record<string, string> = { camara_sigov: 'Cámara SIGOV', galeria: 'Galería', archivo_web: 'Archivo web' }

type Tab = 'evidencia' | 'observaciones' | 'historial' | 'documentos'

/** Lo que necesita cualquier vista de revisión de un ítem (página y bandeja). */
export function useRevisionDatos(itemId: string) {
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const item = useQuery({
    queryKey: ['rev-item', itemId],
    queryFn: async () => {
      const [{ data: v, error }, { data: p }] = await Promise.all([
        sb.from('v_pci_items').select('*').eq('id', itemId).maybeSingle(),
        sb.from('pci_items').select('publicacion_version, publicado_at, covinca_estado, covinca_version, publicacion_pendiente, closed_by')
          .eq('id', itemId).maybeSingle(),
      ])
      if (error) throw error
      if (!v) return null
      return { ...(v as any), ...((p ?? {}) as any) }
    },
  })
  const estado = useQuery({
    queryKey: ['rev-estado', itemId],
    queryFn: async () => {
      const [{ data: e }, { data: s }] = await Promise.all([
        sb.rpc('pci_item_estado', { p_item: itemId }), sb.rpc('pci_item_sector' as any, { p_item: itemId } as any),
      ])
      return { ...(e as any), sector: s as string | null }
    },
  })
  const fotos = useQuery({
    queryKey: ['rev-fotos', itemId],
    queryFn: async () => {
      const { data } = await sb.from('v_evidences')
        .select('id, phase, storage_path, thumb_path, master_path, taken_at, cargada_at, created_at, origen_captura, created_by_name, publicada_version, sello_aplicado, lat, lng, apoyo_id, autorizacion_pendiente')
        .eq('pci_item_id', itemId).order('taken_at')
      const filas = (data ?? []) as any[]
      const rutas = [...new Set(filas.flatMap((f) => [f.thumb_path, f.storage_path]).filter(Boolean))] as string[]
      const urls = new Map<string, string>()
      for (let i = 0; i < rutas.length; i += 100) {
        const { data: s } = await sb.storage.from('evidencias').createSignedUrls(rutas.slice(i, i + 100), 3600)
        for (const x of s ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl)
      }
      return filas.map((f) => ({ ...f, mini: urls.get(f.thumb_path ?? f.storage_path) ?? null, url: urls.get(f.storage_path) ?? null }))
    },
  })
  const obs = useQuery({
    queryKey: ['rev-obs', itemId],
    queryFn: async () => ((await sb.rpc('observaciones_de', { p_item: itemId })).data ?? []) as any[],
  })
  const historial = useQuery({
    queryKey: ['rev-hist', itemId],
    queryFn: async () => ((await sb.rpc('pci_item_historial', { p_item: itemId })).data ?? []) as any[],
  })
  const publicaciones = useQuery({
    queryKey: ['rev-pub', itemId],
    queryFn: async () => {
      const { data } = await sb.from('pci_item_publicaciones').select('version, cuando, nota, evidencias, profiles:quien(full_name)')
        .eq('pci_item_id', itemId).order('version')
      return (data ?? []) as any[]
    },
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['bandeja-revision'] })
    for (const k of ['rev-item', 'rev-estado', 'rev-fotos', 'rev-obs', 'rev-hist', 'rev-pub']) qc.invalidateQueries({ queryKey: [k, itemId] })
    qc.invalidateQueries({ queryKey: ['inicio-pci'] })
  }

  // Lo cargado en apoyo fuera de la vigencia no cuenta hasta que el Supervisor lo autoriza
  const autorizadas = React.useMemo(() => (fotos.data ?? []).filter((f: any) => !f.autorizacion_pendiente), [fotos.data])
  const pendientes = React.useMemo(() => (fotos.data ?? []).filter((f: any) => f.autorizacion_pendiente), [fotos.data])
  return { item, estado, fotos, autorizadas, pendientes, obs, historial, publicaciones, refrescar }
}

export function RevisionItem({ pciId, itemId }: { pciId: string; itemId: string }) {
  const { role, service, profile } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const tab = (sp.get('tab') as Tab) ?? 'evidencia'
  const irA = (t: Tab) => {
    const n = new URLSearchParams(sp.toString()); n.set('tab', t)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const esVisor = role === 'visor'

  const { item, estado, fotos, autorizadas, pendientes, obs, historial, publicaciones, refrescar } = useRevisionDatos(itemId)

  const i = item.data
  const e = estado.data
  if (item.isLoading) return <PageBody><SkeletonList rows={6} /></PageBody>
  if (!i) {
    return (
      <PageBody>
        <Card><CardContent className="p-6 text-[13.5px]">
          {esVisor ? 'Este ítem aún no está publicado para COVINCA o no existe.' : 'No tienes acceso a este ítem o ya no existe.'}
          {' '}<Link className="text-primary underline" href={`/pci/${pciId}`}>Volver al PCI</Link>
        </CardContent></Card>
      </PageBody>
    )
  }
  const pciCorto = String(i.pci_code ?? '').replace(/^PCI-\d{4}-0*/, 'PCI ')

  return (
    <>
      <PageHeader
        title={`Revisión del ítem ${i.item_number}`}
        description={`${pciCorto} · ${i.pci_title ?? ''}`}
      >
        <nav className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[12.5px]">
          <Home className="size-3.5" />
          <Link href={`/pci/${pciId}`} className="hover:text-foreground">{pciCorto}</Link> /
          <Link href={`/pci/${pciId}?plazo=${i.term_days}`} className="hover:text-foreground">{i.term_days} {i.term_days === 1 ? 'día' : 'días'}</Link> /
          <span className="text-foreground font-medium">Ítem {i.item_number}</span>
        </nav>
      </PageHeader>
      <PageBody className="space-y-4">
        {/* Datos oficiales en lectura */}
        <Card>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-4 xl:grid-cols-7">
            {[
              ['Actividad', i.activity_name ?? '—'], ['Sector', e?.sector ?? '—'],
              ['Progresiva', `${i.prog_start_txt ?? fmtProgresiva(i.prog_start_m)}${i.prog_end_m && i.prog_end_m !== i.prog_start_m ? ` – ${i.prog_end_txt ?? fmtProgresiva(i.prog_end_m)}` : ''}`],
              ['Lado', i.side ? etiquetaDeLado(i.side) : 'Sin indicar'], ['Responsable', i.crew_name ?? i.encargado ?? 'Sin asignar'],
              ['Plazo', `${i.term_days} ${i.term_days === 1 ? 'día' : 'días'}`], ['Vencimiento', fmtDate(i.due_date)],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <p className="text-muted-foreground text-[11px]">{k}</p>
                <p className="truncate font-medium" title={String(v)}>{v}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-4">
            <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
              {([['evidencia', 'Evidencia', ImageIcon], ['observaciones', 'Observaciones', MessageSquare], ['historial', 'Historial', History], ['documentos', 'Documentos', FileText]] as const).map(([k, t, Icono]) => (
                <button key={k} onClick={() => irA(k)}
                  className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                    tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <Icono className="size-3.5" />{t}
                  {k === 'observaciones' && (obs.data ?? []).some((o) => o.estado !== 'cerrada') && <span className="bg-destructive size-1.5 rounded-full" />}
                </button>
              ))}
            </div>

            {tab === 'evidencia' && <TabEvidencia item={i} fotos={autorizadas} pendientes={pendientes} cargando={fotos.isLoading} historial={historial.data ?? []} />}
            {tab === 'observaciones' && <TabObservaciones item={i} obs={obs.data ?? []} fotos={autorizadas} rol={role} alCambiar={refrescar} />}
            {tab === 'historial' && <TabHistorial historial={historial.data ?? []} item={i} />}
            {tab === 'documentos' && (
              <TabDocumentos item={i} fotos={autorizadas} historial={historial.data ?? []} publicaciones={publicaciones.data ?? []}
                esVisor={esVisor} meta={{
                  titulo: `${pciCorto} · Ítem ${i.item_number}`, servicio: service.name, cliente: nombreCliente((service as any).client_name),
                  periodo: `Al ${fmtDate(new Date())}`, generadoPor: profile.full_name, cuadrilla: i.crew_name,
                }} />
            )}
          </div>

          <PanelDecision item={i} estado={e} fotos={autorizadas} rol={role} alCambiar={refrescar} />
        </div>
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function TabEvidencia({ item, fotos, pendientes = [], cargando, historial }: { item: any; fotos: any[]; pendientes?: any[]; cargando: boolean; historial: any[] }) {
  const [grande, setGrande] = React.useState<any | null>(null)
  const generales = fotos.filter((f) => !['antes', 'durante', 'despues'].includes(f.phase))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {FASES.map((fa) => {
          const de = fotos.filter((f) => f.phase === fa.v)
          const primera = de[0]
          return (
            <Card key={fa.v} className="overflow-hidden">
              <div className="bg-primary/[0.07] flex items-center justify-between px-3 py-2 text-[12.5px] font-semibold">
                <span>{fa.t} ({fa.n})</span>
                <span className={cn('text-[11.5px]', de.length ? 'text-success' : 'text-destructive')}>
                  {de.length ? `${de.length} ${de.length === 1 ? 'foto' : 'fotos'}` : 'Sin archivo'}
                </span>
              </div>
              {primera ? (
                <button onClick={() => setGrande(primera)} className="bg-muted block aspect-[4/3] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {primera.mini && <img src={primera.mini} alt={fa.t} className="size-full object-cover" />}
                </button>
              ) : (
                <div className="text-muted-foreground flex aspect-[4/3] items-center justify-center border-2 border-dashed border-border text-[12.5px]">Sin archivo</div>
              )}
              <div className="text-muted-foreground space-y-0.5 px-3 py-2 text-[11.5px]">
                <p className="flex items-center gap-1.5"><Calendar className="size-3" />Captura: {primera ? fmtDateTime(primera.taken_at) : '—'}</p>
                <p className="flex items-center gap-1.5"><Upload className="size-3" />Origen: {primera ? ORIGEN[primera.origen_captura] ?? 'Cámara SIGOV' : '—'}</p>
                <p className="flex items-center gap-1.5"><User className="size-3" />{primera?.created_by_name ?? '—'}{primera?.apoyo_id ? ' · apoyo temporal' : ''}{primera?.publicada_version ? ` · v${primera.publicada_version}` : ''}</p>
                {de.length > 1 && (
                  <div className="flex gap-1 pt-1">
                    {de.slice(1, 5).map((x) => (
                      <button key={x.id} onClick={() => setGrande(x)} className="bg-muted size-10 overflow-hidden rounded">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {x.mini && <img src={x.mini} alt="" className="size-full object-cover" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      {pendientes.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader><CardTitle className="text-warning text-[14px]">Pendientes de autorización ({pendientes.length})</CardTitle>
            <CardDescription>Cargadas en apoyo temporal fuera de su vigencia (sin conexión). No cuentan como evidencia hasta que el Supervisor las autoriza en «Apoyo temporal › Historial»; no se eliminan solas.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {pendientes.map((x) => (
              <button key={x.id} onClick={() => setGrande(x)} className="bg-muted relative size-20 overflow-hidden rounded-md ring-2 ring-warning/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.mini && <img src={x.mini} alt="" className="size-full object-cover opacity-80" />}
                <span className="bg-warning absolute right-0 bottom-0 left-0 text-center text-[10px] font-semibold text-white">{faseLegible(x.phase)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
      {generales.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-[14px]">Evidencia general / complementaria</CardTitle>
            <CardDescription>No reemplaza una fase faltante.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {generales.map((x) => (
              <button key={x.id} onClick={() => setGrande(x)} className="bg-muted size-20 overflow-hidden rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.mini && <img src={x.mini} alt="" className="size-full object-cover" />}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
      {cargando && <SkeletonList rows={2} />}
      <TabHistorial historial={historial} item={item} titulo="Historial del ítem" />
      <Dialog open={!!grande} onOpenChange={(v) => !v && setGrande(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{faseLegible(grande?.phase)} · Ítem {item.item_number}</DialogTitle>
            <DialogDescription>
              Captura {fmtDateTime(grande?.taken_at)} · Carga {fmtDateTime(grande?.cargada_at ?? grande?.created_at)} · Sincronización {fmtDateTime(grande?.created_at)}
              {grande?.lat == null ? ' · GPS no disponible' : ''}
            </DialogDescription>
          </DialogHeader>
          {grande?.url && <ImageViewer src={grande.url} alt="Foto" descargar={`ITEM_${item.item_number}_${grande.phase}.webp`} className="h-[65vh] w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function TabHistorial({ historial, item, titulo }: { historial: any[]; item: any; titulo?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">{titulo ?? 'Historial'}</CardTitle>
        <CardDescription>Inalterable: cada evento con quién, cuándo, origen y versión.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="text-muted-foreground text-[11.5px]">
            <tr className="border-b border-border">
              <th className="py-1.5 text-left font-medium">Fecha</th><th className="text-left font-medium">Usuario</th>
              <th className="text-left font-medium">Origen</th><th className="text-left font-medium">Evento</th>
              <th className="text-left font-medium">Versión</th>
            </tr>
          </thead>
          <tbody>
            {[...historial].reverse().map((h, k) => (
              <tr key={k} className="even:bg-secondary/40 border-b border-border/50">
                <td className="py-1.5 whitespace-nowrap">{fmtDateTime(h.cuando)}</td>
                <td>{h.quien ?? '—'}</td>
                <td>{h.entidad ?? 'SERVICON'}</td>
                <td className="max-w-md">{h.detalle}</td>
                <td>{h.version ? `v${h.version}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {historial.length === 0 && <p className="text-muted-foreground py-4 text-center text-[13px]">Sin eventos.</p>}
        {item.publicacion_version > 0 && (
          <p className="text-muted-foreground mt-2 text-[11.5px]">Versión publicada vigente: v{item.publicacion_version}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function ChipEstado({ texto, tono }: { texto: string; tono: 'info' | 'success' | 'warning' | 'violet' | 'muted' | 'danger' }) {
  const c = {
    danger: 'bg-destructive/12 text-destructive',
    info: 'bg-info/12 text-info', success: 'bg-success/12 text-success', warning: 'bg-warning/15 text-warning',
    violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', muted: 'bg-secondary text-muted-foreground',
  }[tono]
  return <span className={cn('rounded-md px-2 py-1.5 text-[11.5px] font-semibold', c)}>{texto}</span>
}

function PanelDecision({ item: i, estado: e, fotos, rol, alCambiar }: { item: any; estado: any; fotos: any[]; rol: string; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [motivo, setMotivo] = React.useState('')
  const [fase, setFase] = React.useState<string>('')
  const [ocupado, setOcupado] = React.useState(false)
  const esVisor = rol === 'visor'
  const esServicon = ['admin', 'supervisor', 'residente'].includes(rol)
  const faltan: string[] = e?.fases_faltantes ?? []

  const llamar = async (fn: () => Promise<{ error: any; data?: any }>, ok: string) => {
    setOcupado(true)
    const { error, data } = await fn()
    setOcupado(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    const omitidos = (data as any)?.omitidos as any[] | undefined
    if (omitidos?.length) toast.warning(`No se publicó: ${omitidos.map((o) => `ítem ${o.item} (${o.motivo})`).join(', ')}`)
    else toast.success(ok)
    setMotivo(''); setFase('')
    alCambiar()
  }
  const validar = (conforme: boolean) => llamar(() => sb.rpc('pci_validar', {
    p_item: i.id, p_conforme: conforme, p_nota: motivo.trim() || null, p_fase: fase || null,
    p_version: esVisor ? i.publicacion_version : null,
  } as any) as any, conforme ? (esVisor ? 'Conforme COVINCA registrado' : 'Validado SERVICON') : 'Observación registrada; la cuadrilla recibe el aviso')
  const publicar = () => llamar(() => sb.rpc('pci_publicar', { p_items: [i.id], p_nota: motivo.trim() || null } as any) as any, 'Publicado a COVINCA')

  const porValidar = ['levantado', 'subsanado'].includes(i.status) && !i.validado_servicon_at
  const porPublicar = !!i.validado_servicon_at && ['levantado', 'subsanado'].includes(i.status)
    && (i.publicacion_version === 0 || i.publicacion_pendiente || i.covinca_estado === 'observado')
  const visorPuedeObservar = esVisor && ['por_revisar', 'conforme'].includes(i.covinca_estado)
    && !(i.covinca_estado === 'observado' && i.covinca_version === i.publicacion_version)
  const visorPuedeAceptar = esVisor && i.covinca_estado === 'por_revisar' && faltan.length === 0
  const motivoAceptar = !esVisor ? '' : i.covinca_estado !== 'por_revisar'
    ? (i.covinca_estado === 'conforme' ? `La versión v${i.covinca_version} ya tiene conformidad.` : 'Espera la nueva versión publicada por SERVICON.')
    : faltan.length ? `Aceptar requiere resolver falta de evidencia (${faltan.map(faseLegible).join(', ')}).` : ''

  return (
    <Card className="h-fit xl:sticky xl:top-4">
      <CardHeader>
        <CardTitle className="text-[15px]">{esVisor ? 'Decisión del cliente' : 'Revisión'}</CardTitle>
        <CardDescription>Estados separados · Historial inalterable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          <ChipEstado texto={e?.ejecucion === 'atendido_reportado' ? 'Atendido reportado' : e?.ejecucion === 'en_ejecucion' ? 'En ejecución' : 'Por atender'}
            tono={e?.ejecucion === 'atendido_reportado' ? 'info' : 'muted'} />
          <ChipEstado texto={e?.evidencia === 'completa' ? 'Evidencia completa' : e?.evidencia === 'incompleta' ? 'Evidencia incompleta' : 'Sin evidencia'}
            tono={e?.evidencia === 'completa' ? 'success' : 'violet'} />
          <ChipEstado texto={e?.servicon === 'validado' ? 'Validado SERVICON' : e?.servicon === 'observado' ? 'Observado SERVICON' : e?.servicon === 'por_validar' ? 'Por validar SERVICON' : 'Sin enviar'}
            tono={e?.servicon === 'validado' ? 'success' : e?.servicon === 'observado' ? 'violet' : 'muted'} />
          <ChipEstado texto={i.covinca_estado === 'conforme' ? 'Conforme COVINCA' : i.covinca_estado === 'observado' ? 'Observado COVINCA'
              : i.covinca_estado === 'por_revisar' ? 'Por revisar COVINCA' : 'Borrador interno'}
            tono={i.covinca_estado === 'conforme' ? 'success' : i.covinca_estado === 'observado' ? 'violet' : i.covinca_estado === 'por_revisar' ? 'info' : 'muted'} />
          <ChipEstado texto={e?.plazo === 'vencido' ? 'Vencido' : e?.plazo === 'por_vencer' ? 'Por vencer' : e?.plazo === 'cerrado' ? 'Plazo cerrado' : 'En plazo'}
            tono={e?.plazo === 'vencido' ? 'danger' : e?.plazo === 'por_vencer' ? 'warning' : 'muted'} />
          <ChipEstado texto={i.publicacion_version > 0 ? `Publicado v${i.publicacion_version}${i.publicacion_pendiente ? ' · versión nueva pendiente' : ''}` : 'No publicado'}
            tono={i.publicacion_version > 0 ? 'info' : 'muted'} />
        </div>
        {faltan.length > 0 && (
          <p className="bg-warning/12 text-warning flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium">
            <AlertCircle className="size-4" />Falta foto {faltan.map(faseLegible).join(', ')}
          </p>
        )}

        {(esVisor || (esServicon && (porValidar || (rol === 'residente' && porPublicar)))) && (
          <>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium">{esVisor || rol === 'residente' ? 'Motivo' : 'Motivo de devolución'}<span className="text-destructive">*</span> <span className="text-muted-foreground font-normal">(obligatorio al observar)</span></span>
              <Textarea rows={3} maxLength={500} value={motivo} onChange={(x) => setMotivo(x.target.value)}
                placeholder={faltan[0] ? `Falta foto ${faseLegible(faltan[0]).toLowerCase()}` : 'Qué se debe corregir'} />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium">Fase</span>
              <Select value={fase || '__ninguna'} onValueChange={(v) => setFase(v === '__ninguna' ? '' : v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ninguna">No aplica</SelectItem>
                  {['antes', 'durante', 'despues', 'general', 'metrado', 'otro'].map((f) => <SelectItem key={f} value={f}>{faseLegible(f)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </>
        )}

        {/* Visor COVINCA */}
        {esVisor && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => validar(false)} loading={ocupado} disabled={!visorPuedeObservar || !motivo.trim()}>Observar</Button>
              <Button variant="outline" onClick={() => validar(true)} loading={ocupado} disabled={!visorPuedeAceptar}>Aceptar</Button>
            </div>
            {motivoAceptar && <p className="bg-info/[0.08] text-info flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[12px]"><Info className="mt-0.5 size-3.5 shrink-0" />{motivoAceptar}</p>}
          </div>
        )}

        {/* Supervisor / Administrador / Residente: validar SERVICON o devolver */}
        {esServicon && porValidar && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => validar(true)} loading={ocupado} disabled={faltan.length > 0}>
                <CheckCircle2 className="size-4" />Validar SERVICON
              </Button>
              <Button variant="outline" onClick={() => validar(false)} loading={ocupado} disabled={!motivo.trim()}>
                <RotateCcw className="size-4" />Devolver al jefe
              </Button>
            </div>
            {faltan.length > 0 && <p className="text-muted-foreground text-[12px]">Validar SERVICON: falta evidencia requerida ({faltan.map(faseLegible).join(', ')}).</p>}
          </div>
        )}

        {/* Residente: publicar a COVINCA */}
        {rol === 'residente' && porPublicar && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={publicar} loading={ocupado}><Send className="size-4" />Publicar a COVINCA</Button>
              <Button variant="outline" onClick={() => validar(false)} loading={ocupado} disabled={!motivo.trim()}>Observar</Button>
            </div>
            <p className="text-muted-foreground text-[12px]">Solo con permiso. No requiere segunda validación obligatoria. Publicar no equivale a conformidad del cliente.</p>
          </div>
        )}

        {esServicon && !porValidar && !(rol === 'residente' && porPublicar) && (
          <p className="text-muted-foreground text-[12.5px]">
            {i.status === 'observado' ? 'Observado: la cuadrilla debe subsanar sobre esta misma intervención.'
              : i.status === 'validado' ? 'Cerrado con conformidad COVINCA.'
              : i.validado_servicon_at ? (rol === 'residente' ? `Publicado v${i.publicacion_version}; espera la revisión de COVINCA.` : 'Validado SERVICON; la publicación a COVINCA la hace el Residente.')
              : 'Sin acciones de revisión pendientes.'}
          </p>
        )}
        {rol === 'jefe_cuadrilla' && (
          <p className="text-muted-foreground text-[12.5px]">La revisión la hacen el Supervisor y COVINCA; el jefe no aprueba su propio trabajo.</p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3 text-[12.5px]">
          <span className="flex items-center gap-1.5"><FileText className="size-3.5" />Confirmación / última versión</span>
          <Badge variant="info">{i.publicacion_version > 0 ? `v${i.publicacion_version}` : 'interna'}</Badge>
        </div>
        <DescargarSeleccion item={i} fotos={fotos} />
      </CardContent>
    </Card>
  )
}

/** Descargar las fotos oficiales del ítem como JPG real con su nombre de fase. */
function DescargarSeleccion({ item, fotos }: { item: any; fotos: any[] }) {
  const sb = React.useMemo(() => createClient(), [])
  const [ocupado, setOcupado] = React.useState(false)
  const bajar = async () => {
    setOcupado(true)
    try {
      const { oficiales, faltan } = fotosOficiales(item.item_number, fotos)
      if (!oficiales.length) { toast.info('Sin fotos para descargar'); return }
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const carpeta = `PCI_${String(item.pci_code).replace(/^PCI-\d{4}-0*/, '')}/PLAZO_${item.term_days}_DIAS/ITEM_${item.item_number}`
      for (const o of oficiales) {
        const { data } = await sb.storage.from('evidencias').download(o.foto.master_path ?? o.foto.storage_path)
        if (data) zip.file(`${carpeta}/${o.nombre}`, await aJpegReal(data))
      }
      zip.file(`${carpeta}/MANIFIESTO.csv`, ['archivo,fase,captura,original', ...oficiales.map((o) =>
        `${o.nombre},${o.fase},${o.foto.taken_at ?? ''},${o.foto.storage_path}`), ...faltan.map((f) => `FALTA,${f},,`)].join('\n'))
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ITEM_${item.item_number}.zip`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo preparar la descarga'))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Button variant="outline" className="w-full" onClick={bajar} loading={ocupado}>
      <Download className="size-4" />Descargar selección (JPG oficiales)
    </Button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
const ESTADO_OBS: Record<string, { t: string; c: string }> = {
  abierta: { t: 'Abierta', c: 'bg-violet-500/12 text-violet-700 dark:text-violet-300' },
  respondida: { t: 'Respondida', c: 'bg-info/12 text-info' },
  cerrada: { t: 'Cerrada', c: 'bg-success/12 text-success' },
}

function TabObservaciones({ item, obs, fotos, rol, alCambiar }: { item: any; obs: any[]; fotos: any[]; rol: string; alCambiar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [sel, setSel] = React.useState<string | null>(null)
  const [comentario, setComentario] = React.useState('')
  const [ocupado, setOcupado] = React.useState(false)
  const [comparar, setComparar] = React.useState(false)
  const o = obs.find((x) => x.id === sel) ?? obs[0]
  if (!o) return <Card><CardContent className="text-muted-foreground p-6 text-[13px]">Este ítem no tiene observaciones de revisión.</CardContent></Card>
  const esVisor = rol === 'visor'
  const org = esVisor ? 'COVINCA' : 'SERVICON'
  const fotoDe = (id: string) => fotos.find((f) => f.id === id)

  const accion = async (a: 'responder' | 'mantener' | 'reabrir' | 'comentar') => {
    setOcupado(true)
    const { error } = await sb.rpc('observacion_accion', { p_obs: o.id, p_accion: a, p_texto: comentario.trim() || null, p_evidencias: [] } as any)
    setOcupado(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(a === 'mantener' ? 'Observación mantenida' : a === 'reabrir' ? 'Observación reabierta' : 'Registrado en la observación')
    setComentario('')
    alCambiar()
  }
  const conformar = async () => {
    setOcupado(true)
    const { error } = await sb.rpc('pci_validar', { p_item: item.id, p_conforme: true, p_nota: comentario.trim() || null, p_fase: null, p_version: item.publicacion_version } as any)
    setOcupado(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success('Conforme COVINCA: observación cerrada')
    alCambiar()
  }
  const publicadas = (v: number) => fotos.filter((f) => f.publicada_version != null && f.publicada_version <= v)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {obs.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {obs.map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)}
                className={cn('rounded-md border px-2.5 py-1 text-[12px] font-medium', x.id === o.id ? 'border-primary bg-primary/[0.07]' : 'border-border')}>
                {x.codigo} · {ESTADO_OBS[x.estado]?.t}
              </button>
            ))}
          </div>
        )}
        <Card>
          <div className="bg-info/[0.08] flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
            <MessageSquare className="text-info size-4" />
            <strong>{o.codigo}</strong><span>|</span><strong>{o.motivo}</strong>
            <span className="text-muted-foreground">Origen: {o.origen} | Creada: {fmtDateTime(o.creada_at)}{o.fase ? ` | Fase: ${faseLegible(o.fase)}` : ''}</span>
            <span className={cn('ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-semibold', ESTADO_OBS[o.estado]?.c)}>{ESTADO_OBS[o.estado]?.t}</span>
          </div>
          <CardContent className="space-y-0 p-4">
            {(o.eventos as any[]).map((ev, k) => (
              <div key={k} className="relative flex gap-3 pb-4 last:pb-0">
                <span className={cn('mt-1 size-3 shrink-0 rounded-full border-2 border-primary', k === 0 && 'bg-primary')} />
                <div className="min-w-0 text-[13px]">
                  <p><strong>{ev.autor ?? 'Sistema'} ({ev.organizacion})</strong> <span className="text-muted-foreground">— {fmtDateTime(ev.cuando)}{ev.version ? ` · v${ev.version}` : ''}</span></p>
                  {ev.texto && <p>{ev.texto}</p>}
                  {(ev.evidencias as string[]).map((id) => {
                    const f = fotoDe(id)
                    if (!f) return null
                    return (
                      <div key={id} className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[12px]">
                        <ImageIcon className="size-3.5" />ITEM_{item.item_number}({FASES.find((x) => x.v === f.phase)?.n ?? 'G'}) · {faseLegible(f.phase)} · {fmtDateTime(f.taken_at)}
                        {f.url && <a href={f.url} target="_blank" rel="noopener" className="text-primary ml-auto flex items-center gap-1"><ExternalLink className="size-3" />Ver original</a>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-[14px]">Historial de la observación</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-[12.5px]">
              <thead className="text-muted-foreground text-[11.5px]"><tr className="border-b border-border">
                <th className="py-1.5 text-left font-medium">Estado</th><th className="text-left font-medium">Fecha</th>
                <th className="text-left font-medium">Usuario</th><th className="text-left font-medium">Organización</th>
              </tr></thead>
              <tbody>
                {(o.eventos as any[]).filter((ev) => ev.estado_nuevo && ev.estado_nuevo !== ev.estado_anterior).map((ev, k) => (
                  <tr key={k} className="border-b border-border/50">
                    <td className="py-1.5"><span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', ESTADO_OBS[ev.estado_nuevo]?.c)}>{ESTADO_OBS[ev.estado_nuevo]?.t}</span></td>
                    <td>{fmtDateTime(ev.cuando)}</td><td>{ev.autor ?? 'Sistema'}</td><td>{ev.organizacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle className="text-[14px]">{esVisor ? 'Decisión del cliente' : 'Seguimiento'}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-[13px]">
          <p className="flex justify-between">Estado: <strong>{ESTADO_OBS[o.estado]?.t}</strong></p>
          <p className="flex justify-between">Versión publicada: <strong>{item.publicacion_version > 0 ? `v${item.publicacion_version}` : '—'}</strong></p>
          <div>
            <p className="mb-1 text-[12px] font-medium">Fases (evidencias {esVisor ? 'publicadas' : 'registradas'})</p>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {FASES.map((fa) => (
                <div key={fa.v} className="bg-secondary rounded-md py-1.5"><p className="text-[11px]">{fa.t}</p>
                  <p className="font-bold">{fotos.filter((f) => f.phase === fa.v && (!esVisor || f.publicada_version != null)).length}</p></div>
              ))}
            </div>
          </div>
          {item.publicacion_version > 1 && (
            <Button variant="outline" className="w-full" onClick={() => setComparar(true)}>
              <ArrowLeftRight className="size-4" />Comparar v{item.publicacion_version - 1} / v{item.publicacion_version}
            </Button>
          )}
          <label className="block space-y-1">
            <span className="text-[12px] font-medium">Comentario</span>
            <Textarea rows={3} maxLength={500} value={comentario} onChange={(x) => setComentario(x.target.value)} placeholder="Verificación de la respuesta" />
          </label>
          {esVisor && o.origen === 'COVINCA' ? (
            <div className="space-y-2">
              <Button className="w-full" onClick={conformar} loading={ocupado}
                disabled={o.estado !== 'respondida' || item.covinca_estado !== 'por_revisar'}>Conformar y cerrar</Button>
              <Button variant="outline" className="w-full" onClick={() => accion('mantener')} loading={ocupado}
                disabled={o.estado === 'cerrada' || !comentario.trim()}>Mantener observación</Button>
              <Button variant="outline" className="w-full" onClick={() => accion('reabrir')} loading={ocupado}
                disabled={o.estado !== 'cerrada' || !comentario.trim()}>Reabrir</Button>
              <p className="text-muted-foreground text-[11.5px]">Cierre requiere revisión del cliente. Mantener y reabrir piden motivo.</p>
            </div>
          ) : !esVisor && o.estado !== 'cerrada' ? (
            <div className="space-y-2">
              <Button className="w-full" variant="outline" onClick={() => accion(o.origen === org ? 'comentar' : 'responder')} loading={ocupado} disabled={!comentario.trim()}>
                {o.origen === org ? 'Agregar comentario' : 'Responder'}
              </Button>
              <p className="text-muted-foreground text-[11.5px]">
                {o.origen === 'COVINCA' ? 'La respuesta a COVINCA queda «Respondida» cuando el Residente publica la nueva versión.' : 'La observación SERVICON se cierra al validar la subsanación.'}
              </p>
            </div>
          ) : esVisor && o.estado !== 'cerrada' ? (
            <Button className="w-full" variant="outline" onClick={() => accion('comentar')} loading={ocupado} disabled={!comentario.trim()}>Agregar comentario</Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={comparar} onOpenChange={setComparar}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Comparar v{item.publicacion_version - 1} / v{item.publicacion_version}</DialogTitle>
            <DialogDescription>Versiones inmutables: la comparación no modifica originales.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {[item.publicacion_version - 1, item.publicacion_version].map((v) => (
              <div key={v}>
                <p className="mb-2 text-[13px] font-semibold">Versión v{v}</p>
                {FASES.map((fa) => {
                  const de = publicadas(v).filter((f) => f.phase === fa.v)
                  return (
                    <div key={fa.v} className="mb-2">
                      <p className="text-muted-foreground text-[12px]">{fa.t}: {de.length || 'sin archivo'}</p>
                      <div className="flex gap-1">{de.slice(0, 3).map((f) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={f.id} src={f.mini ?? ''} alt="" className="bg-muted size-16 rounded object-cover" />
                      ))}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function TabDocumentos({ item, fotos, historial, publicaciones, esVisor, meta }: {
  item: any; fotos: any[]; historial: any[]; publicaciones: any[]; esVisor: boolean; meta: ReportMeta
}) {
  const [ocupado, setOcupado] = React.useState<string | null>(null)
  const versiones = publicaciones.map((p) => p.version as number)
  const docs = [
    ...publicaciones.map((p) => ({ id: `panel-${p.version}`, nombre: `Panelfotografico${item.item_number}.pdf`, tipo: 'Panel', version: p.version, fecha: p.cuando, por: p.profiles?.full_name ?? 'Residente', p })),
    ...publicaciones.map((p) => ({ id: `hist-${p.version}`, nombre: `Historialrevision${item.item_number}.pdf`, tipo: 'Historial', version: p.version, fecha: p.cuando, por: 'Sistema', p })),
    ...publicaciones.map((p) => ({ id: `man-${p.version}`, nombre: `Manifiestoevidencias${item.item_number}.csv`, tipo: 'Manifiesto', version: p.version, fecha: p.cuando, por: 'Sistema', p })),
  ]
  const [selId, setSelId] = React.useState<string | null>(null)
  const sel = docs.find((d) => d.id === selId) ?? docs[docs.length - 1]

  const generar = async (d: any) => {
    setOcupado(d.id)
    try {
      const fotosVersion = fotos.filter((f) => (d.p.evidencias as string[]).includes(f.id))
      if (d.tipo === 'Manifiesto') {
        const { oficiales, adicionales, faltan } = fotosOficiales(item.item_number, fotosVersion)
        const csv = ['archivo,fase,captura,carga,origen,version', ...oficiales.map((o) => `${o.nombre},${o.fase},${o.foto.taken_at ?? ''},${o.foto.cargada_at ?? ''},${o.foto.origen_captura ?? ''},v${d.version}`),
          ...adicionales.map((a) => `ADICIONAL,${a.phase ?? 'general'},${a.taken_at ?? ''},,,v${d.version}`), ...faltan.map((f) => `FALTA,${f},,,,v${d.version}`)].join('\n')
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = d.nombre; a.click()
      } else if (d.tipo === 'Historial') {
        await descargarPdf(d.nombre.replace('.pdf', ''), { ...meta, titulo: `Historial de revisión · ${meta.titulo}` },
          [{ header: 'Fecha', key: 'fecha', width: 32 }, { header: 'Usuario', key: 'quien', width: 38 }, { header: 'Origen', key: 'entidad', width: 22 },
           { header: 'Evento', key: 'detalle' }, { header: 'Versión', key: 'version', width: 18 }],
          historial.filter((h) => !h.version || h.version <= d.version).map((h) => ({ fecha: fmtDateTime(h.cuando), quien: h.quien ?? '—', entidad: h.entidad ?? 'SERVICON', detalle: h.detalle, version: h.version ? `v${h.version}` : '—' })),
          { cover: false })
      } else {
        const { oficiales } = fotosOficiales(item.item_number, fotosVersion)
        await descargarPdf(d.nombre.replace('.pdf', ''), { ...meta, titulo: `Panel fotográfico · ${meta.titulo} · v${d.version}` },
          [{ header: 'Archivo', key: 'archivo', width: 50 }, { header: 'Fase', key: 'fase', width: 25 }, { header: 'Captura', key: 'captura' }],
          oficiales.map((o) => ({ archivo: o.nombre, fase: FASES.find((x) => x.n === o.fase)?.t, captura: fmtDateTime(o.foto.taken_at) })),
          { cover: false, fotos: oficiales.filter((o) => o.foto.url).map((o) => ({ url: o.foto.url, titulo: o.nombre, pie: `${FASES.find((x) => x.n === o.fase)?.t} · ${fmtDateTime(o.foto.taken_at)}` })) })
      }
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo generar el documento'))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-[14px]">Documentos publicados · Ítem {item.item_number}</CardTitle>
          <CardDescription>{esVisor ? 'Sólo documentos autorizados para COVINCA.' : 'Generados de la misma intervención para cada versión publicada.'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {docs.length === 0 ? <p className="text-muted-foreground py-4 text-[13px]">Aún no hay versiones publicadas de este ítem.</p> : (
            <table className="w-full text-[12.5px]">
              <thead className="text-muted-foreground text-[11.5px]"><tr className="border-b border-border">
                <th className="py-1.5 text-left font-medium">Documento</th><th className="text-left font-medium">Tipo</th>
                <th className="text-left font-medium">Versión</th><th className="text-left font-medium">Publicación</th>
                <th className="text-left font-medium">Publicado por</th><th />
              </tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} onClick={() => setSelId(d.id)} className={cn('cursor-pointer border-b border-border/50', sel?.id === d.id && 'bg-primary/[0.07] font-semibold')}>
                    <td className="py-1.5">{d.nombre}</td><td>{d.tipo}</td><td>v{d.version}</td><td>{fmtDate(d.fecha)}</td><td>{d.por}</td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" loading={ocupado === d.id} onClick={(x) => { x.stopPropagation(); generar(d) }}>
                        <Download className="size-3.5" />Descargar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-muted-foreground mt-3 text-[11.5px]">Los documentos se consultan por versión; no se editan desde aquí.</p>
        </CardContent>
      </Card>
      {sel && (
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-[14px]">{sel.nombre}</CardTitle>
            <CardDescription>Publicación v{sel.version} · {fmtDate(sel.fecha)} · {sel.por}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={() => generar(sel)} loading={ocupado === sel.id}><Download className="size-4" />Descargar</Button>
            <p className="pt-2 text-[12px] font-semibold">Historial de versiones</p>
            {[...versiones].reverse().map((v) => {
              const p = publicaciones.find((x) => x.version === v)
              return (
                <div key={v} className={cn('rounded-md border px-2.5 py-1.5 text-[12px]', v === sel.version ? 'border-success/40 bg-success/[0.07]' : 'border-border')}>
                  <strong>v{v} · {fmtDate(p?.cuando)}</strong>
                  <p className="text-muted-foreground">{p?.nota ?? (v === 1 ? 'Publicado' : 'Nueva versión publicada')}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Panel de detalle de la bandeja «Revisión de reportes / del contrato»
 * (maquetas 03_SUPERVISOR_MOVIL_REVISION y 03_RESIDENTE_MOVIL_REVISION):
 * datos del ítem, las tres fases, el historial corto y el mismo panel de
 * decisión que la página del ítem (mismas reglas en el servidor).
 */
export function RevisionRapida({ itemId }: { itemId: string }) {
  const { role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const { item, estado, autorizadas, historial, refrescar } = useRevisionDatos(itemId)
  const parte = useQuery({
    queryKey: ['rev-parte', itemId],
    queryFn: async () => ((await sb.from('work_entries').select('work_order_id').eq('pci_item_id', itemId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1)).data?.[0] as any)?.work_order_id as string | undefined,
  })
  const i = item.data
  if (item.isLoading) return <Card><CardContent className="p-4"><SkeletonList rows={4} /></CardContent></Card>
  if (!i) return <Card><CardContent className="text-muted-foreground p-4 text-[13px]">No tienes acceso a este ítem o ya no existe.</CardContent></Card>
  const pciCorto = String(i.pci_code ?? '').replace(/^PCI-\d{4}-0*/, 'PCI ')
  const n = (f: string) => autorizadas.filter((x: any) => x.phase === f).length
  const hitos = (historial.data ?? []).slice(-4)
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4 text-[13px]">
          <p className="text-[14px] font-bold">{pciCorto} · Ítem {i.item_number}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {[
              [Calendar, 'Ejecutado', i.closed_at ? fmtDate(i.closed_at) : '—'], [User, 'Cuadrilla', i.crew_name ?? 'Sin asignar'],
              [FileText, 'Actividad', i.activity_name ?? '—'],
              [MapPin, 'Progresiva', `${i.prog_start_txt ?? fmtProgresiva(i.prog_start_m)}${i.prog_end_m && i.prog_end_m !== i.prog_start_m ? ` – ${i.prog_end_txt ?? fmtProgresiva(i.prog_end_m)}` : ''}`],
              [Ruler, 'Metrado', i.metrado_registrado != null ? `${fmtNumber(Number(i.metrado_registrado), 2)} ${i.unit_symbol ?? ''}` : '—'],
              [Clock, 'Plazo', `${i.term_days} ${i.term_days === 1 ? 'día' : 'días'} · vence ${fmtDate(i.due_date)}`],
            ].map(([I, k, v]: any) => (
              <p key={k} className="min-w-0 truncate" title={String(v)}><I className="text-muted-foreground mr-1 inline size-3.5" /><span className="text-muted-foreground">{k}:</span> <strong>{v}</strong></p>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {FASES.map((f) => {
              const ok = n(f.v) > 0
              return (
                <div key={f.v} className={cn('flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-[12.5px] font-semibold',
                  ok ? 'border-success/40 bg-success/8 text-success' : 'border-destructive/40 bg-destructive/8 text-destructive')}>
                  <ImageIcon className="size-3.5" />{f.t} ({f.n}){ok && <CheckCircle2 className="size-3.5" />}
                </div>
              )
            })}
          </div>
          {hitos.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">Historial</span>
                {parte.data && <Link href={`/campo/${parte.data}`} className="text-primary inline-flex items-center gap-1 text-[12.5px] underline"><ExternalLink className="size-3" />Ver reporte diario digital</Link>}
              </div>
              <ul className="space-y-1 text-[12.5px]">
                {hitos.map((h: any, k: number) => (
                  <li key={k} className="flex items-center gap-2"><Clock className="text-muted-foreground size-3" />
                    <span className="min-w-0 flex-1 truncate" title={h.detalle}>{h.quien && <strong>{h.quien}: </strong>}{h.detalle}</span>
                    <span className="text-muted-foreground tabular-nums">{h.cuando ? fmtDateTime(h.cuando) : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hitos.length && parte.data && <Link href={`/campo/${parte.data}`} className="text-primary inline-flex items-center gap-1 text-[12.5px] underline"><ExternalLink className="size-3" />Ver reporte diario digital</Link>}
        </CardContent>
      </Card>
      <PanelDecision item={i} estado={estado.data} fotos={autorizadas} rol={role} alCambiar={refrescar} />
      <p className="text-muted-foreground flex items-center gap-1.5 text-[12px]"><Info className="size-3.5" />Acción según permisos. Conserva historial y originales.
        <Link href={`/pci/${i.pci_id}/item/${i.id}?tab=historial`} className="text-primary underline">Historial del ítem</Link></p>
    </div>
  )
}
