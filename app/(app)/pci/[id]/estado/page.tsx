import type { Metadata } from 'next'
import { EstadoSituacionalClient } from './estado-client'

export const metadata: Metadata = { title: 'Estado situacional del PCI' }

export default async function EstadoSituacionalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EstadoSituacionalClient pciId={id} />
}
