/**
 * El PDF de la guía de pruebas.
 *
 * El contenido vive aparte, en `contenido.mjs`, para que actualizarlo cuando
 * cambie el sistema sea editar texto y no pelear con el maquetado. Aquí solo
 * está cómo se ve: la portada, la retícula, las tablas de pasos y el pie con
 * la numeración.
 *
 *   node scripts/guia/generar.mjs
 *
 * Produce GUIA-DE-PRUEBAS-SIGOV.pdf en la raíz del proyecto.
 */

import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs'
import path from 'node:path'
import { GUIA } from './contenido.mjs'

const RAIZ = process.cwd()
const SALIDA = path.join(RAIZ, 'GUIA-DE-PRUEBAS-SIGOV.pdf')

const b64 = (p) => fs.readFileSync(path.join(RAIZ, p)).toString('base64')
const LOGO = `data:image/png;base64,${b64('public/marca/logo-servicon-claro.png')}`
const LOGO_OSCURO = `data:image/png;base64,${b64('public/marca/logo-servicon.png')}`
const SIMBOLO = `data:image/png;base64,${b64('public/marca/simbolo-servicon.png')}`

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Negrita con **, código con ``, y nada más: el texto manda. */
const rico = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')

// ═══ Los bloques ══════════════════════════════════════════════════════

function parrafo(t) {
  return `<p>${rico(t)}</p>`
}

function aviso(b) {
  const clases = { nota: 'nota', ojo: 'ojo', dato: 'dato' }
  const titulos = { nota: 'Ten en cuenta', ojo: 'Atención', dato: 'Dato' }
  return `<div class="aviso ${clases[b.tipo] ?? 'nota'}">
    <span class="aviso-t">${esc(b.titulo ?? titulos[b.tipo] ?? 'Nota')}</span>
    <span>${rico(b.texto)}</span>
  </div>`
}

function lista(b) {
  const et = b.orden ? 'ol' : 'ul'
  return `<${et} class="lista">${b.items.map((i) => `<li>${rico(i)}</li>`).join('')}</${et}>`
}

function tabla(b) {
  return `<table class="tabla">
    <thead><tr>${b.columnas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${b.filas
      .map((f) => `<tr>${f.map((c) => `<td>${rico(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`
}

/** La ficha de un control: qué es y qué hace. */
function controles(b) {
  return `<table class="tabla controles">
    <thead><tr><th style="width:31%">Elemento en pantalla</th><th>Qué hace</th></tr></thead>
    <tbody>${b.items
      .map(
        ([nombre, que]) =>
          `<tr><td class="ctrl">${rico(nombre)}</td><td>${rico(que)}</td></tr>`
      )
      .join('')}</tbody>
  </table>`
}

/** Una prueba: pasos numerados y qué debe pasar. */
function prueba(b) {
  return `<div class="prueba">
    <div class="prueba-cab">
      <span class="prueba-id">${esc(b.id)}</span>
      <span class="prueba-tit">${rico(b.titulo)}</span>
      ${b.rol ? `<span class="prueba-rol">${esc(b.rol)}</span>` : ''}
    </div>
    ${b.previo ? `<p class="previo"><strong>Antes de empezar:</strong> ${rico(b.previo)}</p>` : ''}
    <ol class="pasos">${b.pasos.map((p) => `<li>${rico(p)}</li>`).join('')}</ol>
    <div class="esperado">
      <span class="esperado-t">Debe ocurrir</span>
      <ul>${b.esperado.map((e) => `<li>${rico(e)}</li>`).join('')}</ul>
    </div>
    <div class="registro">
      <span class="registro-t">Resultado</span>
      <span class="casilla">☐ Conforme</span>
      <span class="casilla">☐ Con observación</span>
      <span class="casilla">☐ No se pudo probar</span>
      <div class="lineas"><span></span><span></span></div>
    </div>
  </div>`
}

function bloque(b) {
  if (typeof b === 'string') return parrafo(b)
  switch (b.tipo) {
    case 'parrafo': return parrafo(b.texto)
    case 'nota': case 'ojo': case 'dato': return aviso(b)
    case 'lista': return lista(b)
    case 'tabla': return tabla(b)
    case 'controles': return controles(b)
    case 'prueba': return prueba(b)
    case 'subtitulo': return `<h4>${esc(b.titulo)}</h4>`
    case 'ruta': return `<p class="ruta">${rico(b.texto)}</p>`
    case 'salto': return '<div class="salto"></div>'
    default: return parrafo(b.texto ?? '')
  }
}

// ═══ El documento ═════════════════════════════════════════════════════

function seccionHtml(s, numero) {
  const sub = (x, i) => `
    <h3 id="s${numero}-${i}">${esc(x.titulo)}</h3>
    ${(x.bloques ?? []).map(bloque).join('\n')}`

  return `<section class="capitulo">
    <h2 id="c${numero}"><span class="cap-num">${numero}</span>${esc(s.titulo)}</h2>
    ${s.entrada ? `<p class="entrada">${rico(s.entrada)}</p>` : ''}
    ${(s.bloques ?? []).map(bloque).join('\n')}
    ${(s.subsecciones ?? []).map(sub).join('\n')}
  </section>`
}

function indiceHtml(secciones) {
  return `<nav class="indice">
    <h2>Contenido</h2>
    <ol>
      ${secciones
        .map(
          (s, i) => `<li><a href="#c${i + 1}"><span class="i-num">${i + 1}</span>${esc(s.titulo)}</a>
        ${
          (s.subsecciones ?? []).length
            ? `<ul>${s.subsecciones
                .map((x, j) => `<li><a href="#s${i + 1}-${j}">${esc(x.titulo)}</a></li>`)
                .join('')}</ul>`
            : ''
        }</li>`
        )
        .join('')}
    </ol>
  </nav>`
}

const CABEZA = `<!doctype html>
<html lang="es-PE"><head><meta charset="utf-8">
<title>${esc(GUIA.titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>
:root {
  --azul: #013c77;
  --azul-hondo: #012a55;
  --verde: #0b8637;
  --verde-claro: #6bb43b;
  --naranja: #f36b21;
  --tinta: #16202e;
  --suave: #5b6675;
  --borde: #d8dde5;
  --fondo-suave: #f4f6f9;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Inter, system-ui, sans-serif;
  font-size: 9.6pt;
  line-height: 1.55;
  color: var(--tinta);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@page { size: A4; margin: 17mm 15mm 16mm 15mm; }

/* ═══ Portada ═══ */
.portada {
  page-break-after: always;
  height: 297mm; width: 210mm;
  background: linear-gradient(160deg, var(--azul-hondo) 0%, var(--azul) 52%, #024a8f 100%);
  color: #fff; padding: 26mm 20mm; position: relative; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between;
}
.portada::after {
  content: ''; position: absolute; right: -60mm; bottom: -70mm;
  width: 190mm; height: 190mm; border-radius: 50%;
  background: radial-gradient(circle, rgba(107,180,59,.30), transparent 62%);
}
.portada-marca img { width: 62mm; }
.portada h1 {
  font-family: 'Barlow Condensed', Inter, sans-serif;
  font-size: 44pt; line-height: 1.02; margin: 0 0 5mm; font-weight: 700;
  letter-spacing: -.01em; position: relative; z-index: 2;
}
.portada h1 em { font-style: normal; color: var(--verde-claro); }
.portada .bajada { font-size: 12pt; line-height: 1.5; color: rgba(255,255,255,.78); max-width: 128mm; position: relative; z-index: 2; }
.portada .ficha { position: relative; z-index: 2; border-top: 1px solid rgba(255,255,255,.22); padding-top: 6mm; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm 10mm; }
.portada .ficha div span { display: block; }
.portada .ficha .k { font-size: 7.6pt; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.5); margin-bottom: 1mm; }
.portada .ficha .v { font-size: 10.5pt; font-weight: 600; }
.sello { position: absolute; top: 24mm; right: 20mm; width: 26mm; opacity: .9; z-index: 2; }

/* ═══ Índice ═══ */
.indice { page-break-after: always; }
.indice h2 { font-family: 'Barlow Condensed', sans-serif; font-size: 22pt; color: var(--azul); margin: 0 0 6mm; letter-spacing: .01em; }
.indice ol { list-style: none; margin: 0; padding: 0; counter-reset: none; }
.indice > ol > li { margin-bottom: 3.6mm; }
.indice a { color: var(--tinta); text-decoration: none; font-weight: 600; font-size: 10.5pt; }
.indice .i-num {
  display: inline-block; width: 7mm; height: 7mm; line-height: 7mm; text-align: center;
  background: var(--azul); color: #fff; border-radius: 2mm; font-size: 8pt; margin-right: 3mm;
}
.indice ul { list-style: none; margin: 1.6mm 0 0 10mm; padding: 0; }
.indice ul li { margin: .9mm 0; }
.indice ul a { font-weight: 400; font-size: 9.2pt; color: var(--suave); }

/* ═══ Capítulos ═══ */
.capitulo { page-break-before: always; }
.capitulo:first-of-type { page-break-before: auto; }
h2 {
  font-family: 'Barlow Condensed', sans-serif; font-size: 21pt; color: var(--azul);
  margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 2px solid var(--verde);
  display: flex; align-items: baseline; gap: 4mm; letter-spacing: .005em;
}
.cap-num { font-size: 12pt; color: #fff; background: var(--verde); border-radius: 2mm; padding: 0 2.6mm; font-family: Inter, sans-serif; font-weight: 700; }
h3 {
  font-size: 12pt; color: var(--azul-hondo); margin: 7mm 0 2.5mm;
  padding-left: 3mm; border-left: 3px solid var(--naranja); page-break-after: avoid;
}
h4 { font-size: 10pt; margin: 5mm 0 2mm; color: var(--azul-hondo); }
p { margin: 0 0 2.6mm; }
.entrada { font-size: 10.4pt; color: var(--suave); margin-bottom: 5mm; }
code {
  font-family: 'Consolas', 'Courier New', monospace; font-size: 8.6pt;
  background: var(--fondo-suave); border: 1px solid var(--borde);
  border-radius: 1mm; padding: .3mm 1.2mm;
}
strong { font-weight: 600; }
.ruta {
  font-family: 'Consolas', monospace; font-size: 8.8pt; color: var(--azul);
  background: var(--fondo-suave); border-left: 3px solid var(--azul);
  padding: 1.8mm 3mm; margin: 0 0 3mm;
}
.salto { page-break-before: always; }

/* ═══ Listas ═══ */
.lista { margin: 0 0 3mm; padding-left: 5.5mm; }
.lista li { margin-bottom: 1.4mm; }

/* ═══ Avisos ═══ */
.aviso {
  display: grid; grid-template-columns: 30mm 1fr; gap: 3mm;
  border-left: 3px solid var(--azul); background: var(--fondo-suave);
  padding: 2.4mm 3mm; margin: 0 0 3.4mm; font-size: 9.2pt;
  page-break-inside: avoid;
}
.aviso-t { font-weight: 700; font-size: 8.2pt; text-transform: uppercase; letter-spacing: .07em; color: var(--azul); }
.aviso.ojo { border-left-color: var(--naranja); background: #fff6f0; }
.aviso.ojo .aviso-t { color: #c14a08; }
.aviso.dato { border-left-color: var(--verde); background: #f1f9f3; }
.aviso.dato .aviso-t { color: var(--verde); }

/* ═══ Tablas ═══ */
.tabla { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; page-break-inside: auto; }
.tabla th {
  background: var(--azul); color: #fff; text-align: left; font-weight: 600;
  padding: 1.8mm 2.4mm; font-size: 8.4pt; text-transform: uppercase; letter-spacing: .04em;
}
.tabla td { border: 1px solid var(--borde); padding: 1.8mm 2.4mm; vertical-align: top; }
.tabla tbody tr:nth-child(even) { background: #fafbfd; }
.tabla tr { page-break-inside: avoid; }
.controles .ctrl { font-weight: 600; color: var(--azul-hondo); }

/* ═══ Pruebas ═══ */
.prueba {
  border: 1px solid var(--borde); border-radius: 2mm; margin: 0 0 4.5mm;
  page-break-inside: avoid; overflow: hidden;
}
.prueba-cab {
  background: var(--azul); color: #fff; padding: 2mm 3mm;
  display: flex; align-items: center; gap: 3mm;
}
.prueba-id { font-weight: 700; font-size: 8.6pt; background: rgba(255,255,255,.18); padding: .4mm 2mm; border-radius: 1mm; letter-spacing: .04em; }
.prueba-tit { font-weight: 600; font-size: 10pt; flex: 1; }
.prueba-rol { font-size: 8pt; background: var(--verde); padding: .5mm 2mm; border-radius: 1mm; font-weight: 600; }
.previo { padding: 2mm 3mm 0; font-size: 9pt; color: var(--suave); margin: 0; }
.pasos { margin: 2mm 0 2mm; padding: 0 3mm 0 9mm; }
.pasos li { margin-bottom: 1.4mm; }
.esperado { margin: 0 3mm 2.5mm; background: #f1f9f3; border-left: 3px solid var(--verde); padding: 2mm 3mm; }
.esperado-t { display: block; font-size: 8.2pt; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--verde); margin-bottom: 1mm; }
.esperado ul { margin: 0; padding-left: 4.5mm; }
.esperado li { margin-bottom: .8mm; }
.registro { border-top: 1px dashed var(--borde); padding: 2mm 3mm 2.5mm; background: #fcfdfe; }
.registro-t { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--suave); margin-right: 4mm; }
.casilla { font-size: 8.8pt; margin-right: 5mm; }
.lineas { margin-top: 2.5mm; }
.lineas span { display: block; border-bottom: 1px solid var(--borde); height: 4.6mm; }
</style></head>
<body>`

const PIE_HTML = `</body></html>`

const htmlPortada = CABEZA + `
<div class="portada">
  <img class="sello" src="${SIMBOLO}" alt="">
  <div class="portada-marca"><img src="${LOGO}" alt="Grupo Servicon V&amp;D EIRL"></div>
  <div>
    <h1>${GUIA.tituloHtml}</h1>
    <p class="bajada">${rico(GUIA.bajada)}</p>
  </div>
  <div class="ficha">
    ${GUIA.ficha
      .map(([k, v]) => `<div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`)
      .join('')}
  </div>
</div>` + PIE_HTML

const htmlCuerpo = CABEZA + `
${indiceHtml(GUIA.secciones)}
${GUIA.secciones.map((s, i) => seccionHtml(s, i + 1)).join(String.fromCharCode(10))}
` + PIE_HTML

// ═══ A imprimir ═══════════════════════════════════════════════════════

/**
 * Se imprime en dos pasadas y se unen.
 *
 * La portada no lleva la cabecera ni el pie con la numeración —quedarían
 * impresos sobre el azul y encima dirían «Pág. 1 de 78»—, pero Playwright
 * aplica esas plantillas a todas las páginas o a ninguna. Así que la portada
 * sale en un PDF sin plantillas, el cuerpo en otro con ellas, y los dos se
 * pegan al final.
 */
const navegador = await chromium.launch()

async function aPdf(contenido, conPlantillas) {
  const pagina = await navegador.newPage()
  await pagina.setContent(contenido, { waitUntil: 'networkidle' })
  await pagina.emulateMedia({ media: 'print' })

  const pie = `
  <div style="width:100%;font-family:Inter,sans-serif;font-size:7.4pt;color:#6b7280;
              padding:0 15mm;display:flex;justify-content:space-between;align-items:center;">
    <span>${esc(GUIA.titulo)} · ${esc(GUIA.version)}</span>
    <span>Grupo Servicon V&amp;D EIRL</span>
    <span>Pág. <span class="pageNumber"></span></span>
  </div>`

  const cabecera = `
  <div style="width:100%;font-family:Inter,sans-serif;font-size:7.2pt;color:#9aa3b0;
              padding:0 15mm;display:flex;justify-content:space-between;border-bottom:.4pt solid #e5e8ee;">
    <span>SIGOV · Sistema de Gestión Operativa Vial</span>
    <span>Guía de pruebas</span>
  </div>`

  const bytes = await pagina.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: conPlantillas,
    headerTemplate: conPlantillas ? cabecera : '<span></span>',
    footerTemplate: conPlantillas ? pie : '<span></span>',
    margin: conPlantillas
      ? { top: '17mm', bottom: '16mm', left: '0mm', right: '0mm' }
      : { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
  })
  await pagina.close()
  return bytes
}

const bytesPortada = await aPdf(htmlPortada, false)
const bytesCuerpo = await aPdf(htmlCuerpo, true)
await navegador.close()

const doc = await PDFDocument.create()
for (const origen of [bytesPortada, bytesCuerpo]) {
  const suyo = await PDFDocument.load(origen)
  const paginas = await doc.copyPages(suyo, suyo.getPageIndices())
  paginas.forEach((x) => doc.addPage(x))
}
doc.setTitle(GUIA.titulo)
doc.setAuthor('Grupo Servicon V&D EIRL')
doc.setSubject('Guía de pruebas del sistema SIGOV')
doc.setCreator('SIGOV')

fs.writeFileSync(SALIDA, await doc.save())

const kb = (fs.statSync(SALIDA).size / 1024).toFixed(0)
console.log(`PDF listo: ${SALIDA} (${kb} KB, ${doc.getPageCount()} páginas)`)
