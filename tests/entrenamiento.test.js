const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const nuevo = () => { const p = abrir({extra: {setInterval, clearInterval}}); p.SB.aviso = () => {}; p.SB.pintar = () => {}; return p; };
const dia = (SB, n, ejs) => { const d = {id: "d" + n, n, ej: ejs.map(([en, s, a, b, i]) => ({id: "e" + en.replace(/\W/g, ""), n: en, s, a, b, i: i || 2.5, p: 1, x: ""}))}; SB.datos("entrenamiento").rutina.push(d); return d; };
const ses = (SB, d, f, sets, fin = 1) => SB.datos("entrenamiento").ses.push({id: "s" + Math.random().toString(36).slice(2), n: d.n, d: d.id, f, ej: d.ej.map(e => ({e: e.id, n: e.n, s: sets.map(([k, r]) => ({k, r, ok: 1}))})), x: "", fin, t: 1 });
const BANCA = ["Press banca", 3, 6, 8];

test("entrenamiento: se registra sin fallos, la Papelera lo cubre y se sincroniza por rutina y ses", () => {
  const {SB} = nuevo(); assert.deepEqual(J(SB.fallos), {}); assert.deepEqual(J(SB.mods.entrenamiento.sync.map(x => x.k)), ["rutina", "ses"]);
  const d = dia(SB, "Torso A", [BANCA]); ses(SB, d, "2026-11-16", [[80, 8], [80, 8], [80, 8]]); SB.alArrancar[SB.alArrancar.length - 1]();
  SB.datos("entrenamiento").ses.splice(0, 1); SB.guardar("entrenamiento"); assert.equal(SB.datos("papelera").x.length, 1); assert.equal(SB.datos("papelera").x[0].m, "entrenamiento");
});
test("entrenamiento: 1RM estimado (Epley) y volumen cuentan solo las series hechas", () => {
  const {e1rm, mejor1RM, volumen} = nuevo().SB.mods.entrenamiento.util;
  assert.equal(e1rm(100, 1), 100); assert.equal(e1rm(80, 8), 101.3); assert.equal(e1rm(60, 10), 80);
  const e = {s: [{k: 100, r: 5, ok: 1}, {k: 120, r: 5, ok: 0}]}; assert.equal(mejor1RM(e), 116.7); assert.equal(volumen({ej: [e, {s: [{k: 50, r: 10, ok: 1}]}]}), 1000);
});
test("entrenamiento: sin historia pide elegir peso; con historia copia la última vez", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Torso A", [BANCA]), ex = d.ej[0];
  let p = u.plan(ex); assert.equal(p.sets.length, 3); assert.deepEqual(J(p.sets[0]), {k: 0, r: 6}); assert.match(p.hint, /Primera vez/); assert.equal(p.subir, false);
  ses(SB, d, "2026-11-10", [[80, 7], [80, 6], [80, 6]]); p = u.plan(ex);
  assert.deepEqual(J(p.sets), [{k: 80, r: 7}, {k: 80, r: 6}, {k: 80, r: 6}]); assert.equal(p.subir, false); assert.match(p.hint, /80 kg/);
});
test("entrenamiento: propone subir el peso solo si hiciste todas las series en el tope con el mismo peso", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Torso A", [BANCA, ["Remo", 3, 8, 10, 5]]);
  ses(SB, d, "2026-11-10", [[80, 8], [80, 8], [80, 8]]);
  let p = u.plan(d.ej[0]); assert.equal(p.subir, true); assert.deepEqual(J(p.sets[0]), {k: 82.5, r: 6}); assert.match(p.hint, /82,5 kg/);
  p = u.plan(d.ej[1]); assert.equal(p.subir, false, "el remo se hizo 8 reps y su tope es 10");
  SB.datos("entrenamiento").ses.length = 0; ses(SB, d, "2026-11-10", [[80, 8], [80, 8], [80, 7]]); assert.equal(u.plan(d.ej[0]).subir, false, "una serie corta no alcanza");
  SB.datos("entrenamiento").ses.length = 0; ses(SB, d, "2026-11-10", [[80, 8], [80, 8]]); assert.equal(u.plan(d.ej[0]).subir, false, "faltó una serie");
  SB.datos("entrenamiento").ses.length = 0; SB.datos("entrenamiento").ses.push({id: "solo", n: d.n, d: d.id, f: "2026-11-10", ej: [{e: d.ej[0].id, n: "Press banca", s: [{k: 80, r: 10, ok: 1}, {k: 80, r: 10, ok: 1}, {k: 80, r: 10, ok: 1}]}], x: "", fin: 1, t: 1});
  p = u.plan(d.ej[1]); assert.equal(p.subir, false, "el remo no se hizo esa vez"); assert.match(p.hint, /Primera vez/);
});
test("entrenamiento: el incremento propio de cada ejercicio manda", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Pierna A", [["Sentadilla", 3, 6, 8, 5]]); ses(SB, d, "2026-11-10", [[100, 8], [100, 8], [100, 8]]); assert.equal(u.plan(d.ej[0]).sets[0].k, 105);
});
test("entrenamiento: la rotación sigue el orden de la rutina, da la vuelta y no se pierde si borrás un día", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, a = dia(SB, "Torso A", [BANCA]), b = dia(SB, "Pierna A", [["Sentadilla", 3, 6, 8]]);
  assert.equal(u.proximoDia().n, "Torso A"); ses(SB, a, "2026-11-10", [[80, 8]]); assert.equal(u.proximoDia().n, "Pierna A");
  ses(SB, b, "2026-11-11", [[100, 8]]); assert.equal(u.proximoDia().n, "Torso A", "da la vuelta");
  SB.datos("entrenamiento").rutina.splice(1, 1); assert.equal(u.proximoDia().n, "Torso A", "el último día ya no existe: arranca de nuevo");
  SB.datos("entrenamiento").rutina.length = 0; assert.equal(u.proximoDia(), null);
});
test("entrenamiento: empezar prellena con el plan, no deja abrir dos sesiones y terminar guarda solo lo hecho", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Torso A", [BANCA, ["Remo", 3, 8, 10]]), D = () => SB.datos("entrenamiento");
  ses(SB, d, "2026-11-10", [[80, 7], [80, 7], [80, 7]]); u.empezar(d.id); u.empezar(d.id); assert.equal(D().ses.filter(s => !s.fin).length, 1);
  const s = D().ses.find(x => !x.fin); assert.equal(s.ej.length, 2); assert.deepEqual(J(s.ej[0].s.map(x => [x.k, x.r, x.ok])), [[80, 7, 0], [80, 7, 0], [80, 7, 0]]);
  s.ej[0].s[0].ok = 1; s.ej[0].s[1].ok = 1; s.ej[0].s[1].k = 82.5; assert.equal(u.terminar(), "terminada");
  assert.ok(s.fin > 0); assert.equal(s.ej.length, 1, "el remo no tuvo series hechas"); assert.deepEqual(J(s.ej[0].s.map(x => [x.k, x.r])), [[80, 7], [82.5, 7]]);
  assert.equal(u.volumen(s), 80 * 7 + 82.5 * 7);
});
test("entrenamiento: terminar sin ninguna serie hecha descarta la sesión sin ensuciar la Papelera", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Torso A", [BANCA]); SB.alArrancar[SB.alArrancar.length - 1](); u.empezar(d.id);
  assert.equal(u.terminar(), "descartada"); assert.equal(SB.datos("entrenamiento").ses.length, 0); assert.equal(SB.datos("papelera").x.length, 0);
});
test("entrenamiento: récord = superar el mejor 1RM de antes; la primera vez es el punto de partida", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Torso A", [BANCA]);
  ses(SB, d, "2026-11-02", [[80, 8]]); ses(SB, d, "2026-11-09", [[82.5, 8]]); ses(SB, d, "2026-11-16", [[80, 6]]); ses(SB, d, "2026-11-23", [[85, 8]]);
  const r = u.records(), D = SB.datos("entrenamiento").ses, [s1, s2, s3, s4] = D;
  assert.ok(!r.has(s1.id + "|" + d.ej[0].id)); assert.ok(r.has(s2.id + "|" + d.ej[0].id)); assert.ok(!r.has(s3.id + "|" + d.ej[0].id)); assert.ok(r.has(s4.id + "|" + d.ej[0].id));
  assert.deepEqual(J(u.historia(d.ej[0].id).map(x => x.v)), [101.3, 104.5, 96, 107.7]);
});
test("entrenamiento: las sesiones de la semana van de lunes a domingo", () => {
  const {SB} = nuevo(), u = SB.mods.entrenamiento.util, d = dia(SB, "Torso A", [BANCA]);
  ["2026-11-15", "2026-11-16", "2026-11-22", "2026-11-23"].forEach(f => ses(SB, d, f, [[80, 8]]));   // 16/11/2026 es lunes
  assert.equal(u.sesionesSemana("2026-11-18"), 2); assert.equal(u.sesionesSemana("2026-11-23"), 1); assert.equal(u.lunes("2026-11-22"), "2026-11-16");
});
test("entrenamiento: gráfico chico válido, y vacío si hay menos de 2 puntos", () => {
  const {chispa} = nuevo().SB.mods.entrenamiento.util; assert.equal(chispa([100]), ""); const s = chispa([100, 110, 105]);
  assert.match(s, /^<svg/); assert.ok(!/NaN|Infinity/.test(s)); assert.ok(!/NaN/.test(chispa([100, 100])), "valores iguales no dividen por cero");
});
test("entrenamiento: Hoy aparece hasta cumplir las sesiones de la semana y se esconde después", () => {
  const {SB} = nuevo(), hoy = SB.u.ymd(), m = SB.mods.entrenamiento, l = m.util.lunes(hoy);
  assert.deepEqual(J(m.hoy()), [], "sin días cargados no hay nada");
  const a = dia(SB, "Torso A", [BANCA]), b = dia(SB, "Pierna A", [["Sentadilla", 3, 6, 8]]);
  let h = m.hoy(); assert.equal(h.length, 1); assert.match(h[0].t, /Entrenar: Torso A/); assert.match(h[0].s, /0\/2 esta semana/); assert.equal(h[0].hecho, false);
  const sem = l < hoy ? l : hoy; ses(SB, a, sem, [[80, 8]]); ses(SB, b, sem, [[100, 8]]);   // cumplió las 2 de la semana
  if (sem !== hoy) assert.equal(m.hoy().filter(x => /Entrenar|Entrenaste/.test(x.t)).length, 0, "meta cumplida y hoy no entrenó: se esconde");
  ses(SB, a, hoy, [[80, 8]]); h = m.hoy().filter(x => /Entrenaste/.test(x.t)); assert.equal(h.length, 1); assert.equal(h[0].hecho, true);
});
test("entrenamiento: una sesión en curso se ve en Hoy; la revisión de progresión aparece a las 2 semanas y se puede marcar", () => {
  const {SB} = nuevo(), hoy = SB.u.ymd(), m = SB.mods.entrenamiento, d = dia(SB, "Torso A", [BANCA]), D = () => SB.datos("entrenamiento");
  ses(SB, d, SB.u.sumar(hoy, -20), [[80, 8]]); ses(SB, d, SB.u.sumar(hoy, -10), [[80, 8]]);
  let h = m.hoy(); const r = h.find(x => /progresión/.test(x.t)); assert.ok(r, "pasaron más de 14 días desde la primera sesión"); r.tocar(); assert.equal(D().rev, hoy); assert.ok(!m.hoy().some(x => /progresión/.test(x.t)));
  m.util.empezar(d.id); h = m.hoy(); assert.match(h[0].t, /Sesión en curso: Torso A/);
});
test("entrenamiento: la proteína solo aparece en Hoy si la usás, y cuenta contra la meta", () => {
  const {SB} = nuevo(), hoy = SB.u.ymd(), m = SB.mods.entrenamiento, D = () => SB.datos("entrenamiento");
  assert.ok(!m.hoy().some(x => /Proteína/.test(x.t))); D().p[hoy] = 100; let x = m.hoy().find(y => /Proteína/.test(y.t)); assert.equal(x.s, "100 de 130 g"); assert.equal(x.hecho, false);
  D().p[hoy] = 130; assert.equal(m.hoy().find(y => /Proteína/.test(y.t)).hecho, true);
});
test("entrenamiento: la revisión semanal resume sesiones, volumen, récords y proteína", () => {
  const {SB} = nuevo(), hoy = SB.u.ymd(), m = SB.mods.entrenamiento;
  assert.deepEqual(J(m.semana()), [], "sin nada cargado no se muestra"); const d = dia(SB, "Torso A", [BANCA]); ses(SB, d, SB.u.sumar(hoy, -10), [[80, 8]]); ses(SB, d, SB.u.sumar(hoy, -1), [[85, 8], [85, 8]]); SB.datos("entrenamiento").p[hoy] = 120;
  const t = m.semana().join(" | "); assert.match(t, /Entrenaste 1 vez en los últimos 7 días \(meta: 1\) con 1\.360 kg de volumen/); assert.match(t, /🏅 Récords: Press banca/); assert.match(t, /Proteína: 120 g por día/);
});
test("entrenamiento: buscar encuentra ejercicios y notas de sesiones", () => {
  const {SB} = nuevo(), d = dia(SB, "Torso A", [BANCA]); ses(SB, d, "2026-11-16", [[80, 8]]); SB.datos("entrenamiento").ses[0].x = "cuidar la técnica del hombro";
  const m = SB.mods.entrenamiento; assert.equal(m.buscar("banca").length, 1); assert.equal(m.buscar("hombro").length, 1); assert.equal(m.buscar("undefined").length, 0);
});

/* ---- la pantalla: se dibuja, se escapa y los botones hacen lo que dicen ---- */
const pantalla = (p, sub) => { const el = {querySelectorAll: () => [], querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; p.SB.mods.entrenamiento.pantalla(el, sub); return el; };
const clic = (el, dataset, extra = {}) => el.onclick({target: {closest: () => ({dataset, ...extra})}});
const cambio = (el, dataset, value) => el.onchange({target: {closest: () => ({dataset, value})}});
const enviar = (el, nombre, campos, dataset = {}) => { const elements = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === "boolean" ? {checked: v} : {value: v}])); el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: nombre, ...dataset}, elements})}}); };
test("entrenamiento: sin rutina ofrece la plantilla; cargarla arma 4 días y la sesión se hace de punta a punta", () => {
  const p = nuevo(), {SB} = p, D = () => SB.datos("entrenamiento"); let el = pantalla(p); assert.match(el.innerHTML, /Cargar plantilla/);
  clic(el, {a: "plantilla"}); assert.deepEqual(J(D().rutina.map(x => x.n)), ["Torso A", "Pierna A", "Torso B", "Pierna B"]);
  el = pantalla(p); assert.match(el.innerHTML, /Empezar Torso A/); clic(el, {a: "dia", d: D().rutina[1].id}); el = pantalla(p); assert.match(el.innerHTML, /Empezar Pierna A/);
  clic(el, {a: "empezar", d: D().rutina[0].id}); el = pantalla(p); assert.match(el.innerHTML, /Terminar sesión/); assert.match(el.innerHTML, /Press banca/);
  cambio(el, {c: "k", e: "0", s: "0"}, "82,5"); cambio(el, {c: "r", e: "0", s: "0"}, "8"); clic(el, {a: "ok", e: "0", s: "0"}); cambio(el, {c: "nota", e: "0", s: "0"}, "se sintió bien");
  const s = D().ses[0]; assert.deepEqual(J(s.ej[0].s[0]), {k: 82.5, r: 8, ok: 1}); assert.equal(s.x, "se sintió bien");
  clic(el, {a: "mas", e: "0"}); assert.equal(s.ej[0].s.length, 4); clic(el, {a: "menos", e: "0"}); assert.equal(s.ej[0].s.length, 3);
  clic(el, {a: "terminar"}); assert.ok(s.fin); assert.equal(s.ej.length, 1); el = pantalla(p); assert.match(el.innerHTML, /Esta semana: 1 de 4/);
});
test("entrenamiento: las pestañas Progreso y Rutina se dibujan con y sin datos", () => {
  const p = nuevo(), {SB} = p; let el = pantalla(p); clic(el, {a: "tab", t: "prog"}); el = pantalla(p); assert.match(el.innerHTML, /aparece cuando termines/);
  const d = dia(SB, "Torso A", [BANCA]); ses(SB, d, "2026-11-02", [[80, 8], [80, 8], [80, 8]]); ses(SB, d, "2026-11-09", [[82.5, 8], [82.5, 8], [82.5, 8]]);
  el = pantalla(p); const h = el.innerHTML; assert.match(h, /1RM estimado/); assert.match(h, /<svg/); assert.match(h, /Últimas sesiones/); assert.match(h, /subí a 85 kg/); assert.match(h, /🏅/);
  clic(el, {a: "tab", t: "rutina"}); el = pantalla(p); assert.match(el.innerHTML, /Press banca/); assert.match(el.innerHTML, /Nuevo día/);
  clic(el, {a: "tab", t: "hoy"}); el = pantalla(p, "progreso"); assert.match(el.innerHTML, /1RM estimado/, "la ruta #/entrenamiento/progreso abre Progreso");
});
test("entrenamiento: editar la rutina (agregar, editar, subir, borrar) y respetar los límites", () => {
  const p = nuevo(), {SB} = p, D = () => SB.datos("entrenamiento"); let el = pantalla(p); clic(el, {a: "tab", t: "rutina"}); el = pantalla(p);
  enviar(el, "dia-nueva", {n: "Full body"}); assert.equal(D().rutina.length, 1); const dd = D().rutina[0]; el = pantalla(p);
  enviar(el, "ej-nueva", {n: "Dominadas"}, {d: dd.id}); enviar(el, "ej-nueva", {n: "Fondos"}, {d: dd.id}); assert.deepEqual(J(dd.ej.map(e => [e.n, e.s, e.a, e.b])), [["Dominadas", 3, 6, 8], ["Fondos", 3, 6, 8]]);
  const f = dd.ej[1]; clic(el, {a: "ej-sube", d: dd.id, e: f.id}); assert.equal(dd.ej[0].n, "Fondos");
  clic(el, {a: "ej-edit", e: f.id}); el = pantalla(p); assert.match(el.innerHTML, /Nota de técnica/);
  enviar(el, "ej-guardar", {n: "Fondos lastrados", s: "99", a: "10", b: "4", i: "0", x: "codos pegados", p: true}, {d: dd.id, e: f.id});
  assert.deepEqual(J([f.n, f.s, f.a, f.b, f.i, f.p, f.x]), ["Fondos lastrados", 10, 10, 10, 2.5, 1, "codos pegados"], "series máx. 10, el tope nunca es menor que el mínimo, incremento mínimo 2,5 si queda en 0");
  clic(el, {a: "ej-del", d: dd.id, e: f.id}); assert.equal(dd.ej.length, 1); clic(el, {a: "dia-del", d: dd.id}); assert.equal(D().rutina.length, 0);
});
test("entrenamiento: proteína (sumar, fijar el total, borrar y cambiar la meta) con límites", () => {
  const p = nuevo(), {SB} = p, D = () => SB.datos("entrenamiento"), hoy = SB.u.ymd(); let el = pantalla(p);
  clic(el, {a: "prot", g: "30"}); clic(el, {a: "prot", g: "20"}); assert.equal(D().p[hoy], 50); enviar(el, "prot", {g: "95"}); assert.equal(D().p[hoy], 95);
  enviar(el, "prot", {g: "5000"}); assert.equal(D().p[hoy], 999); enviar(el, "prot", {g: ""}); assert.equal(D().p[hoy], undefined);
  enviar(el, "meta", {m: "150"}); assert.equal(D().pm, 150); enviar(el, "meta", {m: "0"}); assert.equal(D().pm, 150, "una meta en 0 se ignora");
});
test("entrenamiento: borrar una sesión pide confirmar y va a la Papelera", () => {
  const p = nuevo(), {SB} = p, d = dia(SB, "Torso A", [BANCA]); ses(SB, d, "2026-11-16", [[80, 8]]); SB.alArrancar[SB.alArrancar.length - 1]();
  let el = pantalla(p); clic(el, {a: "tab", t: "prog"}); el = pantalla(p); assert.match(el.innerHTML, /Borrar sesión/);
  clic(el, {a: "borrar", id: SB.datos("entrenamiento").ses[0].id}); assert.equal(SB.datos("entrenamiento").ses.length, 0); assert.equal(SB.datos("papelera").x.length, 1);
});
test("entrenamiento: los nombres y notas con HTML se escapan en todas las pestañas", () => {
  const p = nuevo(), {SB} = p, X = '<img src=x onerror=alert(1)>', d = dia(SB, X, [[X, 3, 6, 8]]); d.ej[0].x = X; ses(SB, d, "2026-11-16", [[80, 8]]); SB.datos("entrenamiento").ses[0].x = X;
  for (const t of ["hoy", "prog", "rutina"]) { let el = pantalla(p); clic(el, {a: "tab", t}); el = pantalla(p); assert.ok(!el.innerHTML.includes("<img"), "sin escapar en " + t); assert.match(el.innerHTML, /&lt;img/); }
  clic(pantalla(p), {a: "tab", t: "hoy"}); SB.mods.entrenamiento.util.empezar(d.id); let el = pantalla(p); assert.ok(!el.innerHTML.includes("<img"), "sesión en curso");
});
test("entrenamiento: un dato roto (sesión sin ejercicios, series vacías) no rompe la pantalla ni Hoy", () => {
  const p = nuevo(), {SB} = p, D = () => SB.datos("entrenamiento"); D().ses.push({id: "x", n: "Roto", d: "?", f: "2026-11-16", ej: [{e: "q", n: "Q", s: []}], x: "", fin: 5, t: 1}); D().rutina.push({id: "r", n: "Vacío", ej: []});
  for (const t of ["hoy", "prog", "rutina"]) { let el = pantalla(p); clic(el, {a: "tab", t}); pantalla(p); } SB.mods.entrenamiento.hoy(); SB.mods.entrenamiento.semana(); SB.mods.entrenamiento.buscar("q"); assert.deepEqual(J(SB.fallos), {});
});
