'use client'

import Link from 'next/link'
import { Users, ShieldCheck, HardHat, Database, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Submenú de «Gestión» del Administrador (00_ESTRUCTURA_GENERAL y A01–A06):
 * Usuarios · Roles y permisos · Cuadrillas · Catálogos, más el Historial de
 * accesos dentro de Usuarios.
 */
export const RUTAS_GESTION = [
  { href: '/gestion/usuarios', t: 'Usuarios', i: Users },
  { href: '/gestion/roles', t: 'Roles y permisos', i: ShieldCheck },
  { href: '/gestion/cuadrillas', t: 'Cuadrillas', i: HardHat },
  { href: '/gestion/accesos', t: 'Historial de accesos', i: Clock },
  { href: '/gestion/catalogos', t: 'Catálogos', i: Database },
] as const

export function GestionNav({ activo }: { activo: string }) {
  return (
    <div className="bg-secondary flex flex-wrap gap-1 rounded-lg p-1">
      {RUTAS_GESTION.map((r) => (
        <Link key={r.href} href={r.href} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
          activo === r.href ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          <r.i className="size-3.5" />{r.t}
        </Link>
      ))}
    </div>
  )
}

export function Kpi({ icono: I, valor, etiqueta, tono }: { icono: any; valor: any; etiqueta: string; tono: 'azul' | 'verde' | 'ambar' | 'rojo' }) {
  const c = { azul: 'border-info text-info bg-info/[0.05]', verde: 'border-success text-success bg-success/[0.05]', ambar: 'border-warning text-warning bg-warning/[0.06]', rojo: 'border-destructive text-destructive bg-destructive/[0.05]' }[tono]
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3', c)}>
      <I className="size-6" /><div><p className="text-2xl font-bold tabular-nums">{valor ?? '—'}</p><p className="text-foreground text-[12px]">{etiqueta}</p></div>
    </div>
  )
}
