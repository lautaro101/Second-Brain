const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const dia = (SB, n) => SB.u.sumar(SB.u.ymd(), n);
const objetivo = (SB, src, extra) => SB.mods.objetivos.util.crear("Meta", Object.assign({src}, extra || {}));
const rutina = SB => SB.datos("entrenamiento").rutina.push({id: "d1", n: "Piernas", ej: [{id: "e1", n: "Sentadilla", s: 3, a: 5, b: 8, i: 2.5, p: 1, x: ""}, {id: "e2", n: "Dominadas", s: 3, a: 5, b: 10, i: 0, p: 0, x: ""}]});
const sesion = (SB, n, ejs, fin) => SB.datos("entrenamiento").ses.push({id: "s" + Math.random().toString(36).slice(2), n: "Piernas", d: "d1", f: dia(SB, n), t: 1, ej: ejs, x: "", fin: fin === undefined ? Date.now() : fin});
const serie = (k, r, ok = 1) => ({k, r, ok});

test("objetivos: sesiones de entrenamiento hechas desde la fecha (las sin terminar y las viejas no cuentan)", () => {
  const {SB} = abrir(); rutina(SB); [-2, -5, -9].forEach(n => sesion(SB, n, [])); sesion(SB, -60, []); sesion(SB, -1, [], 0);   // una vieja y una sin terminar
  const o = objetivo(SB, {t: "sesiones", n: 6, d: dia(SB, -30)}); assert.equal(SB.mods.objetivos.util.avance(o), 50);
  o.src.n = 3; assert.equal(SB.mods.objetivos.util.avance(o), 100);
});
test("objetivos: marca en kg = la mejor serie hecha del ejercicio (sin importar cuándo, sin series sin marcar, sin importar tildes ni mayúsculas)", () => {
  const {SB} = abrir(); rutina(SB);
  sesion(SB, -90, [{e: "e1", n: "Sentadilla", s: [serie(80, 5), serie(92.5, 3)]}]); sesion(SB, -3, [{e: "e1", n: "sentadilla", s: [serie(85, 5), serie(110, 1, 0)]}]); sesion(SB, -2, [{e: "e2", n: "Dominadas", s: [serie(0, 8)]}]);
  const o = objetivo(SB, {t: "marca", e: "Sentadilla", n: 100}); assert.equal(SB.mods.objetivos.util.avance(o), 93);          // 92,5 de 100 (el 110 no estaba hecho)
  o.src.n = 92.5; assert.equal(SB.mods.objetivos.util.avance(o), 100);
});
test("objetivos: repeticiones = la serie con más repeticiones", () => {
  const {SB} = abrir(); rutina(SB); sesion(SB, -4, [{e: "e2", n: "Dominadas", s: [serie(0, 6), serie(0, 8), serie(0, 12, 0)]}]);
  assert.equal(SB.mods.objetivos.util.avance(objetivo(SB, {t: "reps", e: "Dominadas", n: 10})), 80);
  assert.equal(SB.mods.objetivos.util.avance(objetivo(SB, {t: "reps", e: "Sentadilla", n: 10})), 0);                            // no hizo ese ejercicio
});
test("objetivos: sin el módulo Entrenamiento se usa lo manual", () => {
  const {SB} = abrir(); const o = objetivo(SB, {t: "marca", e: "Sentadilla", n: 100}, {pc: 25}); delete SB.mods.entrenamiento; assert.equal(SB.mods.objetivos.util.avance(o), 25);
});
test("objetivos: la pantalla deja elegir el ejercicio y la meta en kg con coma, y muestra lo medido", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; rutina(SB); sesion(SB, -3, [{e: "e1", n: "Sentadilla", s: [serie(92.5, 3)]}]);
  const o = SB.mods.objetivos.util.crear("100 kg en sentadilla"), el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null};
  SB.pintar = () => SB.mods.objetivos.pantalla(el, o.id); SB.mods.objetivos.pantalla(el, o.id); assert.match(el.innerHTML, /Marca de un ejercicio \(kg\)/); assert.match(el.innerHTML, /Sesiones de entrenamiento/);
  el.onchange({target: {closest: () => ({dataset: {c: "srct"}, value: "marca"})}}); assert.equal(o.src.e, "Sentadilla"); assert.match(el.innerHTML, /<select name="e"/); assert.match(el.innerHTML, /Meta en kg \(ej: 100\)/); assert.doesNotMatch(el.innerHTML, /type="date" name="d"/);
  el.onsubmit({target: {closest: () => ({dataset: {f: "src"}, n: {value: "100"}, e: {value: "Sentadilla"}})}, preventDefault() {}});
  assert.deepEqual(J(o.src), {t: "marca", n: 100, e: "Sentadilla"}); assert.match(el.innerHTML, /92,5 de 100 kg en Sentadilla/); assert.doesNotMatch(el.innerHTML, /desde el/);
  el.onsubmit({target: {closest: () => ({dataset: {f: "src"}, n: {value: "97,5"}, e: {value: "Sentadilla"}})}, preventDefault() {}}); assert.equal(o.src.n, 97.5);
  el.onchange({target: {closest: () => ({dataset: {c: "srct"}, value: "sesiones"})}}); assert.equal(o.src.e, undefined); assert.match(el.innerHTML, /type="date" name="d"/);   // «sesiones» sí cuenta desde una fecha
});
