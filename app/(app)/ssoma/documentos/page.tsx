import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ControlSsoma } from '@/components/ssoma/control-ssoma'

export const metadata: Metadata = { title: 'Documentos SSOMA' }

export default function Page() {
  return (
    <Suspense>
      <ControlSsoma pestana="documentos" titulo="SSOMA · Documentos y vigencias" subtitulo="Gestión documental SSOMA, control de versiones, vigencias y revisiones" />
    </Suspense>
  )
}
