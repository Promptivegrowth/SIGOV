/**
 * El contenido de la guía de pruebas.
 *
 * Está partido en cuatro archivos por comodidad, pero es un solo documento
 * y se lee en este orden. Cuando el sistema cambie, se edita el texto aquí y
 * se vuelve a correr `node scripts/guia/generar.mjs`.
 */

import { PRELIMINARES } from './partes/00-preliminares.mjs'
import { PANEL_A } from './partes/10-panel-a.mjs'
import { PANEL_B } from './partes/11-panel-b.mjs'
import { APP } from './partes/20-app.mjs'
import { CIERRE } from './partes/30-cierre.mjs'

const hoy = new Date().toLocaleDateString('es-PE', {
  day: '2-digit', month: 'long', year: 'numeric',
})

export const GUIA = {
  titulo: 'Guía de pruebas de SIGOV',
  tituloHtml: 'Guía de pruebas<br><em>del sistema SIGOV</em>',
  version: 'Versión 1.0',
  bajada:
    'Recorrido completo del panel administrativo y de la aplicación de campo, pantalla por pantalla, para probar el sistema y dejar por escrito qué funciona y qué hay que corregir.',
  ficha: [
    ['Sistema', 'SIGOV · Gestión Operativa Vial'],
    ['Empresa', 'Grupo Servicon V&D EIRL'],
    ['Contrato de prueba', 'Conservación Vial · Arequipa – Moquegua – Tacna'],
    ['Cliente', 'COVINCA'],
    ['Documento', 'Guía de pruebas · Versión 1.0'],
    ['Fecha de emisión', hoy],
  ],
  secciones: [...PRELIMINARES, ...PANEL_A, ...PANEL_B, ...APP, ...CIERRE],
}
