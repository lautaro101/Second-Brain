const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
test("tareas: los pasos (subtareas) conviven con la tarea y la Papelera se los lleva con ella", () => {
  const {SB} = abrir(); SB.mods.tareas.crear("Mudanza", "", ""); const x = SB.datos("tareas").t[0];
  x.s = [{t: "Cajas", h: 1}, {t: "Flete", h: 0}]; SB.guardar("tareas"); assert.equal(SB.datos("tareas").t[0].s.length, 2);
  SB.alArrancar[SB.alArrancar.length - 1](); SB.datos("tareas").t = []; SB.guardar("tareas");
  const pap = SB.datos("papelera").x; assert.equal(pap.length, 1); assert.equal(pap[0].i.s.length, 2);
});
test("tareas: la pantalla muestra el contador de pasos y el panel abierto", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; SB.mods.tareas.crear("Mudanza", "", ""); SB.datos("tareas").t[0].s = [{t: "Cajas", h: 1}, {t: "Flete", h: 0}];
  const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.mods.tareas.pantalla(el); assert.match(el.innerHTML, /1\/2 pasos/);
});
test("estudio: estado, correlativas y avance de la carrera", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; ctx.clearInterval = clearInterval; const E = SB.datos("estudio");
  E.m.push({id: "a", n: "Análisis I", d: [], st: "a"}, {id: "b", n: "Análisis II", d: [], co: ["a"]}, {id: "c", n: "Física II", d: [], co: ["b"]});
  const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.mods.estudio.pantalla(el);
  assert.match(el.innerHTML, /1 de 3 materias aprobadas \(33 %\)/); assert.match(el.innerHTML, /Habilitadas para cursar: Análisis II/); assert.match(el.innerHTML, /Te falta aprobar: Análisis II/);
});
test("colecciones: la página de texto del registro se guarda, se ve y entra en la búsqueda", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; const c = SB.datos("colecciones");
  c.c.push({id: "c1", n: "Libros", i: "📚", p: [], v: "tabla", g: "", k: 1, m: 1}); c.r.push({id: "r1", c: "c1", n: "Rayuela", v: {}, x: "Capítulo **7**: el club", k: 1, m: 1});
  assert.equal(SB.mods.colecciones.buscar("club").length, 1);
  const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.mods.colecciones.pantalla(el, "r-r1"); assert.match(el.innerHTML, /Capítulo/); assert.match(el.innerHTML, /<textarea name="x"/);
});
