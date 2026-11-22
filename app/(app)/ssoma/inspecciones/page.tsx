import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ControlSsoma } from '@/components/ssoma/control-ssoma'

export const metadata: Metadata = { title: 'Inspecciones SSOMA' }

export default function Page() {
  return (
    <Suspense>
      <ControlSsoma pestana="inspecciones" titulo="Inspecciones SSOMA" subtitulo="Bandeja de revisión y seguimiento" />
    </Suspense>
  )
}
