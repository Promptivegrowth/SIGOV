/**
 * Paquetes de entrega.
 *
 * Lo que hoy se arma a mano la noche anterior: una carpeta con los partes en
 * PDF, el panel fotográfico, los PCI levantados y los registros de SSOMA,
 * comprimida y enviada al cliente. Se pierde media jornada y siempre falta
 * algo, porque nadie tiene la lista completa de qué debía ir.
 *
 * Aquí el paquete se arma solo desde lo que ya está registrado, con una
 * estructura de carpetas fija —el cliente las espera así— y un INDICE.xlsx
 * que declara qué contiene, cuántos archivos y de qué fecha es cada uno. El
 * índice es lo que convierte un ZIP en un entregable revisable.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { reportePdf, type ReportMeta } from './reports'
import { fmtDate } from './utils'

/** Las carpetas del paquete, en el orden en que el cliente las revisa. */
export const CARPETAS = {
  partes: '01_PARTES_DIARIOS',
  fotos: '02_PANEL_FOTOGRAFICO',
  pci: '03_PCI',
  ssoma: '04_SSOMA',
  valorizacion: '05_VALORIZACION',
} as const

export type ContenidoPaquete = {
  partes: boolean
  fotos: boolean
  pci: boolean
  ssoma: boolean
  valorizacion: boolean
}

export type AvancePaquete = {
  paso: string
  hechos: number
  total: number
}

/** Una fila del índice: qué es cada archivo y de cuándo. */
type FilaIndice = {
  carpeta: string
  archivo: string
  tipo: string
  fecha: string
  detalle: string
  bytes: number
}

const sinAcentos = (t: string) =>
  t.normalize('NFD').replace(/\p{Mn}+/gu, '')

/** «1 charla», «3 charlas»: el índice lo lee una persona. */
const plural = (n: number, singular: string, plural = singular + 's') =>
  `${n} ${n === 1 ? singular : plural}`

/**
 * Un nombre de archivo que sobreviva a Windows, a Drive y al correo.
 *
 * Se queda solo con letras, números, guion, guion bajo y punto. Todo lo
 * demás —la viñeta «·» de los nombres de cuadrilla, los dos puntos, las
 * comillas— pasa a guion bajo: hay sistemas que los rechazan y otros que los
 * recodifican, y el archivo llega con el nombre roto.
 */
export function nombreSeguro(texto: string, largo = 60): string {
  return sinAcentos(texto)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .slice(0, largo) || 'sin_nombre'
}

/**
 * Arma el paquete y devuelve el ZIP.
 *
 * Recibe el cliente de Supabase ya autenticado: todo lo que entra al paquete
 * pasa por RLS, así que nadie puede empaquetar lo que no podría ver.
 */
export async function armarPaquete(opciones: {
  sb: SupabaseClient<any>
  servicioId: string
  servicioNombre: string
  cliente?: string | null
  contrato?: string | null
  desde: string
  hasta: string
  contenido: ContenidoPaquete
  generadoPor: string
  organizacion?: string
  alAvanzar?: (avance: AvancePaquete) => void
}): Promise<Blob> {
  const {
    sb, servicioId, servicioNombre, cliente, contrato,
    desde, hasta, contenido, generadoPor, organizacion, alAvanzar,
  } = opciones

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const indice: FilaIndice[] = []

  const meta: ReportMeta = {
    titulo: '',
    servicio: servicioNombre,
    cliente: cliente ?? null,
    contrato: contrato ?? null,
    periodo: `${fmtDate(desde)} al ${fmtDate(hasta)}`,
    generadoPor,
    organizacion,
  }

  const avisar = (paso: string, hechos: number, total: number) =>
    alAvanzar?.({ paso, hechos, total })

  // ─── 01 · Partes diarios ────────────────────────────────────────────
  if (contenido.partes) {
    avisar('Partes diarios', 0, 1)
    const { data: partes } = await sb
      .from('work_orders')
      .select('id, work_date, status, crews(name)')
      .eq('service_id', servicioId)
      .gte('work_date', desde)
      .lte('work_date', hasta)
      .is('deleted_at', null)
      .order('work_date')

    const lista = partes ?? []
    for (const [i, parte] of lista.entries()) {
      const { data: registros } = await sb
        .from('v_work_entries')
        .select('*')
        .eq('work_order_id', (parte as any).id)

      const filas = (registros ?? []).map((r: any) => ({
        actividad: r.activity_name ?? '—',
        tramo: r.section_name ?? '—',
        progresiva: [r.prog_start_txt, r.prog_end_txt].filter(Boolean).join(' → ') || '—',
        lado: r.side ?? '—',
        cantidad: r.quantity ?? 0,
        unidad: r.unit_symbol ?? '',
      }))

      const doc = await reportePdf(
        { ...meta, titulo: `Parte diario · ${fmtDate((parte as any).work_date)}` },
        [
          { header: 'Actividad', key: 'actividad', width: 52 },
          { header: 'Tramo', key: 'tramo', width: 40 },
          { header: 'Progresiva', key: 'progresiva', width: 32 },
          { header: 'Lado', key: 'lado', width: 18 },
          { header: 'Cantidad', key: 'cantidad', align: 'right', width: 22 },
          { header: 'Und.', key: 'unidad', width: 16 },
        ],
        filas,
        { cover: false }
      )

      const nombre = `PARTE_${(parte as any).work_date}_${nombreSeguro(
        (parte as any).crews?.name ?? 'cuadrilla', 30
      )}.pdf`
      const bytes = doc.output('arraybuffer')
      zip.folder(CARPETAS.partes)!.file(nombre, bytes)

      indice.push({
        carpeta: CARPETAS.partes,
        archivo: nombre,
        tipo: 'Parte diario',
        fecha: (parte as any).work_date,
        detalle: `${(parte as any).crews?.name ?? 'Sin cuadrilla'} · ${plural(filas.length, 'actividad', 'actividades')}`,
        bytes: bytes.byteLength,
      })
      avisar('Partes diarios', i + 1, lista.length)
    }
  }

  // ─── 02 · Panel fotográfico ─────────────────────────────────────────
  if (contenido.fotos) {
    avisar('Panel fotográfico', 0, 1)
    const { data: fotos } = await sb
      .from('v_evidences')
      .select('*')
      .eq('service_id', servicioId)
      .gte('work_date', desde)
      .lte('work_date', hasta)
      .order('taken_at')
      .limit(400)

    const lista = fotos ?? []
    // Las urls se firman en tandas: una por una tarda una eternidad
    const rutas = lista.map((f: any) => f.storage_path)
    const firmadas = new Map<string, string>()
    for (let i = 0; i < rutas.length; i += 100) {
      const { data } = await sb.storage
        .from('evidencias')
        .createSignedUrls(rutas.slice(i, i + 100), 3600)
      for (const f of data ?? []) if (f.signedUrl) firmadas.set(f.path!, f.signedUrl)
    }

    for (const [i, foto] of lista.entries()) {
      const url = firmadas.get((foto as any).storage_path)
      if (!url) continue
      try {
        const blob = await (await fetch(url)).blob()
        // Por día y por actividad: es como se revisa el panel
        const carpetaDia = `${CARPETAS.fotos}/${(foto as any).work_date ?? 'sin_fecha'}`
        const nombre = `${nombreSeguro((foto as any).activity_name ?? 'evidencia', 40)}_${
          (foto as any).phase
        }_${String(i + 1).padStart(3, '0')}.webp`

        zip.folder(carpetaDia)!.file(nombre, blob)
        indice.push({
          carpeta: carpetaDia,
          archivo: nombre,
          tipo: 'Evidencia fotográfica',
          fecha: (foto as any).work_date ?? '',
          detalle: [
            (foto as any).activity_name,
            (foto as any).section_name,
            (foto as any).phase,
          ].filter(Boolean).join(' · '),
          bytes: blob.size,
        })
      } catch {
        // Una foto que no se pudo bajar no detiene el paquete; queda dicho
        // en el índice para que quien revisa sepa que falta.
        indice.push({
          carpeta: CARPETAS.fotos,
          archivo: '(no se pudo descargar)',
          tipo: 'Evidencia fotográfica',
          fecha: (foto as any).work_date ?? '',
          detalle: (foto as any).storage_path,
          bytes: 0,
        })
      }
      avisar('Panel fotográfico', i + 1, lista.length)
    }
  }

  // ─── 03 · PCI ───────────────────────────────────────────────────────
  if (contenido.pci) {
    avisar('PCI', 0, 1)
    const { data: items } = await sb
      .from('v_pci_items')
      .select('*')
      .eq('service_id', servicioId)
      .order('due_date')
      .limit(2000)

    const filas = (items ?? []).map((i: any) => ({
      pci: i.pci_code ?? '',
      item: i.item_number ?? '',
      descripcion: i.description ?? '',
      tramo: i.section_name ?? '',
      progresiva: i.prog_start_txt ?? '',
      vence: i.due_date ?? '',
      estado: i.status ?? '',
      evidencias: i.evidence_count ?? 0,
    }))

    const doc = await reportePdf(
      { ...meta, titulo: 'Pedidos de corrección de incumplimiento' },
      [
        { header: 'PCI', key: 'pci', width: 26 },
        { header: 'Ítem', key: 'item', align: 'right', width: 14 },
        { header: 'Descripción', key: 'descripcion', width: 70 },
        { header: 'Tramo', key: 'tramo', width: 34 },
        { header: 'Progresiva', key: 'progresiva', width: 22 },
        { header: 'Vence', key: 'vence', width: 22 },
        { header: 'Estado', key: 'estado', width: 22 },
        { header: 'Fotos', key: 'evidencias', align: 'right', width: 14 },
      ],
      filas,
      { landscape: true }
    )
    const bytes = doc.output('arraybuffer')
    zip.folder(CARPETAS.pci)!.file('PCI_CONSOLIDADO.pdf', bytes)
    indice.push({
      carpeta: CARPETAS.pci,
      archivo: 'PCI_CONSOLIDADO.pdf',
      tipo: 'Consolidado de PCI',
      fecha: hasta,
      detalle: plural(filas.length, 'ítem'),
      bytes: bytes.byteLength,
    })
    avisar('PCI', 1, 1)
  }

  // ─── 04 · SSOMA ─────────────────────────────────────────────────────
  if (contenido.ssoma) {
    avisar('SSOMA', 0, 3)

    // Charlas con su asistencia
    const { data: charlas } = await sb
      .from('v_safety_talks')
      .select('*')
      .eq('service_id', servicioId)
      .gte('talk_date', desde)
      .lte('talk_date', hasta)
      .order('talk_date')

    const filasCharlas = (charlas ?? []).map((c: any) => ({
      fecha: c.talk_date,
      tipo: c.kind,
      tema: c.topic,
      cuadrilla: c.crew_name ?? '',
      expositor: c.speaker_name ?? '',
      minutos: c.duration_min ?? '',
      asistentes: c.attendee_count ?? 0,
      firmaron: c.signed_count ?? 0,
    }))

    const docCharlas = await reportePdf(
      { ...meta, titulo: 'Charlas de seguridad' },
      [
        { header: 'Fecha', key: 'fecha', width: 24 },
        { header: 'Tipo', key: 'tipo', width: 26 },
        { header: 'Tema', key: 'tema', width: 70 },
        { header: 'Cuadrilla', key: 'cuadrilla', width: 40 },
        { header: 'Expositor', key: 'expositor', width: 36 },
        { header: 'Min.', key: 'minutos', align: 'right', width: 14 },
        { header: 'Asist.', key: 'asistentes', align: 'right', width: 16 },
        { header: 'Firmas', key: 'firmaron', align: 'right', width: 16 },
      ],
      filasCharlas,
      { landscape: true }
    )
    const bytesCharlas = docCharlas.output('arraybuffer')
    zip.folder(CARPETAS.ssoma)!.file('CHARLAS.pdf', bytesCharlas)
    indice.push({
      carpeta: CARPETAS.ssoma,
      archivo: 'CHARLAS.pdf',
      tipo: 'Charlas de seguridad',
      fecha: hasta,
      detalle: plural(filasCharlas.length, 'charla'),
      bytes: bytesCharlas.byteLength,
    })
    avisar('SSOMA', 1, 3)

    // Equipos de seguridad y sus vencimientos
    const { data: equipos } = await sb
      .from('v_safety_equipment')
      .select('*')
      .eq('service_id', servicioId)
      .order('expires_on')

    const docEquipos = await reportePdf(
      { ...meta, titulo: 'Equipos de seguridad' },
      [
        { header: 'Código', key: 'code', width: 22 },
        { header: 'Tipo', key: 'kind', width: 28 },
        { header: 'Descripción', key: 'description', width: 66 },
        { header: 'Ubicación', key: 'location', width: 38 },
        { header: 'Cuadrilla', key: 'crew_name', width: 38 },
        { header: 'Vence', key: 'expires_on', width: 22 },
        { header: 'Inspección', key: 'next_check_on', width: 24 },
      ],
      equipos ?? [],
      { landscape: true }
    )
    const bytesEquipos = docEquipos.output('arraybuffer')
    zip.folder(CARPETAS.ssoma)!.file('EQUIPOS_DE_SEGURIDAD.pdf', bytesEquipos)
    indice.push({
      carpeta: CARPETAS.ssoma,
      archivo: 'EQUIPOS_DE_SEGURIDAD.pdf',
      tipo: 'Equipos de seguridad',
      fecha: hasta,
      detalle: plural((equipos ?? []).length, 'equipo'),
      bytes: bytesEquipos.byteLength,
    })
    avisar('SSOMA', 2, 3)

    // Vehículos con sus papeles
    const { data: flota } = await sb
      .from('v_vehicles')
      .select('*')
      .eq('service_id', servicioId)
      .order('plate')

    const docFlota = await reportePdf(
      { ...meta, titulo: 'Flota y vigencia de documentos' },
      [
        { header: 'Placa', key: 'plate', width: 24 },
        { header: 'Tipo', key: 'kind', width: 28 },
        { header: 'Marca', key: 'brand', width: 28 },
        { header: 'Modelo', key: 'model', width: 34 },
        { header: 'Cuadrilla', key: 'crew_name', width: 38 },
        { header: 'SOAT', key: 'soat_expires_on', width: 24 },
        { header: 'Rev. técnica', key: 'inspection_expires_on', width: 26 },
        { header: 'Póliza', key: 'policy_expires_on', width: 24 },
      ],
      flota ?? [],
      { landscape: true }
    )
    const bytesFlota = docFlota.output('arraybuffer')
    zip.folder(CARPETAS.ssoma)!.file('FLOTA.pdf', bytesFlota)
    indice.push({
      carpeta: CARPETAS.ssoma,
      archivo: 'FLOTA.pdf',
      tipo: 'Flota',
      fecha: hasta,
      detalle: plural((flota ?? []).length, 'vehículo'),
      bytes: bytesFlota.byteLength,
    })
    avisar('SSOMA', 3, 3)
  }

  // ─── 05 · Valorización ──────────────────────────────────────────────
  if (contenido.valorizacion) {
    avisar('Valorización', 0, 1)
    const { data: entradas } = await sb
      .from('v_work_entries')
      .select('activity_name, unit_symbol, quantity, work_date')
      .eq('service_id', servicioId)
      .gte('work_date', desde)
      .lte('work_date', hasta)
      .limit(20000)

    // Se acumula por partida: es como se presenta la valorización
    const porPartida = new Map<string, { actividad: string; unidad: string; total: number }>()
    for (const e of entradas ?? []) {
      const clave = `${(e as any).activity_name}|${(e as any).unit_symbol ?? ''}`
      const actual = porPartida.get(clave) ?? {
        actividad: (e as any).activity_name ?? '—',
        unidad: (e as any).unit_symbol ?? '',
        total: 0,
      }
      actual.total += Number((e as any).quantity ?? 0)
      porPartida.set(clave, actual)
    }

    const filas = [...porPartida.values()]
      .sort((a, b) => a.actividad.localeCompare(b.actividad, 'es'))
      .map((p) => ({ ...p, total: Number(p.total.toFixed(2)) }))

    const doc = await reportePdf(
      { ...meta, titulo: 'Resumen de metrados ejecutados' },
      [
        { header: 'Partida', key: 'actividad', width: 100 },
        { header: 'Unidad', key: 'unidad', width: 24 },
        { header: 'Metrado', key: 'total', align: 'right', width: 30 },
      ],
      filas
    )
    const bytes = doc.output('arraybuffer')
    zip.folder(CARPETAS.valorizacion)!.file('RESUMEN_DE_METRADOS.pdf', bytes)
    indice.push({
      carpeta: CARPETAS.valorizacion,
      archivo: 'RESUMEN_DE_METRADOS.pdf',
      tipo: 'Resumen de metrados',
      fecha: hasta,
      detalle: plural(filas.length, 'partida'),
      bytes: bytes.byteLength,
    })
    avisar('Valorización', 1, 1)
  }

  // ─── El índice ──────────────────────────────────────────────────────
  avisar('Índice', 0, 1)
  zip.file('INDICE.xlsx', await construirIndice(indice, meta, { desde, hasta }))
  avisar('Índice', 1, 1)

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/**
 * El índice en Excel.
 *
 * Dos hojas: una de portada con de qué periodo es el paquete y quién lo
 * generó, y el detalle archivo por archivo. Es lo que el cliente firma como
 * cargo de recepción.
 */
async function construirIndice(
  filas: FilaIndice[],
  meta: ReportMeta,
  rango: { desde: string; hasta: string }
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new (ExcelJS as any).Workbook()
  wb.creator = 'SIGOV'
  wb.created = new Date()

  const portada = wb.addWorksheet('Portada', { views: [{ showGridLines: false }] })
  portada.columns = [{ width: 28 }, { width: 62 }]

  portada.mergeCells('A1:B2')
  const titulo = portada.getCell('A1')
  titulo.value = 'PAQUETE DE ENTREGA'
  titulo.font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } }
  titulo.alignment = { vertical: 'middle', horizontal: 'center' }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF072D70' } }

  const datos: [string, string][] = [
    ['Servicio', meta.servicio],
    ['Cliente', meta.cliente ?? '—'],
    ['Contrato', meta.contrato ?? '—'],
    ['Periodo', `${fmtDate(rango.desde)} al ${fmtDate(rango.hasta)}`],
    ['Emitido por', meta.organizacion ?? 'Grupo Servicon V&D EIRL'],
    ['Generado por', meta.generadoPor],
    ['Fecha de generación', new Date().toLocaleString('es-PE')],
    ['Archivos', String(filas.length)],
    ['Peso total', `${(filas.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(2)} MB`],
  ]
  datos.forEach(([etiqueta, valor], i) => {
    const fila = portada.getRow(4 + i)
    fila.getCell(1).value = etiqueta
    fila.getCell(1).font = { bold: true, color: { argb: 'FF475569' } }
    fila.getCell(2).value = valor
  })

  const detalle = wb.addWorksheet('Contenido')
  detalle.columns = [
    { header: 'Carpeta', key: 'carpeta', width: 30 },
    { header: 'Archivo', key: 'archivo', width: 52 },
    { header: 'Tipo', key: 'tipo', width: 26 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Detalle', key: 'detalle', width: 62 },
    { header: 'Tamaño (KB)', key: 'kb', width: 14 },
  ]
  detalle.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  detalle.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF072D70' },
  }
  filas.forEach((f) =>
    detalle.addRow({ ...f, kb: Number((f.bytes / 1024).toFixed(1)) })
  )
  detalle.autoFilter = { from: 'A1', to: 'F1' }
  detalle.views = [{ state: 'frozen', ySplit: 1 }]

  return wb.xlsx.writeBuffer()
}
