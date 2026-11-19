const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const nuevo = (SB, o) => SB.mods.objetivos.util.crear(o.n, o);
test("objetivos: se registra sin fallos, sincroniza la lista o y la Papelera la cubre", () => {
  const {SB} = abrir(); assert.deepEqual(J(SB.fallos), {}); assert.deepEqual(J(SB.mods.objetivos.sync.map(x => x.k)), ["o"]);
  nuevo(SB, {n: "Recibirme"}); SB.alArrancar[SB.alArrancar.length - 1](); SB.datos("objetivos").o = []; SB.guardar("objetivos");
  assert.equal(SB.datos("papelera").x.length, 1); assert.equal(SB.datos("papelera").x[0].l, "Recibirme");
});
test("objetivos: el avance sale de los pasos, o del % manual si no hay pasos, y logrado es 100", () => {
  const {SB} = abrir(), u = SB.mods.objetivos.util, o = nuevo(SB, {n: "Viaje", pc: 30}); assert.equal(u.avance(o), 30);
  o.hi = [{id: "1", t: "Ahorrar", h: 1}, {id: "2", t: "Pasajes", h: 0}, {id: "3", t: "Hotel", h: 0}, {id: "4", t: "Valija", h: 1}]; assert.equal(u.avance(o), 50);
  o.e = "l"; assert.equal(u.avance(o), 100);
});
test("objetivos: Hoy muestra los activos que vencen en 7 días o menos (y los vencidos), no los lejanos ni los logrados", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), f = n => SB.u.sumar(hoy, n);
  nuevo(SB, {n: "Cerca", f: f(5)}); nuevo(SB, {n: "Vencido", f: f(-2)}); nuevo(SB, {n: "Lejos", f: f(40)}); nuevo(SB, {n: "Sin fecha"}); nuevo(SB, {n: "Hecho", f: f(1), e: "l"});
  const h = SB.mods.objetivos.hoy().map(x => x.t); assert.deepEqual(J(h), ["Vencido", "Cerca"]);
});
test("objetivos: avisos 7 y 1 día antes solo de los activos con fecha futura", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); nuevo(SB, {n: "A", f: SB.u.sumar(hoy, 10)}); nuevo(SB, {n: "B", f: SB.u.sumar(hoy, -1)}); nuevo(SB, {n: "C"});
  const av = J(SB.mods.objetivos.avisos()); assert.equal(av.length, 1); assert.deepEqual(av[0].av, [7, 1]); assert.equal(av[0].t, "A");
});
test("objetivos: ritmo adelantado / al día / atrasado según el avance y el tiempo", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), dia = 864e5, o = nuevo(SB, {n: "Meta", f: SB.u.sumar(hoy, 50)}); o.k = Date.now() - 50 * dia;   // mitad del plazo
  o.pc = 80; assert.match(SB.mods.objetivos.hoy.toString(), /objetivos/); const ritmo = () => { const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.mods.objetivos.pantalla(el, o.id); return el.innerHTML; };
  const {ctx} = abrir(); // la pantalla solo necesita document para eventos; se prueba en la instancia principal
  o.pc = 80; assert.match(ritmo(), /adelantado/); o.pc = 50; assert.match(ritmo(), /al día/); o.pc = 10; assert.match(ritmo(), /atrasado/);
});
test("objetivos: la captura del Inbox crea uno, y la pantalla se dibuja en todas las vistas", () => {
  const {SB} = abrir(); SB.mods.objetivos.captura.guardar("Correr 10 km"); const o = SB.datos("objetivos").o[0]; assert.equal(o.n, "Correr 10 km"); assert.equal(o.e, "a");
  SB.mods.tareas.crear("Comprar zapatillas", "", "correr-10-km");
  ["", o.id].forEach(sub => { const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.mods.objetivos.pantalla(el, sub); assert.ok(el.innerHTML.length > 100);
    if (sub) { assert.match(el.innerHTML, /Comprar zapatillas/); assert.match(el.innerHTML, /type="range"/); } });
});
test("objetivos: búsqueda y revisión semanal", () => {
  const {SB} = abrir(); nuevo(SB, {n: "Aprender inglés", a: "Idiomas", f: SB.u.sumar(SB.u.ymd(), 20)});
  assert.equal(SB.mods.objetivos.buscar("ingles").length, 1); assert.match(SB.mods.objetivos.semana().join(" "), /1 objetivo activo.*Aprender inglés/s);
});
test("módulos apagados: una sola vez se prenden Lectura y Objetivos; lo que elijas después se respeta", () => {
  const {SB, ls} = abrir({datos: {sb_cfg: JSON.stringify({off: ["lectura", "objetivos", "estudio"]})}});
  assert.equal(SB.activarUnaVez(), true); let c = JSON.parse(ls._d.sb_cfg); assert.deepEqual(J(c.off), ["estudio"]); assert.equal(c.a125, 1);
  c.off.push("lectura"); ls._d.sb_cfg = JSON.stringify(c);                       // el usuario la apaga a propósito más tarde
  assert.equal(SB.activarUnaVez(), false); assert.deepEqual(J(JSON.parse(ls._d.sb_cfg).off), ["estudio", "lectura"]);
});
test("archivos a medias: la app avisa si modulos/lista.js no es de la misma versión que version.js", () => {
  const {SB, ctx} = abrir(); ctx.APP_VERSION = "1.25.2"; ctx.SB_LISTA_VERSION = undefined; assert.match(SB.revisarArchivos(), /de una versión vieja/);
  ctx.SB_LISTA_VERSION = "1.24.0"; assert.match(SB.revisarArchivos(), /1\.25\.2.*1\.24\.0/); ctx.SB_LISTA_VERSION = "1.25.2"; assert.equal(SB.revisarArchivos(), "");
});
