/**
 * La nomenclatura de la estructura documental COVINCA.
 *
 * Sale del ZIP «SERVICON_COVINCA_Estructura_Revision» que mandó Elvis y de
 * la reunión del 05-10-2026. Reglas: MAYÚSCULAS, sin tildes ni Ñ, «_» entre
 * campos y «-» dentro de un campo, fechas ISO, progresivas «km+mmm».
 *
 * Funciones puras: el empaquetador las usa y `scripts/probar-covinca.ts` las
 * comprueba contra los nombres del ZIP.
 */

export const RAIZ = 'SERVICON_COVINCA_REVISION_ESTRUCTURA'

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

/** `KM-0852+335`: en los nombres de foto el km va en cuatro cifras («KM-XXXX+XXX»). */
export function kmDeFoto(metros: number | null | undefined): string {
  if (metros == null || !Number.isFinite(Number(metros))) return 'KM-SIN-PROGRESIVA'
  const m = Math.max(0, Math.round(Number(metros)))
  return `KM-${String(Math.floor(m / 1000)).padStart(4, '0')}+${String(m % 1000).padStart(3, '0')}`
}

/** El lado como lo escribe la programación: LD, LI, LD-LI, EJE. Sin «/», que no vale en un archivo. */
export function lado(side: string | null | undefined): string {
  switch ((side ?? '').toLowerCase()) {
    case 'derecho': return 'LD'
    case 'izquierdo': return 'LI'
    case 'ambos': return 'LD-LI'
    case 'eje': return 'EJE'
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

/**
 * Las rutas de la estructura. Cada función devuelve carpeta y nombre de
 * archivo; el empaquetador resuelve los choques de nombre con un correlativo.
 */
export const rutas = {
  /** Foto del día por cuadrilla (todas las actividades juntas, no PCI). */
  fotoRutinaria(p: {
    fecha: string; cuadrilla: number; sede: string; progresivaM: number | null
    lado: string | null; codigo: string | null; fase: string | null
  }) {
    const mes = p.fecha.slice(0, 7)
    const dia = p.fecha.slice(8, 10)
    return {
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/${carpetaCuadrilla(p.cuadrilla, p.sede)}/${dia}`,
      archivo: [
        p.fecha, codigoCuadrilla(p.cuadrilla), kmDeFoto(p.progresivaM), lado(p.lado),
        p.codigo ? aCovinca(p.codigo, '-') : 'SIN-CODIGO', fase(p.fase),
      ].join('_') + '.jpg',
    }
  },

  /** La misma foto, separada por sector y tipo de actividad (niveles de servicio). */
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

  /** Foto de un ítem PCI. */
  fotoPci(p: { pciCodigo: string; plazoDias: number; item: number; fase: string | null }) {
    return {
      carpeta: `${RAIZ}/PCI/${carpetaPci(p.pciCodigo)}/${carpetaPlazo(p.plazoDias)}/ITEM_${p.item}`,
      archivo: `ITEM_${p.item}(${numeroDeFasePci(p.fase)}).jpg`,
    }
  },

  /** Reportes, charlas, ATS, checklist y PETAR por cuadrilla. */
  documento(p: {
    fecha: string; cuadrilla: number; sede: string
    tipo: 'ats' | 'charla' | 'checklist_vehicular' | 'reporte_diario' | 'petar' | 'otro'
    detalle?: string | null; extension: string
  }) {
    const mes = p.fecha.slice(0, 7)
    const cc = codigoCuadrilla(p.cuadrilla)
    const base = `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/REPORTES_DIARIOS_CHARLAS_ATS/${carpetaCuadrilla(p.cuadrilla, p.sede)}`
    const detalle = p.detalle ? aCovinca(p.detalle, '-') : null
    switch (p.tipo) {
      case 'ats':
        return { carpeta: `${base}/CHARLAS_ATS`, archivo: [p.fecha, cc, 'ATS', detalle].filter(Boolean).join('_') + p.extension }
      case 'charla':
        return { carpeta: `${base}/CHARLA_SEGURIDAD`, archivo: `${p.fecha}_${cc}_CHARLA-5-MIN${p.extension}` }
      case 'checklist_vehicular':
        // La carpeta se llama así en la estructura aprobada (con la errata)
        return { carpeta: `${base}/CHECKIST_VEHICULOS`, archivo: `${p.fecha}_${cc}_CHECKLIST_${detalle ?? 'VEHICULO-01'}${p.extension}` }
      case 'reporte_diario':
        return { carpeta: `${base}/REPORTE_DIARIO`, archivo: `${p.fecha}_${cc}_REPORTE-DIARIO${p.extension}` }
      case 'petar':
        return { carpeta: `${base}/PETAR_ACTIVIDADES`, archivo: [p.fecha, cc, 'PETAR', detalle].filter(Boolean).join('_') + p.extension }
      default:
        return { carpeta: `${base}/OTROS`, archivo: [p.fecha, cc, detalle ?? 'DOCUMENTO'].join('_') + p.extension }
    }
  },

  /** Programación semanal por cuadrilla. */
  programacion(p: { lunes: string; domingo: string; cuadrilla: number; sede: string; tipo: 'ACTIVIDADES' | 'RECURSOS' }) {
    const mes = p.lunes.slice(0, 7)
    return {
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${mes}/PROGRAMACION_SEMANAL_DE_ACTIVIDADES_Y_RECURSOS/${carpetaCuadrilla(p.cuadrilla, p.sede)}`,
      archivo: `${p.lunes}_al_${p.domingo}_${codigoCuadrilla(p.cuadrilla)}_PROGRAMACION-${p.tipo}.xlsx`,
    }
  },

  /** El seguimiento diario de materiales del mes, uno para todas las cuadrillas. */
  materiales(p: { mes: string; cuadrillas: number }) {
    return {
      carpeta: `${RAIZ}/MANTENIMIENTO_RUTINARIO/${p.mes}/SEGUIMIENTO_DIARIO_DE_MATERIALES/${p.mes}`,
      archivo: `${p.mes}_SEGUIMIENTO-DIARIO-DE-MATERIALES_${p.cuadrillas}-CUADRILLAS.xlsx`,
    }
  },
}

/**
 * Un nombre libre dentro de una carpeta: si ya existe, se le agrega «_2»,
 * «_3»… antes de la extensión (el ZIP no admite dos archivos iguales y
 * COVINCA no definió correlativo; el primero queda con el nombre exacto).
 */
export function nombreLibre(usados: Set<string>, carpeta: string, archivo: string): string {
  let nombre = archivo
  let k = 2
  const punto = archivo.lastIndexOf('.')
  const base = punto > 0 ? archivo.slice(0, punto) : archivo
  const ext = punto > 0 ? archivo.slice(punto) : ''
  while (usados.has(carpeta + '/' + nombre)) nombre = `${base}_${k++}${ext}`
  usados.add(carpeta + '/' + nombre)
  return nombre
}
