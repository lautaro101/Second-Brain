const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");

test("diario: el catálogo tiene preguntas de las tres áreas en cada momento del día, con ids únicos", () => {
  const {SB} = abrir(), P = SB.mods.diario.util.preguntas; assert.equal(new Set(P.map(q => q.id)).size, P.length);
  ["m", "t", "n"].forEach(m => ["p", "f", "i"].forEach(a => assert.ok(P.some(q => q.id[0] === m && q.id[2] === a), m + "-" + a)));
});
test("diario: el momento depende de la hora (mañana hasta las 12, tarde hasta las 19, noche después)", () => {
  const {SB} = abrir(), m = SB.mods.diario.util.momento; assert.deepEqual(J([5, 11, 12, 18, 19, 23].map(h => m(h))), ["m", "m", "t", "t", "n", "n"]);
});
test("diario: Hoy mantiene la reflexión primero y suma el check-in del momento, que se tilda al responder", () => {
  const {SB} = abrir(), U = SB.mods.diario.util, hoy = SB.u.ymd(), h = SB.mods.diario.hoy();
  assert.equal(h.length, 2); assert.equal(h[0].t, "Reflexión del día"); assert.match(h[1].t, /^Check-in de la (mañana|tarde|noche)$/); assert.equal(h[1].hecho, false);
  const id = U.preguntas.find(q => q.id[0] === U.momento()).id; SB.datos("diario").e[hoy] = {x: "", a: 0, g: "", q: {[id]: "Algo"}};
  assert.equal(SB.mods.diario.hoy()[1].hecho, true); assert.match(SB.mods.diario.hoy()[1].s, /1 de \d+ respondidas/); assert.equal(SB.mods.diario.hoy()[0].hecho, false);   // la reflexión sigue pendiente
});
test("diario: la revisión semanal cuenta los check-ins por momento y la búsqueda encuentra las respuestas", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), e = SB.datos("diario").e;
  e[hoy] = {x: "", a: 0, g: "", q: {"m-p1": "Cerrar el informe", "n-f1": "Press banca 4x8 con 60 kg"}}; e[SB.u.sumar(hoy, -1)] = {x: "", a: 0, g: "", q: {"n-i1": "Terminé el módulo de Objetivos"}};
  assert.match(SB.mods.diario.semana().join(" "), /1 mañana, 0 tardes, 2 noches/);
  assert.equal(SB.mods.diario.buscar("press banca").length, 1); assert.match(SB.mods.diario.buscar("objetivos")[0].s, /Terminé el módulo/);
});
test("diario: la pantalla muestra las tres áreas, cambia de momento guardando lo escrito, y un día con solo check-in no queda vacío", () => {
  const {SB, ctx} = abrir(); const hoy = SB.u.ymd(); let inputs = [];
  ctx.document = {getElementById: () => ({value: "", textContent: "", oninput: null})}; ctx.clearTimeout = clearTimeout;
  const el = {innerHTML: "", querySelectorAll: sel => sel === "[data-q]" ? inputs : [], querySelector: () => null}; SB.pintar = () => SB.mods.diario.pantalla(el); SB.mods.diario.pantalla(el);
  assert.match(el.innerHTML, /Desarrollo personal/); assert.match(el.innerHTML, /Físico \(gym y calistenia\)/); assert.match(el.innerHTML, /Informática y programación/);
  const click = (a, extra) => el.onclick({target: {closest: () => ({dataset: Object.assign({a}, extra)})}});
  click("mom", {m: "m"}); assert.match(el.innerHTML, /Plan del día/);
  inputs = [{value: "  Cerrar el informe  ", dataset: {q: "m-p1"}}, {value: "", dataset: {q: "m-p2"}}];
  click("mom", {m: "n"}); assert.match(el.innerHTML, /Cierre del día/); assert.deepEqual(J(SB.datos("diario").e[hoy].q), {"m-p1": "Cerrar el informe"});
  inputs = [{value: "", dataset: {q: "m-p1"}}]; click("mom", {m: "m"});                      // la borra: el día vuelve a quedar vacío y se elimina
  assert.equal(SB.datos("diario").e[hoy], undefined);
});
test("diario: el resumen de días anteriores muestra la primera respuesta si no hay texto", () => {
  const {SB, ctx} = abrir(), ayer = SB.u.sumar(SB.u.ymd(), -1); ctx.document = {getElementById: () => ({value: "", oninput: null})};
  SB.datos("diario").e[ayer] = {x: "", a: 0, g: "", q: {"n-i1": "Avancé con el diario"}};
  const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.mods.diario.pantalla(el); assert.match(el.innerHTML, /Avancé con el diario/);
});
