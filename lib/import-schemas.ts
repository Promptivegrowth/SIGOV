import { parseProgresiva, toISODate } from '@/lib/utils'

/**
 * Esquemas de importación.
 * El cliente entrega Excel con encabezados propios: por eso el importador
 * mapea columnas visualmente en lugar de exigir un formato rígido.
 */

export interface ImportField {
  key: string
  label: string
  required: boolean
  hint?: string
  /** alias frecuentes para el auto-mapeo */
  aliases: string[]
  type: 'text' | 'number' | 'date' | 'progresiva' | 'lookup'
  lookup?: 'activity' | 'section' | 'crew' | 'unit' | 'asset_type' | 'condition' | 'side'
}

export interface ImportKind {
  key: 'programacion' | 'pci' | 'inventario' | 'actividades'
  label: string
  description: string
  table: string
  fields: ImportField[]
  sample: Record<string, string | number>[]
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

export const IMPORT_KINDS: Record<ImportKind['key'], ImportKind> = {
  programacion: {
    key: 'programacion',
    label: 'Programación semanal',
    description: 'Actividades programadas por tramo, progresiva, cuadrilla y fecha.',
    table: 'plan_items',
    fields: [
      { key: 'activity_code', label: 'Actividad', required: true, type: 'lookup', lookup: 'activity',
        aliases: ['actividad', 'codigoactividad', 'partida', 'item', 'descripcion'], hint: 'Código o nombre del catálogo' },
      { key: 'section_code', label: 'Tramo', required: true, type: 'lookup', lookup: 'section',
        aliases: ['tramo', 'seccion', 'ruta', 'codigotramo'] },
      { key: 'prog_start_m', label: 'Progresiva inicio', required: true, type: 'progresiva',
        aliases: ['progresivainicio', 'progini', 'kminicio', 'desde', 'progresiva'] },
      { key: 'prog_end_m', label: 'Progresiva fin', required: false, type: 'progresiva',
        aliases: ['progresivafin', 'progfin', 'kmfin', 'hasta'] },
      { key: 'crew_code', label: 'Cuadrilla', required: false, type: 'lookup', lookup: 'crew',
        aliases: ['cuadrilla', 'brigada', 'equipo', 'responsable'] },
      { key: 'scheduled_on', label: 'Fecha', required: true, type: 'date',
        aliases: ['fecha', 'dia', 'fechaprogramada'] },
      { key: 'target_qty', label: 'Meta', required: true, type: 'number',
        aliases: ['meta', 'cantidad', 'metrado', 'metaprogramada'] },
    ],
    sample: [
      { Actividad: 'MR-01', Tramo: 'T-01', 'Progresiva Inicio': '12+450', 'Progresiva Fin': '15+200', Cuadrilla: 'CUA-A', Fecha: '2026-09-01', Meta: 3800 },
      { Actividad: 'MR-05', Tramo: 'T-02', 'Progresiva Inicio': '104+000', 'Progresiva Fin': '108+500', Cuadrilla: 'CUA-A', Fecha: '2026-09-02', Meta: 12 },
    ],
  },

  pci: {
    key: 'pci',
    label: 'PCIs · ítems OSITRAN',
    description: 'Ítems de uno o varios PCI: número de PCI, actividad, progresivas, lado, plazo y cuadrilla.',
    table: 'pci_items',
    // OBS-07: lo que el importador tiene que reconocer del Excel del PCI
    fields: [
      { key: 'pci_code', label: 'N.º de PCI', required: false, type: 'text',
        aliases: ['pci', 'nropci', 'numeropci', 'codigopci', 'npci', 'pcin'],
        hint: 'Si el Excel trae varios PCI o el PCI aún no existe en SIGOV' },
      { key: 'item_number', label: 'N.º de ítem', required: true, type: 'number',
        aliases: ['item', 'nro', 'numero', 'n', 'correlativo'] },
      { key: 'description', label: 'Descripción', required: true, type: 'text',
        aliases: ['descripcion', 'detalle', 'incumplimiento', 'deficiencia'] },
      { key: 'section_code', label: 'Tramo', required: false, type: 'lookup', lookup: 'section',
        aliases: ['tramo', 'seccion', 'ruta', 'sector'] },
      { key: 'prog_start_m', label: 'Progresiva inicio', required: false, type: 'progresiva',
        aliases: ['progresiva', 'progresivainicio', 'progini', 'kminicio', 'km', 'desde', 'ubicacion'] },
      { key: 'prog_end_m', label: 'Progresiva fin', required: false, type: 'progresiva',
        aliases: ['progresivafin', 'progfin', 'kmfin', 'hasta'] },
      { key: 'side', label: 'Lado', required: false, type: 'lookup', lookup: 'side',
        aliases: ['lado'], hint: 'LD, LI, LD-LI (ambos) o EJE' },
      { key: 'term_days', label: 'Plazo (días)', required: false, type: 'number',
        aliases: ['plazo', 'plazodias', 'dias', 'diasplazo'],
        hint: 'Uno de los plazos del contrato; si falta, el plazo base del PCI' },
      { key: 'activity_code', label: 'Actividad', required: false, type: 'lookup', lookup: 'activity',
        aliases: ['actividad', 'partida', 'solucion', 'codigo'] },
      { key: 'quantity', label: 'Cantidad', required: false, type: 'number',
        aliases: ['cantidad', 'metrado'] },
      { key: 'notes', label: 'Observaciones', required: false, type: 'text',
        aliases: ['observaciones', 'observacion', 'notas', 'nota', 'comentario'] },
      { key: 'crew_code', label: 'Cuadrilla', required: false, type: 'lookup', lookup: 'crew',
        aliases: ['cuadrilla', 'crew'], hint: 'Código o nombre de la cuadrilla que lo atiende' },
      { key: 'received_on', label: 'Fecha de recepción', required: false, type: 'date',
        aliases: ['fecharecepcion', 'recepcion', 'recibido'], hint: 'Solo para crear un PCI nuevo' },
    ],
    sample: [
      { PCI: 'PCI-2026-050', Item: 1, Descripcion: 'Alcantarilla obstruida al 60%', Tramo: 'T-01', 'Progresiva inicio': '1318+320', 'Progresiva fin': '1318+340', Lado: 'LD', Plazo: 7, Actividad: 'COV-OD-001', Cantidad: 1, Observaciones: 'Limpiar entrada y salida', Cuadrilla: 'CUA-01' },
      { PCI: 'PCI-2026-050', Item: 2, Descripcion: 'Señal preventiva P-1A ilegible', Tramo: 'T-02', 'Progresiva inicio': '1320+740', 'Progresiva fin': '', Lado: 'LI', Plazo: 3, Actividad: 'COV-SV-004', Cantidad: 1, Observaciones: '', Cuadrilla: 'CUA-01' },
    ],
  },

  inventario: {
    key: 'inventario',
    label: 'Inventario vial',
    description: 'Elementos viales georreferenciados por progresiva.',
    table: 'road_assets',
    fields: [
      { key: 'code', label: 'Código', required: true, type: 'text',
        aliases: ['codigo', 'id', 'clave'] },
      { key: 'type_code', label: 'Tipo de elemento', required: true, type: 'lookup', lookup: 'asset_type',
        aliases: ['tipo', 'elemento', 'clase', 'tipoelemento'] },
      { key: 'section_code', label: 'Tramo', required: true, type: 'lookup', lookup: 'section',
        aliases: ['tramo', 'seccion', 'ruta'] },
      { key: 'progresiva_m', label: 'Progresiva', required: true, type: 'progresiva',
        aliases: ['progresiva', 'km', 'ubicacion'] },
      { key: 'side', label: 'Lado', required: false, type: 'lookup', lookup: 'side',
        aliases: ['lado', 'margen', 'sentido'] },
      { key: 'condition', label: 'Estado', required: false, type: 'lookup', lookup: 'condition',
        aliases: ['estado', 'condicion', 'conservacion'] },
      { key: 'lat', label: 'Latitud', required: false, type: 'number', aliases: ['latitud', 'lat', 'y'] },
      { key: 'lng', label: 'Longitud', required: false, type: 'number', aliases: ['longitud', 'lng', 'lon', 'x'] },
      { key: 'name', label: 'Nombre', required: false, type: 'text', aliases: ['nombre', 'denominacion'] },
    ],
    sample: [
      { Codigo: 'T01-ALC-001', Tipo: 'ALC', Tramo: 'T-01', Progresiva: '3+200', Lado: 'derecho', Estado: 'bueno', Latitud: -10.6712, Longitud: -77.7902 },
      { Codigo: 'T01-SEV-014', Tipo: 'SEV', Tramo: 'T-01', Progresiva: '9+850', Lado: 'izquierdo', Estado: 'regular', Latitud: -10.5321, Longitud: -77.8511 },
    ],
  },

  actividades: {
    key: 'actividades',
    label: 'Catálogo de actividades',
    description: 'Partidas de mantenimiento rutinario con su unidad y rendimiento.',
    table: 'activities_catalog',
    fields: [
      { key: 'code', label: 'Código', required: true, type: 'text', aliases: ['codigo', 'partida'] },
      { key: 'name', label: 'Nombre', required: true, type: 'text', aliases: ['nombre', 'descripcion', 'actividad'] },
      { key: 'category', label: 'Categoría', required: false, type: 'text', aliases: ['categoria', 'grupo', 'familia'] },
      { key: 'unit_code', label: 'Unidad', required: true, type: 'lookup', lookup: 'unit', aliases: ['unidad', 'und', 'um'] },
      { key: 'yield_per_day', label: 'Rendimiento/día', required: false, type: 'number', aliases: ['rendimiento', 'rend', 'produccion'] },
    ],
    sample: [
      { Codigo: 'MR-21', Nombre: 'Limpieza de sumideros', Categoria: 'Drenaje', Unidad: 'UND', Rendimiento: 18 },
    ],
  },
}

/** Auto-mapeo por similitud de encabezados */
export function autoMap(headers: string[], fields: ImportField[]): Record<string, string> {
  const map: Record<string, string> = {}
  const used = new Set<string>()

  // Primero las coincidencias exactas de todos los campos y recién después
  // las parciales: si no, un campo que se evalúa antes (N.º de PCI) se queda
  // por parecido con la columna «Número» que era exactamente la del ítem.
  for (const f of fields) {
    const candidates = [f.key, f.label, ...f.aliases].map(norm)
    const hit = headers.find((h) => !used.has(h) && candidates.includes(norm(h)))
    if (hit) {
      map[f.key] = hit
      used.add(hit)
    }
  }

  for (const f of fields) {
    if (map[f.key]) continue
    const candidates = [f.key, f.label, ...f.aliases].map(norm)
    // coincidencia parcial
    const partial = headers.find(
      (h) => !used.has(h) && candidates.some((c) => norm(h).includes(c) || c.includes(norm(h)))
    )
    if (partial) {
      map[f.key] = partial
      used.add(partial)
    }
  }
  return map
}

export interface RowIssue {
  row: number
  field: string
  message: string
}

/** Convierte y valida una celda según el tipo del campo */
export function coerce(
  value: any,
  field: ImportField,
  lookups: Record<string, Map<string, string>>
): { value: any; error?: string } {
  if (value == null || value === '') {
    return field.required ? { value: null, error: `${field.label} es obligatorio` } : { value: null }
  }

  switch (field.type) {
    case 'number': {
      const n = Number(String(value).replace(/,/g, '.').replace(/[^\d.\-]/g, ''))
      if (!Number.isFinite(n)) return { value: null, error: `${field.label}: "${value}" no es un número` }
      return { value: n }
    }
    case 'progresiva': {
      const m = parseProgresiva(String(value))
      if (m == null) return { value: null, error: `${field.label}: "${value}" no es una progresiva válida (use 12+450)` }
      return { value: m }
    }
    case 'date': {
      // Excel serial o texto
      if (typeof value === 'number') {
        const d = new Date(Math.round((value - 25569) * 86400 * 1000))
        return { value: toISODate(d) }
      }
      const s = String(value).trim()
      const iso = /^\d{4}-\d{2}-\d{2}/.test(s)
        ? s.slice(0, 10)
        : /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)
          ? (() => {
              const [d, m, y] = s.split(/[/-]/)
              return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
            })()
          : null
      if (!iso) return { value: null, error: `${field.label}: "${value}" no es una fecha válida` }
      return { value: iso }
    }
    case 'lookup': {
      const table = lookups[field.lookup!]
      if (!table) return { value: String(value) }
      const key = norm(String(value))
      const found = table.get(key)
      // Aunque el campo sea opcional, un valor escrito que no existe es un
      // error: una errata en «Cuadrilla» dejaba el ítem sin asignar y nadie
      // se enteraba. La celda vacía sí es válida (se resolvió arriba).
      if (!found) {
        return { value: null, error: `${field.label}: "${value}" no existe en el catálogo` }
      }
      return { value: found }
    }
    default:
      return { value: String(value).trim() }
  }
}

export const normKey = norm
