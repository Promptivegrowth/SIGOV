import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GestionCatalogos } from '@/components/gestion/catalogos'

export const metadata: Metadata = { title: 'Catálogos' }

export default function Page() {
  return (
    <Suspense>
      <GestionCatalogos />
    </Suspense>
  )
}
