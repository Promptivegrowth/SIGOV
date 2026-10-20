/**
 * Comprueba la nomenclatura COVINCA (lib/covinca.ts) contra los nombres
 * exactos del ZIP «SERVICON_COVINCA_Estructura_Revision» y las respuestas de
 * Elvis al cuestionario (13-10-2026).
 *
 *   npx tsx scripts/probar-covinca.ts
 */
import assert from 'node:assert/strict'
import {
  RAIZ, carpetaCuadrilla, codigoCuadrilla, progresiva, kmDeFoto, lado, fase,
  carpetaPlazo, carpetaPci, semanaDe, rutas, nombreLibre, aCovinca, letraDeRepetida, semanaDelContrato,
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
  // Sin ceros a la izquierda (P7)
  assert.equal(kmDeFoto(852335), 'KM-852+335')
  assert.equal(kmDeFoto(1190350), 'KM-1190+350')
  assert.equal(kmDeFoto(60), 'KM-0+060')
  assert.equal(kmDeFoto(null), 'KM-SIN-PROGRESIVA')
})

caso('lado y fase', () => {
  assert.equal(lado('derecho'), 'LD')
  assert.equal(lado('izquierdo'), 'LI')
  assert.equal(lado('ambos'), 'LD-LI')
  // Calzada (P8)
  assert.equal(lado('calzada_derecha'), 'CD')
  assert.equal(lado('calzada_izquierda'), 'CI')
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

caso('foto rutinaria (P6: COV_SV_029_foto1.jpg)', () => {
  const f = rutas.fotoRutinaria({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', codigo: 'COV-SV-029', numero: 1 })
  assert.equal(f.carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/CUADRILLA_1_CAMANA/01`)
  assert.equal(f.archivo, 'COV_SV_029_foto1.jpg')
  assert.equal(rutas.fotoRutinaria({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', codigo: 'COV-SV-029', numero: 3 }).archivo, 'COV_SV_029_foto3.jpg')
  assert.equal(rutas.fotoRutinaria({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', codigo: null, numero: 1 }).archivo, 'SIN_CODIGO_foto1.jpg')
})

caso('foto de niveles de servicio', () => {
  const f = rutas.fotoNivelDeServicio({
    fecha: '2026-10-01', sector: 'SECTOR_1.1_852+335_877+000', carpetaNs: 'LIMPIEZA_SUPERFICIE_RODADURA',
    progresivaM: 860000, lado: 'derecho', fase: 'durante',
  })
  assert.equal(f.carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/NIVELES_DE_SERVICIO_2026-10/SECTOR_1.1_852+335_877+000/LIMPIEZA_SUPERFICIE_RODADURA`)
  assert.equal(f.archivo, '2026-10-01_KM-860+000_LD_DURANTE.jpg')
})

caso('documentos (CHARLA_SEGURIDAD, CHECKLIST_VEHICULOS de P28, REPORTE_DIARIO de P15)', () => {
  const base = `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/REPORTES_DIARIOS_CHARLAS_ATS/CUADRILLA_1_CAMANA`
  const ch = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'charla', extension: '.pdf' })
  assert.equal(ch.carpeta, base + '/CHARLA_SEGURIDAD')
  assert.equal(ch.archivo, '2026-10-01_C01_CHARLA-5-MIN.pdf')
  const cv = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'checklist_vehicular', detalle: 'VEHICULO-01', extension: '.pdf' })
  assert.equal(cv.carpeta, base + '/CHECKLIST_VEHICULOS')
  assert.equal(cv.archivo, '2026-10-01_C01_CHECKLIST_VEHICULO-01.pdf')
  const rd = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'reporte_diario', extension: '.pdf' })
  assert.equal(rd.archivo, '2026_10_01_C01_REPORTE_DIARIO.pdf')
  const ac = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'ats_conductor', detalle: 'VEHICULO-01', extension: '.jpg' })
  assert.equal(ac.carpeta, base + '/CHARLAS_ATS')
  assert.equal(ac.archivo, '2026-10-01_C01_ATS-CONDUCTOR_VEHICULO-01.jpg')
  const pt = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'petar', extension: '.jpg' })
  assert.equal(pt.carpeta, base + '/PETAR_ACTIVIDADES')
  const ats = rutas.documento({ fecha: '2026-10-01', cuadrilla: 1, sede: 'CAMANA', tipo: 'ats', detalle: 'Limpieza cuneta', extension: '.pdf' })
  assert.equal(ats.archivo, '2026-10-01_C01_ATS_LIMPIEZA-CUNETA.pdf')
})

caso('programación y materiales', () => {
  const s = semanaDe('2026-10-08')
  assert.deepEqual(s, { lunes: '2026-10-05', domingo: '2026-10-11' })
  const [p, ...otras] = rutas.programacion({ ...s, cuadrilla: 1, sede: 'CAMANA', tipo: 'ACTIVIDADES' })
  assert.equal(otras.length, 0)
  assert.equal(p.archivo, '2026-10-05_al_2026-10-11_C01_PROGRAMACION-ACTIVIDADES.xlsx')
  assert.equal(p.carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-10/PROGRAMACION_SEMANAL_DE_ACTIVIDADES_Y_RECURSOS/CUADRILLA_1_CAMANA`)
  // La semana que cruza meses va en los dos (P27)
  const cruce = rutas.programacion({ ...semanaDe('2026-10-30'), cuadrilla: 1, sede: 'CAMANA', tipo: 'ACTIVIDADES' })
  assert.deepEqual(cruce.map((r) => r.mes), ['2026-10', '2026-11'])
  assert.equal(cruce[1].carpeta, `${RAIZ}/MANTENIMIENTO_RUTINARIO/2026-11/PROGRAMACION_SEMANAL_DE_ACTIVIDADES_Y_RECURSOS/CUADRILLA_1_CAMANA`)
  assert.equal(cruce[0].archivo, cruce[1].archivo)
  const m = rutas.materiales({ mes: '2026-10', cuadrillas: 7 })
  assert.equal(m.archivo, '2026-10_SEGUIMIENTO-DIARIO-DE-MATERIALES_7-CUADRILLAS.xlsx')
})

caso('semana del contrato (P41: la 01 empezó el 01/10/2026)', () => {
  assert.equal(semanaDelContrato('2026-10-01'), 1)
  assert.equal(semanaDelContrato('2026-10-04'), 1)
  assert.equal(semanaDelContrato('2026-10-05'), 2)
  assert.equal(semanaDelContrato('2026-10-11'), 2)
  assert.equal(semanaDelContrato('2026-10-20'), 4)
  assert.equal(semanaDelContrato('2026-11-02'), 6)
})

caso('nombres repetidos y limpieza', () => {
  const usados = new Set<string>()
  // P19 / P21: la 2.ª lleva _A, la 3.ª _B…
  assert.equal(nombreLibre(usados, 'X', 'ITEM_5(2).jpg'), 'ITEM_5(2).jpg')
  assert.equal(nombreLibre(usados, 'X', 'ITEM_5(2).jpg'), 'ITEM_5(2)_A.jpg')
  assert.equal(nombreLibre(usados, 'X', 'ITEM_5(2).jpg'), 'ITEM_5(2)_B.jpg')
  assert.equal(nombreLibre(usados, 'Y', 'ITEM_5(2).jpg'), 'ITEM_5(2).jpg')
  assert.equal(letraDeRepetida(0), 'A')
  assert.equal(letraDeRepetida(25), 'Z')
  assert.equal(letraDeRepetida(26), 'AA')
  assert.equal(aCovinca('Señales verticales – Ñandú'), 'SENALES_VERTICALES_NANDU')
})

console.log(`\n${ok} casos correctos`)
