import { getMirror } from './db'

/**
 * Catálogos que funcionan sin señal.
 *
 * Los formularios de campo (checklist, ATS) necesitan saber qué cuadrillas,
 * tramos y plantillas existen. Si eso solo viniera de la nube, en el kilómetro
 * 40 el formulario saldría vacío y no se podría llenar nada — que es
 * exactamente cuando más se necesita.
 *
 * La sincronización ya deja una copia de esos catálogos en el dispositivo;
 * aquí simplemente se usa cuando la consulta no puede salir a internet.
 */
export async function conRespaldoLocal<T>(
  cargar: () => Promise<T>,
  respaldo: () => Promise<T>
): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return respaldo()
  try {
    return await cargar()
  } catch {
    return respaldo()
  }
}

/** Lee una tabla del espejo local, ordenada por el campo que se indique. */
export async function espejo<T = any>(
  tabla: string,
  serviceId: string,
  ordenarPor: string = 'code'
): Promise<T[]> {
  const filas = await getMirror<any>(tabla, serviceId)
  return filas.sort((a: any, b: any) =>
    String(a?.[ordenarPor] ?? '').localeCompare(String(b?.[ordenarPor] ?? ''))
  ) as T[]
}
