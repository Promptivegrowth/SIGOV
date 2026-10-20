import type { Metadata } from 'next'
import { ObservacionesClient } from './observaciones-client'

export const metadata: Metadata = {
  title: 'Observaciones de campo',
  description: 'Hallazgos de campo fuera del inventario, para programarlos',
}

export default function ObservacionesPage() {
  return <ObservacionesClient />
}
