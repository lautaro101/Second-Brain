const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const dow = f => new Date(f + "T12:00:00").getDay();

/* ---- los tres módulos están registrados y tienen todo lo que pide el núcleo ---- */
test("Estudio, Programación y Finanzas figuran en la lista, se registran sin fallos y no quedan en «Para después»", () => {
  const {SB, ctx} = abrir(); assert.deepEqual(J(SB.fallos), {});
  ["estudio", "programacion", "finanzas"].forEach(id => { assert.ok(SB.mods[id], id); assert.ok(ctx.SB_ARCHIVOS.includes("modulos/" + id + ".js"), id); });
  const pend = ctx.SB_PARA_DESPUES.map(x => x[0]); ["Estudio", "Programación", "Finanzas"].forEach(n => assert.ok(!pend.includes(n), n + " no debería estar en «Para después»"));
  assert.equal(SB.mods.finanzas.esquema, 2);
});
test("las pantallas de los tres módulos no tiran error al dibujarse (vacíos)", () => {
  const {SB} = abrir({extra: {setInterval, clearInterval}}); SB.aviso = () => {};
  const vista = (id, sub) => { const el = {querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; assert.doesNotThrow(() => SB.mods[id].pantalla(el, sub || ""), id); assert.ok(el._h.length > 50, id); return el._h; };
  ["estudio", "programacion", "finanzas"].forEach(id => vista(id));
  // y con datos cargados (incluida la pantalla de un proyecto)
  SB.datos("estudio").m.push({id: "m", n: "Álgebra", d: [1]}); SB.datos("estudio").e.push({id: "e", m: "m", k: "parcial", n: "U1", f: SB.u.sumar(SB.u.ymd(), 3), nota: 7.5, h: 0});
  SB.datos("programacion").p.push({id: "p", n: "Robot", e: "curso", tec: "JS", url: "https://x.test", c: 1, m: 1}); SB.datos("programacion").a.push({id: "a", n: "React", e: "estudiando", c: 1}); SB.datos("programacion").r.push({id: "r", a: "a", n: "Curso", h: 0});
  SB.mods.finanzas.captura.guardar("gasto 3500 super"); SB.datos("finanzas").f.push({id: "f", n: "Alquiler", d: 5, a: 100000, v: 0, pag: {}}); SB.datos("finanzas").b.Comida = 500000;
  ["estudio", "programacion", "finanzas"].forEach(id => vista(id)); assert.match(vista("programacion", "p"), /Robot/);
});

/* ---- Finanzas ---- */
test("finanzas: los montos pasan a centavos enteros (formato argentino)", () => {
  const {SB} = abrir(), c = SB.mods.finanzas.montoACentavos;
  assert.equal(c("3500"), 350000); assert.equal(c("12.000,50"), 1200050); assert.equal(c("3.500"), 350000); assert.equal(c("1,5"), 150); assert.equal(c("0,07"), 7);
  assert.equal(c("800000"), 80000000); assert.equal(c("gasto 3500 super"), 350000); assert.equal(c("sin número"), 0); assert.equal(c("19,99"), 1999);
});
test("finanzas: captura «gasto 3500 super» guarda un gasto de 350000 centavos en Comida", () => {
  const {SB} = abrir(); SB.mods.finanzas.captura.guardar("gasto 3500 super");
  const g = J(SB.datos("finanzas").g); assert.equal(g.length, 1); assert.equal(g[0].t, "g"); assert.equal(g[0].a, 350000); assert.equal(g[0].c, "Comida"); assert.equal(g[0].n, "super"); assert.ok(Number.isInteger(g[0].a));
});
test("finanzas: «nafta 12.000,50» es un gasto de Transporte; «ingreso 800000 sueldo» e «gasté…/cobré…» con tilde andan", () => {
  const {SB} = abrir(), F = SB.mods.finanzas;
  F.captura.guardar("nafta 12.000,50"); F.captura.guardar("ingreso 800000 sueldo"); F.captura.guardar("gasté 2000 en farmacia"); F.captura.guardar("cobré 5000 honorarios");
  const g = J(SB.datos("finanzas").g).reverse();
  assert.deepEqual(g.map(x => [x.t, x.a, x.c]), [["g", 1200050, "Transporte"], ["i", 80000000, "Sueldo"], ["g", 200000, "Salud"], ["i", 500000, "Sueldo"]]);
});
test("finanzas: una captura sin monto no se pierde (tira error y el núcleo la deja en el Inbox)", () => {
  const {SB} = abrir(); assert.throws(() => SB.mods.finanzas.captura.guardar("gasto super"), /monto/);
  assert.equal(SB.reglas.rutear("gasto super"), null); assert.equal(SB.datos("finanzas").g.length, 0);
});
test("finanzas: la regla del Inbox manda gasto / gasté / ingreso / cobré a Finanzas", () => {
  const {SB} = abrir(); ["gasto 100 pan", "gasté 100 pan", "ingreso 100 x", "cobré 100 x"].forEach(t => assert.equal(SB.reglas.regla(t).d, "finanzas", t));
});
test("finanzas: sin Finanzas activo, la regla no manda nada (módulo apagado)", () => {
  const {SB} = abrir({datos: {sb_cfg: JSON.stringify({off: ["finanzas"]})}}); assert.equal(SB.reglas.regla("gasto 100 pan"), null);
});
test("finanzas: pago fijo con monto → al pagarlo queda como gasto y el mes cierra; al deshacer se va", () => {
  const {SB} = abrir(), F = SB.mods.finanzas, hoy = SB.u.ymd(), ym = hoy.slice(0, 7), dia = +hoy.slice(8);
  SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: dia, a: 30000000, v: 0, pag: {}});
  const h = F.hoy(); assert.equal(h.length, 1); assert.match(h[0].s, /Vence hoy/);
  h[0].tocar(); const D = J(SB.datos("finanzas")); assert.equal(D.f[0].pag[ym], 1); assert.equal(D.g.length, 1); assert.equal(D.g[0].a, 30000000); assert.equal(D.g[0].c, "Vivienda"); assert.equal(D.g[0].p, "a");
  assert.equal(F.hoy().length, 0, "pagado: ya no aparece en Hoy");
});
test("finanzas: pago fijo de monto variable pregunta cuánto; vacío lo tilda sin monto; cancelar no hace nada", () => {
  const r = abrir({extra: {prompt: () => "4.500"}}), F = r.SB.mods.finanzas, hoy = r.SB.u.ymd();
  r.SB.datos("finanzas").f.push({id: "i", n: "Internet", d: +hoy.slice(8), a: 0, v: 1, pag: {}}); F.hoy()[0].tocar();
  assert.equal(J(r.SB.datos("finanzas")).g[0].a, 450000);
  const s = abrir({extra: {prompt: () => ""}}); s.SB.datos("finanzas").f.push({id: "i", n: "Internet", d: +hoy.slice(8), a: 0, v: 1, pag: {}}); s.SB.mods.finanzas.hoy()[0].tocar();
  assert.equal(s.SB.datos("finanzas").g.length, 0); assert.equal(Object.keys(s.SB.datos("finanzas").f[0].pag).length, 1);
  const c = abrir({extra: {prompt: () => null}}); c.SB.datos("finanzas").f.push({id: "i", n: "Internet", d: +hoy.slice(8), a: 0, v: 1, pag: {}}); c.SB.mods.finanzas.hoy()[0].tocar();
  assert.equal(Object.keys(c.SB.datos("finanzas").f[0].pag).length, 0);
});
test("finanzas: Hoy muestra los fijos que vencen en 3 días o menos (o atrasados), no los lejanos", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), ym = hoy.slice(0, 7), fin = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
  const casos = [["cerca", +hoy.slice(8) + 2], ["lejos", +hoy.slice(8) + 6], ["atrasado", +hoy.slice(8) - 1]].filter(([, d]) => d >= 1 && d <= fin);
  casos.forEach(([n, d]) => SB.datos("finanzas").f.push({id: n, n, d, a: 100, v: 0, pag: {}}));
  const t = J(SB.mods.finanzas.hoy().map(x => x.t)); if (casos.some(c => c[0] === "cerca")) assert.ok(t.includes("cerca")); if (casos.some(c => c[0] === "lejos")) assert.ok(!t.includes("lejos")); if (casos.some(c => c[0] === "atrasado")) assert.ok(t.includes("atrasado"));
});
test("finanzas: avisos de pagos fijos a 3 y 1 día antes y el mismo día (k propio y av [3,1])", () => {
  const {SB} = abrir(); SB.datos("finanzas").f.push({id: "a", n: "Alquiler", d: 10, a: 100, v: 0, pag: {}});
  const a = J(SB.mods.finanzas.avisos()); assert.equal(a.length, 1); assert.deepEqual(a[0].av, [3, 1]); assert.equal(a[0].hoy, true); assert.equal(a[0].k, "a"); assert.match(a[0].t, /Alquiler/); assert.ok(a[0].f >= SB.u.ymd());
});
test("finanzas: presupuesto — avisa al cruzar el 80 % y el 100 %, una vez cada uno", async () => {
  const avisos = [], r = abrir({extra: {}}); r.SB.aviso = t => avisos.push(t); const F = r.SB.mods.finanzas;
  r.SB.datos("finanzas").b.Comida = 100000;   // tope $1.000
  F.captura.guardar("gasto 700 super"); F.captura.guardar("gasto 150 super"); F.captura.guardar("gasto 50 super"); F.captura.guardar("gasto 200 super");
  await new Promise(ok => setTimeout(ok, 2100));
  assert.equal(avisos.length, 2); assert.match(avisos[0], /85 %/); assert.match(avisos[1], /Te pasaste/);
});
test("finanzas: Hoy muestra los presupuestos al 80 % o más (máximo 2)", () => {
  const {SB} = abrir(), F = SB.mods.finanzas; SB.aviso = () => {}; ["Comida", "Ocio", "Ropa"].forEach(c => { SB.datos("finanzas").b[c] = 10000; F.captura.guardar("gasto 95 " + (c === "Comida" ? "super" : c === "Ocio" ? "cine" : "ropa")); });
  assert.equal(F.hoy().filter(x => /Presupuesto/.test(x.t)).length, 2);
});
test("finanzas: migración 1 → 2 suma los presupuestos y no toca lo demás", () => {
  const datos = {sb_m_finanzas: JSON.stringify({v: 1, d: {g: [{id: "1", t: "g", a: 500, c: "Comida", n: "", f: "2026-01-02"}], f: []}})};
  const {SB, ls} = abrir({datos}); assert.deepEqual(J(SB.fallos), {}); assert.deepEqual(J(SB.datos("finanzas").b), {}); assert.equal(SB.datos("finanzas").g[0].a, 500);
  assert.equal(JSON.parse(ls._d.sb_m_finanzas).v, 2); assert.equal(JSON.parse(ls._d.sb_bak_finanzas).v, 1);
});
test("finanzas: datos con forma rara no rompen el módulo", () => {
  const {SB} = abrir({datos: {sb_m_finanzas: JSON.stringify({v: 2, d: {g: [], f: null}})}}); assert.deepEqual(J(SB.fallos), {}); assert.doesNotThrow(() => SB.mods.finanzas.hoy()); assert.deepEqual(J(SB.datos("finanzas").f), []);
});
test("finanzas: la búsqueda encuentra por nota, categoría y monto", () => {
  const {SB} = abrir(), F = SB.mods.finanzas; F.captura.guardar("gasto 3500 super"); F.captura.guardar("nafta 12.000,50");
  assert.equal(F.buscar("super").length, 1); assert.equal(F.buscar("transporte").length, 1); assert.equal(F.buscar("3500").length, 1);
});

/* ---- Estudio ---- */
test("estudio: la cursada del día aparece en Hoy; las evaluaciones próximas también y las lejanas no", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), E = SB.datos("estudio");
  E.m.push({id: "m1", n: "Álgebra", d: [dow(hoy)]}, {id: "m2", n: "Física", d: []});
  E.e.push({id: "e1", m: "m1", k: "parcial", n: "Unidad 1", f: SB.u.sumar(hoy, 5), nota: null, h: 0}, {id: "e2", m: "m2", k: "parcial", n: "", f: SB.u.sumar(hoy, 9), nota: null, h: 0},
    {id: "e3", m: "m2", k: "entrega", n: "TP", f: SB.u.sumar(hoy, 3), nota: null, h: 0}, {id: "e4", m: "m2", k: "entrega", n: "TP2", f: SB.u.sumar(hoy, 4), nota: null, h: 0});
  const t = J(SB.mods.estudio.hoy().map(x => x.t)); assert.ok(t.includes("Cursada: Álgebra")); assert.ok(t.some(x => /Parcial: Unidad 1/.test(x))); assert.ok(t.some(x => /Entrega: TP ·/.test(x)));
  assert.ok(!t.some(x => /Física/.test(x) && /Parcial/.test(x)), "parcial a 9 días: todavía no"); assert.ok(!t.some(x => /TP2/.test(x)), "entrega a 4 días: todavía no");
});
test("estudio: tocar una entrega en Hoy la marca hecha y deja de aparecer", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("estudio").m.push({id: "m", n: "Física", d: []}); SB.datos("estudio").e.push({id: "e", m: "m", k: "entrega", n: "TP", f: hoy, nota: null, h: 0});
  SB.mods.estudio.hoy()[0].tocar(); assert.equal(SB.datos("estudio").e[0].h, 1); assert.equal(SB.mods.estudio.hoy().length, 0);
});
test("estudio: avisos — parciales y finales 7, 3 y 1 día antes; entregas 3 y 1; y el mismo día; las hechas no", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), f = SB.u.sumar(hoy, 2); SB.datos("estudio").m.push({id: "m", n: "Álgebra", d: []});
  SB.datos("estudio").e.push({id: "p", m: "m", k: "parcial", n: "", f, nota: null, h: 0}, {id: "t", m: "m", k: "entrega", n: "TP", f, nota: null, h: 0}, {id: "h", m: "m", k: "final", n: "", f, nota: null, h: 1});
  const a = J(SB.mods.estudio.avisos()); assert.equal(a.length, 2); assert.deepEqual(a.find(x => x.k === "p").av, [7, 3, 1]); assert.deepEqual(a.find(x => x.k === "t").av, [3, 1]); assert.ok(a.every(x => x.hoy === true)); assert.equal(a[0].t, "Parcial de Álgebra");
});
test("estudio: los avisos llegan al service worker en el orden correcto (7, 3, 1 y el mismo día)", () => {
  const {SB} = abrir(), {abrirSW} = require("./helpers"), {avisosPendientes} = abrirSW(); SB.datos("estudio").m.push({id: "m", n: "Álgebra", d: []});
  SB.datos("estudio").e.push({id: "p", m: "m", k: "parcial", n: "", f: "2026-11-23", nota: null, h: 0}); const ev = J(SB.mods.estudio.avisos()), ya = [], sal = [];
  for (let d = 14; d <= 24; d++) avisosPendientes(ev, new Date("2026-11-" + d + "T09:00:00"), ya).forEach(x => { ya.push(x.key); sal.push(d + ": " + x.titulo); });
  assert.deepEqual(sal, ["16: En 7 días: Parcial de Álgebra", "20: En 3 días: Parcial de Álgebra", "22: Mañana: Parcial de Álgebra", "23: Hoy: Parcial de Álgebra"]);
});
test("estudio: la revisión semanal suma los minutos de los últimos 7 días", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("estudio").s.push({id: "1", m: "x", f: hoy, min: 90, c: 1}, {id: "2", m: "x", f: SB.u.sumar(hoy, -3), min: 30, c: 2}, {id: "3", m: "x", f: SB.u.sumar(hoy, -20), min: 500, c: 3});
  assert.match(SB.mods.estudio.semana()[0], /2 h/);
});

/* ---- Programación ---- */
test("programación: lo capturado como «Proyecto» entra como idea", () => {
  const {SB} = abrir(); SB.mods.programacion.captura.guardar("App de gastos con Arduino"); const p = SB.datos("programacion").p;
  assert.equal(p.length, 1); assert.equal(p[0].e, "idea"); assert.equal(p[0].n, "App de gastos con Arduino");
});
test("programación: un proyecto en curso sin movimiento hace 7 días o más aparece en Hoy; uno reciente no", () => {
  const {SB} = abrir(), d8 = Date.now() - 8 * 864e5, P = SB.datos("programacion");
  P.p.push({id: "a", n: "Viejo", e: "curso", tec: "", url: "", c: d8, m: d8}, {id: "b", n: "Nuevo", e: "curso", tec: "", url: "", c: Date.now(), m: Date.now()}, {id: "c", n: "Pausado", e: "pausa", tec: "", url: "", c: d8, m: d8});
  const h = J(SB.mods.programacion.hoy()); assert.equal(h.length, 1); assert.equal(h[0].t, "Viejo"); assert.match(h[0].s, /8 días/);
  P.b.push({id: "x", p: "a", f: SB.u.ymd(), x: "avancé", c: Date.now()}); assert.equal(SB.mods.programacion.hoy().length, 0, "una entrada de bitácora cuenta como movimiento");
});
test("programación: lo que estás estudiando muestra su siguiente recurso en Hoy; al tildarlo pasa al que sigue", () => {
  const {SB} = abrir(), P = SB.datos("programacion"); P.a.push({id: "t", n: "React", e: "estudiando", c: 1}, {id: "u", n: "Rust", e: "pausa", c: 2});
  P.r.push({id: "r1", a: "t", n: "Tutorial oficial", h: 0}, {id: "r2", a: "t", n: "Curso", h: 0}, {id: "r3", a: "u", n: "Libro", h: 0});
  let h = J(SB.mods.programacion.hoy()); assert.equal(h.length, 1); assert.match(h[0].t, /React: Tutorial oficial/);
  SB.mods.programacion.hoy()[0].tocar(); h = J(SB.mods.programacion.hoy()); assert.match(h[0].t, /React: Curso/); assert.ok(SB.datos("programacion").r[0].h > 0);
});
test("programación: sus tareas y notas se enlazan por la etiqueta del proyecto", () => {
  const {SB} = abrir(); SB.mods.tareas.crear("Soldar placa", "", "mi-robot"); SB.mods.tareas.crear("Otra cosa", "", "otro"); SB.mods.notas.crear("Plan\n#mi-robot servo");
  assert.deepEqual(J(SB.mods.tareas.porProyecto("mi-robot").map(t => t.t)), ["Soldar placa"]); assert.equal(SB.mods.notas.porEtiqueta("mi-robot").length, 1); assert.equal(SB.mods.notas.porEtiqueta("MI-ROBOT").length, 1);
  const id = SB.datos("tareas").t[1].id; SB.mods.tareas.alternar(id); assert.ok(SB.datos("tareas").t.find(t => t.id === id).h > 0);
});
test("programación: la búsqueda encuentra proyectos, temas y bitácora", () => {
  const {SB} = abrir(), P = SB.datos("programacion"); P.p.push({id: "a", n: "Robot", e: "curso", tec: "Arduino", url: "", c: 1, m: 1}); P.a.push({id: "t", n: "React", e: "estudiando", c: 1}); P.b.push({id: "b", p: "a", f: "2026-01-01", x: "calibré el servo", c: 1});
  assert.equal(SB.mods.programacion.buscar("arduino").length, 1); assert.equal(SB.mods.programacion.buscar("react").length, 1); assert.equal(SB.mods.programacion.buscar("servo").length, 1);
});

/* ---- Notas y Tareas siguen igual para quien no use los módulos nuevos ---- */
test("estudio: «Nota de clase» crea la nota con #clase y la etiqueta de la materia, y la materia la lista", () => {
  const {SB} = abrir(); SB.mods.notas.crear("Clase: Álgebra\n#clase #algebra\n\nlimites");
  assert.equal(SB.mods.notas.porEtiqueta("algebra").length, 1); assert.equal(SB.mods.notas.porEtiqueta("clase").length, 1);
});

/* ---- Tareas: niveles y prioridad por fecha ---- */
test("tareas: nivel por cercanía de la fecha (3 días por defecto): urgente, prioridad, próxima y normal", () => {
  const {SB} = abrir(), h = SB.u.ymd(), n = SB.mods.tareas.nivel, t = d => ({f: SB.u.sumar(h, d), h: 0});
  assert.equal(n(t(-2), h), "urgente"); assert.equal(n(t(0), h), "urgente"); assert.equal(n(t(1), h), "prioridad"); assert.equal(n(t(3), h), "prioridad");
  assert.equal(n(t(4), h), "proxima"); assert.equal(n(t(7), h), "proxima"); assert.equal(n(t(8), h), "normal"); assert.equal(n({f: "", h: 0}, h), "normal"); assert.equal(n({f: h, h: 5}, h), "normal");
});
test("tareas: cada tarea puede tener sus propios días y el número general se puede cambiar", () => {
  const {SB} = abrir(), h = SB.u.ymd(), n = SB.mods.tareas.nivel, f = SB.u.sumar(h, 6);
  assert.equal(n({f, h: 0}, h), "proxima"); assert.equal(n({f, h: 0, a: 7}, h), "prioridad"); assert.equal(n({f: SB.u.sumar(h, 2), h: 0, a: 1}, h), "proxima");
  SB.almacen.poner("sb_tareas_prio", 10); assert.equal(n({f, h: 0}, h), "prioridad", "el general también cambia");
  SB.almacen.poner("sb_tareas_prio", 999); assert.equal(n({f: SB.u.sumar(h, 4), h: 0}, h), "proxima", "un valor inválido vuelve a 3");
});
test("tareas: Hoy muestra las que están en prioridad, ordenadas por fecha, con los días que faltan", () => {
  const {SB} = abrir(), h = SB.u.ymd(), T = SB.datos("tareas").t;
  T.push({id: "1", t: "En dos", f: SB.u.sumar(h, 2), p: "", h: 0, c: 1}, {id: "2", t: "Mañana", f: SB.u.sumar(h, 1), p: "", h: 0, c: 2}, {id: "3", t: "Lejos", f: SB.u.sumar(h, 9), p: "", h: 0, c: 3}, {id: "4", t: "Su plazo largo", f: SB.u.sumar(h, 9), p: "", h: 0, c: 4, a: 10});
  const o = J(SB.mods.tareas.hoy().map(x => x.t + "|" + x.s)); assert.deepEqual(o, ["Mañana|Prioridad · vence en 1 día", "En dos|Prioridad · vence en 2 días", "Su plazo largo|Prioridad · vence en 9 días"]);
});
test("tareas: la captura rápida y la pantalla siguen andando con el campo nuevo", () => {
  const {SB} = abrir({extra: {}}); SB.mods.tareas.captura.guardar("Comprar #taller"); SB.mods.tareas.crear("Con fecha", SB.u.sumar(SB.u.ymd(), 1), "x");
  const el = {querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; SB.mods.tareas.pantalla(el); assert.match(el._h, /Prioridad/); assert.match(el._h, /data-c="gp"/);
});

/* ---- Tareas: prioridad manual, orden de Hoy y aviso al entrar en Prioridad ---- */
test("tareas: la ⭐ manual la deja en Prioridad aunque falte mucho o no tenga fecha; urgente sigue siendo urgente", () => {
  const {SB} = abrir(), h = SB.u.ymd(), n = SB.mods.tareas.nivel;
  assert.equal(n({f: SB.u.sumar(h, 20), h: 0, u: 1}, h), "prioridad"); assert.equal(n({f: "", h: 0, u: 1}, h), "prioridad"); assert.equal(n({f: SB.u.sumar(h, 5), h: 0, u: 1}, h), "prioridad");
  assert.equal(n({f: SB.u.sumar(h, -1), h: 0, u: 1}, h), "urgente"); assert.equal(n({f: "", h: 0}, h), "normal"); assert.equal(n({f: "", h: 9, u: 1}, h), "normal", "hecha: no cuenta");
});
test("tareas: Hoy ordena vencidas (la más vieja primero), de hoy, prioritarias por fecha y prioritarias sin fecha; sin repetir", () => {
  const {SB} = abrir(), h = SB.u.ymd(), T = SB.datos("tareas").t, s = d => SB.u.sumar(h, d);
  T.push({id: "1", t: "Estrella sin fecha", f: "", p: "", h: 0, c: 1, u: 1}, {id: "2", t: "Prioridad en 2", f: s(2), p: "", h: 0, c: 2}, {id: "3", t: "Hoy", f: h, p: "", h: 0, c: 3}, {id: "4", t: "Vencida hace 1", f: s(-1), p: "", h: 0, c: 4},
    {id: "5", t: "Vencida hace 5", f: s(-5), p: "", h: 0, c: 5}, {id: "6", t: "Estrella lejos", f: s(30), p: "", h: 0, c: 6, u: 1}, {id: "7", t: "Normal sin fecha", f: "", p: "", h: 0, c: 7});
  const o = J(SB.mods.tareas.hoy().map(x => x.t)); assert.deepEqual(o, ["Vencida hace 5", "Vencida hace 1", "Hoy", "Prioridad en 2", "Estrella lejos", "Estrella sin fecha", "Normal sin fecha"]);
  assert.match(SB.mods.tareas.hoy().find(x => x.t === "Estrella sin fecha").s, /⭐/);
});
test("tareas: alternar la ⭐ desde la pantalla y crear con ⭐ desde el formulario", () => {
  const {SB} = abrir(); SB.pintar = () => {}; const el = {querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; SB.mods.tareas.pantalla(el);
  el.onsubmit({target: {closest: () => ({dataset: {f: "n"}, t: {value: "Llamar"}, f: {value: ""}, p: {value: ""}, a: {value: ""}, u: {checked: true}})}, preventDefault() {}}); assert.equal(SB.datos("tareas").t[0].u, 1);
  const id = SB.datos("tareas").t[0].id; el.onclick({target: {closest: () => ({dataset: {a: "star", id}})}}); assert.equal(SB.datos("tareas").t[0].u, undefined);
  el.onclick({target: {closest: () => ({dataset: {a: "star", id}})}}); assert.equal(SB.datos("tareas").t[0].u, 1);
});
test("tareas: el service worker avisa al entrar en Prioridad (3 días), el día antes y el mismo día; una vez cada uno", () => {
  const {SB} = abrir(), {abrirSW} = require("./helpers"), {avisosPendientes} = abrirSW(); SB.datos("tareas").t.push({id: "t", t: "Entregar TP", f: "2026-11-23", p: "", h: 0, c: 1}, {id: "h", t: "Ya hecha", f: "2026-11-23", p: "", h: 5, c: 2});
  const ev = J(SB.mods.tareas.avisos()), ya = [], sal = []; assert.equal(ev.length, 1); assert.deepEqual(ev[0].av, [3, 1]);
  for (let d = 14; d <= 24; d++) avisosPendientes(ev, new Date("2026-11-" + d + "T09:00:00"), ya).forEach(x => { ya.push(x.key); sal.push(d + ": " + x.titulo + " — " + x.cuerpo); });
  assert.deepEqual(sal, ["20: En 3 días: Tarea — Entregar TP", "22: Mañana: Tarea — Entregar TP", "23: Hoy: Tarea — Entregar TP"]);
});
test("tareas: el aviso de entrada en Prioridad respeta los días propios de la tarea", () => {
  const {SB} = abrir(); SB.datos("tareas").t.push({id: "t", t: "Grande", f: "2026-11-30", p: "", h: 0, c: 1, a: 7}, {id: "u", t: "Rápida", f: "2026-11-30", p: "", h: 0, c: 2, a: 0});
  const ev = J(SB.mods.tareas.avisos()); assert.deepEqual(ev.find(e => e.k === "t").av, [7, 1]); assert.deepEqual(ev.find(e => e.k === "u").av, [1]);
});

/* ---- Tareas: tablero ---- */
const fakeEl = () => ({querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }});
test("tareas: ◀ y ▶ pasan una tarea entre Pendiente, En curso y Hecha (sin salirse de los extremos)", () => {
  const {SB} = abrir(); SB.pintar = () => {}; SB.mods.tareas.crear("Armar informe"); const el = fakeEl(); SB.mods.tareas.pantalla(el); const T = () => SB.datos("tareas").t[0], id = T().id;
  const mover = d => el.onclick({target: {closest: () => ({dataset: {a: "mover", id, d: String(d)}})}});
  mover(-1); assert.ok(!T().e && !T().h, "no baja de Pendiente"); mover(1); assert.equal(T().e, 1); assert.equal(T().h, 0); mover(1); assert.ok(T().h > 0); assert.equal(T().e, undefined); mover(1); assert.ok(T().h > 0, "no sube de Hecha");
  mover(-1); assert.equal(T().h, 0); assert.equal(T().e, 1, "de Hecha vuelve a En curso"); mover(-1); assert.equal(T().e, undefined);
});
test("tareas: la vista Lista/Tablero se elige y se recuerda en el dispositivo; el tablero muestra tres columnas", () => {
  const {SB} = abrir(); SB.pintar = () => {}; SB.mods.tareas.crear("A"); SB.mods.tareas.crear("B"); SB.datos("tareas").t[0].e = 1; SB.datos("tareas").t[1].h = Date.now();
  let el = fakeEl(); SB.mods.tareas.pantalla(el); assert.ok(!/En curso <small>/.test(el._h), "por defecto: lista");
  el.onclick({target: {closest: () => ({dataset: {a: "vista", v: "tablero"}})}}); assert.equal(SB.almacen.leer("sb_tareas_vista", "lista"), "tablero");
  el = fakeEl(); SB.mods.tareas.pantalla(el); assert.match(el._h, /Pendiente <small>0<\/small>/); assert.match(el._h, /En curso <small>1<\/small>/); assert.match(el._h, /Hecha <small>1<\/small>/); assert.match(el._h, /data-a="mover"/);
  el.onclick({target: {closest: () => ({dataset: {a: "vista", v: "lista"}})}}); assert.equal(SB.almacen.leer("sb_tareas_vista", "lista"), "lista");
});
test("tareas: las que están en curso salen en Hoy (sin repetirse) y al hacerlas dejan de estar en curso", () => {
  const {SB} = abrir(), h = SB.u.ymd(), T = SB.datos("tareas").t;
  T.push({id: "1", t: "En curso sin fecha", f: "", p: "", h: 0, c: 1, e: 1}, {id: "2", t: "En curso y vence hoy", f: h, p: "", h: 0, c: 2, e: 1}, {id: "3", t: "Suelta", f: "", p: "", h: 0, c: 3});
  const o = J(SB.mods.tareas.hoy().map(x => x.t + "|" + x.s)); assert.deepEqual(o, ["En curso y vence hoy|Vence hoy", "En curso sin fecha|🔧 En curso", "Suelta|Sin fecha"]);
  SB.mods.tareas.hoy()[1].tocar(); assert.ok(T[0].h > 0); assert.equal(T[0].e, undefined);
  SB.mods.tareas.alternar("2"); assert.equal(T[1].e, undefined);
});

/* ---- Finanzas: gráficos (1.12.0) ---- */
const finz = () => { const p = abrir({extra: {setInterval, clearInterval}}); p.SB.aviso = () => {}; p.SB.pintar = () => {}; return p; };
const mov = (SB, t, a, c, f) => SB.datos("finanzas").g.push({id: Math.random().toString(36), t, a, c, n: "", f, m: 1});
test("finanzas: la serie son los 6 meses que terminan en el elegido, también al cruzar de año", () => {
  const {SB} = finz(); mov(SB, "g", 10000, "Comida", "2025-10-05"); mov(SB, "i", 500000, "Sueldo", "2026-02-01"); mov(SB, "g", 2500, "Ocio", "2026-02-20"); mov(SB, "g", 999, "Ocio", "2025-09-30");
  const s = SB.mods.finanzas.util.serie("2026-02", 6);
  assert.deepEqual(JSON.parse(JSON.stringify(s.map(x => x.ym))), ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(s[0].g, 999); assert.equal(s[1].g, 10000); assert.equal(s[5].g, 2500); assert.equal(s[5].i, 500000); assert.equal(s[3].g, 0);
});
test("finanzas: por categoría, con el nivel del tope (79 % ok, 80 % aviso, 100 % pasado) y las que tienen tope pero no gasto", () => {
  const {SB} = finz(), u = SB.mods.finanzas.util, D = SB.datos("finanzas"); D.b = {Comida: 100000, Ocio: 100000, Salud: 100000, Ropa: 50000};
  mov(SB, "g", 79000, "Comida", "2026-03-02"); mov(SB, "g", 80000, "Ocio", "2026-03-03"); mov(SB, "g", 100000, "Salud", "2026-03-04"); mov(SB, "g", 30000, "Otros", "2026-03-05"); mov(SB, "g", 9999999, "Comida", "2026-04-01"); mov(SB, "i", 500, "Sueldo", "2026-03-06");
  const r = u.porCategoria("2026-03"), por = Object.fromEntries(r.map(x => [x.c, x]));
  assert.equal(por.Comida.nivel, "ok"); assert.equal(por.Ocio.nivel, "aviso"); assert.equal(por.Salud.nivel, "pasado"); assert.equal(por.Otros.nivel, ""); assert.equal(por.Otros.tope, 0);
  assert.equal(por.Ropa.g, 0); assert.equal(por.Ropa.nivel, "ok", "con tope y sin gasto aparece, en 0 %"); assert.ok(!("Sueldo" in por), "los ingresos no son categorías de gasto");
  assert.deepEqual(JSON.parse(JSON.stringify(r.map(x => x.c))), ["Salud", "Ocio", "Comida", "Otros", "Ropa"], "de más a menos gastado");
  assert.equal(u.nivelPct(79), "ok"); assert.equal(u.nivelPct(80), "aviso"); assert.equal(u.nivelPct(99), "aviso"); assert.equal(u.nivelPct(100), "pasado");
});
test("finanzas: el promedio ignora el mes elegido y los meses sin gastos", () => {
  const {promedioPrevio} = finz().SB.mods.finanzas.util;
  assert.equal(promedioPrevio([{g: 100}, {g: 0}, {g: 300}, {g: 99999}]), 200); assert.equal(promedioPrevio([{g: 0}, {g: 0}, {g: 500}]), 0); assert.equal(promedioPrevio([{g: 500}]), 0);
});
test("finanzas: el gráfico de barras es válido, proporcional y no rompe con ceros", () => {
  const {graficoBarras, serie} = finz().SB.mods.finanzas.util;
  assert.equal(graficoBarras([{ym: "2026-01", g: 0, i: 0}, {ym: "2026-02", g: 0, i: 0}], 0), "", "sin datos no hay gráfico");
  const s = [{ym: "2026-01", g: 1000, i: 0}, {ym: "2026-02", g: 500, i: 2000}, {ym: "2026-03", g: 0, i: 0}], svg = graficoBarras(s, 750);
  assert.match(svg, /^<svg/); assert.match(svg, /<\/svg>$/); assert.ok(!/NaN|Infinity|undefined/.test(svg)); ["ene", "feb", "mar"].forEach(m => assert.ok(svg.includes(">" + m + "<"), m));
  const alturas = [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="17" height="([\d.]+)"/g)].map(m => +m[1]); assert.equal(Math.max(...alturas), 112, "la barra más alta ocupa todo el alto");
  assert.equal(alturas[0], 56, "1000 de 2000 = la mitad"); assert.match(svg, /stroke-dasharray/, "línea del promedio"); assert.ok(!/stroke-dasharray/.test(graficoBarras(s, 0)));
  assert.ok(graficoBarras(serie("2026-03", 6), 0) === "" , "serie vacía");
});
test("finanzas: la pestaña Gráficos se dibuja con datos y vacía, y los nombres de categoría se escapan", () => {
  const {SB} = finz(); const vista = () => { const el = {querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; SB.mods.finanzas.pantalla(el); return el; };
  const ir = el => el.onclick({target: {closest: () => ({dataset: {a: "tab", t: "graf"}})}});
  let el = vista(); ir(el); el = vista(); assert.match(el.innerHTML, /Gasto por categoría/); assert.match(el.innerHTML, /Sin gastos este mes/); assert.match(el.innerHTML, /Todavía no hay movimientos/);
  const hoy = SB.u.ymd(); mov(SB, "g", 123456, '<img src=x onerror=alert(1)>', hoy); mov(SB, "g", 5000, "Comida", SB.u.sumar(hoy.slice(0, 7) + "-01", -5)); SB.datos("finanzas").b.Comida = 10000;
  el = vista(); const h = el.innerHTML; assert.match(h, /<svg/); assert.match(h, /<table class="gtab">/); assert.ok(!h.includes("<img src=x"), "texto del usuario sin escapar"); assert.match(h, /&lt;img/);
  assert.match(h, /Promedio de gasto de los meses anteriores/);
});
