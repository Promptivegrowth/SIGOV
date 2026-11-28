'use client'

import * as React from 'react'
import { TriangleAlert, RefreshCw, Save } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** El error de la base cuando otro guardó el mismo registro entretanto (t_version_optimista). */
export const esConflictoDeVersion = (e: any) => /fue actualizado por otro usuario/i.test(String(e?.message ?? e ?? ''))

export type CampoEnConflicto = { etiqueta: string; actual: string; mio: string }

/**
 * Ronda 5, CP-13: otro usuario guardó el registro mientras lo editabas.
 * Se muestra qué cambió (lo guardado por el otro frente a tu borrador) y
 * se elige: recargar y descartar el borrador, o guardar tu borrador sobre
 * la versión actual. El borrador no se pierde mientras decides.
 */
export function DialogoConflicto({ abierto, campos, version, actor, alRecargar, alSobrescribir, alCerrar }: {
  abierto: boolean
  campos: CampoEnConflicto[]
  version?: number | null
  actor?: string | null
  alRecargar: () => void
  alSobrescribir: () => Promise<void> | void
  alCerrar: () => void
}) {
  const [guardando, setGuardando] = React.useState(false)
  const distintos = campos.filter((c) => c.actual !== c.mio)
  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) alCerrar() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TriangleAlert className="text-warning size-5" />El registro fue actualizado por otro usuario</DialogTitle>
          <DialogDescription>
            {actor ? `${actor} guardó` : 'Otro usuario guardó'} una versión nueva{version ? ` (v${version})` : ''} mientras lo editabas. Tu borrador sigue en el formulario; compara y decide.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
              <th className="px-3 py-2 text-left font-medium">Campo</th>
              <th className="px-3 py-2 text-left font-medium">Guardado por el otro usuario</th>
              <th className="px-3 py-2 text-left font-medium">Tu borrador</th>
            </tr></thead>
            <tbody>
              {distintos.length === 0 && <tr><td colSpan={3} className="text-muted-foreground px-3 py-4 text-center">Los campos de tu borrador coinciden con la versión guardada; cambió otro dato del registro.</td></tr>}
              {distintos.map((c) => (
                <tr key={c.etiqueta} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold">{c.etiqueta}</td>
                  <td className="px-3 py-2">{c.actual || '—'}</td>
                  <td className={cn('px-3 py-2 text-info font-medium')}>{c.mio || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={alRecargar}><RefreshCw className="size-4" />Recargar (descartar mi borrador)</Button>
          <Button loading={guardando} onClick={async () => { setGuardando(true); try { await alSobrescribir() } finally { setGuardando(false) } }}>
            <Save className="size-4" />Guardar mi borrador sobre la versión actual
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
