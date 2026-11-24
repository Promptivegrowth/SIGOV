'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { NAV, type Role } from '@/lib/constants'

/**
 * Permisos por rol (A01 «Roles y permisos»).
 *
 * «Ver» por módulo gobierna el menú y las rutas; las acciones (crear,
 * editar, importar, asignar, validar, exportar) se encienden o apagan por
 * contrato y rol dentro de lo que el sistema admite para ese rol
 * (tabla permisos_base, 0159). El servidor aplica la matriz en cada
 * operación (accion_permitida / exigir_accion); aquí solo se usa para
 * mostrarla y para ocultar botones que de todas formas serían rechazados.
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
export type Accion = 'crear' | 'editar' | 'importar' | 'asignar' | 'validar' | 'exportar'
export const nombreModulo = (k: string) => MODULOS_PERMISO.find((m) => m.k === k)?.t ?? k

/**
 * «Ver» por defecto: lo que el menú del rol ya mostraba. El Jefe trabaja en
 * la app de campo: sus módulos de campo cuentan como visibles aunque no
 * estén en su menú web.
 */
export function verPorDefecto(rol: string, modulo: string, base?: string[]) {
  const m = MODULOS_PERMISO.find((x) => x.k === modulo)
  if (!m) return false
  if (rol === 'jefe_cuadrilla' && base?.length) return true
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
    for (const p of q.data ?? []) if (p.ver === false) ocultas.push(...(MODULOS_PERMISO.find((m) => m.k === p.modulo)?.rutas ?? []))
    return ocultas
  }, [q.data])
}

export const rutaOculta = (ocultas: string[], href: string) => ocultas.some((r) => href === r || href.startsWith(r + '/'))

/**
 * Lo que el usuario tiene habilitado en el contrato (mis_permisos). Mientras
 * carga, o para acciones que la matriz no describe, responde true: la última
 * palabra la tiene siempre el servidor.
 */
export function usePuede() {
  const { service, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const q = useQuery({
    queryKey: ['mis-permisos', service.id, role],
    enabled: !!service.id && role !== 'admin',
    staleTime: 5 * 60_000,
    queryFn: async () => ((await sb.rpc('mis_permisos' as any, { p_service: service.id } as any)).data ?? {}) as Record<string, string[] | null>,
  })
  return React.useCallback((modulo: ModuloPermiso, accion: Accion) => {
    if (role === 'admin' || !q.data) return true
    const lista = q.data[modulo]
    if (lista === undefined) return true
    return (lista ?? []).includes(accion)
  }, [q.data, role])
}
