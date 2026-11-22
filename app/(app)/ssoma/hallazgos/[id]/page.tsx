import type { Metadata } from 'next'
import { Suspense } from 'react'
import { HallazgoDetalle } from '@/components/ssoma/hallazgo-detalle'

export const metadata: Metadata = { title: 'Hallazgo SSOMA' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <HallazgoDetalle id={id} />
    </Suspense>
  )
}
