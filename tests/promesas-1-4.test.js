/* Lo que prometían las versiones 1.4.0 y 1.5.0: tareas que se repiten, hábitos «veces por semana» con aviso diario y nota por día, y arrastrar en el tablero. */
const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, abrirSW, J} = require("./helpers");
const fakeEl = () => ({querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }});
const click = (el, a, ds = {}) => el.onclick({target: {closest: () => ({dataset: Object.assign({a}, ds)})}});
const enviar = (el, nombre, campos, ds = {}) => el.onsubmit({target: {closest: () => Object.assign({dataset: Object.assign({f: nombre}, ds), querySelectorAll: () => campos._dias || []}, campos)}, preventDefault() {}});
const campo = v => ({value: v});

/* ---------------- Tareas que se repiten ---------------- */
test("repetición: la próxima fecha (día, semana, N días, mes) sale de la fecha límite y nunca queda en el pasado", () => {
  const {SB} = abrir(), P = SB.mods.tareas.proxima, h = "2026-06-10";
  assert.equal(P({f: "2026-06-10", r: {u: "d", n: 1}}, h), "2026-06-11"); assert.equal(P({f: "2026-06-12", r: {u: "d", n: 1}}, h), "2026-06-13", "hecha antes de tiempo");
  assert.equal(P({f: "2026-06-01", r: {u: "d", n: 1}}, h), "2026-06-11", "hecha muy tarde: la primera que no pasó");
  assert.equal(P({f: "2026-06-08", r: {u: "s", n: 1}}, h), "2026-06-15"); assert.equal(P({f: "2026-06-10", r: {u: "d", n: 3}}, h), "2026-06-13");
  assert.equal(P({f: "2026-06-08", r: {u: "s", n: 2}}, h), "2026-06-22"); assert.equal(P({f: "2026-06-10", r: {u: "m", n: 1, d: 10}}, h), "2026-07-10");
  assert.equal(P({f: "2026-06-10", r: null}, h), ""); assert.equal(P({f: "2026-06-10", r: {u: "x", n: 1}}, h), "");
});
test("repetición mensual: el día se mantiene y en los meses cortos cae el último día (sin arrastrar el error)", () => {
  const {SB} = abrir(), P = SB.mods.tareas.proxima;
  assert.equal(P({f: "2026-01-31", r: {u: "m", n: 1, d: 31}}, "2026-01-31"), "2026-02-28"); assert.equal(P({f: "2026-02-28", r: {u: "m", n: 1, d: 31}}, "2026-02-28"), "2026-03-31");
  assert.equal(P({f: "2028-01-31", r: {u: "m", n: 1, d: 31}}, "2028-01-31"), "2028-02-29", "año bisiesto"); assert.equal(P({f: "2026-12-15", r: {u: "m", n: 1, d: 15}}, "2026-12-15"), "2027-01-15");
});
test("repetición: al hacer una tarea que se repite se crea la siguiente (sin pasos tildados, con prioridad y días propios); la hecha queda hecha", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("tareas").t.push({id: "a", t: "Pagar expensas", f: hoy, p: "casa", h: 0, c: 1, u: 1, a: 5, r: {u: "m", n: 1, d: +hoy.slice(8)}, s: [{t: "Ver monto", h: 1}, {t: "Transferir", h: 1}]});
  SB.mods.tareas.alternar("a"); const T = SB.datos("tareas").t, n = T[0], o = T.find(x => x.id === "a");
  assert.equal(T.length, 2); assert.ok(o.h > 0); assert.equal(o.g, n.id); assert.equal(n.t, "Pagar expensas"); assert.equal(n.h, 0); assert.ok(n.f > hoy); assert.equal(n.p, "casa"); assert.equal(n.u, 1); assert.equal(n.a, 5);
  assert.deepEqual(J(n.s), [{t: "Ver monto", h: 0}, {t: "Transferir", h: 0}]); assert.deepEqual(J(n.r), J(o.r)); assert.ok(!n.g);
});
test("repetición: deshacer la tarea hecha quita la siguiente si no la tocaste, y no se duplica al volver a hacerla", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("tareas").t.push({id: "a", t: "Regar", f: hoy, p: "", h: 0, c: 1, r: {u: "d", n: 1}});
  SB.mods.tareas.alternar("a"); assert.equal(SB.datos("tareas").t.length, 2);
  SB.mods.tareas.alternar("a"); assert.equal(SB.datos("tareas").t.length, 1); assert.equal(SB.datos("tareas").t[0].h, 0); assert.equal(SB.datos("tareas").t[0].g, undefined);
  SB.mods.tareas.alternar("a"); assert.equal(SB.datos("tareas").t.length, 2, "una sola siguiente");
});
test("repetición: si ya hiciste la siguiente, deshacer la anterior no te la borra", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("tareas").t.push({id: "a", t: "Regar", f: hoy, p: "", h: 0, c: 1, r: {u: "d", n: 1}}); SB.mods.tareas.alternar("a");
  const sig = SB.datos("tareas").t[0]; sig.h = Date.now(); SB.mods.tareas.alternar("a"); assert.ok(SB.datos("tareas").t.some(x => x.id === sig.id));
});
test("repetición: se repite desde Hoy (tildar), desde el tablero (▶ hasta Hecha y arrastre) y desde la lista", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.pintar = () => {}; const T = SB.datos("tareas").t;
  T.push({id: "a", t: "A", f: hoy, p: "", h: 0, c: 1, r: {u: "s", n: 1}}, {id: "b", t: "B", f: hoy, p: "", h: 0, c: 2, r: {u: "d", n: 1}, e: 1}, {id: "c", t: "C", f: hoy, p: "", h: 0, c: 3, r: {u: "d", n: 2}});
  SB.mods.tareas.hoy().find(x => x.t === "A").tocar(); assert.equal(T.filter(x => x.t === "A").length, 2);
  const el = fakeEl(); SB.mods.tareas.pantalla(el); click(el, "mover", {id: "b", d: "1"}); assert.equal(T.filter(x => x.t === "B").length, 2); assert.equal(T.find(x => x.id === "b").e, undefined, "hecha: deja de estar en curso");
  click(el, "ok", {id: "c"}); assert.equal(T.filter(x => x.t === "C").length, 2);
});
test("repetición: el formulario crea la regla; sin fecha usa hoy; «cada N días» respeta N; no se repite sin elegir", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.pintar = () => {}; const el = fakeEl(); SB.mods.tareas.pantalla(el); assert.match(el._h, /Cada semana/); assert.match(el._h, /name="rn"/);
  const mk = (t, f, r, rn) => enviar(el, "n", {t: campo(t), f: campo(f), p: campo(""), a: campo(""), u: {checked: false}, r: campo(r), rn: campo(rn)});
  mk("Semanal", "", "s", ""); mk("Cada 10", "2026-12-01", "n", "10"); mk("Mensual", "2026-12-15", "m", ""); mk("Simple", "2026-12-01", "", ""); mk("Sin fecha", "", "", "");
  const T = SB.datos("tareas").t, g = n => T.find(x => x.t === n);
  assert.deepEqual(J(g("Semanal").r), {u: "s", n: 1}); assert.equal(g("Semanal").f, hoy); assert.deepEqual(J(g("Cada 10").r), {u: "d", n: 10}); assert.deepEqual(J(g("Mensual").r), {u: "m", n: 1, d: 15});
  assert.equal(g("Simple").r, undefined); assert.equal(g("Sin fecha").r, undefined); assert.equal(g("Sin fecha").f, "");
});
test("repetición: se ve «🔁 cada…» en la tarea y se puede dejar de repetir; al hacerla ya no genera otra", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.pintar = () => {}; SB.datos("tareas").t.push({id: "a", t: "Regar", f: hoy, p: "", h: 0, c: 1, r: {u: "d", n: 3}});
  const el = fakeEl(); SB.mods.tareas.pantalla(el); assert.match(el._h, /🔁 cada 3 días/); assert.match(el._h, /data-a="norep"/);
  click(el, "norep", {id: "a"}); assert.equal(SB.datos("tareas").t[0].r, undefined); SB.mods.tareas.alternar("a"); assert.equal(SB.datos("tareas").t.length, 1);
});
test("repetición: la siguiente tarea avisa con las mismas reglas (avisos de entrada en Prioridad)", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("tareas").t.push({id: "a", t: "Regar", f: hoy, p: "", h: 0, c: 1, r: {u: "s", n: 1}}); SB.mods.tareas.alternar("a");
  const ev = J(SB.mods.tareas.avisos()); assert.equal(ev.length, 1, "la hecha no avisa; la siguiente sí"); assert.ok(ev[0].f > hoy);
});

/* ---------------- Tablero: arrastrar ---------------- */
test("arrastrar: las tarjetas del tablero son arrastrables y las columnas reciben; soltar en una columna cambia el estado", () => {
  const {SB} = abrir(); SB.pintar = () => {}; SB.mods.tareas.crear("Mover con el mouse"); SB.datos("tareas").t.push({id: "b", t: "Ya hecha", f: "", p: "", h: 5, c: 1});
  SB.almacen.poner("sb_tareas_vista", "tablero"); const id = SB.datos("tareas").t[0].id, tarjetas = [], cols = [];
  const mkEl = () => ({set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, querySelectorAll(sel) { return sel === "[data-drag]" ? tarjetas : sel === "[data-col]" ? cols : []; }});
  const el = mkEl(); SB.mods.tareas.pantalla(el);
  assert.equal((el._h.match(/draggable="true"/g) || []).length, 2); assert.equal((el._h.match(/data-col="/g) || []).length, 3);
  const tj = {dataset: {drag: id}, style: {}}, col = n => ({dataset: {col: String(n)}, style: {}}); tarjetas.push(tj); cols.push(col(0), col(1), col(2));
  SB.mods.tareas.pantalla(el);
  const data = {}, dt = {setData: (k, v) => { data[k] = v; }, getData: k => data[k]}; tj.ondragstart({dataTransfer: dt}); assert.equal(data["text/plain"], id); assert.equal(tj.style.opacity, ".5"); tj.ondragend(); assert.equal(tj.style.opacity, "");
  let evitado = 0; cols[1].ondragover({preventDefault: () => evitado++}); assert.equal(evitado, 1); assert.match(cols[1].style.outline, /dashed/);
  cols[1].ondrop({preventDefault() {}, dataTransfer: dt}); assert.equal(SB.datos("tareas").t.find(x => x.id === id).e, 1); assert.equal(cols[1].style.outline, "");
  cols[2].ondrop({preventDefault() {}, dataTransfer: dt}); assert.ok(SB.datos("tareas").t.find(x => x.id === id).h > 0); assert.equal(SB.datos("tareas").t.find(x => x.id === id).e, undefined);
  cols[0].ondrop({preventDefault() {}, dataTransfer: dt}); assert.equal(SB.datos("tareas").t.find(x => x.id === id).h, 0, "de Hecha a Pendiente");
  cols[0].ondrop({preventDefault() {}, dataTransfer: {getData: () => "no-existe"}});   // soltar algo que no es una tarea no rompe
});

/* ---------------- Hábitos ---------------- */
const lunesDe = f => new Date(f + "T12:00:00").getDay() === 1 ? f : null;
test("hábitos: «veces por semana» se crea desde el formulario y se ve en Hoy hasta cumplir la meta; un día fijo sigue igual", () => {
  const {SB} = abrir(); SB.pintar = () => {}; const el = fakeEl(); SB.mods.habitos.pantalla(el); assert.match(el._h, /veces por semana/);
  const d = [{value: "1"}, {value: "3"}]; enviar(el, "n", {n: campo("Gimnasio"), v: campo("3"), _dias: d}); enviar(el, "n", {n: campo("Inglés"), v: campo(""), _dias: d});
  const H = SB.datos("habitos").h; assert.deepEqual(J(H[0]), {id: H[0].id, n: "Gimnasio", d: [], v: 3, h: {}}); assert.deepEqual(J(H[1].d), [1, 3]); assert.equal(H[1].v, undefined);
  const gym = () => SB.mods.habitos.hoy().find(x => x.t === "Gimnasio"); assert.match(gym().s, /0\/3 esta semana/); assert.equal(gym().hecho, false);
});
test("hábitos: sin días ni veces por semana no se crea (avisa)", () => {
  const {SB} = abrir(), av = []; SB.pintar = () => {}; SB.aviso = t => av.push(t); const el = fakeEl(); SB.mods.habitos.pantalla(el);
  enviar(el, "n", {n: campo("Nada"), v: campo(""), _dias: []}); assert.equal(SB.datos("habitos").h.length, 0); assert.match(av[0], /Elegí al menos un día o cuántas veces/);
  enviar(el, "n", {n: campo("Fuera"), v: campo("9"), _dias: []}); assert.equal(SB.datos("habitos").h.length, 0, "9 veces por semana no vale");
});
test("hábitos: «2 veces por semana» deja de salir en Hoy al cumplir la meta (queda el de hoy tildado) y cuenta de lunes a domingo", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), dow = new Date(hoy + "T12:00:00").getDay(), lun = SB.u.sumar(hoy, -((dow + 6) % 7));
  SB.datos("habitos").h.push({id: "a", n: "Leer", d: [], v: 2, h: {[lun]: 1}});
  const x = () => SB.mods.habitos.hoy(); const antes = x().length;
  if (hoy !== lun) { assert.equal(antes, 1); assert.match(x()[0].s, /1\/2 esta semana/); x()[0].tocar(); assert.equal(x().length, 1, "hoy lo hiciste: sigue tildado"); assert.equal(x()[0].hecho, true); assert.match(x()[0].s, /2\/2/); }
  SB.datos("habitos").h[0].h[hoy] = 1; SB.datos("habitos").h[0].h[SB.u.sumar(lun, 1)] = 1;   // meta cumplida (y de sobra)
  SB.datos("habitos").h[0].h = {[lun]: 1, [SB.u.sumar(lun, 1)]: 1}; if (hoy > SB.u.sumar(lun, 1)) assert.equal(SB.mods.habitos.hoy().length, 0, "meta cumplida y hoy no hiciste: no aparece");
});
test("hábitos: la racha de «veces por semana» cuenta semanas seguidas con la meta cumplida", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), dow = new Date(hoy + "T12:00:00").getDay(), lun = SB.u.sumar(hoy, -((dow + 6) % 7)), h = {};
  [-7, -14, -21].forEach(o => { h[SB.u.sumar(lun, o)] = 1; h[SB.u.sumar(lun, o + 1)] = 1; });   // 3 semanas pasadas con 2 de 2
  h[SB.u.sumar(lun, -35)] = 1;   // la de hace 5 semanas no llega; la de hace 4 está vacía → corta
  SB.datos("habitos").h.push({id: "a", n: "Leer", d: [], v: 2, h});
  assert.match(SB.mods.habitos.hoy()[0].s, /racha: 3 semanas/); h[lun] = 1; h[SB.u.sumar(lun, 1)] = 1; assert.match(SB.mods.habitos.buscar("leer")[0].s, /racha 4/, "la semana en curso ya cumplió la meta: suma");
});
test("hábitos: la revisión semanal cuenta la meta de «veces por semana» sin pasarse", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("habitos").h.push({id: "a", n: "Gym", d: [], v: 3, h: {[hoy]: 1, [SB.u.sumar(hoy, -1)]: 1, [SB.u.sumar(hoy, -2)]: 1, [SB.u.sumar(hoy, -3)]: 1}});
  assert.match(SB.mods.habitos.semana().join(" "), /3 de 3.*100 ?%/);
});
test("hábitos: aviso diario mientras estén pendientes; no avisa si ya lo hiciste ni si hoy no toca; es «de fondo»", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), dow = new Date(hoy + "T12:00:00").getDay(), otro = (dow + 3) % 7, H = SB.datos("habitos").h;
  H.push({id: "a", n: "Inglés", d: [0, 1, 2, 3, 4, 5, 6], h: {}}, {id: "b", n: "Ya hecho", d: [0, 1, 2, 3, 4, 5, 6], h: {[hoy]: 1}}, {id: "c", n: "No toca hoy", d: [otro], h: {}}, {id: "d", n: "Gym", d: [], v: 3, h: {}});
  const ev = J(SB.mods.habitos.avisos()); assert.deepEqual(ev.map(e => e.c).sort(), ["Gym", "Inglés"]); ev.forEach(e => { assert.equal(e.f, hoy); assert.equal(e.solo, true); assert.equal(e.bg, true); assert.ok(e.k); });
});
test("hábitos: el service worker manda el aviso una vez por día y no con la app abierta", () => {
  const {SB} = abrir(), {avisosPendientes} = abrirSW(), hoy = SB.u.ymd(); SB.datos("habitos").h.push({id: "a", n: "Inglés", d: [0, 1, 2, 3, 4, 5, 6], h: {}});
  const ev = J(SB.mods.habitos.avisos()), [a, m, d] = hoy.split("-").map(Number), ahora = new Date(a, m - 1, d, 20, 0), ya = [];
  assert.equal(avisosPendientes(ev, ahora, ya, true).length, 0, "app a la vista: no avisa");
  const p = avisosPendientes(ev, ahora, ya, false); assert.equal(p.length, 1); assert.equal(p[0].titulo, "Hoy: Hábito"); assert.equal(p[0].cuerpo, "Inglés"); ya.push(p[0].key);
  assert.equal(avisosPendientes(ev, ahora, ya, false).length, 0, "una vez por día");
  const man = new Date(a, m - 1, d + 1, 20, 0), evMan = ev.map(e => Object.assign({}, e, {f: SB.u.sumar(hoy, 1)})); assert.equal(avisosPendientes(evMan, man, ya, false).length, 1, "al día siguiente vuelve");
});
test("hábitos: nota por día — se abre, se guarda, se edita, se borra al dejarla vacía y se ven las anteriores", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.pintar = () => {}; SB.datos("habitos").h.push({id: "a", n: "Inglés", d: [0, 1, 2, 3, 4, 5, 6], h: {}, x: {[SB.u.sumar(hoy, -1)]: "Repasé verbos"}});
  const el = fakeEl(); SB.mods.habitos.pantalla(el); assert.match(el._h, /Nota de hoy/); assert.ok(!/Repasé verbos/.test(el._h), "cerrado: no se ven");
  click(el, "nota", {id: "a"}); SB.mods.habitos.pantalla(el); assert.match(el._h, /name="t"/); assert.match(el._h, /Repasé verbos/);
  enviar(el, "nota", {t: campo("  Hablé 20 minutos  ")}, {id: "a"}); assert.equal(SB.datos("habitos").h[0].x[hoy], "Hablé 20 minutos"); SB.mods.habitos.pantalla(el); assert.match(el._h, /Nota de hoy ✓/);
  enviar(el, "nota", {t: campo("Hablé 30")}, {id: "a"}); assert.equal(SB.datos("habitos").h[0].x[hoy], "Hablé 30");
  enviar(el, "nota", {t: campo("")}, {id: "a"}); assert.equal(SB.datos("habitos").h[0].x[hoy], undefined); assert.equal(Object.keys(SB.datos("habitos").h[0].x).length, 1, "la de ayer queda");
  enviar(el, "nota", {t: campo("x".repeat(900))}, {id: "a"}); assert.equal(SB.datos("habitos").h[0].x[hoy].length, 500);
});
test("hábitos: la búsqueda encuentra por nota; sin notas no queda el campo; un hábito viejo (sin v ni x) sigue andando", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("habitos").h.push({id: "a", n: "Inglés", d: [0, 1, 2, 3, 4, 5, 6], h: {}, x: {[hoy]: "Pronunciación de th"}}, {id: "b", n: "Viejo", d: [0, 1, 2, 3, 4, 5, 6], h: {}});
  assert.equal(SB.mods.habitos.buscar("pronunciacion").length, 1); assert.equal(SB.mods.habitos.buscar("viejo").length, 1);
  const el = fakeEl(); assert.doesNotThrow(() => SB.mods.habitos.pantalla(el)); assert.doesNotThrow(() => SB.mods.habitos.hoy()); assert.doesNotThrow(() => SB.mods.habitos.avisos());
});
test("repetición: deshacer una tarea hecha no deja la copia quitada en la Papelera; un borrado tuyo sí", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(); SB.datos("tareas").t.push({id: "a", t: "Regar", f: hoy, p: "", h: 0, c: 1, r: {u: "d", n: 1}}, {id: "b", t: "Borrada", f: "", p: "", h: 0, c: 2}); SB.guardar("tareas");
  SB.mods.tareas.alternar("a"); SB.mods.tareas.alternar("a"); assert.equal(SB.datos("papelera").x.length, 0);
  SB.datos("tareas").t = SB.datos("tareas").t.filter(x => x.id !== "b"); SB.guardar("tareas"); assert.deepEqual(J(SB.datos("papelera").x.map(x => x.l)), ["Borrada"]);
});
