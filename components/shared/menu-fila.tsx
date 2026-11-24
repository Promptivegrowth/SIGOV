'use client'

import * as React from 'react'
import Link from 'next/link'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'

/**
 * Menú contextual ⋮ por fila (V03/V07 y expediente): las mismas acciones
 * autorizadas que la fila, sin atajos nuevos.
 */
export interface OpcionFila { t: string; href?: string; onClick?: () => void; icono?: React.ComponentType<{ className?: string }>; oculta?: boolean }

export function MenuFila({ opciones, etiqueta = 'Más acciones' }: { opciones: OpcionFila[]; etiqueta?: string }) {
  const visibles = opciones.filter((o) => !o.oculta)
  if (!visibles.length) return null
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" aria-label={etiqueta} className="hover:bg-secondary inline-flex size-8 items-center justify-center rounded-md" onClick={(e) => e.stopPropagation()}>
          <MoreVertical className="size-4" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} className="bg-popover text-popover-foreground z-50 min-w-48 rounded-lg border border-border p-1 text-[13px] shadow-lg">
          {visibles.map((o) => {
            const I = o.icono
            const contenido = <>{I && <I className="text-muted-foreground size-3.5" />}{o.t}</>
            return (
              <Menu.Item key={o.t} asChild={!!o.href} onSelect={o.onClick}
                className="hover:bg-secondary focus:bg-secondary flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 outline-none">
                {o.href ? <Link href={o.href}>{contenido}</Link> : <span>{contenido}</span>}
              </Menu.Item>
            )
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
