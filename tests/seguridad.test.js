const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const DIA = 864e5;

test("cifrar y descifrar: vuelve el mismo texto y el sobre no deja ver nada del contenido", async () => {
  const {SB} = abrir(), t = "Nota secreta: mi diario 🔒";
  const o = await SB.seg.cifrar(t, "una clave larga"); assert.equal(o.cifrado, 1); assert.equal(o.kdf, "PBKDF2-SHA256");
  assert.ok(!JSON.stringify(o).includes("secreta")); assert.equal(await SB.seg.descifrar(o, "una clave larga"), t);
});
test("clave incorrecta o archivo alterado: falla, no devuelve basura", async () => {
  const {SB} = abrir(), o = await SB.seg.cifrar("hola", "clave correcta");
  await assert.rejects(SB.seg.descifrar(o, "clave equivocada"), e => e.clave === true);
  const u = Buffer.from(o.datos, "base64"); u[0] ^= 1; await assert.rejects(SB.seg.descifrar({...o, datos: u.toString("base64")}, "clave correcta"), e => e.clave === true);
  await assert.rejects(SB.seg.descifrar({...o, it: 5e9}, "clave correcta"), /no se reconoce/);
});
test("el mismo texto cifrado dos veces da resultados distintos (iv nuevo cada vez)", async () => {
  const {SB} = abrir(), a = await SB.seg.cifrar("x", "clave larga 1"), b = await SB.seg.cifrar("x", "clave larga 1");
  assert.notEqual(a.iv, b.iv); assert.notEqual(a.datos, b.datos);
});
test("sin clave: sellar deja el texto igual; abrir un texto plano o que no es JSON lo devuelve igual", async () => {
  const {SB} = abrir(); assert.equal(await SB.sellar('{"a":1}'), '{"a":1}'); assert.equal(await SB.abrirTexto('{"a":1}', false), '{"a":1}'); assert.equal(await SB.abrirTexto("no es json", false), "no es json");
});
test("con clave: sellar cifra y abrirTexto devuelve el original; la clave tiene mínimo 8 caracteres", async () => {
  const {SB, ls} = abrir(); await assert.rejects(SB.seg.activarCifrado("corta"), /al menos 8/);
  await SB.seg.activarCifrado("clave de prueba"); assert.equal(SB.seg.claveActiva(), true);
  const sobre = await SB.sellar('{"nota":"privada"}'); assert.ok(!sobre.includes("privada")); assert.equal(JSON.parse(sobre).cifrado, 1);
  assert.equal(await SB.abrirTexto(sobre, false), '{"nota":"privada"}'); assert.ok(ls._d.sb_seg);
});
test("archivo cifrado sin clave en el dispositivo: error claro, o se pregunta la clave solo si la persona tocó algo", async () => {
  const a = abrir(); await a.SB.seg.activarCifrado("clave de prueba"); const sobre = await a.SB.sellar("hola");
  const b = abrir(); await assert.rejects(b.SB.abrirTexto(sobre, false), /activá el cifrado/);
  let pregunto = 0; const c = abrir({extra: {prompt: () => { pregunto++; return "clave de prueba"; }, confirm: () => true}});
  assert.equal(await c.SB.abrirTexto(sobre, true), "hola"); assert.equal(pregunto, 1); assert.equal(c.SB.seg.claveActiva(), true);
  const d = abrir({extra: {prompt: () => "clave de prueba", confirm: () => false}});
  await assert.rejects(d.SB.abrirTexto(sobre, true), /No se juntó/); assert.equal(d.SB.seg.claveActiva(), false);
  const e = abrir({extra: {prompt: () => "otra clave"}}); await assert.rejects(e.SB.abrirTexto(sobre, true), /activá el cifrado/);
});
test("cambiar la clave: el archivo viejo se sigue leyendo, hay que reescribirlo, y después la clave anterior se olvida", async () => {
  const {SB, ls} = abrir(); await SB.seg.activarCifrado("clave vieja 123"); const viejo = await SB.sellar("dato");
  await assert.rejects(SB.seg.cambiarClave("equivocada", "clave nueva 456"), /no es correcta/);
  await SB.seg.cambiarClave("clave vieja 123", "clave nueva 456");
  assert.equal(await SB.abrirTexto(viejo, false), "dato"); assert.equal(SB.seg.reescribir(), true);
  const nuevo = await SB.sellar("dato"); assert.equal(SB.seg.reescribir(), false); assert.equal(JSON.parse(ls._d.sb_seg).anterior, undefined);
  assert.equal(await SB.abrirTexto(nuevo, false), "dato"); await assert.rejects(SB.seg.descifrar(JSON.parse(nuevo), "clave vieja 123"), e => e.clave);
});
test("desactivar el cifrado: lee lo cifrado, y lo que se guarda después sale en texto plano", async () => {
  const {SB} = abrir(); await SB.seg.activarCifrado("clave de prueba"); const cif = await SB.sellar("dato");
  await assert.rejects(SB.seg.quitarCifrado("mala"), /no es correcta/); await SB.seg.quitarCifrado("clave de prueba");
  assert.equal(SB.seg.claveActiva(), false); assert.equal(await SB.abrirTexto(cif, false), "dato"); assert.equal(await SB.sellar("dato"), "dato");
});
test("si hay clave guardada y seguridad.js no cargó, no se guarda sin cifrar", async () => {
  const {SB} = abrir({datos: {sb_seg: JSON.stringify({clave: "clave de prueba"})}}); delete SB.seg;
  await assert.rejects(SB.sellar("dato"), /no se guarda sin cifrar/);
  const sin = abrir(); delete sin.SB.seg; assert.equal(await sin.SB.sellar("dato"), "dato");
});
test("dos dispositivos con la misma clave: el archivo sale cifrado y el otro junta los datos", async () => {
  const a = abrir(); await a.SB.seg.activarCifrado("clave compartida"); a.SB.datos("notas").n.push({id: "n1", x: "Nota secreta", m: Date.now()}); a.SB.guardar("notas");
  const archivo = await a.SB.sellar(JSON.stringify(a.SB.sync.empaquetar())); assert.ok(!archivo.includes("secreta"));
  const b = abrir(); await b.SB.seg.activarCifrado("clave compartida");
  const r = b.SB.sync.aplicar(JSON.parse(await b.SB.abrirTexto(archivo, false))); assert.ok(r.n >= 1); assert.equal(b.SB.datos("notas").n[0].x, "Nota secreta");
  const c = abrir(); await c.SB.seg.activarCifrado("otra clave larga"); await assert.rejects(c.SB.abrirTexto(archivo, false), /no abre ese archivo/);
});

test("PIN: solo 4 a 8 números, y no se guarda en claro", async () => {
  const {SB, ls} = abrir(); for (const m of ["123", "123456789", "12a4", ""]) await assert.rejects(SB.seg.ponerPin(m), /4 y 8 números/);
  await SB.seg.ponerPin("4821"); assert.equal(SB.seg.pinActivo(), true); assert.ok(!ls._d.sb_seg.includes("4821"));
  assert.deepEqual(J(await SB.seg.verificarPin("4821")), {ok: true}); assert.equal((await SB.seg.verificarPin("0000")).ok, false);
});
test("PIN: desde el 5º intento fallido hay que esperar, incluso con el PIN correcto", async () => {
  const {SB, ls} = abrir(); await SB.seg.ponerPin("4821"); let r;
  for (let i = 1; i <= 4; i++) { r = await SB.seg.verificarPin("0000"); assert.equal(r.restan, 5 - i); }
  r = await SB.seg.verificarPin("0000"); assert.ok(r.espera >= 14);
  r = await SB.seg.verificarPin("4821"); assert.equal(r.ok, false); assert.ok(r.espera > 0);
  const s = JSON.parse(ls._d.sb_seg); s.hasta = Date.now() - 1; ls.setItem("sb_seg", JSON.stringify(s));   // pasó la espera
  assert.equal((await SB.seg.verificarPin("4821")).ok, true); assert.equal(JSON.parse(ls._d.sb_seg).fallos, undefined);
});
test("PIN: cambiarlo o quitarlo pide el actual", async () => {
  const {SB} = abrir(); await SB.seg.ponerPin("4821");
  await assert.rejects(SB.seg.cambiarPin("1111", "9999"), /no es correcto/); await SB.seg.cambiarPin("4821", "9999"); assert.equal((await SB.seg.verificarPin("9999")).ok, true);
  await assert.rejects(SB.seg.quitarPin("4821"), /no es correcto/); await SB.seg.quitarPin("9999"); assert.equal(SB.seg.pinActivo(), false);
});
test("con PIN, la app arranca bloqueada; sin PIN, no. Y bloqueada no dibuja nada hasta desbloquear", async () => {
  const a = abrir(); assert.ok(!a.SB.bloqueado); await a.SB.seg.ponerPin("4821");
  const b = abrir({datos: {sb_seg: a.ls._d.sb_seg}}); assert.equal(b.SB.bloqueado, true);
  b.SB.seg.desbloquear(); assert.equal(b.SB.bloqueado, false);
  assert.equal(b.SB.seg.bloquear(), true); assert.equal(b.SB.bloqueado, true);
});
test("«Olvidé mi PIN»: borrarTodo deja el dispositivo vacío y sin PIN", async () => {
  const a = abrir(); await a.SB.seg.ponerPin("4821"); a.SB.datos("notas").n.push({id: "n1", x: "algo", m: 1}); a.SB.guardar("notas"); a.SB.vaciar && a.SB.almacen.vaciar();
  await a.SB.seg.borrarTodo(); assert.deepEqual(J(a.SB.almacen.usuario()), {}); assert.equal(Object.keys(a.ls._d).filter(k => /^sb_/.test(k)).length, 0);
});

function conDatos(p) { p.SB.datos("notas").n.push({id: "n1", x: "algo", m: 1}); p.SB.guardar("notas"); return p; }
test("recordatorio: la primera vez no avisa y la cuenta de los 15 días arranca ahí", () => {
  const {SB, ls} = conDatos(abrir()), t = Date.now(); assert.equal(SB.seg.debeRecordar(t), false); assert.equal(JSON.parse(ls._d.sb_copia).t, t);
});
test("recordatorio: avisa a los 15 días solo si hay cambios sin guardar", () => {
  const p = conDatos(abrir()), {SB} = p, t = Date.now(); SB.seg.debeRecordar(t);
  assert.equal(SB.seg.debeRecordar(t + 14 * DIA), false, "a los 14 días no");
  assert.equal(SB.seg.debeRecordar(t + 15 * DIA), true, "a los 15 días con datos nuevos sí");
  SB.seg.copiaHecha(); assert.equal(SB.seg.debeRecordar(Date.now() + 40 * DIA), false, "pasó mucho tiempo, pero no hay nada nuevo desde la copia");
  SB.datos("notas").n.push({id: "n2", x: "otra", m: 2}); SB.guardar("notas"); assert.equal(SB.seg.debeRecordar(Date.now() + 40 * DIA), true);
});
test("recordatorio: «Después» lo calla 3 días; sin datos no avisa nunca", () => {
  const p = conDatos(abrir()), {SB} = p, t = Date.now(); SB.seg.debeRecordar(t); const tarde = t + 20 * DIA;
  assert.equal(SB.seg.debeRecordar(tarde), true); SB.seg.posponer(tarde);
  assert.equal(SB.seg.debeRecordar(tarde + 2 * DIA), false); assert.equal(SB.seg.debeRecordar(tarde + 3 * DIA + 1), true);
  const vacia = abrir(); vacia.SB.seg.debeRecordar(t); assert.equal(vacia.SB.seg.debeRecordar(t + 60 * DIA), false);
});
test("recordatorio: guardar el archivo de sincronización o descargar una copia cuenta como copia", () => {
  const {SB, ls} = conDatos(abrir()); SB.seg.debeRecordar(Date.now() - 30 * DIA); ls.setItem("sb_copia", JSON.stringify({t: Date.now() - 30 * DIA, h: ""}));
  assert.equal(SB.seg.debeRecordar(), true); SB.copiaHecha(); assert.equal(SB.seg.debeRecordar(), false);
});

/* ---- copias automáticas internas, cifradas (1.13.1) ---- */
const CLAVE = "clave larga 123", SECRETO = "wifi secreto123";
const sembrar = (extra = {}) => ({sb_ult_version: "0.9.0", sb_inbox: JSON.stringify([{id: "i1", t: SECRETO, c: 1}]), ...extra});   // versión vieja guardada → al abrir se hace la copia de actualización
const copiasDe = p => JSON.parse(p.ls._d.sb_copias || "[]");
test("copias internas: sin cifrado, la copia de la actualización se guarda como siempre (con los datos a la vista)", () => {
  const p = abrir({datos: sembrar()}), c = copiasDe(p); assert.equal(c.length, 1); assert.ok(c[0].d && c[0].d.sb_inbox); assert.equal(c[0].c, undefined);
});
test("copias internas: con el cifrado activo la copia nunca se escribe en claro; se cifra y recién ahí se guarda", async () => {
  const p = abrir({datos: sembrar({sb_seg: JSON.stringify({clave: CLAVE})})});
  assert.equal(p.ls._d.sb_copias, undefined, "todavía no se escribió nada en claro"); assert.ok(p.SB.copiaPend, "queda pendiente en memoria");
  assert.equal(await p.SB.seg.cifrarCopias(), 1); const c = copiasDe(p);
  assert.equal(c.length, 1); assert.equal(c[0].c.cifrado, 1); assert.equal(c[0].d, undefined); assert.ok(!p.ls._d.sb_copias.includes("secreto123")); assert.equal(p.SB.copiaPend, null);
  assert.equal(c[0].v !== undefined, true, "la versión y la fecha quedan a la vista para listarla");
  const datos = JSON.parse(await p.SB.abrirTexto(JSON.stringify(c[0].c), false)); assert.ok(JSON.stringify(datos).includes(SECRETO), "se puede restaurar con la clave");
});
test("copias internas: al activar el cifrado se cifran las copias que ya estaban en claro", async () => {
  const p = abrir({datos: sembrar()}); assert.ok(p.ls._d.sb_copias.includes("secreto123"));
  assert.equal(await p.SB.seg.activarCifrado(CLAVE), 1); assert.ok(!p.ls._d.sb_copias.includes("secreto123")); assert.equal(copiasDe(p)[0].c.cifrado, 1);
  assert.equal(await p.SB.seg.cifrarCopias(), 0, "una segunda pasada no vuelve a cifrar nada");
});
test("copias internas: al cambiar la clave se recifran; la vieja ya no abre y la nueva sí", async () => {
  const p = abrir({datos: sembrar()}); await p.SB.seg.activarCifrado(CLAVE);
  const r = await p.SB.seg.cambiarClave(CLAVE, "otra clave 456"); assert.deepEqual(J(r), {ok: 1, perdidas: 0});
  const c = copiasDe(p)[0].c; await assert.rejects(p.SB.seg.descifrar(c, CLAVE), e => e.clave); assert.ok((await p.SB.seg.descifrar(c, "otra clave 456")).includes(SECRETO));
});
test("copias internas: al desactivar el cifrado vuelven a quedar legibles", async () => {
  const p = abrir({datos: sembrar()}); await p.SB.seg.activarCifrado(CLAVE);
  const r = await p.SB.seg.quitarCifrado(CLAVE); assert.deepEqual(J(r), {ok: 1, perdidas: 0});
  const c = copiasDe(p)[0]; assert.equal(c.c, undefined); assert.ok(c.d.sb_inbox);
});
test("copias internas: una copia cifrada con otra clave se cuenta como perdida y no se toca ni se rompe", async () => {
  const p = abrir({datos: sembrar({sb_seg: JSON.stringify({clave: CLAVE})})}); await p.SB.seg.cifrarCopias();
  const ajena = await p.SB.seg.cifrar("{}", "clave ajena xx"); p.SB.guardarCopias([{t: 1, v: "0.5.0", m: "", c: ajena}, ...copiasDe(p)]);
  const r = await p.SB.seg.recifrarCopias(CLAVE, "nueva clave 999"); assert.deepEqual(J(r), {ok: 1, perdidas: 1});
  assert.deepEqual(J(copiasDe(p)[0].c), J(ajena), "la ajena queda igual"); assert.ok((await p.SB.seg.descifrar(copiasDe(p)[1].c, "nueva clave 999")).includes(SECRETO));
});
test("copias internas: si seguridad.js no carga, la copia pendiente se guarda igual para no perder la red de seguridad", () => {
  const p = abrir({datos: sembrar({sb_seg: JSON.stringify({clave: CLAVE})})}); assert.ok(p.SB.copiaPend); delete p.SB.seg; p.SB.volcarCopia();
  assert.equal(p.SB.copiaPend, null); assert.ok(copiasDe(p)[0].d.sb_inbox);
});
