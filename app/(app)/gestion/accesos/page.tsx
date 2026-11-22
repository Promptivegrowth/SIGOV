import type { Metadata } from 'next'
import { Suspense } from 'react'
import { HistorialAccesos } from '@/components/gestion/accesos'

export const metadata: Metadata = { title: 'Historial de accesos' }

export default function Page() {
  return (
    <Suspense>
      <HistorialAccesos />
    </Suspense>
  )
}
