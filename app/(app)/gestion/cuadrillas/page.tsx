import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GestionCuadrillas } from '@/components/gestion/cuadrillas'

export const metadata: Metadata = { title: 'Cuadrillas' }

export default function Page() {
  return (
    <Suspense>
      <GestionCuadrillas />
    </Suspense>
  )
}
