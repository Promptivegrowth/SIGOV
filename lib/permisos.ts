'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { NAV, type Role } from '@/lib/constants'

/**
 * Permisos por rol (A01 «Roles y permisos»).
 *
 * «Ver» por módulo es configurable por contrato (tabla permisos_rol) y
 * gobierna el menú y las rutas. Las demás acciones son reglas que verifica
 * el servidor en cada operación (funciones de 0126/0135/…); aquí solo se
 * describen para mostrarlas en la matriz, sin poder cambiarlas.
 */
export const MODULOS_PERMISO = [
  { k: 'programacion', t: 'Programación', rutas: ['/programacion'] },
  { k: 'pci', t: 'PCI', rutas: ['/pci', '/revision-reportes', '/asignacion-pci', '/apoyo-temporal'] },
  { k: 'reporte_diario', t: 'Reporte diario', rutas: ['/campo'] },
  { k: 'observaciones', t: 'Observaciones', rutas: ['/observaciones', '/revision'] },
  { k: 'inventario', t: 'Inventario vial', rutas: ['/inventario'] },
  { k: 'materiales', t: 'Materiales', rutas: ['/materiales'] },
  { k: 'caja', t: 'Caja', rutas: ['/caja'] },
  { k: 'ssoma', t: 'SSOMA', rutas: ['/ssoma', '/vencimientos'] },
  { k: 'reportes', t: 'Reportes', rutas: ['/reportes'] },
  { k: 'usuarios', t: 'Usuarios', rutas: ['/gestion'] },
  { k: 'configuracion', t: 'Configuración', rutas: ['/configuracion'] },
] as const
export type ModuloPermiso = (typeof MODULOS_PERMISO)[number]['k']

type Accion = 'crear' | 'editar' | 'importar' | 'asignar' | 'validar' | 'exportar'
/** Lo que el servidor permite hoy a cada rol (fuente: funciones SQL de permisos). */
export const REGLAS_SERVIDOR: Record<string, Partial<Record<ModuloPermiso, Accion[]>>> = {
  admin: Object.fromEntries(MODULOS_PERMISO.map((m) => [m.k, ['crear', 'editar', 'importar', 'asignar', 'validar', 'exportar']])) as any,
  supervisor: {
    programacion: ['crear', 'editar', 'asignar', 'exportar'], pci: ['crear', 'editar', 'importar', 'asignar', 'validar', 'exportar'],
    reporte_diario: ['validar', 'exportar'], observaciones: ['crear', 'editar', 'asignar', 'exportar'], inventario: ['crear', 'editar', 'exportar'],
    materiales: ['crear', 'exportar'], reportes: ['exportar'],
  },
  residente: {
    programacion: ['crear', 'editar', 'asignar', 'exportar'], pci: ['crear', 'editar', 'importar', 'asignar', 'validar', 'exportar'],
    reporte_diario: ['validar', 'exportar'], observaciones: ['crear', 'editar', 'exportar'], inventario: ['editar', 'exportar'],
    materiales: ['crear', 'validar', 'exportar'], caja: ['crear', 'validar', 'exportar'], ssoma: ['exportar'], reportes: ['exportar'],
  },
  jefe_cuadrilla: {
    pci: ['editar'], reporte_diario: ['crear', 'editar'], observaciones: ['crear'], inventario: ['crear'], materiales: ['crear'], caja: ['crear'], ssoma: ['crear'],
  },
  ing_seguridad: { ssoma: ['crear', 'editar', 'validar', 'exportar'], observaciones: [], reportes: ['exportar'] },
  visor: { pci: ['validar'], programacion: [], reportes: ['exportar'] },
}

/** «Ver» por defecto: lo que el menú del rol ya mostraba. */
export function verPorDefecto(rol: string, modulo: string) {
  const m = MODULOS_PERMISO.find((x) => x.k === modulo)
  if (!m) return false
  return NAV.some((n) => m.rutas.some((r) => n.href === r || n.href.startsWith(r + '/')) && n.roles.includes(rol as Role))
}

/** Rutas que el rol NO debe ver en este contrato (por «Ver» apagado). */
export function useRutasOcultas(serviceId: string, rol: string) {
  const sb = React.useMemo(() => createClient(), [])
  const q = useQuery({
    queryKey: ['permisos-ver', serviceId, rol],
    enabled: !!serviceId && !!rol && rol !== 'admin',
    staleTime: 5 * 60_000,
    queryFn: async () => ((await sb.from('permisos_rol' as any).select('modulo, ver').eq('service_id', serviceId).eq('rol', rol)).data ?? []) as any[],
  })
  return React.useMemo(() => {
    const ocultas: string[] = []
    for (const p of q.data ?? []) if (!p.ver) ocultas.push(...(MODULOS_PERMISO.find((m) => m.k === p.modulo)?.rutas ?? []))
    return ocultas
  }, [q.data])
}

export const rutaOculta = (ocultas: string[], href: string) => ocultas.some((r) => href === r || href.startsWith(r + '/'))
