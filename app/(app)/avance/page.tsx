import type { Metadata } from 'next'
import { AvanceClient } from './avance-client'

export const metadata: Metadata = {
  title: 'Mi Avance',
  description: 'Cumplimiento del día de la cuadrilla',
}

export default function AvancePage() {
  return <AvanceClient />
}
