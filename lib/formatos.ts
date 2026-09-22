'use client'

import { fmtDate, fmtNumber, fmtProgresiva } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════════════
// SIGOV · Los formatos oficiales de SERVICON
//
// El apartado 14 de la especificación pide ocho documentos en PDF «con
// diseño similar a los formatos oficiales proporcionados». No son informes
// de gestión —eso ya vive en lib/reports.ts, con su portada y sus KPIs—
// sino el papel que la cuadrilla llenaba a mano y que ahora se genera de lo
// que ya está registrado.
//
// La diferencia manda en el diseño: un formato oficial se imprime, se firma
// y se archiva. Va en una hoja, con su cabecera de código y versión, sus
// casillas y su bloque de firmas al pie. Sin portada, sin gráficos y sin
// nada que no quepa en una A4.
// ═══════════════════════════════════════════════════════════════════════════

/** Los ocho documentos, con el código con que se archivan. */
export const FORMATOS = {
  parte:      { codigo: 'SIG-OP-F01', titulo: 'Reporte diario de actividades' },
  ast:        { codigo: 'SIG-SST-F02', titulo: 'Análisis de Trabajo Seguro' },
  charla:     { codigo: 'SIG-SST-F03', titulo: 'Registro de inducción, capacitación y charla' },
  vehiculo:   { codigo: 'SIG-SST-F04', titulo: 'Check list de vehículo' },
  antiderrame:{ codigo: 'SIG-SST-F05', titulo: 'Check list de kit antiderrame' },
  extintor:   { codigo: 'SIG-SST-F06', titulo: 'Inspección de extintores' },
  botiquin:   { codigo: 'SIG-SST-F07', titulo: 'Inspección de botiquín' },
  higiene:    { codigo: 'SIG-SST-F08', titulo: 'Registro de elementos de higiene' },
} as const

export type ClaveDeFormato = keyof typeof FORMATOS

export interface Cabecera {
  servicio: string
  cliente?: string | null
  contrato?: string | null
  cuadrilla?: string | null
  fecha: string
  lugar?: string | null
  /** Quién lo emite; va al pie, junto a la fecha de emisión */
  emitidoPor: string
}

/** Una firma al pie: nombre, cargo y el trazo si se recogió en el celular. */
export interface FirmaDelFormato {
  nombre: string
  cargo?: string | null
  dni?: string | null
  /** PNG en data: o URL firmada */
  trazo?: string | null
}

const AZUL = { r: 7, g: 45, b: 112 }
const NARANJA = { r: 249, g: 100, b: 20 }
const GRIS = { r: 244, g: 245, b: 248 }

async function jspdf() {
  const [{ jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then((m) => m.default),
  ])
  return { jsPDF, autoTable }
}

/**
 * La cabecera del formato: el bloque que identifica el papel.
 *
 * Tres celdas, como en el formato en papel: la marca a la izquierda, el
 * título al centro y el código con su versión a la derecha. Es lo que el
 * auditor mira primero para saber qué documento tiene en la mano.
 */
function cabecera(doc: any, clave: ClaveDeFormato, cab: Cabecera): number {
  const W = doc.internal.pageSize.getWidth()
  const M = 12
  const alto = 22
  const anchoMarca = 46
  const anchoCodigo = 40

  doc.setDrawColor(AZUL.r, AZUL.g, AZUL.b)
  doc.setLineWidth(0.4)
  doc.rect(M, M, W - M * 2, alto)
  doc.line(M + anchoMarca, M, M + anchoMarca, M + alto)
  doc.line(W - M - anchoCodigo, M, W - M - anchoCodigo, M + alto)

  // Marca
  doc.setFillColor(AZUL.r, AZUL.g, AZUL.b)
  doc.rect(M, M, anchoMarca, alto, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('SERVICON', M + anchoMarca / 2, M + 9, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('GRUPO SERVICON V&D EIRL', M + anchoMarca / 2, M + 14, { align: 'center' })
  doc.setFillColor(NARANJA.r, NARANJA.g, NARANJA.b)
  doc.rect(M + 8, M + 16, anchoMarca - 16, 1, 'F')

  // Título
  const f = FORMATOS[clave]
  doc.setTextColor(AZUL.r, AZUL.g, AZUL.b)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(
    f.titulo.toUpperCase(),
    M + anchoMarca + (W - M * 2 - anchoMarca - anchoCodigo) / 2,
    M + 13,
    { align: 'center', maxWidth: W - M * 2 - anchoMarca - anchoCodigo - 6 },
  )

  // Código y versión
  doc.setTextColor(60, 60, 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const xc = W - M - anchoCodigo + 3
  doc.text(`Código: ${f.codigo}`, xc, M + 6)
  doc.text('Versión: 01', xc, M + 11)
  doc.text(`Fecha: ${fmtDate(cab.fecha)}`, xc, M + 16)
  doc.text('Página 1 de 1', xc, M + 20)

  return M + alto
}

/** El bloque de contexto: contrato, cuadrilla y lugar. */
function contexto(doc: any, y: number, cab: Cabecera, extra: [string, string][] = []): number {
  const W = doc.internal.pageSize.getWidth()
  const M = 12
  const filas: [string, string][] = [
    ['Contrato', [cab.contrato, cab.servicio].filter(Boolean).join(' · ') || '—'],
    ['Cliente', cab.cliente || '—'],
    ['Cuadrilla', cab.cuadrilla || '—'],
    ['Fecha', fmtDate(cab.fecha, 'long')],
    ...(cab.lugar ? ([['Lugar', cab.lugar]] as [string, string][]) : []),
    ...extra,
  ]

  const altoFila = 6
  const porFila = 2
  const anchoCelda = (W - M * 2) / porFila
  let fila = 0

  filas.forEach((par, i) => {
    fila = Math.floor(i / porFila)
    const col = i % porFila
    const x = M + col * anchoCelda
    const yy = y + fila * altoFila

    doc.setDrawColor(200, 204, 212)
    doc.setLineWidth(0.2)
    doc.rect(x, yy, anchoCelda, altoFila)
    doc.setFillColor(GRIS.r, GRIS.g, GRIS.b)
    doc.rect(x, yy, 26, altoFila, 'F')

    doc.setTextColor(70, 70, 70)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text(par[0].toUpperCase(), x + 2, yy + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(20, 20, 20)
    doc.text(String(par[1]), x + 28, yy + 4, { maxWidth: anchoCelda - 30 })
  })

  return y + (fila + 1) * altoFila
}

/**
 * El bloque de firmas al pie.
 *
 * Un formato sin firmas no vale ante una fiscalización, así que el bloque
 * se dibuja siempre: con los trazos que se recogieron en el celular, o con
 * las casillas vacías para firmar a mano si el documento se imprime antes.
 */
async function firmas(doc: any, y: number, gente: FirmaDelFormato[]): Promise<number> {
  const W = doc.internal.pageSize.getWidth()
  const M = 12
  const H = doc.internal.pageSize.getHeight()
  const lista = gente.length ? gente : [{ nombre: '', cargo: 'Responsable' }]
  const porFila = Math.min(3, Math.max(1, lista.length))
  const ancho = (W - M * 2) / porFila
  const alto = 24

  // Si no cabe, el bloque de firmas abre página: partirlo sería peor
  let yy = y + 6
  if (yy + alto > H - 14) { doc.addPage(); yy = M + 6 }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(AZUL.r, AZUL.g, AZUL.b)
  doc.text('FIRMAS', M, yy)
  yy += 3

  for (let i = 0; i < lista.length; i++) {
    const p = lista[i]
    const col = i % porFila
    const fila = Math.floor(i / porFila)
    const x = M + col * ancho
    const top = yy + fila * alto

    doc.setDrawColor(200, 204, 212)
    doc.setLineWidth(0.2)
    doc.rect(x, top, ancho, alto)

    if (p.trazo) {
      try {
        doc.addImage(p.trazo, 'PNG', x + 4, top + 2, ancho - 8, alto - 12, undefined, 'FAST')
      } catch {
        // Una firma que no se puede pintar no invalida el formato: se deja
        // la casilla, que es lo que había antes de digitalizarlo
      }
    }

    doc.setDrawColor(120, 120, 120)
    doc.line(x + 4, top + alto - 9, x + ancho - 4, top + alto - 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(20, 20, 20)
    doc.text(p.nombre || ' ', x + ancho / 2, top + alto - 5.5, { align: 'center', maxWidth: ancho - 8 })
    doc.setFontSize(6)
    doc.setTextColor(110, 110, 110)
    doc.text(
      [p.cargo, p.dni && `DNI ${p.dni}`].filter(Boolean).join(' · ') || ' ',
      x + ancho / 2,
      top + alto - 2,
      { align: 'center', maxWidth: ancho - 8 },
    )
  }

  return yy + Math.ceil(lista.length / porFila) * alto
}

/** El pie: quién lo emitió y cuándo. Cierra el documento. */
function pie(doc: any, cab: Cabecera) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(130, 130, 130)
  doc.text(
    `Generado por SIGOV · ${cab.emitidoPor} · ${new Date().toLocaleString('es-PE')}`,
    12, H - 8,
  )
  doc.text('Documento generado automáticamente desde los registros de campo.', W - 12, H - 8, { align: 'right' })
}

/** Una tabla del formato, con el estilo del papel: fina, gris y sin adornos. */
function tabla(doc: any, autoTable: any, y: number, cols: string[], filas: any[][]): number {
  autoTable(doc, {
    startY: y + 4,
    head: [cols],
    body: filas.length ? filas : [cols.map(() => '—')],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [200, 204, 212], lineWidth: 0.2 },
    headStyles: {
      fillColor: [GRIS.r, GRIS.g, GRIS.b],
      textColor: [40, 40, 40],
      fontStyle: 'bold',
      fontSize: 7,
    },
    margin: { left: 12, right: 12 },
  })
  return (doc as any).lastAutoTable.finalY
}

/** Un título de sección dentro del formato. */
function seccion(doc: any, y: number, texto: string): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(AZUL.r, AZUL.g, AZUL.b)
  doc.rect(12, y + 4, W - 24, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text(texto.toUpperCase(), 14, y + 7.6)
  return y + 9
}

// ═══════════════════════════════════════════════════════════════════════════
// Los ocho formatos
// ═══════════════════════════════════════════════════════════════════════════

export interface DatosDelFormato {
  cabecera: Cabecera
  /** Filas de la tabla principal */
  filas: any[][]
  columnas: string[]
  /** Bloques adicionales, cada uno con su título y su tabla */
  bloques?: { titulo: string; columnas: string[]; filas: any[][] }[]
  /** Pares clave-valor que van en el contexto de cabecera */
  contexto?: [string, string][]
  /** Una nota al pie del cuerpo, antes de las firmas */
  nota?: string | null
  firmas?: FirmaDelFormato[]
}

/**
 * Arma el PDF de un formato oficial.
 *
 * Devuelve el documento de jsPDF sin guardarlo: quien llama decide si lo
 * descarga, lo abre en el visor o lo manda a la impresora, que son las tres
 * acciones que pide el apartado 14.
 */
export async function armarFormato(clave: ClaveDeFormato, datos: DatosDelFormato) {
  const { jsPDF, autoTable } = await jspdf()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  let y = cabecera(doc, clave, datos.cabecera)
  y = contexto(doc, y, datos.cabecera, datos.contexto ?? [])
  y = tabla(doc, autoTable, y, datos.columnas, datos.filas)

  for (const b of datos.bloques ?? []) {
    y = seccion(doc, y, b.titulo)
    y = tabla(doc, autoTable, y, b.columnas, b.filas)
  }

  if (datos.nota) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    doc.text(datos.nota, 12, y + 7, { maxWidth: doc.internal.pageSize.getWidth() - 24 })
    y += 10
  }

  y = await firmas(doc, y, datos.firmas ?? [])
  pie(doc, datos.cabecera)
  return doc
}

/** Lo descarga con el nombre con que se archiva. */
export async function descargarFormato(clave: ClaveDeFormato, datos: DatosDelFormato) {
  const doc = await armarFormato(clave, datos)
  const f = FORMATOS[clave]
  doc.save(`${f.codigo}_${datos.cabecera.fecha}.pdf`)
}

/** Lo devuelve como URL de objeto, para el visor de vista previa. */
export async function vistaPreviaFormato(clave: ClaveDeFormato, datos: DatosDelFormato): Promise<string> {
  const doc = await armarFormato(clave, datos)
  return URL.createObjectURL(doc.output('blob'))
}

/**
 * Lo manda a la impresora.
 *
 * Se abre en una ventana propia y se imprime desde ahí: jsPDF no tiene
 * acceso a la impresora, y el visor del navegador ya sabe hacerlo.
 */
export async function imprimirFormato(clave: ClaveDeFormato, datos: DatosDelFormato) {
  const doc = await armarFormato(clave, datos)
  doc.autoPrint()
  const url = doc.output('bloburl')
  const v = window.open(url, '_blank')
  if (!v) {
    // Con el bloqueador de ventanas activo, al menos que se lo lleve
    doc.save(`${FORMATOS[clave].codigo}.pdf`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Constructores: de la fila de la base de datos al formato
// ═══════════════════════════════════════════════════════════════════════════

/** 1 · Reporte diario de actividades. */
export function datosDeParte(parte: any, registros: any[], cab: Omit<Cabecera, 'fecha'>): DatosDelFormato {
  return {
    cabecera: { ...cab, fecha: parte.work_date, cuadrilla: parte.crew_name ?? cab.cuadrilla },
    contexto: [
      ['Clima', parte.weather ?? '—'],
      ['Personal', parte.headcount ? String(parte.headcount) : '—'],
      ['Horario', [parte.start_time, parte.end_time].filter(Boolean).join(' a ') || '—'],
      ['Estado', parte.status ?? 'borrador'],
    ],
    columnas: ['N°', 'Actividad', 'Tramo', 'Progresiva', 'Lado', 'Metrado', 'Und', 'Origen', 'Fotos'],
    filas: registros.map((r, i) => [
      i + 1,
      r.activity_name ?? '—',
      r.section_name ?? '—',
      [fmtProgresiva(r.prog_start_m), r.prog_end_m ? fmtProgresiva(r.prog_end_m) : null]
        .filter(Boolean).join(' – '),
      r.side ?? '—',
      fmtNumber(r.quantity, 1),
      r.unit_symbol ?? '—',
      r.plan_item_id ? 'Programación' : r.pci_item_id ? 'PCI' : 'No programado',
      String(r.evidence_count ?? 0),
    ]),
    nota: parte.notes || null,
  }
}

/** 2 · Análisis de Trabajo Seguro. */
export function datosDeAst(a: any, cab: Omit<Cabecera, 'fecha'>, gente: FirmaDelFormato[]): DatosDelFormato {
  const esConductor = a.kind === 'conductor'
  const apto = a.fit_to_drive

  if (esConductor) {
    const pregunta = (k: string, texto: string, malSiSi = false) => {
      const v = apto?.[k] === true
      return [texto, v ? 'SÍ' : 'NO', (malSiSi ? v : !v) ? 'Observado' : 'Conforme']
    }
    return {
      cabecera: { ...cab, fecha: a.doc_date, cuadrilla: a.crew_name ?? cab.cuadrilla, lugar: a.location },
      contexto: [
        ['Vehículo', a.vehicle_plate ?? '—'],
        ['Conductor', a.driver_name ?? '—'],
        ['Horas de sueño', apto?.horas_de_sueno != null ? `${apto.horas_de_sueno} h` : '—'],
        ['Veredicto', apto && esApto(apto) ? 'APTO PARA CONDUCIR' : 'NO APTO'],
      ],
      columnas: ['Verificación', 'Respuesta', 'Resultado'],
      filas: [
        pregunta('descanso_suficiente', '¿Descansó lo suficiente?'),
        pregunta('consumio_alcohol', '¿Consumió alcohol en las últimas 24 horas?', true),
        pregunta('medicacion_que_afecta', '¿Toma medicación que afecte al manejo?', true),
        pregunta('licencia_vigente', '¿Porta licencia de conducir vigente?'),
        pregunta('vehiculo_operativo', '¿El vehículo se encuentra operativo?'),
      ],
      nota: apto?.observacion || null,
      firmas: gente,
    }
  }

  return {
    cabecera: { ...cab, fecha: a.doc_date, cuadrilla: a.crew_name ?? cab.cuadrilla, lugar: a.location },
    contexto: [
      ['Tarea', a.task ?? '—'],
      ['Riesgo máximo', a.max_risk ?? '—'],
    ],
    columnas: ['N°', 'Peligro identificado', 'Riesgo asociado', 'Medida de control'],
    filas: (a.hazards ?? []).map((h: any, i: number) => [
      i + 1, h.peligro ?? '—', h.riesgo ?? '—', h.control ?? '—',
    ]),
    bloques: [{
      titulo: 'Equipo de protección personal exigido',
      columnas: ['EPP'],
      filas: (a.ppe ?? []).map((e: string) => [e]),
    }],
    firmas: gente,
  }
}

/** 3 · Registro de inducción, capacitación y charla. */
export function datosDeCharla(t: any, asistentes: any[], cab: Omit<Cabecera, 'fecha'>): DatosDelFormato {
  return {
    cabecera: { ...cab, fecha: t.talk_date, cuadrilla: t.crew_name ?? cab.cuadrilla, lugar: t.location },
    contexto: [
      ['Tipo', t.kind ?? 'charla'],
      ['Tema', t.topic ?? '—'],
      ['Expositor', t.speaker_name ?? '—'],
      ['Duración', t.duration_min ? `${t.duration_min} min` : '—'],
    ],
    columnas: ['N°', 'Nombre y apellidos', 'DNI', 'Puesto', 'Firma'],
    filas: asistentes.map((a, i) => [i + 1, a.full_name ?? '—', a.dni ?? '—', a.position ?? '—', '']),
    nota: t.content || null,
    firmas: [{ nombre: t.speaker_name ?? '', cargo: 'Expositor' }],
  }
}

/** 4 · Check list de vehículo. */
export function datosDeVehiculo(c: any, cab: Omit<Cabecera, 'fecha'>): DatosDelFormato {
  const items = c.items ?? {}
  return {
    cabecera: { ...cab, fecha: c.checked_on, cuadrilla: c.crew_name ?? cab.cuadrilla },
    contexto: [
      ['Placa', c.plate ?? '—'],
      ['Tipo', c.kind ?? '—'],
      ['Kilometraje', c.odometer_km != null ? `${fmtNumber(c.odometer_km)} km` : '—'],
      ['Conductor', c.driver_name ?? '—'],
    ],
    columnas: ['Punto de revisión', 'Conforme', 'Observación'],
    filas: Object.entries(items).map(([k, v]: [string, any]) => [
      enCastellano(k),
      v === true || v === 'ok' ? 'SÍ' : 'NO',
      typeof v === 'string' && v !== 'ok' ? v : '',
    ]),
    nota: c.findings || null,
    firmas: [{ nombre: c.driver_name ?? '', cargo: 'Conductor', trazo: c.signature_url ?? null }],
  }
}

/** 5, 6, 7 · Kit antiderrame, extintores y botiquín. */
export function datosDeEquipo(
  clave: 'antiderrame' | 'extintor' | 'botiquin',
  e: any,
  revisiones: any[],
  cab: Omit<Cabecera, 'fecha'>,
): DatosDelFormato {
  const ultima = revisiones[0]
  return {
    cabecera: {
      ...cab,
      fecha: ultima?.checked_on ?? new Date().toISOString().slice(0, 10),
      cuadrilla: e.crew_name ?? cab.cuadrilla,
      lugar: e.location,
    },
    contexto: [
      ['Código', e.code ?? '—'],
      ['Ubicación', e.location ?? '—'],
      ['Vence', e.expires_on ? fmtDate(e.expires_on) : '—'],
      ['Estado', e.status ?? '—'],
      ...(clave === 'extintor'
        ? ([['Capacidad', e.capacity ?? '—'],
            ['Serie', e.serial_number ?? '—']] as [string, string][])
        : []),
    ],
    columnas: ['Fecha', 'Resultado', 'Hallazgo', 'Revisó'],
    filas: revisiones.map((r) => [
      fmtDate(r.checked_on),
      r.conforme === true ? 'Conforme' : r.conforme === false ? 'Observado' : '—',
      r.findings ?? '—',
      r.checked_by_name ?? '—',
    ]),
    bloques: (e.components?.length
      ? [{
          titulo: 'Componentes y cantidades',
          columnas: ['Componente', 'Cantidad exigida', 'Cantidad encontrada'],
          filas: e.components.map((c: any) => [c.nombre ?? '—', String(c.exigida ?? '—'), String(c.encontrada ?? '—')]),
        }]
      : undefined),
    nota: e.notes || null,
    firmas: [{ nombre: ultima?.checked_by_name ?? '', cargo: 'Responsable de la inspección' }],
  }
}

/** 8 · Registro de elementos de higiene. */
export function datosDeHigiene(filas: any[], cab: Cabecera): DatosDelFormato {
  return {
    cabecera: cab,
    columnas: ['Elemento', 'Conforme', 'Personas atendidas', 'Observación'],
    filas: filas.map((h) => [
      enCastellano(h.item ?? ''),
      h.done === true ? 'SÍ' : 'NO',
      h.people_count != null ? String(h.people_count) : '—',
      h.notes ?? '—',
    ]),
  }
}

/** Si el conductor está en condiciones. Repite el criterio de la base. */
function esApto(r: any): boolean {
  return r?.descanso_suficiente === true
    && r?.consumio_alcohol !== true
    && r?.medicacion_que_afecta !== true
    && r?.licencia_vigente === true
    && r?.vehiculo_operativo === true
}

/** Las claves técnicas se imprimen como se dicen en obra. */
function enCastellano(clave: string): string {
  const dicho: Record<string, string> = {
    llantas: 'Llantas y presión',
    frenos: 'Sistema de frenos',
    luces: 'Luces y direccionales',
    espejos: 'Espejos',
    cinturones: 'Cinturones de seguridad',
    bocina: 'Bocina',
    limpiaparabrisas: 'Limpiaparabrisas',
    extintor: 'Extintor',
    botiquin: 'Botiquín',
    conos: 'Conos de seguridad',
    triangulos: 'Triángulos de seguridad',
    gata: 'Gata y llave de ruedas',
    llanta_repuesto: 'Llanta de repuesto',
    documentos: 'Documentos del vehículo',
    nivel_aceite: 'Nivel de aceite',
    nivel_refrigerante: 'Nivel de refrigerante',
    jabon: 'Jabón',
    papel: 'Papel higiénico',
    agua: 'Agua para consumo',
    alcohol: 'Alcohol en gel',
    basurero: 'Recipiente de residuos',
    bano: 'Baño portátil',
  }
  return dicho[clave] ?? clave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
