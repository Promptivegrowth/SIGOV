import type { Metadata } from 'next'
import { PciDetailClient } from './pci-detail-client'

export const metadata: Metadata = { title: 'Detalle de PCI' }

export default async function PciDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PciDetailClient pciId={id} />
}
