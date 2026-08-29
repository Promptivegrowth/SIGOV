'use client'

import * as React from 'react'
import { Save, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// Diálogo de formulario genérico.
// Un único componente resuelve el alta y la edición de todos los catálogos:
// se le describen los campos y él arma el formulario, valida lo obligatorio
// y devuelve el objeto listo para guardar.
// ═══════════════════════════════════════════════════════════════════════════

export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'switch' | 'color' | 'progresiva' | 'password'

export interface FormField {
  name: string
  label: string
  type: FieldType
  required?: boolean
  hint?: string
  placeholder?: string
  options?: { value: string; label: string; color?: string }[]
  /** ancho en la rejilla de 2 columnas */
  span?: 1 | 2
  defaultValue?: any
  min?: number
  max?: number
  step?: number
  /** oculta el campo según los valores actuales */
  showIf?: (values: Record<string, any>) => boolean
}

export interface FormDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  fields: FormField[]
  initial?: Record<string, any>
  submitLabel?: string
  onSubmit: (values: Record<string, any>) => Promise<void> | void
  size?: 'sm' | 'md' | 'lg'
  footerNote?: React.ReactNode
}

export function FormDialog({
  open, onOpenChange, title, description, fields, initial,
  submitLabel = 'Guardar', onSubmit, size = 'md', footerNote,
}: FormDialogProps) {
  const [values, setValues] = React.useState<Record<string, any>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const base: Record<string, any> = {}
    for (const f of fields) {
      base[f.name] = initial?.[f.name] ?? f.defaultValue ?? (f.type === 'switch' ? true : '')
    }
    setValues(base)
    setErrors({})
  }, [open, initial, fields])

  const set = (name: string, v: any) => {
    setValues((prev) => ({ ...prev, [name]: v }))
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const visible = fields.filter((f) => !f.showIf || f.showIf(values))

  const submit = async () => {
    const errs: Record<string, string> = {}
    for (const f of visible) {
      if (!f.required) continue
      const v = values[f.name]
      if (v === '' || v == null) errs[f.name] = `${f.label} es obligatorio`
      if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        errs[f.name] = 'Correo no válido'
      }
    }
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setSaving(true)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {visible.map((f) => (
            <Field
              key={f.name}
              label={f.type === 'switch' ? undefined : f.label}
              required={f.required}
              hint={f.hint}
              error={errors[f.name]}
              className={cn(f.span === 2 || f.type === 'textarea' ? 'col-span-2' : 'col-span-2 sm:col-span-1')}
            >
              {f.type === 'select' ? (
                <Select value={String(values[f.name] ?? '')} onValueChange={(v) => set(f.name, v)}>
                  <SelectTrigger className={cn('h-10', errors[f.name] && 'border-destructive')}>
                    <SelectValue placeholder={f.placeholder ?? 'Selecciona…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-2">
                          {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} />}
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  value={values[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                  aria-invalid={!!errors[f.name]}
                />
              ) : f.type === 'switch' ? (
                <label className="bg-muted/40 flex h-10 cursor-pointer items-center justify-between rounded-lg px-3">
                  <span className="text-[13px] font-medium">{f.label}</span>
                  <Switch checked={!!values[f.name]} onCheckedChange={(v) => set(f.name, v)} />
                </label>
              ) : f.type === 'color' ? (
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={values[f.name] || '#2b5bd1'}
                    onChange={(e) => set(f.name, e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card p-1"
                  />
                  <Input
                    value={values[f.name] ?? ''}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder="#2b5bd1"
                    className="h-10 font-mono"
                  />
                </div>
              ) : (
                <Input
                  type={f.type === 'progresiva' ? 'text' : f.type}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  value={values[f.name] ?? ''}
                  onChange={(e) => set(f.name, f.type === 'number' ? e.target.value : e.target.value)}
                  placeholder={f.placeholder}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  aria-invalid={!!errors[f.name]}
                  className={cn('h-10', f.type === 'progresiva' && 'font-mono')}
                />
              )}
            </Field>
          ))}
        </div>

        {footerNote && <div className="text-muted-foreground text-[11.5px] leading-snug">{footerNote}</div>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            <Save className="size-4" />
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Confirmación destructiva reutilizable */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirmar', onConfirm, destructive = true,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
  destructive?: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
