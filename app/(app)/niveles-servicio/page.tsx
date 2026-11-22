import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NivelesClient } from './niveles-client'

export const metadata: Metadata = { title: 'Niveles de servicio' }

export default function Page() {
  return (
    <Suspense>
      <NivelesClient />
    </Suspense>
  )
}
