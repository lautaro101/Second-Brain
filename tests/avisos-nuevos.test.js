const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const sin = (SB, t) => SB.armarAvisos().filter(e => e.t === t);

test("avisos: el Diario avisa mientras no hayas escrito nada hoy, solo ese día y de fondo; deja de avisar al escribir", () => {
  const {SB} = abrir(), hoy = SB.u.ymd(), a = SB.mods.diario.avisos();
  assert.equal(a.length, 1); assert.equal(a[0].f, hoy); assert.equal(a[0].solo, true); assert.equal(a[0].bg, true); assert.equal(a[0].t, "Check-in del diario");
  SB.datos("diario").e[hoy] = {x: "", a: 0, g: "", q: {"m-p1": "Algo"}}; assert.equal(SB.mods.diario.avisos().length, 0);       // alcanza con un check-in
  delete SB.datos("diario").e[hoy]; SB.datos("diario").e[hoy] = {x: "", a: 3, g: ""}; assert.equal(SB.mods.diario.avisos().length, 0);   // o con el ánimo
});
test("avisos: la revisión semanal cae en el próximo domingo (o hoy si es domingo)", () => {
  const {SB} = abrir(), r = sin(SB, "Revisión semanal"); assert.equal(r.length, 1); const f = r[0].f, hoy = SB.u.ymd();
  assert.equal(new Date(f + "T12:00:00").getDay(), 0); assert.ok(f >= hoy && f <= SB.u.sumar(hoy, 6)); assert.equal(r[0].solo, true);
});
test("avisos: el respaldo avisa con cambios sin guardar y más de 7 días; no si no hay cambios, si es reciente o si nunca se guardó", () => {
  const dato = o => ({sb_sync: JSON.stringify(Object.assign({mods: {}, ult: 0, mod: false, arch: ""}, o))}), dia = 864e5;
  let {SB} = abrir({datos: dato({ult: Date.now() - 10 * dia, mod: true})}); const r = sin(SB, "Respaldo"); assert.equal(r.length, 1); assert.match(r[0].c, /Hace 10 días/); assert.equal(r[0].f, SB.u.ymd());
  ({SB} = abrir({datos: dato({ult: Date.now() - 10 * dia, mod: false})})); assert.equal(sin(SB, "Respaldo").length, 0);
  ({SB} = abrir({datos: dato({ult: Date.now() - 3 * dia, mod: true})})); assert.equal(sin(SB, "Respaldo").length, 0);
  ({SB} = abrir({datos: dato({ult: 0, mod: true})})); assert.equal(sin(SB, "Respaldo").length, 0);
});
test("avisos: cada uno de los tres se puede apagar en Ajustes (por dispositivo)", () => {
  const sync = JSON.stringify({mods: {}, ult: Date.now() - 9 * 864e5, mod: true, arch: ""}), TRES = ["Check-in del diario", "Respaldo", "Revisión semanal"];
  const nombres = datos => abrir({datos}).SB.armarAvisos().map(e => e.t).filter(t => TRES.includes(t)).sort();
  assert.deepEqual(J(nombres({sb_sync: sync})), TRES);                                                                                                   // por defecto, los tres
  assert.deepEqual(J(nombres({sb_sync: sync, sb_cfg: JSON.stringify({off: [], avx: {diario: false, respaldo: false, semana: false}})})), []);
  assert.deepEqual(J(nombres({sb_sync: sync, sb_cfg: JSON.stringify({off: [], avx: {diario: false}})})), ["Respaldo", "Revisión semanal"]);                 // solo se apaga el que elegís
  assert.equal(abrir({datos: {sb_cfg: JSON.stringify({off: [], avx: {semana: false}})}}).SB.avisoActivo("semana"), false);
});
test("avisos: el de un hábito dice la racha", () => {
  const {SB} = abrir(), h = {id: "h", n: "Inglés", d: [0, 1, 2, 3, 4, 5, 6], h: {}}; SB.datos("habitos").h.push(h);
  assert.equal(SB.mods.habitos.avisos()[0].c, "Inglés");
  [1, 2, 3].forEach(n => { h.h[SB.u.sumar(SB.u.ymd(), -n)] = 1; }); assert.equal(SB.mods.habitos.avisos()[0].c, "Inglés · racha 3 días");
});
test("avisos: la pantalla de Ajustes muestra los tres interruptores", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "core.js"), "utf8");
  ["diario", "respaldo", "semana"].forEach(k => assert.ok(src.includes('"' + k + '"') && src.includes('data-c="avx"')));
});
