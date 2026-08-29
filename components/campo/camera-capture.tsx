'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Camera, X, RefreshCw, Check, MapPin, SatelliteDish,
  TriangleAlert, Image as ImageIcon, SwitchCamera, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, fmtProgresiva } from '@/lib/utils'
import {
  openCamera, sealPhoto, watchGps, cameraSupported, haptic,
  MAX_ACCURACY_M, type GpsFix, type SealedPhoto,
} from '@/lib/camera'
import { EVIDENCE_PHASE } from '@/lib/constants'
import { toast } from 'sonner'

type Phase = 'antes' | 'durante' | 'despues' | 'general'

export function CameraCapture({
  open,
  onClose,
  onCaptured,
  context,
}: {
  open: boolean
  onClose: () => void
  onCaptured: (photo: SealedPhoto, phase: Phase) => void | Promise<void>
  context: {
    servicio: string
    cuadrilla?: string | null
    actividad?: string | null
    tramo?: string | null
    progresivaM?: number | null
    usuario?: string
  }
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [gps, setGps] = React.useState<GpsFix | null>(null)
  const [phase, setPhase] = React.useState<Phase>('antes')
  const [facing, setFacing] = React.useState<'environment' | 'user'>('environment')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<{ url: string; sealed: SealedPhoto } | null>(null)

  // ── GPS en vivo ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return
    const stop = watchGps((fix) => setGps((prev) => (!prev || fix.accuracy < prev.accuracy ? fix : prev)))
    return stop
  }, [open])

  // ── Cámara ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return
    let cancelled = false

    ;(async () => {
      if (!cameraSupported()) {
        setError('Este navegador no permite acceder a la cámara. Usa la carga de archivo.')
        return
      }
      try {
        const stream = await openCamera(facing)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setError(null)
      } catch {
        setError('No se pudo abrir la cámara. Revisa los permisos del navegador.')
      }
    })()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [open, facing])

  React.useEffect(() => {
    if (!open) {
      setPreview(null)
      setGps(null)
      setError(null)
    }
  }, [open])

  const accuracyOk = gps && gps.accuracy <= MAX_ACCURACY_M

  const capture = async () => {
    if (!videoRef.current || !gps) return
    setBusy(true)
    haptic(45)
    try {
      const sealed = await sealPhoto(videoRef.current, {
        servicio: context.servicio,
        cuadrilla: context.cuadrilla,
        actividad: context.actividad,
        tramo: context.tramo,
        progresivaM: context.progresivaM,
        fase: EVIDENCE_PHASE[phase].label,
        gps,
        takenAt: new Date(),
        usuario: context.usuario,
      })
      setPreview({ url: URL.createObjectURL(sealed.blob), sealed })
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo procesar la foto')
    } finally {
      setBusy(false)
    }
  }

  const fromFile = async (file: File) => {
    if (!gps) return toast.error('Esperando señal GPS')
    setBusy(true)
    try {
      const sealed = await sealPhoto(file, {
        servicio: context.servicio,
        cuadrilla: context.cuadrilla,
        actividad: context.actividad,
        tramo: context.tramo,
        progresivaM: context.progresivaM,
        fase: EVIDENCE_PHASE[phase].label,
        gps,
        takenAt: new Date(),
        usuario: context.usuario,
      })
      setPreview({ url: URL.createObjectURL(sealed.blob), sealed })
    } catch {
      toast.error('No se pudo procesar la imagen')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!preview) return
    setBusy(true)
    await onCaptured(preview.sealed, phase)
    haptic([30, 40, 30])
    setPreview(null)
    setBusy(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <div className="safe-top relative z-10 flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          aria-label="Cerrar cámara"
        >
          <X className="size-5" />
        </button>

        <GpsPill gps={gps} ok={!!accuracyOk} />

        <button
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          aria-label="Cambiar cámara"
        >
          <SwitchCamera className="size-5" />
        </button>
      </div>

      {/* ── Visor ──────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white">
            <TriangleAlert className="size-8 text-accent" />
            <p className="text-sm">{error}</p>
            <label className="mt-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])}
              />
              <span className="bg-accent text-accent-foreground inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl px-5 text-sm font-semibold">
                <ImageIcon className="size-4" />
                Tomar foto con la app del sistema
              </span>
            </label>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={cn('size-full object-cover', facing === 'user' && 'scale-x-[-1]')}
            />

            {/* Guías de encuadre */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-6 rounded-2xl border-2 border-white/15" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
            </div>

            {/* Previsualización de lo que se quemará en la foto */}
            <div className="pointer-events-none absolute right-4 bottom-4 left-4">
              <div className="rounded-lg bg-black/55 px-3 py-2 backdrop-blur-sm">
                <p className="font-mono text-[11px] leading-relaxed text-white/90">
                  {gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : 'Buscando GPS…'}
                </p>
                <p className="text-[10.5px] text-white/60">
                  {context.tramo ?? '—'}
                  {context.progresivaM != null ? ` · ${fmtProgresiva(context.progresivaM)}` : ''}
                  {context.actividad ? ` · ${context.actividad}` : ''}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Previsualización de la foto sellada */}
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex flex-col bg-black"
            >
              <div className="flex flex-1 items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.url} alt="Evidencia capturada" className="max-h-full max-w-full rounded-xl object-contain" />
              </div>
              <div className="safe-bottom flex items-center justify-center gap-3 px-6 py-5">
                <Button
                  size="field"
                  variant="outline"
                  className="flex-1 border-white/25 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => {
                    URL.revokeObjectURL(preview.url)
                    setPreview(null)
                  }}
                >
                  <RefreshCw className="size-5" />
                  Repetir
                </Button>
                <Button size="field" variant="accent" className="flex-1" loading={busy} onClick={confirm}>
                  <Check className="size-5" />
                  Usar esta foto
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Controles ──────────────────────────────────────────────────── */}
      <div className="safe-bottom bg-black px-4 pt-3 pb-5">
        {/* Selector de fase */}
        <div className="mb-4 flex justify-center gap-2">
          {(['antes', 'durante', 'despues'] as Phase[]).map((p) => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={cn(
                'rounded-full px-4 py-2 text-[12.5px] font-semibold transition-all',
                phase === p ? 'bg-accent text-accent-foreground' : 'bg-white/10 text-white/70 hover:bg-white/20'
              )}
            >
              {EVIDENCE_PHASE[p].label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-8">
          <label className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])}
            />
            <ImageIcon className="size-5" />
          </label>

          <button
            onClick={capture}
            disabled={!gps || busy || !!error}
            className={cn(
              'relative flex size-[74px] items-center justify-center rounded-full transition-all active:scale-95',
              'disabled:opacity-40',
              accuracyOk ? 'bg-white' : 'bg-white/70'
            )}
            aria-label="Capturar evidencia"
          >
            {busy ? (
              <Loader2 className="size-7 animate-spin text-black" />
            ) : (
              <span className="size-[62px] rounded-full ring-[3px] ring-black/15" />
            )}
          </button>

          <div className="size-12" />
        </div>

        {!gps && (
          <p className="mt-3 text-center text-[11.5px] text-white/60">
            Esperando señal GPS. Sal a cielo abierto para mejorar la precisión.
          </p>
        )}
        {gps && !accuracyOk && (
          <p className="text-accent mt-3 text-center text-[11.5px]">
            Precisión de ±{gps.accuracy.toFixed(0)} m. Se recomienda menos de {MAX_ACCURACY_M} m antes de capturar.
          </p>
        )}
      </div>
    </div>
  )
}

function GpsPill({ gps, ok }: { gps: GpsFix | null; ok: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full px-3.5 py-2 backdrop-blur transition-colors',
        !gps ? 'bg-white/10' : ok ? 'bg-success/25' : 'bg-accent/25'
      )}
    >
      {!gps ? (
        <SatelliteDish className="size-3.5 animate-pulse text-white/70" />
      ) : (
        <MapPin className={cn('size-3.5', ok ? 'text-success' : 'text-accent')} />
      )}
      <span className="font-mono text-[11px] text-white">
        {gps ? `±${gps.accuracy.toFixed(0)} m` : 'Buscando GPS'}
      </span>
    </div>
  )
}
