import type { Metadata } from 'next'
import { ParteDetailClient } from './parte-detail-client'

export const metadata: Metadata = { title: 'Parte diario' }

export default async function ParteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ParteDetailClient orderId={id} />
}
