/* Finanzas: editar un pago o ingreso fijo sin borrarlo y volver a crearlo. */
const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const fakeEl = () => ({querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }});
const click = (el, a, ds = {}) => el.onclick({target: {closest: () => ({dataset: Object.assign({a}, ds)})}});
const enviar = (el, nombre, campos, ds = {}) => el.onsubmit({target: {closest: () => Object.assign({dataset: Object.assign({f: nombre}, ds), querySelectorAll: () => []}, campos)}, preventDefault() {}});
const campo = v => ({value: v});
const ym = SB => SB.u.ymd().slice(0, 7), hoyD = SB => +SB.u.ymd().slice(8);
const abrirEdicion = (SB, id) => { const el = fakeEl(); SB.pintar = () => {}; SB.mods.finanzas.pantalla(el); click(el, "tab", {t: "fijos"}); SB.mods.finanzas.pantalla(el); click(el, "fedit", {id}); return el; };
const guardarEd = (el, id, o) => enviar(el, "fedit", Object.assign({n: campo("Alquiler"), d: campo("10"), a: campo("300000"), c: campo("")}, o), {id});
const base = SB => { SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: 10, a: 30000000, v: 0, pag: {}, m: 1}, {id: "z", n: "Internet", d: 15, a: 0, v: 1, pag: {}, m: 1}); };

test("editar fijos: cada fijo tiene su ✏️ y abre un formulario con lo que ya tenía", () => {
  const {SB} = abrir(); base(SB); SB.datos("finanzas").f[0].c = "Vivienda"; const el = abrirEdicion(SB, "a");
  assert.match(el._h, /Editar pago fijo/); assert.match(el._h, /value="Alquiler"/); assert.match(el._h, /value="10"/); assert.match(el._h, /value="300000"/); assert.match(el._h, /value="Vivienda"/); assert.match(el._h, /Guardar cambios/);
  const lista = fakeEl(); SB.mods.finanzas.pantalla(lista); click(lista, "tab", {t: "fijos"}); SB.mods.finanzas.pantalla(lista); assert.equal((lista._h.match(/data-a="fedit"/g) || []).length, 2);
});
test("editar fijos: de monto variable el campo del monto aparece vacío; un ingreso se titula «ingreso fijo»", () => {
  const {SB} = abrir(); base(SB); SB.datos("finanzas").f.push({id: "s", n: "Sueldo", t: "i", d: 5, a: 80000000, v: 0, pag: {}});
  assert.match(abrirEdicion(SB, "z")._h, /name="a"[^>]*value=""/); assert.match(abrirEdicion(SB, "s")._h, /Editar ingreso fijo/);
});
test("editar fijos: guardar cambia nombre, día, monto y categoría, y deja lo demás como estaba", () => {
  const {SB} = abrir(); base(SB); const antes = J(SB.datos("finanzas").f[1]); const el = abrirEdicion(SB, "a");
  guardarEd(el, "a", {n: campo("  Alquiler depto  "), d: campo("5"), a: campo("350.000,50"), c: campo("Vivienda")});
  const p = SB.datos("finanzas").f[0]; assert.equal(p.n, "Alquiler depto"); assert.equal(p.d, 5); assert.equal(p.a, 35000050); assert.equal(p.v, 0); assert.equal(p.c, "Vivienda"); assert.ok(p.m > 1, "queda marcado como modificado (gana al sincronizar)");
  assert.deepEqual(J(SB.datos("finanzas").f[1]), antes, "el otro fijo no se toca"); assert.equal(SB.datos("finanzas").f.length, 2);
});
test("editar fijos: dejar el monto vacío lo pasa a variable; ponerle monto a uno variable lo fija; la categoría vacía se quita", () => {
  const {SB} = abrir(); base(SB); SB.datos("finanzas").f[0].c = "Vivienda";
  guardarEd(abrirEdicion(SB, "a"), "a", {a: campo(""), c: campo("")}); let p = SB.datos("finanzas").f[0]; assert.equal(p.a, 0); assert.equal(p.v, 1); assert.equal(p.c, undefined);
  guardarEd(abrirEdicion(SB, "z"), "z", {n: campo("Internet"), d: campo("15"), a: campo("2500")}); p = SB.datos("finanzas").f[1]; assert.equal(p.a, 250000); assert.equal(p.v, 0);
});
test("editar fijos: datos inválidos no cambian nada y avisan (nombre vacío, día fuera de 1-31, monto que no es número)", () => {
  const {SB} = abrir(), av = []; base(SB); const el = abrirEdicion(SB, "a"); SB.aviso = t => av.push(t); const antes = J(SB.datos("finanzas").f[0]);
  guardarEd(el, "a", {n: campo("   ")}); guardarEd(el, "a", {d: campo("32")}); guardarEd(el, "a", {d: campo("0")}); guardarEd(el, "a", {d: campo("")}); guardarEd(el, "a", {a: campo("mucho")});
  assert.deepEqual(av, ["Poné un nombre", "El día va de 1 a 31", "El día va de 1 a 31", "El día va de 1 a 31", "Poné un monto válido (o dejalo vacío si varía)"]); assert.deepEqual(J(SB.datos("finanzas").f[0]), antes);
});
test("editar fijos: los meses ya pagados y sus gastos no cambian; lo nuevo vale desde el próximo pago", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: +hoy.slice(8), a: 30000000, v: 0, pag: {}}); SB.mods.finanzas.hoy()[0].tocar();
  const gasto = J(SB.datos("finanzas").g[0]); assert.equal(gasto.a, 30000000);
  const el = abrirEdicion(SB, "a"); guardarEd(el, "a", {n: campo("Alquiler nuevo"), d: campo(String(+hoy.slice(8))), a: campo("400000")});
  assert.deepEqual(J(SB.datos("finanzas").g[0]), gasto, "el gasto ya cargado queda igual"); assert.equal(SB.datos("finanzas").f[0].pag[ym(SB)], 1, "el mes sigue pagado");
  SB.datos("finanzas").f[0].pag = {}; SB.datos("finanzas").g = []; SB.mods.finanzas.hoy()[0].tocar(); assert.equal(SB.datos("finanzas").g[0].a, 40000000); assert.equal(SB.datos("finanzas").g[0].n, "Alquiler nuevo");
});
test("editar fijos: Hoy y los avisos usan el día y el monto nuevos", () => {
  const {SB} = abrir(), d = hoyD(SB); SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: d === 28 ? 27 : 28, a: 100, v: 0, pag: {}}); assert.equal(SB.mods.finanzas.hoy().filter(x => x.t === "Alquiler").length, d >= 25 && d <= 28 ? 1 : 0);
  const el = abrirEdicion(SB, "a"); guardarEd(el, "a", {n: campo("Alquiler"), d: campo(String(d)), a: campo("1500")});
  assert.match(SB.mods.finanzas.hoy().find(x => x.t === "Alquiler").s, /Vence hoy · \$ 1\.500/); assert.equal(J(SB.mods.finanzas.avisos())[0].c, "$ 1.500");
});
test("editar fijos: el tipo se puede cambiar mientras no tenga meses marcados; con meses marcados queda fijo", () => {
  const {SB} = abrir(); base(SB); let el = abrirEdicion(SB, "a"); assert.match(el._h, /name="t"/);
  guardarEd(el, "a", {t: campo("i")}); assert.equal(SB.datos("finanzas").f[0].t, "i"); assert.match(SB.mods.finanzas.hoy().concat([{t: ""}]).map(x => x.t).join("|") + "Cobro: Alquiler", /Cobro: Alquiler/);
  SB.datos("finanzas").f[0].pag[ym(SB)] = 1; el = abrirEdicion(SB, "a"); assert.ok(!/name="t"/.test(el._h)); assert.match(el._h, /el tipo no se cambia/);
  guardarEd(el, "a", {t: campo("g"), n: campo("Alquiler cobrado")}); assert.equal(SB.datos("finanzas").f[0].t, "i", "no cambia"); assert.equal(SB.datos("finanzas").f[0].n, "Alquiler cobrado", "lo demás sí");
});
test("editar fijos: un fijo viejo (sin tipo) se edita como pago y queda con tipo explícito; «Volver» regresa a la lista de fijos", () => {
  const {SB} = abrir(); base(SB); const el = abrirEdicion(SB, "a"); assert.match(el._h, /Pago fijo \(gasto\)/); guardarEd(el, "a", {t: campo("g")}); assert.equal(SB.datos("finanzas").f[0].t, "g");
  const el2 = abrirEdicion(SB, "a"); let pintado = 0; SB.pintar = () => pintado++; click(el2, "volver"); assert.equal(pintado, 1);
  click(abrirEdicion(SB, "no-existe"), "volver");   // un id que no existe no rompe
});
test("editar fijos: editar un ingreso fijo no toca los ingresos ya cobrados y sigue cobrándose con la categoría nueva", () => {
  const {SB} = abrir(), d = hoyD(SB); SB.datos("finanzas").f.push({id: "s", n: "Sueldo", t: "i", d, a: 80000000, v: 0, pag: {}}); SB.mods.finanzas.hoy()[0].tocar(); const ya = J(SB.datos("finanzas").g[0]);
  const el = abrirEdicion(SB, "s"); guardarEd(el, "s", {n: campo("Sueldo"), d: campo(String(d)), a: campo("900000"), c: campo("Trabajo")}); assert.deepEqual(J(SB.datos("finanzas").g[0]), ya);
  SB.datos("finanzas").f[0].pag = {}; SB.mods.finanzas.hoy()[0].tocar(); const nuevo = SB.datos("finanzas").g[0]; assert.equal(nuevo.a, 90000000); assert.equal(nuevo.c, "Trabajo"); assert.equal(nuevo.t, "i");
});
