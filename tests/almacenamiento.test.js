const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, abrirIDB, fakeIDB, J, modulo} = require("./helpers");
const NOTAS = JSON.stringify({v: 1, d: {n: [{id: "a1", x: "Nota vieja #js", m: 1}]}});
const TAREAS = JSON.stringify({v: 1, d: {t: [{id: "t1", t: "Soldar", f: "", p: "", h: 0, c: 1}]}});
const INBOX = JSON.stringify([{id: "i1", t: "algo suelto", f: 1}]);

test("sin IndexedDB todo sigue en localStorage, como en la 1.0", () => {
  const {SB, ls} = abrir({datos: {sb_m_notas: NOTAS}});
  assert.equal(SB.almacen.motor(), "localstorage"); assert.equal(SB.datos("notas").n[0].id, "a1");
  SB.datos("notas").n.push({id: "a2", x: "otra", m: 2}); SB.guardar("notas");
  assert.equal(JSON.parse(ls._d.sb_m_notas).d.n.length, 2);
});
test("con IndexedDB: los datos de localStorage pasan a IndexedDB, de a uno, y se borran del original", async () => {
  const {SB, ls, idb} = await abrirIDB({datos: {sb_m_notas: NOTAS, sb_m_tareas: TAREAS, sb_inbox: INBOX}});
  assert.equal(SB.almacen.motor(), "indexeddb"); assert.deepEqual(J(SB.fallos), {});
  assert.deepEqual([...idb.datos.keys()].filter(k => /^sb_(m_|inbox)/.test(k)).sort(), ["sb_inbox", "sb_m_notas", "sb_m_tareas"]);
  ["sb_m_notas", "sb_m_tareas", "sb_inbox"].forEach(k => assert.equal(ls._d[k], undefined, k + " tendría que haberse borrado de localStorage"));
  assert.equal(SB.datos("notas").n[0].x, "Nota vieja #js"); assert.equal(SB.datos("tareas").t[0].t, "Soldar"); assert.equal(SB.inbox.leer()[0].t, "algo suelto");
});
test("la migración guarda los datos como objetos, no como texto", async () => {
  const {idb} = await abrirIDB({datos: {sb_m_notas: NOTAS}});
  assert.equal(typeof idb.datos.get("sb_m_notas"), "object"); assert.equal(idb.datos.get("sb_m_notas").d.n[0].id, "a1");
});
test("si un dato no se puede pasar, ese queda en localStorage y funciona; los demás se pasan igual", async () => {
  const idb = fakeIDB(new Map(), {falla: k => k === "sb_m_tareas"});
  const {SB, ls} = await abrirIDB({datos: {sb_m_notas: NOTAS, sb_m_tareas: TAREAS}, idb});
  assert.ok(Object.keys(SB.fallos).some(k => /tareas/.test(k)), "tendría que avisar qué módulo no se pudo pasar");
  assert.equal(ls._d.sb_m_notas, undefined); assert.ok(ls._d.sb_m_tareas, "el original de tareas no se toca");
  assert.equal(SB.datos("tareas").t[0].t, "Soldar"); assert.equal(SB.datos("notas").n.length, 1);
});
test("guardar escribe en IndexedDB (todo junto, al terminar) y sobrevive a reabrir", async () => {
  const idb = fakeIDB(); let p = await abrirIDB({idb});
  p.SB.datos("notas").n.unshift({id: "n9", x: "Nueva", m: 5}); p.SB.guardar("notas"); p.SB.guardar("notas"); await p.SB.almacen.vaciar();
  assert.equal(idb.datos.get("sb_m_notas").d.n[0].id, "n9");
  const q = await abrirIDB({idb}); assert.equal(q.SB.datos("notas").n[0].id, "n9");
});
test("si el dato ya está en IndexedDB y quedó una copia vieja en localStorage, manda IndexedDB y se limpia", async () => {
  const idb = fakeIDB(new Map([["sb_m_notas", {v: 1, d: {n: [{id: "nuevo", x: "de IDB", m: 9}]}}]]));
  const {SB, ls} = await abrirIDB({datos: {sb_m_notas: NOTAS}, idb});
  assert.equal(SB.datos("notas").n[0].id, "nuevo"); assert.equal(ls._d.sb_m_notas, undefined);
});
test("sin IndexedDB que responda (error al abrir) se usa localStorage y se avisa", async () => {
  const roto = {open() { const r = {}; setTimeout(() => r.onerror && r.onerror(), 0); return r; }};
  const {SB, ls} = await abrirIDB({datos: {sb_m_notas: NOTAS}, idb: {indexedDB: roto, datos: new Map()}});
  assert.equal(SB.almacen.motor(), "localstorage"); assert.ok(SB.fallos.almacenamiento); assert.ok(ls._d.sb_m_notas); assert.equal(SB.datos("notas").n[0].id, "a1");
});
test("al subir de versión se guarda una copia de todo antes de migrar, y se puede restaurar", async () => {
  const idb = fakeIDB(), {SB, ctx} = await abrirIDB({datos: {sb_m_notas: NOTAS, sb_inbox: INBOX, sb_ult_version: "1.0.3"}, idb});
  const cps = idb.datos.get("sb_copias"); assert.equal(cps.length, 1); assert.equal(cps[0].v, ctx.APP_VERSION);
  assert.equal(cps[0].d.sb_m_notas.d.n[0].id, "a1"); assert.equal(cps[0].d.sb_inbox[0].id, "i1");
  SB.datos("notas").n.length = 0; SB.guardar("notas"); await SB.almacen.reemplazar(cps[0].d);
  assert.equal(idb.datos.get("sb_m_notas").d.n[0].id, "a1"); assert.equal(idb.datos.get("sb_inbox")[0].id, "i1");
});
test("restaurar acepta copias de la 1.0 (valores guardados como texto)", async () => {
  const idb = fakeIDB(), {SB} = await abrirIDB({idb});
  await SB.almacen.reemplazar({sb_m_notas: NOTAS, sb_inbox: INBOX, otra_cosa: "x"});
  assert.equal(idb.datos.get("sb_m_notas").d.n[0].id, "a1"); assert.equal(idb.datos.get("sb_inbox")[0].t, "algo suelto"); assert.ok(!idb.datos.has("otra_cosa"));
});
test("el almacenamiento aguanta mucho más que los 5 MB de localStorage", async () => {
  const idb = fakeIDB(), p = await abrirIDB({idb}), grande = "x".repeat(1024 * 1024);
  for (let i = 0; i < 8; i++) p.SB.datos("notas").n.push({id: "g" + i, x: grande, m: i});
  p.SB.guardar("notas"); await p.SB.almacen.vaciar(); assert.equal(idb.datos.get("sb_m_notas").d.n.length, 8);
});
