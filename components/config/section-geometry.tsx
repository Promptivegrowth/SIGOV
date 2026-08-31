'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Route, Upload, MapPin, TriangleAlert, Trash2, Check, FileUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/forms/form-dialog'
import { parseGeoFile, trackLength, GeoImportError, type ParsedTrack } from '@/lib/geo-import'
import { cn, fmtNumber } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Carga del trazo de un tramo desde KML, KMZ, GeoJSON o GPX.
 *
 * Un tramo creado a mano nace sin línea en el mapa: aquí se le pega la
 * geometría real que la supervisión ya tiene en Google Earth, con una vista
 * previa antes de guardar para no pisar un trazo bueno por error.
 */
export function SectionGeometryDialog({
  section,
  onClose,
}: {
  section: any
  onClose: () => void
}) {
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [track, setTrack] = React.useState<ParsedTrack | null>(null)
  const [fileName, setFileName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [drag, setDrag] = React.useState(false)
  const [confirmClear, setConfirmClear] = React.useState(false)

  React.useEffect(() => {
    if (!section) { setTrack(null); setFileName('') }
  }, [section])

  const leer = async (file: File) => {
    setBusy(true)
    try {
      const t = await parseGeoFile(file)
      setTrack(t)
      setFileName(file.name)
      toast.success(`${t.format} leído`, {
        description: `${fmtNumber(t.coords.length)} puntos · ${fmtNumber(trackLength(t.coords) / 1000, 2)} km`,
      })
    } catch (e: any) {
      setTrack(null)
      toast.error(e instanceof GeoImportError ? e.message : (e?.message ?? 'No se pudo leer el archivo'))
    } finally {
      setBusy(false)
    }
  }

  const guardar = async () => {
    if (!track || !section) return
    setSaving(true)
    const { data, error } = await sb.rpc('set_section_geometry', {
      p_section_id: section.id,
      p_coords: track.coords as any,
    })
    setSaving(false)
    if (error) { toast.error(error.message.replace('SIGOV: ', '')); return }
    const r = data as any
    toast.success('Trazo cargado', {
      description: `${fmtNumber(r?.puntos ?? 0)} puntos · ${r?.longitud_km ?? 0} km sobre el mapa.`,
    })
    qc.invalidateQueries({ queryKey: ['sections-config'] })
    qc.invalidateQueries({ queryKey: ['mapa'] })
    onClose()
  }

  // ── Vista previa: se dibuja el trazo normalizado en un SVG ──────────────
  const preview = React.useMemo(() => {
    if (!track) return null
    const xs = track.coords.map((c) => c[0])
    const ys = track.coords.map((c) => c[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const w = maxX - minX || 1e-6
    const h = maxY - minY || 1e-6
    // Se conserva la proporción para que el trazo no salga deformado
    const scale = Math.min(300 / w, 120 / h)
    const ox = (320 - w * scale) / 2
    const oy = (140 - h * scale) / 2
    const d = track.coords
      .map((c, i) => {
        const x = ox + (c[0] - minX) * scale
        const y = oy + (maxY - c[1]) * scale
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
    return { d, km: trackLength(track.coords) / 1000 }
  }, [track])

  const largoTramo = section ? (Number(section.prog_end_m) - Number(section.prog_start_m)) / 1000 : 0
  const desvio = preview && largoTramo ? Math.abs(preview.km - largoTramo) / largoTramo : 0

  return (
    <>
      <Dialog open={!!section} onOpenChange={(v) => !v && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                <Route className="size-4.5" />
              </span>
              Trazo del tramo
            </DialogTitle>
            <DialogDescription>
              {section ? `${section.code} · ${section.name}. ` : ''}
              Sube el KML, KMZ, GeoJSON o GPX con la línea de la vía. Es lo que
              hace que el tramo se dibuje en el mapa y que las fotos se ubiquen
              por progresiva.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept=".kml,.kmz,.geojson,.json,.gpx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void leer(f)
              e.target.value = ''
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void leer(f)
            }}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 transition-colors',
              drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-secondary/40'
            )}
          >
            {busy ? (
              <span className="text-muted-foreground text-[13px]">Leyendo el archivo…</span>
            ) : (
              <>
                <FileUp className="text-muted-foreground size-6" />
                <span className="text-[13px] font-medium">
                  {fileName || 'Arrastra el archivo o haz clic para elegirlo'}
                </span>
                <span className="text-muted-foreground text-[11.5px]">
                  KML · KMZ · GeoJSON · GPX (máx. 4 000 puntos)
                </span>
              </>
            )}
          </button>

          {track && preview && (
            <div className="space-y-2.5">
              <div className="bg-muted/40 rounded-xl p-3">
                <svg viewBox="0 0 320 140" className="h-32 w-full">
                  <path d={preview.d} fill="none" stroke={section?.color ?? 'var(--primary)'} strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
                <div className="bg-muted/40 rounded-lg py-2">
                  <p className="text-muted-foreground text-[10.5px] uppercase">Formato</p>
                  <p className="font-semibold">{track.format}</p>
                </div>
                <div className="bg-muted/40 rounded-lg py-2">
                  <p className="text-muted-foreground text-[10.5px] uppercase">Puntos</p>
                  <p className="font-semibold tabular-nums">
                    {fmtNumber(track.coords.length)}
                    {track.original > track.coords.length && (
                      <span className="text-muted-foreground text-[10px]"> de {fmtNumber(track.original)}</span>
                    )}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg py-2">
                  <p className="text-muted-foreground text-[10.5px] uppercase">Longitud</p>
                  <p className="font-semibold tabular-nums">{fmtNumber(preview.km, 2)} km</p>
                </div>
              </div>

              {/* Aviso si el trazo no cuadra con las progresivas declaradas */}
              {largoTramo > 0 && desvio > 0.15 && (
                <p className="text-warning bg-warning/10 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    El trazo mide {fmtNumber(preview.km, 2)} km pero el tramo declara{' '}
                    {fmtNumber(largoTramo, 2)} km por sus progresivas. Revisa que sea el archivo correcto.
                  </span>
                </p>
              )}
              {track.layer && (
                <p className="text-muted-foreground text-[11.5px]">
                  Capa encontrada: <span className="font-medium">{track.layer}</span>
                </p>
              )}
            </div>
          )}

          {section?.geom && !track && (
            <p className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
              <Badge variant="success" className="gap-1"><Check className="size-2.5" />Ya tiene trazo</Badge>
              Si subes otro archivo, reemplazará al actual.
            </p>
          )}

          <DialogFooter>
            {section?.geom && (
              <Button variant="ghost" className="text-destructive mr-auto" onClick={() => setConfirmClear(true)}>
                <Trash2 className="size-4" />
                Quitar trazo
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={guardar} loading={saving} disabled={!track}>
              <Upload className="size-4" />
              Guardar trazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="¿Quitar el trazo del tramo?"
        description="El tramo dejará de dibujarse en el mapa y las nuevas fotos ya no podrán calcular su progresiva automáticamente."
        confirmLabel="Quitar trazo"
        onConfirm={async () => {
          const { error } = await sb.rpc('clear_section_geometry', { p_section_id: section.id })
          if (error) { toast.error(error.message.replace('SIGOV: ', '')); return }
          toast.success('Trazo eliminado')
          qc.invalidateQueries({ queryKey: ['sections-config'] })
          qc.invalidateQueries({ queryKey: ['mapa'] })
          setConfirmClear(false)
          onClose()
        }}
      />
    </>
  )
}
