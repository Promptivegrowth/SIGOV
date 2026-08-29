'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera, Plus, MapPin, ShieldCheck, Clock, Fingerprint, Images,
  Link2, Unlink, Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/primitives'
import { EvidencePicker } from './evidence-picker'
import { PhotoUploader } from './photo-uploader'
import { EVIDENCE_PHASE } from '@/lib/constants'
import { cn, fmtDateTime, fmtProgresiva, bytes, uuid } from '@/lib/utils'
import { enqueue, enqueueBlob, getDeviceId } from '@/lib/offline/db'
import { syncNow } from '@/lib/offline/sync'
import type { SealedPhoto } from '@/lib/camera'
import { toast } from 'sonner'

/**
 * Galería de evidencias de un registro o de un ítem de PCI.
 *
 * Ofrece las tres vías de aportar evidencia:
 *   · Cámara   — tomar la foto ahora, con GPS en vivo
 *   · Subir    — desde la galería del celular o el explorador de la PC
 *   · Galería  — reutilizar una foto ya capturada, sin duplicar el archivo
 *
 * Las tres pasan por el mismo sellado (marca de agua + hash) y por la misma
 * cola offline, así que funcionan igual con o sin señal.
 */
export function EvidenceGrid({
  entryId,
  pciItemId,
  count,
  canAdd,
  onAdd,
  label,
  context,
}: {
  entryId?: string
  pciItemId?: string
  count: number
  canAdd?: boolean
  /** Abre la cámara en vivo (la gestiona la pantalla padre) */
  onAdd?: () => void
  label?: string
  /** Contexto para la marca de agua de las fotos subidas */
  context?: {
    actividad?: string | null
    tramo?: string | null
    progresivaM?: number | null
    sectionId?: string | null
    cuadrilla?: string | null
  }
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)
  const [zoom, setZoom] = React.useState<any>(null)
  const [picker, setPicker] = React.useState(false)
  const [uploader, setUploader] = React.useState(false)
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const { service, profile } = useSession()

  const key = entryId ?? pciItemId ?? ''

  React.useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  const { data, isLoading } = useQuery({
    queryKey: ['evidences', key],
    enabled: visible && !!key,
    staleTime: 60_000,
    queryFn: async () => {
      const col = entryId ? 'work_entry_id' : 'pci_item_id'
      const val = entryId ?? pciItemId

      const own = await sb
        .from('evidences')
        .select('id, phase, storage_path, taken_at, lat, lng, accuracy_m, progresiva_m, sha256, size_bytes, caption, device_model')
        .eq(col, val!)
        .is('deleted_at', null)
        .order('taken_at')

      const linked = await sb
        .from('evidence_links')
        .select('id, evidences(id, phase, storage_path, taken_at, lat, lng, accuracy_m, progresiva_m, sha256, size_bytes, caption, device_model)')
        .eq(col, val!)

      const rows = [
        ...(own.data ?? []).map((e) => ({ ...e, linked: false, link_id: null as string | null })),
        ...(linked.data ?? [])
          .filter((l: any) => l.evidences)
          .map((l: any) => ({ ...l.evidences, linked: true, link_id: l.id })),
      ]
      if (!rows.length) return []

      const { data: signed } = await sb.storage
        .from('evidencias')
        .createSignedUrls(rows.map((r) => r.storage_path), 3600)

      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }))
    },
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['evidences', key] })

  const unlink = async (linkId: string) => {
    const { error } = await sb.from('evidence_links').delete().eq('id', linkId)
    if (error) { toast.error(error.message); return }
    toast.success('Evidencia desvinculada', { description: 'La foto original no se borró.' })
    refresh()
  }

  // ── Alta de las fotos subidas desde el dispositivo ─────────────────────
  const handleUpload = async (photos: { sealed: SealedPhoto; phase: string }[]) => {
    const now = new Date()
    const deviceId = await getDeviceId()

    for (const { sealed, phase } of photos) {
      const clientId = uuid()
      const path = entryId
        ? `${service.id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${clientId}.webp`
        : `${service.id}/pci/${pciItemId}/${clientId}.webp`

      await enqueueBlob({ client_id: clientId, bucket: 'evidencias', path, blob: sealed.blob })
      await enqueue({
        client_id: clientId,
        table: 'evidences',
        payload: {
          service_id: service.id,
          work_entry_id: entryId ?? null,
          pci_item_id: pciItemId ?? null,
          phase,
          storage_path: path,
          mime_type: 'image/webp',
          size_bytes: sealed.blob.size,
          width: sealed.width,
          height: sealed.height,
          lat: sealed.gps.lat,
          lng: sealed.gps.lng,
          accuracy_m: sealed.gps.accuracy,
          altitude_m: sealed.gps.altitude,
          section_id: context?.sectionId ?? null,
          progresiva_m: context?.progresivaM ?? null,
          taken_at: sealed.takenAt.toISOString(),
          sha256: sealed.sha256,
          watermarked: true,
          device_id: deviceId,
          device_model: navigator.userAgent.slice(0, 90),
          caption: 'Cargada desde el dispositivo',
          created_by: profile.id,
        },
        service_id: service.id,
        label: `Foto subida · ${context?.actividad ?? label ?? 'evidencia'}`,
      })
    }

    toast.success(`${photos.length} foto${photos.length === 1 ? '' : 's'} guardada${photos.length === 1 ? '' : 's'}`, {
      description: navigator.onLine ? 'Sincronizando con la nube…' : 'Se enviarán al recuperar señal',
    })
    void syncNow().then(refresh)
  }

  const total = data?.length ?? count

  return (
    <>
      <div ref={ref} className="mt-3 flex flex-wrap gap-2">
        {isLoading && count > 0
          ? Array.from({ length: Math.min(count, 4) }).map((_, i) => (
              <Skeleton key={i} className="size-20 rounded-lg" />
            ))
          : (data ?? []).map((e: any) => (
              <button
                key={`${e.id}-${e.link_id ?? 'own'}`}
                onClick={() => setZoom(e)}
                className="group relative size-20 overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.03]"
              >
                {e.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.url}
                    alt={`Evidencia ${EVIDENCE_PHASE[e.phase as keyof typeof EVIDENCE_PHASE].label}`}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="bg-muted flex size-full items-center justify-center">
                    <Camera className="text-muted-foreground size-4" />
                  </div>
                )}
                {e.linked && (
                  <span className="bg-accent text-accent-foreground absolute top-1 left-1 flex size-4 items-center justify-center rounded">
                    <Link2 className="size-2.5" />
                  </span>
                )}
                <span
                  className={cn(
                    'absolute inset-x-0 bottom-0 px-1 py-0.5 text-[8.5px] font-semibold text-white backdrop-blur-sm',
                    e.phase === 'antes' && 'bg-info/80',
                    e.phase === 'durante' && 'bg-warning/80',
                    e.phase === 'despues' && 'bg-success/80',
                    e.phase === 'general' && 'bg-black/60'
                  )}
                >
                  {EVIDENCE_PHASE[e.phase as keyof typeof EVIDENCE_PHASE].label.toUpperCase()}
                </span>
              </button>
            ))}

        {canAdd && (
          <>
            <Tip label="Tomar la foto ahora con la cámara">
              <button
                onClick={onAdd}
                className="text-muted-foreground hover:border-primary hover:text-primary flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border transition-colors"
              >
                <Camera className="size-4" />
                <span className="text-[10px] font-medium">Cámara</span>
              </button>
            </Tip>
            <Tip label="Subir fotos desde la galería del celular o la PC">
              <button
                onClick={() => setUploader(true)}
                className="text-muted-foreground hover:border-accent hover:text-accent-foreground flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border transition-colors"
              >
                <Upload className="size-4" />
                <span className="text-[10px] font-medium">Subir</span>
              </button>
            </Tip>
            <Tip label="Reutilizar una foto ya registrada en SIGOV">
              <button
                onClick={() => setPicker(true)}
                className="text-muted-foreground hover:border-primary hover:text-primary flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border transition-colors"
              >
                <Images className="size-4" />
                <span className="text-[10px] font-medium">Galería</span>
              </button>
            </Tip>
          </>
        )}

        {!canAdd && total === 0 && (
          <span className="text-muted-foreground/70 flex items-center gap-1.5 text-[11.5px]">
            <Camera className="size-3.5" />
            Sin evidencia registrada
          </span>
        )}
      </div>

      {/* Subida desde el dispositivo */}
      <PhotoUploader
        open={uploader}
        onOpenChange={setUploader}
        onUpload={handleUpload}
        context={{
          servicio: service.name,
          cuadrilla: context?.cuadrilla,
          actividad: context?.actividad ?? label,
          tramo: context?.tramo,
          progresivaM: context?.progresivaM,
          usuario: profile.full_name,
        }}
      />

      {/* Reutilizar del archivo */}
      <EvidencePicker
        open={picker}
        onOpenChange={setPicker}
        target={{ work_entry_id: entryId, pci_item_id: pciItemId, label }}
        onLinked={refresh}
      />

      {/* Visor con los metadatos sellados */}
      <Dialog open={!!zoom} onOpenChange={() => setZoom(null)}>
        <DialogContent size="lg" className="p-0">
          {zoom && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.url} alt="Evidencia" className="max-h-[62vh] w-full rounded-t-2xl bg-black object-contain" />
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={EVIDENCE_PHASE[zoom.phase as keyof typeof EVIDENCE_PHASE].className}>
                    {EVIDENCE_PHASE[zoom.phase as keyof typeof EVIDENCE_PHASE].label}
                  </Badge>
                  <Badge variant="success" className="gap-1">
                    <ShieldCheck className="size-2.5" />
                    Sellada e inmutable
                  </Badge>
                  {zoom.linked && (
                    <Badge variant="accent" className="gap-1">
                      <Link2 className="size-2.5" />
                      Reutilizada de la galería
                    </Badge>
                  )}
                  {zoom.linked && canAdd && (
                    <Button
                      variant="ghost" size="sm" className="ml-auto"
                      onClick={() => { unlink(zoom.link_id); setZoom(null) }}
                    >
                      <Unlink className="size-3.5" />
                      Desvincular
                    </Button>
                  )}
                </div>
                {zoom.caption && <p className="mt-2 text-[13px]">{zoom.caption}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[11.5px]">
                  {[
                    { icon: MapPin, k: 'Coordenadas', v: `${zoom.lat?.toFixed(6)}, ${zoom.lng?.toFixed(6)}` },
                    { icon: MapPin, k: 'Precisión', v: `±${Number(zoom.accuracy_m ?? 0).toFixed(0)} m` },
                    { icon: Clock, k: 'Capturada', v: fmtDateTime(zoom.taken_at) },
                    { icon: MapPin, k: 'Progresiva', v: fmtProgresiva(zoom.progresiva_m) },
                    { icon: Camera, k: 'Dispositivo', v: (zoom.device_model ?? '—').slice(0, 34) },
                    { icon: Fingerprint, k: 'Tamaño', v: bytes(zoom.size_bytes) },
                  ].map((r) => (
                    <div key={r.k} className="flex items-start gap-2">
                      <r.icon className="text-muted-foreground mt-0.5 size-3 shrink-0" />
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{r.k}</dt>
                        <dd className="truncate font-medium tabular-nums">{r.v}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
                <div className="bg-muted/60 mt-3 rounded-lg px-3 py-2">
                  <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] tracking-wide uppercase">
                    <Fingerprint className="size-2.5" />
                    Hash SHA-256 de integridad
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] break-all">{zoom.sha256}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
