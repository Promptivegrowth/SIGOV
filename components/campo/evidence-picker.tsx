'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Images, Search, Check, MapPin, Calendar, X, Link2, CircleCheck, Maximize2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { ImageViewer } from '@/components/shared/image-viewer'
import { EVIDENCE_PHASE } from '@/lib/constants'
import { cn, fmtDate, fmtDateTime, fmtNumber } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Galería de evidencias ya capturadas.
 *
 * Permite ADJUNTAR una foto existente a otro registro o ítem de PCI sin volver
 * a subirla: la evidencia original queda intacta (es inmutable) y se crea un
 * vínculo. Así una misma foto sustenta, por ejemplo, el parte diario y el
 * levantamiento del ítem de PCI al que corresponde.
 */
export function EvidencePicker({
  open,
  onOpenChange,
  target,
  onLinked,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** A qué se va a adjuntar */
  target: { work_entry_id?: string; pci_item_id?: string; asset_id?: string; talk_id?: string; label?: string }
  onLinked?: () => void
}) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [q, setQ] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [preset, setPreset] = React.useState<DatePresetKey>('90d')
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [zoom, setZoom] = React.useState<any>(null)
  const [saving, setSaving] = React.useState(false)

  const range = React.useMemo(() => rangeFromPreset(preset), [preset])

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  React.useEffect(() => {
    if (!open) { setSelected(new Set()); setQ('') }
  }, [open])

  const gallery = useQuery({
    queryKey: ['evidence-gallery', service.id, range.from, range.to, debounced],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await sb.rpc('evidence_gallery', {
        p_service_id: service.id,
        p_from: range.from,
        p_to: range.to,
        p_search: debounced || undefined,
        p_limit: 120,
      })
      if (error) throw error
      const rows = (data ?? []) as any[]
      if (!rows.length) return []
      const { data: signed } = await sb.storage
        .from('evidencias')
        .createSignedUrls(rows.map((r) => r.storage_path), 3600)
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }))
    },
  })

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const link = async () => {
    if (!selected.size) return
    setSaving(true)
    const rows = [...selected].map((evidence_id) => ({
      evidence_id,
      service_id: service.id,
      work_entry_id: target.work_entry_id ?? null,
      pci_item_id: target.pci_item_id ?? null,
      asset_id: target.asset_id ?? null,
      talk_id: target.talk_id ?? null,
      created_by: profile.id,
    }))
    const { error } = await sb.from('evidence_links').upsert(rows, { ignoreDuplicates: true })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(
      `${selected.size} ${selected.size === 1 ? 'evidencia adjuntada' : 'evidencias adjuntadas'}`,
      { description: 'La foto original no se duplicó: se reutiliza el archivo ya sellado.' }
    )
    onLinked?.()
    onOpenChange(false)
  }

  const rows = gallery.data ?? []

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <Images className="size-4.5" />
            </span>
            Adjuntar desde la galería
          </DialogTitle>
          <DialogDescription>
            Reutiliza una foto ya capturada{target.label ? ` para ${target.label}` : ''}. No se vuelve a subir:
            se enlaza el archivo original, que conserva su GPS, su fecha y su hash intactos.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Buscar por actividad, tramo o cuadrilla…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                aria-label="Limpiar"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <DateRangeTabs value={preset} onChange={setPreset} />
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {fmtNumber(rows.length)} evidencias
          </span>
        </div>

        {/* Rejilla */}
        <div className="min-h-[320px] max-h-[52vh] overflow-y-auto">
          {gallery.isLoading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
              ))}
            </div>
          ) : !rows.length ? (
            <EmptyState
              icon={Images}
              title={debounced ? 'Sin resultados' : 'No hay evidencias en el periodo'}
              description={debounced
                ? `Ninguna foto coincide con "${debounced}".`
                : 'Amplía el rango de fechas o captura una foto nueva.'}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {rows.map((e: any) => {
                const isSel = selected.has(e.id)
                const phase = EVIDENCE_PHASE[(e.phase as keyof typeof EVIDENCE_PHASE) ?? 'general']
                return (
                  <button
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    className={cn(
                      'group relative overflow-hidden rounded-lg border-2 text-left transition-all',
                      isSel ? 'border-primary ring-primary/20 ring-2' : 'border-border hover:border-primary/40'
                    )}
                  >
                    <div className="bg-muted aspect-[4/3] overflow-hidden">
                      {e.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={e.url}
                          alt={e.activity_name ?? 'Evidencia'}
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <Images className="text-muted-foreground size-5" />
                        </div>
                      )}
                    </div>

                    {isSel && (
                      <span className="bg-primary absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full text-white">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}

                    {/* Antes de reutilizar una foto hay que poder verla bien */}
                    {e.url && (
                      <span
                        role="button"
                        tabIndex={0}
                        title="Ver la foto en grande"
                        onClick={(ev) => { ev.stopPropagation(); setZoom(e) }}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setZoom(e) } }}
                        className={cn(
                          'absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/75',
                          isSel && 'bottom-1.5'
                        )}
                      >
                        <Maximize2 className="size-3.5" />
                      </span>
                    )}

                    {Number(e.usos) > 1 && (
                      <span className="bg-accent text-accent-foreground absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold">
                        <Link2 className="size-2" />
                        {e.usos}
                      </span>
                    )}

                    <div className="p-2">
                      <p className="truncate text-[11px] font-medium">{e.activity_name ?? 'Sin actividad'}</p>
                      <p className="text-muted-foreground flex items-center gap-1 truncate text-[10px]">
                        <MapPin className="size-2.5 shrink-0" />
                        {e.section_name ?? '—'} · {e.progresiva_txt ?? '—'}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <Badge className={cn('h-4 px-1 text-[8.5px]', phase.className)}>
                          {phase.label}
                        </Badge>
                        <span className="text-muted-foreground text-[9px] tabular-nums">
                          ±{Number(e.accuracy_m ?? 0).toFixed(0)}m
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <span className="text-muted-foreground mr-auto self-center text-[12px]">
            {selected.size > 0
              ? `${selected.size} seleccionada${selected.size === 1 ? '' : 's'}`
              : 'Toca las fotos que quieras adjuntar'}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={link} loading={saving} disabled={!selected.size}>
            <Link2 className="size-4" />
            Adjuntar {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!zoom} onOpenChange={() => setZoom(null)}>
      <DialogContent size="lg" className="p-0">
        {zoom && (
          <>
            <ImageViewer
              src={zoom.url}
              alt={zoom.activity_name ?? 'Evidencia'}
              descargar={`SIGOV_evidencia_${zoom.id}.webp`}
              className="h-[62vh] w-full rounded-t-2xl"
            />
            <div className="space-y-1 p-4 text-[12px]">
              <p className="font-semibold">{zoom.activity_name ?? 'Evidencia'}</p>
              <p className="text-muted-foreground">
                {zoom.section_name ?? ''} {zoom.progresiva_txt ?? ''} · {fmtDate(zoom.taken_at)}
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
