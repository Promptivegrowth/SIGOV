import type { Metadata } from 'next'
import { PciTableroClient } from './pci-tablero-client'

export const metadata: Metadata = {
  title: 'Tablero de PCI',
  description: 'Cumplimiento, plazos y responsables de los PCI del contrato',
}

export default function PciTableroPage() {
  return <PciTableroClient />
}
