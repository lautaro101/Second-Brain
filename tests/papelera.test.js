const test = require("node:test"), assert = require("node:assert/strict");
const helpers = require("./helpers"), {J} = helpers;
const abrir = (...a) => { const r = helpers.abrir(...a); r.SB.aviso = () => {}; return r; };   // sin pantalla no hay avisito
const arrancar = SB => SB.alArrancar[SB.alArrancar.length - 1]();   // el de la papelera es el último en sumarse (los otros necesitan una página)
const papelera = SB => J(SB.datos("papelera").x);

test("papelera: lo que se borra en otro módulo queda guardado y se puede devolver", () => {
  const {SB} = abrir(); SB.mods.tareas.crear("Comprar pan", ""); SB.mods.notas.crear("Idea de app\nalgo más"); arrancar(SB);
  const T = SB.datos("tareas"); T.t = T.t.filter(x => x.t !== "Comprar pan"); SB.guardar("tareas");
  assert.equal(papelera(SB).length, 1); assert.equal(papelera(SB)[0].l, "Comprar pan"); assert.equal(papelera(SB)[0].m, "tareas");
  const g = papelera(SB)[0].g; assert.equal(SB.datos("tareas").t.length, 0);
  const antes = SB.datos("papelera").x[0].i;
  // restaurar desde la pantalla
  const el = {}; SB.mods.papelera.pantalla(el); assert.match(el.innerHTML, /Comprar pan/);
  const btn = {dataset: {g}}; el.onclick({target: {closest: () => ({dataset: {a: "rest", g}})}});
  assert.equal(SB.datos("tareas").t.length, 1); assert.equal(SB.datos("tareas").t[0].id, antes.id); assert.equal(papelera(SB).length, 0);
});
test("papelera: varias cosas borradas juntas se restauran juntas (proyecto con su bitácora)", () => {
  const {SB} = abrir(); const P = SB.datos("programacion"); P.p.push({id: "p1", n: "App", st: "c", c: 1}); P.b.push({id: "b1", p: "p1", x: "avancé", c: 1}, {id: "b2", p: "p1", x: "más", c: 2}); arrancar(SB);
  P.p = P.p.filter(x => x.id !== "p1"); P.b = P.b.filter(x => x.p !== "p1"); SB.guardar("programacion");
  const x = papelera(SB); assert.equal(x.length, 3); assert.equal(new Set(x.map(e => e.g)).size, 1);
  const el = {}; SB.mods.papelera.pantalla(el); el.onclick({target: {closest: () => ({dataset: {a: "rest", g: x[0].g}})}});
  assert.equal(SB.datos("programacion").p.length, 1); assert.equal(SB.datos("programacion").b.length, 2); assert.equal(papelera(SB).length, 0);
});
test("papelera: lo que llega de otro dispositivo (silencioso) no cuenta como borrado tuyo", () => {
  const {SB} = abrir(); SB.mods.tareas.crear("A", ""); arrancar(SB);
  SB.reemplazar("tareas", {t: []}); assert.equal(papelera(SB).length, 0);
  SB.mods.tareas.crear("B", ""); const T = SB.datos("tareas"); T.t = []; SB.guardar("tareas"); assert.equal(papelera(SB).length, 1, "después de lo sincronizado, un borrado propio sí se registra");
});
test("papelera: una nota vacía descartada no deja rastro; tildar una tarea no es borrar", () => {
  const {SB} = abrir(); const n = SB.mods.notas.crear(""); const t = SB.mods.tareas.crear("X", ""); arrancar(SB);
  const N = SB.datos("notas"); N.n = N.n.filter(x => x.id !== n.id); SB.guardar("notas");
  t.h = Date.now(); SB.guardar("tareas"); assert.equal(papelera(SB).length, 0);
});
test("papelera: se vacía sola a los 30 días y 'vaciar' elimina todo", () => {
  const {SB} = abrir(); SB.datos("papelera").x.push({id: "a", g: "g1", m: "tareas", k: "t", i: {id: "1", t: "vieja"}, f: Date.now() - 31 * 864e5, l: "vieja"}, {id: "b", g: "g2", m: "tareas", k: "t", i: {id: "2", t: "nueva"}, f: Date.now() - 2 * 864e5, l: "nueva"});
  arrancar(SB); assert.deepEqual(papelera(SB).map(e => e.l), ["nueva"]);
  const el = {}; SB.mods.papelera.pantalla(el); el.onclick({target: {closest: () => ({dataset: {a: "vaciar"}})}}); assert.equal(papelera(SB).length, 0);
});
test("papelera: no restaura dos veces un elemento que ya existe y se sincroniza como cualquier módulo", () => {
  const {SB} = abrir(); const t = SB.mods.tareas.crear("Doble", ""); arrancar(SB);
  const T = SB.datos("tareas"); T.t = []; SB.guardar("tareas"); T.t.push(JSON.parse(JSON.stringify(t))); SB.guardar("tareas");
  const g = papelera(SB)[0].g; const el = {}; SB.mods.papelera.pantalla(el); el.onclick({target: {closest: () => ({dataset: {a: "rest", g}})}});
  assert.equal(SB.datos("tareas").t.length, 1);
  assert.deepEqual(J(SB.mods.papelera.sync.map(c => c.k)), ["x"]);
});
