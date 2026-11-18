const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const dow = f => new Date(f + "T12:00:00").getDay();

/* ---- hábitos: la racha es donde más casos borde hay ---- */
function racha(dias, hechos) {   // dias: días de la semana que toca (0-6); hechos: fechas cumplidas
  const {SB} = abrir(); SB.datos("habitos").h.push({id: "h", n: "Inglés", d: dias, h: Object.fromEntries(hechos.map(f => [f, 1]))});
  const x = SB.mods.habitos.hoy()[0]; return x ? x.s : null;
}
const T = () => { const {SB} = abrir(), hoy = SB.u.ymd(); return {hoy, ayer: SB.u.sumar(hoy, -1), ante: SB.u.sumar(hoy, -2)}; };
const TODOS = [0, 1, 2, 3, 4, 5, 6];
test("hábitos: la racha cuenta los días seguidos hasta hoy", () => { const {hoy, ayer, ante} = T(); assert.match(racha(TODOS, [hoy, ayer, ante]), /3 días/); });
test("hábitos: si hoy todavía no lo hiciste, la racha de ayer no se rompe", () => { const {ayer, ante} = T(); assert.match(racha(TODOS, [ayer, ante]), /2 días/); });
test("hábitos: un día salteado corta la racha", () => { const {hoy, ante} = T(); assert.match(racha(TODOS, [hoy, ante]), /1 día(?!s)/); });
test("hábitos: un día en que no toca no corta la racha", () => {
  const {hoy, ayer, ante} = T(), libre = dow(ayer), dias = TODOS.filter(d => d !== libre); assert.match(racha(dias, [hoy, ante]), /2 días/);
});
test("hábitos: un hábito que hoy no toca no aparece en Hoy", () => { const {hoy} = T(); assert.equal(racha(TODOS.filter(d => d !== dow(hoy)), []), null); });
test("hábitos: la revisión semanal cuenta lo cumplido sobre lo programado", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("habitos").h.push({id: "h", n: "Gym", d: TODOS, h: {[hoy]: 1, [SB.u.sumar(hoy, -1)]: 1}});
  assert.match(SB.mods.habitos.semana().join(" "), /2 de 7.*29 ?%/);
});

/* ---- tareas ---- */
test("tareas: Hoy muestra vencidas y de hoy, no las hechas ni las de otro día", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), t = SB.datos("tareas").t;
  t.push({id: "1", t: "Vencida", f: SB.u.sumar(hoy, -2), p: "", h: 0, c: 1}, {id: "2", t: "De hoy", f: hoy, p: "", h: 0, c: 2}, {id: "3", t: "Hecha", f: hoy, p: "", h: 5, c: 3}, {id: "4", t: "Futura", f: SB.u.sumar(hoy, 5), p: "", h: 0, c: 4});
  const h = SB.mods.tareas.hoy(); assert.deepEqual(J(h.map(x => x.t)).sort(), ["De hoy", "Vencida"]);
  assert.match(h.find(x => x.t === "Vencida").s, /Venció hace 2 días/); assert.match(h.find(x => x.t === "De hoy").s, /hoy/i);
});
test("tareas: captura rápida separa el #proyecto del texto", () => {
  const {SB} = abrir(); SB.mods.tareas.captura.guardar("Comprar #taller electrodos");
  const t = SB.datos("tareas").t; assert.equal(t.length, 1); assert.equal(t[0].t, "Comprar electrodos"); assert.equal(t[0].p, "taller");
});
test("tareas: avisos solo de las pendientes con fecha", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), t = SB.datos("tareas").t;
  t.push({id: "1", t: "Con fecha", f: SB.u.sumar(hoy, 1), p: "", h: 0, c: 1}, {id: "2", t: "Sin fecha", f: "", p: "", h: 0, c: 2}, {id: "3", t: "Hecha", f: SB.u.sumar(hoy, 1), p: "", h: 7, c: 3});
  assert.deepEqual(J(SB.mods.tareas.avisos().map(a => a.c)), ["Con fecha"]);
});

/* ---- diario ---- */
test("diario: Hoy pide la reflexión hasta que la escribís", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); assert.equal(SB.mods.diario.hoy()[0].hecho, false);
  SB.datos("diario").e[hoy] = {x: "Un buen día", a: 4, g: ""}; assert.equal(SB.mods.diario.hoy()[0].hecho, true);
});
test("diario: la revisión semanal cuenta los días escritos y promedia el ánimo", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), e = SB.datos("diario").e;
  e[hoy] = {x: "uno", a: 4, g: ""}; e[SB.u.sumar(hoy, -1)] = {x: "dos", a: 2, g: ""};
  const s = SB.mods.diario.semana().join(" "); assert.match(s, /2 de 7/); assert.match(s, /3,0/);
});
test("diario: la captura rápida agrega al día de hoy sin pisar lo que ya había", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("diario").e[hoy] = {x: "Antes", a: 0, g: ""}; SB.mods.diario.captura.guardar("Después");
  const x = SB.datos("diario").e[hoy].x; assert.ok(x.includes("Antes") && x.includes("Después"));
});
