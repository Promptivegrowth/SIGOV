'use client'

import * as React from 'react'

/**
 * Un estado que se conserva mientras dure la sesión del navegador (o de la
 * app): al abrir un detalle y volver, la lista recupera sus filtros, su
 * rango y su posición (ronda 5, VIS-01: al volver de un parte el listado
 * regresaba a «30 días» y «Todas las cuadrillas»).
 */
export function useEstadoDeSesion<T>(clave: string, inicial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const k = 'sigov:' + clave
  const [v, setV] = React.useState<T>(() => {
    if (typeof window === 'undefined') return inicial
    try {
      const g = window.sessionStorage.getItem(k)
      return g == null ? inicial : (JSON.parse(g) as T)
    } catch { return inicial }
  })
  React.useEffect(() => {
    try { window.sessionStorage.setItem(k, JSON.stringify(v)) } catch { /* sin almacenamiento: solo en memoria */ }
  }, [k, v])
  return [v, setV]
}

/**
 * Recupera la posición de la página al volver: la guarda al salir y la
 * aplica cuando `listo` es verdadero (los datos ya se dibujaron).
 */
export function usePosicionDeSesion(clave: string, listo: boolean) {
  const k = 'sigov:pos:' + clave
  const aplicada = React.useRef(false)
  React.useEffect(() => {
    if (!listo || aplicada.current) return
    aplicada.current = true
    try {
      const y = Number(window.sessionStorage.getItem(k) ?? 0)
      if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }))
    } catch { /* nada */ }
  }, [k, listo])
  React.useEffect(() => {
    const guardar = () => { try { window.sessionStorage.setItem(k, String(window.scrollY)) } catch { /* nada */ } }
    window.addEventListener('scroll', guardar, { passive: true })
    return () => { guardar(); window.removeEventListener('scroll', guardar) }
  }, [k])
}
