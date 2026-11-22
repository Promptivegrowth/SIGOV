import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BandejaClient } from './bandeja-client'

export const metadata: Metadata = { title: 'Revisión de reportes' }

export default function Page() {
  return (
    <Suspense>
      <BandejaClient />
    </Suspense>
  )
}
