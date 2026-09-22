import type { Metadata } from 'next'
import { MaterialesClient } from './materiales-client'

export const metadata: Metadata = {
  title: 'Materiales',
  description: 'Almacén del contrato, stock por insumo y pedidos de las cuadrillas',
}

export default function MaterialesPage() {
  return <MaterialesClient />
}
