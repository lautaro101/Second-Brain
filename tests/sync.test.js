const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J, dormir} = require("./helpers");
const tick = () => dormir(4);                              // las marcas de tiempo son milisegundos: dejamos pasar uno entre un cambio y otro
const archivo = d => J(d.SB.sync.empaquetar());            // lo que quedaría en Drive
const titulos = d => d.SB.datos("notas").n.map(n => n.x);
const nota = (d, x, id) => { const n = {id: id || d.SB.u.uid(), x, m: Date.now()}; d.SB.datos("notas").n.unshift(n); d.SB.guardar("notas"); d.SB.sync.marcarTodo(); return n; };

test("una nota creada en la PC aparece en el celu, y el Inbox también", () => {
  const pc = abrir(), celu = abrir();
  nota(pc, "Idea de app", "p1"); pc.SB.inbox.poner([{id: "i1", t: "comprar cable", f: 1}]);
  const r = celu.SB.sync.aplicar(archivo(pc));
  assert.equal(r.n, 2); assert.deepEqual(J(titulos(celu)), ["Idea de app"]); assert.equal(celu.SB.inbox.leer()[0].t, "comprar cable");
});
test("cambios distintos en cada lado se juntan, y los dos dispositivos terminan igual", async () => {
  const pc = abrir(), celu = abrir(); nota(pc, "base", "b1"); celu.SB.sync.aplicar(archivo(pc)); await tick();
  nota(pc, "nota de la PC", "p2"); await tick(); nota(celu, "nota del celu", "c2");
  celu.SB.datos("tareas").t.unshift({id: "t1", t: "tarea del celu", f: "", p: "", h: 0, c: Date.now()}); celu.SB.guardar("tareas");
  const deCelu = archivo(celu); const r1 = pc.SB.sync.aplicar(deCelu); assert.ok(r1.n >= 2); assert.ok(r1.falta, "la PC tiene algo que el archivo del celu no");
  celu.SB.sync.aplicar(archivo(pc));
  assert.deepEqual(J(titulos(pc).sort()), ["base", "nota de la PC", "nota del celu"]); assert.deepEqual(J(titulos(celu).sort()), J(titulos(pc).sort()));
  assert.equal(pc.SB.datos("tareas").t.length, 1); assert.equal(celu.SB.datos("tareas").t.length, 1);
});
test("si se edita la misma nota en los dos lados, gana el último cambio", async () => {
  const pc = abrir(), celu = abrir(); nota(pc, "versión 1", "n1"); celu.SB.sync.aplicar(archivo(pc)); await tick();
  const a = pc.SB.datos("notas").n[0]; a.x = "editada en la PC"; pc.SB.guardar("notas"); pc.SB.sync.marcarTodo(); await tick();
  const b = celu.SB.datos("notas").n[0]; b.x = "editada en el celu (después)"; celu.SB.guardar("notas"); celu.SB.sync.marcarTodo();
  pc.SB.sync.aplicar(archivo(celu)); celu.SB.sync.aplicar(archivo(pc));
  assert.deepEqual(J(titulos(pc)), ["editada en el celu (después)"]); assert.deepEqual(J(titulos(celu)), ["editada en el celu (después)"]);
});
test("un borrado viaja al otro dispositivo y la nota no vuelve a aparecer", async () => {
  const pc = abrir(), celu = abrir(); nota(pc, "se va", "n1"); nota(pc, "se queda", "n2"); celu.SB.sync.aplicar(archivo(pc)); await tick();
  pc.SB.datos("notas").n = pc.SB.datos("notas").n.filter(n => n.id !== "n1"); pc.SB.guardar("notas"); pc.SB.sync.marcarTodo();
  celu.SB.sync.aplicar(archivo(pc)); assert.deepEqual(J(titulos(celu)), ["se queda"]);
  pc.SB.sync.aplicar(archivo(celu)); assert.deepEqual(J(titulos(pc)), ["se queda"]);          // el celu devuelve su archivo y no resucita la nota
});
test("editar algo después de que otro lo borró lo conserva (lo más nuevo gana)", async () => {
  const pc = abrir(), celu = abrir(); nota(pc, "texto", "n1"); celu.SB.sync.aplicar(archivo(pc)); await tick();
  pc.SB.datos("notas").n = []; pc.SB.guardar("notas"); pc.SB.sync.marcarTodo(); await tick();
  celu.SB.datos("notas").n[0].x = "texto editado después"; celu.SB.guardar("notas"); celu.SB.sync.marcarTodo();
  pc.SB.sync.aplicar(archivo(celu)); assert.deepEqual(J(titulos(pc)), ["texto editado después"]);
});
test("el orden de las tareas se mantiene: las nuevas primero", async () => {
  const pc = abrir(), celu = abrir(), t = (id, c) => ({id, t: id, f: "", p: "", h: 0, c});
  pc.SB.datos("tareas").t.unshift(t("k0001", 1)); pc.SB.guardar("tareas"); celu.SB.sync.aplicar(archivo(pc)); await tick();
  celu.SB.datos("tareas").t.unshift(t("k0003", 3)); celu.SB.guardar("tareas"); pc.SB.datos("tareas").t.unshift(t("k0002", 2)); pc.SB.guardar("tareas");
  pc.SB.sync.aplicar(archivo(celu)); assert.deepEqual(J(pc.SB.datos("tareas").t.map(x => x.id)), ["k0003", "k0002", "k0001"]);
});
test("diario: cada día se junta por separado", async () => {
  const pc = abrir(), celu = abrir(); pc.SB.datos("diario").e["2026-11-16"] = {x: "lunes", a: 3, g: ""}; pc.SB.guardar("diario"); celu.SB.sync.aplicar(archivo(pc)); await tick();
  celu.SB.datos("diario").e["2026-11-17"] = {x: "martes", a: 4, g: ""}; celu.SB.guardar("diario"); pc.SB.datos("diario").e["2026-11-15"] = {x: "domingo", a: 2, g: ""}; pc.SB.guardar("diario");
  pc.SB.sync.aplicar(archivo(celu)); assert.deepEqual(J(Object.keys(pc.SB.datos("diario").e).sort()), ["2026-11-15", "2026-11-16", "2026-11-17"]);
});
test("datos anteriores a la sincronización: se usa la fecha de cada nota y la más nueva gana", () => {
  const viejo = x => ({sb_m_notas: JSON.stringify({v: 1, d: {n: [x]}})});
  const pc = abrir({datos: viejo({id: "n1", x: "de la PC", m: 2000})}), celu = abrir({datos: viejo({id: "n1", x: "del celu", m: 1000})});
  pc.SB.sync.marcarTodo(); celu.SB.sync.marcarTodo();
  celu.SB.sync.aplicar(archivo(pc)); assert.deepEqual(J(titulos(celu)), ["de la PC"]);
});
test("un archivo de otra cosa se rechaza sin tocar nada", () => {
  const d = abrir(); nota(d, "intacta", "n1");
  assert.throws(() => d.SB.sync.aplicar({app: "calculadora-sueldo", hist: {}}), /no es una copia de Second Brain/); assert.deepEqual(J(titulos(d)), ["intacta"]);
});
test("un módulo del archivo con esquema más nuevo no se toca ni se pisa", () => {
  const d = abrir(), f = archivo(d); f.mods.notas = {v: 9, d: {n: [{id: "z", x: "futuro"}], extra: 1}, ts: 0, it: {}, borr: {}};
  const r = d.SB.sync.aplicar(f); assert.ok(r.salt.has("notas")); assert.match(r.notas.join(" "), /versión más nueva/); assert.deepEqual(J(titulos(d)), []);
  const sal = J(d.SB.sync.empaquetar(f, r.salt)); assert.equal(sal.mods.notas.v, 9, "lo del archivo se conserva");
});
test("un módulo que este dispositivo no conoce se conserva en el archivo", () => {
  const d = abrir(), f = archivo(d); f.mods.salud = {v: 1, d: {x: 1}, ts: 1, it: {}, borr: {}};
  d.SB.sync.aplicar(f); assert.deepEqual(J(d.SB.sync.empaquetar(f).mods.salud.d), {x: 1});
});
test("un archivo con esquema más viejo se migra antes de juntarlo", () => {
  const d = abrir({archivos: [{nombre: "m", codigo: `SB.registrar({id:"m",nombre:"m",icono:"x",esquema:2,inicial:()=>({l:[]}),migraciones:{2:d=>({l:d.l.map(x=>({...x,nuevo:1}))})},sync:[{k:"l"}],pantalla(){}})`}]});
  const f = archivo(d); f.mods.m = {v: 1, d: {l: [{id: "a", x: 1}]}, ts: 0, it: {l: {a: 5}}, borr: {}};
  const r = d.SB.sync.aplicar(f); assert.equal(r.n, 1); assert.deepEqual(J(d.SB.datos("m").l), [{id: "a", x: 1, nuevo: 1}]);
});
test("un módulo sin colecciones declaradas se junta entero: gana el modificado más tarde", async () => {
  const mod = {nombre: "m", codigo: `SB.registrar({id:"m",nombre:"m",icono:"x",esquema:1,inicial:()=>({color:"azul"}),pantalla(){}})`};
  const pc = abrir({archivos: [mod]}), celu = abrir({archivos: [mod]}); pc.SB.sync.marcarTodo(); celu.SB.sync.marcarTodo(); await tick();
  pc.SB.datos("m").color = "rojo"; pc.SB.guardar("m"); pc.SB.sync.marcarTodo(); celu.SB.sync.aplicar(archivo(pc)); assert.equal(celu.SB.datos("m").color, "rojo");
});
test("cargar el mismo archivo dos veces no cambia nada", () => {
  const pc = abrir(), celu = abrir(); nota(pc, "una", "n1"); const f = archivo(pc); celu.SB.sync.aplicar(f);
  const r = celu.SB.sync.aplicar(f); assert.equal(r.n, 0); assert.equal(celu.SB.datos("notas").n.length, 1);
});
test("los cambios que llegan de otro dispositivo no se vuelven a marcar como cambios propios", async () => {
  const pc = abrir(), celu = abrir(); let avisos = 0; celu.SB.alGuardar.push(() => avisos++);
  nota(pc, "x", "n1"); celu.SB.sync.aplicar(archivo(pc)); assert.equal(avisos, 0);
});
test("guardar avisa a la sincronización con el módulo que cambió", () => {
  const d = abrir(), vistos = []; d.SB.alGuardar.push(id => vistos.push(id)); d.SB.guardar("notas"); d.SB.inbox.poner([]);
  assert.deepEqual(J(vistos), ["notas", "inbox"]);
});

test("pantalla de sincronización en el celu: «Actualizar mi archivo» guía en 2 pasos (cargar, juntar y recién ahí aparece guardar y reemplazar)", async () => {
  const {SB} = abrir(); let abierto = 0;
  const cont = {innerHTML: "", isConnected: true, querySelector: () => ({click() { abierto++; }})};
  const sec = SB.secciones.find(f => { const t = {innerHTML: "", isConnected: true, querySelector: () => null}; f(t); return /Sincronizar PC y celu/.test(t.innerHTML); }); sec(cont);
  assert.match(cont.innerHTML, /Actualizar \(paso 1\)/); assert.doesNotMatch(cont.innerHTML, /Paso 2 de 2/);
  const tocar = (a, extra) => cont.onclick({target: {closest: () => Object.assign({dataset: {a}}, extra)}});
  tocar("sy-act"); assert.equal(abierto, 1);
  const file = {text: async () => JSON.stringify(SB.sync.empaquetar())};
  cont.onchange({target: {closest: () => ({dataset: {c: "sy-file"}, files: [file], value: ""})}}); await new Promise(r => setTimeout(r, 30));
  assert.match(cont.innerHTML, /Paso 2 de 2/); assert.match(cont.innerHTML, /Guardar y reemplazar/);
});
test("pantalla de sincronización en el celu: cargar a mano (sin la guía) no muestra el paso 2", async () => {
  const {SB} = abrir(), cont = {innerHTML: "", isConnected: true, querySelector: () => ({click() {}})};
  const sec = SB.secciones.find(f => { const t = {innerHTML: "", isConnected: true, querySelector: () => null}; f(t); return /Sincronizar PC y celu/.test(t.innerHTML); }); sec(cont);
  cont.onclick({target: {closest: () => ({dataset: {a: "sy-cargar"}})}});
  cont.onchange({target: {closest: () => ({dataset: {c: "sy-file"}, files: [{text: async () => JSON.stringify(SB.sync.empaquetar())}], value: ""})}}); await new Promise(r => setTimeout(r, 30));
  assert.doesNotMatch(cont.innerHTML, /Paso 2 de 2/); assert.match(cont.innerHTML, /ya tenía todo lo del archivo/);
});
