/**
 * La nomenclatura de la estructura documental COVINCA.
 *
 * Sale del ZIP «SERVICON_COVINCA_Estructura_Revision» que mandó Elvis, de
 * la reunión del 05-10-2026 y de sus respuestas al cuestionario (13-10-2026).
 * Reglas: MAYÚSCULAS, sin tildes ni Ñ, «_» entre campos y «-» dentro de un
 * campo, fechas ISO, progresivas «km+mmm» sin ceros a la izquierda.
 *
 * Funciones puras: el empaquetador las usa y `scripts/probar-covinca.ts` las
 * comprueba contra los nombres del ZIP.
 */

/** La carpeta raíz, como se llama en el Drive de SERVICON (Elvis, 12/11). */
export const RAIZ = 'SERVICON ESTRUCTURA GESTION DE INFORMACION'

/** Sin tildes, sin Ñ, en mayúsculas, solo A-Z 0-9 y el separador dado. */
export function aCovinca(texto: string, separador = '_'): string {
  return texto
    .normalize('NFD').replace(/\p{Mn}+/gu, '')
    .replace(/ñ/gi, 'N')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, separador)
    .replace(new RegExp(`\\${separador}+`, 'g'), separador)
    .replace(new RegExp(`^\\${separador}|\\${separador}$`, 'g'), '')
}

/** `CUADRILLA_1_CAMANA` */
export function carpetaCuadrilla(numero: number, sede: string): string {
  return `CUADRILLA_${numero}_${aCovinca(sede)}`
}

/** `C01` */
export function codigoCuadrilla(numero: number): string {
  return 'C' + String(numero).padStart(2, '0')
}

/** `852+335`: el km sin relleno, los metros en tres cifras (carpetas de sector). */
export function progresiva(metros: number): string {
  const m = Math.max(0, Math.round(metros))
  return `${Math.floor(m / 1000)}+${String(m % 1000).padStart(3, '0')}`
}

/** `KM-852+335`: el km sin ceros a la izquierda (Elvis, P7: «sin ceros intermedios»). */
export function kmDeFoto(metros: number | null | undefined): string {
  if (metros == null || !Number.isFinite(Number(metros))) return 'KM-SIN-PROGRESIVA'
  return 'KM-' + progresiva(Number(metros))
}

/**
 * El lado como lo escribe la programación: LD, LI, LD-LI, EJE, y CD / CI
 * para la calzada derecha e izquierda (Elvis, P8). Sin «/», que no vale en
 * un archivo.
 */
export function lado(side: string | null | undefined): string {
  switch ((side ?? '').toLowerCase()) {
    case 'derecho': return 'LD'
    case 'izquierdo': return 'LI'
    case 'ambos': return 'LD-LI'
    case 'eje': return 'EJE'
    case 'calzada_derecha': return 'CD'
    case 'calzada_izquierda': return 'CI'
    default: return side ? aCovinca(side, '-') : 'SL'
  }
}

/** ANTES · DURANTE · DESPUES */
export function fase(phase: string | null | undefined): string {
  switch (phase) {
    case 'antes': return 'ANTES'
    case 'durante': return 'DURANTE'
    case 'despues': return 'DESPUES'
    default: return 'GENERAL'
  }
}

/** En PCI la fase es el número entre paréntesis: (1) antes, (2) durante, (3) después. */
export function numeroDeFasePci(phase: string | null | undefined): number {
  return phase === 'antes' ? 1 : phase === 'durante' ? 2 : phase === 'despues' ? 3 : 4
}

/** `1_DIA`, `2_DIAS`, `3_DIAS`, `7_DIAS`, `14_DIAS`… */
export function carpetaPlazo(dias: number): string {
  return dias === 1 ? '1_DIA' : `${dias}_DIAS`
}

/** `PCI_50` a partir del código («PCI-2026-050», «PCI N° 050»…): el correlativo, sin ceros a la izquierda. */
export function carpetaPci(codigo: string): string {
  const numeros = codigo.match(/\d+/g)
  if (!numeros?.length) return 'PCI_' + aCovinca(codigo)
  const ultimo = numeros[numeros.length - 1]
  return 'PCI_' + String(Number(ultimo))
}

/** Lunes y domingo de la semana de una fecha ISO. */
export function semanaDe(fechaIso: string): { lunes: string; domingo: string } {
  const d = new Date(fechaIso + 'T12:00:00Z')
  const dia = (d.getUTCDay() + 6) % 7
  const lunes = new Date(d.getTime() - dia * 86400000)
  const domingo = new Date(lunes.getTime() + 6 * 86400000)
  return { lunes: lunes.toISOString().slice(0, 10), domingo: domingo.toISOString().slice(0, 10) }
}

/** El contrato empezó a ejecutarse el jueves 01/10/2026: esa es la semana 01 (Elvis, P41). */
export const INICIO_DEL_CONTRATO = '2026-10-01'

/**
 * La semana del contrato de una fecha: la 01 es la que contiene el inicio
 * (lunes a domingo), y de ahí se cuenta. Del 05 al 11/10/2026 es la 02, como
 * en la programación C07.
 */
export function semanaDelContrato(fechaIso: string, inicio = INICIO_DEL_CONTRATO): number {
  const primera = new Date(semanaDe(inicio).lunes + 'T12:00:00Z').getTime()
  const esta = new Date(semanaDe(fechaIso).lunes + 'T12:00:00Z').getTime()
  return Math.round((esta - primera) / (7 * 86400000)) + 1
}

/**
 * Las rutas de la estructura. Cada función devuelve carpeta y nombre de
 * archivo; el empaquetador resuelve los choques de nombre con un correlativo.
 */
export const rutas = {
  /**
   * Foto del día por cuadrilla (todas las actividades juntas, no PCI). Se
   * nombra por el código de la partida y un correlativo dentro de la carpeta
   * del día: `COV_SV_029_foto1.jpg` (Elvis, P6). El empaquetador lleva la
   * cuenta (`numero`).
   */
  fotoRutinaria(p: { fecha: string; cuadrilla: number; sede: string; codigo: string | null; numero: number }) {
    const mes = p.fecha.slice(0, 7)
    const dia = p.fecha.slice(8, 10)
    return {
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/${carpetaCuadrilla(p.cuadrilla, p.sede)}/${dia}`,
      archivo: `${p.codigo ? aCovinca(p.codigo) : 'SIN_CODIGO'}_foto${p.numero}.jpg`,
    }
  },

  /**
   * La misma foto, separada por sector y tipo de actividad (niveles de
   * servicio). También las fotos de un ítem PCI (Elvis, P20).
   */
  fotoNivelDeServicio(p: {
    fecha: string; sector: string; carpetaNs: string; progresivaM: number | null
    lado: string | null; fase: string | null
  }) {
    const mes = p.fecha.slice(0, 7)
    return {
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/NIVELES_DE_SERVICIO_${mes}/${p.sector}/${p.carpetaNs}`,
      archivo: [p.fecha, kmDeFoto(p.progresivaM), lado(p.lado), fase(p.fase)].join('_') + '.jpg',
    }
  },

  /**
   * Foto de un ítem PCI: `ITEM_53(2).jpg`, sin ceros ni espacios (Elvis,
   * 12/11: no «ITEM_053 (2)»).
   */
  fotoPci(p: { pciCodigo: string; plazoDias: number; item: number; fase: string | null }) {
    return {
      carpeta: `${RAIZ}/PCI/${carpetaPci(p.pciCodigo)}/${carpetaPlazo(p.plazoDias)}/ITEM_${Number(p.item)}`,
      archivo: archivoPci(p.item, p.fase),
    }
  },

  /** Reportes, charlas, ATS, checklist y PETAR por cuadrilla. */
  documento(p: {
    fecha: string; cuadrilla: number; sede: string
    tipo: 'ats' | 'ats_conductor' | 'charla' | 'checklist_vehicular' | 'reporte_diario' | 'petar' | 'otro'
    detalle?: string | null; extension: string
  }) {
    const mes = p.fecha.slice(0, 7)
    const cc = codigoCuadrilla(p.cuadrilla)
    const base = `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/REPORTES_DIARIOS_CHARLAS_ATS/${carpetaCuadrilla(p.cuadrilla, p.sede)}`
    const detalle = p.detalle ? aCovinca(p.detalle, '-') : null
    switch (p.tipo) {
      case 'ats':
        return { carpeta: `${base}/CHARLAS_ATS`, archivo: [p.fecha, cc, 'ATS', detalle].filter(Boolean).join('_') + p.extension }
      case 'ats_conductor':
        // El del conductor, por foto como el de la cuadrilla (Elvis, P43)
        return { carpeta: `${base}/CHARLAS_ATS`, archivo: `${p.fecha}_${cc}_ATS-CONDUCTOR_${detalle ?? 'VEHICULO-01'}${p.extension}` }
      case 'charla':
        return { carpeta: `${base}/CHARLA_SEGURIDAD`, archivo: `${p.fecha}_${cc}_CHARLA-5-MIN${p.extension}` }
      case 'checklist_vehicular':
        // La estructura aprobada decía CHECKIST: Elvis pidió corregirla (P28)
        return { carpeta: `${base}/CHECKLIST_VEHICULOS`, archivo: `${p.fecha}_${cc}_CHECKLIST_${detalle ?? 'VEHICULO-01'}${p.extension}` }
      case 'reporte_diario':
        // `2026_10_01_C01_REPORTE_DIARIO` (Elvis, P15)
        return { carpeta: `${base}/REPORTE_DIARIO`, archivo: `${p.fecha.replaceAll('-', '_')}_${cc}_REPORTE_DIARIO${p.extension}` }
      case 'petar':
        return { carpeta: `${base}/PETAR_ACTIVIDADES`, archivo: [p.fecha, cc, 'PETAR', detalle].filter(Boolean).join('_') + p.extension }
      default:
        return { carpeta: `${base}/OTROS`, archivo: [p.fecha, cc, detalle ?? 'DOCUMENTO'].join('_') + p.extension }
    }
  },

  /**
   * Programación semanal por cuadrilla. La semana que cruza dos meses va en
   * los dos (Elvis, P27): devuelve una ruta por mes.
   */
  programacion(p: { lunes: string; domingo: string; cuadrilla: number; sede: string; tipo: 'ACTIVIDADES' | 'RECURSOS' }) {
    const meses = [...new Set([p.lunes.slice(0, 7), p.domingo.slice(0, 7)])]
    return meses.map((mes) => ({
      mes,
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/PROGRAMACION_SEMANAL_DE_ACTIVIDADES_Y_RECURSOS/${carpetaCuadrilla(p.cuadrilla, p.sede)}`,
      archivo: `${p.lunes}_al_${p.domingo}_${codigoCuadrilla(p.cuadrilla)}_PROGRAMACION-${p.tipo}.xlsx`,
    }))
  },

  /** El seguimiento diario de materiales del mes, uno para todas las cuadrillas. */
  materiales(p: { mes: string; cuadrillas: number }) {
    return {
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${p.mes}/SEGUIMIENTO_DIARIO_DE_MATERIALES/${p.mes}`,
      archivo: `${p.mes}_SEGUIMIENTO-DIARIO-DE-MATERIALES_${p.cuadrillas}-CUADRILLAS.xlsx`,
    }
  },
}

/** `ITEM_53(2).jpg`: el ítem sin ceros y la etapa entre paréntesis, sin espacios. */
export function archivoPci(item: number, phase: string | null | undefined): string {
  return `ITEM_${Number(item)}(${numeroDeFasePci(phase)}).jpg`
}

/** Lo que hace falta de una foto para ubicarla en la estructura. */
export type FotoEnEstructura = {
  fecha: string
  origen: string
  crew_numero: number | null
  crew_sede: string | null
  crew_code: string | null
  crew_name: string | null
  activity_code: string | null
  activity_carpeta_ns: string | null
  sector_folder: string | null
  progresiva_m: number | null
  side: string | null
  phase: string | null
  pci_code: string | null
  pci_item_number: number | null
  pci_term_days: number | null
}

export type RamasDeEstructura = { rutinario: boolean; pci: boolean; niveles: boolean }
export type DestinoDeFoto = { carpeta: string; archivo: string; rama: 'rutinario' | 'pci' | 'niveles' }

/**
 * Dónde va una foto: «una foto, tres ubicaciones» (Elvis, 12/11).
 *
 *   1. El original, en el panel diario de su cuadrilla y su fecha
 *      (MANTENIMIENTO_RUTINARIO/2026-11/CUADRILLA_2_PEDREGAL/11).
 *   2. Si atiende un ítem PCI, una copia en PCI/PCI_60/7_DIAS/ITEM_53.
 *   3. Una copia en los niveles de servicio, por sector y actividad
 *      (NIVELES_DE_SERVICIO_2026-11/SECTOR_1.4_…/LIMPIEZA_SENALES_VERTICALES).
 *
 * En el panel diario la foto de un ítem PCI lleva el nombre del ítem
 * (ITEM_53(2).jpg), como ya se guarda en el Drive; la de una partida, su
 * código (COV_SV_029_foto1.jpg, P6). `correlativos` lleva la cuenta de las
 * fotoN por carpeta y código; los choques de nombre los resuelve
 * `nombreLibre` (_A, _B…).
 */
export function destinosDeFoto(
  f: FotoEnEstructura,
  ramas: RamasDeEstructura,
  correlativos: Map<string, number>,
): DestinoDeFoto[] {
  const lista: DestinoDeFoto[] = []
  const esPci = f.pci_code != null && f.pci_item_number != null
  const numero = f.crew_numero ?? Number(f.crew_code?.match(/\d+/)?.[0] ?? 0)
  const sede = f.crew_sede ?? aCovinca(f.crew_name ?? 'SIN_SEDE').slice(0, 20)

  if (ramas.rutinario && numero > 0 && f.fecha && (f.origen === 'parte' || esPci)) {
    if (esPci) {
      const base = rutas.fotoRutinaria({ fecha: f.fecha, cuadrilla: numero, sede, codigo: null, numero: 1 })
      lista.push({ carpeta: base.carpeta, archivo: archivoPci(f.pci_item_number!, f.phase), rama: 'rutinario' })
    } else {
      const base = rutas.fotoRutinaria({ fecha: f.fecha, cuadrilla: numero, sede, codigo: f.activity_code, numero: 1 })
      const clave = base.carpeta + '|' + (f.activity_code ?? '')
      const n = (correlativos.get(clave) ?? 0) + 1
      correlativos.set(clave, n)
      lista.push({ ...rutas.fotoRutinaria({ fecha: f.fecha, cuadrilla: numero, sede, codigo: f.activity_code, numero: n }), rama: 'rutinario' })
    }
  }
  if (ramas.pci && esPci) {
    lista.push({
      ...rutas.fotoPci({ pciCodigo: f.pci_code!, plazoDias: f.pci_term_days ?? 0, item: f.pci_item_number!, fase: f.phase }),
      rama: 'pci',
    })
  }
  if (ramas.niveles && f.fecha && f.sector_folder && f.activity_carpeta_ns && (esPci || f.origen === 'parte')) {
    lista.push({
      ...rutas.fotoNivelDeServicio({
        fecha: f.fecha, sector: f.sector_folder, carpetaNs: f.activity_carpeta_ns,
        progresivaM: f.progresiva_m, lado: f.side, fase: f.phase,
      }),
      rama: 'niveles',
    })
  }
  return lista
}

/** `A`, `B`… `Z`, `AA`, `AB`…: la letra del correlativo de repetidas. */
export function letraDeRepetida(k: number): string {
  let n = k + 1
  let letras = ''
  while (n > 0) {
    n -= 1
    letras = String.fromCharCode(65 + (n % 26)) + letras
    n = Math.floor(n / 26)
  }
  return letras
}

/**
 * Un nombre libre dentro de una carpeta. La primera foto queda con el nombre
 * exacto; si ya existe, la segunda lleva «_A», la tercera «_B»… antes de la
 * extensión: ITEM_5(2).jpg, ITEM_5(2)_A.jpg, ITEM_5(2)_B.jpg (Elvis, P19 y
 * P21).
 */
export function nombreLibre(usados: Set<string>, carpeta: string, archivo: string): string {
  let nombre = archivo
  let k = 0
  const punto = archivo.lastIndexOf('.')
  const base = punto > 0 ? archivo.slice(0, punto) : archivo
  const ext = punto > 0 ? archivo.slice(punto) : ''
  while (usados.has(carpeta + '/' + nombre)) nombre = `${base}_${letraDeRepetida(k++)}${ext}`
  usados.add(carpeta + '/' + nombre)
  return nombre
}
