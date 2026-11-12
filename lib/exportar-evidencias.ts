/**
 * Exportar evidencias (apartado 4.13, boceto de Elvis del 13/10/2026).
 *
 * El supervisor, el administrador, el visor COVINCA o SSOMA filtran las fotos
 * por fechas, origen y PCI, y bajan un ZIP.
 *
 * Con «Mantener nomenclatura oficial», el mismo criterio de guardado de
 * SERVICON y de la entrega COVINCA: una foto, tres ubicaciones (Elvis,
 * 12/11; ver `destinosDeFoto`):
 *
 *   EXPORTACION_01-11-2026_AL_11-11-2026/
 *     MANTENIMIENTO_RUTINARIO/2026-11/CUADRILLA_2_PEDREGAL/11/ITEM_53(2).jpg
 *     PCI/PCI_60/7_DIAS/ITEM_53/ITEM_53(2).jpg
 *     MANTENIMIENTO_RUTINARIO/2026-11/NIVELES_DE_SERVICIO_2026-11/SECTOR_1.4_927+000_952+000/LIMPIEZA_SENALES_VERTICALES/…
 *
 * Sin ella, los nombres del boceto (01_MR/Programacion/Cuadrilla_2/…/foto001,
 * 02_PCI/PCI-2026-044/PLAZO_3_DIAS/ITEM_19), una sola copia por foto. En los
 * dos casos el ítem va sin ceros: ITEM_53, no ITEM_053.
 * Sin «Incluir estructura de carpetas» todo va en una sola carpeta y la ruta
 * pasa al nombre del archivo.
 *
 * En PCI la etapa es el número entre paréntesis: (1) antes, (2) durante y
 * (3) después (Elvis).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { construirIndice, type FilaIndice } from './paquete'
import { RAIZ, destinosDeFoto, fase, nombreLibre, numeroDeFasePci } from './covinca'
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

/** La ruta de la estructura oficial, sin la raíz (la exportación lleva la suya). */
const sinRaiz = (carpeta: string) => (carpeta.startsWith(RAIZ + '/') ? carpeta.slice(RAIZ.length + 1) : carpeta)

/** La ruta del boceto, una por foto. `numero` es su correlativo en la carpeta (MR). */
function rutaDelBoceto(f: FotoExportable, numero: number): { carpeta: string; archivo: string } {
  const fecha = fechaDeFoto(f)
  const etapa = f.phase === 'antes' || f.phase === 'durante' || f.phase === 'despues' ? fase(f.phase) : null
  if (esFotoPci(f)) {
    const item = Number(f.pci_item_number)
    const dias = f.pci_term_days ?? 0
    return {
      carpeta: `02_PCI/${f.pci_code}/PLAZO_${dias === 1 ? '1_DIA' : `${dias}_DIAS`}/ITEM_${item}`,
      archivo: `ITEM_${item}(${numeroDeFasePci(f.phase)}).jpg`,
    }
  }
  const numeroCuadrilla = f.crew_numero ?? Number(f.crew_code?.match(/\d+/)?.[0] ?? 0)
  return {
    carpeta: [
      '01_MR', 'Programacion', `Cuadrilla_${numeroCuadrilla}`, fecha,
      f.sector_code ? `Sector_${f.sector_code}` : 'Sin_sector',
      carpetaLegible(f.activity_name ?? ''), etapa,
    ].filter(Boolean).join('/'),
    archivo: `foto${tres(numero)}.jpg`,
  }
}

const TODAS = { rutinario: true, pci: true, niveles: true }

/**
 * Las rutas de todas las fotos, en el orden de toma: así los correlativos y
 * las repetidas (_A, _B) salen siempre iguales, termine primero la descarga
 * que termine. Con la nomenclatura oficial una foto puede ir a tres
 * carpetas (panel diario, PCI y niveles de servicio). Las observadas por
 * COVINCA no van.
 */
export function rutasDeExportacion(
  fotos: FotoExportable[],
  op: OpcionesDeExportacion,
): { foto: FotoExportable; carpeta: string; archivo: string }[] {
  const usados = new Set<string>()
  const correlativos = new Map<string, number>()
  const ordenadas = [...fotos].sort((a, b) =>
    (fechaDeFoto(a) + (a.taken_at ?? '') + a.id).localeCompare(fechaDeFoto(b) + (b.taken_at ?? '') + b.id))
  return ordenadas.filter((f) => f.revision !== 'observada').flatMap((f) => {
    let destinos: { carpeta: string; archivo: string }[]
    if (op.oficial) {
      destinos = destinosDeFoto({ ...f, fecha: fechaDeFoto(f) }, TODAS, correlativos)
        .map((d) => ({ carpeta: sinRaiz(d.carpeta), archivo: d.archivo }))
      // Sin cuadrilla, sector ni PCI no tiene dónde ir: queda en el panel general
      if (!destinos.length) destinos = [{ carpeta: 'SIN_UBICACION', archivo: `${fechaDeFoto(f) || 'SIN_FECHA'}_${f.id.slice(0, 8)}.jpg` }]
    } else {
      // El correlativo del boceto se cuenta por carpeta
      const carpeta = rutaDelBoceto(f, 1).carpeta
      const n = (correlativos.get(carpeta) ?? 0) + 1
      correlativos.set(carpeta, n)
      destinos = [rutaDelBoceto(f, n)]
    }
    return destinos.map((d) => {
      const r = op.estructura ? d : { carpeta: '', archivo: `${d.carpeta.replaceAll('/', '_')}_${d.archivo}` }
      return { foto: f, carpeta: r.carpeta, archivo: nombreLibre(usados, r.carpeta, r.archivo) }
    })
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

  // Una foto puede ir a varias carpetas: se baja una vez y se copia
  const porFoto = new Map<string, { foto: FotoExportable; destinos: { carpeta: string; archivo: string }[] }>()
  for (const d of rutasDeExportacion(fotos, op)) {
    const g = porFoto.get(d.foto.id) ?? { foto: d.foto, destinos: [] }
    g.destinos.push({ carpeta: d.carpeta, archivo: d.archivo })
    porFoto.set(d.foto.id, g)
  }
  const grupos = [...porFoto.values()]
  avisar('Preparando enlaces', 0, 1)
  const firmadas = await firmar(sb, 'evidencias', grupos.map((g) => g.foto.storage_path))
  const originales = await firmar(sb, 'evidencias', grupos.flatMap((g) => (g.foto.master_path ? [g.foto.master_path] : [])))

  let hechas = 0
  await enParalelo(grupos, 6, async ({ foto: f, destinos }) => {
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
      for (const { carpeta, archivo } of destinos) {
        const ruta = carpeta ? `${raiz}/${carpeta}` : raiz
        zip.folder(ruta)!.file(archivo, jpg)
        indice.push({
          carpeta: ruta, archivo, bytes: jpg.size, fecha,
          tipo: esFotoPci(f) ? 'Foto PCI' : 'Foto MR / programación',
          detalle: ampliada ? `${detalle} · ampliada desde la foto liviana: no tiene original` : detalle,
        })
      }
    } catch {
      indice.push({ carpeta: '(no se pudo descargar)', archivo: f.storage_path, tipo: 'Foto', fecha, detalle: 'Volver a exportar', bytes: 0 })
    }
    avisar('Fotografías', ++hechas, grupos.length)
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
