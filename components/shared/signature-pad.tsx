'use client'

import * as React from 'react'
import { Eraser, Check, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Captura de firma manuscrita con el dedo o el mouse.
 *
 * La firma se dibuja sobre un canvas escalado al devicePixelRatio (si no, en
 * el celular sale pixelada) y se guarda como PNG con fondo transparente para
 * poder incrustarla luego en los PDF de acta.
 */
export function SignaturePadDialog({
  open,
  onOpenChange,
  title = 'Firma',
  description,
  signerName,
  onSigned,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: string
  description?: string
  signerName?: string
  onSigned: (blob: Blob) => Promise<void> | void
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const padRef = React.useRef<any>(null)
  const [empty, setEmpty] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false

    ;(async () => {
      const { default: SignaturePad } = await import('signature_pad')
      if (cancelled || !canvasRef.current) return
      const canvas = canvasRef.current
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d')?.scale(ratio, ratio)

      const pad = new SignaturePad(canvas, {
        backgroundColor: 'rgba(0,0,0,0)',
        penColor: '#111827',
        minWidth: 0.9,
        maxWidth: 2.6,
      })
      pad.addEventListener('endStroke', () => setEmpty(pad.isEmpty()))
      padRef.current = pad
      setEmpty(true)
    })()

    return () => {
      cancelled = true
      padRef.current?.off?.()
      padRef.current = null
    }
  }, [open])

  const limpiar = () => {
    padRef.current?.clear()
    setEmpty(true)
  }

  const confirmar = async () => {
    const pad = padRef.current
    if (!pad || pad.isEmpty()) {
      toast.error('Traza tu firma antes de confirmar')
      return
    }
    setSaving(true)
    try {
      const dataUrl: string = pad.toDataURL('image/png')
      const blob = await (await fetch(dataUrl)).blob()
      await onSigned(blob)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar la firma')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <PenLine className="size-4.5" />
            </span>
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ?? 'Firma con el dedo sobre el recuadro. Queda registrada con la fecha y la hora exactas.'}
          </DialogDescription>
        </DialogHeader>

        {signerName && (
          <p className="text-[12.5px]">
            Firma de <span className="font-semibold">{signerName}</span>
          </p>
        )}

        <div className="relative">
          <canvas
            ref={canvasRef}
            className={cn(
              'bg-card h-44 w-full touch-none rounded-xl border-2 border-dashed',
              empty ? 'border-border' : 'border-primary/40'
            )}
          />
          {empty && (
            <span className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-[12.5px]">
              Traza tu firma aquí
            </span>
          )}
          <span className="text-muted-foreground/60 pointer-events-none absolute inset-x-8 bottom-6 border-b border-dashed" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={limpiar}>
            <Eraser className="size-4" />
            Borrar
          </Button>
          <Button onClick={confirmar} loading={saving} disabled={empty}>
            <Check className="size-4" />
            Confirmar firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Sube una firma al bucket privado `firmas` y devuelve su ruta.
 * La primera carpeta es siempre el service_id: de eso depende la política RLS
 * de Storage para saber quién puede verla.
 */
export async function uploadSignature(
  serviceId: string,
  folder: string,
  filename: string,
  blob: Blob
): Promise<string> {
  const sb = createClient()
  const path = `${serviceId}/${folder}/${filename}.png`
  const { error } = await sb.storage.from('firmas').upload(path, blob, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`No se pudo guardar la firma: ${error.message}`)
  return path
}
