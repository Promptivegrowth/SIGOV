import type { Metadata } from 'next'
import { ConfiguracionClient } from './configuracion-client'

export const metadata: Metadata = {
  title: 'Configuración',
  description: 'Usuarios, roles, servicios, catálogos, tramos y cuadrillas',
}

export default function ConfiguracionPage() {
  return <ConfiguracionClient />
}
