'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, Plus, MapPin, ShieldCheck, Clock, Fingerprint } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EVIDENCE_PHASE } from '@/lib/constants'
import { cn, fmtDateTime, fmtProgresiva, bytes } from '@/lib/utils'

/**
 * Galería de evidencias de un registro.
 * Las URLs firmadas se piden solo cuando el bloque entra en pantalla
 * (lazy) para no golpear Storage con cientos de peticiones a la vez.
 */
export function EvidenceGrid({
  entryId,
  count,
  canAdd,
  onAdd,
}: {
  entryId: string
  count: number
  canAdd?: boolean
  onAdd?: () => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)
  const [zoom, setZoom] = React.useState<any>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  const sb = React.useMemo(() => createClient(), [])

  const { data, isLoading } = useQuery({
    queryKey: ['evidences', entryId],
    enabled: visible && count > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await sb
        .from('evidences')
        .select('id, phase, storage_path, taken_at, lat, lng, accuracy_m, progresiva_m, sha256, size_bytes, caption, device_model')
        .eq('work_entry_id', entryId)
        .is('deleted_at', null)
        .order('taken_at')

      if (!data?.length) return []

      const { data: signed } = await sb.storage
        .from('evidencias')
        .createSignedUrls(data.map((d) => d.storage_path), 3600)

      return data.map((d, i) => ({ ...d, url: signed?.[i]?.signedUrl ?? null }))
    },
  })

  return (
    <>
      <div ref={ref} className="mt-3 flex flex-wrap gap-2">
        {isLoading && count > 0
          ? Array.from({ length: Math.min(count, 4) }).map((_, i) => (
              <Skeleton key={i} className="size-20 rounded-lg" />
            ))
          : (data ?? []).map((e: any) => (
              <button
                key={e.id}
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
          <button
            onClick={onAdd}
            className="text-muted-foreground hover:border-primary hover:text-primary flex size-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border transition-colors"
          >
            <Plus className="size-4" />
            <span className="text-[10px] font-medium">Foto</span>
          </button>
        )}

        {!canAdd && count === 0 && (
          <span className="text-muted-foreground/70 flex items-center gap-1.5 text-[11.5px]">
            <Camera className="size-3.5" />
            Sin evidencia registrada
          </span>
        )}
      </div>

      {/* Visor con los metadatos sellados */}
      <Dialog open={!!zoom} onOpenChange={() => setZoom(null)}>
        <DialogContent size="lg" className="p-0">
          {zoom && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.url} alt="Evidencia" className="max-h-[62vh] w-full rounded-t-2xl object-contain bg-black" />
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={EVIDENCE_PHASE[zoom.phase as keyof typeof EVIDENCE_PHASE].className}>
                    {EVIDENCE_PHASE[zoom.phase as keyof typeof EVIDENCE_PHASE].label}
                  </Badge>
                  <Badge variant="success" className="gap-1">
                    <ShieldCheck className="size-2.5" />
                    Sellada e inmutable
                  </Badge>
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
