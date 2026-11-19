/* Finanzas: ingresos fijos (sueldo, alquiler que cobrás…) en la misma lista de fijos que los pagos. */
const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, abrirSW, J} = require("./helpers");
const fakeEl = () => ({querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }});
const click = (el, a, ds = {}) => el.onclick({target: {closest: () => ({dataset: Object.assign({a}, ds)})}});
const enviar = (el, nombre, campos) => el.onsubmit({target: {closest: () => Object.assign({dataset: {f: nombre}, querySelectorAll: () => []}, campos)}, preventDefault() {}});
const campo = v => ({value: v});
const hoyD = SB => +SB.u.ymd().slice(8), ym = SB => SB.u.ymd().slice(0, 7);
const ingreso = (SB, o = {}) => { SB.datos("finanzas").f.push(Object.assign({id: "s", n: "Sueldo", t: "i", d: hoyD(SB), a: 80000000, v: 0, pag: {}}, o)); return SB.datos("finanzas").f[SB.datos("finanzas").f.length - 1]; };

test("ingresos fijos: se crean desde el formulario (con tipo y categoría) y los pagos de siempre siguen igual", () => {
  const {SB} = abrir(); SB.pintar = () => {}; const el = fakeEl(); SB.mods.finanzas.pantalla(el); click(el, "tab", {t: "fijos"}); SB.mods.finanzas.pantalla(el);
  assert.match(el._h, /Ingreso fijo \(ej: sueldo\)/); assert.match(el._h, /Pago fijo \(gasto\)/); assert.match(el._h, /📌 Fijos/);
  enviar(el, "fijo", {t: campo("i"), n: campo("Sueldo"), d: campo("5"), a: campo("800.000"), c: campo("")}); enviar(el, "fijo", {t: campo("g"), n: campo("Alquiler"), d: campo("10"), a: campo("300000"), c: campo("Vivienda")});
  enviar(el, "fijo", {n: campo("Internet"), d: campo("12"), a: campo("")});   // formulario viejo, sin tipo ni categoría
  const F = J(SB.datos("finanzas").f); assert.equal(F[0].t, "i"); assert.equal(F[0].a, 80000000); assert.equal(F[0].v, 0); assert.equal(F[0].c, undefined); assert.equal(F[1].t, "g"); assert.equal(F[1].c, "Vivienda"); assert.equal(F[2].t, "g"); assert.equal(F[2].v, 1);
});
test("ingresos fijos: aparecen en Hoy como «Cobro: …», con su frase propia y ordenados con los pagos por fecha", () => {
  const {SB} = abrir(), d = hoyD(SB); ingreso(SB); if (d > 1) ingreso(SB, {id: "a", n: "Honorarios", d: d - 1, a: 5000000});
  SB.datos("finanzas").f.push({id: "p", n: "Alquiler", d, a: 30000000, v: 0, pag: {}});
  const h = SB.mods.finanzas.hoy(); const sueldo = h.find(x => x.t === "Cobro: Sueldo"); assert.ok(sueldo); assert.match(sueldo.s, /Cobrás hoy · \$ 800\.000/); assert.ok(h.find(x => x.t === "Alquiler" && /Vence hoy/.test(x.s)), "el pago sigue con su frase");
  if (d > 1) { const a = h.find(x => x.t === "Cobro: Honorarios"); assert.match(a.s, /Atrasado: tenías que cobrar el/); assert.ok(h.indexOf(a) < h.indexOf(sueldo), "el atrasado va primero"); }
});
test("ingresos fijos: cobrarlo con monto fijo crea un ingreso (categoría Sueldo por el nombre), tilda el mes y sale de Hoy", () => {
  const {SB} = abrir(); ingreso(SB); const x = SB.mods.finanzas.hoy().find(y => /Cobro/.test(y.t)); x.tocar();
  const D = J(SB.datos("finanzas")); assert.equal(D.f[0].pag[ym(SB)], 1); assert.equal(D.g.length, 1); assert.equal(D.g[0].t, "i"); assert.equal(D.g[0].a, 80000000); assert.equal(D.g[0].c, "Sueldo"); assert.equal(D.g[0].p, "s"); assert.equal(D.g[0].f, SB.u.ymd());
  assert.equal(SB.mods.finanzas.hoy().filter(y => /Cobro/.test(y.t)).length, 0); assert.ok(!/sin cobrar/.test(SB.mods.finanzas.semana().join(" ")), "cobrado: no figura como pendiente");
});
test("ingresos fijos: la categoría elegida manda; un nombre sin pista queda en «Otros ingresos»", () => {
  const {SB} = abrir(); ingreso(SB, {c: "Trabajo extra"}); ingreso(SB, {id: "o", n: "Jubilación"}); SB.mods.finanzas.hoy().forEach(x => x.tocar());
  const g = J(SB.datos("finanzas").g).reverse(); assert.deepEqual(g.map(x => [x.n, x.c]), [["Sueldo", "Trabajo extra"], ["Jubilación", "Otros ingresos"]]);
});
test("ingresos fijos: de monto variable pregunta «cuánto cobraste»; vacío lo tilda sin monto; cancelar no hace nada", () => {
  const textos = [], a = abrir({extra: {prompt: t => { textos.push(t); return "1.500,50"; }}}); ingreso(a.SB, {a: 0, v: 1}); a.SB.mods.finanzas.hoy()[0].tocar();
  assert.match(textos[0], /¿Cuánto cobraste de «Sueldo»\?/); assert.equal(J(a.SB.datos("finanzas")).g[0].a, 150050); assert.equal(J(a.SB.datos("finanzas")).g[0].t, "i");
  const b = abrir({extra: {prompt: () => ""}}); ingreso(b.SB, {a: 0, v: 1}); b.SB.mods.finanzas.hoy()[0].tocar(); assert.equal(b.SB.datos("finanzas").g.length, 0); assert.equal(b.SB.datos("finanzas").f[0].pag[ym(b.SB)], 1);
  const c = abrir({extra: {prompt: () => null}}); ingreso(c.SB, {a: 0, v: 1}); c.SB.mods.finanzas.hoy()[0].tocar(); assert.equal(Object.keys(c.SB.datos("finanzas").f[0].pag).length, 0);
});
test("ingresos fijos: desmarcar el cobro quita el ingreso que había generado; borrar ese ingreso desmarca el cobro; el balance acompaña", () => {
  const {SB} = abrir({extra: {confirm: () => true}}); SB.pintar = () => {}; ingreso(SB); SB.mods.finanzas.hoy()[0].tocar(); const el = fakeEl(); SB.mods.finanzas.pantalla(el); click(el, "tab", {t: "fijos"}); SB.mods.finanzas.pantalla(el);
  click(el, "fok", {id: "s"}); assert.equal(SB.datos("finanzas").g.length, 0); assert.equal(SB.datos("finanzas").f[0].pag[ym(SB)], undefined);
  click(el, "fok", {id: "s"}); assert.equal(SB.datos("finanzas").g.length, 1); const gid = SB.datos("finanzas").g[0].id;
  click(el, "tab", {t: "mes"}); SB.mods.finanzas.pantalla(el); assert.match(el._h, /\+\$ 800\.000/); assert.match(el._h, /Ingresos <b>\$ 800\.000<\/b>/);
  click(el, "del", {id: gid}); assert.equal(SB.datos("finanzas").g.length, 0, "se borró el movimiento"); assert.equal(SB.datos("finanzas").f[0].pag[ym(SB)], undefined, "y el cobro vuelve a quedar pendiente");
  assert.ok(SB.mods.finanzas.hoy().some(x => /Cobro: Sueldo/.test(x.t)), "vuelve a salir en Hoy");
});
test("ingresos fijos: avisos — el día antes y el mismo día (los pagos siguen con 3 y 1)", () => {
  const {SB} = abrir(); ingreso(SB, {d: 28}); SB.datos("finanzas").f.push({id: "p", n: "Alquiler", d: 28, a: 100, v: 0, pag: {}});
  const ev = J(SB.mods.finanzas.avisos()), i = ev.find(e => e.k === "s"), p = ev.find(e => e.k === "p"); assert.equal(i.t, "Cobro: Sueldo"); assert.deepEqual(i.av, [1]); assert.equal(i.hoy, true); assert.equal(i.c, "$ 800.000"); assert.equal(p.t, "Pago: Alquiler"); assert.deepEqual(p.av, [3, 1]);
});
test("ingresos fijos: el service worker avisa «Mañana: Cobro: Sueldo» y «Hoy: Cobro: Sueldo», una vez cada uno", () => {
  const {SB} = abrir(), {avisosPendientes} = abrirSW(); SB.datos("finanzas").f.push({id: "s", n: "Sueldo", t: "i", d: 5, a: 80000000, v: 0, pag: {}});
  const ev = [{f: "2026-12-05", t: "Cobro: Sueldo", c: "$ 800.000", k: "s", av: [1], hoy: true}], ya = [], sal = [];
  for (let d = 1; d <= 6; d++) avisosPendientes(ev, new Date("2026-12-0" + d + "T09:00:00"), ya).forEach(x => { ya.push(x.key); sal.push(d + ": " + x.titulo); });
  assert.deepEqual(sal, ["4: Mañana: Cobro: Sueldo", "5: Hoy: Cobro: Sueldo"]);
});
test("ingresos fijos: la revisión semanal avisa los que faltan cobrar y la búsqueda los distingue de los pagos", () => {
  const {SB} = abrir(); ingreso(SB); SB.datos("finanzas").f.push({id: "p", n: "Sueldo del hogar", d: 3, a: 100, v: 0, pag: {}});
  assert.match(SB.mods.finanzas.semana().join(" | "), /1 ingreso fijo sin cobrar este mes/); assert.match(SB.mods.finanzas.semana().join(" | "), /1 pago fijo sin pagar este mes/);
  const b = J(SB.mods.finanzas.buscar("sueldo")).map(x => x.s); assert.ok(b.some(s => /^ingreso fijo · día/.test(s))); assert.ok(b.some(s => /^pago fijo · día/.test(s)));
  SB.mods.finanzas.hoy().find(x => /Cobro/.test(x.t)).tocar(); assert.ok(!/ingreso fijo sin cobrar/.test(SB.mods.finanzas.semana().join(" ")));
});
test("ingresos fijos: la pantalla muestra las dos secciones, lo que falta cobrar y pagar, y cuánto te queda; sin variables ni cobrados", () => {
  const {SB} = abrir(); SB.pintar = () => {}; ingreso(SB, {d: 5}); ingreso(SB, {id: "x", n: "Extra", a: 0, v: 1, d: 6});
  SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: 10, a: 30000000, v: 0, pag: {}}, {id: "b", n: "Internet", d: 12, a: 0, v: 1, pag: {}});
  const el = fakeEl(); SB.mods.finanzas.pantalla(el); click(el, "tab", {t: "fijos"}); SB.mods.finanzas.pantalla(el);
  assert.match(el._h, /Ingresos fijos ·/); assert.match(el._h, /Pagos fijos ·/); assert.match(el._h, /Falta cobrar: <b>\$ 800\.000<\/b>/); assert.match(el._h, /Falta pagar: <b>\$ 300\.000<\/b>/);
  assert.match(el._h, /Te queda <b[^>]*>\$ 500\.000<\/b> para lo demás/); assert.match(el._h, /No cuenta los de monto variable/); assert.match(el._h, /cobrás el /); assert.match(el._h, /Marcar cobrado/);
  SB.datos("finanzas").f[0].pag[ym(SB)] = 1; SB.mods.finanzas.pantalla(el); assert.ok(!/Falta cobrar/.test(el._h), "ya cobrado: no falta");
});
test("ingresos fijos: un pago fijo viejo (sin tipo ni categoría) sigue siendo un pago y genera un gasto como antes", () => {
  const {SB} = abrir(); SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: hoyD(SB), a: 30000000, v: 0, pag: {}}); const x = SB.mods.finanzas.hoy()[0]; assert.equal(x.t, "Alquiler"); assert.match(x.s, /Vence hoy/); x.tocar();
  assert.equal(SB.datos("finanzas").g[0].t, "g"); assert.equal(SB.datos("finanzas").g[0].c, "Vivienda");
});
