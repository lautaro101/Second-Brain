const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const H = 36e5;
const ej = (id, n, extra) => Object.assign({id, n, s: 3, a: 6, b: 8, i: 2.5, p: 0, x: ""}, extra);
const montar = (SB, ejercicios) => { SB.datos("entrenamiento").rutina.push({id: "d1", n: "Torso A", ej: ejercicios}); };
const sesion = (SB, hace, ids, n) => { const E = SB.datos("entrenamiento"), R = E.rutina.flatMap(x => x.ej);
  E.ses.push({id: "s" + E.ses.length, n: n || "Torso A", d: "d1", f: SB.u.ymd(new Date(Date.now() - hace * H)), t: Date.now() - hace * H,
    ej: ids.map(id => ({e: id, n: R.find(x => x.id === id).n, s: [{k: 60, r: 8, ok: 1}]})), x: "", fin: Date.now() - hace * H}); };
const set = a => J(a.slice().sort());

test("recuperación: se adivinan los músculos por el nombre del ejercicio (gym y calistenia)", () => {
  const {SB} = abrir(), a = SB.mods.entrenamiento.util.adivinar;
  const casos = {"Press banca": ["pecho", "triceps"], "Jalón al pecho": ["espalda", "biceps"], "Remo con barra": ["espalda", "biceps"], "Press militar": ["hombros", "triceps"],
    "Elevaciones laterales": ["hombros"], "Curl de bíceps": ["biceps"], "Press francés": ["triceps"], "Sentadilla": ["cuadriceps", "gluteos"], "Hip thrust": ["gluteos"],
    "Curl femoral": ["gluteos", "isquios"], "Peso muerto rumano": ["gluteos", "isquios"], "Peso muerto": ["espalda", "gluteos", "isquios"], "Gemelos": ["gemelos"],
    "Plancha": ["core"], "Dominadas": ["biceps", "espalda"], "Flexiones": ["pecho", "triceps"], "Fondos": ["pecho", "triceps"], "Elevación de piernas": ["core"], "Pino (handstand)": ["hombros", "triceps"], "Algo raro": []};
  Object.keys(casos).forEach(n => assert.deepEqual(set(a(n)), set(casos[n]), n));
});
test("recuperación: lo que cargás a mano pisa lo que se adivina", () => {
  const {SB} = abrir(), u = SB.mods.entrenamiento.util;
  assert.deepEqual(J(u.musculos({n: "Press banca", m: ["hombros"]})), ["hombros"]); assert.deepEqual(set(u.musculos({n: "Press banca", m: []})), set(["pecho", "triceps"]));
  assert.deepEqual(set(u.musculos({n: "Press banca", m: ["inventado"]})), set(["pecho", "triceps"]));
});
test("recuperación: por defecto grandes 72 h y chicos 48 h, con las horas que faltan", () => {
  const {SB} = abrir(); montar(SB, [ej("e1", "Press banca"), ej("e2", "Elevaciones laterales")]); sesion(SB, 20, ["e1", "e2"]);
  const r = SB.mods.entrenamiento.util.recuperacion(), por = k => r.find(x => x.k === k);
  assert.equal(por("pecho").ok, false); assert.equal(por("pecho").falta, 52);               // 72 h − 20 h
  assert.equal(por("hombros").ok, false); assert.equal(por("hombros").falta, 28);           // 48 h − 20 h
  assert.equal(por("espalda"), undefined);                                                  // no la trabajó
  const r2 = SB.mods.entrenamiento.util.recuperacion(Date.now() + 29 * H); assert.equal(r2.find(x => x.k === "hombros").ok, true); assert.equal(r2.find(x => x.k === "pecho").ok, false);
});
test("recuperación: cuenta desde la última sesión que trabajó ese músculo y no cuenta ejercicios sin series hechas", () => {
  const {SB} = abrir(); montar(SB, [ej("e1", "Press banca"), ej("e2", "Sentadilla")]); sesion(SB, 80, ["e1"]); sesion(SB, 10, ["e2"]); sesion(SB, 5, ["e1"]);
  SB.datos("entrenamiento").ses[2].ej[0].s = [{k: 60, r: 8, ok: 0}];                       // la de hace 5 h no marcó ninguna serie: no vale
  const r = SB.mods.entrenamiento.util.recuperacion(); assert.equal(r.find(x => x.k === "pecho").ok, true); assert.equal(r.find(x => x.k === "cuadriceps").falta, 62);
});
test("recuperación: si borrás el ejercicio de la rutina, igual se cuenta por el nombre que quedó en la sesión", () => {
  const {SB} = abrir(); montar(SB, [ej("e1", "Dominadas")]); sesion(SB, 10, ["e1"]); SB.datos("entrenamiento").rutina[0].ej = [];
  assert.deepEqual(set(SB.mods.entrenamiento.util.recuperacion().map(x => x.k)), set(["espalda", "biceps"]));
});
test("recuperación: avisa el día en que se recuperan, agrupando por día, sin avisar lo que ya estaba listo", () => {
  const {SB} = abrir(); montar(SB, [ej("e1", "Press banca"), ej("e2", "Elevaciones laterales"), ej("e3", "Sentadilla")]);
  sesion(SB, 1, ["e1", "e2"]); sesion(SB, 100, ["e3"]);                                    // el cuádriceps ya está listo hace rato
  const av = SB.mods.entrenamiento.avisos(), dia = h => SB.u.ymd(new Date(Date.now() + h * H));
  assert.ok(av.length >= 1 && av.length <= 2); av.forEach(e => { assert.equal(e.solo, true); assert.equal(e.bg, true); assert.equal(e.t, "Recuperación muscular"); });
  const texto = av.map(e => e.c).join(" "); assert.match(texto, /pecho/); assert.match(texto, /hombros/); assert.doesNotMatch(texto, /cuádriceps/);
  assert.equal(av.find(e => /pecho/.test(e.c)).f, dia(71)); assert.equal(av.find(e => /hombros/.test(e.c)).f, dia(47));
  assert.match(av[0].c, /^Ya se recuperaron: /);
});
test("recuperación: el aviso se apaga desde Ajustes", () => {
  const {SB} = abrir({datos: {sb_cfg: JSON.stringify({off: [], avx: {recuperacion: false}})}}); montar(SB, [ej("e1", "Press banca")]); sesion(SB, 1, ["e1"]);
  assert.deepEqual(J(SB.mods.entrenamiento.avisos()), []);
});
test("recuperación: Hoy avisa si el día que toca trabaja músculos que no se recuperaron", () => {
  const {SB} = abrir(); montar(SB, [ej("e1", "Press banca")]); SB.datos("entrenamiento").rutina.push({id: "d2", n: "Pierna", ej: [ej("e9", "Sentadilla")]});
  sesion(SB, 3, ["e1"]); SB.datos("entrenamiento").ses[0].f = SB.u.sumar(SB.u.ymd(), -1);
  assert.doesNotMatch(SB.mods.entrenamiento.hoy()[0].s, /recuperación/);               // toca Pierna: no trabaja pecho
  SB.datos("entrenamiento").rutina[1].ej = [ej("e8", "Press inclinado")]; assert.match(SB.mods.entrenamiento.hoy()[0].s, /⚠️ pecho, tríceps en recuperación/);
});
test("recuperación: la pantalla muestra la tarjeta, avisa en el día elegido y deja corregir los músculos del ejercicio", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; montar(SB, [ej("e1", "Press banca")]); sesion(SB, 3, ["e1"]);
  const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.pintar = () => SB.mods.entrenamiento.pantalla(el); SB.mods.entrenamiento.pantalla(el);
  assert.match(el.innerHTML, /Recuperación muscular/); assert.match(el.innerHTML, /faltan 69 h/); assert.match(el.innerHTML, /Todavía en recuperación: pecho \(69 h\), tríceps \(45 h\)/);
  const click = (a, d) => el.onclick({target: {closest: () => ({dataset: Object.assign({a}, d)})}});
  click("tab", {t: "rutina"}); assert.match(el.innerHTML, /💪 Pecho, Tríceps/); click("ej-edit", {e: "e1"}); assert.match(el.innerHTML, /name="m" value="pecho" checked/); assert.match(el.innerHTML, /name="m" value="espalda" hidden/);
  const campos = {n: "Press banca", s: "3", a: "6", b: "8", i: "2.5", x: ""}, fm = {dataset: {f: "ej-guardar", d: "d1", e: "e1"}, elements: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, {value: v}])), querySelectorAll: () => [{value: "pecho"}, {value: "hombros"}]};
  fm.elements.p = {checked: false}; const enviar = () => el.onsubmit({target: {closest: () => fm}, preventDefault() {}});
  enviar(); assert.deepEqual(J(SB.datos("entrenamiento").rutina[0].ej[0].m), ["pecho", "hombros"]);
  click("ej-edit", {e: "e1"}); fm.querySelectorAll = () => []; enviar(); assert.equal(SB.datos("entrenamiento").rutina[0].ej[0].m, undefined);   // sin ninguno elegido: vuelve a adivinar
});

/* ---- mapa del cuerpo ---- */
const pantallaHoy = SB => { const el = {innerHTML: "", querySelectorAll: () => [], querySelector: () => null}; SB.pintar = () => SB.mods.entrenamiento.pantalla(el); SB.mods.entrenamiento.pantalla(el); return el; };
const colorDe = (html, k) => { const m = new RegExp('data-k="' + k + '"[^>]*>(?:<title>[^<]*</title>)?<path d="[^"]*" style="fill:(#[0-9a-f]{6})').exec(html); return m && m[1]; };
const AMARILLO = "#f2c230", VERDE = "#3fb06a";
test("mapa del cuerpo: dibuja frente y espalda, y pinta de amarillo lo que está en recuperación y de verde lo demás", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; montar(SB, [ej("e1", "Press banca"), ej("e2", "Sentadilla")]); sesion(SB, 3, ["e1"]); sesion(SB, 100, ["e2"]);
  const html = pantallaHoy(SB).innerHTML; assert.match(html, /<svg viewBox/); assert.match(html, />Frente</); assert.match(html, />Espalda</);
  assert.equal(colorDe(html, "pecho"), AMARILLO); assert.equal(colorDe(html, "triceps"), AMARILLO);          // 48 h − 3 h
  assert.equal(colorDe(html, "cuadriceps"), VERDE); assert.equal(colorDe(html, "espalda"), VERDE); assert.equal(colorDe(html, "core"), VERDE);   // recuperado / nunca trabajado
  assert.match(html, /En recuperación/); assert.match(html, /Podés entrenarlo/);
});
test("mapa del cuerpo: están los diez músculos, y los que se ven de los dos lados (hombros) aparecen en frente y espalda", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; const html = pantallaHoy(SB).innerHTML;
  ["pecho", "espalda", "hombros", "biceps", "triceps", "core", "cuadriceps", "isquios", "gluteos", "gemelos"].forEach(k => assert.ok(html.includes('data-k="' + k + '"'), k));
  assert.equal(html.split('data-k="hombros"').length - 1, 2); assert.match(html, /No tenés músculos en recuperación/);                     // sin entrenar: todo verde
  assert.ok(!html.includes(AMARILLO + ";stroke"));
});
test("mapa del cuerpo: tocar un músculo muestra el detalle (horas que faltan) y tocarlo de nuevo lo oculta", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; montar(SB, [ej("e1", "Press banca")]); sesion(SB, 3, ["e1"]); const el = pantallaHoy(SB);
  assert.match(el.innerHTML, /Tocá un músculo para ver el detalle/); const tocar = k => el.onclick({target: {closest: () => ({dataset: {a: "mus", k}})}});
  tocar("pecho"); assert.match(el.innerHTML, /Pecho: en recuperación, faltan 69 h/); tocar("pecho"); assert.match(el.innerHTML, /Tocá un músculo/);
  tocar("espalda"); assert.match(el.innerHTML, /Espalda: listo para entrenar \(todavía no lo trabajaste\)/);
});
test("mapa del cuerpo: el contorno oscuro marca los músculos del día elegido", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; montar(SB, [ej("e1", "Press banca")]); const html = pantallaHoy(SB).innerHTML;
  assert.match(html, /data-k="pecho"[^>]*>(?:<title>[^<]*<\/title>)?<path d="[^"]*" style="fill:#3fb06a;stroke:currentColor;stroke-width:2.4/);        // el día trabaja pecho
  assert.match(html, /data-k="espalda"[^>]*>(?:<title>[^<]*<\/title>)?<path d="[^"]*" style="fill:#3fb06a;stroke:rgba\(0,0,0,\.35\);stroke-width:0.8/); assert.match(html, /Contorno oscuro/);
});
test("mapa del cuerpo: los nombres y textos se escapan (no se cuela HTML por el título de los músculos)", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; montar(SB, [ej("e1", "<img src=x onerror=alert(1)> Press banca")]); sesion(SB, 1, ["e1"]); const html = pantallaHoy(SB).innerHTML;
  assert.doesNotMatch(html, /<img src=x/);
});

/* ---- horas de descanso ajustables ---- */
const sinEntrenar = SB => { montar(SB, [ej("e1", "Press banca"), ej("e2", "Elevaciones laterales")]); sesion(SB, 20, ["e1", "e2"]); };
test("horas de descanso: lo que cambia el usuario pisa el valor por defecto; lo inválido se ignora", () => {
  const {SB} = abrir(); sinEntrenar(SB); const U = SB.mods.entrenamiento.util, falta = k => U.recuperacion().find(x => x.k === k).falta;
  assert.equal(falta("pecho"), 52); SB.datos("entrenamiento").rec = {pecho: {h: 48}, hombros: {h: 24}};
  assert.equal(falta("pecho"), 28); assert.equal(falta("hombros"), 4);
  ["abc", 0, -5, 9999, null].forEach(h => { SB.datos("entrenamiento").rec = {pecho: {h}}; assert.equal(falta("pecho"), 52, String(h)); });      // inválido: vuelve al valor por defecto
  SB.datos("entrenamiento").rec = undefined; assert.equal(falta("pecho"), 52);                                                          // datos viejos sin «rec»
});
test("horas de descanso: los avisos y el aviso del día de rutina usan las horas del usuario", () => {
  const {SB} = abrir(); montar(SB, [ej("e1", "Press banca")]); sesion(SB, 60, ["e1"]); SB.datos("entrenamiento").rutina.push({id: "d2", n: "Pecho", ej: [ej("e9", "Press inclinado")]}); SB.datos("entrenamiento").ses[0].f = SB.u.sumar(SB.u.ymd(), -1);
  assert.match(SB.mods.entrenamiento.hoy()[0].s, /pecho/); assert.match(SB.mods.entrenamiento.avisos().map(e => e.c).join(" "), /pecho/);   // hace 60 h: con 72 h todavía faltan 12
  SB.datos("entrenamiento").rec = {pecho: {h: 24}, triceps: {h: 24}};                                                                      // con 24 h ya estaba lista hace 36 h (siempre antes de hoy: no avisa)
  assert.doesNotMatch(SB.mods.entrenamiento.hoy()[0].s, /recuperación/); assert.doesNotMatch(SB.mods.entrenamiento.avisos().map(e => e.c).join(" "), /pecho/);
});
test("horas de descanso: el panel se abre, guarda solo lo que difiere del valor por defecto, y vuelve a los valores por defecto", () => {
  const {SB, ctx} = abrir(); ctx.document = {}; sinEntrenar(SB); const el = pantallaHoy(SB), E = () => SB.datos("entrenamiento");
  assert.match(el.innerHTML, /Ajustar las horas de descanso/); assert.doesNotMatch(el.innerHTML, /data-f="rec"/);
  const click = a => el.onclick({target: {closest: () => ({dataset: {a}})}}); click("rec-ajustar");
  assert.match(el.innerHTML, /data-f="rec"/); assert.match(el.innerHTML, /<option value="72" selected>72 h \(por defecto\)<\/option>/); assert.match(el.innerHTML, /<option value="48" selected>48 h \(por defecto\)<\/option>/);
  const elementos = {}; ["pecho", "espalda", "hombros", "biceps", "triceps", "core", "cuadriceps", "isquios", "gluteos", "gemelos"].forEach(k => { elementos[k] = {value: String({pecho: 48, hombros: 24, espalda: 72}[k] || ({biceps: 48, triceps: 48, core: 48, gemelos: 48}[k] || 72))}; });
  el.onsubmit({target: {closest: () => ({dataset: {f: "rec"}, elements: elementos})}, preventDefault() {}});
  assert.deepEqual(J(E().rec), {pecho: {h: 48}, hombros: {h: 24}});                                                                       // solo lo que cambió
  assert.doesNotMatch(el.innerHTML, /data-f="rec"/); click("rec-ajustar"); assert.match(el.innerHTML, /<option value="48" selected>48 h<\/option>/);   // el panel muestra lo guardado
  click("rec-reset"); assert.deepEqual(J(E().rec), {});
});
test("horas de descanso: viajan entre dispositivos (rec se sincroniza)", () => {
  const {SB} = abrir(); assert.ok(J(SB.mods.entrenamiento.sync.map(x => x.k)).includes("rec")); assert.deepEqual(J(SB.mods.entrenamiento.inicial().rec), {});
});
