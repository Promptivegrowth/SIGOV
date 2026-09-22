import type { Metadata } from 'next'
import { AuditoriaClient } from './auditoria-client'

export const metadata: Metadata = {
  title: 'Auditoría',
  description: 'Quién cambió qué, cuándo y desde dónde',
}

export default function AuditoriaPage() {
  return <AuditoriaClient />
}
