'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { programacionSemanalXlsx } from '@/lib/formato-programacion'
import { mensajeAmigable } from '@/lib/errores'

/** El logo de la cabecera del formato, una sola vez por sesión. */
let logoCache: ArrayBuffer | null = null
export async function logoServicon(): Promise<ArrayBuffer | null> {
  if (logoCache) return logoCache
  try {
    logoCache = await (await fetch('/marca/logo-servicon.png')).arrayBuffer()
  } catch { /* sin logo, el formato sale igual */ }
  return logoCache
}

/**
 * Descarga la programación de la semana en el formato de COVINCA
 * (PROGRAMACION SEMANAL · PS-ST04), una cuadrilla por archivo. La cabecera
 * —residente, supervisor, inspector, n.º de semana del contrato y fecha— se
 * guarda en la semana para no volver a escribirla.
 */
export function FormatoCovinca({
  open, onClose, plan, lunes, cuadrillas, asegurarPlan,
}: {
  open: boolean
  onClose: () => void
  plan: any
  lunes: string
  cuadrillas: { id: string; code: string; name: string }[]
  asegurarPlan: () => Promise<string>
}) {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [cuadrilla, setCuadrilla] = React.useState(cuadrillas[0]?.id ?? '')
  const [cab, setCab] = React.useState({ residente: '', supervisor: '', inspector: '', semana_contrato: '', emitido_on: '' })
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setCab({
      residente: plan?.residente ?? '',
      supervisor: plan?.supervisor ?? '',
      inspector: plan?.inspector ?? '',
      semana_contrato: plan?.semana_contrato != null ? String(plan.semana_contrato) : '',
      emitido_on: plan?.emitido_on ?? new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10),
    })
    if (!cuadrilla && cuadrillas[0]) setCuadrilla(cuadrillas[0].id)
  }, [open, plan, cuadrillas, cuadrilla])

  const descargar = async () => {
    if (!cuadrilla) { toast.error('Elige la cuadrilla'); return }
    setBusy(true)
    try {
      if (can.manage) {
        const planId = await asegurarPlan()
        const { error } = await sb.from('weekly_plans').update({
          residente: cab.residente.trim() || null,
          supervisor: cab.supervisor.trim() || null,
          inspector: cab.inspector.trim() || null,
          semana_contrato: cab.semana_contrato.trim() ? Number(cab.semana_contrato) : null,
          emitido_on: cab.emitido_on || null,
        }).eq('id', planId)
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['weekly-plan'] })
      }
      const { buffer, nombre, filas } = await programacionSemanalXlsx({
        sb, servicioId: service.id, cliente: service.client_name, fecha: lunes,
        cuadrillaId: cuadrilla, logo: await logoServicon(),
      })
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Programación descargada', { description: `${nombre} · ${filas} partidas` })
      onClose()
    } catch (e: any) {
      toast.error(mensajeAmigable(e, 'No se pudo generar el formato'))
    } finally {
      setBusy(false)
    }
  }

  const campo = (clave: keyof typeof cab, etiqueta: string, tipo = 'text') => (
    <Field label={etiqueta}>
      <Input type={tipo} value={cab[clave]} disabled={!can.manage}
        onChange={(e) => setCab((c) => ({ ...c, [clave]: e.target.value }))} />
    </Field>
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="size-4" />Programación en formato COVINCA</DialogTitle>
          <DialogDescription>«PROGRAMACION SEMANAL» (PS-ST04), una cuadrilla por archivo, con el nombre de la estructura documental.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Cuadrilla">
              <Select value={cuadrilla} onValueChange={setCuadrilla}>
                <SelectTrigger><SelectValue placeholder="Elige la cuadrilla" /></SelectTrigger>
                <SelectContent>
                  {cuadrillas.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {campo('residente', 'Residente')}
          {campo('supervisor', 'Supervisor')}
          {campo('inspector', 'Inspector')}
          {campo('semana_contrato', 'N.º de semana del contrato', 'number')}
          {campo('emitido_on', 'Fecha de emisión', 'date')}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={descargar} loading={busy}><FileSpreadsheet className="size-4" />Descargar Excel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
