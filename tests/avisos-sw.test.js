// El service worker (sw.js) corre en un contexto aislado: no hace falta navegador.
const test = require("node:test"), assert = require("node:assert/strict");
const {abrirSW} = require("./helpers");
const dia = d => new Date("2026-11-" + d + "T09:00:00");

test("tarea con fecha: avisa el día anterior y el mismo día, una vez cada uno", () => {
  const {avisosPendientes} = abrirSW(), e = {f: "2026-11-20", t: "Entregar el TP", c: "Programación"}, ya = [];
  assert.equal(avisosPendientes([e], dia(18), ya).length, 0, "dos días antes no avisa");
  const man = avisosPendientes([e], dia(19), ya); assert.equal(man[0].titulo, "Mañana: Entregar el TP"); ya.push(man[0].key);
  assert.equal(avisosPendientes([e], dia(19), ya).length, 0, "no repite");
  assert.equal(avisosPendientes([e], dia(20), ya)[0].titulo, "Hoy: Entregar el TP");
  assert.equal(avisosPendientes([e], dia(21), []).length, 0, "pasada la fecha ya no avisa");
});
test("aviso con anticipación (av): a los 7, 3 y 1 día antes, una sola vez cada uno", () => {
  const {avisosPendientes} = abrirSW(), e = {f: "2026-11-23", t: "feriado", av: [7, 3, 1]}, ya = [], salida = [];
  for (let d = 14; d <= 24; d++) avisosPendientes([e], dia(d), ya).forEach(x => { ya.push(x.key); salida.push(d + ": " + x.titulo); });
  assert.deepEqual(salida, ["16: En 7 días: feriado", "20: En 3 días: feriado", "22: Mañana: feriado"]);
});
test("aviso con anticipación: si un día no se abrió la app, avisa al abrirla, sin repetir", () => {
  const {avisosPendientes} = abrirSW(), e = {f: "2026-11-23", t: "feriado", av: [7, 3, 1]}, ya = [];
  const a = avisosPendientes([e], dia(18), ya); assert.equal(a.length, 1); assert.equal(a[0].titulo, "En 5 días: feriado"); ya.push(a[0].key);
  assert.equal(avisosPendientes([e], dia(19), ya).length, 0);
});
test("sin eventos o con datos vacíos no rompe", () => {
  const {avisosPendientes} = abrirSW(); assert.equal(avisosPendientes(undefined, dia(18), []).length, 0); assert.equal(avisosPendientes([], dia(18), undefined).length, 0);
});
async function pedir(red, copia) {
  const {manejador} = abrirSW({red, copia}); let resp; const t0 = Date.now();
  manejador({request: {method: "GET", url: "https://prueba.test/index.html", mode: "navigate"}, respondWith: p => { resp = p; }, waitUntil() {}});
  const r = await resp; return {r, ms: Date.now() - t0};
}
const RED_OK = () => Promise.resolve({ok: true, tag: "RED", clone() { return this; }});
const COPIA = {tag: "COPIA"};
test("abrir: con buena señal usa internet", async () => { const {r} = await pedir(RED_OK, COPIA); assert.equal(r.tag, "RED"); });
test("abrir: sin internet usa la copia guardada al instante", async () => { const {r, ms} = await pedir(() => Promise.reject(new Error("x")), COPIA); assert.equal(r.tag, "COPIA"); assert.ok(ms < 300); });
test("abrir: con internet colgado no espera más de ~1,5 s", async () => { const {r, ms} = await pedir(() => new Promise(() => {}), COPIA); assert.equal(r.tag, "COPIA"); assert.ok(ms >= 1400 && ms < 2500, "tardó " + ms + " ms"); });
