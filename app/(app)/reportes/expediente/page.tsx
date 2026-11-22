import type { Metadata } from 'next'
import { ExpedienteClient } from './expediente-client'

export const metadata: Metadata = { title: 'Exportar expediente' }

export default function ExpedientePage() {
  return <ExpedienteClient />
}
