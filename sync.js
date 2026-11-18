/* Second Brain · sincronización por archivo (Google Drive / OneDrive), sin servidor ni cuenta.
   Idea tomada de Mi Recibo: un archivo .json con todos los datos, que se junta con lo que ya hay en cada dispositivo.
   Mi Recibo junta por «parte» (gana lo último que se tocó en cada mes). Acá se junta más fino: por cada nota, tarea, hábito o día del diario,
   y se guarda cuándo se borró algo para que un borrado en el celu no vuelva a aparecer desde la PC.
   Cada módulo dice qué colecciones tiene con `sync: [{k: "n", orden: "desc", t: x => x.m}]` (k = propiedad de sus datos, que es una lista con id o un objeto por clave).
   Un módulo que no declara nada igual se sincroniza: gana el que se modificó más tarde. */
(function () {
"use strict";
const SB = window.SB; if (!SB) return;
try {
const A = SB.almacen, {esc} = SB.u, $ = id => document.getElementById(id);
const ARCH = "second-brain.json", DIAS180 = 180 * 864e5;
const FS = typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
let FH = null, SINC = false, PEND = false, TMR = 0, SIN_PERMISO = false;
const UI = {cont: null, msg: "", err: false};

/* ---------- lo que este dispositivo sabe de su propio historial ---------- */
const M = () => { let m = A.leer("sb_sync", null); if (!m || typeof m !== "object" || !m.mods) { m = {mods: {}, ult: 0, mod: false, arch: ""}; A.poner("sb_sync", m); } return m; };
const guardarM = () => A.poner("sb_sync", M());
const mu = id => { const m = M(); return m.mods[id] || (m.mods[id] = {ts: 0, it: {}, borr: {}, ini: false}); };
const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clonar = v => JSON.parse(JSON.stringify(v));
const estable = v => v === null || typeof v !== "object" ? JSON.stringify(v === undefined ? null : v) : Array.isArray(v) ? "[" + v.map(estable).join(",") + "]" : "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + estable(v[k])).join(",") + "}";
const hash = v => { const t = estable(v); let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/* Lo que se sincroniza: cada módulo y el Inbox (que no es un módulo pero tiene sus datos). */
function unidades() {
  const u = SB.orden.map(id => { const m = SB.mods[id]; return {id, esq: m.esquema, cols: Array.isArray(m.sync) ? m.sync : [], get: () => SB.datos(id), set: d => SB.reemplazar(id, d), migrar: (v, d) => SB.migrarDatos(m, v, d)}; });
  u.push({id: "inbox", esq: 1, cols: [{k: "l", orden: "desc"}], get: () => ({l: SB.inbox.leer()}), set: d => SB.inbox.poner(d.l, true), migrar: (v, d) => d});
  return u;
}
const itemsDe = (d, c) => { const m = new Map(), x = d && d[c.k]; if (Array.isArray(x)) x.forEach(v => { if (v && v.id != null) m.set(String(v.id), v); }); else if (x && typeof x === "object") Object.keys(x).forEach(k => m.set(k, x[k])); return m; };
const resto = (d, cols) => { const ks = new Set(cols.map(c => c.k)), r = {}; Object.keys(d || {}).forEach(k => { if (!ks.has(k)) r[k] = d[k]; }); return r; };
const est = (c, v) => { try { return (c.t && c.t(v)) || 0; } catch (e) { return 0; } };

/* Anota cuándo cambió cada cosa (comparando contra lo último que se vio) y cuándo se borró. La primera vez usa la fecha propia de cada dato, si la tiene. */
function marcar(u) {
  const d = u.get(), e = mu(u.id), ahora = Date.now(); let cambio = false;
  u.cols.forEach(c => {
    const act = itemsDe(d, c), it = e.it[c.k] || (e.it[c.k] = {}), br = e.borr[c.k] || (e.borr[c.k] = {});
    act.forEach((v, id) => { const h = hash(v), x = it[id]; if (!x || x[1] !== h) { it[id] = [(x || e.ini) ? ahora : est(c, v), h]; delete br[id]; cambio = true; } });
    Object.keys(it).forEach(id => { if (!act.has(id)) { br[id] = ahora; delete it[id]; cambio = true; } });
  });
  const hr = hash(resto(d, u.cols)); if (e.hr !== hr) { e.ts = (e.hr === undefined && !e.ini) ? 0 : ahora; e.hr = hr; cambio = true; }
  if (!e.ini) { e.ini = true; cambio = true; }
  return cambio;
}
const marcarTodo = () => { let c = false; unidades().forEach(u => { try { if (marcar(u)) c = true; } catch (e) { SB.fallos["sync." + u.id] = e.message; } }); if (c) guardarM(); return c; };
function podar() { const lim = Date.now() - DIAS180, m = M(); Object.keys(m.mods).forEach(id => Object.values(m.mods[id].borr || {}).forEach(br => Object.keys(br).forEach(k => { if (br[k] < lim) delete br[k]; }))); }

/* ---------- el archivo ---------- */
const tiempos = it => { const o = {}; Object.keys(it).forEach(c => { o[c] = {}; Object.keys(it[c]).forEach(id => { o[c][id] = it[c][id][0]; }); }); return o; };
/* `previo`: el archivo tal como estaba. Lo que este dispositivo no conoce (un módulo de una versión más nueva) se conserva; `salt`: módulos que no se pudieron juntar y no se pisan. */
function empaquetar(previo, salt) {
  marcarTodo(); podar();
  const out = {app: "second-brain", formato: 1, v: window.APP_VERSION, guardado: Date.now(), mods: {}};
  if (previo && previo.mods) Object.keys(previo.mods).forEach(id => { out.mods[id] = previo.mods[id]; });
  unidades().forEach(u => { if (salt && salt.has(u.id) && previo && previo.mods && previo.mods[u.id]) return; const e = mu(u.id); out.mods[u.id] = {v: u.esq, d: u.get(), ts: e.ts, it: tiempos(e.it), borr: e.borr}; });
  return out;
}

/* Junta lo del archivo (R) con lo de este dispositivo, para un módulo. Devuelve cuántas cosas cambió y si este dispositivo tiene algo que el archivo no. */
function mezclar(u, R) {
  const r = {n: 0, falta: false, nota: "", salteado: false};
  if (!R || typeof R !== "object" || !R.d || typeof R.d !== "object") { r.falta = true; return r; }
  if ((R.v || 0) > u.esq) { r.salteado = true; r.nota = "el archivo trae datos de una versión más nueva de la app"; return r; }
  let rd = clonar(R.d); if ((R.v || 0) < u.esq) { rd = u.migrar(R.v, rd); r.falta = true; }
  const L = u.get(), e = mu(u.id);
  u.cols.forEach(c => {
    if (L[c.k] == null) L[c.k] = Array.isArray(rd[c.k]) ? [] : {};
    const Lm = itemsDe(L, c), Rm = itemsDe(rd, c), Lit = e.it[c.k] || (e.it[c.k] = {}), Lbr = e.borr[c.k] || (e.borr[c.k] = {});
    const Rit = (R.it && R.it[c.k]) || {}, Rbr = (R.borr && R.borr[c.k]) || {};
    const quitar = new Set(), poner = [];
    const adoptar = (id, v, t) => { poner.push([id, v]); Lit[id] = [t, hash(v)]; delete Lbr[id]; r.n++; };
    new Set([...Lm.keys(), ...Rm.keys(), ...Object.keys(Lbr), ...Object.keys(Rbr)]).forEach(id => {
      const lv = Lm.has(id), rv = Rm.has(id);
      const lt = lv ? (Lit[id] ? Lit[id][0] : 0) : (tiene(Lbr, id) ? Lbr[id] : null);
      const rt = rv ? (Rit[id] != null ? Rit[id] : 0) : (tiene(Rbr, id) ? Rbr[id] : null);
      if (lt === null && rt === null) return;
      if (rt === null) { r.falta = true; return; }                                      // solo acá
      if (lt === null) { if (rv) adoptar(id, Rm.get(id), rt); else Lbr[id] = rt; return; }   // solo en el archivo
      if (lv && rv) {                                                                    // está en los dos: gana el último cambio; si empatan, el de hash mayor (así los dos dispositivos eligen igual)
        const hl = hash(Lm.get(id)), hr = hash(Rm.get(id));
        if (hl === hr) { Lit[id] = [Math.max(lt, rt), hl]; return; }
        if (rt > lt || (rt === lt && hr > hl)) adoptar(id, Rm.get(id), rt); else r.falta = true;
      } else if (lv) {                                                                   // acá existe, en el archivo está borrado: si empatan, se conserva
        if (lt >= rt) r.falta = true; else { quitar.add(id); delete Lit[id]; Lbr[id] = rt; r.n++; }
      } else if (rv) {                                                                   // acá está borrado, en el archivo existe
        if (rt >= lt) adoptar(id, Rm.get(id), rt); else r.falta = true;
      } else { Lbr[id] = Math.max(lt, rt); if (lt > rt) r.falta = true; }                // borrado en los dos
    });
    if (Array.isArray(L[c.k])) {
      const pos = new Map(), agregar = []; L[c.k].forEach((x, i) => { if (x && x.id != null) pos.set(String(x.id), i); });
      poner.forEach(([id, v]) => { if (pos.has(id)) L[c.k][pos.get(id)] = v; else agregar.push(v); });
      L[c.k] = L[c.k].filter(x => !(x && x.id != null && quitar.has(String(x.id)))).concat(agregar);
      if (agregar.length && c.orden) L[c.k].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0) * (c.orden === "desc" ? -1 : 1));
    } else { poner.forEach(([id, v]) => { L[c.k][id] = v; }); quitar.forEach(id => { delete L[c.k][id]; }); }
  });
  const rr = resto(rd, u.cols), rl = resto(L, u.cols);                                    // lo que no es colección: gana el módulo modificado más tarde
  if (hash(rr) !== hash(rl)) {
    if ((R.ts || 0) > e.ts) { Object.keys(rl).forEach(k => { if (!(k in rr)) delete L[k]; }); Object.assign(L, rr); e.ts = R.ts; e.hr = hash(resto(L, u.cols)); r.n++; }
    else if (e.ts > (R.ts || 0)) r.falta = true;
  }
  if (r.n) u.set(L);
  return r;
}
/* Aplica un archivo ya leído. Devuelve {n: cuántas cosas cambiaron acá, falta: este dispositivo tiene algo más nuevo que el archivo, notas, salt}. */
function aplicar(j) {
  if (!j || typeof j !== "object" || j.app !== "second-brain" || !j.mods || typeof j.mods !== "object") throw new Error("Ese archivo no es una copia de Second Brain.");
  marcarTodo();
  const res = {n: 0, falta: false, notas: [], salt: new Set()};
  unidades().forEach(u => {
    try { const r = mezclar(u, j.mods[u.id]); res.n += r.n; if (r.falta) res.falta = true; if (r.salteado) res.salt.add(u.id); if (r.nota) res.notas.push((SB.mods[u.id] ? SB.mods[u.id].nombre : u.id) + ": " + r.nota); }
    catch (e) { res.salt.add(u.id); res.notas.push(u.id + ": no se pudo juntar (" + e.message + ")"); }
  });
  podar(); guardarM(); A.vaciar();
  if (res.n) SB.pintar();
  return res;
}
SB.sync = {empaquetar, aplicar, marcarTodo, estable, hash};

/* ---------- pantalla (Ajustes) ---------- */
function estado(txt, err) { UI.msg = txt || ""; UI.err = !!err; pintarSync(); }
const hora = t => new Date(t).toLocaleTimeString("es-AR", {hour: "2-digit", minute: "2-digit"});
function pintarSync() {
  const c = UI.cont; if (!c || !c.isConnected) return;
  const m = M();
  c.innerHTML = `<section class="card"><h3>Sincronizar PC y celu${m.mod ? " ●" : ""}</h3>
    <p class="ayuda">Guardá un archivo <b>.json</b> en tu Google Drive u OneDrive y cargalo en el otro dispositivo. No hace falta cuenta ni servidor. Si tocaste cosas distintas en cada lado, se juntan: en cada nota o tarea queda lo último que cambiaste.</p>
    ${FS ? `<div class="fila sy"><div class="tx"><span>Archivo vinculado</span><small>${FH ? esc(FH.name) + (SIN_PERMISO ? " · falta el permiso: tocá Sincronizar" : (m.ult ? " · sincronizado " + hora(m.ult) : "")) : "Elegilo una vez y después se actualiza solo"}</small></div>
      <div class="fila-b">${FH ? `<button type="button" data-a="sy-sync">Sincronizar</button><button type="button" data-a="sy-des">Desvincular</button>` : `<button type="button" data-a="sy-abrir">Elegir archivo</button><button type="button" data-a="sy-nuevo">Crear nuevo</button>`}</div></div>`
      : `<p class="ayuda">En el celu la página no puede volver a escribir sobre el mismo archivo: cada vez se guarda uno nuevo y vos reemplazás el anterior en Drive u OneDrive. En la PC con Chrome, Edge o Brave sí se puede vincular el archivo y se actualiza solo.</p>`}
    <div class="fila sy"><div class="tx"><span>Guardar archivo</span><small>${m.ult ? "Último: " + new Date(m.ult).toLocaleString("es-AR") + (m.mod ? " · hay cambios sin guardar" : "") : "Todavía no guardaste ninguno"}</small></div>
      <div class="fila-b"><button type="button" data-a="sy-guardar">Guardar / compartir</button><button type="button" data-a="sy-descargar">Descargar</button></div></div>
    <div class="fila sy"><div class="tx"><span>Cargar archivo</span><small>Elegí el .json desde Drive, OneDrive o el teléfono</small></div><div class="fila-b"><button type="button" data-a="sy-cargar">Cargar archivo</button></div></div>
    <input type="file" hidden data-c="sy-file" accept="application/json,.json,text/plain,application/octet-stream">
    ${UI.msg ? `<p class="${UI.err ? "sy-err" : "sy-ok"}" role="status">${esc(UI.msg)}</p>` : ""}
    <small>Antes de guardar, cargá el archivo que ya tengas en Drive: así no pisás lo que cambiaste en el otro dispositivo. "Guardar / compartir" abre el menú del celu para elegir Drive u OneDrive; si no aparece, "Descargar" lo deja en Descargas.</small></section>`;
}
function bajarArchivo(txt) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], {type: "application/json"})); a.download = ARCH;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const listo = () => { const m = M(); m.ult = Date.now(); m.mod = false; guardarM(); SB.copiaHecha(); };
async function guardarArchivo(compartir) {
  let txt; try { txt = await SB.sellar(JSON.stringify(empaquetar(), null, 1)); } catch (e) { estado("No se pudo cifrar el archivo: " + e.message, true); return; }
  if (compartir && navigator.canShare && navigator.share) {        // menú de compartir del teléfono: elegís Drive u OneDrive
    try {
      const f = new File([txt], ARCH, {type: "application/json"});
      if (navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: ARCH}); listo(); estado("Listo. Fijate que el archivo haya quedado en tu Drive u OneDrive.", false); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
  }
  bajarArchivo(txt); listo(); estado("Se descargó " + ARCH + " (carpeta Descargas). Subilo a tu Google Drive u OneDrive, reemplazando el anterior.", false);
}
async function cargarArchivo(file) {
  try {
    const res = aplicar(JSON.parse(await SB.abrirTexto(await file.text(), true)));
    let msg = res.n ? "Listo: se juntaron " + res.n + (res.n === 1 ? " cambio" : " cambios") + " del archivo." : "Este dispositivo ya tenía todo lo del archivo (o algo más nuevo).";
    if (res.falta) { msg += " Tenés datos más nuevos que el archivo: volvé a guardarlo para actualizarlo."; const m = M(); m.mod = true; guardarM(); }
    if (res.notas.length) msg += " · " + res.notas.join(" · ");
    estado(msg, res.notas.length > 0);
  } catch (e) { estado(e instanceof SyntaxError ? "No se pudo leer: el archivo está dañado o no es un .json." : e.message, true); }
}

/* --- archivo vinculado (PC: Chrome, Edge, Brave): se lee, se junta y se vuelve a escribir sobre el MISMO archivo --- */
const BD = () => new Promise((ok, no) => { const r = indexedDB.open("second_brain_fs", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const bdGet = async k => { const d = await BD(); return new Promise((ok, no) => { const q = d.transaction("k").objectStore("k").get(k); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); };
const bdSet = async (k, v) => { const d = await BD(); return new Promise((ok, no) => { const st = d.transaction("k", "readwrite").objectStore("k"); const q = v === undefined ? st.delete(k) : st.put(v, k); q.onsuccess = () => ok(); q.onerror = () => no(q.error); }); };
const TIPOS = [{description: "Copia de Second Brain (.json)", accept: {"application/json": [".json"]}}];
async function permiso(h, pedir) { const o = {mode: "readwrite"}; if ((await h.queryPermission(o)) === "granted") return true; return pedir ? (await h.requestPermission(o)) === "granted" : false; }
async function sincronizarArchivo(interactivo) {
  if (!FH) return;
  if (SINC) { PEND = true; return; }
  SINC = true;
  try {
    if (!(await permiso(FH, interactivo))) { SIN_PERMISO = true; pintarSync(); return; }
    SIN_PERMISO = false;
    const txt = await (await FH.getFile()).text(); let j = null, res = null, cif = false;
    if (txt.trim()) { const p = JSON.parse(txt); cif = !!(p && p.cifrado === 1); j = cif ? JSON.parse(await SB.abrirTexto(txt, interactivo)) : p; res = aplicar(j); }
    const quiere = !!(SB.seg && SB.seg.claveActiva());
    if (!j || res.falta || cif !== quiere || (SB.seg && SB.seg.reescribir())) { const out = await SB.sellar(JSON.stringify(empaquetar(j, res && res.salt), null, 1)); const w = await FH.createWritable(); await w.write(out); await w.close(); }   // también se reescribe si el archivo está en otro formato (cifrado / sin cifrar) que el que pide este dispositivo
    listo();
    estado("Sincronizado con " + FH.name + (res && res.n ? " · se juntaron " + res.n + (res.n === 1 ? " cambio" : " cambios") + " del archivo" : "") + (res && res.notas.length ? " · " + res.notas.join(" · ") : ""), !!(res && res.notas.length));
  } catch (e) { estado("No se pudo sincronizar: " + (e instanceof SyntaxError ? "el archivo está dañado" : e.message), true); }
  finally { SINC = false; if (PEND) { PEND = false; programar(); } }
}
async function vincular(nuevo) {
  try {
    let h; if (nuevo) h = await showSaveFilePicker({suggestedName: ARCH, types: TIPOS}); else [h] = await showOpenFilePicker({types: TIPOS, multiple: false});
    FH = h; M().arch = h.name; guardarM(); await bdSet("h", h); await sincronizarArchivo(true);
  } catch (e) { if (!e || e.name !== "AbortError") estado("No se pudo vincular el archivo: " + (e && e.message), true); }
}
function programar() { clearTimeout(TMR); if (FH) TMR = setTimeout(() => sincronizarArchivo(false), 2500); }

/* cada vez que se guarda algo, se anota qué cambió y se marca que el archivo quedó viejo */
const pend = new Set(); let tMarca = 0;
SB.alGuardar.push(id => {
  pend.add(id); clearTimeout(tMarca);
  tMarca = setTimeout(() => { try { const us = unidades().filter(u => pend.has(u.id)); pend.clear(); us.forEach(marcar); const m = M(); m.mod = true; guardarM(); pintarSync(); programar(); } catch (e) { SB.fallos["sync"] = e.message; } }, 400);
});
SB.secciones.push(cont => {
  UI.cont = cont; pintarSync();
  SB.u.eventos(cont, {
    a: (a, n) => {
      if (a === "sy-guardar") guardarArchivo(true); else if (a === "sy-descargar") guardarArchivo(false);
      else if (a === "sy-cargar") { const f = cont.querySelector("input[type=file]"); if (f) f.click(); }
      else if (a === "sy-abrir") vincular(false); else if (a === "sy-nuevo") vincular(true); else if (a === "sy-sync") sincronizarArchivo(true);
      else if (a === "sy-des" && confirm("¿Desvincular el archivo? Tus datos y el archivo quedan como están.")) { FH = null; SIN_PERMISO = false; M().arch = ""; guardarM(); bdSet("h", undefined).catch(() => {}); estado(""); }
    },
    c: (a, n) => { if (a === "sy-file") { const f = n.files[0]; n.value = ""; if (f) cargarArchivo(f); } }
  });
});
SB.alArrancar.push(() => {
  setTimeout(marcarTodo, 0);
  document.addEventListener("visibilitychange", () => { if (FH && !document.hidden && Date.now() - (M().ult || 0) > 30000) sincronizarArchivo(false); });
  if (FS) bdGet("h").then(h => { if (h) { FH = h; pintarSync(); sincronizarArchivo(false); } }).catch(() => {});
});
} catch (e) { SB.fallos["sync.js"] = e.message; }
})();
