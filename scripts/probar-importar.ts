/**
 * Comprueba el reconocimiento de columnas del importador de PCI (OBS-07):
 * que cada encabezado vaya a su campo, aunque el Excel use nombres propios.
 *
 *   npx tsx scripts/probar-importar.ts
 */
import assert from 'node:assert/strict'
import { autoMap, coerce, IMPORT_KINDS, normKey, filaDeEncabezados } from '../lib/import-schemas'
import { SINONIMOS_DE_LADO, ladoDesdeTexto } from '../lib/lados'

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
  const side = new Map<string, string>(SINONIMOS_DE_LADO)
  const valor = (v: string) => coerce(v, lado, { side }).value
  assert.equal(valor('LD'), 'derecho')
  assert.equal(valor('LI'), 'izquierdo')
  assert.equal(valor('LD/LI'), 'ambos')
  assert.equal(valor('LD-LI'), 'ambos')
  assert.equal(valor('LD/EJE/LI'), 'ambos')
  assert.equal(valor('Eje'), 'eje')
  // Calzada (Elvis, P8; el PCI 55 escribe «C.I.»)
  assert.equal(valor('CD'), 'calzada_derecha')
  assert.equal(valor('C.I.'), 'calzada_izquierda')
  assert.equal(valor('Calzada derecha'), 'calzada_derecha')
  assert.equal(valor('Izq'), 'izquierdo')
})

caso('Progresivas y plazo', () => {
  const ini = campos.find((f) => f.key === 'prog_start_m')!
  assert.equal(coerce('1318+320', ini, {}).value, 1318320)
  const plazo = campos.find((f) => f.key === 'term_days')!
  assert.equal(coerce('7', plazo, {}).value, 7)
  assert.equal(coerce('', plazo, {}).error, undefined) // sin plazo: se usa el del PCI
})

caso('Un valor que no está en el catálogo es un error, aunque el campo sea opcional', () => {
  // En la programación la cuadrilla equivocada omite la fila
  const cuadrilla = IMPORT_KINDS.programacion.fields.find((f) => f.key === 'crew_code')!
  const crew = new Map([[normKey('CUA-01'), 'id-1']])
  assert.equal(coerce('CUA-01', cuadrilla, { crew }).value, 'id-1')
  assert.match(coerce('CUA-1O', cuadrilla, { crew }).error ?? '', /no existe/)
  assert.equal(coerce('', cuadrilla, { crew }).error, undefined)
})

caso('PCI: el encargado asigna la cuadrilla; el desconocido entra sin asignar y con aviso', () => {
  const cuadrilla = campos.find((f) => f.key === 'crew_code')!
  // El importador agrega el nombre del jefe y su nombre de pila
  const crew = new Map([[normKey('CUA_04'), 'id-4'], [normKey('José Ramos'), 'id-4'], [normKey('José'), 'id-4'], [normKey('Huver'), 'id-5']])
  assert.equal(coerce('JOSE RAMOS ', cuadrilla, { crew }).value, 'id-4')
  assert.equal(coerce('HUVER ', cuadrilla, { crew }).value, 'id-5')
  assert.equal(coerce('Jose', cuadrilla, { crew }).value, 'id-4')
  const augusto = coerce('AUGUSTO', cuadrilla, { crew })
  assert.equal(augusto.value, null)
  assert.equal(augusto.error, undefined)
  assert.match(augusto.aviso ?? '', /sin asignar/)
})

caso('PCI 55: encabezados en la segunda fila y columnas reconocidas', () => {
  const matriz = [
    ['', '', '', '', '', '', '', '', '', '', '', '', 'BARREDORA', ''],
    ['Ítem', 'Defecto no admitido', 'SECTOR', 'Desde Km.', 'Hasta Km.', 'Total de Km.', 'Plazo (días)', 'Observación', 'ENCARGADO', 'ATENDIDO', 'FECHA', 'DRIVE', 'CUADRILLA DE 7P', 'OBS'],
    [1, 'Existencia de material suelto.', 2.1, 1000060, '', 0, 1, 'Calzada (Resonador) M/S', 'GUSTAVO'],
  ]
  assert.equal(filaDeEncabezados(matriz, campos), 1)
  const m = autoMap(matriz[1] as string[], campos)
  assert.equal(m.item_number, 'Ítem')
  assert.equal(m.description, 'Defecto no admitido')
  assert.equal(m.section_code, 'SECTOR')
  assert.equal(m.prog_start_m, 'Desde Km.')
  assert.equal(m.prog_end_m, 'Hasta Km.')
  assert.equal(m.term_days, 'Plazo (días)')
  assert.equal(m.notes, 'Observación')
  assert.equal(m.crew_code, 'ENCARGADO')
  // Las progresivas vienen en metros
  const ini = campos.find((f) => f.key === 'prog_start_m')!
  assert.equal(coerce(1000060, ini, {}).value, 1000060)
  // El sector da el tramo (el importador agrega los sectores al mapa de tramos)
  const tramo = campos.find((f) => f.key === 'section_code')!
  assert.equal(coerce(2.1, tramo, { section: new Map([[normKey('2.1'), 'tramo-aqp2']]) }).value, 'tramo-aqp2')
})

caso('PCI 55: el lado se lee de la observación', () => {
  assert.equal(ladoDesdeTexto('L.D. MENSAJE SUCIO + SOPORTE.'), 'derecho')
  assert.equal(ladoDesdeTexto('L.I.  DBB'), 'izquierdo')
  assert.equal(ladoDesdeTexto('Calzada / C.I.(M/S)'), 'calzada_izquierda')
  assert.equal(ladoDesdeTexto('L.D. Y L.I.'), 'ambos')
  assert.equal(ladoDesdeTexto('EJE.'), 'eje')
  assert.equal(ladoDesdeTexto('Pérdida de tachas reflectivas.'), null)
  assert.equal(ladoDesdeTexto('Calzada (Resonador) M/S'), null)
})

console.log(`\n${ok} casos correctos`)
