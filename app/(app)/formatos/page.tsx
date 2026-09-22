import type { Metadata } from 'next'
import { FormatosClient } from './formatos-client'

export const metadata: Metadata = {
  title: 'Formatos',
  description: 'Los formatos oficiales de SERVICON, generados de lo ya registrado',
}

export default function FormatosPage() {
  return <FormatosClient />
}
