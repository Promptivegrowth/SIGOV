import type { Metadata } from 'next'
import { PciListClient } from './pci-list-client'

export const metadata: Metadata = {
  title: 'PCIs',
  description: 'Gestión de Pedidos de Corrección de Incumplimiento (OSITRAN)',
}

export default function PciPage() {
  return <PciListClient />
}
