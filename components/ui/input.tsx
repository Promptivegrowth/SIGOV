'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-card flex h-9 w-full min-w-0 rounded-lg border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none',
        'file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground/70',
        'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        'border-input bg-card flex min-h-16 w-full rounded-lg border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none',
        'placeholder:text-muted-foreground/70',
        'focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm font-medium leading-none select-none',
        'peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

/** Campo con etiqueta, ayuda y error — para no repetir el markup 200 veces */
/**
 * Etiqueta, campo y ayuda, atados entre sí.
 *
 * La etiqueta lleva `htmlFor` y el campo su `id`: sin eso el lector de
 * pantalla no dice de qué campo se trata y tocar el texto no lleva el foco al
 * recuadro, que en un celular con guantes es la diferencia entre acertar y
 * no acertar.
 */
function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  const propio = React.useId()
  const soloUno = React.isValidElement(children)
  const hijo = soloUno ? (children as React.ReactElement<Record<string, unknown>>) : null

  // Se respeta el id que el campo ya traiga
  const idCampo = (hijo?.props?.id as string | undefined) ?? propio
  const idAyuda = `${idCampo}-ayuda`

  const campo = hijo
    ? React.cloneElement(hijo, {
        id: idCampo,
        'aria-describedby': (error || hint) ? idAyuda : hijo.props['aria-describedby'],
        'aria-invalid': error ? true : hijo.props['aria-invalid'],
      })
    : children

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={idCampo}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {campo}
      {error ? (
        <p id={idAyuda} className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p id={idAyuda} className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  )
}

export { Input, Textarea, Label, Field }
