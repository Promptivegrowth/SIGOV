/**
 * Comprueba la nomenclatura COVINCA (lib/covinca.ts) contra los nombres
 * exactos del ZIP «SERVICON_COVINCA_Estructura_Revision».
 *
 *   npx tsx scripts/probar-covinca.ts
 */
import assert from 'node:assert/strict'
import {
  RAIZ, carpetaCuadrilla, codigoCuadrilla, progresiva, kmDeFoto, lado, fase,
  carpetaPlazo, carpetaPci, semanaDe, rutas, nombreLibre, aCovinca,
} from '../lib/covinca'

let ok = 0
const caso = (nombre: string, fn: () => void) => {
  fn()
  ok++
  console.log('  ✓ ' + nombre)
}

caso('cuadrilla', () => {
  assert.equal(carpetaCuadrilla(1, 'Camaná'), 'CUADRILLA_1_CAMANA')
  assert.equal(carpetaCuadrilla(7, 'CONCORDIA'), 'CUADRILLA_7_CONCORDIA')
  assert.equal(codigoCuadrilla(1), 'C01')
})

caso('progresivas', () => {
  assert.equal(progresiva(852335), '852+335')
  assert.equal(progresiva(1380), '1+380')
  assert.equal(progresiva(1015000), '1015+000')
  assert.equal(kmDeFoto(852335), 'KM-0852+335')
  assert.equal(kmDeFoto(1190350), 'KM-1190+350')
  assert.equal(kmDeFoto(null), 'KM-SIN-PROGRESIVA')
})

caso('lado y fase', () => {
  assert.equal(lado('derecho'), 'LD')
  assert.equal(lado('izquierdo'), 'LI')
  assert.equal(lado('ambos'), 'LD-LI')
  assert.equal(fase('despues'), 'DESPUES')
})

caso('PCI', () => {
  assert.equal(carpetaPlazo(1), '1_DIA')
  assert.equal(carpetaPlazo(7), '7_DIAS')
  assert.equal(carpetaPci('PCI-2026-050'), 'PCI_50')
  const f = rutas.fotoPci({ pciCodigo: 'PCI-2026-050', plazoDias: 7, item: 5, fase: 'antes' })
  assert.equal(f.carpeta, `${RAIZ}/PCI/PCI_50/7_DIAS/ITEM_5`)
  assert.equal(f.archivo, 'ITEM_5(1).jpg')
})

caso('foto rutinaria (ZIP: 2026-10-01_C01_KM-XXXX+XXX_LD_ACTIVIDAD_ANTES.jpg)', () => {
  const f = rutas.fotoRutinaria({
    fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', progresivaM: 852335,
    lado: 'derecho', codigo: 'COV-SV-029', fase: 'antes',
  })
  assert.equal(f.carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/CUADRILLA_1_CAMANA/01`)
  assert.equal(f.archivo, '2026-10-01_C01_KM-0852+335_LD_COV-SV-029_ANTES.jpg')
  assert.match(f.archivo, /^\d{4}-\d{2}-\d{2}_C0[1-7]_KM-\d{4}\+\d{3}_(LD|LI)_[A-Z0-9-]+_(ANTES|DURANTE|DESPUES)\.jpg$/)
})

caso('foto de niveles de servicio', () => {
  const f = rutas.fotoNivelDeServicio({
    fecha: '2026-10-01', sector: 'SECTOR_1.1_852+335_877+000', carpetaNs: 'LIMPIEZA_SUPERFICIE_RODADURA',
    progresivaM: 860000, lado: 'derecho', fase: 'durante',
  })
  assert.equal(f.carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/NIVELES_DE_SERVICIO_2026-10/SECTOR_1.1_852+335_877+000/LIMPIEZA_SUPERFICIE_RODADURA`)
  assert.equal(f.archivo, '2026-10-01_KM-0860+000_LD_DURANTE.jpg')
})

caso('documentos (ZIP: CHARLA_SEGURIDAD, CHECKIST_VEHICULOS, REPORTE_DIARIO)', () => {
  const base = `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/REPORTES_DIARIOS_CHARLAS_ATS/CUADRILLA_1_CAMANA`
  const ch = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'charla', extension: '.pdf' })
  assert.equal(ch.carpeta, base + '/CHARLA_SEGURIDAD')
  assert.equal(ch.archivo, '2026-10-01_C01_CHARLA-5-MIN.pdf')
  const cv = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'checklist_vehicular', detalle: 'VEHICULO-01', extension: '.pdf' })
  assert.equal(cv.carpeta, base + '/CHECKIST_VEHICULOS')
  assert.equal(cv.archivo, '2026-10-01_C01_CHECKLIST_VEHICULO-01.pdf')
  const rd = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'reporte_diario', extension: '.pdf' })
  assert.equal(rd.archivo, '2026-10-01_C01_REPORTE-DIARIO.pdf')
  const ats = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'ats', detalle: 'Limpieza cuneta', extension: '.pdf' })
  assert.equal(ats.archivo, '2026-10-01_C01_ATS_LIMPIEZA-CUNETA.pdf')
})

caso('programación y materiales', () => {
  const s = semanaDe('2026-10-08')
  assert.deepEqual(s, { lunes: '2026-10-05', domingo: '2026-10-11' })
  const p = rutas.programacion({ ...s, cuadrilla: 1, sede: 'CAMANA', tipo: 'ACTIVIDADES' })
  assert.equal(p.archivo, '2026-10-05_al_2026-10-11_C01_PROGRAMACION-ACTIVIDADES.xlsx')
  assert.equal(p.carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/PROGRAMACION_SEMANAL_DE_ACTIVIDADES_Y_RECURSOS/CUADRILLA_1_CAMANA`)
  const m = rutas.materiales({ mes: '2026-10', cuadrillas: 7 })
  assert.equal(m.archivo, '2026-10_SEGUIMIENTO-DIARIO-DE-MATERIALES_7-CUADRILLAS.xlsx')
})

caso('nombres repetidos y limpieza', () => {
  const usados = new Set<string>()
  assert.equal(nombreLibre(usados, 'X', 'A.jpg'), 'A.jpg')
  assert.equal(nombreLibre(usados, 'X', 'A.jpg'), 'A_2.jpg')
  assert.equal(nombreLibre(usados, 'Y', 'A.jpg'), 'A.jpg')
  assert.equal(aCovinca('Señales verticales – Ñandú'), 'SENALES_VERTICALES_NANDU')
})

console.log(`\n${ok} casos correctos`)
