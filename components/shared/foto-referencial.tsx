'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2, Image as ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ImageViewer } from '@/components/shared/image-viewer'
import { uuid } from '@/lib/utils'
import { toast } from 'sonner'
import { mensajeAmigable } from '@/lib/errores'

/**
 * La foto referencial de una partida programada o de un ítem PCI: dónde
 * queda exactamente, «a la izquierda, a la derecha, dónde está una piedra»
 * (Elvis, video del 13/10). La carga el supervisor al programar, o el visor
 * COVINCA en un ítem PCI, y el capataz la abre con zoom en el celular.
 *
 * Una por registro: subir otra la reemplaza. La ruta la valida la base
 * (`fijar_foto_referencial`): carpeta del servicio y `/referencias/`.
 */
export function FotoReferencial({
  tabla,
  id,
  ruta,
  puedeEditar,
  onCambio,
}: {
  tabla: 'plan_items' | 'pci_items'
  id: string
  ruta: string | null | undefined
  puedeEditar: boolean
  /** Para refrescar la lista del que la muestra. */
  onCambio?: (ruta: string | null) => void
}) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [actual, setActual] = React.useState<string | null>(ruta ?? null)
  const [subiendo, setSubiendo] = React.useState(false)
  const [abierta, setAbierta] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => setActual(ruta ?? null), [ruta, id])

  const enlace = useQuery({
    queryKey: ['foto-referencial', actual],
    enabled: !!actual,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.storage.from('documentos').createSignedUrl(actual!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

  const fijar = async (nueva: string | null) => {
    const { error } = await sb.rpc('fijar_foto_referencial' as any, { p_tabla: tabla, p_id: id, p_path: nueva } as any)
    if (error) throw error
  }

  /**
   * Borra el archivo si ya nadie lo usa: «Duplicar semana» copia la foto a
   * las partidas de la semana siguiente con la misma ruta.
   */
  const soltar = async (vieja: string) => {
    const [a, b] = await Promise.all([
      sb.from('plan_items').select('id', { count: 'exact', head: true }).eq('foto_referencia_path', vieja),
      sb.from('pci_items').select('id', { count: 'exact', head: true }).eq('foto_referencia_path', vieja),
    ])
    if (a.error || b.error || (a.count ?? 0) + (b.count ?? 0) > 0) return
    await sb.storage.from('documentos').remove([vieja])
  }

  const subir = async (archivo: File) => {
    if (!archivo.type.startsWith('image/')) { toast.error('Elige una imagen (JPG o PNG).'); return }
    if (archivo.size > 15 * 1024 * 1024) { toast.error('La imagen pesa más de 15 MB.'); return }
    setSubiendo(true)
    const ext = (archivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const nueva = `${service.id}/referencias/${uuid()}.${ext}`
    try {
      const { error } = await sb.storage.from('documentos').upload(nueva, archivo, { contentType: archivo.type })
      if (error) throw error
      try {
        await fijar(nueva)
      } catch (e) {
        // Sin el registro, el archivo queda huérfano: se borra
        void sb.storage.from('documentos').remove([nueva])
        throw e
      }
      if (actual) void soltar(actual)
      setActual(nueva)
      onCambio?.(nueva)
      qc.invalidateQueries()
      toast.success('Foto referencial cargada', { description: 'La cuadrilla la ve en su celular.' })
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo cargar la foto'))
    } finally {
      setSubiendo(false)
      if (input.current) input.current.value = ''
    }
  }

  const quitar = async () => {
    if (!actual) return
    setSubiendo(true)
    try {
      await fijar(null)
      void soltar(actual)
      setActual(null)
      onCambio?.(null)
      qc.invalidateQueries()
      toast.success('Foto referencial retirada')
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo retirar la foto'))
    } finally {
      setSubiendo(false)
    }
  }

  if (!actual && !puedeEditar) return null

  return (
    <div className="text-foreground space-y-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="text-muted-foreground size-4" />
        <span className="text-[13px] font-semibold">Foto referencial</span>
        <span className="text-muted-foreground text-[11px]">dónde queda exactamente</span>
      </div>
      {actual ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="bg-muted block h-36 w-full overflow-hidden rounded-lg border border-border"
          aria-label="Ver la foto referencial"
        >
          {enlace.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={enlace.data} alt="Foto referencial" className="size-full object-cover" />
          ) : (
            <span className="text-muted-foreground text-[12px]">Cargando…</span>
          )}
        </button>
      ) : (
        <p className="text-muted-foreground text-[12px]">
          Sin foto. La cuadrilla la verá con zoom en su celular.
        </p>
      )}
      {puedeEditar && (
        <div className="flex gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f) }}
          />
          <Button type="button" variant="outline" size="sm" loading={subiendo} onClick={() => input.current?.click()}>
            <ImagePlus className="size-3.5" />
            {actual ? 'Reemplazar' : 'Cargar foto'}
          </Button>
          {actual && (
            <Button type="button" variant="ghost" size="sm" disabled={subiendo} onClick={quitar}>
              <Trash2 className="text-destructive size-3.5" />
              Quitar
            </Button>
          )}
        </div>
      )}
      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent className="max-w-4xl">
          <DialogTitle>Foto referencial</DialogTitle>
          {enlace.data && <ImageViewer src={enlace.data} alt="Foto referencial" className="h-[70vh]" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
