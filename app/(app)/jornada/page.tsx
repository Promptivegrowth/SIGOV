import type { Metadata } from 'next'
import { JornadaClient } from './jornada-client'

export const metadata: Metadata = {
  title: 'Mi Jornada',
  description: 'El resumen del día de la cuadrilla',
}

export default function JornadaPage() {
  return <JornadaClient />
}
