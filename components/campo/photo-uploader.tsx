'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Upload, Images, X, Check, MapPin, Loader2, TriangleAlert,
  Camera, Trash2, SatelliteDish, ShieldCheck, Smartphone, Monitor,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EVIDENCE_PHASE } from '@/lib/constants'
import { cn, bytes, fmtProgresiva } from '@/lib/utils'
import {
  sealPhoto, getGpsFix, watchGps, haptic,
  MAX_ACCURACY_M, type GpsFix, type SealedPhoto,
} from '@/lib/camera'
import { toast } from 'sonner'

type Phase = 'antes' | 'durante' | 'despues' | 'general'

interface Pending {
  id: string
  file: File
  previewUrl: string
  phase: Phase
  sealed?: SealedPhoto
  sealedUrl?: string
  state: 'pendiente' | 'sellando' | 'listo' | 'error'
  error?: string
  /** GPS leído del EXIF de la propia foto, si lo trae */
  exifGps?: GpsFix | null
}

const MAX_FILES = 20
const MAX_SIZE = 25 * 1024 * 1024

/**
 * Carga de fotografías desde el dispositivo.
 *
 * Sirve igual en la computadora de oficina (arrastrar desde el explorador) que
 * en el celular en obra (galería o cámara del sistema). Acepta varias fotos a
 * la vez y las pasa por el MISMO sellado que la captura en vivo: marca de agua
 * con GPS, fecha, tramo y actividad, más el hash SHA-256 de integridad.
 *
 * Si la foto trae coordenadas en su EXIF, se usan esas —son las del momento en
 * que se tomó—; si no, se usa la ubicación actual del dispositivo.
 */
export function PhotoUploader({
  open,
  onOpenChange,
  onUpload,
  context,
  defaultPhase = 'general',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onUpload: (photos: { sealed: SealedPhoto; phase: Phase }[]) => Promise<void> | void
  context: {
    servicio: string
    cuadrilla?: string | null
    actividad?: string | null
    tramo?: string | null
    progresivaM?: number | null
    usuario?: string
  }
  defaultPhase?: Phase
}) {
  const [items, setItems] = React.useState<Pending[]>([])
  const [gps, setGps] = React.useState<GpsFix | null>(null)
  const [gpsError, setGpsError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)

  // ── Ubicación del dispositivo, como respaldo del EXIF ──────────────────
  React.useEffect(() => {
    if (!open) return
    setGpsError(null)
    const stop = watchGps((fix) => setGps((prev) => (!prev || fix.accuracy < prev.accuracy ? fix : prev)))
    getGpsFix().catch((e) => setGpsError(e.message))
    return stop
  }, [open])

  React.useEffect(() => {
    if (open) return
    items.forEach((i) => {
      URL.revokeObjectURL(i.previewUrl)
      if (i.sealedUrl) URL.revokeObjectURL(i.sealedUrl)
    })
    setItems([])
    setGps(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Selección de archivos ──────────────────────────────────────────────
  const addFiles = React.useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      const imgs = list.filter((f) => f.type.startsWith('image/'))
      const rejected = list.length - imgs.length
      if (rejected > 0) toast.warning(`${rejected} archivo(s) omitido(s): solo se aceptan imágenes`)

      const tooBig = imgs.filter((f) => f.size > MAX_SIZE)
      if (tooBig.length) toast.warning(`${tooBig.length} foto(s) superan los 25 MB y se omitieron`)

      const ok = imgs.filter((f) => f.size <= MAX_SIZE)

      setItems((prev) => {
        const room = MAX_FILES - prev.length
        if (room <= 0) {
          toast.error(`Máximo ${MAX_FILES} fotos por carga`)
          return prev
        }
        const take = ok.slice(0, room)
        if (ok.length > room) toast.warning(`Solo se añadieron ${room}: el máximo es ${MAX_FILES}`)
        return [
          ...prev,
          ...take.map((file) => ({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
            phase: defaultPhase,
            state: 'pendiente' as const,
          })),
        ]
      })
    },
    [defaultPhase]
  )

  // ── Sellado de todas las fotos pendientes ──────────────────────────────
  const sealAll = async () => {
    const fix = gps ?? (await getGpsFix().catch(() => null))
    if (!fix) {
      toast.error('Sin ubicación', {
        description: 'La evidencia exige coordenadas. Habilita el permiso de ubicación e inténtalo de nuevo.',
      })
      return
    }

    setBusy(true)
    for (const it of items) {
      if (it.state === 'listo') continue
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, state: 'sellando' } : x)))
      try {
        const sealed = await sealPhoto(it.file, {
          servicio: context.servicio,
          cuadrilla: context.cuadrilla,
          actividad: context.actividad,
          tramo: context.tramo,
          progresivaM: context.progresivaM,
          fase: EVIDENCE_PHASE[it.phase].label,
          gps: it.exifGps ?? fix,
          takenAt: new Date(it.file.lastModified || Date.now()),
          usuario: context.usuario,
        })
        setItems((prev) =>
          prev.map((x) =>
            x.id === it.id
              ? { ...x, sealed, sealedUrl: URL.createObjectURL(sealed.blob), state: 'listo' }
              : x
          )
        )
      } catch (e: any) {
        setItems((prev) =>
          prev.map((x) => (x.id === it.id ? { ...x, state: 'error', error: e?.message ?? 'Error al procesar' } : x))
        )
      }
    }
    setBusy(false)
    haptic(40)
  }

  const confirm = async () => {
    const listos = items.filter((i) => i.state === 'listo' && i.sealed)
    if (!listos.length) {
      toast.error('Primero procesa las fotos')
      return
    }
    setBusy(true)
    try {
      await onUpload(listos.map((i) => ({ sealed: i.sealed!, phase: i.phase })))
      haptic([30, 40, 30])
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const remove = (id: string) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id)
      if (it) {
        URL.revokeObjectURL(it.previewUrl)
        if (it.sealedUrl) URL.revokeObjectURL(it.sealedUrl)
      }
      return prev.filter((x) => x.id !== id)
    })
  }

  const setPhase = (id: string, phase: Phase) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, phase, state: x.state === 'listo' ? 'pendiente' : x.state } : x))
    )
  }

  const listos = items.filter((i) => i.state === 'listo').length
  const pendientes = items.filter((i) => i.state === 'pendiente' || i.state === 'error').length
  const accuracyOk = gps && gps.accuracy <= MAX_ACCURACY_M

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-accent/15 text-accent-foreground flex size-9 items-center justify-center rounded-lg">
              <Upload className="size-4.5" />
            </span>
            Subir fotos desde el dispositivo
          </DialogTitle>
          <DialogDescription>
            Arrastra o elige fotos de la galería de tu computadora o tu celular. Se les aplica la
            misma marca de agua con GPS, fecha y tramo que a las tomadas con la cámara, y quedan
            selladas con su hash de integridad.
          </DialogDescription>
        </DialogHeader>

        {/* Estado del GPS */}
        <div
          className={cn(
            'flex flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-2.5',
            !gps ? 'border-border bg-muted/40'
              : accuracyOk ? 'border-success/30 bg-success/[0.06]'
              : 'border-accent/40 bg-accent/[0.08]'
          )}
        >
          {!gps ? (
            <SatelliteDish className="text-muted-foreground size-4 shrink-0 animate-pulse" />
          ) : (
            <MapPin className={cn('size-4 shrink-0', accuracyOk ? 'text-success' : 'text-accent')} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium">
              {!gps
                ? 'Buscando ubicación del dispositivo…'
                : `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} · ±${gps.accuracy.toFixed(0)} m`}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {gpsError
                ? gpsError
                : 'Se usa la ubicación de la foto si la trae; si no, la del dispositivo en este momento.'}
            </p>
          </div>
          {gps && (
            <Badge variant={accuracyOk ? 'success' : 'warning'}>
              {accuracyOk ? 'Precisión adecuada' : 'Precisión baja'}
            </Badge>
          )}
        </div>

        {/* Zona de carga */}
        {items.length === 0 ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
            }}
            className={cn(
              'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragging ? 'border-primary bg-primary/[0.05]' : 'border-border bg-card hover:border-primary hover:bg-primary/[0.03]'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
              <Images className="size-6" />
            </span>
            <span className="text-[15px] font-semibold">Arrastra las fotos o haz clic para elegirlas</span>
            <span className="text-muted-foreground text-[12.5px]">
              Hasta {MAX_FILES} fotos por carga · JPG, PNG o WebP · máximo 25 MB cada una
            </span>
            <span className="text-muted-foreground mt-2 flex flex-wrap items-center justify-center gap-4 text-[11.5px]">
              <span className="flex items-center gap-1.5">
                <Monitor className="size-3.5" />
                Explorador de la computadora
              </span>
              <span className="flex items-center gap-1.5">
                <Smartphone className="size-3.5" />
                Galería del celular
              </span>
            </span>
          </label>
        ) : (
          <>
            {/* Rejilla de fotos */}
            <div className="max-h-[46vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <AnimatePresence initial={false}>
                  {items.map((it) => (
                    <motion.div
                      key={it.id}
                      layout
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      className={cn(
                        'bg-card relative overflow-hidden rounded-xl border-2 transition-colors',
                        it.state === 'listo' ? 'border-success/50'
                          : it.state === 'error' ? 'border-destructive/50'
                          : 'border-border'
                      )}
                    >
                      <div className="bg-muted relative aspect-[4/3] overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.sealedUrl ?? it.previewUrl}
                          alt={it.file.name}
                          className="size-full object-cover"
                        />
                        {it.state === 'sellando' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                            <Loader2 className="size-6 animate-spin text-white" />
                          </div>
                        )}
                        {it.state === 'listo' && (
                          <span className="bg-success absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full text-white">
                            <ShieldCheck className="size-3" />
                          </span>
                        )}
                        {it.state === 'error' && (
                          <div className="bg-destructive/85 absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-white">
                            <TriangleAlert className="size-5" />
                            <span className="text-[10px]">{it.error}</span>
                          </div>
                        )}
                        <button
                          onClick={() => remove(it.id)}
                          className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-destructive"
                          aria-label={`Quitar ${it.file.name}`}
                        >
                          <X className="size-3" />
                        </button>
                      </div>

                      <div className="p-2">
                        <p className="truncate text-[10.5px] font-medium" title={it.file.name}>
                          {it.file.name}
                        </p>
                        <p className="text-muted-foreground text-[10px]">{bytes(it.file.size)}</p>
                        <div className="mt-1.5 flex gap-1">
                          {(['antes', 'durante', 'despues'] as Phase[]).map((ph) => (
                            <button
                              key={ph}
                              onClick={() => setPhase(it.id, ph)}
                              className={cn(
                                'flex-1 rounded px-1 py-1 text-[9px] font-semibold transition-colors',
                                it.phase === ph
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                              )}
                            >
                              {EVIDENCE_PHASE[ph].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Añadir más */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Images className="size-3.5" />
                Añadir más fotos
              </Button>
              <Button variant="outline" size="sm" onClick={() => cameraRef.current?.click()}>
                <Camera className="size-3.5" />
                Tomar con la cámara del sistema
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => { items.forEach((i) => remove(i.id)) }}
              >
                <Trash2 className="size-3.5" />
                Quitar todas
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>
          </>
        )}

        <DialogFooter>
          <span className="text-muted-foreground mr-auto self-center text-[12px]">
            {items.length === 0
              ? 'Ninguna foto seleccionada'
              : `${items.length} foto${items.length === 1 ? '' : 's'} · ${listos} sellada${listos === 1 ? '' : 's'}`}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {pendientes > 0 ? (
            <Button onClick={sealAll} loading={busy} disabled={!items.length}>
              <ShieldCheck className="size-4" />
              Procesar y sellar ({pendientes})
            </Button>
          ) : (
            <Button onClick={confirm} loading={busy} disabled={!listos}>
              <Check className="size-4" />
              Adjuntar {listos} foto{listos === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
