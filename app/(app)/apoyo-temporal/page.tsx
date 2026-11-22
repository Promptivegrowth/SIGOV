import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ApoyoClient } from './apoyo-client'

export const metadata: Metadata = { title: 'Apoyo temporal entre cuadrillas' }

export default function Page() {
  return (
    <Suspense>
      <ApoyoClient />
    </Suspense>
  )
}
