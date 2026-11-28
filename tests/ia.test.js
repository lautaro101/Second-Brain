const test = require("node:test"), assert = require("node:assert/strict"), http = require("http");
const {abrir, J, leer} = require("./helpers");
const sa = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const EXTRA = {setInterval, clearInterval, Blob, Response, DecompressionStream, TextDecoder, fetch, AbortController, URL};

/* Un Ollama de mentira: guarda cada pedido y contesta según `modo`. */
function ollama() {
  const srv = {llamadas: [], modo: "tarjetas", contenido: null, retraso: 0, modelos: [{name: "qwen2.5:7b", size: 4.7e9}, {name: "llama3.2:3b", size: 2e9}]};
  srv.s = http.createServer((q, r) => { let b = ""; q.on("data", d => { b += d; }); q.on("end", () => {
    const fin = (st, o) => setTimeout(() => { r.writeHead(st, {"Content-Type": "application/json"}); r.end(typeof o === "string" ? o : JSON.stringify(o)); }, srv.retraso);
    if (q.method === "GET" && q.url === "/api/tags") return fin(200, {models: srv.modelos});
    if (q.method === "POST" && q.url === "/api/chat") {
      const cuerpo = JSON.parse(b); srv.llamadas.push(cuerpo); const u = cuerpo.messages[cuerpo.messages.length - 1].content, m = typeof srv.modo === "function" ? srv.modo(cuerpo, u) : srv.modo;
      if (m === "404") return fin(404, {error: "model 'qwen2.5:7b' not found"}); if (m === "500") return fin(500, "boom");
      const txt = srv.contenido !== null ? srv.contenido : m === "tarjetas" ? JSON.stringify({tarjetas: [{frente: "¿Qué produce la mitocondria?", dorso: "Produce energía en forma de ATP."}, {frente: "¿Qué sintetiza el ribosoma?", dorso: "Sintetiza proteínas."}]})
        : m === "invento" ? JSON.stringify({tarjetas: [{frente: "¿Qué produce la mitocondria?", dorso: "Produce energía en forma de ATP."}, {frente: "¿Dónde ocurre la fotosíntesis marciana?", dorso: "Ocurre en los glaciares gaseosos de Júpiter."}]})
        : m === "fences" ? "Acá van:\n```json\n" + JSON.stringify([{pregunta: "¿Capital de Francia?", respuesta: "París"}]) + "\n```" : m === "lineas" ? "¿Capital de Italia? ;; Roma\n¿Capital de España? ;; Madrid" : m === "basura" ? "no sé qué decirte" : m === "corregir" ? JSON.stringify({correcto: sa(u.split("Respuesta del estudiante:")[1] || "").includes(sa((/Respuesta esperada: (.*)/.exec(u) || [])[1] || "\u0000")), explicacion: "Evaluado por el modelo."}) : m === "explicar" ? "  La capital de Francia es París porque así lo fija su historia.  " : m === "vacio" ? "" : "";
      return fin(200, {message: {role: "assistant", content: txt}});
    }
    fin(404, {error: "no existe"});
  }); });
  return new Promise(ok => srv.s.listen(0, "127.0.0.1", () => { srv.port = srv.s.address().port; srv.url = "http://127.0.0.1:" + srv.port; srv.cerrar = () => { srv.s.closeAllConnections && srv.s.closeAllConnections(); return new Promise(f => srv.s.close(f)); }; ok(srv); }));
}
const conIA = async (fn, cfg = {}) => { const srv = await ollama(); try { const p = abrir({extra: EXTRA}); p.SB.aviso = () => {}; p.pintadas = 0; p.SB.pintar = () => { p.pintadas++; }; p.SB.ia.guardar(Object.assign({on: true, url: srv.url, modelo: "qwen2.5:7b", espera: 5}, cfg)); await fn(p, srv); } finally { await srv.cerrar(); } };

test("ia: direcciones: se completan, se limpian y se clasifican (esta PC, tu red, internet)", () => {
  const {limpiarUrl, espacio} = abrir({extra: EXTRA}).SB.ia;
  assert.equal(limpiarUrl("localhost:11434"), "http://localhost:11434"); assert.equal(limpiarUrl("  http://192.168.1.20:11434/api/tags/ "), "http://192.168.1.20:11434"); assert.equal(limpiarUrl("https://pc.mi-red.ts.net"), "https://pc.mi-red.ts.net");
  ["", "   ", "ftp://x", "javascript:alert(1)", "http://", "!!!", "http://a b", "http://ex<ample>.com"].forEach(x => assert.equal(limpiarUrl(x), "", x));
  ["http://localhost:1", "http://127.0.0.1:1", "http://[::1]:1", "http://app.localhost"].forEach(x => assert.equal(espacio(x), "loopback", x));
  ["http://192.168.0.5", "http://10.0.0.2", "http://172.16.3.4", "http://172.31.255.1", "http://mipc.local:11434", "http://169.254.1.1"].forEach(x => assert.equal(espacio(x), "local", x));
  ["http://172.32.0.1", "https://ejemplo.com", "http://8.8.8.8", "http://100.64.1.1"].forEach(x => assert.equal(espacio(x), "", x));
});
test("ia: apagada por defecto; disponible solo con «usar», modelo y dirección válida; la configuración es de este dispositivo", () => {
  const p = abrir({extra: EXTRA}), I = p.SB.ia; assert.equal(I.config().on, false); assert.equal(I.disponible(), false); assert.equal(I.config().url, "http://localhost:11434");
  I.guardar({on: true}); assert.equal(I.disponible(), false, "sin modelo"); I.guardar({modelo: "m"}); assert.equal(I.disponible(), true); I.guardar({url: "basura://"}); assert.equal(I.disponible(), false);
  assert.ok(p.ls._d.sb_ia, "se guarda en este dispositivo"); assert.ok(!JSON.stringify(Object.keys(p.SB.almacen.usuario())).includes("sb_ia"), "no se sincroniza ni se exporta");
});
test("ia: lista los modelos de Ollama ordenados y avisa si el elegido no está", async () => conIA(async (p, srv) => {
  const ms = await p.SB.ia.listar(); assert.deepEqual(J(ms.map(m => m.n)), ["llama3.2:3b", "qwen2.5:7b"]); assert.equal(ms[1].mb, 4700);
  assert.deepEqual(J((await p.SB.ia.probar()).esta), true); p.SB.ia.guardar({modelo: "otro:1b"}); assert.equal((await p.SB.ia.probar()).esta, false);
}));
test("ia: el pedido a /api/chat va sin streaming, con el modelo, la temperatura baja y el formato pedido", async () => conIA(async (p, srv) => {
  srv.contenido = "hola"; const esq = {type: "object"}; const r = await p.SB.ia.chat([{role: "user", content: "¿qué tal?"}], {formato: esq});
  assert.equal(r, "hola"); const b = srv.llamadas[0]; assert.equal(b.model, "qwen2.5:7b"); assert.equal(b.stream, false); assert.equal(b.options.temperature, 0.2); assert.deepEqual(b.format, esq); assert.equal(b.messages[0].content, "¿qué tal?");
  await p.SB.ia.chat([{role: "user", content: "x"}], {temperatura: 0.7}); assert.equal(srv.llamadas[1].options.temperature, 0.7); assert.equal(srv.llamadas[1].format, undefined);
}));
test("ia: cada falla dice qué revisar (sin conexión, modelo que falta, error del servidor, tiempo, cancelado, respuesta vacía)", async () => {
  await conIA(async (p, srv) => {
    srv.modo = "404"; await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}]), e => e.tipo === "modelo" && /ollama pull qwen2\.5:7b/.test(e.message));
    srv.modo = "500"; await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}]), /error 500/); srv.modo = "vacio"; await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}]), /no devolvió nada/);
    srv.modo = "tarjetas"; srv.retraso = 400; p.SB.ia.guardar({espera: 0.1}); await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}]), e => e.tipo === "tiempo" && /tardó más de/.test(e.message));
    p.SB.ia.guardar({espera: 5}); const c = new AbortController(); setTimeout(() => c.abort(), 50); await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}], {signal: c.signal}), e => e.tipo === "cancelado");
    const ya = new AbortController(); ya.abort(); await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}], {signal: ya.signal}), e => e.tipo === "cancelado");
  });
  const p = abrir({extra: EXTRA}); p.SB.ia.guardar({on: true, url: "http://127.0.0.1:1", modelo: "m", espera: 3}); p.ctx.location = {protocol: "https:", origin: "https://yo.github.io", hash: ""};
  await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}]), e => e.tipo === "conexion" && /OLLAMA_ORIGINS incluya https:\/\/yo\.github\.io/.test(e.message) && /red local/.test(e.message));
  p.SB.ia.guardar({modelo: ""}); await assert.rejects(p.SB.ia.chat([{role: "user", content: "x"}]), /Elegí un modelo/);
});
test("ia: desde una página https no se intenta un http de internet (el navegador lo bloquearía) y se explica por qué; localhost y la red de casa sí", async () => {
  const p = abrir({extra: EXTRA}); p.ctx.location = {protocol: "https:", origin: "https://yo.github.io", hash: ""}; p.SB.ia.guardar({on: true, modelo: "m", espera: 2});
  p.SB.ia.guardar({url: "http://ejemplo.com:11434"}); await assert.rejects(p.SB.ia.listar(), /no deja que una página https le hable a «http:\/\/ejemplo\.com:11434» por http/);
  let pedido; p.ctx.fetch = async (u, o) => { pedido = {u, o}; return {ok: true, json: async () => ({models: []})}; };
  p.SB.ia.guardar({url: "http://localhost:11434"}); await p.SB.ia.listar(); assert.equal(pedido.o.targetAddressSpace, "loopback"); p.SB.ia.guardar({url: "http://192.168.1.20:11434"}); await p.SB.ia.listar(); assert.equal(pedido.o.targetAddressSpace, "local");
  p.SB.ia.guardar({url: "https://pc.ts.net"}); await p.SB.ia.listar(); assert.equal(pedido.o.targetAddressSpace, undefined, "una dirección https de internet no lleva el permiso de red local");
});

/* ---------- pantalla de Ajustes ---------- */
const montar = p => { const cont = {isConnected: true, _url: "", querySelector: () => ({elements: {url: {value: cont._url}}}), set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; p.SB.ia.seccion(cont); return cont; };
const enviar = (el, nombre, campos) => { const elements = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === "boolean" ? {checked: v} : {value: v}])); el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: nombre}, elements})}}); };
test("ia: Ajustes muestra el origen exacto para copiar, guarda con validaciones y advierte de la red local", async () => {
  const p = abrir({extra: EXTRA}); p.ctx.location = {protocol: "https:", origin: "https://yo.github.io", hash: ""}; const el = montar(p);
  assert.match(el.innerHTML, /setx OLLAMA_ORIGINS "https:\/\/yo\.github\.io"/); assert.match(el.innerHTML, /launchctl setenv OLLAMA_ORIGINS "https:\/\/yo\.github\.io"/); assert.match(el.innerHTML, /Environment="OLLAMA_ORIGINS=https:\/\/yo\.github\.io"/); assert.ok(!/activa<\/h3>/.test(el.innerHTML));
  enviar(el, "ia-guardar", {on: true, url: "!!!", modelo: ""}); assert.match(el.innerHTML, /La dirección no es válida/); assert.equal(p.SB.ia.config().on, false);
  enviar(el, "ia-guardar", {on: true, url: "localhost:11434", modelo: ""}); assert.match(el.innerHTML, /Antes de activarla/); assert.equal(p.SB.ia.config().on, false);
  enviar(el, "ia-guardar", {on: true, url: "192.168.1.20:11434", modelo: "qwen2.5:7b"}); assert.equal(p.SB.ia.config().on, true); assert.equal(p.SB.ia.config().url, "http://192.168.1.20:11434"); assert.match(el.innerHTML, /activa/); assert.match(el.innerHTML, /OLLAMA_HOST=0\.0\.0\.0/);
  enviar(el, "ia-guardar", {on: false, url: "localhost:11434", modelo: "qwen2.5:7b"}); assert.equal(p.SB.ia.disponible(), false); assert.match(el.innerHTML, /apagada/); assert.ok(!/OLLAMA_HOST=0/.test(el.innerHTML));
});
test("ia: «Probar y buscar modelos» llena la lista, elige uno si el guardado no existe y explica los fallos", async () => conIA(async (p, srv) => {
  const el = montar(p); el._url = srv.url; p.SB.ia.guardar({modelo: "no-existe"}); const clic = a => el.onclick({target: {closest: () => ({dataset: {a}})}});
  clic("ia-probar"); await new Promise(r => setTimeout(r, 200)); assert.match(el.innerHTML, /2 modelos disponibles/); assert.match(el.innerHTML, /qwen2\.5:7b \(4\.7 GB\)/); assert.equal(p.SB.ia.config().modelo, "llama3.2:3b", "tomó el primero porque el guardado no estaba");
  srv.modelos = []; clic("ia-probar"); await new Promise(r => setTimeout(r, 200)); assert.match(el.innerHTML, /no tiene modelos instalados/);
  el._url = "http://127.0.0.1:1"; clic("ia-probar"); await new Promise(r => setTimeout(r, 300)); assert.match(el.innerHTML, /No pude conectar con Ollama/); el._url = "???"; clic("ia-probar"); assert.match(el.innerHTML, /La dirección no es válida/);
}));
test("ia: el texto de Ajustes escapa lo que escribe el usuario", () => {
  const p = abrir({extra: EXTRA}); p.SB.ia.guardar({url: '"><img src=x onerror=alert(1)>', modelo: "<b>x</b>"}); const el = montar(p); assert.ok(!el.innerHTML.includes("<img src=x"), "url sin escapar"); assert.ok(!el.innerHTML.includes("<b>x</b>"), "modelo sin escapar");
});
test("ia: sin Ollama la app no hace ni un pedido de red (todo sigue funcionando offline)", async () => {
  let pedidos = 0; const p = abrir({extra: Object.assign({}, EXTRA, {fetch: async () => { pedidos++; throw new Error("no"); }})}); p.SB.aviso = () => {}; p.SB.mods.tarjetas.hoy(); p.SB.mods.tarjetas.semana(); p.SB.mods.tarjetas.pantalla({set innerHTML(v) {}, querySelectorAll: () => [], querySelector: () => null}); assert.equal(pedidos, 0);
});

/* ---------- Tarjetas con IA ---------- */
const T = p => p.SB.mods.tarjetas, U = p => T(p).util, D = p => p.SB.datos("tarjetas");
const pantalla = p => { const el = {querySelectorAll: () => [], querySelector: () => null, set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }}; T(p).pantalla(el); return el; };
const clic = (el, dataset) => el.onclick({target: {closest: () => ({dataset})}});
const esperar = async (cond, ms = 4000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("se acabó la espera"); await new Promise(r => setTimeout(r, 10)); } };
const MAT = "La mitocondria produce energía en forma de ATP para toda la célula. El ribosoma sintetiza proteínas a partir de aminoácidos en el citoplasma.";
test("tarjetas+ia: trozos corta largo en pedazos, une los cortos y no se rompe con vacío", () => {
  const u = U(abrir({extra: EXTRA})).trozos ? U(abrir({extra: EXTRA})) : null, tz = U(abrir({extra: EXTRA})).trozos;
  const parrafo = n => ("palabra ".repeat(n)).trim(); const r = tz([parrafo(300), parrafo(300), parrafo(300)].join("\n"), 1000); assert.ok(r.length >= 2 && r.every(c => c.length <= 1000)); assert.equal(r.join(" ").split(/\s+/).length, 900, "no se pierde nada");
  assert.equal(tz(parrafo(100) + "\nfin corto", 1000).length, 1, "el trozo corto se une"); assert.equal(tz("x".repeat(2500), 1000).length, 3, "una línea sin espacios también se corta"); assert.deepEqual(J(tz("")), []); assert.deepEqual(J(tz(null)), []);
});
test("tarjetas+ia: se entiende JSON del esquema, listas, otras claves, bloques ```json y hasta líneas «frente ;; dorso»", () => {
  const f = U(abrir({extra: EXTRA})).tarjetasDeRespuesta;
  assert.deepEqual(J(f(JSON.stringify({tarjetas: [{frente: "a", dorso: "b"}]}))), [{t: "a", a: "b"}]); assert.deepEqual(J(f(JSON.stringify([{pregunta: "c", respuesta: "d"}, {front: "e", back: "f"}, {q: "g", a: "h"}]))).length, 4 - 1 + 0);
  assert.deepEqual(J(f("Claro:\n```json\n{\"tarjetas\":[{\"frente\":\"x\",\"dorso\":\"y\"},{\"frente\":\"\",\"dorso\":\"z\"}]}\n```\nListo")), [{t: "x", a: "y"}]);
  assert.deepEqual(J(f("¿A? ;; B\n¿C? ;; D")), [{t: "¿A?", a: "B"}, {t: "¿C?", a: "D"}]); [null, "", "no sé", "{roto", "[1,2]", '{"tarjetas":"no"}'].forEach(x => assert.deepEqual(J(f(x)), [], String(x)));
});
test("tarjetas+ia: control contra inventos: lo que no está en el texto se marca", () => {
  const f = U(abrir({extra: EXTRA})).fundada;
  assert.equal(f("Produce energía en forma de ATP.", MAT), true); assert.equal(f("Sintetiza las proteínas", MAT), true, "con plural y sin acentos"); assert.equal(f("Ocurre en los glaciares gaseosos de Júpiter.", MAT), false);
  assert.equal(f("ATP", MAT), true); assert.equal(f("1839", MAT), false); assert.equal(f("1839", MAT + " En 1839 se formuló."), true); assert.equal(f("", MAT), true, "vacío no es un invento");
});
test("tarjetas+ia: genera por partes, avisa el avance, marca lo inventado, no repite y respeta el máximo de partes", async () => conIA(async (p, srv) => {
  const u = U(p), parrafo = n => MAT + " " + ("relleno ").repeat(n), largo = [parrafo(200), parrafo(200), parrafo(200), parrafo(200)].join("\n"), prog = [];
  srv.modo = "invento"; const r = await u.generarConIA(largo, {onProgreso: (i, n) => prog.push([i, n])});
  assert.equal(r.partes, 4 > r.total ? r.total : r.partes); assert.ok(r.total >= 2); assert.deepEqual(J(prog[0]), [1, r.partes]); assert.equal(prog.length, r.partes); assert.equal(srv.llamadas.length, r.partes);
  assert.equal(r.items.length, 2, "las repetidas entre partes no se duplican"); assert.ok(r.items.every(x => x.tp === "i")); assert.equal(r.items[0].ok, true); assert.equal(r.items[1].ok, false); assert.equal(r.items[1].rev, true);
  assert.deepEqual(J(srv.llamadas[0].format.required), ["tarjetas"]); assert.match(srv.llamadas[0].messages[1].content, /Respondé solo con JSON/); assert.match(srv.llamadas[0].messages[1].content, /mitocondria/);
  const muchas = Array.from({length: 20}, (_, i) => MAT + " parte " + i + " " + "x ".repeat(2000)).join("\n"); srv.llamadas.length = 0; const r2 = await u.generarConIA(muchas); assert.equal(r2.partes, 12); assert.ok(r2.total > 12); assert.equal(srv.llamadas.length, 12);
}));
test("tarjetas+ia: si una parte viene ilegible se cuenta y sigue; si falla la conexión a mitad se devuelve lo que había", async () => conIA(async (p, srv) => {
  const u = U(p), largo = [MAT + " a".repeat(1800), MAT + " b".repeat(1800), MAT + " c".repeat(1800)].join("\n"); let n = 0;
  srv.modo = () => { n++; return n === 2 ? "basura" : "tarjetas"; }; let r = await u.generarConIA(largo); assert.equal(r.fallidas, 1); assert.ok(r.items.length >= 2);
  n = 0; srv.modo = () => { n++; return n === 2 ? "500" : "tarjetas"; }; r = await u.generarConIA(largo); assert.ok(r.items.length >= 2); assert.match(r.error, /error 500/);
  srv.modo = "500"; await assert.rejects(u.generarConIA(largo), /error 500/);
}));
test("tarjetas+ia: cancelar corta entre partes y conserva lo ya generado", async () => conIA(async (p, srv) => {
  const u = U(p), largo = [MAT + " a".repeat(1800), MAT + " b".repeat(1800), MAT + " c".repeat(1800)].join("\n"), c = new AbortController(); srv.retraso = 40;
  const r = await u.generarConIA(largo, {signal: c.signal, onProgreso: i => { if (i === 2) c.abort(); }}); assert.ok(r.items.length >= 2); assert.ok(srv.llamadas.length <= 2, "no siguió después de cancelar");
}));
test("tarjetas+ia: sin IA activa las funciones avisan en vez de intentar", async () => {
  const p = abrir({extra: EXTRA}), u = U(p); await assert.rejects(u.generarConIA(MAT), /Ajustes → IA local/); await assert.rejects(u.corregirConIA("p", "r", "x"), /Ajustes → IA local/); await assert.rejects(u.explicarConIA("p", "r", "x"), /Ajustes → IA local/);
});
test("tarjetas+ia: corregir acepta otra redacción según el modelo, no llama si no escribiste nada y avisa si la respuesta es ilegible", async () => conIA(async (p, srv) => {
  const u = U(p); srv.modo = "corregir"; let r = await u.corregirConIA("¿Capital de Francia?", "París", "Es paris, creo"); assert.deepEqual(J(r), {ok: true, expl: "Evaluado por el modelo."});
  r = await u.corregirConIA("¿Capital de Francia?", "París", "Lyon"); assert.equal(r.ok, false); const n = srv.llamadas.length; r = await u.corregirConIA("¿Capital?", "París", "   "); assert.deepEqual(J(r), {ok: false, expl: "No escribiste nada."}); assert.equal(srv.llamadas.length, n);
  const b = srv.llamadas[0]; assert.deepEqual(J(b.format.required), ["correcto", "explicacion"]); assert.match(b.messages[1].content, /Respuesta esperada: París/); assert.match(b.messages[0].content, /sinónimos/);
  srv.contenido = "no es json"; await assert.rejects(u.corregirConIA("p", "r", "x"), /Acerté \/ Fallé/); srv.contenido = JSON.stringify({correcto: "sí"}); await assert.rejects(u.corregirConIA("p", "r", "x"), /Acerté \/ Fallé/);
}));
test("tarjetas+ia: explicar devuelve el texto limpio y acotado", async () => conIA(async (p, srv) => {
  srv.modo = "explicar"; assert.equal(await U(p).explicarConIA("¿Capital?", "París", "Lyon"), "La capital de Francia es París porque así lo fija su historia."); srv.contenido = "x".repeat(2000); assert.equal((await U(p).explicarConIA("p", "r", "x")).length, 700);
}));
const mazoCon = (p, cartas) => { const z = {id: "z1", n: "Mazo", m: "", c: 1}; D(p).z.push(z); U(p).agregarTarjetas(cartas.map(([t, a]) => ({t, a, tp: "m"})), z.id); return z; };
test("tarjetas+ia: en la pantalla de propuestas, «Generar con IA» aparece solo si la IA está activa y suma tarjetas dudosas sin tildar", async () => conIA(async (p, srv) => {
  const z = mazoCon(p, []); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p);
  const enviar = (el, nombre, campos) => el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: nombre}, elements: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, {value: v}]))})}});
  enviar(el, "texto-material", {x: MAT + " " + "relleno ".repeat(40), n: "Apunte"}); el = pantalla(p); assert.match(el.innerHTML, /Generar más con IA/); assert.match(el.innerHTML, /puede equivocarse/);
  srv.modo = "invento"; clic(el, {a: "ia-gen"}); assert.equal(U(p).estado().trab.tipo, "gen"); await esperar(() => U(p).estado().trab === null); el = pantalla(p);
  const its = U(p).estado().cand.items; assert.ok(its.some(x => x.tp === "i" && x.ok) && its.some(x => x.tp === "i" && !x.ok)); assert.match(el.innerHTML, /⚠️ revisar: la respuesta no parece estar en el texto/); assert.match(el.innerHTML, /La IA propuso 2 tarjetas nuevas \(las marcadas con ⚠️ quedaron sin tildar\)/);
  const antes = its.length; clic(el, {a: "ia-gen"}); await esperar(() => U(p).estado().trab === null); assert.equal(U(p).estado().cand.items.length, antes, "pedirlo otra vez no duplica");
  clic(pantalla(p), {a: "cand-guardar"}); const guardadas = D(p).t; assert.ok(guardadas.some(t => t.tp === "i")); assert.ok(!guardadas.some(t => /Júpiter/.test(t.a)), "la dudosa no entró porque quedó sin tildar");
  p.SB.ia.guardar({on: false}); const z2 = mazoCon(p, []); z2.id = "z2"; D(p).z.push(z2); el = pantalla(p); clic(el, {a: "abrir", z: "z2"}); el = pantalla(p); enviar(el, "texto-material", {x: MAT + " relleno".repeat(40), n: "Otro"}); assert.match(pantalla(p).innerHTML, /conectás una IA local en Ajustes/); assert.ok(!/Generar más con IA/.test(pantalla(p).innerHTML));
}));
test("tarjetas+ia: si Ollama falla durante la generación se explica en rojo y se puede cancelar", async () => conIA(async (p, srv) => {
  const z = mazoCon(p, []); let el = pantalla(p); clic(el, {a: "abrir", z: z.id}); el = pantalla(p);
  el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: "texto-material"}, elements: {x: {value: MAT + " relleno ".repeat(40)}, n: {value: "A"}}})}}); el = pantalla(p);
  srv.modo = "404"; clic(el, {a: "ia-gen"}); await esperar(() => U(p).estado().trab === null); el = pantalla(p); assert.match(el.innerHTML, /sy-err[^>]*>[^<]*no está instalado/);
  srv.modo = "tarjetas"; srv.retraso = 300; clic(el, {a: "ia-gen"}); el = pantalla(p); assert.match(el.innerHTML, /Cancelar/); clic(el, {a: "ia-cancelar"}); await esperar(() => U(p).estado().trab === null);
}));
test("tarjetas+ia: examen escrito: «Corregir con IA» corrige, muestra la explicación y deja corregir a mano; sin texto avisa", async () => conIA(async (p, srv) => {
  const z = mazoCon(p, [["¿Capital de Francia?", "París"], ["¿Capital de Italia?", "Roma"]]); let el = pantalla(p); clic(el, {a: "examen", z: z.id}); el = pantalla(p);
  el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: "exam-ir"}, elements: {z: {value: z.id}, n: {value: "5"}, tipo: {value: "es"}}})}}); el = pantalla(p); assert.match(el.innerHTML, /Corregir con IA/);
  const e0 = U(p).estado().exm, q = e0.ps[e0.i]; srv.modo = "corregir";
  clic(el, {a: "ia-corregir"}); el = pantalla(p); assert.match(el.innerHTML, /Escribí tu respuesta primero/); assert.equal(srv.llamadas.length, 0);
  el.onchange({target: {closest: () => ({dataset: {c: "escrita"}, value: q.resp === "París" ? "paris, la ciudad luz" : "roma, la eterna"})}}); clic(el, {a: "ia-corregir"}); assert.equal(U(p).estado().trab.tipo, "corr"); assert.match(pantalla(p).innerHTML, /Corrigiendo/);
  await esperar(() => U(p).estado().trab === null); el = pantalla(p); assert.match(el.innerHTML, /🤖 Evaluado por el modelo/); assert.match(el.innerHTML, /la IA puede equivocarse/); assert.equal(U(p).estado().exm.resp[U(p).estado().exm.i].ok, true);
  clic(el, {a: "falle"}); assert.equal(U(p).estado().exm.resp[U(p).estado().exm.i].ok, false, "el usuario manda sobre la IA"); clic(el, {a: "siguiente"}); assert.equal(U(p).estado().exm.i, 1);
}));
test("tarjetas+ia: en los resultados cada fallo tiene «Explicame» y la explicación queda con su advertencia", async () => conIA(async (p, srv) => {
  const z = mazoCon(p, [["¿Capital de Francia?", "París"], ["¿Capital de Italia?", "Roma"]]); let el = pantalla(p); clic(el, {a: "examen", z: z.id}); el = pantalla(p);
  el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: "exam-ir"}, elements: {z: {value: z.id}, n: {value: "5"}, tipo: {value: "es"}}})}});
  for (let i = 0; i < 2; i++) { el = pantalla(p); clic(el, {a: "revelar"}); clic(el, {a: "falle"}); clic(el, {a: "siguiente"}); } el = pantalla(p); assert.match(el.innerHTML, /Explicame/);
  srv.modo = "explicar"; clic(el, {a: "ia-expl", i: "0"}); assert.match(pantalla(p).innerHTML, /Pensando/); await esperar(() => U(p).estado().trab === null); el = pantalla(p); assert.match(el.innerHTML, /🤖 La capital de Francia es París/); assert.match(el.innerHTML, /pueden tener errores/); assert.equal((el.innerHTML.match(/Explicame/g) || []).length, 1, "solo queda el del otro fallo");
  const e = srv.llamadas[0].messages[1].content; assert.match(e, /Respuesta correcta: /); assert.match(e, /Lo que respondió el estudiante: sin responder/);
}));
test("tarjetas+ia: sin IA el examen escrito se corrige a mano como siempre (no aparece nada de IA)", () => {
  const p = abrir({extra: EXTRA}); const z = mazoCon(p, [["a", "b"], ["c", "d"]]); let el = pantalla(p); clic(el, {a: "examen", z: z.id}); el = pantalla(p);
  el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: "exam-ir"}, elements: {z: {value: z.id}, n: {value: "5"}, tipo: {value: "es"}}})}}); el = pantalla(p); assert.ok(!/IA|🤖/.test(el.innerHTML.replace(/Ajustes/g, "")) || !/Corregir con IA/.test(el.innerHTML)); assert.match(el.innerHTML, /Ver la respuesta/);
});
test("compatibilidad y aislamiento: ia.js y las funciones nuevas no usan lookbehind ni guardan nada fuera de sb_", () => {
  ["ia.js", "modulos/tarjetas.js"].forEach(f => assert.ok(!/\(\?<[=!]/.test(leer(f)), f)); assert.ok(!/fetch\(\s*["'`]http/.test(leer("ia.js")), "ninguna dirección fija: siempre la que puso el usuario");
});

/* ---------- las guías no se despegan de la app ---------- */
test("guía de la IA: trae los pasos, la tabla por memoria y los problemas, con la dirección de la app escapada", () => {
  const p = abrir({extra: EXTRA}); p.ctx.location = {protocol: "https:", origin: "https://yo.github.io", hash: ""}; const h = montar(p).innerHTML;
  assert.match(h, /📖 Guía: cómo tener IA en tu PC, paso a paso/); ["Instalá Ollama", "Elegí un modelo", "Descargalo", "Permití esta app", "Conectala acá", "Usala en Tarjetas"].forEach(x => assert.ok(h.includes(x), x));
  ["8 GB", "16 GB", "32 GB"].forEach(x => assert.ok(h.includes("<td>" + x + "</td>"), x)); assert.match(h, /setx OLLAMA_ORIGINS "https:\/\/yo\.github\.io"/); assert.match(h, /Si algo falla/); assert.match(h, /puede equivocarse/);
  const q = abrir({extra: EXTRA}); q.ctx.location = {protocol: "https:", origin: '"><img src=x onerror=alert(1)>', hash: ""}; assert.ok(!montar(q).innerHTML.includes("<img src=x"), "el origen se escapa");
});
test("guía de la IA: cada mensaje de error que nombra existe de verdad en el código, y los comandos de modelos son válidos", () => {
  const h = montar(abrir({extra: EXTRA})).innerHTML, codigo = leer("ia.js") + leer("modulos/tarjetas.js");
  ["No pude conectar con Ollama", "no está instalado en Ollama", "Ollama tardó más de", "La IA devolvió una respuesta que no pude leer"].forEach(m => { assert.ok(h.includes(m), "la guía no nombra: " + m); assert.ok(codigo.includes(m), "el código ya no dice: " + m); });
  const modelos = [...h.matchAll(/<code>([a-z0-9._-]+:[a-z0-9._-]+)<\/code>/g)].map(m => m[1]); assert.ok(modelos.length >= 4); modelos.forEach(m => assert.match(m, /^[a-z0-9._-]+:[a-z0-9._-]+$/));
  assert.ok(h.includes("<code>http://localhost:11434</code>") && abrir({extra: EXTRA}).SB.ia.config().url === "http://localhost:11434", "la dirección que dice la guía es la de por defecto");
  assert.ok(!/OLLAMA_HOST=0/.test(h), "la guía general no sugiere abrir Ollama a la red");
});
test("guía de Tarjetas: se abre desde Hoy del módulo, tiene todas las secciones y «Entendido» vuelve", async () => {
  const p = abrir({extra: EXTRA}); p.SB.pintar = () => {}; let el = pantalla(p); assert.match(el.innerHTML, /❓ Guía/); clic(el, {a: "guia"}); el = pantalla(p); const h = el.innerHTML;
  assert.match(h, /Cómo se usa Tarjetas/); ["1. Armar un mazo", "2. Cómo escribir los apuntes", "3. Repasar", "4. Exámenes", "5. IA local (opcional)", "6. Cosas para saber"].forEach(x => assert.ok(h.includes(x), x));
  clic(el, {a: "ir", v: "inicio"}); assert.ok(!/Cómo se usa Tarjetas/.test(pantalla(p).innerHTML));
});
test("guía de Tarjetas: los botones, números y límites que nombra son los de la app", async () => conIA(async (p, srv) => {
  const guia = (() => { const q = abrir({extra: EXTRA}); q.SB.pintar = () => {}; clic(pantalla(q), {a: "guia"}); return pantalla(q).innerHTML; })(), codigo = leer("modulos/tarjetas.js"), vistas = [];
  const z = mazoCon(p, [["¿Capital de Francia?", "París"], ["¿Capital de Italia?", "Roma"], ["¿Capital de España?", "Madrid"], ["¿Capital de Portugal?", "Lisboa"], ["¿Capital de Alemania?", "Berlín"]]); let el = pantalla(p); vistas.push(el.innerHTML);
  clic(el, {a: "abrir", z: z.id}); el = pantalla(p); vistas.push(el.innerHTML); const enviar = (nombre, campos) => el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: nombre}, elements: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, {value: v}]))})}});
  enviar("texto-material", {x: MAT + " " + "relleno ".repeat(40), n: "A"}); vistas.push(pantalla(p).innerHTML);
  clic(pantalla(p), {a: "ir", v: "mazo"}); clic(pantalla(p), {a: "repasar", z: z.id}); vistas.push(pantalla(p).innerHTML); el = pantalla(p); clic(el, {a: "mostrar"}); vistas.push(pantalla(p).innerHTML); clic(pantalla(p), {a: "salir-repaso"});
  clic(pantalla(p), {a: "examen", z: z.id}); el = pantalla(p); vistas.push(el.innerHTML); el.onsubmit({preventDefault() {}, target: {closest: () => ({dataset: {f: "exam-ir"}, elements: {z: {value: z.id}, n: {value: "5"}, tipo: {value: "es"}}})}}); el = pantalla(p); vistas.push(el.innerHTML);
  clic(el, {a: "revelar"}); clic(el, {a: "falle"}); vistas.push(pantalla(p).innerHTML); for (let i = 0; i < 5; i++) { clic(pantalla(p), {a: "revelar"}); clic(pantalla(p), {a: "falle"}); clic(pantalla(p), {a: "siguiente"}); } vistas.push(pantalla(p).innerHTML);
  const todo = vistas.join("\n"); ["Mostrar respuesta", "Otra vez", "Difícil", "Bien", "Fácil", "Acerté", "Fallé", "Generar más con IA", "Corregir con IA", "Explicame", "Copiar el pedido para Claude", "Pegar tarjetas ya hechas", "＋ Mazo", "Repasar", "📝 Examen", "Elegir archivo"].forEach(b => { assert.ok(guia.includes(b) || b === "Elegir archivo", "la guía no nombra: " + b); assert.ok(todo.includes(b), "la app ya no tiene el botón que nombra la guía: " + b); });
  assert.equal(abrir({extra: EXTRA}).SB.mods.tarjetas.inicial().np, 15); assert.match(guia, /hasta 15 tarjetas nuevas/); assert.match(guia, /más de 150 tarjetas/); assert.match(codigo, /grande = ts\.length > 150/); assert.match(guia, /100 mil caracteres/); assert.match(codigo, /MAXTX = 100000/);
  const c = U(p).calificar, t = {}; c(t, 2, "2026-11-01"); assert.equal(t.it, 1); c(t, 2, "2026-11-01"); assert.equal(t.it, 3); assert.match(guia, /1 día, después en 3/); assert.match(guia, /hasta 3 veces/);
  [".txt", ".md", ".docx", ".pdf"].forEach(x => assert.ok(guia.includes(x), x)); assert.match(guia, /Anki/);
}));
