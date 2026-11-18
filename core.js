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
const copia = motivo => { try {
  const d = {}; MEM.forEach((v, k) => { if (USUARIO.test(k)) d[k] = JSON.parse(JSON.stringify(v)); }); if (!Object.keys(d).length) return;
  let a = leer("sb_copias", []); if (!Array.isArray(a)) a = []; if (a[0] && JSON.stringify(a[0].d) === JSON.stringify(d)) return;
  a.unshift({t: Date.now(), v: window.APP_VERSION, m: motivo, d}); a = a.slice(0, 3);
  if (IDB) poner("sb_copias", a);
  else for (;;) { try { LS.setItem("sb_copias", JSON.stringify(a)); MEM.set("sb_copias", a); break; } catch (e) { if (a.length <= 1) break; a.pop(); } }
} catch (e) {} };
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
SB.novedades = de => { const h = self.APP_HISTORIAL || []; return de ? h.filter(x => mayor(x[0], de)) : h.slice(0, 1); };
function mostrarNovedades() { try {
  if (SB.bloqueado) return;
  const p = leer("sb_nov_pend", null); if (!p) return; const l = SB.novedades(p.de), primera = !p.de;
  const o = document.createElement("div"); o.id = "nov"; o.setAttribute("role", "dialog");
  o.innerHTML = `<div class="hoja"><h2>${primera ? "¡Bienvenido a Second Brain!" : "Novedades"}</h2>${primera ? `<p>Anotá todo lo que se te ocurra con el botón ＋ y después ordenalo. En <b>Hoy</b> ves qué toca.</p>` : ""}
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
SB.alGuardar = []; SB.alArrancar = []; SB.secciones = [];
/* Cifrado y copias (los hace seguridad.js). Si hay una clave guardada y seguridad.js no cargó, NO se guarda sin cifrar. */
SB.mostrarNovedades = () => mostrarNovedades();
SB.sellar = t => { if (SB.seg) return SB.seg.sellar(t); try { const s = JSON.parse(localStorage.getItem("sb_seg")); if (s && s.clave) return Promise.reject(new Error("El cifrado no pudo cargar, así que no se guarda sin cifrar.")); } catch (e) {} return Promise.resolve(t); };
SB.abrirTexto = (t, pedir) => SB.seg ? SB.seg.abrir(t, pedir) : Promise.resolve(t);
SB.copiaHecha = () => { if (SB.seg) SB.seg.copiaHecha(); };
const avisarGuardado = id => SB.alGuardar.forEach(f => { try { f(id); } catch (e) {} });
let tAv; SB.guardar = (id, silencioso) => {
  const m = SB.mods[id]; if (!m) return; poner("sb_m_" + id, {v: m.esquema, d: DATA[id]});
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
    <div class="fila-b"><button class="pri" type="submit">Guardar en Inbox</button>${d.map(m => `<button type="button" data-a="dest" data-id="${esc(m.id)}">${m.icono} ${esc(m.captura.etiqueta)}</button>`).join("")}</div>
    <button type="button" class="link" data-a="cerrar">Cancelar</button></form></div>`;
  const cerrar = () => { s.hidden = true; s.innerHTML = ""; };
  const texto = () => s.querySelector("textarea").value.trim();
  const mover = n => { const t = texto(); if (!t) return; const m = SB.mods[n.dataset.id];
    try { m.captura.guardar(t); } catch (x) { SB.fallos[m.id + ".captura"] = x.message; return; }
    cerrar(); SB.aviso("Guardado en " + m.captura.etiqueta); pintar(); };
  eventos(s, {
    a: (a, n) => { if (a === "cerrar") cerrar(); else if (a === "dest") mover(n); },
    f: () => { const t = texto(); if (!t) return; const l = inbox(); l.unshift({id: SB.u.uid(), t, f: Date.now()}); ponerInbox(l); cerrar(); SB.aviso("Anotado en el Inbox"); pintar(); }
  });
  const base = s.onclick; s.onclick = e => { if (e.target === s) cerrar(); else base(e); };
  s.querySelector("textarea").onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") s.querySelector("form").requestSubmit(); };
  s.querySelector("textarea").focus();
}

/* ---------- Pantallas del núcleo ---------- */
let HOYITEMS = [];
const hoyFila = (x, i) => `<div class="fila">${x.tocar ? `<button class="chk${x.hecho ? " on" : ""}" data-a="tocar" data-i="${i}" aria-label="Marcar">${x.hecho ? "✓" : ""}</button>` : ""}
  <div class="tx${x.hecho ? " hecha" : ""}"${x.ir ? ` data-a="ir" data-i="${i}"` : ""}><span>${esc(x.t)}</span>${x.s ? `<small>${esc(x.s)}</small>` : ""}</div></div>`;
function pHoy(el) {
  const f = new Date(), fecha = f.toLocaleDateString("es-AR", {weekday: "long", day: "numeric", month: "long"}), inb = inbox();
  HOYITEMS = []; let h = `<h2 class="fecha">${esc(fecha)}</h2>`, hay = false;
  if (inb.length) { hay = true; h += `<a class="card enlace" href="#/inbox"><b>📥 Inbox</b><small>${inb.length} sin ordenar</small></a>`; }
  if (f.getDay() === 0) { hay = true; h += `<a class="card enlace" href="#/semana"><b>🗓️ Revisión semanal</b><small>Hoy toca mirar cómo te fue</small></a>`; }
  activos().forEach(m => {
    const it = seguro(m, "hoy"); if (!Array.isArray(it) || !it.length) return; hay = true;
    h += `<section class="card"><h3>${m.icono} ${esc(m.nombre)}</h3>${it.map(x => { HOYITEMS.push(x); return hoyFila(x, HOYITEMS.length - 1); }).join("")}</section>`;
  });
  if (!hay) h += `<p class="vacio">No hay nada pendiente para hoy. Anotá algo con el botón ＋.</p>`;
  el.innerHTML = h;
  eventos(el, {a: (a, n) => { const x = HOYITEMS[+n.dataset.i]; if (!x) return; if (a === "ir") location.hash = x.ir; else { try { x.tocar(); } catch (e) { SB.fallos.hoy = e.message; } pintar(); } }});
}
function pInbox(el) {
  const inb = inbox(), d = destinos();
  el.innerHTML = inb.length ? inb.map(x => `<div class="card"><p class="tx">${esc(x.t)}</p><div class="fila-b">${d.map(m => `<button data-a="mover" data-id="${esc(x.id)}" data-m="${esc(m.id)}">${m.icono} ${esc(m.captura.etiqueta)}</button>`).join("")}<button class="x" data-a="del" data-id="${esc(x.id)}">Borrar</button></div></div>`).join("") : `<p class="vacio">Inbox vacío 🎉</p>`;
  eventos(el, {a: (a, n) => { const l = inbox(), i = l.findIndex(x => x.id === n.dataset.id); if (i < 0) return;
    if (a === "mover") { const m = SB.mods[n.dataset.m]; try { m.captura.guardar(l[i].t); } catch (e) { SB.fallos[m.id + ".captura"] = e.message; return; } }
    l.splice(i, 1); ponerInbox(l); pintar(); }});
}
function pBuscar(el) {
  el.innerHTML = `<input type="search" id="q" placeholder="Buscar en todo…" autocomplete="off"><div id="res"></div>`;
  const q = $("q"), res = $("res");
  const llenar = () => { const t = q.value.trim(); if (t.length < 2) { res.innerHTML = `<p class="vacio">Escribí al menos 2 letras.</p>`; return; }
    let h = ""; const inb = inbox().filter(x => norm(x.t).includes(norm(t)));
    if (inb.length) h += `<section class="card"><h3>📥 Inbox</h3>${inb.map(x => `<a class="item" href="#/inbox">${esc(x.t)}</a>`).join("")}</section>`;
    activos().forEach(m => { const r = seguro(m, "buscar", t); if (Array.isArray(r) && r.length) h += `<section class="card"><h3>${m.icono} ${esc(m.nombre)}</h3>${r.slice(0, 15).map(x => `<a class="item" href="${esc(x.ir || "#/" + m.id)}"><b>${esc(x.t)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ""}</a>`).join("")}</section>`; });
    res.innerHTML = h || `<p class="vacio">Sin resultados.</p>`; };
  q.oninput = llenar; llenar(); if (window.matchMedia("(min-width:900px)").matches) q.focus();
}
function pMas(el) {
  const n = inbox().length;
  el.innerHTML = `<div class="grilla">${activos().map(m => `<a class="mod" href="#/${esc(m.id)}"><i>${m.icono}</i>${esc(m.nombre)}</a>`).join("")}<a class="mod" href="#/inbox"><i>📥</i>Inbox${n ? " (" + n + ")" : ""}</a><a class="mod" href="#/semana"><i>🗓️</i>Revisión semanal</a></div>`;
}
function pSemana(el) {
  let h = ""; const n = inbox().length;
  activos().forEach(m => { const r = seguro(m, "semana"); if (Array.isArray(r) && r.length) h += `<section class="card"><h3>${m.icono} ${esc(m.nombre)}</h3>${r.map(x => `<p>${esc(x)}</p>`).join("")}</section>`; });
  el.innerHTML = `<section class="card"><h3>📥 Inbox</h3><p>${n ? n + " cosas sin ordenar: ordenalas antes de arrancar la semana." : "Inbox vacío."}</p></section>${h}`;
}
function enviarAvisos() { try {
  const ev = []; activos().forEach(m => { const a = seguro(m, "avisos"); if (Array.isArray(a)) ev.push(...a); });
  const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({tipo: "avisos", eventos: ev});
} catch (e) {} }
function pAjustes(el) {
  const c = cfg(), fal = Object.keys(SB.fallos), cps = leer("sb_copias", []);
  el.innerHTML = `<section class="card"><h3>Módulos activos</h3>${SB.orden.map(id => { const m = SB.mods[id]; return `<label class="fila"><input type="checkbox" data-c="mod" data-id="${esc(id)}" ${c.off.includes(id) ? "" : "checked"}><span class="tx">${m.icono} ${esc(m.nombre)}<small>esquema de datos v${m.esquema}</small></span></label>`; }).join("")}</section>
  ${fal.length ? `<section class="card aviso-f"><h3>Con problemas</h3>${fal.map(k => `<p>${esc(k)}: ${esc(SB.fallos[k])}</p>`).join("")}<small>Los demás módulos siguen funcionando.</small></section>` : ""}
  <section class="card"><h3>Avisos</h3><div class="fila-b"><button data-a="avisos">Activar avisos</button><button data-a="prueba">Probar</button></div></section>
  <div id="ext"></div>
  <section class="card"><h3>Copia de seguridad</h3><div class="fila-b"><button data-a="exportar">Descargar copia</button><label class="btn">Restaurar de archivo<input type="file" accept="application/json" hidden data-c="importar"></label></div>
  ${cps.length ? `<small>Copias automáticas (al actualizar): ${cps.map((x, i) => `<a href="#" data-a="restaurar" data-i="${i}">v${esc(x.v)} · ${new Date(x.t).toLocaleDateString("es-AR")}</a>`).join(" · ")}</small>` : ""}</section>
  <section class="card"><h3>Espacio</h3><p class="ayuda" id="espacio">Calculando…</p></section>
  <section class="card"><h3>Atajos en PC</h3><p><b>N</b> capturar · <b>/</b> buscar · <b>H</b> Hoy · <b>Esc</b> cerrar · <b>Ctrl+Enter</b> guardar en el Inbox</p></section>
  <section class="card"><h3>Para después</h3>${(self.SB_PARA_DESPUES || []).map(x => `<p><b>${esc(x[0])}</b> <small>${esc(x[1])}</small></p>`).join("")}</section>
  <section class="card"><h3>Versión ${esc(window.APP_VERSION)}</h3><div class="fila-b"><button data-a="buscarUpd">Buscar actualizaciones</button></div><small id="ultUpd">${leer("sb_ub", 0) ? "Última búsqueda: " + new Date(leer("sb_ub", 0)).toLocaleString("es-AR") : "Todavía no buscó actualizaciones"}</small>${(self.APP_HISTORIAL || []).map(x => `<p><b>${esc(x[0])}</b> <small>${esc(x[1])}</small></p>`).join("")}</section>`;
  const ext = $("ext"); SB.secciones.forEach(f => { try { const d = document.createElement("div"); ext.appendChild(d); f(d); } catch (e) { SB.fallos["ajustes"] = e.message; } });
  const mb = n => (n / 1048576).toFixed(n < 1048576 * 10 ? 1 : 0).replace(".", ",") + " MB";
  try { const st = navigator.storage; if (st && st.estimate) st.estimate().then(e => { const x = $("espacio"); if (x) x.textContent = "Ocupás " + mb(e.usage || 0) + " de unos " + mb(e.quota || 0) + " disponibles. " + (SB.almacen.motor() === "indexeddb" ? "Tus datos se guardan en IndexedDB." : "Este navegador solo permite localStorage (unos 5 MB)."); }).catch(() => {}); else $("espacio").textContent = SB.almacen.motor() === "indexeddb" ? "Tus datos se guardan en IndexedDB." : "Tus datos se guardan en localStorage (unos 5 MB)."; } catch (e) {}
  const restaurar = d => SB.almacen.reemplazar(d).then(() => location.reload()).catch(() => alert("No se pudo restaurar."));
  eventos(el, {
    c: (a, n, e) => { if (a === "mod") { const k = cfg(); k.off = k.off.filter(x => x !== n.dataset.id); if (!n.checked) k.off.push(n.dataset.id); poner("sb_cfg", k); pintar(); }
      if (a === "importar" && n.files[0]) { const r = new FileReader(); r.onload = async () => { try { let d; try { d = JSON.parse(await SB.abrirTexto(r.result, true)); } catch (x) { if (x instanceof SyntaxError) d = null; else throw x; } if (!d || !d.sb) throw new Error("Ese archivo no es una copia de Second Brain."); if (confirm("Se reemplazan los datos de este dispositivo por los del archivo. ¿Seguro?")) restaurar(d.sb); } catch (x) { alert(x && x.message ? x.message : "Ese archivo no es una copia de Second Brain."); } }; r.readAsText(n.files[0]); } },
    a: (a, n, e) => { if (a === "restaurar") { e.preventDefault(); const x = cps[+n.dataset.i]; if (x && confirm("Volver a los datos del " + new Date(x.t).toLocaleDateString("es-AR") + "?")) restaurar(x.d); }
      if (a === "exportar") { SB.sellar(JSON.stringify({app: "second-brain", v: window.APP_VERSION, sb: SB.almacen.usuario()})).then(t => { const b = new Blob([t], {type: "application/json"}), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = "second-brain-" + ymd() + ".json"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); SB.copiaHecha(); }).catch(x => alert("No se pudo guardar la copia: " + x.message)); }
      if (a === "avisos") { if (!window.Notification) return alert("Este navegador no permite avisos."); Notification.requestPermission().then(p => { SB.aviso(p === "granted" ? "Avisos activados" : "Los avisos quedaron bloqueados");
        if (p === "granted") navigator.serviceWorker.ready.then(r => r.periodicSync && r.periodicSync.register("avisos", {minInterval: 864e5})).catch(() => {}).then(enviarAvisos); }); }
      if (a === "buscarUpd") { const m = $("ultUpd"), sw = navigator.serviceWorker; if (!sw) { m.textContent = "Este navegador no permite actualizar desde la web."; return; } m.textContent = "Buscando…";
        sw.getRegistration().then(r => r ? r.update().then(() => new Promise(ok => setTimeout(ok, 1500))).then(() => { poner("sb_ub", Date.now()); m.textContent = r.waiting || r.installing ? "Hay una versión nueva: tocá «Actualizar» arriba." : "Ya tenés la última versión (" + window.APP_VERSION + ")."; }) : (m.textContent = "La app todavía no está instalada para usar sin conexión.")).catch(() => { m.textContent = "No se pudo buscar: revisá tu conexión."; }); }
      if (a === "prueba") { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({tipo: "prueba"}); } }
  });
}

/* ---------- Router ---------- */
const PANT = {hoy: pHoy, inbox: pInbox, buscar: pBuscar, mas: pMas, semana: pSemana, ajustes: pAjustes};
const TIT = {hoy: "Hoy", inbox: "📥 Inbox", buscar: "🔍 Buscar", mas: "Módulos", semana: "🗓️ Revisión semanal", ajustes: "⚙️ Ajustes"};
function ruta() { const m = /^#\/([^\/]+)(?:\/(.*))?$/.exec(location.hash); return {id: m ? m[1] : "hoy", sub: m && m[2] ? decodeURIComponent(m[2]) : ""}; }
function pintar() {
  if (SB.bloqueado) return;   // con el PIN puesto no se dibuja nada hasta desbloquear
  const r = ruta(), app = $("app"), m = SB.mods[r.id] && !cfg().off.includes(r.id) ? SB.mods[r.id] : null, f = PANT[r.id] || (m && ((el, s) => m.pantalla(el, s)));
  if (!f) { location.hash = "#/hoy"; return; }
  $("top").textContent = m ? m.icono + " " + m.nombre : TIT[r.id];
  document.querySelectorAll("#nav [data-n]").forEach(a => a.classList.toggle("on", a.dataset.n === (PANT[r.id] ? r.id : "mas")));
  app.dataset.p = PANT[r.id] ? r.id : "mod"; app.onclick = app.onchange = app.onsubmit = null;
  try { f(app, r.sub); } catch (e) { SB.fallos[r.id] = e.message; app.innerHTML = `<div class="card aviso-f"><b>Este apartado falló:</b> ${esc(e.message)}<br><small>Los demás siguen andando.</small></div>`; }
  window.scrollTo(0, 0);
}
SB.arrancar = function () {
  try { const s = JSON.parse(localStorage.getItem("sb_seg")); if (!SB.seg && s && s.pin) { SB.bloqueado = true; $("app").textContent = "El bloqueo con PIN no pudo cargar, así que por seguridad la app no se abre. Recargá la página."; } } catch (e) {}   // si falla el bloqueo, falla cerrado
  $("nav").innerHTML = `<a href="#/hoy" data-n="hoy"><i>🏠</i>Hoy</a><a href="#/mas" data-n="mas"><i>▦</i>Módulos</a><button id="fab" aria-label="Capturar rápido"><span>＋</span><span class="fl">Capturar <kbd>N</kbd></span></button><a href="#/buscar" data-n="buscar"><i>🔍</i>Buscar</a><a href="#/ajustes" data-n="ajustes"><i>⚙️</i>Ajustes</a>`;
  $("fab").onclick = abrirCaptura;
  document.addEventListener("keydown", e => {
    if (SB.bloqueado) return;
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
