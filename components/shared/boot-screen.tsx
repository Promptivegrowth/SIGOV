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
  background:radial-gradient(120% 120% at 50% 0%,#0D3E8F 0%,#072D70 45%,#04193F 100%);
  opacity:1;transition:opacity .5s ease,visibility .5s ease;
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
#sigov-boot.sb-hide{opacity:0;visibility:hidden;pointer-events:none}
#sigov-boot .sb-in{display:flex;flex-direction:column;align-items:center;text-align:center;
  animation:sb-in .6s cubic-bezier(.22,1,.36,1)}
#sigov-boot .sb-mark{filter:drop-shadow(0 12px 32px rgba(0,0,0,.45))}
#sigov-boot .sb-word{margin-top:18px;color:#fff;font-weight:800;font-size:34px;letter-spacing:.22em;text-indent:.22em}
#sigov-boot .sb-tag{margin-top:6px;color:rgba(255,255,255,.62);font-size:11.5px;letter-spacing:.16em;
  text-transform:uppercase;font-weight:500}
#sigov-boot .sb-bar{margin-top:30px;width:186px;height:3px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.14)}
#sigov-boot .sb-bar i{display:block;height:100%;width:42%;border-radius:99px;
  background:linear-gradient(90deg,transparent,#F96414,#6BB43B,#F96414,transparent);
  animation:sb-sweep 1.35s cubic-bezier(.65,0,.35,1) infinite}
#sigov-boot .sb-foot{margin-top:26px;color:rgba(255,255,255,.32);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
@keyframes sb-sweep{0%{transform:translateX(-110%)}100%{transform:translateX(345%)}}
@keyframes sb-in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#sigov-boot .sb-bar i,#sigov-boot .sb-in{animation:none}}
`

const SCRIPT = `(function(){
  if (document.getElementById('sigov-boot')) return;
  var el = document.createElement('div');
  el.id = 'sigov-boot';
  el.setAttribute('aria-hidden','true');
  el.innerHTML =
    '<div class="sb-in">' +
      '<div class="sb-mark">' +
        '<img src="/marca/simbolo-servicon-claro.png" alt="" width="92" height="82"/>' +
      '</div>' +
      '<div class="sb-word">SIGOV</div>' +
      '<div class="sb-tag">Gesti\\u00f3n Operativa Vial 4.0</div>' +
      '<div class="sb-bar"><i></i></div>' +
      '<div class="sb-foot">Grupo Servicon V&amp;D EIRL \\u00b7 Promptive</div>' +
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
