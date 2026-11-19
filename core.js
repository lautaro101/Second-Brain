/* Second Brain · núcleo. Registra módulos, guarda sus datos (un espacio y una versión de esquema por módulo) y arma Hoy, Captura, Búsqueda y Ajustes.
   Un módulo nuevo es un archivo en modulos/ que llama a SB.registrar({...}) y una línea en modulos/lista.js. Este archivo no se toca. */
(function () {
"use strict";
const LS = window.localStorage, DATA = {}, $ = id => document.getElementById(id);
const SB = window.SB = {mods: {}, orden: [], fallos: {}, datos: id => DATA[id]};
const pad = n => String(n).padStart(2, "0");
const ymd = d => { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const dt = f => { const [a, m, d] = f.split("-").map(Number); return new Date(a, m - 1, d); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const norm = s => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const eventos = (el, h) => {
  el.onclick = e => { const n = e.target.closest("[data-a]"); if (n && h.a) h.a(n.dataset.a, n, e); };
  el.onchange = e => { const n = e.target.closest("[data-c]"); if (n && h.c) h.c(n.dataset.c, n, e); };
  el.onsubmit = e => { const f = e.target.closest("[data-f]"); if (f) { e.preventDefault(); if (h.f) h.f(f.dataset.f, f, e); } };
};
SB.u = {esc, norm, ymd, eventos, uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  sumar: (f, n) => { const d = dt(f); d.setDate(d.getDate() + n); return ymd(d); },
  dias: (a, b) => Math.round((dt(a) - dt(b)) / 864e5), dmy: f => f.slice(8) + "/" + f.slice(5, 7)};

/* ---------- Almacenamiento ----------
   Los datos (módulos, Inbox, ajustes y copias) viven en memoria (MEM) y se guardan en IndexedDB, que no tiene el tope de ~5 MB de localStorage.
   Si el navegador no ofrece IndexedDB, se guardan en localStorage como antes. Lo chico de arranque (versión vista, novedades pendientes) sigue en localStorage. */
const DATOS = /^sb_(m_|bak_|inbox$|cfg$|copias$|sync$)/, USUARIO = /^sb_(m_|inbox$|cfg$)/;
const MEM = new Map(), SUCIAS = new Set(), BORRADAS = new Set();
let IDB = null, tVaciar = 0, enCurso = Promise.resolve(), avisoLleno = false;
const lleno = () => { if (!avisoLleno) { avisoLleno = true; alert("No se pudo guardar: el almacenamiento del navegador está lleno."); } };
const parsear = s => { try { return JSON.parse(s); } catch (e) { return undefined; } };
const leer = (k, def) => { if (DATOS.test(k)) { const v = MEM.get(k); return v == null ? def : v; } const v = parsear(LS.getItem(k)); return v == null ? def : v; };
const lsPoner = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); return true; } catch (e) { lleno(); return false; } };
const poner = (k, v) => {
  if (!DATOS.test(k)) return lsPoner(k, v);
  MEM.set(k, v);
  if (IDB) { SUCIAS.add(k); BORRADAS.delete(k); clearTimeout(tVaciar); tVaciar = setTimeout(vaciar, 80); return true; }
  return lsPoner(k, v);
};
const quitar = k => {
  if (!DATOS.test(k)) { try { LS.removeItem(k); } catch (e) {} return; }
  MEM.delete(k);
  if (IDB) { SUCIAS.delete(k); BORRADAS.add(k); clearTimeout(tVaciar); tVaciar = setTimeout(vaciar, 80); } else { try { LS.removeItem(k); } catch (e) {} }
};
/* Escribe en IndexedDB todo lo pendiente en una sola transacción. Devuelve una promesa que se cumple cuando terminó. */
function vaciar() {
  clearTimeout(tVaciar);
  if (!IDB || (!SUCIAS.size && !BORRADAS.size)) return enCurso;
  const pon = [...SUCIAS], del = [...BORRADAS]; SUCIAS.clear(); BORRADAS.clear();
  enCurso = enCurso.then(() => new Promise(ok => {
    const falla = () => { pon.forEach(k => SUCIAS.add(k)); lleno(); ok(false); };
    try {
      const t = IDB.transaction("kv", "readwrite"), s = t.objectStore("kv");
      pon.forEach(k => { if (MEM.has(k)) s.put(MEM.get(k), k); }); del.forEach(k => s.delete(k));
      t.oncomplete = () => ok(true); t.onerror = t.onabort = falla;
    } catch (e) { falla(); }
  }));
  return enCurso;
}
const idbAbrir = () => new Promise((ok, no) => {
  if (!window.indexedDB) return no(new Error("este navegador no tiene IndexedDB"));
  const tope = setTimeout(() => no(new Error("IndexedDB no respondió")), 3000);
  try { const r = indexedDB.open("second_brain", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => { clearTimeout(tope); ok(r.result); }; r.onerror = () => { clearTimeout(tope); no(r.error || new Error("no se pudo abrir")); }; r.onblocked = () => { clearTimeout(tope); no(new Error("la base está bloqueada por otra pestaña")); }; }
  catch (e) { clearTimeout(tope); no(e); }
});
const idbTodo = db => new Promise((ok, no) => {
  const m = new Map(), q = db.transaction("kv").objectStore("kv").openCursor();
  q.onsuccess = () => { const c = q.result; if (c) { m.set(c.key, c.value); c.continue(); } else ok(m); }; q.onerror = () => no(q.error);
});
const idbUno = (db, k, v) => new Promise((ok, no) => {
  const t = db.transaction("kv", v === undefined ? "readonly" : "readwrite"), s = t.objectStore("kv"), q = v === undefined ? s.get(k) : s.put(v, k);
  t.oncomplete = () => ok(q.result); t.onerror = t.onabort = () => no(t.error || new Error("no se pudo escribir"));
});
const lsClaves = () => { const a = []; for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k && DATOS.test(k)) a.push(k); } return a; };

/* Copia automática de todos los datos cuando cambia la versión de la app (se guardan las últimas 3). Corre antes de cargar los módulos. */
const guardarCopias = a => { a = a.slice(0, 3);
  if (IDB) poner("sb_copias", a);
  else for (;;) { try { LS.setItem("sb_copias", JSON.stringify(a)); MEM.set("sb_copias", a); break; } catch (e) { if (a.length <= 1) break; a.pop(); } } };
SB.guardarCopias = guardarCopias;
const claveGuardada = () => { try { const s = JSON.parse(LS.getItem("sb_seg")); return !!(s && s.clave); } catch (e) { return false; } };
const copia = motivo => { try {
  const d = {}; MEM.forEach((v, k) => { if (USUARIO.test(k)) d[k] = JSON.parse(JSON.stringify(v)); }); if (!Object.keys(d).length) return;
  let a = leer("sb_copias", []); if (!Array.isArray(a)) a = []; if (a[0] && a[0].d && JSON.stringify(a[0].d) === JSON.stringify(d)) return;
  const it = {t: Date.now(), v: window.APP_VERSION, m: motivo, d};
  if (claveGuardada()) { SB.copiaPend = it; return; }   // con el cifrado activo la copia nunca se escribe en claro: seguridad.js la cifra y recién ahí se guarda
  a.unshift(it); guardarCopias(a);
} catch (e) {} };
/* Si el cifrado está activo pero seguridad.js no cargó, la copia pendiente se guarda igual (en claro) para no perder la red de seguridad de la actualización. */
SB.volcarCopia = () => { try { const it = SB.copiaPend; if (!it) return; SB.copiaPend = null; let a = leer("sb_copias", []); if (!Array.isArray(a)) a = []; a.unshift(it); guardarCopias(a); } catch (e) {} };
function alCambiarVersion() { try { const prev = LS.getItem("sb_ult_version");   // si cambió la versión: copia de los datos y novedades pendientes de mostrar (una sola vez)
  if (prev !== window.APP_VERSION) { copia("al pasar a la versión " + window.APP_VERSION); LS.setItem("sb_ult_version", window.APP_VERSION); LS.setItem("sb_nov_pend", JSON.stringify({de: prev || ""})); } } catch (e) {} }

/* Pasa los datos de localStorage a IndexedDB de a uno (un módulo por vez). Cada uno se vuelve a leer y se compara antes de borrar el original:
   si algo no coincide o falla, ese dato se queda en localStorage (sigue funcionando) y los demás se pasan igual. */
async function migrar(claves, enDB) {
  for (const k of claves) {
    try {
      if (!enDB.has(k)) {
        if (!MEM.has(k)) continue;                                   // ilegible: no se toca
        await idbUno(IDB, k, MEM.get(k));
        if (JSON.stringify(await idbUno(IDB, k)) !== JSON.stringify(MEM.get(k))) throw new Error("la copia no coincide con el original");
      }
      LS.removeItem(k);
    } catch (e) { SB.fallos["migración a IndexedDB de " + k] = e.message; }
  }
  await vaciar();
}
SB.iniciar = function () {
  if (SB.iniciada) return SB.iniciada;
  const claves = lsClaves(), desdeLS = {};
  claves.forEach(k => { const v = parsear(LS.getItem(k)); if (v == null) SB.fallos["lectura de " + k] = "datos ilegibles, no se tocaron"; else desdeLS[k] = v; });
  const sinIDB = () => { Object.keys(desdeLS).forEach(k => { if (!MEM.has(k)) MEM.set(k, desdeLS[k]); }); alCambiarVersion(); };
  if (!window.indexedDB) { sinIDB(); return (SB.iniciada = Promise.resolve()); }
  return (SB.iniciada = idbAbrir().then(db => idbTodo(db).then(enDB => {
    IDB = db; enDB.forEach((v, k) => MEM.set(k, v));                   // lo que ya está en IndexedDB manda
    Object.keys(desdeLS).forEach(k => { if (!MEM.has(k)) MEM.set(k, desdeLS[k]); });
    alCambiarVersion();                                                // la copia se hace ANTES de mover nada
    return migrar(claves, enDB);
  })).catch(e => { IDB = null; SB.fallos["almacenamiento"] = "se usa localStorage: " + e.message; sinIDB(); }));
};
SB.almacen = {leer, poner, quitar, vaciar, usuario: () => { const d = {}; MEM.forEach((v, k) => { if (USUARIO.test(k)) d[k] = v; }); return d; },
  motor: () => IDB ? "indexeddb" : "localstorage",
  todas: () => [...MEM.keys()],
  /* Reemplaza todos los datos del usuario (restaurar copia). Acepta valores ya leídos o como texto (formato de las copias de la 1.0). */
  async reemplazar(d) {
    const nuevo = {}; Object.keys(d || {}).forEach(k => { if (USUARIO.test(k)) { const v = typeof d[k] === "string" ? parsear(d[k]) : d[k]; if (v != null) nuevo[k] = v; } });
    [...MEM.keys()].filter(k => USUARIO.test(k)).forEach(quitar); Object.keys(nuevo).forEach(k => poner(k, nuevo[k])); await vaciar();
  }};
const cfg = () => { const c = leer("sb_cfg", {}); c.off = Array.isArray(c.off) ? c.off : []; return c; };
const seguro = (m, f, ...a) => { try { return typeof m[f] === "function" ? m[f](...a) : undefined; } catch (e) { SB.fallos[m.id + "." + f] = e.message; } };
const activos = () => SB.orden.map(id => SB.mods[id]).filter(m => !cfg().off.includes(m.id));
const vn = v => String(v).split(".").map(Number), mayor = (a, b) => { const x = vn(a), y = vn(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
/* Lista de cambios desde la versión «de» (sin incluirla). Con «de» vacío (primera vez) devuelve solo la versión actual. */
SB.novedades = de => { const h = self.APP_HISTORIAL || []; return de ? h.filter(x => mayor(x[0], de)) : h.slice(); };   // primera vez: todo lo que fue sumando la app; al actualizar: lo publicado desde tu versión
function mostrarNovedades() { try {
  if (SB.bloqueado) return;
  const p = leer("sb_nov_pend", null); if (!p) return; const l = SB.novedades(p.de), primera = !p.de;
  const o = document.createElement("div"); o.id = "nov"; o.setAttribute("role", "dialog");
  o.innerHTML = `<div class="hoja"><h2>${primera ? "¡Bienvenido a Second Brain!" : "Novedades"}</h2>${primera ? `<p>Anotá todo lo que se te ocurra con el botón ＋ y después ordenalo. En <b>Hoy</b> ves qué toca.</p><p>Esto es lo que fue sumando la app hasta hoy (estás en la versión ${esc(self.APP_VERSION)}):</p>` : ""}
    ${l.map(x => `<p><b>Versión ${esc(x[0])}</b><small>${esc(x[1])}</small></p>`).join("")}<button class="pri" type="button">Entendido</button></div>`;
  const cerrar = () => { try { LS.removeItem("sb_nov_pend"); } catch (e) {} document.removeEventListener("keydown", tecla); o.remove(); };
  const tecla = e => { if (e.key === "Escape") cerrar(); };
  o.onclick = e => { if (e.target === o || e.target.tagName === "BUTTON") cerrar(); }; document.addEventListener("keydown", tecla);
  document.body.appendChild(o); o.querySelector("button").focus();
} catch (e) {} }

/* Cada módulo: {id, nombre, icono, esquema, inicial(), migraciones:{N: datos => datos}, pantalla(el, sub), hoy(), buscar(q), avisos(), semana(), captura:{etiqueta, guardar(texto)}}
   migraciones[N] lleva los datos de la versión N-1 a la N. Si algo falla, solo ese módulo queda afuera. */
const migrarDatos = (m, v, d) => { for (let n = (v || 0) + 1; n <= m.esquema; n++) { const f = (m.migraciones || {})[n]; if (f) d = f(d) || d; } return d; };
SB.migrarDatos = migrarDatos;
SB.registrar = function (m) {
  try {
    if (!m || !m.id || !m.nombre || !m.esquema || typeof m.pantalla !== "function" || typeof m.inicial !== "function") throw new Error("definición incompleta");
    if (SB.mods[m.id]) throw new Error("id repetido");
    const raw = leer("sb_m_" + m.id, null);
    if (!raw || typeof raw !== "object" || !("d" in raw)) DATA[m.id] = m.inicial();
    else {
      if ((raw.v || 0) > m.esquema) throw new Error("sus datos son de una versión más nueva de la app");
      let d = raw.d;
      if (raw.v !== m.esquema) { poner("sb_bak_" + m.id, raw); d = migrarDatos(m, raw.v, d); }
      DATA[m.id] = d;
      if (raw.v !== m.esquema) poner("sb_m_" + m.id, {v: m.esquema, d});
    }
    SB.mods[m.id] = m; SB.orden.push(m.id);
  } catch (e) { SB.fallos[(m && m.id) || "módulo sin id"] = e.message; delete DATA[m && m.id]; }
};
/* Quien quiera enterarse de que algo se guardó (la sincronización) se suma a SB.alGuardar. «silencioso» sirve para guardar lo que llegó de otro dispositivo sin volver a avisar. */
SB.alGuardar = []; SB.alArrancar = []; SB.alCambio = []; SB.secciones = [];   // alCambio: se entera de TODO guardado, también de lo que llega de otro dispositivo (silencioso)
/* Cifrado y copias (los hace seguridad.js). Si hay una clave guardada y seguridad.js no cargó, NO se guarda sin cifrar. */
SB.mostrarNovedades = () => mostrarNovedades();
SB.sellar = t => { if (SB.seg) return SB.seg.sellar(t); try { const s = JSON.parse(localStorage.getItem("sb_seg")); if (s && s.clave) return Promise.reject(new Error("El cifrado no pudo cargar, así que no se guarda sin cifrar.")); } catch (e) {} return Promise.resolve(t); };
SB.abrirTexto = (t, pedir) => SB.seg ? SB.seg.abrir(t, pedir) : Promise.resolve(t);
SB.copiaHecha = () => { if (SB.seg) SB.seg.copiaHecha(); };
const avisarGuardado = id => SB.alGuardar.forEach(f => { try { f(id); } catch (e) {} });
let tAv; SB.guardar = (id, silencioso) => {
  const m = SB.mods[id]; if (!m) return; poner("sb_m_" + id, {v: m.esquema, d: DATA[id]});
  SB.alCambio.forEach(f => { try { f(id, !!silencioso); } catch (e) {} });
  if (!silencioso) avisarGuardado(id);
  clearTimeout(tAv); tAv = setTimeout(enviarAvisos, 1500);
};
SB.reemplazar = (id, d) => { if (!SB.mods[id]) return; DATA[id] = d; SB.guardar(id, true); };
SB.pintar = () => pintar();
SB.aviso = t => { const a = $("aviso"); a.textContent = t; a.hidden = false; clearTimeout(SB.aviso.t); SB.aviso.t = setTimeout(() => { a.hidden = true; }, 1800); };

/* ---------- Inbox y captura ---------- */
const inbox = () => leer("sb_inbox", []);
const ponerInbox = (a, silencioso) => { const r = poner("sb_inbox", a); if (!silencioso) avisarGuardado("inbox"); return r; };
SB.inbox = {leer: () => inbox(), poner: ponerInbox};
const destinos = () => activos().filter(m => m.captura && typeof m.captura.guardar === "function");
function abrirCaptura() {
  const s = $("sheet"), d = destinos(); s.hidden = false;
  s.innerHTML = `<div class="hoja"><form data-f="cap"><textarea name="t" rows="3" placeholder="¿Qué se te ocurrió? Con #etiqueta se ordena solo"></textarea>
    <div class="fila-b"><button class="pri" type="submit">${SB.reglas.auto() ? "Guardar y ordenar" : "Guardar en Inbox"}</button>${d.map(m => `<button type="button" data-a="dest" data-id="${esc(m.id)}">${m.icono} ${esc(m.captura.etiqueta)}</button>`).join("")}</div>
    <button type="button" class="link" data-a="cerrar">Cancelar</button></form></div>`;
  const cerrar = () => { s.hidden = true; s.innerHTML = ""; };
  const texto = () => s.querySelector("textarea").value.trim();
  const mover = n => { const t = texto(); if (!t) return; const m = SB.mods[n.dataset.id];
    try { m.captura.guardar(t); } catch (x) { SB.fallos[m.id + ".captura"] = x.message; return; }
    cerrar(); SB.aviso("Guardado en " + m.captura.etiqueta); pintar(); };
  eventos(s, {
    a: (a, n) => { if (a === "cerrar") cerrar(); else if (a === "dest") mover(n); },
    f: () => { const t = texto(); if (!t) return; const m = SB.reglas.auto() ? rutear(t) : null;
      if (m) { cerrar(); SB.aviso("Ordenado solo → " + m.icono + " " + m.captura.etiqueta); pintar(); return; }
      const l = inbox(); l.unshift({id: SB.u.uid(), t, f: Date.now()}); ponerInbox(l); cerrar(); SB.aviso("Anotado en el Inbox"); pintar(); }
  });
  const base = s.onclick; s.onclick = e => { if (e.target === s) cerrar(); else base(e); };
  s.querySelector("textarea").onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") s.querySelector("form").requestSubmit(); };
  s.querySelector("textarea").focus();
}


/* ---------- Reglas del Inbox: lo que escribís se ordena solo ----------
   Una regla: {id, tipo: "e" empieza con | "c" contiene, p: palabras separadas por coma, d: id del módulo destino}. Gana la primera que coincide; las nuevas van arriba.
   Se comparan sin mayúsculas ni tildes y por palabra entera ("comprar" no atrapa "comprarme"). Las reglas se guardan en este dispositivo (como los módulos activos). */
const REGLAS_BASE = [
  {id: "b1", tipo: "e", p: "comprar, pagar, llamar, entregar, renovar, arreglar, sacar turno, recordar", d: "tareas"},
  {id: "b2", tipo: "e", p: "idea", d: "notas"}, {id: "b3", tipo: "c", p: "#idea, #nota", d: "notas"},
  {id: "b4", tipo: "e", p: "hoy me, hoy fue, hoy aprendí, me sentí", d: "diario"}, {id: "b5", tipo: "c", p: "#diario", d: "diario"},
  {id: "b6", tipo: "e", p: "gasto, gasté, ingreso, cobré", d: "finanzas"}
];
const reglas = () => { const c = cfg(); return Array.isArray(c.reglas) ? c.reglas : REGLAS_BASE.map(r => ({...r})); };
const guardarReglas = r => { const c = cfg(); c.reglas = r; poner("sb_cfg", c); };
const coincide = (t, tipo, p) => { if (!p) return false; const q = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp((tipo === "e" ? "^" : "(^|[^a-z0-9])") + q + "($|[^a-z0-9])").test(t); };
const reglaPara = texto => { const t = norm(texto).trim(), off = cfg().off;
  return reglas().find(r => { const m = SB.mods[r.d]; return m && m.captura && !off.includes(r.d) && String(r.p).split(",").some(p => coincide(t, r.tipo, norm(p).trim())); }) || null; };
const rutear = texto => { const r = reglaPara(texto), m = r && SB.mods[r.d]; if (!m) return null;
  try { m.captura.guardar(texto); return m; } catch (e) { SB.fallos[m.id + ".captura"] = e.message; return null; } };
const ordenarInbox = () => { const resto = []; let n = 0; inbox().slice().forEach(x => { if (rutear(x.t)) n++; else resto.push(x); }); if (n) ponerInbox(resto); return n; };
SB.reglas = {regla: reglaPara, rutear, ordenar: ordenarInbox, lista: reglas, auto: () => cfg().auto !== false};
const reglasHtml = () => { const rs = reglas(), d = destinos(), off = cfg().off;
  return `<section class="card"><h3>${ic("🪄")}Ordenar solo</h3><label class="fila"><input type="checkbox" data-c="auto"${cfg().auto === false ? "" : " checked"}><span class="tx">Ordenar al capturar<small>Si lo que escribís coincide con una regla, va directo a su módulo</small></span></label>
    ${rs.map(r => { const m = SB.mods[r.d]; return `<div class="fila"><span class="tx">${r.tipo === "e" ? "Empieza con" : "Contiene"} «${esc(r.p)}»<small>→ ${m ? m.icono + " " + esc(m.captura ? m.captura.etiqueta : m.nombre) + (off.includes(r.d) ? " (módulo apagado)" : "") : "módulo no disponible"}</small></span><button class="x" data-a="r-del" data-id="${esc(r.id)}" aria-label="Borrar regla">✕</button></div>`; }).join("")}
    <form data-f="regla"><div class="fila-b"><select name="tipo" aria-label="Tipo de regla"><option value="e">Empieza con</option><option value="c">Contiene</option></select><select name="d" aria-label="Destino">${d.map(m => `<option value="${esc(m.id)}">${m.icono} ${esc(m.captura.etiqueta)}</option>`).join("")}</select></div>
      <input name="p" placeholder="Palabras, separadas por coma (ej: comprar, pagar)" required autocomplete="off"><button class="pri">Agregar regla</button></form>
    <div class="fila-b"><button data-a="r-base">Volver a las reglas básicas</button></div></section>`; };

/* ---------- Buscador rápido (Ctrl+K): busca en todo y también sirve para ir a un módulo ---------- */
function abrirBuscador() {
  if (SB.bloqueado || $("kbar")) return;
  const o = document.createElement("div"); o.id = "kbar"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Buscar en todo");
  o.innerHTML = `<div class="kb"><input type="search" id="kq" placeholder="Buscar o ir a…" autocomplete="off" aria-label="Buscar o ir a"><div id="kr"></div><p class="kp"><kbd>↑</kbd> <kbd>↓</kbd> moverte · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> cerrar</p></div>`;
  document.body.appendChild(o);
  const q = o.querySelector("input"), r = o.querySelector("#kr"); let fs = [], sel = 0;
  const cerrar = () => { document.removeEventListener("keydown", tecla, true); o.remove(); };
  const abrir = f => { if (!f) return; cerrar(); if (location.hash === f.ir) pintar(); else location.hash = f.ir; };
  const lista = () => { const t = q.value.trim(), nt = norm(t), out = [];
    if (t.length >= 2) {
      inbox().filter(x => norm(x.t).includes(nt)).slice(0, 4).forEach(x => out.push({ir: "#/inbox", t: x.t, s: "Inbox", i: "📥"}));
      activos().forEach(m => { const rs = seguro(m, "buscar", t); if (Array.isArray(rs)) rs.slice(0, 5).forEach(x => out.push({ir: x.ir || "#/" + m.id, t: x.t, s: x.s ? m.nombre + " · " + x.s : m.nombre, i: m.icono})); });
    }
    [["#/hoy", "🏠", "Hoy"], ["#/mas", "▦", "Módulos"], ["#/inbox", "📥", "Inbox"], ["#/semana", "🗓️", "Revisión semanal"], ["#/ajustes", "⚙️", "Ajustes"]].concat(activos().map(m => ["#/" + m.id, m.icono, m.nombre]))
      .filter(n => !nt || norm(n[2]).includes(nt)).slice(0, nt ? 4 : 14).forEach(n => out.push({ir: n[0], t: n[2], s: "Ir a", i: n[1]}));
    return out.slice(0, 24); };
  const pintarL = () => { fs = lista(); sel = Math.min(sel, Math.max(0, fs.length - 1));
    r.innerHTML = fs.length ? fs.map((f, i) => `<a class="kf${i === sel ? " on" : ""}" href="${esc(f.ir)}" data-i="${i}"><span class="ic">${esc(f.i)}</span><span class="tx"><b>${esc(f.t)}</b><small>${esc(f.s)}</small></span></a>`).join("") : `<p class="vacio">Sin resultados.</p>`; };
  const mover = d => { if (!fs.length) return; sel = (sel + d + fs.length) % fs.length; pintarL(); const a = r.querySelector(".on"); if (a && a.scrollIntoView) a.scrollIntoView({block: "nearest"}); };
  const tecla = e => { if (e.key === "Escape") { e.preventDefault(); cerrar(); } else if (e.key === "ArrowDown") { e.preventDefault(); mover(1); } else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); } else if (e.key === "Enter") { e.preventDefault(); abrir(fs[sel]); } };
  document.addEventListener("keydown", tecla, true);
  q.oninput = () => { sel = 0; pintarL(); };
  r.onclick = e => { const a = e.target.closest("[data-i]"); if (a) { e.preventDefault(); abrir(fs[+a.dataset.i]); } };
  o.onclick = e => { if (e.target === o) cerrar(); };
  pintarL(); q.focus();
}
SB.buscador = abrirBuscador;

/* ---------- Apariencia (tema y tamaño de letra; se guarda solo en este dispositivo) ---------- */
const ic = i => `<span class="ic">${i}</span>`;
const ui = () => { try { const u = JSON.parse(localStorage.getItem("sb_ui") || "{}"); return {tema: u.tema === "claro" || u.tema === "oscuro" ? u.tema : "auto", letra: u.letra === 1 || u.letra === 2 ? u.letra : 0}; } catch (e) { return {tema: "auto", letra: 0}; } };
function aplicarUI() { try {
  const u = ui(), h = document.documentElement;
  if (u.tema === "auto") h.removeAttribute("data-tema"); else h.setAttribute("data-tema", u.tema);
  if (u.letra) h.setAttribute("data-letra", u.letra); else h.removeAttribute("data-letra");
  const osc = u.tema === "oscuro" || (u.tema === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme:dark)").matches), m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", osc ? "#0f161d" : "#eef1ea");
} catch (e) {} }
SB.ui = {leer: ui, poner: o => { try { localStorage.setItem("sb_ui", JSON.stringify(Object.assign(ui(), o))); } catch (e) {} aplicarUI(); }};
const segHtml = (a, vals, act) => `<div class="seg" role="group">${vals.map(([v, t]) => `<button type="button" data-a="${a}" data-v="${v}" aria-pressed="${String(v) === String(act)}">${t}</button>`).join("")}</div>`;
const apariencia = () => { const u = ui();
  return `<section class="card"><h3>${ic("🎨")}Apariencia</h3><p class="sub">Tema</p>${segHtml("tema", [["auto", "Automático"], ["claro", "Claro"], ["oscuro", "Oscuro"]], u.tema)}<p class="sub">Tamaño de letra</p>${segHtml("letra", [[0, "Normal"], [1, "Grande"], [2, "Muy grande"]], u.letra)}<small>Se guarda solo en este dispositivo.</small></section>`; };

/* ---------- Pantallas del núcleo ---------- */
let HOYITEMS = [];
const hoyFila = (x, i) => `<div class="fila">${x.tocar ? `<button class="chk${x.hecho ? " on" : ""}" data-a="tocar" data-i="${i}" aria-label="Marcar">${x.hecho ? "✓" : ""}</button>` : ""}
  <div class="tx${x.hecho ? " hecha" : ""}"${x.ir ? ` data-a="ir" data-i="${i}"` : ""}><span>${esc(x.t)}</span>${x.s ? `<small>${esc(x.s)}</small>` : ""}</div></div>`;
function pHoy(el) {
  const f = new Date(), fecha = f.toLocaleDateString("es-AR", {weekday: "long", day: "numeric", month: "long"}), inb = inbox();
  HOYITEMS = []; let h = "", hay = false;
  if (inb.length) { hay = true; h += `<a class="card enlace" href="#/inbox"><b>📥 Inbox</b><small>${inb.length} sin ordenar</small></a>`; }
  if (f.getDay() === 0) { hay = true; h += `<a class="card enlace" href="#/semana"><b>🗓️ Revisión semanal</b><small>Hoy toca mirar cómo te fue</small></a>`; }
  activos().forEach(m => {
    const it = seguro(m, "hoy"); if (!Array.isArray(it) || !it.length) return; hay = true;
    h += `<section class="card"><h3>${ic(m.icono)}${esc(m.nombre)}</h3>${it.map(x => { HOYITEMS.push(x); return hoyFila(x, HOYITEMS.length - 1); }).join("")}</section>`;
  });
  if (!hay) h += `<p class="vacio">No hay nada pendiente para hoy. Anotá algo con el botón ＋.</p>`;
  const hr = f.getHours(), sal = hr < 6 ? "Buenas noches" : hr < 13 ? "Buen día" : hr < 20 ? "Buenas tardes" : "Buenas noches";
  const tot = HOYITEMS.filter(x => x.tocar).length, ok = HOYITEMS.filter(x => x.tocar && x.hecho).length, falta = tot - ok;
  const hero = `<section class="hero${tot ? "" : " libre"}"><p class="sal">${sal}</p><h2>${esc(fecha)}</h2>`
    + (tot ? `<div class="num"><b>${falta}</b><span>${falta === 1 ? "cosa por hacer hoy" : falta ? "cosas por hacer hoy" : "todo hecho por hoy"}</span></div><div class="split" role="progressbar" aria-valuemin="0" aria-valuemax="${tot}" aria-valuenow="${ok}"><i style="width:${Math.round(ok / tot * 100)}%"></i></div><p class="pie"><span>${ok} de ${tot} hechas</span>${inb.length ? `<span>📥 ${inb.length} en el Inbox</span>` : ""}</p>`
      : `<div class="num"><b>${hay ? "Tranqui" : "Día libre"}</b></div>${inb.length ? `<p class="pie"><span>📥 ${inb.length} en el Inbox</span></p>` : ""}`) + `</section>`;
  el.innerHTML = hero + h;
  eventos(el, {a: (a, n) => { const x = HOYITEMS[+n.dataset.i]; if (!x) return; if (a === "ir") location.hash = x.ir; else { try { x.tocar(); } catch (e) { SB.fallos.hoy = e.message; } pintar(); } }});
}
function pInbox(el) {
  const inb = inbox(), d = destinos();
  el.innerHTML = (inb.length ? `<div class="fila-b"><button data-a="r-ordenar">🪄 Ordenar con las reglas</button></div>` + inb.map(x => `<div class="card"><p class="tx">${esc(x.t)}</p><div class="fila-b">${d.map(m => `<button data-a="mover" data-id="${esc(x.id)}" data-m="${esc(m.id)}">${m.icono} ${esc(m.captura.etiqueta)}</button>`).join("")}<button class="x" data-a="del" data-id="${esc(x.id)}">Borrar</button></div></div>`).join("") : `<p class="vacio">Inbox vacío 🎉</p>`) + reglasHtml();
  eventos(el, {
    c: (a, n) => { if (a === "auto") { const k = cfg(); k.auto = n.checked; poner("sb_cfg", k); } },
    f: (a, f) => { const p = f.p.value.trim(); if (!p || !f.d.value) return; const r = reglas().slice(); r.unshift({id: SB.u.uid(), tipo: f.tipo.value === "c" ? "c" : "e", p, d: f.d.value}); guardarReglas(r); pintar(); },
    a: (a, n) => {
      if (a === "r-ordenar") { const k = ordenarInbox(); SB.aviso(k ? (k === 1 ? "1 cosa ordenada" : k + " cosas ordenadas") : "Ninguna coincidió con las reglas"); return pintar(); }
      if (a === "r-del") { guardarReglas(reglas().filter(r => r.id !== n.dataset.id)); return pintar(); }
      if (a === "r-base") { if (confirm("¿Volver a las reglas básicas? Se pierden las que agregaste.")) { const k = cfg(); delete k.reglas; poner("sb_cfg", k); } return pintar(); }
      const l = inbox(), i = l.findIndex(x => x.id === n.dataset.id); if (i < 0) return;
      if (a === "mover") { const m = SB.mods[n.dataset.m]; try { m.captura.guardar(l[i].t); } catch (e) { SB.fallos[m.id + ".captura"] = e.message; return; } }
      l.splice(i, 1); ponerInbox(l); pintar();
    }
  });
}
function pBuscar(el) {
  el.innerHTML = `<input type="search" id="q" placeholder="Buscar en todo…" autocomplete="off"><div id="res"></div>`;
  const q = $("q"), res = $("res");
  const llenar = () => { const t = q.value.trim(); if (t.length < 2) { res.innerHTML = `<p class="vacio">Escribí al menos 2 letras.</p>`; return; }
    let h = ""; const inb = inbox().filter(x => norm(x.t).includes(norm(t)));
    if (inb.length) h += `<section class="card"><h3>${ic("📥")}Inbox</h3>${inb.map(x => `<a class="item" href="#/inbox">${esc(x.t)}</a>`).join("")}</section>`;
    activos().forEach(m => { const r = seguro(m, "buscar", t); if (Array.isArray(r) && r.length) h += `<section class="card"><h3>${ic(m.icono)}${esc(m.nombre)}</h3>${r.slice(0, 15).map(x => `<a class="item" href="${esc(x.ir || "#/" + m.id)}"><b>${esc(x.t)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ""}</a>`).join("")}</section>`; });
    res.innerHTML = h || `<p class="vacio">Sin resultados.</p>`; };
  q.oninput = llenar; llenar(); if (window.matchMedia("(min-width:900px)").matches) q.focus();
}
function pMas(el) {
  const n = inbox().length;
  el.innerHTML = `<div class="grilla">${activos().map(m => `<a class="mod" href="#/${esc(m.id)}"><i>${m.icono}</i>${esc(m.nombre)}</a>`).join("")}<a class="mod" href="#/inbox"><i>📥</i>Inbox${n ? " (" + n + ")" : ""}</a><a class="mod" href="#/semana"><i>🗓️</i>Revisión semanal</a></div>${SB.orden.length > activos().length ? `<p class="ayuda">Hay ${SB.orden.length - activos().length} ${SB.orden.length - activos().length === 1 ? "módulo apagado" : "módulos apagados"} en este dispositivo. Prendelos en <a href="#/ajustes">Ajustes → Módulos activos</a>.</p>` : ""}`;
}
function pSemana(el) {
  let h = ""; const n = inbox().length;
  activos().forEach(m => { const r = seguro(m, "semana"); if (Array.isArray(r) && r.length) h += `<section class="card"><h3>${ic(m.icono)}${esc(m.nombre)}</h3>${r.map(x => `<p>${esc(x)}</p>`).join("")}</section>`; });
  el.innerHTML = `<section class="card"><h3>${ic("📥")}Inbox</h3><p>${n ? n + " cosas sin ordenar: ordenalas antes de arrancar la semana." : "Inbox vacío."}</p></section>${h}`;
}
function enviarAvisos() { try {
  const ev = []; activos().forEach(m => { const a = seguro(m, "avisos"); if (Array.isArray(a)) ev.push(...a); });
  const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({tipo: "avisos", eventos: ev});
} catch (e) {} }
function pAjustes(el) {
  const c = cfg(), fal = Object.keys(SB.fallos), cps = leer("sb_copias", []);
  el.innerHTML = apariencia() + `<section class="card"><h3>Módulos activos</h3>${SB.orden.map(id => { const m = SB.mods[id]; return `<label class="fila"><input type="checkbox" data-c="mod" data-id="${esc(id)}" ${c.off.includes(id) ? "" : "checked"}><span class="tx">${m.icono} ${esc(m.nombre)}<small>esquema de datos v${m.esquema}</small></span></label>`; }).join("")}</section>
  ${fal.length ? `<section class="card aviso-f"><h3>Con problemas</h3>${fal.map(k => `<p>${esc(k)}: ${esc(SB.fallos[k])}</p>`).join("")}<small>Los demás módulos siguen funcionando.</small></section>` : ""}
  <section class="card"><h3>Avisos</h3><div class="fila-b"><button data-a="avisos">Activar avisos</button><button data-a="prueba">Probar</button></div></section>
  <div id="ext"></div>
  <section class="card"><h3>Copia de seguridad</h3><div class="fila-b"><button data-a="exportar">Descargar copia</button><label class="btn">Restaurar de archivo<input type="file" accept="application/json" hidden data-c="importar"></label></div>
  ${cps.length ? `<small>Copias automáticas (al actualizar): ${cps.map((x, i) => `<a href="#" data-a="restaurar" data-i="${i}">v${esc(x.v)} · ${new Date(x.t).toLocaleDateString("es-AR")}${x.c ? " 🔒" : ""}</a>`).join(" · ")}</small>` : ""}</section>
  <section class="card"><h3>Espacio</h3><p class="ayuda" id="espacio">Calculando…</p></section>
  <section class="card"><h3>Atajos en PC</h3><p><b>N</b> capturar · <b>Ctrl+K</b> buscar o ir a cualquier lado · <b>/</b> buscar · <b>H</b> Hoy · <b>Esc</b> cerrar · <b>Ctrl+Enter</b> guardar en el Inbox</p></section>
  <section class="card"><h3>Para después</h3>${(self.SB_PARA_DESPUES || []).map(x => `<p><b>${esc(x[0])}</b> <small>${esc(x[1])}</small></p>`).join("")}</section>
  <section class="card"><h3>Versión ${esc(window.APP_VERSION)}</h3><div class="fila-b"><button data-a="buscarUpd">Buscar actualizaciones</button></div><small id="ultUpd">${leer("sb_ub", 0) ? "Última búsqueda: " + new Date(leer("sb_ub", 0)).toLocaleString("es-AR") : "Todavía no buscó actualizaciones"}</small>${(self.APP_HISTORIAL || []).map(x => `<p><b>${esc(x[0])}</b> <small>${esc(x[1])}</small></p>`).join("")}</section>`;
  const ext = $("ext"); SB.secciones.forEach(f => { try { const d = document.createElement("div"); ext.appendChild(d); f(d); } catch (e) { SB.fallos["ajustes"] = e.message; } });
  const mb = n => (n / 1048576).toFixed(n < 1048576 * 10 ? 1 : 0).replace(".", ",") + " MB";
  try { const st = navigator.storage; if (st && st.estimate) st.estimate().then(e => { const x = $("espacio"); if (x) x.textContent = "Ocupás " + mb(e.usage || 0) + " de unos " + mb(e.quota || 0) + " disponibles. " + (SB.almacen.motor() === "indexeddb" ? "Tus datos se guardan en IndexedDB." : "Este navegador solo permite localStorage (unos 5 MB)."); }).catch(() => {}); else $("espacio").textContent = SB.almacen.motor() === "indexeddb" ? "Tus datos se guardan en IndexedDB." : "Tus datos se guardan en localStorage (unos 5 MB)."; } catch (e) {}
  const restaurar = d => SB.almacen.reemplazar(d).then(() => location.reload()).catch(() => alert("No se pudo restaurar."));
  eventos(el, {
    c: (a, n, e) => { if (a === "mod") { const k = cfg(); k.off = k.off.filter(x => x !== n.dataset.id); if (!n.checked) k.off.push(n.dataset.id); poner("sb_cfg", k); pintar(); }
      if (a === "importar" && n.files[0]) { const r = new FileReader(); r.onload = async () => { try { let d; try { d = JSON.parse(await SB.abrirTexto(r.result, true)); } catch (x) { if (x instanceof SyntaxError) d = null; else throw x; } if (!d || !d.sb) throw new Error("Ese archivo no es una copia de Second Brain."); if (confirm("Se reemplazan los datos de este dispositivo por los del archivo. ¿Seguro?")) restaurar(d.sb); } catch (x) { alert(x && x.message ? x.message : "Ese archivo no es una copia de Second Brain."); } }; r.readAsText(n.files[0]); } },
    a: (a, n, e) => { if (a === "tema" || a === "letra") { SB.ui.poner({[a]: a === "tema" ? n.dataset.v : +n.dataset.v}); return pintar(); }
      if (a === "restaurar") { e.preventDefault(); const x = cps[+n.dataset.i]; if (x && confirm("Volver a los datos del " + new Date(x.t).toLocaleDateString("es-AR") + "?")) (x.c ? SB.abrirTexto(JSON.stringify(x.c), true).then(t => { const d = JSON.parse(t); if (d && d.cifrado === 1) throw new Error("El cifrado no pudo cargar, así que no se puede abrir esta copia."); return d; }) : Promise.resolve(x.d)).then(restaurar).catch(err => alert(err && err.message ? err.message : "No se pudo abrir la copia.")); }
      if (a === "exportar") { SB.sellar(JSON.stringify({app: "second-brain", v: window.APP_VERSION, sb: SB.almacen.usuario()})).then(t => { const b = new Blob([t], {type: "application/json"}), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = "second-brain-" + ymd() + ".json"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); SB.copiaHecha(); }).catch(x => alert("No se pudo guardar la copia: " + x.message)); }
      if (a === "avisos") { if (!window.Notification) return alert("Este navegador no permite avisos."); Notification.requestPermission().then(p => { SB.aviso(p === "granted" ? "Avisos activados" : "Los avisos quedaron bloqueados");
        if (p === "granted") navigator.serviceWorker.ready.then(r => r.periodicSync && r.periodicSync.register("avisos", {minInterval: 864e5})).catch(() => {}).then(enviarAvisos); }); }
      if (a === "buscarUpd") { const m = $("ultUpd"), sw = navigator.serviceWorker; if (!sw) { m.textContent = "Este navegador no permite actualizar desde la web."; return; } m.textContent = "Buscando…";
        sw.getRegistration().then(r => r ? r.update().then(() => new Promise(ok => setTimeout(ok, 1500))).then(() => { poner("sb_ub", Date.now()); m.textContent = r.waiting || r.installing ? "Hay una versión nueva: tocá «Actualizar» arriba." : "Ya tenés la última versión (" + window.APP_VERSION + ")."; }) : (m.textContent = "La app todavía no está instalada para usar sin conexión.")).catch(e => { m.textContent = (navigator.onLine === false ? "Sin conexión. " : "No se pudo buscar la actualización. ") + "Motivo: " + ((e && (e.name ? e.name + ": " : "") + (e.message || "")) || "desconocido") + "."; }); }
      if (a === "prueba") { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({tipo: "prueba"}); } }
  });
}

/* ---------- Router ---------- */
const PANT = {hoy: pHoy, inbox: pInbox, buscar: pBuscar, mas: pMas, semana: pSemana, ajustes: pAjustes};
const TIT = {hoy: ["🏠", "Hoy"], inbox: ["📥", "Inbox"], buscar: ["🔍", "Buscar"], mas: ["▦", "Módulos"], semana: ["🗓️", "Revisión semanal"], ajustes: ["⚙️", "Ajustes"]};
function ruta() { const m = /^#\/([^\/]+)(?:\/(.*))?$/.exec(location.hash); return {id: m ? m[1] : "hoy", sub: m && m[2] ? decodeURIComponent(m[2]) : ""}; }
/* Una sola vez (1.25.0): deja prendidos Lectura y Objetivos aunque hayan quedado apagados en este dispositivo. Después manda lo que elijas en Ajustes → Módulos activos. */
const activarUnaVez = () => { const k = cfg(); if (k.a125) return false; k.off = k.off.filter(x => x !== "lectura" && x !== "objetivos"); k.a125 = 1; poner("sb_cfg", k); return true; };
SB.activarUnaVez = activarUnaVez;
function pintar() {
  if (SB.bloqueado) return;
  activarUnaVez();   // con el PIN puesto no se dibuja nada hasta desbloquear
  const r = ruta(), app = $("app"), m = SB.mods[r.id] && !cfg().off.includes(r.id) ? SB.mods[r.id] : null, f = PANT[r.id] || (m && ((el, s) => m.pantalla(el, s)));
  if (!f) { location.hash = "#/hoy"; return; }
  const tt = m ? [m.icono, m.nombre] : TIT[r.id];
  $("top").innerHTML = `<span class="ic">${esc(tt[0])}</span><span class="tt">${esc(tt[1])}</span>`;
  document.querySelectorAll("#nav [data-n]").forEach(a => a.classList.toggle("on", a.dataset.n === (PANT[r.id] ? r.id : "mas")));
  if (app.dataset.r !== r.id + "/" + r.sub) { app.classList.add("nueva"); clearTimeout(pintar.t); pintar.t = setTimeout(() => app.classList.remove("nueva"), 600); }   // la animación de entrada solo cuando cambiás de pantalla
  app.dataset.r = r.id + "/" + r.sub;
  app.dataset.p = PANT[r.id] ? r.id : "mod"; app.onclick = app.onchange = app.onsubmit = null;
  try { f(app, r.sub); } catch (e) { SB.fallos[r.id] = e.message; app.innerHTML = `<div class="card aviso-f"><b>Este apartado falló:</b> ${esc(e.message)}<br><small>Los demás siguen andando.</small></div>`; }
  window.scrollTo(0, 0);
}
SB.arrancar = function () {
  aplicarUI();
  if (SB.copiaPend && !SB.seg) SB.volcarCopia();
  try { const s = JSON.parse(localStorage.getItem("sb_seg")); if (!SB.seg && s && s.pin) { SB.bloqueado = true; $("app").textContent = "El bloqueo con PIN no pudo cargar, así que por seguridad la app no se abre. Recargá la página."; } } catch (e) {}   // si falla el bloqueo, falla cerrado
  const I = {hoy: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>', mas: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>', buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'};
  const ni = k => `<span class="ni"><svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg></span>`;
  const marca = `<div class="marca"><svg viewBox="110 120 292 308" aria-hidden="true"><g stroke="#1c3556" stroke-width="14" stroke-linecap="round"><path d="M256 158 148 266M256 158l108 108M148 266h216M148 266l108 108M364 266 256 374M148 266l12 128M364 266l-12 128M160 394l96-20M256 374l96 20"/></g><g fill="#2a7a5c"><circle cx="148" cy="266" r="24"/><circle cx="364" cy="266" r="24"/><circle cx="256" cy="374" r="24"/><circle cx="160" cy="394" r="24"/><circle cx="352" cy="394" r="24"/></g><circle cx="256" cy="158" r="32" fill="#1c3556"/></svg>Second Brain</div>`;
  $("nav").innerHTML = marca + `<a href="#/hoy" data-n="hoy">${ni("hoy")}<span>Hoy</span></a><a href="#/mas" data-n="mas">${ni("mas")}<span>Módulos</span></a><button id="fab" aria-label="Capturar rápido"><span>＋</span><span class="fl">Capturar <kbd>N</kbd></span></button><a href="#/buscar" data-n="buscar">${ni("buscar")}<span>Buscar</span></a><a href="#/ajustes" data-n="ajustes">${ni("ajustes")}<span>Ajustes</span></a>`;
  $("fab").onclick = abrirCaptura;
  document.addEventListener("keydown", e => {
    if (SB.bloqueado) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); if (!$("kbar")) { const s = $("sheet"); if (s) { s.hidden = true; s.innerHTML = ""; } abrirBuscador(); } return; }
    const t = e.target, escribe = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName), s = $("sheet");
    if (e.key === "Escape" && !s.hidden) { s.hidden = true; s.innerHTML = ""; return; }
    if (escribe || e.ctrlKey || e.metaKey || e.altKey || !s.hidden) return;
    const k = e.key.toLowerCase();
    if (k === "n") { e.preventDefault(); abrirCaptura(); } else if (k === "/") { e.preventDefault(); location.hash = "#/buscar"; } else if (k === "h") location.hash = "#/hoy";
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) vaciar(); }); window.addEventListener("pagehide", vaciar);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}   // pide que el navegador no borre los datos si falta espacio
  window.addEventListener("hashchange", pintar); pintar(); enviarAvisos(); window.__listo = true; mostrarNovedades();
  SB.alArrancar.forEach(f => { try { f(); } catch (e) { SB.fallos["arranque"] = e.message; } });
};
})();
