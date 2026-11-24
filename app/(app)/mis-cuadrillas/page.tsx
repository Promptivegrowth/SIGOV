import type { Metadata } from 'next'
import { CuadrillasYRecursos } from '@/components/recursos/cuadrillas-recursos'

export const metadata: Metadata = { title: 'Cuadrillas y recursos' }

/** Supervisor: sus cuadrillas (guía 5.1). Residente y Administrador: cuadrillas y recursos del contrato (guía 6.2.1). */
export default function MisCuadrillasPage() {
  return <CuadrillasYRecursos />
}
