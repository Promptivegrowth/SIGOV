import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Wallet, CalendarRange, TriangleAlert, HardHat, MapPinned,
  Boxes, Package, PackageCheck, CalendarClock, ShieldCheck, FileBarChart, Upload, Settings, Map, FolderOpen, Bell, FileSignature, History,
  ClipboardList, Camera, BarChart3, RefreshCw,
} from 'lucide-react'

export type Role = 'admin' | 'supervisor' | 'jefe_cuadrilla' | 'ing_seguridad' | 'visor'

export const ROLES: Record<Role, {
  label: string
  short: string
  /** Como lo llama el cliente en su operación diaria */
  alias: string
  description: string
  color: string
}> = {
  admin: {
    label: 'Administrador',
    short: 'Admin',
    alias: 'Coordinador de contrato',
    description: 'Control total del sistema, servicios, usuarios y configuración',
    color: 'oklch(0.47 0.19 264)',
  },
  supervisor: {
    label: 'Supervisor',
    short: 'Supervisor',
    alias: 'Inspector',
    description: 'Valida partes, programa, gestiona PCIs y emite reportes',
    color: 'oklch(0.62 0.14 235)',
  },
  jefe_cuadrilla: {
    label: 'Jefe de cuadrilla',
    short: 'Cuadrilla',
    alias: 'Capataz',
    description: 'Registra ejecución en campo, evidencias y SSOMA. Modo offline',
    color: 'oklch(0.72 0.16 74)',
  },
  ing_seguridad: {
    label: 'Ing. de seguridad',
    short: 'SSOMA',
    alias: 'Ingeniero SSOMA',
    description: 'Gestiona charlas, checklists, ATS/IPERC y cumplimiento SSOMA',
    color: 'oklch(0.6 0.15 152)',
  },
  visor: {
    label: 'Visor',
    short: 'Visor',
    alias: 'Cliente / COVINCA · solo lectura',
    description: 'Solo lectura: dashboard, mapa y reportes. Sin ninguna escritura',
    color: 'oklch(0.55 0.02 258)',
  },
}

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: Role[]
  module?: string
  field?: boolean   // visible en la barra inferior del modo campo
  badge?: 'pci' | 'sync' | 'partes' | 'alertas'
  /** Cuando el rótulo cambia según quién mira */
  labelPorRol?: Partial<Record<Role, string>>
}

/**
 * El menú, con los nombres que usa cada rol.
 *
 * El Jefe de Cuadrilla no llama «Campo» al reporte diario ni «Caja chica» a
 * su caja: la especificación nombra sus apartados uno por uno, y esos son
 * los nombres que la cuadrilla reconoce. Cuando el rótulo cambia según
 * quién mira, se declara en `labelPorRol`.
 */
export const NAV: NavItem[] = [
  { href: '/dashboard',    label: 'Dashboard',     labelPorRol: { jefe_cuadrilla: 'Inicio' },
    icon: LayoutDashboard, roles: ['admin','supervisor','ing_seguridad','visor','jefe_cuadrilla'] },
  { href: '/jornada',      label: 'Mi Jornada',    icon: ClipboardList,
    roles: ['jefe_cuadrilla'], module: 'campo' },
  { href: '/programacion', label: 'Programación',  icon: CalendarRange,
    roles: ['admin','supervisor','jefe_cuadrilla','visor'], module: 'programacion', field: true },
  { href: '/pci',          label: 'PCIs',          icon: TriangleAlert,
    roles: ['admin','supervisor','jefe_cuadrilla','visor'], module: 'pci', field: true, badge: 'pci' },
  { href: '/campo',        label: 'Campo',
    labelPorRol: { jefe_cuadrilla: 'Reporte Diario', visor: 'Ejecución / Campo', admin: 'Reportes Diarios' },
    icon: HardHat, roles: ['admin','supervisor','jefe_cuadrilla','visor'], module: 'campo', field: true, badge: 'sync' },
  { href: '/caja',         label: 'Caja chica',    labelPorRol: { jefe_cuadrilla: 'Registro de Gastos / Mi Caja' },
    icon: Wallet, roles: ['admin','supervisor','jefe_cuadrilla'], module: 'caja' },
  { href: '/materiales',   label: 'Materiales',
    labelPorRol: { jefe_cuadrilla: 'Materiales / Insumos', admin: 'Materiales / Insumos', visor: 'Materiales / Insumos' },
    icon: Package, roles: ['admin','supervisor','jefe_cuadrilla','visor'], module: 'materiales' },
  { href: '/evidencias',   label: 'Fotos / Evidencias',
    labelPorRol: { visor: 'Fotografías', ing_seguridad: 'Evidencias SSOMA' },
    icon: Camera, roles: ['admin','supervisor','ing_seguridad','jefe_cuadrilla','visor'], module: 'campo' },
  { href: '/avance',       label: 'Mi Avance',     icon: BarChart3,
    roles: ['jefe_cuadrilla'], module: 'campo' },
  { href: '/sincronizacion', label: 'Sincronización', icon: RefreshCw,
    roles: ['jefe_cuadrilla'], badge: 'sync' },
  { href: '/alertas',      label: 'Alertas',       icon: Bell,
    roles: ['admin','supervisor','ing_seguridad'], badge: 'alertas' },
  { href: '/mapa',         label: 'Mapa',          icon: Map,
    roles: ['admin','supervisor','ing_seguridad','visor'], module: 'mapa' },
  { href: '/inventario',   label: 'Inventario',    labelPorRol: { admin: 'Inventario / Vehículos' },
    icon: Boxes, roles: ['admin','supervisor','visor','ing_seguridad'], module: 'inventario' },
  { href: '/ssoma',        label: 'SSOMA',         icon: ShieldCheck,
    roles: ['admin','supervisor','ing_seguridad','visor'], module: 'ssoma', field: true },
  { href: '/vencimientos', label: 'Vencimientos',  icon: CalendarClock,
    roles: ['admin','supervisor','ing_seguridad'], module: 'ssoma' },
  { href: '/auditoria',    label: 'Auditoría',     icon: History,
    roles: ['admin'] },
  { href: '/reportes',     label: 'Reportes',      icon: FileBarChart,
    roles: ['admin','supervisor','ing_seguridad','visor'], module: 'reportes' },
  { href: '/formatos',     label: 'Formatos',      icon: FileSignature,
    roles: ['admin','supervisor','ing_seguridad'], module: 'reportes' },
  { href: '/paquetes',     label: 'Entregables',   icon: PackageCheck,
    roles: ['admin','supervisor'], module: 'reportes' },
  { href: '/archivo',      label: 'Archivo',       labelPorRol: { admin: 'Documentos', visor: 'Documentos', ing_seguridad: 'Documentos' },
    icon: FolderOpen, roles: ['admin','supervisor','ing_seguridad','visor'] },
  { href: '/importar',     label: 'Importación',   icon: Upload,
    roles: ['admin','supervisor'] },
  { href: '/configuracion',label: 'Configuración', icon: Settings,
    roles: ['admin','supervisor'] },
]

/** El rótulo que le toca a este rol. */
export function rotuloDeNav(item: NavItem, role: Role): string {
  return item.labelPorRol?.[role] ?? item.label
}


export const SEMAFORO = {
  verde:   { label: 'En plazo',    className: 'bg-sem-verde',   text: 'text-sem-verde',   ring: 'ring-sem-verde/30' },
  ambar:   { label: 'Por vencer',  className: 'bg-sem-ambar',   text: 'text-sem-ambar',   ring: 'ring-sem-ambar/30' },
  rojo:    { label: 'Crítico',     className: 'bg-sem-rojo',    text: 'text-sem-rojo',    ring: 'ring-sem-rojo/30' },
  vencido: { label: 'Vencido',     className: 'bg-sem-vencido', text: 'text-sem-vencido', ring: 'ring-sem-vencido/30' },
  ok:      { label: 'Levantado',   className: 'bg-sem-ok',      text: 'text-sem-ok',      ring: 'ring-sem-ok/30' },
} as const

export type Semaforo = keyof typeof SEMAFORO

export const PCI_PRIORITY = {
  baja:    { label: 'Baja',    className: 'bg-muted text-muted-foreground' },
  media:   { label: 'Media',   className: 'bg-info/15 text-info' },
  alta:    { label: 'Alta',    className: 'bg-warning/20 text-warning' },
  critica: { label: 'Crítica', className: 'bg-destructive/15 text-destructive' },
} as const

export const PCI_ITEM_STATUS = {
  pendiente:   { label: 'Pendiente',   className: 'bg-muted text-muted-foreground' },
  en_atencion: { label: 'En atención', className: 'bg-info/15 text-info' },
  levantado:   { label: 'Levantado',   className: 'bg-success/15 text-success' },
  validado:    { label: 'Validado',    className: 'bg-success/25 text-success' },
  rechazado:   { label: 'Rechazado',   className: 'bg-destructive/15 text-destructive' },
} as const

/**
 * Los cinco estados de una partida, como los nombra la obra.
 *
 * «Por validar» es el que faltaba: la cuadrilla dio por terminado el
 * trabajo y espera el visto bueno del supervisor. Antes la partida saltaba
 * sola a ejecutada al alcanzar el metrado, sin que nadie la mirara.
 */
export const PLAN_ITEM_STATUS = {
  programado:   { label: 'Pendiente',    className: 'bg-muted text-muted-foreground' },
  en_curso:     { label: 'En ejecución', className: 'bg-info/15 text-info' },
  por_validar:  { label: 'Por validar',  className: 'bg-warning/20 text-warning' },
  ejecutado:    { label: 'Culminada',    className: 'bg-success/15 text-success' },
  suspendido:   { label: 'Observada',    className: 'bg-destructive/15 text-destructive' },
  reprogramado: { label: 'Reprogramada', className: 'bg-warning/20 text-warning' },
  cancelado:    { label: 'Anulada',      className: 'bg-muted text-muted-foreground line-through' },
} as const

export const WORK_ORDER_STATUS = {
  borrador:  { label: 'Borrador',  className: 'bg-muted text-muted-foreground' },
  enviado:   { label: 'Por validar', className: 'bg-warning/20 text-warning' },
  validado:  { label: 'Validado',  className: 'bg-success/15 text-success' },
  observado: { label: 'Observado', className: 'bg-destructive/15 text-destructive' },
} as const

export const ASSET_CONDITION = {
  bueno:       { label: 'Bueno',        className: 'bg-success/15 text-success',        dot: 'oklch(0.62 0.16 150)' },
  regular:     { label: 'Regular',      className: 'bg-warning/20 text-warning',        dot: 'oklch(0.79 0.16 76)' },
  malo:        { label: 'Malo',         className: 'bg-destructive/15 text-destructive',dot: 'oklch(0.6 0.22 27)' },
  critico:     { label: 'Crítico',      className: 'bg-destructive/25 text-destructive',dot: 'oklch(0.45 0.2 22)' },
  no_evaluado: { label: 'No evaluado',  className: 'bg-muted text-muted-foreground',    dot: 'oklch(0.6 0.02 258)' },
} as const

export const EVIDENCE_PHASE = {
  antes:   { label: 'Antes',   className: 'bg-info/15 text-info' },
  durante: { label: 'Durante', className: 'bg-warning/20 text-warning' },
  despues: { label: 'Después', className: 'bg-success/15 text-success' },
  general: { label: 'General', className: 'bg-muted text-muted-foreground' },
} as const

/** Usuarios demo del acceso rápido en login */
export const DEMO_USERS = [
  { email: 'admin@sigov.dev',      name: 'Luis Bravo Camus',     role: 'admin' as Role,          hint: 'Todo el sistema' },
  { email: 'supervisor@sigov.dev', name: 'Elvis Dueñas Cabrera', role: 'supervisor' as Role,     hint: 'Control y validación' },
  { email: 'cuadrilla1@sigov.dev', name: 'Marco Quispe Ramos',   role: 'jefe_cuadrilla' as Role, hint: 'Cuadrilla A · Calzada' },
  { email: 'cuadrilla2@sigov.dev', name: 'Rosa Huamán Ticona',   role: 'jefe_cuadrilla' as Role, hint: 'Cuadrilla B · Señalización' },
  { email: 'ssoma@sigov.dev',      name: 'Paola Ríos Mendoza',   role: 'ing_seguridad' as Role,  hint: 'Seguridad y salud' },
  { email: 'visor@sigov.dev',      name: 'Supervisión OSITRAN',  role: 'visor' as Role,          hint: 'Solo lectura' },
]

export const DEMO_PASSWORD = 'Sigov2026!'

export const MAP_STYLES = {
  calles: {
    label: 'Calles',
    style: {
      version: 8 as const,
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sources: {
        osm: {
          type: 'raster' as const,
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
    },
  },
  satelite: {
    label: 'Satélite',
    style: {
      version: 8 as const,
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sources: {
        esri: {
          type: 'raster' as const,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri World Imagery',
        },
      },
      layers: [{ id: 'esri', type: 'raster' as const, source: 'esri' }],
    },
  },
  topografico: {
    label: 'Relieve',
    style: {
      version: 8 as const,
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sources: {
        topo: {
          type: 'raster' as const,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: '© Esri Topo',
        },
      },
      layers: [{ id: 'topo', type: 'raster' as const, source: 'topo' }],
    },
  },
} as const

export type MapStyleKey = keyof typeof MAP_STYLES

export const PERU_CENTER: [number, number] = [-78.45, -9.4]

export const CHART_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
]

export const APP = {
  name: 'SIGOV',
  fullName: 'Sistema Integral de Gestión Operativa Vial',
  tagline: 'Gestión Operativa Vial 4.0',
  org: 'Grupo Servicon V&D EIRL',
  builtBy: 'Promptive',
  version: '1.0.0',
}
