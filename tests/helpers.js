// Carga core.js, sync.js y los módulos en un contexto aislado con un localStorage falso (y, si se pide, un IndexedDB falso), sin navegador, para probar el código real.
const fs = require("fs"), path = require("path"), vm = require("vm");
const RAIZ = path.join(__dirname, "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
function almacen(ini = {}) { const d = {...ini}; return {getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, key: i => Object.keys(d)[i] || null, get length() { return Object.keys(d).length; }, _d: d}; }

// IndexedDB mínimo en memoria: lo justo que usa el núcleo (open, transaction, put/get/delete/openCursor). `falla(clave)` hace que escribir esa clave dé error.
function fakeIDB(datos = new Map(), {falla} = {}) {
  const db = {
    createObjectStore() {},
    transaction() {
      const t = {oncomplete: null, onerror: null, onabort: null, error: null}; let pend = 0, roto = false;
      const fin = () => { if (!pend) setTimeout(() => { if (roto) t.onabort && t.onabort(); else t.oncomplete && t.oncomplete(); }, 0); };
      const req = fn => { const r = {result: undefined, onsuccess: null, onerror: null}; pend++; setTimeout(() => { try { fn(r); r.onsuccess && r.onsuccess(); } catch (e) { t.error = e; roto = true; r.onerror && r.onerror(); } pend--; fin(); }, 0); return r; };
      t.objectStore = () => ({
        put: (v, k) => req(r => { if (falla && falla(k)) throw new Error("falla simulada"); datos.set(k, structuredClone(v)); r.result = k; }),
        get: k => req(r => { r.result = datos.has(k) ? structuredClone(datos.get(k)) : undefined; }),
        delete: k => req(() => { datos.delete(k); }),
        getAllKeys: () => req(r => { r.result = [...datos.keys()]; }),
        openCursor() { const ks = [...datos.keys()], r = {result: null, onsuccess: null, onerror: null}; let i = -1;
          const paso = () => setTimeout(() => { i++; r.result = i < ks.length ? {key: ks[i], value: structuredClone(datos.get(ks[i])), continue: paso} : null; r.onsuccess && r.onsuccess(); }, 0); paso(); return r; }
      });
      return t;
    }
  };
  return {datos, indexedDB: {open() { const r = {result: db, onupgradeneeded: null, onsuccess: null, onerror: null}; setTimeout(() => { r.onupgradeneeded && r.onupgradeneeded(); r.onsuccess && r.onsuccess(); }, 0); return r; }}};
}

function preparar({datos = {}, extra = {}} = {}) {
  const ls = almacen(datos), ctx = {localStorage: ls, setTimeout, clearTimeout, console, structuredClone, alert() {}, confirm: () => true, document: {}, navigator: {}, location: {hash: ""}, Notification: undefined, crypto: require("node:crypto").webcrypto, TextEncoder, TextDecoder, btoa, atob, prompt: () => null, ...extra};
  ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(leer("version.js"), ctx); vm.runInContext(leer("modulos/lista.js"), ctx);
  vm.runInContext(leer("core.js"), ctx); ctx.SB.pintar = () => {};   // sin pantalla: repintar no hace nada
  vm.runInContext(leer("sync.js"), ctx);
  vm.runInContext(leer("seguridad.js"), ctx); if (ctx.SB.seg) { ctx.SB.seg.config.iter = 1000; ctx.SB.seg.config.iterPin = 1000; }   // pocas vueltas para que las pruebas vayan rápido
  return {ctx, SB: ctx.SB, ls};
}
function cargar(ctx, archivos) {
  (archivos || ctx.SB_ARCHIVOS).forEach(f => { try { vm.runInContext(typeof f === "string" && f.endsWith(".js") ? leer(f) : f.codigo, ctx); } catch (e) { ctx.SB.fallos[f.nombre || f] = e.message; } });
}
// Sin IndexedDB: todo es síncrono (como en un navegador que no lo ofrece).
function abrir({datos = {}, archivos = null, extra = {}} = {}) {
  const p = preparar({datos, extra}); p.SB.iniciar(); cargar(p.ctx, archivos); return p;
}
// Con IndexedDB falso: espera a que se abran y migren los datos antes de cargar los módulos, como hace index.html.
async function abrirIDB({datos = {}, archivos = null, idb = fakeIDB(), extra = {}} = {}) {
  const p = preparar({datos, extra: {indexedDB: idb.indexedDB, ...extra}}); await p.SB.iniciar(); cargar(p.ctx, archivos); p.idb = idb; return p;
}
const modulo = (id, extra = "") => ({nombre: id, codigo: `SB.registrar(Object.assign({id:"${id}",nombre:"${id}",icono:"x",esquema:1,inicial:()=>({n:0}),pantalla(){}}, ${extra || "{}"}));`});
const J = x => JSON.parse(JSON.stringify(x));   // los objetos del núcleo viven en otro contexto: se copian para compararlos
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
// El service worker (sw.js) corre en un contexto aislado: no hace falta navegador.
function abrirSW({red, copia} = {}) {
  let manejador; const guardado = {put: async () => {}};
  const ctx = {
    self: {addEventListener: (t, f) => { if (t === "fetch") manejador = f; }, registration: {}, clients: {claim: async () => {}}, skipWaiting() {}},
    importScripts() {}, location: {origin: "https://prueba.test", href: "https://prueba.test/Second-Brain/sw.js"}, URL, setTimeout, clearTimeout, Promise, console,
    Request: class { constructor(u) { this.url = u.url || u; this.mode = u.mode || "navigate"; } }, Response: class {},
    fetch: red || (() => Promise.reject(new Error("sin red"))),
    caches: {open: async () => guardado, match: async () => copia, keys: async () => [], delete: async () => true},
  };
  ctx.self.location = ctx.location; ctx.window = ctx.self;
  vm.createContext(ctx); vm.runInContext(leer("sw.js"), ctx);
  return {ctx, manejador, avisosPendientes: ctx.avisosPendientes};
}
module.exports = {RAIZ, leer, abrirSW, abrir, abrirIDB, fakeIDB, modulo, almacen, J, dormir};
