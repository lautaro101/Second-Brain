const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, modulo, J} = require("./helpers");

test("los cuatro módulos de la 1.0.0 se registran sin fallos", () => {
  const {SB} = abrir(); assert.deepEqual(J(SB.fallos), {}); assert.deepEqual([...SB.orden], ["notas", "tareas", "habitos", "diario"]);
});
test("un módulo con definición incompleta o repetida no tira abajo a los demás", () => {
  const {SB} = abrir({archivos: [modulo("a"), {nombre: "roto", codigo: "SB.registrar({id:'roto'})"}, modulo("a"), modulo("b")]});
  assert.deepEqual([...SB.orden], ["a", "b"]); assert.ok(SB.fallos.roto); assert.ok(SB.fallos.a);
});
test("un módulo que tira error al cargar el archivo deja andando al resto", () => {
  const {SB} = abrir({archivos: [modulo("a"), {nombre: "malo.js", codigo: "throw new Error('boom')"}, modulo("b")]});
  assert.deepEqual([...SB.orden], ["a", "b"]); assert.match(SB.fallos["malo.js"], /boom/);
});
test("migraciones: se aplican en orden, queda una copia previa y se sube la versión del esquema", () => {
  const datos = {sb_m_m: JSON.stringify({v: 1, d: {n: 5}})};
  const {SB, ls} = abrir({datos, archivos: [modulo("m", "{esquema:3, migraciones:{2:d=>({n:d.n,x:1}),3:d=>({...d,y:2})}}")]});
  assert.deepEqual(J(SB.datos("m")), {n: 5, x: 1, y: 2}); assert.equal(JSON.parse(ls._d.sb_m_m).v, 3); assert.equal(JSON.parse(ls._d.sb_bak_m).v, 1);
});
test("datos de una versión más nueva: ese módulo queda afuera y sus datos no se tocan", () => {
  const datos = {sb_m_m: JSON.stringify({v: 9, d: {n: 1}})}, antes = datos.sb_m_m;
  const {SB, ls} = abrir({datos, archivos: [modulo("m"), modulo("z")]});
  assert.ok(SB.fallos.m); assert.deepEqual([...SB.orden], ["z"]); assert.equal(ls._d.sb_m_m, antes);
});
test("hoy: tareas vencidas, hábitos programados y reflexión del día", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), ayer = SB.u.sumar(hoy, -1);
  SB.datos("tareas").t.push({id: "1", t: "Soldar", f: ayer, p: "", h: 0, c: 1}, {id: "2", t: "Hecha", f: ayer, p: "", h: 5, c: 1});
  SB.datos("habitos").h.push({id: "h", n: "Inglés", d: [0, 1, 2, 3, 4, 5, 6], h: {}});
  const t = SB.mods.tareas.hoy(), h = SB.mods.habitos.hoy(), d = SB.mods.diario.hoy();
  assert.equal(t.length, 1); assert.match(t[0].s, /Venció hace 1 día/); assert.equal(h[0].hecho, false); assert.equal(d[0].hecho, false);
  h[0].tocar(); assert.equal(SB.mods.habitos.hoy()[0].hecho, true); assert.match(SB.mods.habitos.hoy()[0].s, /Racha: 1/);
});
test("captura: '#proyecto' en una tarea la asigna al proyecto; notas guardan etiquetas y se buscan", () => {
  const {SB} = abrir(); SB.mods.tareas.captura.guardar("Comprar electrodos #taller");
  assert.equal(SB.datos("tareas").t[0].t, "Comprar electrodos"); assert.equal(SB.datos("tareas").t[0].p, "taller");
  SB.mods.notas.captura.guardar("Idea de app\nusar #js y [[Plan]]"); assert.equal(SB.mods.notas.buscar("idea")[0].s, "#js");
});
test("avisos de tareas: solo las pendientes con fecha", () => {
  const {SB} = abrir(); SB.datos("tareas").t.push({id: "1", t: "A", f: "2026-12-01", h: 0}, {id: "2", t: "B", f: "2026-12-02", h: 9}, {id: "3", t: "C", f: "", h: 0});
  assert.deepEqual(J(SB.mods.tareas.avisos().map(a => a.c)), ["A"]);
});
test("novedades: primera vez muestra solo la versión actual; al actualizar, lo que pasó desde la versión anterior", () => {
  const primera = abrir(); assert.equal(JSON.parse(primera.ls._d.sb_nov_pend).de, ""); assert.equal(primera.SB.novedades("").length, 1);
  const act = abrir({datos: {sb_ult_version: "1.0.0"}}); assert.equal(JSON.parse(act.ls._d.sb_nov_pend).de, "1.0.0");
  assert.deepEqual(J(act.SB.novedades("1.0.0").map(x => x[0])), ["1.2.0", "1.1.0", "1.0.3", "1.0.2", "1.0.1"]); assert.equal(act.SB.novedades(act.ctx.APP_VERSION).length, 0);
  const igual = abrir({datos: {sb_ult_version: act.ctx.APP_VERSION}}); assert.equal(igual.ls._d.sb_nov_pend, undefined);
});
