/**
 * Preloader de arranque.
 *
 * IMPORTANTE: el overlay se construye desde un script inline y se cuelga de
 * <html>, FUERA del árbol que React hidrata. Si viviera dentro de <body> como
 * markup de React, retirarlo con JS rompería la reconciliación
 * ("Failed to execute 'insertBefore' on 'Node'") y tumbaría la app.
 *
 * Este componente solo emite <style> y <script>, que nunca se eliminan.
 * El overlay aparece en el primer pintado y se retira cuando la app emite
 * `sigov:ready`, con un tope de seguridad por si algo falla.
 */

const CSS = `
#sigov-boot{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 120% at 50% 0%,#25409E 0%,#16246E 45%,#0B1240 100%);
  opacity:1;transition:opacity .5s ease,visibility .5s ease;
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
#sigov-boot.sb-hide{opacity:0;visibility:hidden;pointer-events:none}
#sigov-boot .sb-in{display:flex;flex-direction:column;align-items:center;text-align:center;
  animation:sb-in .6s cubic-bezier(.22,1,.36,1)}
#sigov-boot .sb-mark{filter:drop-shadow(0 12px 32px rgba(0,0,0,.45))}
#sigov-boot .sb-dashes{animation:sb-drive 1.15s linear infinite}
#sigov-boot .sb-word{margin-top:18px;color:#fff;font-weight:800;font-size:34px;letter-spacing:.22em;text-indent:.22em}
#sigov-boot .sb-tag{margin-top:6px;color:rgba(255,255,255,.62);font-size:11.5px;letter-spacing:.16em;
  text-transform:uppercase;font-weight:500}
#sigov-boot .sb-bar{margin-top:30px;width:186px;height:3px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.14)}
#sigov-boot .sb-bar i{display:block;height:100%;width:42%;border-radius:99px;
  background:linear-gradient(90deg,transparent,#F5A314,#FFD27A,#F5A314,transparent);
  animation:sb-sweep 1.35s cubic-bezier(.65,0,.35,1) infinite}
#sigov-boot .sb-foot{margin-top:26px;color:rgba(255,255,255,.32);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
@keyframes sb-drive{from{transform:translateY(0)}to{transform:translateY(11px)}}
@keyframes sb-sweep{0%{transform:translateX(-110%)}100%{transform:translateX(345%)}}
@keyframes sb-in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#sigov-boot .sb-dashes,#sigov-boot .sb-bar i,#sigov-boot .sb-in{animation:none}}
`

const SCRIPT = `(function(){
  if (document.getElementById('sigov-boot')) return;
  var el = document.createElement('div');
  el.id = 'sigov-boot';
  el.setAttribute('aria-hidden','true');
  el.innerHTML =
    '<div class="sb-in">' +
      '<div class="sb-mark">' +
        '<svg viewBox="0 0 48 48" width="88" height="88" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<linearGradient id="sbr" x1="24" y1="12" x2="24" y2="42" gradientUnits="userSpaceOnUse">' +
              '<stop stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity=".95"/>' +
            '</linearGradient>' +
            '<clipPath id="sbc"><path d="M19.7 13.5h8.6l6 26.2c-2.6 1.9-6.1 3.4-10.3 4.4-4.2-1-7.7-2.5-10.3-4.4l6-26.2Z"/></clipPath>' +
          '</defs>' +
          '<path d="M24 2.5 6.5 8.4v15.9c0 9.9 7 19 17.5 21.2 10.5-2.2 17.5-11.3 17.5-21.2V8.4L24 2.5Z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.16)" stroke-width=".6"/>' +
          '<path d="M19.7 13.5h8.6l6 26.2c-2.6 1.9-6.1 3.4-10.3 4.4-4.2-1-7.7-2.5-10.3-4.4l6-26.2Z" fill="url(#sbr)"/>' +
          '<g clip-path="url(#sbc)" class="sb-dashes">' +
            '<rect x="22.7" y="10" width="2.6" height="5" rx="1.3" fill="#F5A314"/>' +
            '<rect x="22.7" y="20" width="2.6" height="5.5" rx="1.3" fill="#F5A314"/>' +
            '<rect x="22.7" y="31" width="2.6" height="6" rx="1.3" fill="#F5A314"/>' +
            '<rect x="22.7" y="43" width="2.6" height="6.5" rx="1.3" fill="#F5A314"/>' +
          '</g>' +
          '<rect x="17.4" y="11.6" width="13.2" height="2.1" rx="1.05" fill="#F5A314"/>' +
        '</svg>' +
      '</div>' +
      '<div class="sb-word">SIGOV</div>' +
      '<div class="sb-tag">Gesti\\u00f3n Operativa Vial 4.0</div>' +
      '<div class="sb-bar"><i></i></div>' +
      '<div class="sb-foot">ETS VALERIA \\u00b7 Promptive</div>' +
    '</div>';

  // Fuera del <body> que React hidrata: retirarlo nunca rompe la reconciliación.
  document.documentElement.appendChild(el);

  var t0 = Date.now(), done = false;
  function hide(){
    if (done) return; done = true;
    var wait = Math.max(0, 620 - (Date.now() - t0));
    setTimeout(function(){
      el.classList.add('sb-hide');
      setTimeout(function(){ el.parentNode && el.parentNode.removeChild(el) }, 620);
    }, wait);
  }
  window.addEventListener('sigov:ready', hide, { once: true });
  setTimeout(hide, 5000);
})();`

export function BootScreen() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  )
}
