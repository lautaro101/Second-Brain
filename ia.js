/* Second Brain · IA local, opcional (1.35.0).
   Habla con un servidor de modelos de TU red, por ahora Ollama (http://localhost:11434). Apagada por defecto: sin ella la app funciona igual.
   Nada sale a internet: los textos van solo a la dirección que pongas en Ajustes. La dirección y el modelo se guardan en este dispositivo (sb_ia) y no se sincronizan:
   en la PC puede ser localhost y en el celu otra cosa. No hay claves ni cuentas.
   Para que el navegador deje pasar el pedido, Ollama tiene que permitir el origen de la app (OLLAMA_ORIGINS) y, en Chrome, aceptar el permiso de «red local».
   Los módulos la usan con SB.ia.disponible() y SB.ia.chat(). */
(function () {
"use strict";
const SB = window.SB; if (!SB) return;
try {
const LS = window.localStorage, {esc} = SB.u;
const CLAVE = "sb_ia", DEFECTO = {on: false, url: "http://localhost:11434", modelo: "", espera: 180};
const leerC = () => { try { const v = JSON.parse(LS.getItem(CLAVE)); return Object.assign({}, DEFECTO, v && typeof v === "object" ? v : {}); } catch (e) { return Object.assign({}, DEFECTO); } };
const guardarC = c => { try { LS.setItem(CLAVE, JSON.stringify(c)); return true; } catch (e) { return false; } };
const falla = (msg, tipo) => { const e = new Error(msg); e.tipo = tipo || "ia"; return e; };

/* «http://localhost:11434/» → «http://localhost:11434»; sin esquema se asume http; solo http y https. Devuelve "" si no sirve. */
function limpiarUrl(u) {
  u = String(u || "").trim(); if (!u) return ""; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "http://" + u;
  try { const x = new URL(u); if (!/^https?:$/.test(x.protocol) || !/^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9.-]*[a-z0-9])?)$/i.test(x.hostname)) return ""; return x.origin; } catch (e) { return ""; }
}
/* Dónde queda el servidor según el navegador: «loopback» (esta misma PC), «local» (tu red de casa) o "" (internet o desconocido). */
function espacio(url) {
  let h = ""; try { h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ""); } catch (e) { return ""; }
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127\./.test(h)) return "loopback";
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h.endsWith(".local")) return "local";
  return "";
}
const origen = () => { try { return window.location && window.location.origin && window.location.origin !== "null" ? window.location.origin : ""; } catch (e) { return ""; } };
/* Un pedido a Ollama con tiempo máximo y cancelación. Los errores salen con un mensaje que dice qué revisar. */
async function pedir(ruta, cuerpo, op) {
  op = op || {}; const c = leerC(), base = limpiarUrl(c.url), esp = base ? espacio(base) : "";
  if (!base) throw falla("La dirección de Ollama no es válida. Ejemplo: http://localhost:11434");
  if (typeof fetch !== "function") throw falla("Este navegador no puede hacer el pedido.");
  const https = (() => { try { return window.location.protocol === "https:"; } catch (e) { return false; } })();
  if (https && /^http:/.test(base) && !esp) throw falla("El navegador no deja que una página https le hable a «" + base + "» por http. Usá localhost, una IP de tu red (192.168…) o una dirección https.");
  const ctrl = new AbortController(), ms = (op.espera || c.espera || 180) * 1000; let agotado = false;
  const t = setTimeout(() => { agotado = true; ctrl.abort(); }, ms); if (op.signal) { if (op.signal.aborted) ctrl.abort(); else op.signal.addEventListener("abort", () => ctrl.abort()); }
  try {
    const r = await fetch(base + ruta, Object.assign({method: cuerpo ? "POST" : "GET", signal: ctrl.signal}, cuerpo ? {headers: {"Content-Type": "application/json"}, body: JSON.stringify(cuerpo)} : {}, esp ? {targetAddressSpace: esp} : {}));
    if (!r.ok) { let d = ""; try { d = (await r.json()).error || ""; } catch (e) {} if (r.status === 404 && /model/i.test(d)) throw falla("El modelo «" + (c.modelo || "?") + "» no está instalado en Ollama. Instalalo con: ollama pull " + (c.modelo || "nombre-del-modelo"), "modelo"); throw falla("Ollama respondió con error " + r.status + (d ? ": " + d : "") + "."); }
    return await r.json();
  } catch (e) {
    if (e && e.tipo) throw e;
    if (agotado) throw falla("Ollama tardó más de " + Math.round(ms / 1000) + " segundos. Probá con un modelo más chico o menos texto.", "tiempo");
    if (e && e.name === "AbortError") throw falla("Cancelado.", "cancelado");
    const o = origen();
    throw falla("No pude conectar con Ollama en " + base + ". Revisá que esté abierto" + (o ? ", que OLLAMA_ORIGINS incluya " + o : "") + (esp ? " y que aceptaste el permiso de «red local» del navegador" : "") + ".", "conexion");
  } finally { clearTimeout(t); }
}
const listar = async () => ((await pedir("/api/tags")).models || []).map(m => ({n: m.name || m.model, mb: Math.round((m.size || 0) / 1e6)})).filter(m => m.n).sort((a, b) => a.n < b.n ? -1 : 1);
/* mensajes: [{role: "user"|"system"|"assistant", content}]. formato: un esquema JSON (Ollama lo hace cumplir) o «json». Devuelve el texto de la respuesta. */
async function chat(mensajes, op) {
  op = op || {}; const c = leerC(); if (!c.modelo) throw falla("Elegí un modelo en Ajustes → IA local.");
  const cuerpo = {model: c.modelo, messages: mensajes, stream: false, options: {temperature: op.temperatura === undefined ? 0.2 : op.temperatura}}; if (op.formato) cuerpo.format = op.formato;
  const j = await pedir("/api/chat", cuerpo, op), txt = j && j.message && typeof j.message.content === "string" ? j.message.content : "";
  if (!txt.trim()) throw falla("El modelo no devolvió nada. Probá de nuevo o con otro modelo.");
  return txt;
}
const disponible = () => { const c = leerC(); return !!(c.on && c.modelo && limpiarUrl(c.url)); };
async function probar() { const ms = await listar(), c = leerC(); return {modelos: ms, esta: !!ms.find(m => m.n === c.modelo)}; }

/* ---------- Ajustes → IA local ---------- */
const UI = {cont: null, modelos: [], msg: "", err: false, probando: false};
function pintar() {
  const c = UI.cont; if (!c || !c.isConnected) return;
  const cf = leerC(), o = origen() || "https://tu-usuario.github.io", esp = limpiarUrl(cf.url) ? espacio(limpiarUrl(cf.url)) : "";
  const lista = UI.modelos.length ? UI.modelos : cf.modelo ? [{n: cf.modelo, mb: 0}] : [];
  c.innerHTML = `<section class="card"><h3>🤖 IA local (Ollama)${cf.on && cf.modelo ? " · activa" : ""}</h3>
    <p class="ayuda">Opcional. Con una IA en tu propia PC, Tarjetas puede crear tarjetas desde tus apuntes, corregir tus respuestas escritas y explicarte lo que fallaste. Nada sale a internet: los textos van solo a la dirección de abajo. Sin esto, la app funciona igual.</p>
    <form data-f="ia-guardar"><label class="fila"><input type="checkbox" name="on"${cf.on ? " checked" : ""}><span class="tx">Usar la IA</span></label>
      <input name="url" value="${esc(cf.url)}" placeholder="http://localhost:11434" autocomplete="off" aria-label="Dirección de Ollama">
      <div class="fila-b"><select name="modelo" aria-label="Modelo">${lista.length ? lista.map(m => `<option value="${esc(m.n)}"${m.n === cf.modelo ? " selected" : ""}>${esc(m.n)}${m.mb ? " (" + (m.mb >= 1000 ? (m.mb / 1000).toFixed(1) + " GB" : m.mb + " MB") + ")" : ""}</option>`).join("") : `<option value="">(tocá «Probar y buscar modelos»)</option>`}</select></div>
      <div class="fila-b"><button type="submit" class="pri">Guardar</button><button type="button" data-a="ia-probar"${UI.probando ? " disabled" : ""}>${UI.probando ? "Probando…" : "Probar y buscar modelos"}</button></div></form>
    ${esp === "local" ? `<p class="sy-err">Esa dirección es de tu red: Ollama tiene que estar abierto a la red (OLLAMA_HOST=0.0.0.0), y eso lo deja accesible para cualquiera en tu Wi‑Fi, sin clave.</p>` : ""}
    <details><summary>📖 Guía: cómo tener IA en tu PC, paso a paso</summary><div class="guia">
      <p class="ayuda"><b>¿Qué es esto?</b> Ollama es un programa gratis que corre modelos de IA en tu propia computadora. Tus apuntes no salen de tu PC y no hay cuentas ni costos. Es opcional: la app funciona igual sin esto.</p>
      <ol>
        <li><b>Instalá Ollama.</b> Bajalo de <b>ollama.com</b> (Windows, Mac o Linux) e instalalo como cualquier programa.</li>
        <li><b>Elegí un modelo según la memoria (RAM) de tu PC.</b> Más grande es mejor, pero más lento y necesita más memoria:
          <table class="gtab"><thead><tr><th>Tu RAM</th><th>Modelo sugerido</th><th>Qué esperar</th></tr></thead><tbody>
          <tr><td>8 GB</td><td><code>qwen3:4b</code> (2,6 GB)</td><td>Rápido y básico: tarjetas simples.</td></tr>
          <tr><td>16 GB</td><td><code>qwen3:8b</code> (5 GB)</td><td>Buen equilibrio para empezar.</td></tr>
          <tr><td>32 GB</td><td><code>gemma4:26b-a4b-it-qat</code> (16 GB) o <code>qwen3:14b</code></td><td>Mejor calidad. Más lento: un apunte largo puede llevar varios minutos.</td></tr></tbody></table>
          <small>Los nombres cambian seguido. Si no lo encuentra, buscá un modelo parecido (Gemma o Qwen) en <b>ollama.com/library</b>. Con una placa de video NVIDIA con 8 GB o más, todo va bastante más rápido; las gráficas integradas de AMD no se aprovechan en Windows.</small></li>
        <li><b>Descargalo.</b> Abrí una terminal (en Windows, «PowerShell») y escribí <code>ollama pull</code> seguido del nombre. Por ejemplo: <code>ollama pull qwen3:8b</code>. Tarda según tu internet.</li>
        <li><b>Permití esta app.</b> Por seguridad Ollama bloquea las páginas web, así que hay que decirle que confíe en esta dirección y reiniciarlo:
          <p class="ayuda"><b>Windows</b> (PowerShell): <code>setx OLLAMA_ORIGINS "${esc(o)}"</code>. Después cerrá Ollama desde la bandeja (junto al reloj) y abrilo de nuevo.</p>
          <p class="ayuda"><b>Mac</b>: <code>launchctl setenv OLLAMA_ORIGINS "${esc(o)}"</code> y reiniciá Ollama.</p>
          <p class="ayuda"><b>Linux</b> (systemd): agregá <code>Environment="OLLAMA_ORIGINS=${esc(o)}"</code> al servicio y reinicialo.</p></li>
        <li><b>Conectala acá.</b> Dejá la dirección <code>http://localhost:11434</code>, tocá <b>Probar y buscar modelos</b>, elegí el que descargaste, tildá «Usar la IA» y tocá <b>Guardar</b>. La primera vez, Chrome te pide permiso para acceder a la «red local»: aceptalo.</li>
        <li><b>Usala en Tarjetas.</b> Al proponer tarjetas desde un material aparece «Generar más con IA». En los exámenes de escribir, «Corregir con IA», y en los resultados, «Explicame».</li>
      </ol>
      <p class="ayuda"><b>Si algo falla</b></p>
      <table class="gtab"><thead><tr><th>El mensaje dice…</th><th>Qué hacer</th></tr></thead><tbody>
        <tr><td>No pude conectar con Ollama</td><td>Revisá que Ollama esté abierto, repetí el paso 4 y reiniciá Ollama, y aceptá el permiso de «red local» (en Chrome, tocá el candado junto a la dirección). Lo verificamos en Chrome; en otros navegadores puede no funcionar.</td></tr>
        <tr><td>no está instalado en Ollama</td><td>Descargá el modelo con <code>ollama pull</code> (paso 3) o elegí otro de la lista.</td></tr>
        <tr><td>Ollama tardó más de</td><td>Probá un modelo más chico o menos texto. Una PC sin placa de video es lenta con los modelos grandes.</td></tr>
        <tr><td>La IA devolvió una respuesta que no pude leer</td><td>Pasa con modelos chicos. Volvé a intentar, corregí a mano o probá otro modelo.</td></tr></tbody></table>
      <p class="ayuda"><b>Importante:</b> la IA puede equivocarse. Revisá lo que propone: las tarjetas con ⚠️ no se apoyan en tu texto y quedan sin tildar.</p>
      <p class="ayuda"><b>¿Y el celular?</b> La IA corre en la PC. Las tarjetas que generes ahí se sincronizan al celular con tu archivo de Drive u OneDrive, y en el celular solo repasás. Conectar el celular directo a Ollama obliga a abrir Ollama a toda tu red sin clave, y no lo recomendamos salvo que sepas lo que hacés.</p></div></details>
    ${UI.msg ? `<p class="${UI.err ? "sy-err" : "sy-ok"}" role="status">${esc(UI.msg)}</p>` : ""}</section>`;
}
const msg = (t, err) => { UI.msg = t || ""; UI.err = !!err; pintar(); };
function seccion(cont) {
  UI.cont = cont; pintar();
  SB.u.eventos(cont, {
    a: async a => {
      if (a !== "ia-probar") return;
      const f = cont.querySelector("form"), url = limpiarUrl(f.elements.url.value);
      if (!url) return msg("La dirección no es válida. Ejemplo: http://localhost:11434", true);
      const c = leerC(); c.url = url; guardarC(c); UI.probando = true; msg("");
      try { const r = await probar(); UI.modelos = r.modelos; UI.probando = false;
        if (!r.modelos.length) return msg("Ollama responde, pero no tiene modelos instalados. Instalá uno, por ejemplo: ollama pull qwen2.5:7b", true);
        if (!r.esta) { const c2 = leerC(); c2.modelo = r.modelos[0].n; guardarC(c2); }
        msg("Conectado. " + r.modelos.length + (r.modelos.length === 1 ? " modelo disponible." : " modelos disponibles.") + " Elegí uno y tocá Guardar."); }
      catch (e) { UI.probando = false; msg(e.message, true); }
    },
    f: (a, fm) => {
      if (a !== "ia-guardar") return; const url = limpiarUrl(fm.elements.url.value);
      if (!url) return msg("La dirección no es válida. Ejemplo: http://localhost:11434", true);
      const c = leerC(); c.url = url; c.on = !!fm.elements.on.checked; c.modelo = fm.elements.modelo.value || c.modelo;
      if (c.on && !c.modelo) return msg("Antes de activarla, tocá «Probar y buscar modelos» y elegí uno.", true);
      const ok = guardarC(c); msg(ok ? (c.on ? "Guardado. La IA está activa en este dispositivo." : "Guardado. La IA está apagada.") : "No se pudo guardar.", !ok);
    }
  });
}
SB.secciones.push(seccion);

SB.ia = {config: leerC, guardar: c => guardarC(Object.assign(leerC(), c)), limpiarUrl, espacio, listar, chat, probar, disponible, seccion};
} catch (e) { SB.fallos["ia.js"] = e.message; }
})();
