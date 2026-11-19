const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const hacer = SB => { const c = SB.datos("colecciones"); c.c.push({id: "c1", n: "Libros", i: "📚", p: [{id: "p1", n: "Estado", t: "s", o: ["Por leer", "Leído"]}, {id: "p2", n: "Terminado", t: "f", o: []}, {id: "p3", n: "Listo", t: "c", o: []}], v: "tabla", g: "p1", k: 1, m: 1});
  c.r.push({id: "r1", c: "c1", n: "Rayuela", v: {}, k: 1, m: 1}); return c; };
test("colecciones se registra, la Papelera la cubre y se sincroniza por c y r", () => {
  const {SB} = abrir(); assert.deepEqual(J(SB.fallos), {}); const m = SB.mods.colecciones; assert.deepEqual(J(m.sync.map(x => x.k)), ["c", "r"]);
  const c = hacer(SB); SB.alArrancar[SB.alArrancar.length - 1](); c.r.splice(0, 1); SB.guardar("colecciones"); assert.equal(SB.datos("papelera").x.length, 1); assert.equal(SB.datos("papelera").x[0].l, "Rayuela");
});
test("colecciones: la fecha de hoy sale en Hoy salvo que el registro esté tildado, y avisa el día antes", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), c = hacer(SB); c.r[0].v.p2 = hoy;
  assert.equal(SB.mods.colecciones.hoy().length, 1); c.r[0].v.p3 = true; assert.equal(SB.mods.colecciones.hoy().length, 0);
  c.r[0].v.p3 = false; c.r[0].v.p2 = SB.u.sumar(hoy, 3); assert.equal(SB.mods.colecciones.hoy().length, 0); assert.deepEqual(J(SB.mods.colecciones.avisos()[0].av), [1]);
});
test("colecciones: la búsqueda encuentra colecciones y registros (también por valor)", () => {
  const {SB} = abrir(), c = hacer(SB); c.r[0].v.p1 = "Leído";
  assert.equal(SB.mods.colecciones.buscar("libros").length, 1);   // la colección
  assert.equal(SB.mods.colecciones.buscar("rayuela").length, 1); assert.equal(SB.mods.colecciones.buscar("leido").length, 1);
});
test("colecciones: la pantalla se dibuja en todas las vistas sin errores", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; hacer(SB); SB.datos("colecciones").r[0].v.p1 = "Por leer";
  const el = () => ({innerHTML: "", querySelectorAll: () => [], querySelector: () => null});
  ["", "c1", "p-c1", "r-r1"].forEach(sub => { const e = el(); SB.mods.colecciones.pantalla(e, sub); assert.ok(e.innerHTML.length > 50, sub); });
  SB.datos("colecciones").c[0].v = "tablero"; const e = el(); SB.mods.colecciones.pantalla(e, "c1"); assert.match(e.innerHTML, /Por leer/);
});
