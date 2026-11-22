'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Paperclip, Eye, Download, Camera, Images, FileText, X, Upload, Save, Link2, User, Layers, Cloud, RefreshCw, ShieldCheck, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn, fmtDateTime } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { descargarExcel } from '@/lib/reports'
import { subirArchivoSsoma, abrirArchivoSsoma, pesoArchivo, NotaSsoma, ChipSsoma } from './comun-ssoma'

/**
 * «Evidencias» (SSOMA_11/12): componente reutilizable en inspección o
 * hallazgo; conserva el vínculo y los permisos. Galería, metadatos del
 * archivo seleccionado y «Adjuntar evidencia» (Cámara · Galería · Archivo,
 * descripción obligatoria). Adjuntar no aprueba ni cierra el hallazgo.
 * También muestra, sin duplicarlas, las fotos que ya trae el registro de
 * campo (formato del día, revisión del equipo, higiene).
 */
export function EvidenciasSsoma({ objetoTipo, objetoId, codigoObjeto, evidencias, fotosOrigen = [], alCambiar }: {
  objetoTipo: 'inspeccion' | 'hallazgo' | 'documento'; objetoId: string; codigoObjeto: string
  evidencias: any[]; fotosOrigen?: any[]; alCambiar: () => void
}) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [sel, setSel] = React.useState<string>('')
  const [origen, setOrigen] = React.useState<'camara' | 'galeria' | 'archivo'>('archivo')
  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [descripcion, setDescripcion] = React.useState('')
  const [abierto, setAbierto] = React.useState(false)
  const [subiendo, setSubiendo] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)
  const todas = [...evidencias.map((e) => ({ ...e, bucket: 'documentos' })),
    ...fotosOrigen.map((f, i) => ({ id: `o${i}`, codigo: 'Campo', nombre: f.nombre, storage_path: f.path, bucket: f.bucket ?? 'documentos', mime: 'image/jpeg', origen: 'registro de campo' }))]
  const miniaturas = useQuery({
    queryKey: ['ssoma-mini', todas.map((t) => t.storage_path).join(',')],
    enabled: todas.length > 0,
    queryFn: async () => {
      const out = new Map<string, string>()
      for (const b of ['documentos', 'evidencias']) {
        const rutas = todas.filter((t) => t.bucket === b && t.storage_path && !String(t.mime ?? '').includes('pdf')).map((t) => t.storage_path)
        if (!rutas.length) continue
        const { data } = await sb.storage.from(b).createSignedUrls(rutas, 3600)
        for (const x of data ?? []) if (x.path && x.signedUrl) out.set(x.path, x.signedUrl)
      }
      return out
    },
  })
  const s = todas.find((t) => t.id === sel) ?? todas[0]
  const adjuntar = async (borrador: boolean) => {
    if (!archivo) return
    setSubiendo(true)
    try {
      const ruta = await subirArchivoSsoma(service.id, `${objetoTipo}/${objetoId}`, archivo)
      const { error } = await sb.rpc('ssoma_evidencia_registrar' as any, {
        p_service: service.id, p_objeto_tipo: objetoTipo, p_objeto_id: objetoId, p_path: ruta, p_nombre: archivo.name, p_mime: archivo.type || null,
        p_bytes: archivo.size, p_descripcion: descripcion, p_origen: origen, p_tomada_at: new Date(archivo.lastModified).toISOString(), p_borrador: borrador,
      } as any)
      if (error) throw error
      toast.success(borrador ? 'Evidencia guardada como borrador' : 'Evidencia adjunta', { description: 'Adjuntar no aprueba ni cierra el hallazgo.' })
      setArchivo(null); setDescripcion(''); setAbierto(false); alCambiar()
    } catch (e) { toast.error(mensajeAmigable(e)) } finally { setSubiendo(false) }
  }
  const exportar = () => descargarExcel(`Evidencias_${codigoObjeto}`, {
    titulo: `Evidencias · ${codigoObjeto}`, servicio: service.name, periodo: fmtDateTime(new Date()), generadoPor: profile.full_name,
  }, [{ name: 'Evidencias', columns: [
    { header: 'Código', key: 'codigo', width: 10 }, { header: 'Archivo', key: 'nombre', width: 30 }, { header: 'Descripción', key: 'descripcion', width: 50 },
    { header: 'Autor', key: 'autor', width: 22 }, { header: 'Origen', key: 'origen', width: 12 }, { header: 'Captura', key: 'tomada', width: 18 }, { header: 'Carga', key: 'subida', width: 18 },
  ], rows: evidencias.map((e) => ({ ...e, tomada: e.tomada_at ? fmtDateTime(e.tomada_at) : '', subida: fmtDateTime(e.subida_at) })) }])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-[14px]">Evidencias de {objetoTipo === 'hallazgo' ? 'hallazgo' : objetoTipo === 'documento' ? 'documento' : 'inspección'}</CardTitle>
            <p className="mt-1 inline-flex rounded-md bg-violet-500/10 px-2 py-0.5 text-[11.5px] text-violet-700 dark:text-violet-300">Componente reutilizable en inspección o hallazgo; conserva vínculo y permisos</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAbierto(true)}><Paperclip className="size-4" />Adjuntar evidencia</Button>
            <Button size="sm" variant="outline" onClick={exportar} disabled={!evidencias.length}><Download className="size-4" />Exportar listado</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {todas.length === 0 && <p className="text-muted-foreground col-span-3 text-[13px]">Sin evidencias todavía.</p>}
            {todas.map((t) => {
              const url = miniaturas.data?.get(t.storage_path)
              return (
                <button key={t.id} onClick={() => setSel(t.id)} className={cn('overflow-hidden rounded-lg border text-left', s?.id === t.id ? 'border-primary ring-primary/30 ring-2' : 'border-border')}>
                  <div className="bg-muted flex aspect-[4/3] items-center justify-center">
                    {url ? <img src={url} alt="" className="size-full object-cover" /> : <FileText className="text-destructive size-10" />}
                  </div>
                  <div className="space-y-1 p-2 text-[11.5px]">
                    <p className="truncate font-semibold">{t.codigo} {t.nombre}</p>
                    {t.borrador && <Badge variant="outline">Borrador</Badge>}
                    <div className="flex gap-1">
                      <span className="text-primary inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); abrirArchivoSsoma(t.storage_path, t.bucket).catch((x) => toast.error(mensajeAmigable(x))) }}><Eye className="size-3" />Ver archivo</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {s && (
            <div className="space-y-2 rounded-lg border border-border p-3 text-[12.5px]">
              <p className="font-semibold">Metadatos del archivo seleccionado</p>
              <p className="truncate font-semibold">{s.codigo} {s.nombre}</p>
              {[
                [Link2, 'Vinculado', <Badge key="v" variant="info">{codigoObjeto}</Badge>], [User, 'Autor', s.autor ?? '—'], [Layers, 'Origen', s.origen === 'camara' ? 'Cámara' : s.origen === 'galeria' ? 'Galería' : s.origen === 'archivo' ? 'Archivo' : s.origen ?? '—'],
                [Camera, 'Captura', s.tomada_at ? fmtDateTime(s.tomada_at) : '—'], [Cloud, 'Carga', s.subida_at ? fmtDateTime(s.subida_at) : '—'],
                [RefreshCw, 'Sincronización', s.subida_at ? fmtDateTime(s.subida_at) : '—'], [ShieldCheck, 'Original conservado', <ChipSsoma key="o" estado="vigente" texto="Sí" />],
                [MapPin, 'GPS', s.lat ? `${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}` : <ChipSsoma key="g" estado="no_aplica" texto="No disponible" />],
              ].map(([I, k, v]: any) => (
                <p key={k} className="flex items-center justify-between gap-2"><span className="text-muted-foreground flex items-center gap-1.5"><I className="size-3.5" />{k}</span><span>{v}</span></p>
              ))}
              {s.descripcion && <p className="text-muted-foreground border-t border-border pt-2">{s.descripcion}</p>}
              <Button size="sm" variant="outline" className="w-full" onClick={() => abrirArchivoSsoma(s.storage_path, s.bucket).catch((x) => toast.error(mensajeAmigable(x)))}><Download className="size-3.5" />Descargar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {abierto && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><Paperclip className="size-4" />Adjuntar evidencia</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            <div className="bg-secondary inline-flex rounded-lg p-1">
              {([['camara', 'Cámara', Camera], ['galeria', 'Galería', Images], ['archivo', 'Archivo', FileText]] as const).map(([k, t, I]) => (
                <button key={k} onClick={() => { setOrigen(k); setTimeout(() => input.current?.click(), 0) }} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold',
                  origen === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>
              ))}
            </div>
            <input ref={input} type="file" className="hidden" accept={origen === 'archivo' ? 'image/*,application/pdf' : 'image/*'}
              {...(origen === 'camara' ? { capture: 'environment' as any } : {})} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <label className="block space-y-1"><span className="font-medium">Descripción <span className="text-destructive">*</span></span>
              <Textarea rows={2} maxLength={250} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué muestra y para qué respalda" />
              <span className="text-muted-foreground block text-right text-[11px]">{descripcion.length}/250</span></label>
            {archivo ? (
              <p className="flex items-center gap-2"><span className="text-muted-foreground">Archivo seleccionado:</span><strong>{archivo.name}</strong>
                <span className="text-muted-foreground">{pesoArchivo(archivo.size)}</span><button onClick={() => setArchivo(null)} aria-label="Quitar"><X className="size-4" /></button></p>
            ) : <Button size="sm" variant="outline" onClick={() => input.current?.click()}>Elegir archivo</Button>}
            <NotaSsoma tono="ambar">Adjuntar no aprueba ni cierra el hallazgo.</NotaSsoma>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAbierto(false); setArchivo(null) }}>Cancelar</Button>
              <Button variant="outline" onClick={() => adjuntar(true)} loading={subiendo} disabled={!archivo || !descripcion.trim()}><Save className="size-4" />Guardar borrador</Button>
              <Button onClick={() => adjuntar(false)} loading={subiendo} disabled={!archivo || !descripcion.trim()}><Upload className="size-4" />Adjuntar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
