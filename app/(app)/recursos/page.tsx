import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RecursosOperativos } from '@/components/recursos/recursos'

export const metadata: Metadata = { title: 'Recursos operativos' }

export default function Page() {
  return (
    <Suspense>
      <RecursosOperativos />
    </Suspense>
  )
}
