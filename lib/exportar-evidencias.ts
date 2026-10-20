/**
 * Exportar evidencias (apartado 4.13, boceto de Elvis del 13/10/2026).
 *
 * El supervisor, el administrador, el visor COVINCA o SSOMA filtran las fotos
 * por fechas, origen y PCI, y bajan un ZIP con este árbol:
 *
 *   EXPORTACION_01-10-2026_AL_13-10-2026/
 *     01_MR/CUADRILLA_2_PEDREGAL/2026-10-13/SECTOR_1.1_…/<actividad>/ANTES/…
 *     02_PCI/PCI_44/3_DIAS/ITEM_19/ITEM_19(1).jpg
 *
 * Con «Mantener nomenclatura oficial» los nombres son los de la entrega
 * COVINCA (PCI_44, 3_DIAS, ITEM_19, `2026-10-13_KM-852+335_LD_ANTES.jpg`);
 * sin ella, los del boceto (PCI-2026-044, PLAZO_3_DIAS, ITEM_019, foto001).
 * Sin «Incluir estructura de carpetas» todo va en una sola carpeta y la ruta
 * pasa al nombre del archivo.
 *
 * En PCI la etapa es el número entre paréntesis: (1) antes, (2) durante y
 * (3) después (Elvis). En MR hay subcarpeta de etapa solo si la foto la tiene.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { construirIndice, type FilaIndice } from './paquete'
import {
  aCovinca, carpetaCuadrilla, carpetaPci, carpetaPlazo, fase, kmDeFoto, lado, nombreLibre, numeroDeFasePci,
} from './covinca'
import { aJpg, enParalelo, firmar } from './estructura-covinca'
import { fmtDate } from './utils'

export type FotoExportable = {
  id: string
  storage_path: string
  master_path: string | null
  phase: string | null
  work_date: string | null
  fecha_sello: string | null
  taken_at: string | null
  origen: string
  crew_numero: number | null
  crew_sede: string | null
  crew_code: string | null
  crew_name: string | null
  activity_code: string | null
  activity_name: string | null
  activity_carpeta_ns: string | null
  sector_code: string | null
  sector_folder: string | null
  progresiva_m: number | null
  side: string | null
  pci_code: string | null
  pci_item_number: number | null
  pci_term_days: number | null
  revision: string | null
  revision_nota: string | null
}

export type OpcionesDeExportacion = {
  /** Las carpetas MR / PCI; sin ellas, todo en una sola carpeta. */
  estructura: boolean
  /** Los nombres de la entrega COVINCA; sin ella, los del boceto. */
  oficial: boolean
}

export type AvanceDeExportacion = { paso: string; hechos: number; total: number }

/** `01-10-2026` */
const dma = (iso: string) => iso.slice(0, 10).split('-').reverse().join('-')

/** `EXPORTACION_01-10-2026_AL_13-10-2026`: la carpeta raíz y el nombre del ZIP. */
export function nombreDeExportacion(desde: string, hasta: string): string {
  return `EXPORTACION_${dma(desde)}_AL_${dma(hasta)}`
}

export const esFotoPci = (f: Pick<FotoExportable, 'pci_code' | 'pci_item_number'>) =>
  f.pci_code != null && f.pci_item_number != null

/** La fecha de la foto: la del sello si se editó, si no la del trabajo. */
export const fechaDeFoto = (f: Pick<FotoExportable, 'fecha_sello' | 'work_date' | 'taken_at'>) =>
  (f.fecha_sello ?? f.work_date ?? f.taken_at ?? '').slice(0, 10)

const tres = (n: number) => String(n).padStart(3, '0')

/** `Pintado_marcas_pavimento`: legible, sin tildes ni signos. */
function carpetaLegible(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Mn}+/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Sin_actividad'
}

/**
 * Carpeta y nombre de una foto, sin la raíz. `numero` es el correlativo de
 * la foto dentro de su carpeta (solo lo usa la nomenclatura del boceto en MR).
 */
export function rutaDeExportacion(
  f: FotoExportable,
  op: OpcionesDeExportacion,
  numero = 1,
): { carpeta: string; archivo: string } {
  const fecha = fechaDeFoto(f)
  const etapa = f.phase === 'antes' || f.phase === 'durante' || f.phase === 'despues' ? fase(f.phase) : null
  let carpeta: string
  let archivo: string

  if (esFotoPci(f)) {
    const item = f.pci_item_number!
    const dias = f.pci_term_days ?? 0
    if (op.oficial) {
      carpeta = `02_PCI/${carpetaPci(f.pci_code!)}/${carpetaPlazo(dias)}/ITEM_${item}`
      archivo = `ITEM_${item}(${numeroDeFasePci(f.phase)}).jpg`
    } else {
      carpeta = `02_PCI/${f.pci_code}/PLAZO_${dias === 1 ? '1_DIA' : `${dias}_DIAS`}/ITEM_${tres(item)}`
      archivo = `ITEM_${tres(item)}(${numeroDeFasePci(f.phase)}).jpg`
    }
  } else {
    const numeroCuadrilla = f.crew_numero ?? Number(f.crew_code?.match(/\d+/)?.[0] ?? 0)
    if (op.oficial) {
      const sede = f.crew_sede ?? aCovinca(f.crew_name ?? 'SIN_SEDE').slice(0, 20)
      const actividad = f.activity_carpeta_ns ?? aCovinca(f.activity_name ?? 'SIN_ACTIVIDAD')
      carpeta = [
        '01_MR', carpetaCuadrilla(numeroCuadrilla, sede), fecha, f.sector_folder ?? 'SIN_SECTOR', actividad, etapa,
      ].filter(Boolean).join('/')
      archivo = [fecha, kmDeFoto(f.progresiva_m), lado(f.side), fase(f.phase)].join('_') + '.jpg'
    } else {
      carpeta = [
        '01_MR', 'Programacion', `Cuadrilla_${numeroCuadrilla}`, fecha,
        f.sector_code ? `Sector_${f.sector_code}` : 'Sin_sector',
        carpetaLegible(f.activity_name ?? ''), etapa,
      ].filter(Boolean).join('/')
      archivo = `foto${tres(numero)}.jpg`
    }
  }

  if (!op.estructura) return { carpeta: '', archivo: `${carpeta.replaceAll('/', '_')}_${archivo}` }
  return { carpeta, archivo }
}

/**
 * Las rutas de todas las fotos, en el orden de toma: así los correlativos y
 * las repetidas (_A, _B) salen siempre iguales, termine primero la descarga
 * que termine. Las observadas por COVINCA no van.
 */
export function rutasDeExportacion(
  fotos: FotoExportable[],
  op: OpcionesDeExportacion,
): { foto: FotoExportable; carpeta: string; archivo: string }[] {
  const usados = new Set<string>()
  const correlativos = new Map<string, number>()
  const ordenadas = [...fotos].sort((a, b) =>
    (fechaDeFoto(a) + (a.taken_at ?? '') + a.id).localeCompare(fechaDeFoto(b) + (b.taken_at ?? '') + b.id))
  return ordenadas.filter((f) => f.revision !== 'observada').map((f) => {
    // El correlativo del boceto se cuenta por carpeta
    const carpetaBase = rutaDeExportacion(f, { ...op, estructura: true }, 1).carpeta
    const n = (correlativos.get(carpetaBase) ?? 0) + 1
    correlativos.set(carpetaBase, n)
    const r = rutaDeExportacion(f, op, n)
    return { foto: f, carpeta: r.carpeta, archivo: nombreLibre(usados, r.carpeta, r.archivo) }
  })
}

export async function armarExportacion(opciones: {
  sb: SupabaseClient<any>
  fotos: FotoExportable[]
  op: OpcionesDeExportacion
  desde: string
  hasta: string
  servicioNombre: string
  generadoPor: string
  filtros: string
  alAvanzar?: (a: AvanceDeExportacion) => void
}): Promise<Blob> {
  const { sb, fotos, op, desde, hasta, alAvanzar } = opciones
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const raiz = nombreDeExportacion(desde, hasta)
  const indice: FilaIndice[] = []
  const avisar = (paso: string, hechos: number, total: number) => alAvanzar?.({ paso, hechos, total })

  for (const f of fotos.filter((x) => x.revision === 'observada')) {
    indice.push({
      carpeta: '(observada por COVINCA: no se exporta)', archivo: f.storage_path, tipo: 'Foto observada',
      fecha: fechaDeFoto(f), bytes: 0,
      detalle: [f.pci_code && `${f.pci_code} · ítem ${f.pci_item_number}`, f.activity_name, f.revision_nota && `«${f.revision_nota}»`]
        .filter(Boolean).join(' · '),
    })
  }

  const destinos = rutasDeExportacion(fotos, op)
  avisar('Preparando enlaces', 0, 1)
  const firmadas = await firmar(sb, 'evidencias', destinos.map((d) => d.foto.storage_path))
  const originales = await firmar(sb, 'evidencias', destinos.flatMap((d) => (d.foto.master_path ? [d.foto.master_path] : [])))

  let hechas = 0
  await enParalelo(destinos, 6, async ({ foto: f, carpeta, archivo }) => {
    const fecha = fechaDeFoto(f)
    const detalle = [
      f.pci_code && `${f.pci_code} · ítem ${f.pci_item_number}`, f.activity_name, f.crew_name, f.phase,
    ].filter(Boolean).join(' · ')
    try {
      // El original del celular (JPG 4080 × 3060 con su sello y EXIF) va
      // tal cual; sin él, se arma desde la foto liviana y se dice
      let jpg: Blob | null = null
      const urlOriginal = f.master_path ? originales.get(f.master_path) : undefined
      if (urlOriginal) {
        const r = await fetch(urlOriginal)
        if (r.ok) jpg = await r.blob()
      }
      const ampliada = !jpg
      if (!jpg) {
        const url = firmadas.get(f.storage_path)
        if (!url) throw new Error('sin enlace')
        jpg = await aJpg(await (await fetch(url)).blob(), true)
      }
      const ruta = carpeta ? `${raiz}/${carpeta}` : raiz
      zip.folder(ruta)!.file(archivo, jpg)
      indice.push({
        carpeta: ruta, archivo, bytes: jpg.size, fecha,
        tipo: esFotoPci(f) ? 'Foto PCI' : 'Foto MR / programación',
        detalle: ampliada ? `${detalle} · ampliada desde la foto liviana: no tiene original` : detalle,
      })
    } catch {
      indice.push({ carpeta: '(no se pudo descargar)', archivo: f.storage_path, tipo: 'Foto', fecha, detalle: 'Volver a exportar', bytes: 0 })
    }
    avisar('Fotografías', ++hechas, destinos.length)
  })

  avisar('Índice', 0, 1)
  zip.folder(raiz)!.file('INDICE.xlsx', await construirIndice(
    indice.sort((a, b) => (a.carpeta + a.archivo).localeCompare(b.carpeta + b.archivo)),
    {
      titulo: 'Exportación de evidencias', servicio: opciones.servicioNombre, cliente: null, contrato: null,
      periodo: `${fmtDate(desde)} al ${fmtDate(hasta)} · ${opciones.filtros}`, generadoPor: opciones.generadoPor,
    },
    { desde, hasta },
  ))
  avisar('Comprimiendo', 1, 1)
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}
