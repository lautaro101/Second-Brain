const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const dias = (SB, n) => SB.u.sumar(SB.u.ymd(), n);
const TODOS = [0, 1, 2, 3, 4, 5, 6];
const habito = (SB, o) => { const h = Object.assign({id: "h" + Math.random().toString(36).slice(2, 6), n: "Inglés", d: TODOS, h: {}}, o); SB.datos("habitos").h.push(h); return h; };
const marcar = (SB, h, ns) => ns.forEach(n => { h.h[dias(SB, n)] = 1; });

/* ---------- Hábitos: pausa ---------- */
test("hábitos: una pausa no corta la racha (sin pausa, el mismo historial la deja en 0)", () => {
  const {SB} = abrir(), U = SB.mods.habitos.util, h = habito(SB, {}); marcar(SB, h, [-5, -4]);
  assert.equal(U.racha(h), 0); h.pr = [[dias(SB, -3), dias(SB, -1)]]; assert.equal(U.racha(h), 2);
});
test("hábitos: pausado no sale en Hoy ni en los avisos, y al reanudar vuelve", () => {
  const {SB} = abrir(), h = habito(SB, {}); assert.equal(SB.mods.habitos.hoy().length, 1); assert.equal(SB.mods.habitos.avisos().length, 1);
  h.pz = dias(SB, 0); assert.equal(SB.mods.habitos.hoy().length, 0); assert.equal(SB.mods.habitos.avisos().length, 0);
  delete h.pz; assert.equal(SB.mods.habitos.hoy().length, 1);
});
test("hábitos: la pausa tampoco corta la racha de los de «veces por semana»", () => {
  const {SB} = abrir(), U = SB.mods.habitos.util, h = habito(SB, {d: [], v: 2}), l = SB.u.sumar(dias(SB, 0), -((new Date(dias(SB, 0) + "T12:00:00").getDay() + 6) % 7));
  [-7, -6, -14, -13, -21, -20].forEach(n => { h.h[SB.u.sumar(l, n)] = 1; });          // las 3 semanas anteriores cumplidas
  const base = U.racha(h); assert.equal(base, 3);
  delete h.h[SB.u.sumar(l, -14)]; delete h.h[SB.u.sumar(l, -13)]; assert.equal(U.racha(h), 1);             // una semana sin cumplir la corta
  h.pr = [[SB.u.sumar(l, -14), SB.u.sumar(l, -8)]]; assert.equal(U.racha(h), 2);                         // …salvo que haya estado en pausa
});

/* ---------- Hábitos: estadísticas ---------- */
test("hábitos: cumplimiento = hechos / programados, sin contar hoy si está pendiente ni los días en pausa", () => {
  const {SB} = abrir(), U = SB.mods.habitos.util, h = habito(SB, {}); marcar(SB, h, [-3, -1]);
  assert.equal(U.cumplimiento(h, dias(SB, -3), dias(SB, 0)), 67);              // hecho, faltó, hecho (hoy pendiente no cuenta)
  h.pr = [[dias(SB, -2), dias(SB, -2)]]; assert.equal(U.cumplimiento(h, dias(SB, -3), dias(SB, 0)), 100);   // el día faltado estaba en pausa
  assert.equal(U.cumplimiento(habito(SB, {}), dias(SB, 1), dias(SB, 5)), null);  // rango en el futuro
});
test("hábitos: cumplimiento por semana en los de «veces por semana»", () => {
  const {SB} = abrir(), U = SB.mods.habitos.util, h = habito(SB, {d: [], v: 3}), hoy = dias(SB, 0), l = SB.u.sumar(hoy, -((new Date(hoy + "T12:00:00").getDay() + 6) % 7)), ant = SB.u.sumar(l, -7);
  h.h[ant] = 1; h.h[SB.u.sumar(ant, 1)] = 1;                                     // 2 de 3 la semana pasada
  assert.equal(U.cumplimiento(h, ant, SB.u.sumar(ant, 6)), 67);
});
test("hábitos: la mejor racha es la más larga de todo el historial", () => {
  const {SB} = abrir(), U = SB.mods.habitos.util, h = habito(SB, {}); marcar(SB, h, [-10, -9, -8, -7, -6, -3, -2, -1]);
  assert.equal(U.mejor(h), 5); assert.equal(U.racha(h), 3); assert.equal(U.mejor(habito(SB, {})), 0);
});
test("hábitos: la pantalla abre las estadísticas con el mapa del mes y permite pausar y reanudar", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; const h = habito(SB, {}); marcar(SB, h, [-1]);
  const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.pintar = () => SB.mods.habitos.pantalla(el); SB.mods.habitos.pantalla(el);
  assert.match(el.innerHTML, /📊 Estadísticas/); assert.doesNotMatch(el.innerHTML, /mes-hm/);
  const click = (a, extra) => el.onclick({target: {closest: () => ({dataset: Object.assign({a, id: h.id}, extra)})}});
  click("est"); assert.match(el.innerHTML, /mes-hm/); assert.match(el.innerHTML, /Mejor racha/); assert.match(el.innerHTML, /Pausar el hábito/);
  click("pausa"); assert.equal(h.pz, dias(SB, 0)); assert.match(el.innerHTML, /en pausa desde/); assert.match(el.innerHTML, /Reanudar el hábito/);
  click("pausa"); assert.equal(h.pz, undefined); assert.equal((h.pr || []).length, 0);                      // pausó y reanudó el mismo día: no deja un rango vacío
  h.pz = dias(SB, -3); click("pausa"); assert.deepEqual(J(h.pr), [[dias(SB, -3), dias(SB, -1)]]);
  click("mes", {d: "1"}); assert.match(el.innerHTML, /mes-hm/);                                            // no se puede ir al futuro
});

/* ---------- Objetivos: avance automático ---------- */
const objetivo = (SB, src, extra) => SB.mods.objetivos.util.crear("Meta", Object.assign({src}, extra || {}));
test("objetivos: avance automático por libros leídos desde la fecha de inicio", () => {
  const {SB} = abrir(), L = SB.datos("lectura").l, hoy = dias(SB, 0);
  L.push({id: "1", t: "A", st: "t", e: dias(SB, -5), m: 1, c: 1}, {id: "2", t: "B", st: "t", e: dias(SB, -400), m: 1, c: 1}, {id: "3", t: "C", st: "l", e: "", m: 1, c: 1}, {id: "4", t: "D", st: "t", e: hoy, m: 1, c: 1});
  const o = objetivo(SB, {t: "libros", n: 4, d: dias(SB, -30)}); assert.equal(SB.mods.objetivos.util.avance(o), 50);       // 2 de 4: el viejo y el que sigue leyendo no cuentan
  o.src.n = 2; assert.equal(SB.mods.objetivos.util.avance(o), 100);
});
test("objetivos: avance automático por días cumplidos de un hábito", () => {
  const {SB} = abrir(), h = habito(SB, {}); marcar(SB, h, [-4, -3, -2, -1, 0, -40]);
  const o = objetivo(SB, {t: "habito", h: h.id, n: 20, d: dias(SB, -10)}); assert.equal(SB.mods.objetivos.util.avance(o), 25);       // 5 de 20 (el de hace 40 días queda afuera)
  SB.datos("habitos").h = []; assert.equal(SB.mods.objetivos.util.avance(o), 0);                                                      // hábito borrado: 0, sin romper
});
test("objetivos: avance automático por tareas hechas y por materias aprobadas", () => {
  const {SB} = abrir(); const o = objetivo(SB, {t: "tareas"}); o.n = "Correr 10 km";
  ["a", "b", "c", "d"].forEach(x => SB.mods.tareas.crear("Tarea " + x, "", "correr-10-km")); SB.datos("tareas").t.slice(0, 2).forEach(t => { t.h = Date.now(); });
  assert.equal(SB.mods.objetivos.util.avance(o), 50);
  SB.datos("estudio").m.push({id: "1", n: "A", d: [], st: "a"}, {id: "2", n: "B", d: [], st: "c"}, {id: "3", n: "C", d: [], st: "a"}, {id: "4", n: "D", d: []});
  const p = objetivo(SB, {t: "materias", n: 4}); assert.equal(SB.mods.objetivos.util.avance(p), 50);
});
test("objetivos: logrado es 100 aunque la fuente diga menos, y sin fuente vale lo manual", () => {
  const {SB} = abrir(), o = objetivo(SB, {t: "materias", n: 4}); o.e = "l"; assert.equal(SB.mods.objetivos.util.avance(o), 100);
  const m = SB.mods.objetivos.util.crear("Manual", {pc: 30}); assert.equal(SB.mods.objetivos.util.avance(m), 30);
});
test("objetivos: la pantalla muestra lo medido, ofrece darlo por logrado al llegar a la meta y elegir la fuente guarda", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; const h = habito(SB, {n: "Correr"}); marcar(SB, h, [-1, 0]);
  const o = SB.mods.objetivos.util.crear("Correr 10 días"), el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null};
  SB.pintar = () => SB.mods.objetivos.pantalla(el, o.id); SB.mods.objetivos.pantalla(el, o.id); assert.match(el.innerHTML, /Avance automático/); assert.match(el.innerHTML, /type="range"/);
  el.onchange({target: {closest: () => ({dataset: {c: "srct"}, value: "habito"})}}); assert.equal(o.src.t, "habito"); assert.equal(o.src.h, h.id); assert.match(el.innerHTML, /Correr/);
  el.onsubmit({target: {closest: () => ({dataset: {f: "src"}, n: {value: "2"}, d: {value: dias(SB, -3)}, h: {value: h.id}})}, preventDefault() {}});
  assert.deepEqual(J(o.src), {t: "habito", n: 2, d: dias(SB, -3), h: h.id}); assert.match(el.innerHTML, /2 de 2 días cumplidos/); assert.match(el.innerHTML, /darlo por logrado/); assert.doesNotMatch(el.innerHTML, /type="range"/);
  el.onchange({target: {closest: () => ({dataset: {c: "srct"}, value: ""})}}); assert.equal(o.src, undefined);
});
test("objetivos: si la fuente no está disponible se usa lo manual y se avisa", () => {
  const {SB} = abrir(), o = objetivo(SB, {t: "habito", h: "x", n: 5}, {pc: 40}); delete SB.mods.habitos;
  assert.equal(SB.mods.objetivos.util.avance(o), 40);
});
