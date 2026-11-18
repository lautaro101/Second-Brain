// Second Brain comparte el dominio (usuario.github.io) con otras apps: cada una tiene que poder instalarse, actualizarse y guardar datos sin pisar a las demás.
const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm");
const fs = require("fs"), path = require("path");
const {RAIZ, leer} = require("./helpers");
const MI_CARPETA = "/Second-Brain/";

test("manifest: id propio (no el raíz del dominio), y scope y start_url dentro de la carpeta de la app", () => {
  const m = JSON.parse(leer("manifest.webmanifest")), base = "https://usuario.github.io" + MI_CARPETA;
  assert.equal(m.id, MI_CARPETA, "el id tiene que ser único por app; «./» se resuelve a la raíz del dominio y lo comparten todas");
  assert.equal(new URL(m.scope, base + "manifest.webmanifest").pathname, MI_CARPETA);
  assert.equal(new URL(m.start_url, base + "manifest.webmanifest").pathname, MI_CARPETA);
  assert.notEqual(m.name, "Mi Recibo"); assert.notEqual(m.short_name, "Mi Recibo");
});
test("index.html enlaza el manifest y registra el service worker acotado a su carpeta", () => {
  const h = leer("index.html");
  assert.match(h, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(h, /serviceWorker\.register\("sw\.js", \{scope: "\.\/"\}\)/);
});
test("service worker: al activarse solo borra cachés viejas de Second Brain y conserva las de otras apps y sus avisos", async () => {
  const manej = {}, borradas = [];
  const ctx = {self: {addEventListener: (t, f) => { manej[t] = f; }, registration: {}, clients: {claim: async () => {}}}, importScripts() {}, URL, Promise, console, setTimeout, clearTimeout,
    location: {origin: "https://prueba.test", href: "https://prueba.test" + MI_CARPETA + "sw.js"},
    caches: {keys: async () => ["second-brain-v1.0.0", "second-brain-v1.11.0", "sb-avisos", "mi-recibo-v2.3.8", "calc-avisos", "otra-app"], delete: async k => { borradas.push(k); return true; }, open: async () => ({}), match: async () => undefined}};
  ctx.self.location = ctx.location; ctx.self.APP_VERSION = "1.11.0"; ctx.APP_VERSION = "1.11.0"; vm.createContext(ctx);
  vm.runInContext(leer("sw.js").replace(/try \{ importScripts\("version\.js"\); \} catch \(e\) \{\}/, 'self.APP_VERSION = "1.11.0";'), ctx);
  let esperar; manej.activate({waitUntil: p => { esperar = p; }}); await esperar;
  assert.deepEqual(borradas, ["second-brain-v1.0.0"]);
});
test("service worker: no atiende pedidos de otra carpeta del mismo dominio", () => {
  const manej = {}; let respondio = false;
  const ctx = {self: {addEventListener: (t, f) => { manej[t] = f; }, registration: {}, clients: {claim: async () => {}}}, importScripts() {}, URL, Promise, console, setTimeout, clearTimeout,
    location: {origin: "https://prueba.test", href: "https://prueba.test" + MI_CARPETA + "sw.js"}, caches: {keys: async () => [], open: async () => ({}), match: async () => undefined}, fetch: () => Promise.reject(new Error("no"))};
  ctx.self.location = ctx.location; vm.createContext(ctx); vm.runInContext(leer("sw.js"), ctx);
  const pedir = url => { respondio = false; manej.fetch({request: {method: "GET", url, mode: "same-origin"}, respondWith: p => { respondio = true; Promise.resolve(p).catch(() => {}); }, waitUntil() {}}); return respondio; };
  assert.equal(pedir("https://prueba.test/calculadora-sueldo/index.html"), false);
  assert.equal(pedir("https://prueba.test/calculadora-sueldo/"), false);
  assert.equal(pedir("https://prueba.test" + MI_CARPETA + "core.js"), true);
});
test("almacenamiento: todas las claves de localStorage/sessionStorage y las bases IndexedDB llevan el prefijo de la app", () => {
  const archivos = ["index.html", "core.js", "sync.js", "seguridad.js", "instalar.js", ...fs.readdirSync(path.join(RAIZ, "modulos")).map(f => "modulos/" + f)];
  const malas = [];
  archivos.forEach(f => {
    const t = leer(f);
    for (const m of t.matchAll(/(?:localStorage|sessionStorage|LS|\bls\(\))\.(?:getItem|setItem|removeItem)\(\s*"([^"]+)"/g)) if (!/^sb_/.test(m[1])) malas.push(f + ": " + m[1]);
    for (const m of t.matchAll(/indexedDB\.open\(\s*"([^"]+)"/g)) if (!/^second_brain/.test(m[1])) malas.push(f + ": IndexedDB " + m[1]);
  });
  assert.deepEqual(malas, []);
});
test("ningún código borra todo el localStorage ni todas las cachés del dominio", () => {
  ["index.html", "core.js", "sync.js", "seguridad.js", "instalar.js", "sw.js"].forEach(f => {
    const t = leer(f);
    assert.doesNotMatch(t, /localStorage\.clear\(|\bLS\.clear\(/, f);
    assert.doesNotMatch(t, /k\.map\(function \(x\) \{ return caches\.delete\(x\)/, f + ": borra todas las cachés del dominio");
  });
});
