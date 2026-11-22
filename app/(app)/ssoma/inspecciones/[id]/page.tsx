import type { Metadata } from 'next'
import { Suspense } from 'react'
import { InspeccionDetalle } from '@/components/ssoma/inspeccion-detalle'

export const metadata: Metadata = { title: 'Detalle de inspección' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <InspeccionDetalle id={id} />
    </Suspense>
  )
}
