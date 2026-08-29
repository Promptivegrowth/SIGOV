import type { Metadata } from 'next'
import { SsomaClient } from './ssoma-client'

export const metadata: Metadata = {
  title: 'SSOMA',
  description: 'Charlas de seguridad, asistencia con firma, checklists y ATS/IPERC',
}

export default function SsomaPage() {
  return <SsomaClient />
}
