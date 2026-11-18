/* Second Brain · seguridad y copias (1.2.0).
   - PIN: traba la app al abrirla y cuando la dejás un rato. Es un candado de pantalla: NO cifra lo que está guardado en este dispositivo.
   - Cifrado: AES-256-GCM con una clave que elegís (derivada con PBKDF2). Protege los archivos que van a Drive / OneDrive y las copias que descargás.
   - Recordatorio de copia: si pasaron 15 días desde la última copia o sincronización y hay datos nuevos, la app avisa.
   Todo con Web Crypto del navegador, sin librerías. El resto de la app lo usa por SB.sellar / SB.abrirTexto / SB.copiaHecha (definidos en core.js). */
(function () {
"use strict";
const SB = window.SB; if (!SB) return;
try {
const LS = window.localStorage, A = SB.almacen, {esc} = SB.u;
const SEG = {iter: 250000, iterPin: 150000, reescribir: false};   // las pruebas bajan las vueltas para ir rápido
const DIA = 864e5, AVISO_DIAS = 15, POSPONER_DIAS = 3;
const DOM = () => typeof document !== "undefined" && document && typeof document.createElement === "function" && document.body;
const $ = id => document.getElementById(id);
const subtle = () => (window.crypto && window.crypto.subtle) || null;
const SIN_CRYPTO = "Este navegador no permite cifrar (la app tiene que abrirse desde https).";

/* ---------- ajustes de seguridad de ESTE dispositivo (no se sincronizan): sb_seg = {pin: {sal, h, it, min}, clave, anterior, fallos, hasta} ---------- */
const leerS = () => { try { const v = JSON.parse(LS.getItem("sb_seg")); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } };
const guardarS = s => { try { LS.setItem("sb_seg", JSON.stringify(s)); } catch (e) { throw new Error("No se pudo guardar el ajuste: el almacenamiento está lleno."); } };

/* ---------- cifrado ---------- */
const enc = s => new TextEncoder().encode(String(s)), dec = u => new TextDecoder().decode(u);
const rnd = n => window.crypto.getRandomValues(new Uint8Array(n));
const b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
const deb64 = t => { const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const esSobre = o => !!o && typeof o === "object" && o.app === "second-brain" && o.cifrado === 1;
let CK = {id: "", key: null}, SAL = null;     // la llave derivada se guarda en memoria: derivarla cuesta (a propósito) y la sincronización guarda seguido
async function llave(clave, sal, it) {
  const id = clave + "|" + b64(sal) + "|" + it; if (CK.id === id) return CK.key;
  const base = await subtle().importKey("raw", enc(clave), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle().deriveKey({name: "PBKDF2", salt: sal, iterations: it, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
  CK = {id, key}; return key;
}
async function cifrar(texto, clave) {
  if (!subtle()) throw new Error(SIN_CRYPTO);
  SAL = SAL || rnd(16); const sal = SAL, iv = rnd(12), it = SEG.iter, k = await llave(clave, sal, it);   // sal fija por sesión, iv nuevo en cada guardado
  const ct = new Uint8Array(await subtle().encrypt({name: "AES-GCM", iv}, k, enc(texto)));
  return {app: "second-brain", cifrado: 1, kdf: "PBKDF2-SHA256", it, sal: b64(sal), iv: b64(iv), datos: b64(ct)};
}
async function descifrar(o, clave) {
  if (!esSobre(o) || o.kdf !== "PBKDF2-SHA256" || !(o.it >= 1000 && o.it <= 2e6)) throw new Error("Ese archivo cifrado no se reconoce (¿es de una versión más nueva?).");
  if (!subtle()) throw new Error(SIN_CRYPTO);
  let sal, iv, ct; try { sal = deb64(o.sal); iv = deb64(o.iv); ct = deb64(o.datos); } catch (e) { throw new Error("El archivo cifrado está dañado."); }
  const k = await llave(clave, sal, o.it);
  try { return dec(await subtle().decrypt({name: "AES-GCM", iv}, k, ct)); }
  catch (e) { const x = new Error("Clave incorrecta, o el archivo está dañado."); x.clave = true; throw x; }
}
/* Texto listo para guardar: cifrado si hay clave, igual si no. */
async function sellar(texto) {
  const s = leerS(); let out = texto;
  if (s.clave) out = JSON.stringify(await cifrar(texto, s.clave));
  if (SEG.reescribir) { SEG.reescribir = false; const s2 = leerS(); if (s2.anterior) { delete s2.anterior; guardarS(s2); } }   // ya se escribió con la clave vigente: la anterior no hace falta
  return out;
}
/* Texto plano de un archivo que puede venir cifrado. `pedir`: si hace falta, preguntar la clave (solo cuando la persona tocó algo). */
async function abrir(texto, pedir) {
  let o; try { o = JSON.parse(texto); } catch (e) { return texto; }              // si no es JSON, que lo maneje quien llamó
  if (!esSobre(o)) return texto;
  const s = leerS();
  if (s.clave) { try { return await descifrar(o, s.clave); } catch (e) { if (!e.clave) throw e; } }
  if (s.anterior) { try { const t = await descifrar(o, s.anterior); SEG.reescribir = true; return t; } catch (e) { if (!e.clave) throw e; } }   // clave cambiada o cifrado desactivado: se lee y se reescribe
  if (pedir && typeof window.prompt === "function") {
    for (let i = 0; i < 3; i++) {
      const c = window.prompt(i ? "Esa clave no abre el archivo. Probá otra vez:" : "Este archivo está cifrado. Escribí la clave de cifrado:"); if (!c) break;
      let t; try { t = await descifrar(o, c); } catch (e) { if (!e.clave) throw e; continue; }
      if (!window.confirm(s.clave ? "Esa clave es distinta a la de este dispositivo. ¿Usarla desde ahora también acá?" : "¿Activar el cifrado en este dispositivo con esa clave?")) throw new Error("No se juntó: el archivo está cifrado con una clave que este dispositivo no usa.");
      const s2 = leerS(); s2.clave = c; delete s2.anterior; guardarS(s2); return t;
    }
  }
  throw new Error(s.clave ? "La clave de este dispositivo no abre ese archivo." : "El archivo está cifrado: activá el cifrado con la misma clave en Ajustes → Seguridad.");
}
const claveValida = c => { if (String(c).length < 8) throw new Error("La clave tiene que tener al menos 8 caracteres."); };
async function activarCifrado(c) {
  claveValida(c); if (!subtle()) throw new Error(SIN_CRYPTO);
  await cifrar("prueba", c); const s = leerS(); s.clave = String(c); delete s.anterior; guardarS(s);
}
async function cambiarClave(actual, nueva) {
  const s = leerS(); if (!s.clave) throw new Error("El cifrado no está activo.");
  if (String(actual) !== s.clave) throw new Error("La clave actual no es correcta."); claveValida(nueva);
  await cifrar("prueba", nueva); s.anterior = s.clave; s.clave = String(nueva); guardarS(s);
}
async function quitarCifrado(actual) {
  const s = leerS(); if (!s.clave) throw new Error("El cifrado no está activo.");
  if (String(actual) !== s.clave) throw new Error("La clave no es correcta."); s.anterior = s.clave; delete s.clave; guardarS(s);   // la anterior queda para poder reescribir el archivo vinculado sin cifrar
}

/* ---------- PIN ---------- */
async function hashPin(pin, sal, it) {
  const base = await subtle().importKey("raw", enc(pin), "PBKDF2", false, ["deriveBits"]);
  return b64(new Uint8Array(await subtle().deriveBits({name: "PBKDF2", salt: sal, iterations: it, hash: "SHA-256"}, base, 256)));
}
const igual = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const pinActivo = () => !!leerS().pin;
/* Devuelve {ok} o {ok: false, restan, espera}. Desde el 5º intento fallido hay que esperar (15 s y se duplica, hasta 5 min), incluso con el PIN correcto. */
async function verificarPin(pin) {
  let s = leerS(); if (!s.pin) return {ok: true};
  const ahora = Date.now(); if (s.hasta && ahora < s.hasta) return {ok: false, restan: 0, espera: Math.ceil((s.hasta - ahora) / 1000)};
  const h = await hashPin(String(pin), deb64(s.pin.sal), s.pin.it);
  s = leerS();
  if (igual(h, s.pin.h)) { delete s.fallos; delete s.hasta; guardarS(s); return {ok: true}; }
  s.fallos = (s.fallos || 0) + 1; if (s.fallos >= 5) s.hasta = Date.now() + Math.min(300, 15 * Math.pow(2, s.fallos - 5)) * 1000;
  guardarS(s); return {ok: false, restan: Math.max(0, 5 - s.fallos), espera: s.hasta ? Math.ceil((s.hasta - Date.now()) / 1000) : 0};
}
async function ponerPin(pin) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error("El PIN tiene que tener entre 4 y 8 números.");
  if (!subtle()) throw new Error(SIN_CRYPTO);
  const sal = rnd(16), h = await hashPin(String(pin), sal, SEG.iterPin), s = leerS();
  s.pin = {sal: b64(sal), it: SEG.iterPin, h, min: s.pin && s.pin.min != null ? s.pin.min : 1}; delete s.fallos; delete s.hasta; guardarS(s);
}
async function exigirPin(pin) { const r = await verificarPin(pin); if (!r.ok) throw new Error(r.espera ? "Demasiados intentos: esperá " + r.espera + " segundos." : "El PIN actual no es correcto."); }
async function cambiarPin(actual, nuevo) { await exigirPin(actual); await ponerPin(nuevo); }
async function quitarPin(actual) { await exigirPin(actual); const s = leerS(); delete s.pin; delete s.fallos; delete s.hasta; guardarS(s); }
function minutosBloqueo(m) { const s = leerS(); if (s.pin && [0, 1, 5, 15].includes(m)) { s.pin.min = m; guardarS(s); } }

/* ---------- bloqueo ---------- */
function dibujarBloqueo() {
  if (!DOM()) return; document.body.classList.add("bloq");
  if ($("bloqueo")) return;
  const o = document.createElement("div"); o.id = "bloqueo"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true");
  o.innerHTML = `<form><h2>🔒 Second Brain</h2><p>Escribí tu PIN para entrar.</p><input id="bpin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN"><p id="bmsg" class="sy-err" role="alert"></p><button class="pri" type="submit">Entrar</button><button type="button" class="link" id="bolv">Olvidé mi PIN</button></form>`;
  document.body.appendChild(o);
  const i = $("bpin"), m = $("bmsg");
  o.querySelector("form").onsubmit = async e => {
    e.preventDefault(); const r = await verificarPin(i.value); i.value = ""; if (r.ok) return desbloquear();
    m.textContent = r.espera ? "Demasiados intentos. Esperá " + r.espera + " segundos." : "PIN incorrecto." + (r.restan ? " Te quedan " + r.restan + " intentos antes de una espera." : ""); i.focus();
  };
  $("bolv").onclick = olvidePin; i.focus();
}
function bloquear() { if (!pinActivo()) return false; SB.bloqueado = true; dibujarBloqueo(); return true; }
function desbloquear() {
  SB.bloqueado = false;
  try { if (DOM()) { document.body.classList.remove("bloq", "oc"); const o = $("bloqueo"); if (o) o.remove(); } } catch (e) {}
  try { if (window.__listo) { SB.pintar(); if (SB.mostrarNovedades) SB.mostrarNovedades(); } recordatorio(); } catch (e) {}
}
/* Borra TODO lo de este dispositivo (datos, copias automáticas, ajustes). Lo que esté en Drive / OneDrive o en una copia descargada no se toca. */
async function borrarTodo() {
  A.todas().forEach(k => A.quitar(k)); await A.vaciar();
  try { const ks = []; for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k && /^sb_/.test(k)) ks.push(k); } ks.forEach(k => LS.removeItem(k)); } catch (e) {}
}
async function olvidePin() {
  if (!window.confirm("Si te olvidaste el PIN, la única salida es borrar los datos de este dispositivo. Lo que esté en Drive, OneDrive o en una copia descargada no se toca. ¿Borrar todo y empezar de cero?")) return;
  if (!window.confirm("¿Seguro? Esto no se puede deshacer.")) return;
  await borrarTodo(); location.reload();
}

/* ---------- recordatorio de copia ---------- */
const C = () => { try { const v = JSON.parse(LS.getItem("sb_copia")); return v && typeof v.t === "number" ? v : null; } catch (e) { return null; } };
const guardarC = c => { try { LS.setItem("sb_copia", JSON.stringify(c)); } catch (e) {} };
const huella = () => (SB.sync && SB.sync.hash ? SB.sync.hash(A.usuario()) : "");
const hayDatos = () => Object.keys(A.usuario()).length > 0;
/* Última copia = última vez que se guardó el archivo de sincronización o se descargó una copia. Avisa si pasaron 15 días Y hay datos distintos a los de esa copia. */
function copiaHecha() {
  guardarC({t: Date.now(), h: huella()});
  try { if (DOM()) { const b = $("resg"); if (b) b.remove(); } } catch (e) {}
  try { pintarUI(); } catch (e) {}
}
function debeRecordar(ahora) {
  ahora = ahora || Date.now();
  const c = C(); if (!c) { guardarC({t: ahora, h: ""}); return false; }          // primera vez: la cuenta de los 15 días arranca hoy
  if (c.dormir && ahora < c.dormir) return false;
  if (ahora - c.t < AVISO_DIAS * DIA) return false;
  return hayDatos() && huella() !== c.h;
}
function posponer(ahora) { const c = C(); if (c) { c.dormir = (ahora || Date.now()) + POSPONER_DIAS * DIA; guardarC(c); } }
function recordatorio() {
  try {
    if (SB.bloqueado || !DOM() || $("resg") || !debeRecordar()) return;
    const dias = Math.floor((Date.now() - C().t) / DIA), b = document.createElement("div"); b.id = "resg";
    b.innerHTML = `<span>Hace ${dias} días que no guardás una copia y tenés cambios nuevos.</span><button type="button" data-r="ir">Guardar</button><button type="button" data-r="no">Después</button>`;
    b.onclick = e => { const k = e.target && e.target.dataset && e.target.dataset.r; if (!k) return; if (k === "ir") location.hash = "#/ajustes"; else posponer(); b.remove(); };
    document.body.appendChild(b);
  } catch (e) {}
}

/* ---------- pantalla (Ajustes → Seguridad) ---------- */
const UI = {cont: null, msg: "", err: false};
const msg = (t, err) => { UI.msg = t || ""; UI.err = !!err; pintarUI(); };
function pintarUI() {
  const c = UI.cont; if (!c || !c.isConnected) return;
  const s = leerS(), cc = C(), puede = !!subtle(), min = s.pin && s.pin.min != null ? s.pin.min : 1, hay = !!cc && hayDatos() && huella() !== cc.h;
  const pw = (n, ph, ac) => `<input type="password" name="${n}" placeholder="${ph}" autocomplete="${ac || "off"}" required>`;
  const pn = (n, ph) => `<input type="password" name="${n}" inputmode="numeric" maxlength="8" placeholder="${ph}" autocomplete="off" required>`;
  c.innerHTML = `<section class="card"><h3>🔒 PIN de acceso${s.pin ? " · activo" : ""}</h3>${!puede ? `<p class="sy-err">${esc(SIN_CRYPTO)}</p>` : s.pin ? `
    <p class="ayuda">Se pide al abrir la app y cuando la dejás un rato. Es un candado de pantalla: no cifra lo que está guardado en este dispositivo.</p>
    <div class="fila sy"><div class="tx"><span>Bloquear después de</span></div><select data-c="pin-min" aria-label="Bloquear después de">${[[0, "Al salir de la app"], [1, "1 minuto"], [5, "5 minutos"], [15, "15 minutos"]].map(x => `<option value="${x[0]}"${x[0] === min ? " selected" : ""}>${x[1]}</option>`).join("")}</select></div>
    <div class="fila-b"><button type="button" data-a="pin-bloq">Bloquear ahora</button></div>
    <details><summary>Cambiar o quitar el PIN</summary>
      <form data-f="pin-cambiar">${pn("a", "PIN actual")}${pn("n1", "PIN nuevo (4 a 8 números)")}${pn("n2", "Repetí el PIN nuevo")}<button type="submit">Cambiar PIN</button></form>
      <form data-f="pin-quitar">${pn("a", "PIN actual")}<button type="submit" class="x">Quitar PIN</button></form></details>` : `
    <p class="ayuda">Con un PIN, la app se traba al abrirla y cuando la dejás un rato. Es un candado de pantalla: no cifra lo que está guardado en este dispositivo (eso lo hace la clave de más abajo, para los archivos que salen de acá).</p>
    <form data-f="pin-nuevo">${pn("p1", "PIN (4 a 8 números)")}${pn("p2", "Repetí el PIN")}<button type="submit" class="pri">Activar PIN</button></form>`}</section>
  <section class="card"><h3>🔑 Cifrado de archivos${s.clave ? " · activo" : ""}</h3>${!puede ? `<p class="sy-err">${esc(SIN_CRYPTO)}</p>` : s.clave ? `
    <p class="ayuda">Los archivos de sincronización y las copias que descargás se guardan cifrados (AES-256). En cada dispositivo tenés que poner la misma clave. Si la perdés, esos archivos no se pueden abrir: no hay forma de recuperarla.</p>
    <details><summary>Cambiar o quitar la clave</summary>
      <form data-f="clave-cambiar">${pw("a", "Clave actual")}${pw("n1", "Clave nueva (mínimo 8 caracteres)", "new-password")}${pw("n2", "Repetí la clave nueva", "new-password")}<button type="submit">Cambiar clave</button></form>
      <form data-f="clave-quitar">${pw("a", "Clave actual")}<button type="submit" class="x">Desactivar cifrado</button></form></details>` : `
    <p class="ayuda">Cifra con una clave los archivos que guardás en Drive u OneDrive y las copias que descargás, para que nadie que entre a esas cuentas pueda leer tu diario ni tus notas. Elegí una clave de al menos 8 caracteres y anotala en un lugar seguro: si la perdés, esos archivos no se pueden abrir. La clave queda guardada en este dispositivo para que la sincronización siga siendo automática.</p>
    <form data-f="clave-nueva">${pw("c1", "Clave (mínimo 8 caracteres)", "new-password")}${pw("c2", "Repetí la clave", "new-password")}<button type="submit" class="pri">Activar cifrado</button></form>`}</section>
  <section class="card"><h3>💾 Copias de seguridad</h3><p class="ayuda">${cc && !(cc.h === "" && !hayDatos()) ? "Última copia o sincronización: " + new Date(cc.t).toLocaleDateString("es-AR") + (hay ? " · hay cambios sin guardar." : " · todo guardado.") : "Todavía no guardaste ninguna copia."} Si pasan 15 días y hay cambios nuevos, la app te avisa.</p></section>
  ${UI.msg ? `<p class="${UI.err ? "sy-err" : "sy-ok"}" role="status">${esc(UI.msg)}</p>` : ""}`;
}
SB.secciones.push(cont => {
  UI.cont = cont; pintarUI();
  SB.u.eventos(cont, {
    a: a => { if (a === "pin-bloq") bloquear(); },
    c: (a, n) => { if (a === "pin-min") { try { minutosBloqueo(+n.value); } catch (e) { msg(e.message, true); } } },
    f: async (a, fm) => {
      const v = k => fm.elements[k].value, igualesO = (x, y, que) => { if (v(x) !== v(y)) throw new Error("Los dos " + que + " tienen que ser iguales."); };
      try {
        if (a === "pin-nuevo") { igualesO("p1", "p2", "PIN"); await ponerPin(v("p1")); msg("PIN activado."); }
        else if (a === "pin-cambiar") { igualesO("n1", "n2", "PIN"); await cambiarPin(v("a"), v("n1")); msg("PIN cambiado."); }
        else if (a === "pin-quitar") { await quitarPin(v("a")); msg("PIN quitado."); }
        else if (a === "clave-nueva") { igualesO("c1", "c2", "claves"); await activarCifrado(v("c1")); msg("Cifrado activado. Desde ahora lo que guardes sale cifrado. En tus otros dispositivos activalo con esta misma clave."); }
        else if (a === "clave-cambiar") { igualesO("n1", "n2", "claves"); await cambiarClave(v("a"), v("n1")); msg("Clave cambiada. Tocá Sincronizar (o guardá el archivo de nuevo) para que quede con la clave nueva, y cargala igual en tus otros dispositivos."); }
        else if (a === "clave-quitar") { await quitarCifrado(v("a")); msg("Cifrado desactivado. Lo que guardes desde ahora sale sin cifrar; si tenés un archivo vinculado, tocá Sincronizar para reescribirlo."); }
      } catch (e) { msg(e && e.message ? e.message : "No se pudo.", true); }
    }
  });
});

/* Al arrancar: bloquea al dejar la app un rato, tapa la pantalla mientras está en segundo plano y revisa si toca recordar la copia. */
SB.alArrancar.push(() => {
  if (!DOM()) return;
  let oculto = 0;
  document.addEventListener("visibilitychange", () => {
    const p = leerS().pin; if (!p) return;
    if (document.hidden) { oculto = Date.now(); document.body.classList.add("oc"); return; }   // en la lista de apps recientes no se ve el contenido
    if (oculto && Date.now() - oculto >= (p.min == null ? 1 : p.min) * 60000) bloquear();
    oculto = 0; if (!SB.bloqueado) document.body.classList.remove("oc");
  });
  recordatorio();
});

SB.seg = {sellar, abrir, cifrar, descifrar, esSobre, claveActiva: () => !!leerS().clave, activarCifrado, cambiarClave, quitarCifrado, pinActivo, verificarPin, ponerPin, cambiarPin, quitarPin,
  bloquear, desbloquear, copiaHecha, debeRecordar, posponer, reescribir: () => SEG.reescribir, borrarTodo, config: SEG};
if (pinActivo()) { SB.bloqueado = true; dibujarBloqueo(); }   // lo primero que se ve al abrir es el PIN
} catch (e) { SB.fallos["seguridad.js"] = e.message; }
})();
