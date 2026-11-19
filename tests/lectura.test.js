const test = require("node:test"), assert = require("node:assert/strict");
const helpers = require("./helpers"), {J} = helpers;
const abrir = () => { const r = helpers.abrir(); r.SB.aviso = () => {}; return r; };
const L = SB => SB.mods.lectura.util, D = SB => SB.datos("lectura");
const vista = (SB, sub) => { const el = {querySelector: () => null, querySelectorAll: () => [], set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; SB.mods.lectura.pantalla(el, sub); return el._h; };

test("lectura: está en la lista, se registra sin fallos y ya no figura en «Para después»", () => {
  const {SB, ctx} = abrir(); assert.deepEqual(J(SB.fallos), {}); assert.ok(SB.mods.lectura);
  assert.ok(ctx.SB_ARCHIVOS.includes("modulos/lectura.js")); assert.ok(!ctx.SB_PARA_DESPUES.map(x => x[0]).includes("Lectura"));
});
test("lectura: el avance se calcula como porcentaje y al llegar a la última página queda leído con fecha de fin", () => {
  const {SB} = abrir(), u = L(SB), l = u.crear("Rayuela", "q", {a: "Cortázar", p: 400});
  assert.equal(u.pct(l), 0); u.anotar(l, 100);
  assert.equal(l.st, "l"); assert.equal(l.i, SB.u.ymd()); assert.equal(u.pct(l), 25);
  u.anotar(l, 200); assert.equal(u.pct(l), 50); assert.equal(D(SB).h.length, 1, "una anotación por día");
  u.anotar(l, 999); assert.equal(l.pg, 400, "no pasa del total"); assert.equal(l.st, "t"); assert.equal(l.e, SB.u.ymd()); assert.equal(u.pct(l), 100);
  u.anotar(l, 300); assert.equal(l.st, "l"); assert.equal(l.e, "", "si corregís hacia atrás, vuelve a estar en curso");
});
test("lectura: sin el total de páginas no hay porcentaje pero sí se guarda por dónde vas; «terminé» a mano completa todo", () => {
  const {SB} = abrir(), u = L(SB), l = u.crear("Sin total", "l"); u.anotar(l, 37); assert.equal(l.pg, 37); assert.equal(u.pct(l), 0);
  l.p = 120; u.terminar(l); assert.equal(l.pg, 120); assert.equal(l.st, "t"); assert.equal(u.pct(l), 100);
});
test("lectura: páginas leídas y ritmo salen de las anotaciones (la primera cuenta entera si lo empezaste ese día)", () => {
  const {SB} = abrir(), u = L(SB), hoy = SB.u.ymd(), ayer = SB.u.sumar(hoy, -1), antes = SB.u.sumar(hoy, -4);
  const l = u.crear("Largo", "l", {p: 300, i: antes}); D(SB).h.push({id: "1", l: l.id, pg: 40, f: antes, c: 1}, {id: "2", l: l.id, pg: 70, f: ayer, c: 2}, {id: "3", l: l.id, pg: 100, f: hoy, c: 3}); l.pg = 100;
  assert.equal(u.leidas(antes), 100); assert.equal(u.leidas(ayer), 60); assert.equal(u.leidas(hoy), 30);
  const r = u.ritmo(l); assert.equal(r.porDia, 15); assert.equal(r.fin, SB.u.sumar(hoy, Math.ceil(200 / 15)));
  const a = u.crear("Audio", "l", {f: "Audiolibro", p: 600}); u.anotar(a, 300); assert.equal(u.leidas(hoy), 30, "los minutos de un audiolibro no se suman a las páginas");
});
test("lectura: Hoy sugiere seguir con lo que estás leyendo y deja de hacerlo si ya anotaste hoy; la captura entiende «Título - Autor»", () => {
  const {SB} = abrir(), u = L(SB), l = u.crear("Dune", "l", {p: 500}); u.crear("Pendiente", "q");
  const h = SB.mods.lectura.hoy(); assert.equal(h.length, 1); assert.match(h[0].t, /Dune/); assert.equal(h[0].ir, "#/lectura/" + l.id);
  u.anotar(l, 50); assert.equal(SB.mods.lectura.hoy().length, 0);
  SB.mods.lectura.captura.guardar("Fundación - Asimov"); const f = D(SB).l[0]; assert.equal(f.t, "Fundación"); assert.equal(f.a, "Asimov"); assert.equal(f.st, "q");
});
test("lectura: búsqueda, resumen semanal y pantallas con datos", () => {
  const {SB} = abrir(), u = L(SB), l = u.crear("El Aleph", "l", {a: "Borges", g: "Cuentos", p: 200, n: 5}); u.anotar(l, 20);
  assert.equal(SB.mods.lectura.buscar("borges")[0].t, "El Aleph"); assert.match(SB.mods.lectura.semana()[0], /Leíste 20 páginas/);
  assert.match(vista(SB), /El Aleph/); assert.match(vista(SB), /10 %|Voy por la página/); const d = vista(SB, l.id); assert.match(d, /10/); assert.match(d, /Historial de avance/);
  assert.doesNotThrow(() => vista(SB));
});
test("lectura: se sincroniza, y lo que se borra va a la Papelera con su historial", () => {
  const {SB} = abrir(); assert.deepEqual(J(SB.mods.lectura.sync.map(c => c.k)), ["l", "h"]);
  const u = L(SB), l = u.crear("Borrable", "l", {p: 100}); u.anotar(l, 10);
  SB.alArrancar[SB.alArrancar.length - 1]();
  D(SB).h = D(SB).h.filter(h => h.l !== l.id); D(SB).l = D(SB).l.filter(x => x.id !== l.id); SB.guardar("lectura");
  const x = J(SB.datos("papelera").x); assert.equal(x.length, 2); assert.equal(new Set(x.map(e => e.g)).size, 1);
});

/* ---- archivos PDF / EPUB de cada libro ---- */
const conArchivos = () => { const idb = helpers.fakeIDB(), r = helpers.abrir({extra: {indexedDB: idb.indexedDB, Blob}}); r.avisos = []; r.SB.aviso = m => r.avisos.push(m); r.idb = idb; return r; };
const archivo = (name, size, type = "") => ({name, size, type});
test("lectura: se pueden subir PDF y EPUB a un libro; el archivo va a su propia base y el libro solo guarda el nombre", async () => {
  const {SB, idb, avisos} = conArchivos(), u = L(SB), l = u.crear("Con archivos", "q");
  const el = {querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; SB.mods.lectura.pantalla(el, l.id);
  const input = {files: [archivo("libro.pdf", 2e6, "application/pdf"), archivo("libro.epub", 5e5), archivo("notas.docx", 100), archivo("enorme.pdf", 400 * 1048576)], value: "x", dataset: {c: "subir"}};
  await el.onchange({target: {closest: () => input}}); await helpers.dormir(20);
  assert.deepEqual(J(l.ar.map(a => [a.n, a.t])), [["libro.pdf", "application/pdf"], ["libro.epub", "application/epub+zip"]]);
  const mias = () => [...idb.datos.keys()].filter(k => k.includes("|"));   // el IndexedDB de prueba es uno solo; en el navegador son bases separadas
  assert.equal(mias().length, 2); assert.ok(mias().every(k => k.startsWith(l.id + "|")));
  assert.ok(avisos.some(m => /notas\.docx/.test(m)) && avisos.some(m => /enorme\.pdf/.test(m)), "rechaza lo que no es PDF/EPUB y lo demasiado pesado");
  assert.ok(!JSON.stringify(SB.datos("lectura")).includes("blob"), "el archivo no queda en los datos que se sincronizan");
  SB.mods.lectura.pantalla(el, l.id); assert.match(el._h, /libro\.pdf/); assert.match(el._h, /Descargar/);
});
test("lectura: quitar un archivo lo borra de la base; al arrancar se limpian los de libros que ya no existen (pero no los de la Papelera)", async () => {
  const {SB, idb} = conArchivos(), u = L(SB), l = u.crear("A", "q"), v = u.crear("Viva", "q"), borrado = {id: "borrado1"};
  idb.datos.set(l.id + "|a1", 1); idb.datos.set(v.id + "|a2", 2); idb.datos.set("huerfano|a3", 3); idb.datos.set("enpapelera|a4", 4);
  SB.datos("papelera").x.push({id: "x", g: "g", m: "lectura", k: "l", i: {id: "enpapelera"}, f: Date.now(), l: "t"});
  const arr = SB.alArrancar; arr[arr.length - 2](); await helpers.dormir(30);
  assert.deepEqual([...idb.datos.keys()].filter(k => k.includes("|")).sort(), [l.id + "|a1", v.id + "|a2", "enpapelera|a4"].sort());
});
test("lectura: sin IndexedDB las pantallas no fallan y avisan que no se pudo guardar", async () => {
  const {SB, avisos} = (() => { const r = helpers.abrir(); r.avisos = []; r.SB.aviso = m => r.avisos.push(m); return r; })(), u = L(SB), l = u.crear("Sin idb", "q");
  l.ar = [{id: "z", n: "viejo.pdf", s: 10, t: "application/pdf"}];
  const el = {querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; assert.doesNotThrow(() => SB.mods.lectura.pantalla(el, l.id)); assert.match(el._h, /viejo\.pdf/);
  el.onchange({target: {closest: () => ({files: [archivo("a.pdf", 10)], value: "", dataset: {c: "subir"}})}}); await helpers.dormir(30);
  assert.equal(l.ar.length, 1, "no suma nada si no hay dónde guardar"); assert.ok(avisos.some(m => /No se pudo guardar/.test(m)));
});

/* ---- importar la biblioteca ---- */
test("importar: una lista simple «Título - Autor», una por línea, con duplicados y líneas vacías", () => {
  const {SB} = abrir(), u = L(SB), r = u.importar("Rayuela - Julio Cortázar\n\nEl Aleph - Jorge Luis Borges\nrayuela - julio cortázar\n");
  assert.deepEqual(J(r), {n: 2, rep: 1, total: 3}); assert.deepEqual(J(D(SB).l.map(l => [l.t, l.a, l.st]).sort()), [["El Aleph", "Jorge Luis Borges", "q"], ["Rayuela", "Julio Cortázar", "q"]]);
  assert.equal(u.importar("Rayuela - Julio Cortázar").n, 0, "volver a importar lo mismo no duplica");
});
test("importar: una tabla con encabezados en español (con comillas, comas dentro del título, estado, formato, calificación y fechas)", () => {
  const {SB} = abrir(), u = L(SB);
  const csv = 'Título;Autor;Páginas;Formato;Género;Estado;Calificación;Inicio;Fin\n"Cien años, de soledad";García Márquez;471;Papel;Novela;Leído;5;01/02/2025;20/02/2025\nDune;Frank Herbert;"1.000";Ebook;Ciencia ficción;Leyendo;;2026-03-01;\nSapiens;Harari;;Audiolibro;;Por leer;;;';
  assert.equal(u.importar(csv).n, 3);
  const por = t => D(SB).l.find(l => l.t === t);
  const c = por("Cien años, de soledad"); assert.equal(c.st, "t"); assert.equal(c.p, 471); assert.equal(c.pg, 471); assert.equal(c.n, 5); assert.equal(c.i, "2025-02-01"); assert.equal(c.e, "2025-02-20"); assert.equal(c.g, "Novela");
  const d = por("Dune"); assert.equal(d.st, "l"); assert.equal(d.f, "Ebook"); assert.equal(d.i, "2026-03-01"); assert.equal(d.e, "");
  assert.equal(por("Sapiens").f, "Audiolibro"); assert.equal(por("Sapiens").st, "q");
});
test("importar: entiende el CSV de Goodreads (estantes, calificación, fecha de lectura y número de páginas)", () => {
  const {SB} = abrir(), u = L(SB);
  const csv = 'Book Id,Title,Author,My Rating,Number of Pages,Date Read,Exclusive Shelf,Binding\n1,"The Hobbit, or There and Back Again",J.R.R. Tolkien,4,310,2024/05/14,read,Paperback\n2,Neuromancer,William Gibson,0,271,,currently-reading,Kindle Edition\n3,Foundation,Isaac Asimov,0,255,,to-read,Hardcover';
  assert.equal(u.importar(csv).n, 3); const por = t => D(SB).l.find(l => l.t.startsWith(t));
  assert.equal(por("The Hobbit").st, "t"); assert.equal(por("The Hobbit").n, 4); assert.equal(por("The Hobbit").e, "2024-05-14");
  assert.equal(por("Neuromancer").st, "l"); assert.equal(por("Neuromancer").f, "Ebook"); assert.equal(por("Foundation").st, "q");
});
test("importar: lo vacío o sin libros no rompe nada", () => { const {SB} = abrir(), u = L(SB); assert.deepEqual(J(u.importar("")), {n: 0, rep: 0, total: 0}); assert.deepEqual(J(u.parsear("Título;Autor\n")), []); });

/* ---- metas y racha ---- */
test("metas: la racha cuenta días seguidos que llegaste a la meta de páginas (o a 1 página si no hay meta), y hoy todavía no la corta", () => {
  const {SB} = abrir(), u = L(SB), hoy = SB.u.ymd(), d = n => SB.u.sumar(hoy, -n);
  const l = u.crear("Racha", "l", {p: 1000, i: d(4)}); let pg = 0;
  [[4, 30], [3, 25], [2, 10], [1, 40]].forEach(([n, x]) => { pg += x; D(SB).h.push({id: "h" + n, l: l.id, pg, f: d(n), c: n}); });
  assert.equal(u.racha(), 4, "sin meta cuenta cualquier página: 4, 3, 2, 1 días atrás; hoy todavía no leíste y no corta");
  u.meta().pags = 20; assert.equal(u.racha(), 1, "con meta de 20 se corta en el día de 10 páginas (hace 2 días)");
  u.anotar(l, pg + 20); assert.equal(u.racha(), 2, "hoy llegó a 20: hoy y ayer");
});
test("metas: la meta anual compara lo que llevás con lo que deberías llevar; Hoy recuerda la meta diaria y la semana la resume", () => {
  const {SB} = abrir(), u = L(SB), anio = SB.u.ymd().slice(0, 4);
  assert.equal(u.ritmoAnual(), null); u.meta().libros = 12;
  assert.equal(u.ritmoAnual().hechos, 0);
  for (let i = 0; i < 12; i++) u.crear("L" + i, "t", {e: anio + "-01-02"});
  assert.equal(u.ritmoAnual().estado, "listo"); assert.match(SB.mods.lectura.semana().join(" "), /cumpliste tu meta/);
  u.meta().pags = 15; const h = SB.mods.lectura.hoy(); assert.match(h[0].t, /Leer 15 páginas hoy/); assert.equal(h[0].ir, "#/lectura");
  const l = u.crear("Hoy", "l", {p: 300}); u.anotar(l, 20); assert.ok(!SB.mods.lectura.hoy().some(x => /Leer 15/.test(x.t)), "con la meta cumplida ya no la pide");
});
test("metas: la pantalla se dibuja con metas, racha e importación sin errores", () => {
  const {SB} = abrir(), u = L(SB); u.meta().libros = 5; u.meta().pags = 10; const l = u.crear("Pantalla", "l", {p: 100}); u.anotar(l, 30);
  const h = vista(SB); assert.match(h, /Tu lectura/); assert.match(h, /Mis metas/); assert.match(h, /Importar mi biblioteca/); assert.match(h, /Hoy: <b>30<\/b> de 10 páginas/); assert.match(h, /Racha/);
});
