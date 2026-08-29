import type { Metadata } from 'next'
import { ReportesClient } from './reportes-client'

export const metadata: Metadata = {
  title: 'Reportes',
  description: 'Reportes diarios, de PCI, SSOMA y metrados exportables a PDF y Excel',
}

export default function ReportesPage() {
  return <ReportesClient />
}
