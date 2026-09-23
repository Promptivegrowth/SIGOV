import { PantallaDeCarga } from '@/components/shared/preloader'

/**
 * Lo que se ve mientras el servidor resuelve la sesión y el contrato.
 *
 * Antes era una pantalla en blanco de uno a tres segundos, que en una
 * conexión de obra se estiraba bastante más y parecía que el sistema no
 * había abierto.
 */
export default function Cargando() {
  return <PantallaDeCarga mensaje="Cargando tu contrato" />
}
