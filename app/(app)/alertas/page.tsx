import type { Metadata } from 'next'
import { AlertasClient } from './alertas-client'

export const metadata: Metadata = {
  title: 'Alertas',
  description: 'Todo lo que exige una decisión hoy, en un solo lugar',
}

export default function AlertasPage() {
  return <AlertasClient />
}
