import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RevisionClient } from './revision-client'

export const metadata: Metadata = { title: 'Observaciones' }

export default function Page() {
  return (
    <Suspense>
      <RevisionClient />
    </Suspense>
  )
}
