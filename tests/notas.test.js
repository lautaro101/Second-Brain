const test = require("node:test"), assert = require("node:assert/strict");
const {abrir, J} = require("./helpers");
const md = (t, o) => { const {SB} = abrir(); return SB.mods.notas.md(t, o); };

test("markdown: títulos, negrita, cursiva, tachado y código en línea", () => {
  const h = md("# Grande\n## Medio\nTexto con **negrita**, *cursiva*, _otra_ y ~~tachado~~ y `código`.");
  assert.match(h, /<h2>Grande<\/h2>/); assert.match(h, /<h3>Medio<\/h3>/); assert.match(h, /<strong>negrita<\/strong>/);
  assert.match(h, /<em>cursiva<\/em>/); assert.match(h, /<em>otra<\/em>/); assert.match(h, /<del>tachado<\/del>/); assert.match(h, /<code>código<\/code>/);
});
test("markdown: listas, numeradas y tareas con su número de línea", () => {
  const h = md("- uno\n- dos\n\n1. primero\n2. segundo\n\n- [ ] pendiente\n- [x] hecha");
  assert.equal((h.match(/class="li/g) || []).length, 6); assert.match(h, /<span class="mk">1\.<\/span>/);
  assert.match(h, /data-a="ck" data-l="6"/); assert.match(h, /class="ckmd on" data-a="ck" data-l="7"/); assert.match(h, /li hecha/);
});
test("markdown: sangría de listas, citas, línea divisoria y bloques de código", () => {
  const h = md("- padre\n  - hijo\n\n> una cita\n\n---\n\n```js\nconst a = 1 < 2;\n```");
  assert.match(h, /--n:1/); assert.match(h, /<blockquote>una cita<\/blockquote>/); assert.match(h, /<hr>/); assert.match(h, /<pre><code>const a = 1 &lt; 2;<\/code><\/pre>/);
});
test("markdown: lo que se escribe nunca se convierte en HTML propio", () => {
  const h = md("<script>alert(1)</script> <img src=x onerror=alert(2)>\n[clic](javascript:alert(3))\n[ok](https://ejemplo.com/a?b=1&c=2)\n```\n<b>no</b>\n```\n`<i>`");
  assert.ok(!/<script|<img|<b>|<i>/.test(h), h); assert.ok(!/href="javascript/.test(h));
  assert.match(h, /href="https:\/\/ejemplo\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer"/);
});
test("markdown: #etiquetas, [[enlaces]] (existentes y pendientes) y direcciones sueltas", () => {
  const {SB} = abrir(); SB.mods.notas.captura.guardar("Plan\nbase");
  const h = SB.mods.notas.md("Idea #js con [[Plan]] y [[No existe]] https://a.com/x.");
  assert.match(h, /<span class="tg">#js<\/span>/); assert.match(h, /<a class="wl" href="#\/notas\/[^"]+">Plan<\/a>/); assert.match(h, /wl falta/); assert.match(h, /href="https:\/\/a\.com\/x"/);
});
test("markdown: '# título' es un título pero '#etiqueta' no", () => {
  const h = md("# Título\n#etiqueta");
  assert.match(h, /<h2>Título<\/h2>/); assert.match(h, /<span class="tg">#etiqueta<\/span>/);
});
test("markdown: con 'titulo', la primera línea se muestra como título de la nota", () => {
  assert.match(md("Mi nota\ntexto", {titulo: true}), /<h2 class="nt">Mi nota<\/h2><p>texto<\/p>/);
});
test("el título de la lista ignora los símbolos de markdown", () => {
  const {SB} = abrir(); const t = SB.mods.notas.titulo;
  assert.equal(t("## Clase de **física** #uni"), "Clase de física"); assert.equal(t(""), "Sin título");
});
test("tildar un checkbox cambia solo esa línea", () => {
  const {SB} = abrir(), n = {x: "Lista\n- [ ] a\n- [ ] b\n- [x] c", m: 0};
  assert.equal(SB.mods.notas.alternarCheck(n, 2), true); assert.equal(n.x, "Lista\n- [ ] a\n- [x] b\n- [x] c"); assert.ok(n.m > 0);
  SB.mods.notas.alternarCheck(n, 3); assert.equal(n.x, "Lista\n- [ ] a\n- [x] b\n- [ ] c"); assert.equal(SB.mods.notas.alternarCheck(n, 0), false);
});
test("plantillas: clase, idea de app, reunión y en blanco; llevan etiqueta y tareas", () => {
  const {SB} = abrir(), p = SB.mods.notas.plantillas;
  assert.deepEqual(J(p.map(x => x.id)), ["clase", "idea", "reunion", "blanco"]);
  const clase = p[0].texto(); assert.match(clase, /^Clase: \n#clase/); assert.match(clase, /- \[ \] /); assert.match(SB.mods.notas.md(clase, {titulo: true}), /ckmd/);
  assert.match(p[1].texto(), /#idea #app/); assert.equal(p[3].texto(), "");
  assert.deepEqual(J(SB.mods.notas.tags(clase)), ["clase"]);
});
test("notas fijadas: salen en Hoy (hasta 3) y marcadas en la búsqueda", () => {
  const {SB} = abrir(), n = SB.datos("notas").n;
  ["a", "b", "c", "d", "e"].forEach((x, i) => n.push({id: "n" + i, x: "Nota " + x, m: i, pin: i < 4 ? 1 : 0}));
  const hoy = SB.mods.notas.hoy(); assert.equal(hoy.length, 3); assert.match(hoy[0].s, /fijada/); assert.equal(hoy[0].ir, "#/notas/n0");
  assert.match(SB.mods.notas.buscar("nota a")[0].t, /^📌/); assert.doesNotMatch(SB.mods.notas.buscar("nota e")[0].t, /📌/);
});
test("las notas de la 1.0 (sin formato ni fijado) se abren tal cual", () => {
  const {SB} = abrir({datos: {sb_m_notas: JSON.stringify({v: 1, d: {n: [{id: "v1", x: "Vieja\nidea #js y [[Otra]]", m: 5}]}})}});
  assert.deepEqual(J(SB.fallos), {}); assert.equal(SB.mods.notas.buscar("vieja").length, 1); assert.match(SB.mods.notas.md(SB.datos("notas").n[0].x, {titulo: true}), /Vieja/);
});
