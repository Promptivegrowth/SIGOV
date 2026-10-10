/**
 * Comprueba el reconocimiento de columnas del importador de PCI (OBS-07):
 * que cada encabezado vaya a su campo, aunque el Excel use nombres propios.
 *
 *   npx tsx scripts/probar-importar.ts
 */
import assert from 'node:assert/strict'
import { autoMap, coerce, IMPORT_KINDS, normKey } from '../lib/import-schemas'

let ok = 0
const caso = (nombre: string, fn: () => void) => {
  fn()
  ok++
  console.log('  ✓ ' + nombre)
}

const campos = IMPORT_KINDS.pci.fields

caso('Excel con todas las columnas del PCI', () => {
  const m = autoMap(
    ['N° PCI', 'Ítem', 'Descripción', 'Progresiva Inicio', 'Progresiva Fin', 'Lado', 'Plazo',
     'Partida', 'Cantidad', 'Observaciones', 'Cuadrilla', 'Fecha de recepción'],
    campos
  )
  assert.equal(m.pci_code, 'N° PCI')
  assert.equal(m.item_number, 'Ítem')
  assert.equal(m.description, 'Descripción')
  assert.equal(m.prog_start_m, 'Progresiva Inicio')
  assert.equal(m.prog_end_m, 'Progresiva Fin')
  assert.equal(m.side, 'Lado')
  assert.equal(m.term_days, 'Plazo')
  assert.equal(m.activity_code, 'Partida')
  assert.equal(m.quantity, 'Cantidad')
  assert.equal(m.notes, 'Observaciones')
  assert.equal(m.crew_code, 'Cuadrilla')
  assert.equal(m.received_on, 'Fecha de recepción')
})

caso('«Número» y «Código» no se confunden con el N.º de PCI', () => {
  const m = autoMap(['Número', 'Código', 'Descripción', 'Progresiva', 'Plazo'], campos)
  assert.equal(m.item_number, 'Número')
  assert.equal(m.activity_code, 'Código')
  assert.equal(m.pci_code, undefined)
  assert.equal(m.prog_start_m, 'Progresiva')
})

caso('Encabezados abreviados', () => {
  const m = autoMap(['PCI', 'Item', 'Detalle', 'Km inicio', 'Km fin', 'Lado', 'Plazo días', 'Actividad'], campos)
  assert.equal(m.pci_code, 'PCI')
  assert.equal(m.item_number, 'Item')
  assert.equal(m.description, 'Detalle')
  assert.equal(m.prog_start_m, 'Km inicio')
  assert.equal(m.prog_end_m, 'Km fin')
  assert.equal(m.term_days, 'Plazo días')
  assert.equal(m.activity_code, 'Actividad')
})

caso('El lado como lo escribe la programación', () => {
  const lado = campos.find((f) => f.key === 'side')!
  // El mismo mapa que arma el importador
  const side = new Map<string, string>([
    ...['derecho', 'izquierdo', 'ambos', 'eje'].map((c) => [normKey(c), c] as [string, string]),
    ['ld', 'derecho'], ['li', 'izquierdo'], ['ldli', 'ambos'], ['lild', 'ambos'], ['ldejeli', 'ambos'],
  ])
  const valor = (v: string) => coerce(v, lado, { side }).value
  assert.equal(valor('LD'), 'derecho')
  assert.equal(valor('LI'), 'izquierdo')
  assert.equal(valor('LD/LI'), 'ambos')
  assert.equal(valor('LD-LI'), 'ambos')
  assert.equal(valor('LD/EJE/LI'), 'ambos')
  assert.equal(valor('Eje'), 'eje')
})

caso('Progresivas y plazo', () => {
  const ini = campos.find((f) => f.key === 'prog_start_m')!
  assert.equal(coerce('1318+320', ini, {}).value, 1318320)
  const plazo = campos.find((f) => f.key === 'term_days')!
  assert.equal(coerce('7', plazo, {}).value, 7)
  assert.equal(coerce('', plazo, {}).error, undefined) // sin plazo: se usa el del PCI
})

caso('Un valor que no está en el catálogo es un error, aunque el campo sea opcional', () => {
  const cuadrilla = campos.find((f) => f.key === 'crew_code')!
  const crew = new Map([[normKey('CUA-01'), 'id-1']])
  assert.equal(coerce('CUA-01', cuadrilla, { crew }).value, 'id-1')
  assert.match(coerce('CUA-1O', cuadrilla, { crew }).error ?? '', /no existe/)
  assert.equal(coerce('', cuadrilla, { crew }).error, undefined)
})

console.log(`\n${ok} casos correctos`)
