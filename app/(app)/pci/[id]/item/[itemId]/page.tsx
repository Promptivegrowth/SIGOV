import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RevisionItem } from '@/components/pci/revision-item'

export const metadata: Metadata = { title: 'Revisión del ítem' }

export default async function RevisionItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  return (
    <Suspense>
      <RevisionItem pciId={id} itemId={itemId} />
    </Suspense>
  )
}
