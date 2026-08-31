'use client'

import * as React from 'react'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const MODULOS: { key: string; label: string; hint: string }[] = [
  { key: 'programacion', label: 'Programación', hint: 'Plan semanal y órdenes de trabajo' },
  { key: 'campo', label: 'Campo', hint: 'Avances y evidencia fotográfica' },
  { key: 'pci', label: 'PCI', hint: 'Pedidos de corrección con semáforo' },
  { key: 'ssoma', label: 'SSOMA', hint: 'Charlas, checklists y ATS' },
  { key: 'inventario', label: 'Inventario', hint: 'Elementos viales georreferenciados' },
  { key: 'reportes', label: 'Reportes', hint: 'Informes y exportaciones' },
  { key: 'mapa', label: 'Mapa', hint: 'Vista geográfica del contrato' },
]

/**
 * Alta de un contrato (servicio).
 *
 * Es la raíz de todo el sistema: cada tramo, cuadrilla y foto cuelga de un
 * servicio, y las políticas de seguridad usan ese id para aislar la
 * información de un contrato respecto de otro. Quien lo crea queda dentro
 * como administrador, si no quedaría fuera de su propio contrato.
 */
export function ServiceForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated?: (id: string) => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [client, setClient] = React.useState('')
  const [contract, setContract] = React.useState('')
  const [starts, setStarts] = React.useState('')
  const [ends, setEnds] = React.useState('')
  const [color, setColor] = React.useState('#1D4ED8')
  const [modules, setModules] = React.useState<Record<string, boolean>>(
    Object.fromEntries(MODULOS.map((m) => [m.key, true]))
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setCode(''); setName(''); setClient(''); setContract('')
    setStarts(''); setEnds(''); setColor('#1D4ED8')
    setModules(Object.fromEntries(MODULOS.map((m) => [m.key, true])))
  }, [open])

  const guardar = async () => {
    if (!code.trim() || !name.trim()) { toast.error('El código y el nombre del servicio son obligatorios'); return }
    if (starts && ends && ends <= starts) { toast.error('La fecha de fin debe ser posterior a la de inicio'); return }

    setSaving(true)
    const { data, error } = await sb.rpc('create_service', {
      p_code: code.trim(),
      p_name: name.trim(),
      p_client_name: client.trim() || null,
      p_contract_code: contract.trim() || null,
      p_starts_on: starts || null,
      p_ends_on: ends || null,
      p_color: color,
      p_modules: modules as any,
    })
    setSaving(false)
    if (error) { toast.error(error.message.replace('SIGOV: ', '')); return }

    const r = data as any
    toast.success(`Servicio ${r?.code} creado`, {
      description: 'Ya puedes cambiarte a él y cargar sus tramos, cuadrillas y actividades.',
    })
    onCreated?.(r?.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[92vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
              <Building2 className="size-4.5" />
            </span>
            Nuevo servicio o contrato
          </DialogTitle>
          <DialogDescription>
            Cada contrato vive aislado del resto: su propio personal, tramos,
            actividades y evidencias. Elige qué módulos necesita y desactiva los
            que no correspondan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
          <Field label="Código corto" required hint="3 o 4 letras, se ve en el selector de servicio">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="RV5" maxLength={8} className="h-10 font-mono uppercase" />
          </Field>
          <Field label="Color" hint="Identifica el contrato en la interfaz">
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="border-input h-10 w-14 cursor-pointer rounded-lg border bg-transparent" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-10 font-mono" />
            </div>
          </Field>

          <Field label="Nombre del servicio" required className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Mantenimiento rutinario Red Vial 5 — Ancash" className="h-10" />
          </Field>

          <Field label="Cliente">
            <Input value={client} onChange={(e) => setClient(e.target.value)}
              placeholder="COVINCA S.A." className="h-10" />
          </Field>
          <Field label="Código de contrato">
            <Input value={contract} onChange={(e) => setContract(e.target.value)}
              placeholder="CTO-2026-014" className="h-10 font-mono" />
          </Field>

          <Field label="Inicio del contrato">
            <Input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className="h-10" />
          </Field>
          <Field label="Fin del contrato">
            <Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className="h-10" />
          </Field>

          <div className="sm:col-span-2">
            <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
              Módulos habilitados
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MODULOS.map((m) => (
                <label
                  key={m.key}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    modules[m.key] ? 'border-success/30 bg-success/5' : 'border-border bg-muted/30'
                  )}
                >
                  <Switch
                    checked={!!modules[m.key]}
                    onCheckedChange={(v) => setModules((p) => ({ ...p, [m.key]: v }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium">{m.label}</span>
                    <span className="text-muted-foreground block text-[11px]">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} loading={saving}>
            <Building2 className="size-4" />
            Crear servicio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
