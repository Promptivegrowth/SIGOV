import type { Metadata } from 'next'
import { ArchivoClient } from './archivo-client'

export const metadata: Metadata = {
  title: 'Archivo',
  description: 'Archivo documental del contrato: contratos, PCIs, actas, planos y reportes',
}

export default function ArchivoPage() {
  return <ArchivoClient />
}
