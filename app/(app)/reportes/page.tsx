import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CentroReportes } from '@/components/reportes/centro-reportes'

export const metadata: Metadata = { title: 'Centro de reportes' }

export default function Page() {
  return (
    <Suspense>
      <CentroReportes />
    </Suspense>
  )
}
