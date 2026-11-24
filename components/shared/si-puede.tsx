'use client'

import * as React from 'react'
import { usePuede, type ModuloPermiso, type Accion } from '@/lib/permisos'

/**
 * Muestra su contenido solo si el rol tiene habilitada la acción en el módulo
 * (Roles y permisos). La última palabra la tiene el servidor; esto evita
 * ofrecer botones que serían rechazados.
 */
export function SiPuede({ modulo, accion, children }: { modulo: ModuloPermiso; accion: Accion; children: React.ReactNode }) {
  const puede = usePuede()
  return puede(modulo, accion) ? <>{children}</> : null
}
