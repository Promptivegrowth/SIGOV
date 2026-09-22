import type { Metadata } from 'next'
import { SincronizacionClient } from './sincronizacion-client'

export const metadata: Metadata = {
  title: 'Sincronización',
  description: 'Registros pendientes de enviar',
}

export default function SincronizacionPage() {
  return <SincronizacionClient />
}
