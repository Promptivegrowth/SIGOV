'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Camera, Save } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PhotoUploader } from '@/components/campo/photo-uploader'
import { LADOS } from '@/lib/lados'
import { parseProgresiva, uuid } from '@/lib/utils'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import { encolarOriginal } from '@/lib/offline/original'
import { camposDeCaptura, type SealedPhoto } from '@/lib/camera'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Registrar observación» de campo para Supervisor y Residente (ronda 5,
 * TR-08): el mismo registro del Jefe —un punto con su tramo, progresiva,
 * lado y fotos, y una o más actividades con su metrado— para que lo que se
 * ve en un recorrido quede listo para programar sin volver a digitarlo.
 * Es el banco de observaciones de campo, separado de la bandeja de revisión.
 */
type Fila = { activity_id: string; metrado: string }

export function RegistrarObservacion({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { service, profile, crew } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const vacio = { section_id: '', prog: '', progFin: '', side: 'derecho', categoria: '', descripcion: '', crew_id: '' }
  const [v, setV] = React.useState(vacio)
  const [filas, setFilas] = React.useState<Fila[]>([{ activity_id: '', metrado: '' }])
  const [fotos, setFotos] = React.useState<SealedPhoto[]>([])
  const [subiendo, setSubiendo] = React.useState(false)
  const [guardando, setGuardando] = React.useState(false)
  React.useEffect(() => { if (open) { setV(vacio); setFilas([{ activity_id: '', metrado: '' }]); setFotos([]) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const cat = useQuery({
    queryKey: ['obs-registro-catalogos', service.id],
    enabled: open,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [a, s, c] = await Promise.all([
        sb.from('activities_catalog').select('id, code, name, category, units(symbol)').eq('service_id', service.id).eq('is_active', true).is('deleted_at', null).order('code'),
        sb.from('road_sections').select('id, code, name, prog_start_m, prog_end_m').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      return { acts: (a.data ?? []) as any[], secs: (s.data ?? []) as any[], crews: (c.data ?? []) as any[] }
    },
  })
  const categorias = [...new Set((cat.data?.acts ?? []).map((a) => a.category).filter(Boolean))] as string[]
  const acts = (cat.data?.acts ?? []).filter((a) => !v.categoria || a.category === v.categoria)
  const sec = (cat.data?.secs ?? []).find((s) => s.id === v.section_id)
  const p = parseProgresiva(v.prog)
  const pf = v.progFin ? parseProgresiva(v.progFin) : null
  const fuera = sec && p != null && (p < sec.prog_start_m || p > sec.prog_end_m)
  const validas = filas.filter((f) => f.activity_id)
  const falta = !v.section_id ? 'Elige el tramo' : p == null ? 'Escribe la progresiva (ej. 956+131)' : !validas.length ? 'Agrega al menos una actividad'
    : validas.some((f) => f.metrado !== '' && !(Number(f.metrado.replace(',', '.')) > 0)) ? 'El metrado debe ser mayor que cero (o déjalo vacío)'
    : v.descripcion.trim().length < 3 ? 'Describe lo observado' : null

  const guardar = async () => {
    if (falta) return
    setGuardando(true)
    try {
      const punto = uuid()
      const crewId = v.crew_id || crew?.id || null
      const { data, error } = await sb.from('observaciones_campo').insert(validas.map((f) => ({
        client_id: uuid(), service_id: service.id, punto_id: punto, crew_id: crewId, section_id: v.section_id,
        progresiva_m: p, progresiva_fin_m: pf, side: v.side, descripcion: v.descripcion.trim(), activity_id: f.activity_id,
        metrado: f.metrado === '' ? null : Number(f.metrado.replace(',', '.')), created_by: profile.id,
      })) as any).select('id')
      if (error) throw error
      const primera = (data as any[])[0]?.id
      // Las fotos van a la primera actividad del punto, como en la app del Jefe
      if (primera && fotos.length) {
        const deviceId = await getDeviceId()
        const now = new Date()
        for (const sealed of fotos) {
          const clientId = uuid()
          const path = `${service.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${clientId}.webp`
          await enqueueBlob({ client_id: clientId, bucket: 'evidencias', path, blob: sealed.blob })
          const original = await encolarOriginal(sealed, service.id, clientId)
          await enqueue({
            client_id: clientId, table: 'evidences', service_id: service.id, label: 'Foto de observación de campo',
            payload: {
              service_id: service.id, observacion_id: primera, phase: 'general', storage_path: path, mime_type: 'image/webp',
              size_bytes: sealed.blob.size, width: sealed.width, height: sealed.height,
              lat: sealed.gps?.lat ?? null, lng: sealed.gps?.lng ?? null, accuracy_m: sealed.gps?.accuracy ?? null, altitude_m: sealed.gps?.altitude ?? null,
              section_id: v.section_id, progresiva_m: p, ...camposDeCaptura(sealed), sha256: sealed.sha256, ...original,
              device_id: deviceId, device_model: navigator.userAgent.slice(0, 90), caption: v.descripcion.trim().slice(0, 200), created_by: profile.id,
            },
          })
        }
        void syncNow()
      }
      toast.success(`Observación registrada · ${validas.length} ${validas.length === 1 ? 'actividad' : 'actividades'} en un punto`, {
        description: fotos.length ? `${fotos.length} ${fotos.length === 1 ? 'foto se sube' : 'fotos se suben'} en segundo plano. Ya puedes programarla.` : 'Ya puedes programarla desde la lista.',
      })
      onDone(); onClose()
    } catch (e) { toast.error(mensajeAmigable(e, 'No se pudo registrar la observación')) } finally { setGuardando(false) }
  }

  return (
    <>
      <Dialog open={open && !subiendo} onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Registrar observación</DialogTitle>
            <DialogDescription>Un punto de la vía con una o más actividades. Queda en el banco de observaciones de campo para programarla; no es la bandeja de revisión.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-[13px] sm:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">Tramo *</span>
              <Select value={v.section_id} onValueChange={(x) => setV({ ...v, section_id: x })}>
                <SelectTrigger><SelectValue placeholder="Elige el tramo" /></SelectTrigger>
                <SelectContent>{(cat.data?.secs ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>)}</SelectContent>
              </Select></label>
            <label className="space-y-1"><span className="font-medium">Lado de la vía</span>
              <Select value={v.side} onValueChange={(x) => setV({ ...v, side: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LADOS.map((l) => <SelectItem key={l.valor} value={l.valor}>{l.etiqueta}</SelectItem>)}</SelectContent>
              </Select></label>
            <label className="space-y-1"><span className="font-medium">Progresiva *</span>
              <Input value={v.prog} onChange={(e) => setV({ ...v, prog: e.target.value })} placeholder="956+131" inputMode="decimal" /></label>
            <label className="space-y-1"><span className="font-medium">Progresiva fin (si es lineal)</span>
              <Input value={v.progFin} onChange={(e) => setV({ ...v, progFin: e.target.value })} placeholder="956+180" inputMode="decimal" /></label>
            {fuera && <p className="text-warning sm:col-span-2 text-[12px]">La progresiva está fuera del tramo elegido ({sec.code}); revísala antes de programar.</p>}
            <label className="space-y-1"><span className="font-medium">Categoría</span>
              <Select value={v.categoria || 'todas'} onValueChange={(x) => setV({ ...v, categoria: x === 'todas' ? '' : x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="todas">Todas</SelectItem>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select></label>
            <label className="space-y-1"><span className="font-medium">Cuadrilla (opcional)</span>
              <Select value={v.crew_id || 'ninguna'} onValueChange={(x) => setV({ ...v, crew_id: x === 'ninguna' ? '' : x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ninguna">Sin asignar</SelectItem>{(cat.data?.crews ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select></label>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium">Actividades en este punto *</p>
            {filas.map((f, i) => {
              const a = (cat.data?.acts ?? []).find((x) => x.id === f.activity_id)
              return (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-56 flex-1">
                    <Select value={f.activity_id} onValueChange={(x) => setFilas(filas.map((g, j) => (j === i ? { ...g, activity_id: x } : g)))}>
                      <SelectTrigger><SelectValue placeholder={`Actividad ${i + 1}`} /></SelectTrigger>
                      <SelectContent>{acts.map((x) => <SelectItem key={x.id} value={x.id}>{x.code} · {x.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Input value={f.metrado} onChange={(e) => setFilas(filas.map((g, j) => (j === i ? { ...g, metrado: e.target.value } : g)))}
                    placeholder={`Metrado${a?.units?.symbol ? ' (' + a.units.symbol + ')' : ''}`} inputMode="decimal" className="w-32" />
                  {filas.length > 1 && <Button size="icon-sm" variant="outline" aria-label="Quitar actividad" onClick={() => setFilas(filas.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>}
                </div>
              )
            })}
            <Button size="sm" variant="outline" onClick={() => setFilas([...filas, { activity_id: '', metrado: '' }])}><Plus className="size-3.5" />Agregar otra actividad en el mismo punto</Button>
          </div>
          <label className="block space-y-1 text-[13px]"><span className="font-medium">Observación *</span>
            <Textarea rows={2} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} placeholder="Ej.: placa sucia y poste despintado" /></label>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <Button size="sm" variant="outline" onClick={() => setSubiendo(true)} disabled={fotos.length >= 3}><Camera className="size-3.5" />Adjuntar fotos ({fotos.length}/3)</Button>
            {fotos.length > 0 && <Button size="sm" variant="ghost" onClick={() => setFotos([])}>Quitar fotos</Button>}
            <span className="text-muted-foreground">Se sellan como las de la app; van como evidencia general del punto.</span>
          </div>
          <DialogFooter className="items-center">
            {falta && <span className="text-muted-foreground mr-auto text-[12px]">{falta}</span>}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={guardar} loading={guardando} disabled={!!falta}><Save className="size-4" />Guardar observación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PhotoUploader open={subiendo} onOpenChange={setSubiendo} defaultPhase="general"
        context={{ servicio: service.name, actividad: 'Observación de campo', tramo: sec?.name ?? null, progresivaM: p, usuario: profile.full_name }}
        onUpload={(ps) => { setFotos((x) => [...x, ...ps.map((q) => q.sealed)].slice(0, 3)); setSubiendo(false) }} />
    </>
  )
}
