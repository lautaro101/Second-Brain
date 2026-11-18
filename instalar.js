/* Instalar Second Brain como app (PC, Android e iPhone). No depende del núcleo: se carga ANTES de core.js para no perderse el aviso del navegador.
   - Aviso abajo con botón «Instalar» cuando el navegador lo permite (se puede cerrar; vuelve a los 14 días).
   - Donde el navegador no avisa (Brave, iPhone, Firefox…): se explica el camino a mano, también en el aviso.
   - Ajustes → «Instalar la app»: siempre disponible, aunque hayas cerrado el aviso.
   Instalar solo anda desde la página publicada (https), no abriendo el archivo suelto. */
(function () {
const W = self, CLAVE = "sb_inst_no", DIAS = 14, ESPERA = 2500;
let evt = null, instalada = false, tAviso = 0; const alCambiar = [];
const ls = () => { try { return W.localStorage; } catch (e) { return null; } };
const ua = () => (W.navigator && W.navigator.userAgent) || "";
const esApp = () => { try { return instalada || !!((W.matchMedia && W.matchMedia("(display-mode: standalone)").matches) || (W.navigator && W.navigator.standalone === true)); } catch (e) { return false; } };
const https = () => /^https?:$/.test((W.location && W.location.protocol) || "");
const oculto = () => { try { const l = ls(); return !!l && Date.now() - (+l.getItem(CLAVE) || 0) < DIAS * 864e5; } catch (e) { return false; } };
const plataforma = () => /iphone|ipad|ipod/i.test(ua()) || (/macintosh/i.test(ua()) && W.navigator && W.navigator.maxTouchPoints > 1) ? "ios" : /android/i.test(ua()) ? "android" : "pc";
const PASOS = {
  ios: "Para instalarla: tocá Compartir (el cuadrado con la flecha) y después «Agregar a pantalla de inicio». En iPhone tiene que ser desde Safari.",
  android: "Para instalarla: tocá el menú ⋮ (o ☰) del navegador y elegí «Instalar aplicación» o «Agregar a pantalla de inicio».",
  pc: "Para instalarla: en Chrome, Edge o Brave buscá el ícono de instalar en la barra de direcciones, o abrí el menú ⋮ y elegí «Instalar Second Brain». Firefox no instala apps en la PC."
};
/* Qué le toca al usuario: app (ya instalada), boton (el navegador deja instalar con un toque), manual (hay que usar el menú) o nada (no se puede desde acá). */
function estado() {
  if (esApp()) return {tipo: "app", texto: "Ya la estás usando como app."};
  if (!https()) return {tipo: "nada", texto: "Para instalarla, abrila desde la dirección publicada de la app (https), no desde un archivo suelto."};
  if (evt) return {tipo: "boton", texto: "Instalala como app y la tenés a mano, también sin conexión."};
  return {tipo: "manual", texto: PASOS[plataforma()]};
}
const avisarCambio = () => alCambiar.slice().forEach(f => { try { f(); } catch (e) {} });
async function instalar() {
  if (!evt) return "";
  const e = evt; evt = null; let res = "";
  try { e.prompt(); const r = await e.userChoice; res = (r && r.outcome) || ""; } catch (x) { res = "error"; }
  if (res === "accepted") instalada = true;
  ocultarAviso(); avisarCambio(); return res;
}
function cerrar() { try { const l = ls(); if (l) l.setItem(CLAVE, String(Date.now())); } catch (e) {} ocultarAviso(); }

/* ---------- el aviso de abajo ---------- */
const el = id => W.document && W.document.getElementById && W.document.getElementById(id);
function ocultarAviso() { const b = el("inst"); if (b) b.hidden = true; }
function mostrarAviso() {
  const b = el("inst"), e = estado(); if (!b || e.tipo === "app" || e.tipo === "nada" || oculto()) { if (b && (e.tipo === "app" || e.tipo === "nada")) b.hidden = true; return; }
  if (e.tipo === "manual" && plataforma() === "pc") return;                     // en la PC sin aviso del navegador no se molesta: queda en Ajustes
  const t = el("instTxt"), bt = el("instBtn"); if (t) t.textContent = e.texto; if (bt) bt.hidden = e.tipo !== "boton"; b.hidden = false;
}
function enlazar() {
  const bt = el("instBtn"), x = el("instX"); if (bt) bt.onclick = () => { instalar(); }; if (x) x.onclick = cerrar;
  if (!esApp() && https() && !oculto() && plataforma() !== "pc") tAviso = setTimeout(() => { if (!evt) mostrarAviso(); }, ESPERA);   // si el navegador no avisó solo, se explica el camino
}
if (W.addEventListener) {
  W.addEventListener("beforeinstallprompt", e => { e.preventDefault(); evt = e; clearTimeout(tAviso); mostrarAviso(); avisarCambio(); });
  W.addEventListener("appinstalled", () => { instalada = true; evt = null; ocultarAviso(); avisarCambio(); });
  if (W.document && W.document.readyState === "loading") W.document.addEventListener("DOMContentLoaded", enlazar); else enlazar();
}

/* ---------- Ajustes → «Instalar la app» ---------- */
function seccion(div) {
  const pintar = () => {
    const e = estado();
    div.innerHTML = `<section class="card"><h3>📲 Instalar la app</h3>${e.tipo === "app" ? `<p>✅ ${e.texto}</p>` : `<p>${e.texto}</p>`}${e.tipo === "boton" ? `<div class="fila-b"><button type="button" data-inst="1">Instalar ahora</button></div>` : ""}</section>`;
    const b = div.querySelector && div.querySelector("[data-inst]"); if (b) b.onclick = () => { instalar(); };
  };
  const f = () => { if (div.isConnected === false) { const i = alCambiar.indexOf(f); if (i >= 0) alCambiar.splice(i, 1); return; } pintar(); };   // Ajustes se vuelve a dibujar seguido: las pantallas viejas se sueltan
  pintar(); alCambiar.push(f);
}
W.SB_INST = {estado, instalar, cerrar, seccion, plataforma, ajustes: SB => { if (SB && SB.secciones) SB.secciones.push(seccion); }, mostrarAviso};
})();
