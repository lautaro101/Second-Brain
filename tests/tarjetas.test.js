const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), path = require("path");
const {abrir, J, leer, RAIZ} = require("./helpers");
const FIX = f => fs.readFileSync(path.join(RAIZ, "tests", "fixtures", f));
const EXTRA = {setInterval, clearInterval, Blob, Response, DecompressionStream, TextDecoder};
const nuevo = () => { const p = abrir({extra: EXTRA}); p.SB.aviso = () => {}; p.pintadas = 0; p.SB.pintar = () => { p.pintadas++; }; return p; };
const T = p => p.SB.mods.tarjetas, U = p => T(p).util, D = p => p.SB.datos("tarjetas");
const lcg = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const mazoCon = (p, cartas, nombre = "Mazo") => { const z = {id: "z" + Math.random().toString(36).slice(2, 6), n: nombre, m: "", c: 1}; D(p).z.push(z); U(p).agregarTarjetas(cartas.map(([t, a]) => ({t, a, tp: "m"})), z.id); return z; };
const CARTAS = [["Capital de Francia", "París"], ["Capital de Italia", "Roma"], ["Capital de España", "Madrid"], ["Capital de Portugal", "Lisboa"], ["Capital de Alemania", "Berlín"], ["Capital de Grecia", "Atenas"]];
const pantalla = (p, sub) => { const el = {querySelectorAll: () => [], querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; T(p).pantalla(el, sub); return el; };
const clic = (el, dataset) => el.onclick({target: {closest: () => ({dataset})}});
const enviar = (el, nombre, campos, dataset = {}) => { const elements = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === "boolean" ? {checked: v} : {value: v}])); el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: nombre, ...dataset}, elements})}}); };
const esperar = async (cond, ms = 3000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("se acabó la espera"); await new Promise(r => setTimeout(r, 10)); } };
const archivo = (name, datos, type = "") => ({name, type, size: datos.length, text: async () => Buffer.from(datos).toString("utf8"), arrayBuffer: async () => Uint8Array.from(datos).buffer});
const cargarPdfjs = async p => { const lib = await import(path.join(RAIZ, "vendor", "pdfjs", "pdf.min.mjs")); lib.GlobalWorkerOptions.workerSrc = "file://" + path.join(RAIZ, "vendor", "pdfjs", "pdf.worker.min.mjs"); p.ctx.__pdfjs = lib; };

/* ---------- lectores ---------- */
test("tarjetas: se registra sin fallos, se sincroniza por mazos, tarjetas, materiales y exámenes y la Papelera la cubre", () => {
  const p = nuevo(); assert.deepEqual(J(p.SB.fallos), {}); assert.deepEqual(J(T(p).sync.map(x => x.k)), ["z", "t", "mt", "ex"]);
  const z = mazoCon(p, CARTAS); p.SB.alArrancar[p.SB.alArrancar.length - 1](); D(p).t.splice(0, 1); p.SB.guardar("tarjetas"); assert.equal(p.SB.datos("papelera").x.length, 1);
});
test("docx: lee títulos, negrita, tablas de 2 columnas como «término: definición», listas y preguntas", async () => {
  const t = await U(nuevo()).leerDocx(new Uint8Array(FIX("apuntes.docx")));
  assert.match(t, /^# Biología celular/); assert.match(t, /La \*\*mitocondria\*\* produce energía/); assert.match(t, /^Ribosoma: Estructura que sintetiza proteínas\.$/m); assert.match(t, /^Núcleo: Contiene el material genético/m);
  assert.match(t, /^- Cloroplasto: organela/m); assert.match(t, /^## Genética$/m); assert.match(t, /^¿Qué es el ADN\?$/m); assert.ok(!/<w:|&amp;/.test(t));
});
test("docx: un archivo que no es un zip o no trae texto da un error claro, no un cuelgue", async () => {
  const u = U(nuevo()); await assert.rejects(u.leerDocx(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])), /no es un \.docx válido/);
  await assert.rejects(u.leerDocx(new Uint8Array(FIX("apuntes.pdf"))), /no es un \.docx válido/);
});
test("docx: las entidades XML y los saltos se convierten bien", () => {
  const x = '<w:p><w:r><w:t>Tom &amp; Jerry &lt;3 &#233;</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr><w:r><w:t>Capítulo</w:t></w:r></w:p>';
  assert.equal(U(nuevo()).docxATexto(x), "Tom & Jerry <3 é\n## Capítulo");
});
test("pdf: saca el texto de un PDF real con PDF.js y avisa si es un escaneo", async () => {
  const p = nuevo(); await cargarPdfjs(p); const t = await U(p).leerPdf(new Uint8Array(FIX("apuntes.pdf")));
  assert.match(t, /Biología celular/); assert.match(t, /Ribosoma: estructura que sintetiza proteínas\./); assert.match(t, /Segunda página: la teoría celular/);
  await assert.rejects(U(p).leerPdf(new Uint8Array(FIX("vacio.pdf"))), /no tiene texto seleccionable/);
});
test("pdf: si el lector no se puede cargar (sin conexión la primera vez) el mensaje lo explica", async () => {
  const p = nuevo(); p.ctx.document = {baseURI: "file:///no-existe/"}; await assert.rejects(U(p).leerPdf(new Uint8Array(FIX("apuntes.pdf"))), /No pude cargar el lector de PDF/);
});
test("reflujo: une los renglones cortados a mitad de frase y las palabras con guion, sin tocar títulos ni definiciones", () => {
  const r = U(nuevo()).reflujo("La mitocondria produce energía\npara la célula.\nOtra frase con una pala-\nbra cortada.\n# Título\ncuerpo en minúscula\nTérmino: definición");
  assert.equal(r, "La mitocondria produce energía para la célula.\nOtra frase con una palabra cortada.\n# Título\ncuerpo en minúscula\nTérmino: definición");
});
test("leerArchivo: txt, docx, pdf; rechaza .doc, formatos raros y archivos enormes con un mensaje que dice qué hacer", async () => {
  const p = nuevo(), u = U(p); await cargarPdfjs(p);
  assert.equal((await u.leerArchivo(archivo("a.txt", Buffer.from("Hola: mundo que es grande")))).x, "Hola: mundo que es grande");
  assert.match((await u.leerArchivo(archivo("apuntes.docx", FIX("apuntes.docx")))).x, /Biología celular/);
  const pdf = await u.leerArchivo(archivo("apuntes.pdf", FIX("apuntes.pdf"))); assert.equal(pdf.pdf, true); assert.match(pdf.x, /Ribosoma/);
  await assert.rejects(u.leerArchivo(archivo("viejo.doc", Buffer.from("x"))), /guardalo como \.docx/); await assert.rejects(u.leerArchivo(archivo("foto.png", Buffer.from("x"))), /Formato no compatible/);
  await assert.rejects(u.leerArchivo({name: "enorme.txt", size: 16 * 1024 * 1024, type: "text/plain", text: async () => ""}), /más de 15 MB/);
});

/* ---------- generación de tarjetas ---------- */
test("generar: definiciones con distintos separadores, y descarta lo que no es un término", () => {
  const g = U(nuevo()).generar("Mitocondria: organela que produce energía para la célula.\nRibosoma = estructura que sintetiza proteínas\nNúcleo - contiene el material genético de la célula\nNota: ver la página tres del libro de texto\nUnidad 1: Introducción a la biología celular\nhttps://ejemplo.com: sitio de apuntes de la cátedra\nCorto: dos palabras\n- Cloroplasto: donde ocurre la fotosíntesis de las plantas", {c: false, p: false});
  assert.deepEqual(J(g.map(x => x.t)), ["Mitocondria", "Ribosoma", "Núcleo", "Cloroplasto"]); assert.equal(g[0].a, "Organela que produce energía para la célula."); assert.ok(g.every(x => x.tp === "d"));
});
test("generar: «X es …» se vuelve una pregunta, con el artículo bien puesto", () => {
  const g = U(nuevo()).generar("El ribosoma es una estructura que sintetiza proteínas en la célula.\nLas proteínas son moléculas formadas por cadenas de aminoácidos.\nLa mitosis consiste en la división del núcleo de una célula.", {c: false});
  assert.deepEqual(J(g.map(x => x.t)), ["¿Qué es el ribosoma?", "¿Qué son las proteínas?", "¿En qué consiste la mitosis?"]); assert.equal(g[0].a, "Una estructura que sintetiza proteínas en la célula.");
});
test("generar: preguntas con su respuesta (¿…? o P:/R:), sin tragarse el párrafo siguiente", () => {
  const g = U(nuevo()).generar("¿Qué es el ADN?\nEs la molécula que guarda la información genética.\nOtro párrafo que no tiene nada que ver con la respuesta anterior.\nP: ¿Dónde está el núcleo?\nR: Dentro de la célula\n¿Qué hace el ribosoma?\nSintetiza proteínas y\ncontinúa en el renglón siguiente.\n- punto uno\n- punto dos", {d: false, c: false});
  assert.equal(g.length, 3); assert.equal(g[0].a, "Es la molécula que guarda la información genética."); assert.equal(g[1].t, "¿Dónde está el núcleo?"); assert.equal(g[1].a, "Dentro de la célula");
  assert.match(g[2].a, /^Sintetiza proteínas y continúa en el renglón siguiente\./);
});
test("generar: completar elige la mejor palabra clave (negrita > sigla > año > cifra > nombre propio) y no inventa nada si no hay", () => {
  const u = U(nuevo()), c = t => u.generar(t, {d: false, p: false}).map(x => [x.t, x.a]);
  assert.deepEqual(J(c("La **mitocondria** produce energía en forma de ATP para la célula viva.")), [["Completá: La _____ produce energía en forma de ATP para la célula viva.", "mitocondria"]]);
  assert.deepEqual(J(c("La mitocondria produce energía en forma de ATP para toda la célula viva.")), [["Completá: La mitocondria produce energía en forma de _____ para toda la célula viva.", "ATP"]]);
  assert.deepEqual(J(c("La revolución de mayo ocurrió en 1810 y cambió la historia del país entero.")).map(x => x[1]), ["1810"]);
  assert.deepEqual(J(c("El agua hierve aproximadamente a 100 °C cuando la presión es la normal del lugar.")).map(x => x[1]), ["100 °C"]);
  assert.deepEqual(J(c("La capital del imperio durante varios siglos fue Constantinopla según los historiadores.")).map(x => x[1]), ["Constantinopla"]);
  assert.deepEqual(J(c("una frase común sin ninguna palabra clave que se pueda quitar de forma clara aquí")), []);
  assert.deepEqual(J(c("Fue en el siglo XIX cuando todo cambió en la ciudad de forma muy marcada y profunda.")), [], "XIX no es una sigla");
  assert.deepEqual(J(c("Corta frase 1810.")), [], "muy corta");
});
test("generar: secciones solo si se piden, sin repetidas y respetando el máximo", () => {
  const u = U(nuevo()), t = "# Genética\nLa genética estudia cómo se heredan los rasgos de una generación a la siguiente en los seres vivos.\n# Corto\nPoco.";
  assert.equal(u.generar(t).filter(x => x.tp === "s").length, 0); const s = u.generar(t, {s: true}).filter(x => x.tp === "s"); assert.equal(s.length, 1); assert.equal(s[0].t, "Explicá: Genética");
  const rep = "Ribosoma: estructura que sintetiza proteínas.\nRibosoma: estructura que sintetiza proteínas.\nRibosoma: otra cosa distinta que dice algo."; assert.equal(u.generar(rep).length, 1);
  assert.equal(u.generar(Array.from({length: 30}, (_, i) => "Término " + i + ": una explicación larga número " + i).join("\n"), {}, 10).length, 10);
});
test("generar: texto vacío o basura no rompe", () => { const u = U(nuevo()); [undefined, null, "", "   \n\n", "a", "\u0000\u0001"].forEach(t => assert.deepEqual(J(u.generar(t)), [])); });
test("importar: «frente ;; dorso», barra, tabulación de Anki (con HTML y encabezados) y líneas sueltas", () => {
  const g = U(nuevo()).parsearTarjetas("#separator:tab\n#html:true\n¿Capital de Francia? ;; París\nGato | Cat\nperro\tdog<br>(animal)\nlínea sin separador\n  ;; sin frente\nA || B");
  assert.deepEqual(J(g.map(x => [x.t, x.a])), [["¿Capital de Francia?", "París"], ["Gato", "Cat"], ["perro", "dog / (animal)"], ["A", "B"]]);
});
test("pedido para Claude: incluye el material y avisa si se cortó", () => {
  const u = U(nuevo()); assert.match(u.pedidoClaude("mi apunte"), /pregunta ;; respuesta[\s\S]*mi apunte/); const largo = u.pedidoClaude("x".repeat(20000)); assert.match(largo, /no entró/); assert.ok(largo.length < 16000);
});
test("compatibilidad: ninguna expresión con «lookbehind» (rompería toda la app en Safari anterior a 16.4)", () => assert.ok(!/\(\?<[=!]/.test(leer("modulos/tarjetas.js"))));

/* ---------- repaso espaciado ---------- */
test("repaso: los intervalos crecen con «Bien» y se reinician con «Otra vez»", () => {
  const c = U(nuevo()).calificar, t = {}, h = "2026-11-01";
  c(t, 2, h); assert.deepEqual(J([t.it, t.rp, t.v, t.ef, t.pr, t.ul]), [1, 1, "2026-11-02", 2.5, h, h]);
  c(t, 2, h); assert.equal(t.it, 3); c(t, 2, h); assert.equal(t.it, 8); c(t, 2, h); assert.equal(t.it, 20);
  c(t, 0, h); assert.deepEqual(J([t.it, t.rp, t.v, t.ef, t.ll]), [0, 0, h, 2.3, 1], "fallar la deja para hoy");
  const n = {}; c(n, 3, h); assert.deepEqual(J([n.it, n.ef, n.v]), [3, 2.65, "2026-11-04"]); const d = {}; c(d, 1, h); assert.deepEqual(J([d.it, d.ef]), [1, 2.35]);
  const g = {ef: 2.5, it: 300, rp: 5}; c(g, 3, h); assert.equal(g.it, 365, "tope de un año"); const b = {ef: 1.3, it: 5, rp: 3}; c(b, 0, h); assert.equal(b.ef, 1.3, "la facilidad no baja de 1,3");
});
test("repaso: la cola pone primero las vencidas (las más atrasadas arriba) y después las nuevas hasta el tope diario", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS), ts = D(p).t, h = "2026-11-10"; D(p).np = 3;
  ts[0].ul = "2026-11-01"; ts[0].v = "2026-11-08"; ts[1].ul = "2026-11-01"; ts[1].v = "2026-11-05"; ts[2].ul = "2026-11-09"; ts[2].v = "2026-11-12";
  assert.deepEqual(J(U(p).cola(null, h).map(t => t.t)), ["Capital de Italia", "Capital de Francia", "Capital de Portugal", "Capital de Alemania", "Capital de Grecia"], "2 vencidas + 3 nuevas (la de España no vence todavía)");
  ts[3].pr = h; assert.equal(U(p).cola(null, h).filter(t => !t.ul).length, 2, "una nueva ya vista hoy descuenta del tope");
  assert.equal(U(p).cola(["otro"], h).length, 0, "filtra por mazo");
});
test("repaso: flujo completo en pantalla, «Otra vez» vuelve (hasta 3 veces) y se cuenta lo repasado", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS.slice(0, 3)); let el = pantalla(p); assert.match(el.innerHTML, /Repasar todo \(3\)/); clic(el, {a: "repasar", z: ""}); assert.equal(U(p).estado().vista, "repaso");
  el = pantalla(p); assert.match(el.innerHTML, /1 de 3/); assert.match(el.innerHTML, /Mostrar respuesta/); clic(el, {a: "mostrar"}); el = pantalla(p); assert.match(el.innerHTML, /Otra vez/);
  for (let i = 0; i < 4; i++) { clic(el, {a: "nota", q: "0"}); el = pantalla(p); clic(el, {a: "mostrar"}); el = pantalla(p); }
  assert.equal(U(p).estado().rep.ids.length, 3 + 4, "cada fallo vuelve a la cola: A, B, C y A otra vez");
  const q = nuevo(); mazoCon(q, [["solo", "una"]]); let e2 = pantalla(q); clic(e2, {a: "repasar", z: ""}); for (let i = 0; i < 6; i++) { e2 = pantalla(q); if (U(q).estado().rep.i >= U(q).estado().rep.ids.length) break; clic(e2, {a: "mostrar"}); clic(e2, {a: "nota", q: "0"}); }
  assert.equal(U(q).estado().rep.ids.length, 1 + 3, "la misma tarjeta vuelve como mucho 3 veces por sesión");
  const hoy = p.SB.u.ymd(); while (U(p).estado().rep.i < U(p).estado().rep.ids.length) { clic(el, {a: "nota", q: "2"}); el = pantalla(p); if (U(p).estado().rep.i < U(p).estado().rep.ids.length) { clic(el, {a: "mostrar"}); el = pantalla(p); } }
  assert.match(el.innerHTML, /Repaso terminado/); assert.ok(D(p).rv[hoy][0] >= 6); assert.ok(D(p).t.every(t => t.ul === hoy && t.v > hoy || t.v === hoy));
});
test("repaso: Hoy avisa cuántas hay para repasar y se apaga cuando no queda nada; el atajo de Hoy no se reinicia solo", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS.slice(0, 2)); assert.equal(T(p).hoy()[0].s, "2 tarjetas para hoy"); assert.equal(T(p).hoy()[0].ir, "#/tarjetas/repasar");
  let el = pantalla(p, "repasar"); assert.equal(U(p).estado().vista, "repaso"); el = pantalla(p); assert.equal(U(p).estado().vista, "repaso", "volver a dibujar sin el atajo no lo reinicia");
  D(p).t.forEach(t => U(p).calificar(t, 2, p.SB.u.ymd())); assert.deepEqual(J(T(p).hoy()), []);
});
test("repaso: sin tarjetas para repasar avisa en vez de abrir una pantalla vacía", () => {
  const p = nuevo(); let el = pantalla(p); clic(el, {a: "repasar", z: ""}); el = pantalla(p); assert.match(el.innerHTML, /No hay tarjetas para repasar/); assert.notEqual(U(p).estado().vista, "repaso");
});

/* ---------- exámenes ---------- */
test("examen: opción múltiple con 4 opciones distintas, la correcta entre ellas y preguntas sin repetir", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS), ps = U(p).armarExamen(D(p).t, 5, "op", lcg());
  assert.equal(ps.length, 5); assert.equal(new Set(ps.map(x => x.c)).size, 5);
  ps.forEach(q => { assert.equal(q.ty, "op"); assert.equal(q.ops.length, 4); assert.equal(new Set(q.ops).size, 4); assert.equal(q.ops[q.ok], D(p).t.find(t => t.id === q.c).a); });
});
test("examen: con pocas tarjetas o respuestas repetidas cae a verdadero/falso o a escribir, nunca a una pregunta imposible", () => {
  const p = nuevo(), u = U(p), tres = CARTAS.slice(0, 3).map(([t, a], i) => ({id: "t" + i, t, a}));
  assert.ok(u.armarExamen(tres, 3, "op", lcg()).every(q => q.ty === "es"), "con 3 tarjetas no hay 3 distractores: escribir");
  assert.ok(u.armarExamen(tres, 3, "mixto", lcg()).every(q => q.ty !== "op"));
  const iguales = [{id: "a", t: "¿Ciudad A?", a: "París"}, {id: "b", t: "¿Ciudad B?", a: "paris"}]; assert.ok(u.armarExamen(iguales, 2, "vf", lcg()).every(q => q.ty === "es"), "respuestas iguales: no se puede armar un falso");
  assert.deepEqual(J(u.armarExamen([], 5, "op")), []); assert.equal(u.armarExamen(tres, 99, "es").length, 3);
});
test("examen: verdadero/falso muestra la respuesta correcta o la de otra tarjeta, y lo marca bien", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS), ps = U(p).armarExamen(D(p).t, 6, "vf", lcg(3));
  ps.forEach(q => { const t = D(p).t.find(x => x.id === q.c); assert.equal(q.ty, "vf"); assert.equal(q.mostrar === t.a, q.ok); });
  assert.ok(ps.some(q => q.ok) && ps.some(q => !q.ok), "salen de las dos clases");
});
test("examen: la nota, los aciertos y lo que fallaste vuelve a tocar hoy (lo nuevo no se toca); el historial queda guardado", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS.concat([["Capital de Suecia", "Estocolmo"]]), "Capitales"), hoy = p.SB.u.ymd(), ts = D(p).t, nueva = ts[6];
  ts.slice(0, 6).forEach(t => { U(p).calificar(t, 2, "2026-01-01"); t.v = "2030-01-01"; });   // 6 ya vistas, con el repaso lejos; la séptima es nueva
  let el = pantalla(p); clic(el, {a: "examen", z: z.id}); el = pantalla(p); assert.match(el.innerHTML, /Tomar un examen/); enviar(el, "exam-ir", {z: z.id, n: "10", tipo: "op"});
  assert.equal(U(p).estado().vista, "examen"); el = pantalla(p); assert.match(el.innerHTML, /Pregunta 1 de 7/); assert.ok(el.innerHTML.includes("disabled"), "no se puede avanzar sin responder");
  const falladas = new Set([nueva.id, ts[0].id, ts[1].id]);
  for (let i = 0; i < 7; i++) { const e = U(p).estado().exm, q = e.ps[e.i]; clic(el, {a: "opcion", i: String(falladas.has(q.c) ? (q.ok + 1) % 4 : q.ok)}); el = pantalla(p); clic(el, {a: "siguiente"}); el = pantalla(p); }
  assert.match(el.innerHTML, /Resultado: 5,7 sobre 10/); assert.match(el.innerHTML, /4 de 7 bien \(57 %\)/); assert.match(el.innerHTML, /Lo que fallaste/);
  const ex = D(p).ex[0]; assert.deepEqual(J([ex.p, ex.ok, ex.nota, ex.n, ex.f]), [7, 4, 5.7, "Examen · Capitales", hoy]); assert.deepEqual(J(ex.mal.slice().sort()), J([...falladas].sort()));
  [ts[0], ts[1]].forEach(t => { assert.equal(t.v, hoy, "la fallada ya vista vuelve hoy"); assert.equal(t.ll, 1); });
  ts.slice(2, 6).forEach(t => assert.equal(t.v, "2030-01-01", "lo que acertaste no se toca")); assert.equal(nueva.v, undefined, "una nueva fallada no se toca"); assert.equal(nueva.ul, undefined);
  clic(el, {a: "repasar-fallos"}); assert.equal(U(p).estado().vista, "repaso"); assert.equal(U(p).estado().rep.ids.length, 3);
});
test("examen: las opciones falsas nunca se repiten aunque otras tarjetas compartan la misma respuesta", () => {
  const u = U(nuevo()), pool = [["¿A?", "uno"], ["¿B?", "dos"], ["¿C?", "dos"], ["¿D?", "dos"], ["¿E?", "tres"], ["¿F?", "cuatro"], ["¿G?", "DOS"]].map(([t, a], i) => ({id: "t" + i, t, a}));
  for (let semilla = 1; semilla <= 30; semilla++) u.armarExamen(pool, 7, "op", lcg(semilla)).forEach(q => { assert.equal(q.ty, "op"); assert.equal(new Set(q.ops.map(x => x.toLowerCase())).size, 4, q.ops.join("|")); assert.equal(q.ops[q.ok], pool.find(t => t.id === q.c).a); });
});
test("examen: escribir la respuesta se corrige con «Acerté / Fallé» y no deja pasar sin corregir", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS.slice(0, 2)); let el = pantalla(p); clic(el, {a: "examen", z: z.id}); el = pantalla(p); enviar(el, "exam-ir", {z: z.id, n: "5", tipo: "es"}); el = pantalla(p);
  assert.match(el.innerHTML, /Escribí tu respuesta/); el.onchange({target: {closest: () => ({dataset: {c: "escrita"}, value: "mi respuesta"})}}); clic(el, {a: "siguiente"}); assert.equal(U(p).estado().exm.i, 0, "sin corregir no avanza");
  clic(el, {a: "revelar"}); el = pantalla(p); assert.match(el.innerHTML, /Tu respuesta: mi respuesta/); clic(el, {a: "siguiente"}); assert.equal(U(p).estado().exm.i, 0); clic(el, {a: "acerte"}); clic(el, {a: "siguiente"}); assert.equal(U(p).estado().exm.i, 1);
  el = pantalla(p); clic(el, {a: "revelar"}); clic(el, {a: "falle"}); clic(el, {a: "siguiente"}); el = pantalla(p); assert.match(el.innerHTML, /Resultado: 5 sobre 10/);
});
test("examen: con menos de 2 tarjetas avisa, y notaDe redondea a un decimal", () => {
  const p = nuevo(), z = mazoCon(p, [["a", "b"]]); let el = pantalla(p); clic(el, {a: "examen", z: z.id}); el = pantalla(p); enviar(el, "exam-ir", {z: z.id, n: "5", tipo: "op"}); el = pantalla(p); assert.match(el.innerHTML, /al menos 2 tarjetas/);
  assert.equal(U(p).notaDe(2, 3), 6.7); assert.equal(U(p).notaDe(0, 0), 0); assert.equal(U(p).notaDe(10, 10), 10);
});

/* ---------- pantallas ---------- */
test("mazos: crear, agregar a mano, importar, editar, borrar tarjetas y buscar", () => {
  const p = nuevo(); let el = pantalla(p); enviar(el, "mazo-nuevo", {n: "Biología", m: ""}); assert.equal(D(p).z.length, 1); const z = D(p).z[0]; el = pantalla(p); assert.match(el.innerHTML, /Biología/);
  enviar(el, "tarjeta-nueva", {t: "¿Qué es un gen?", a: "Una unidad de herencia."}, {}); enviar(el, "tarjeta-nueva", {t: "¿Qué es un gen?", a: "repetida"}); assert.equal(D(p).t.length, 1, "no duplica el mismo frente");
  enviar(el, "importar", {x: "Gato ;; Cat\nPerro ;; Dog\nlínea mala"}); assert.equal(D(p).t.length, 3); el = pantalla(p); assert.match(el.innerHTML, /2 tarjetas importadas|Importar/);
  const t = D(p).t[0]; clic(el, {a: "tj-edit", id: t.id}); el = pantalla(p); enviar(el, "tarjeta-guardar", {t: "Nuevo frente", a: "Nuevo dorso"}, {id: t.id}); assert.equal(t.t, "Nuevo frente");
  assert.equal(T(p).buscar("perro").length, 1); clic(el, {a: "tj-del", id: t.id}); assert.equal(D(p).t.length, 2);
});
test("mazos: borrar uno chico va a la Papelera con sus tarjetas; uno enorme se borra sin ensuciarla y avisa", () => {
  const p = nuevo(), chico = mazoCon(p, CARTAS, "Chico"); p.SB.alArrancar[p.SB.alArrancar.length - 1](); let el = pantalla(p); clic(el, {a: "abrir", z: chico.id}); el = pantalla(p); clic(el, {a: "mazo-del"});
  assert.equal(D(p).z.length, 0); assert.equal(p.SB.datos("papelera").x.length, 7, "el mazo y sus 6 tarjetas");
  const grande = mazoCon(p, Array.from({length: 151}, (_, i) => ["Frente " + i, "Dorso " + i]), "Grande"); p.SB.guardar("tarjetas"); const antes = p.SB.datos("papelera").x.length; let aviso = ""; p.ctx.confirm = m => { aviso = m; return true; };
  el = pantalla(p); clic(el, {a: "abrir", z: grande.id}); el = pantalla(p); clic(el, {a: "mazo-del"}); assert.match(aviso, /demasiado grande para la Papelera/); assert.equal(p.SB.datos("papelera").x.length, antes); assert.equal(D(p).t.length, 0);
});
test("material de texto: se guarda, propone tarjetas, se destildan, se agregan sin duplicar y se vuelve a proponer", () => {
  const p = nuevo(), z = mazoCon(p, []); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p); assert.match(el.innerHTML, /Elegir archivo/);
  enviar(el, "texto-material", {x: "Mitocondria: organela que produce energía.\nRibosoma: estructura que sintetiza proteínas.\n¿Qué es el ADN?\nLa molécula de la herencia.", n: "Apunte 1"}); assert.equal(U(p).estado().vista, "cand"); assert.equal(D(p).mt.length, 1);
  el = pantalla(p); assert.match(el.innerHTML, /Tarjetas propuestas/); assert.match(el.innerHTML, /Agregar 3 al mazo/); el.onchange({target: {closest: () => ({dataset: {c: "cand-sel", i: "0"}, checked: false})}}); el = pantalla(p); assert.match(el.innerHTML, /Agregar 2 al mazo/);
  clic(el, {a: "cand-guardar"}); assert.equal(D(p).t.length, 2); assert.equal(U(p).estado().vista, "mazo"); el = pantalla(p); assert.match(el.innerHTML, /2 tarjetas agregadas/);
  clic(el, {a: "mat-gen", id: D(p).mt[0].id}); el = pantalla(p); clic(el, {a: "cand-todas"}); clic(el, {a: "cand-todas"}); el = pantalla(p); clic(el, {a: "cand-guardar"}); assert.equal(D(p).t.length, 3, "solo se suma la que faltaba");
  clic(pantalla(p), {a: "mat-del", id: D(p).mt[0].id}); assert.equal(D(p).mt.length, 0);
});
test("material: un archivo .docx elegido en pantalla se lee, se guarda y propone tarjetas; un .doc da el aviso", async () => {
  const p = nuevo(), z = mazoCon(p, []); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p);
  el.onchange({target: {closest: () => ({dataset: {c: "archivo"}, files: [archivo("apuntes.docx", FIX("apuntes.docx"))]})}}); await esperar(() => U(p).estado().vista === "cand");
  assert.equal(D(p).mt[0].n, "apuntes.docx"); const its = U(p).estado().cand.items; assert.ok(its.some(x => x.t === "Ribosoma") && its.some(x => x.t === "¿Qué es el ADN?") && its.some(x => x.tp === "c"));
  clic(pantalla(p), {a: "ir", v: "mazo"}); const antes = p.pintadas; el = pantalla(p); el.onchange({target: {closest: () => ({dataset: {c: "archivo"}, files: [archivo("viejo.doc", Buffer.from("x"))]})}}); await esperar(() => p.pintadas >= antes + 2);
  el = pantalla(p); assert.match(el.innerHTML, /guardalo como \.docx/);
});
test("material: un PDF se lee con PDF.js, se reflujan los renglones y se guarda el texto ya limpio", async () => {
  const p = nuevo(), z = mazoCon(p, []); await cargarPdfjs(p); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p);
  el.onchange({target: {closest: () => ({dataset: {c: "archivo"}, files: [archivo("apuntes.pdf", FIX("apuntes.pdf"))]})}}); await esperar(() => U(p).estado().vista === "cand");
  assert.match(D(p).mt[0].x, /energía en forma de ATP para la célula, según el libro/); assert.ok(U(p).estado().cand.items.some(x => x.t === "Ribosoma")); assert.match(pantalla(p).innerHTML, /\(PDF\)/);
});
test("secciones: se activan desde «Volver a buscar» y suman las tarjetas de tipo sección", () => {
  const p = nuevo(), z = mazoCon(p, []); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p);
  enviar(el, "texto-material", {x: "# Genética\nLa genética estudia cómo se heredan los rasgos de una generación a la siguiente en los seres vivos.", n: "G"}); el = pantalla(p); assert.equal(U(p).estado().cand.items.some(x => x.tp === "s"), false);
  enviar(el, "gen-opts", {d: true, p: true, c: true, s: true}); assert.ok(U(p).estado().cand.items.some(x => x.tp === "s"));
});
test("pedido para Claude: se copia al portapapeles y avisa qué hacer con el resultado", async () => {
  const p = nuevo(), z = mazoCon(p, []); let copiado = ""; p.ctx.navigator = {clipboard: {writeText: async t => { copiado = t; }}}; let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p); const antes = p.pintadas;
  clic(el, {a: "copiar-pedido"}); await esperar(() => p.pintadas > antes); assert.match(copiado, /pregunta ;; respuesta/); assert.match(pantalla(p).innerHTML, /Pedido copiado/);
});
test("Estudio: el mazo se puede asociar a una materia, y solo se ofrece si el módulo Estudio está", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS); p.SB.datos("estudio").m.push({id: "m1", n: "Álgebra", d: []}); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p); assert.match(el.innerHTML, /Materia de Estudio/);
  el.onchange({target: {closest: () => ({dataset: {c: "materia"}, value: "m1"})}}); assert.equal(z.m, "m1"); assert.match(pantalla(p).innerHTML, /📚 Álgebra/);
});
test("ajustes: las nuevas por día se guardan con límites", () => {
  const p = nuevo(); let el = pantalla(p); enviar(el, "np", {n: "5"}); assert.equal(D(p).np, 5); enviar(el, "np", {n: "999"}); assert.equal(D(p).np, 5); enviar(el, "np", {n: "-1"}); assert.equal(D(p).np, 5); enviar(el, "np", {n: "0"}); assert.equal(D(p).np, 0);
  mazoCon(p, CARTAS); assert.deepEqual(J(T(p).hoy()), [], "con 0 nuevas por día y nada vencido no hay nada que repasar");
});
test("la revisión semanal cuenta lo repasado y los exámenes; sin nada cargado no aparece", () => {
  const p = nuevo(); assert.deepEqual(J(T(p).semana()), []); const z = mazoCon(p, CARTAS), hoy = p.SB.u.ymd(); D(p).rv[hoy] = [10, 8]; D(p).ex.push({id: "e", n: "x", f: hoy, p: 5, ok: 4, nota: 8, mal: [], c: 1});
  assert.deepEqual(J(T(p).semana()), ["Repasaste 10 tarjetas (80 % bien).", "1 examen, promedio 8 sobre 10."]);
});
test("todo lo que escribe el usuario (mazos, tarjetas, materiales) se escapa en todas las pantallas", () => {
  const p = nuevo(), X = "<img src=x onerror=alert(1)>", z = mazoCon(p, [[X, X], ["b", "c"], ["d", "e"], ["f", "g"], ["h", "i"]], X); D(p).mt.push({id: "m", z: z.id, n: X, x: "texto", c: 1});
  const rev = h => { assert.ok(!h.includes("<img"), "sin escapar"); }; let el = pantalla(p); rev(el.innerHTML); clic(el, {a: "abrir", z: z.id}); el = pantalla(p); rev(el.innerHTML);
  clic(el, {a: "examen", z: z.id}); el = pantalla(p); rev(el.innerHTML); enviar(el, "exam-ir", {z: z.id, n: "5", tipo: "mixto"}); rev(pantalla(p).innerHTML); U(p).estado().exm.ps.forEach((q, i) => { U(p).estado().exm.i = i; rev(pantalla(p).innerHTML); });
  U(p).estado().exm.i = 0; clic(pantalla(p), {a: "salir-examen"}); clic(pantalla(p), {a: "repasar", z: z.id}); rev(pantalla(p).innerHTML); clic(pantalla(p), {a: "mostrar"}); rev(pantalla(p).innerHTML);
});
test("un dato roto (tarjeta sin mazo, mazo borrado en pleno repaso, examen vacío) no rompe ninguna pantalla", () => {
  const p = nuevo(), z = mazoCon(p, CARTAS); D(p).t.push({id: "huérfana", z: "no-existe", t: "x", a: "y", c: 1}); D(p).ex.push({id: "e", n: "Examen · ?", z: "no-existe", f: "2026-11-01", p: 0, ok: 0, nota: 0, mal: [], c: 1});
  let el = pantalla(p); clic(el, {a: "repasar", z: ""}); el = pantalla(p); D(p).t.length = 0; D(p).z.length = 0; el = pantalla(p); T(p).hoy(); T(p).semana(); T(p).buscar("x"); assert.deepEqual(J(p.SB.fallos), {});
});
test("PDF.js queda en vendor/ con su licencia, y no se precarga: el service worker no lo lista (se guarda al usarlo)", () => {
  ["pdf.min.mjs", "pdf.worker.min.mjs", "LICENSE"].forEach(f => assert.ok(fs.existsSync(path.join(RAIZ, "vendor", "pdfjs", f)), f)); assert.ok(!/vendor/.test(leer("sw.js")));
});
