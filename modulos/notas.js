/* Módulo Notas: texto con formato Markdown (títulos, listas, checkboxes, código, citas, enlaces), notas fijadas y plantillas.
   Etiquetas con #palabra y enlaces entre notas con [[Título]]. El título es la primera línea. Una nota: {id, x texto, m modificada, pin 1 si está fijada}. */
(function () {
const {esc, norm, uid, eventos} = SB.u, D = () => SB.datos("notas");
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu, LINK = /\[\[([^\]\n]+)\]\]/g;
const tags = x => [...new Set([...x.matchAll(TAG)].map(m => m[2].toLowerCase()))];
const titulo = x => ((x.split("\n")[0] || "").replace(/^\s*#{1,6}\s+/, "").replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\[\[|\]\]/g, "").replace(/[*_`~]/g, "").trim().slice(0, 80)) || "Sin título";
const links = x => [...new Set([...x.matchAll(LINK)].map(m => m[1].trim()))];
const porTitulo = t => D().n.find(n => norm(titulo(n.x)) === norm(t));
const nueva = (x, extra) => { const n = Object.assign({id: uid(), x, m: Date.now()}, extra); D().n.unshift(n); SB.guardar("notas"); return n; };
const resumen = x => { const l = x.split("\n").slice(1).map(s => s.replace(/^\s*(#{1,6}|[-*+>]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "").replace(/[`*_~]|\[\[|\]\]|#[\p{L}\p{N}_-]+/gu, "").trim()).find(Boolean) || ""; return l.length > 90 ? l.slice(0, 90) + "…" : l; };
let filtro = "", enfocar = "";

/* ---------- Markdown ---------- */
const BLOQUE = /^(```|#{1,6}\s|\s*([-*+]|\d+[.)])\s|>|\s*([-*_])(\s*\3){2,}\s*$)/;
function inline(t) {      // lo especial (código, enlaces, etiquetas) se aparta, el resto se escapa y recién ahí se aplica negrita, cursiva y tachado
  const g = [], ap = h => "\u0000" + (g.push(h) - 1) + "\u0000";
  let s = t.replace(/`([^`\n]+)`/g, (_, c) => ap("<code>" + esc(c) + "</code>"))
    .replace(LINK, (_, x) => { const n = porTitulo(x.trim()); return ap(n ? `<a class="wl" href="#/notas/${esc(n.id)}">${esc(x)}</a>` : `<span class="wl falta" title="Todavía no existe">${esc(x)}</span>`); })
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, x, u) => ap(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(x)}</a>`))
    .replace(/(^|\s)(https?:\/\/[^\s]*[^\s.,;:!?)])/g, (_, p, u) => p + ap(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`))
    .replace(TAG, (_, p, x) => p + ap(`<span class="tg">#${esc(x)}</span>`));
  s = esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?!\w)/g, "$1<em>$2</em>").replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => g[+i]);
}
/* Texto → HTML. Todo lo que escribe el usuario pasa por esc(), así que no entra HTML propio. Los checkboxes llevan data-l = número de línea para poder tildarlos. */
function render(texto, o) {
  o = o || {}; const L = String(texto || "").replace(/\r/g, "").split("\n"), out = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const c = []; i++; while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]); i++; out.push("<pre><code>" + esc(c.join("\n")) + "</code></pre>"); continue; }
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { const n = Math.min(m[1].length + 1, 6); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^>/.test(l)) { const c = []; while (i < L.length && /^>/.test(L[i])) c.push(inline(L[i++].replace(/^>\s?/, ""))); out.push("<blockquote>" + c.join("<br>") + "</blockquote>"); continue; }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(\[([ xX])\]\s+)?(.*)$/.exec(l))) {
      const n = Math.min(Math.floor(m[1].replace(/\t/g, "  ").length / 2), 4), num = /\d/.test(m[2]);
      const marca = m[3] ? `<button type="button" class="ckmd${/x/i.test(m[4]) ? " on" : ""}" data-a="ck" data-l="${i}" aria-label="Marcar o desmarcar">${/x/i.test(m[4]) ? "✓" : ""}</button>` : `<span class="mk">${num ? esc(m[2]) : "•"}</span>`;
      out.push(`<div class="li${m[3] && /x/i.test(m[4]) ? " hecha" : ""}" style="--n:${n}">${marca}<span>${inline(m[5])}</span></div>`); i++; continue;
    }
    if (o.titulo && i === 0) { out.push(`<h2 class="nt">${inline(l)}</h2>`); i++; continue; }
    const p = [l]; i++; while (i < L.length && L[i].trim() && !BLOQUE.test(L[i])) p.push(L[i++]);
    out.push("<p>" + p.map(inline).join("<br>") + "</p>");
  }
  return out.join("");
}
const alternarCheck = (n, linea) => { const L = n.x.replace(/\r/g, "").split("\n"); if (linea < 0 || linea >= L.length) return false; const r = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/, m = r.exec(L[linea]); if (!m) return false; L[linea] = L[linea].replace(r, "$1[" + (m[2] === " " ? "x" : " ") + "]"); n.x = L.join("\n"); n.m = Date.now(); return true; };

/* ---------- Plantillas ---------- */
const fechaHoy = () => new Date().toLocaleDateString("es-AR");
const PLANTILLAS = [
  {id: "clase", nombre: "Nota de clase", icono: "🎓", texto: () => `Clase: \n#clase\n\n**Fecha:** ${fechaHoy()}\n\n## Temas\n- \n\n## Apuntes\n\n\n## Para repasar\n- [ ] \n\n## Dudas\n- `},
  {id: "idea", nombre: "Idea de app", icono: "💡", texto: () => `Idea: \n#idea #app\n\n**El problema:** \n\n## Qué hace\n- \n\n## Para quién\n- \n\n## Primer paso\n- [ ] \n\n## Dudas y riesgos\n- `},
  {id: "reunion", nombre: "Reunión", icono: "🤝", texto: () => `Reunión: \n#reunion\n\n**Fecha:** ${fechaHoy()}\n**Con:** \n\n## Temas\n- \n\n## Decisiones\n- \n\n## Pendientes\n- [ ] `},
  {id: "blanco", nombre: "En blanco", icono: "📄", texto: () => ""}
];

/* ---------- Edición en el cuadro de texto ---------- */
const avisar = ta => ta.dispatchEvent(new Event("input", {bubbles: true}));
function envolver(ta, a, b, vacio) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e) || vacio || "";
  ta.value = v.slice(0, s) + a + sel + b + v.slice(e); ta.focus(); ta.setSelectionRange(s + a.length, s + a.length + sel.length); avisar(ta);
}
function prefijar(ta, pref, rx) {      // pone el prefijo en cada línea seleccionada; si ya lo tenían todas, lo saca
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, ini = v.lastIndexOf("\n", s - 1) + 1, f0 = v.indexOf("\n", e), fin = f0 < 0 ? v.length : f0;
  const ls = v.slice(ini, fin).split("\n"), todas = ls.every(l => rx.test(l)), nuevo = ls.map(l => (todas ? "" : pref) + l.replace(rx, "")).join("\n");
  ta.value = v.slice(0, ini) + nuevo + v.slice(fin); ta.focus(); ta.setSelectionRange(ini, ini + nuevo.length); avisar(ta);
}
const HERR = {
  neg: ta => envolver(ta, "**", "**", "texto"), cur: ta => envolver(ta, "*", "*", "texto"), cod: ta => { const t = ta.value.slice(ta.selectionStart, ta.selectionEnd); /\n/.test(t) ? envolver(ta, "```\n", "\n```") : envolver(ta, "`", "`", "código"); },
  tit: ta => prefijar(ta, "## ", /^#{1,6}\s+/), lis: ta => prefijar(ta, "- ", /^\s*[-*+]\s+/), chk: ta => prefijar(ta, "- [ ] ", /^\s*[-*+]\s+(\[[ xX]\]\s+)?/),
  num: ta => prefijar(ta, "1. ", /^\s*\d+[.)]\s+/), cit: ta => prefijar(ta, "> ", /^>\s?/), enl: ta => envolver(ta, "[[", "]]", "Título de la nota")
};
function teclas(e, ta) {      // Enter dentro de una lista sigue la lista; en un ítem vacío, la termina. Ctrl+B / Ctrl+I.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "b" || e.key === "i")) { e.preventDefault(); HERR[e.key === "b" ? "neg" : "cur"](ta); return; }
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || ta.selectionStart !== ta.selectionEnd) return;
  const v = ta.value, p = ta.selectionStart, ini = v.lastIndexOf("\n", p - 1) + 1, f0 = v.indexOf("\n", p), resto = v.slice(p, f0 < 0 ? v.length : f0);
  const m = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/.exec(v.slice(ini, p)); if (!m) return;
  e.preventDefault();
  if (!m[4] && !resto) { ta.value = v.slice(0, ini) + v.slice(p); ta.setSelectionRange(ini, ini); }
  else { const marca = /\d/.test(m[2]) ? (parseInt(m[2], 10) + 1) + m[2].slice(-1) : m[2]; ta.setRangeText("\n" + m[1] + marca + " " + (m[3] ? "[ ] " : ""), p, p, "end"); }
  avisar(ta);
}

SB.registrar({
  id: "notas", nombre: "Notas", icono: "📝", esquema: 1,
  inicial: () => ({n: []}), migraciones: {}, sync: [{k: "n", orden: "desc", t: x => x.m}],
  captura: {etiqueta: "Nota", guardar: t => { nueva(t); }},
  hoy: () => D().n.filter(n => n.pin).slice(0, 3).map(n => ({t: titulo(n.x), s: "📌 Nota fijada", ir: "#/notas/" + n.id})), avisos: () => [],
  buscar: q => D().n.filter(n => norm(n.x).includes(norm(q))).map(n => ({t: (n.pin ? "📌 " : "") + titulo(n.x), s: tags(n.x).map(t => "#" + t).join(" "), ir: "#/notas/" + n.id})),
  semana: () => { const s = Date.now() - 7 * 864e5, k = D().n.filter(n => n.m > s).length; return [k + (k === 1 ? " nota nueva o editada" : " notas nuevas o editadas") + " esta semana."]; },
  md: render, titulo, tags, alternarCheck, plantillas: PLANTILLAS,
  pantalla(el, sub) {
    const [id, modo] = (sub || "").split("/"), n = id && D().n.find(x => x.id === id);
    if (n) return modo === "e" ? editar(el, n) : ver(el, n);
    lista(el);
  }
});

function lista(el) {
  const vacias = D().n.filter(x => !x.x.trim()); if (vacias.length) { D().n = D().n.filter(x => x.x.trim()); SB.guardar("notas"); }   // notas en blanco que quedaron sin escribir
  const todas = [...new Set(D().n.flatMap(x => tags(x.x)))].sort(), ver = D().n.filter(x => !filtro || tags(x.x).includes(filtro));
  const fila = x => `<a class="card item" href="#/notas/${x.id}"><b>${x.pin ? "📌 " : ""}${esc(titulo(x.x))}</b>${resumen(x.x) ? `<small>${esc(resumen(x.x))}</small>` : ""}<small>${tags(x.x).map(t => "#" + t).join(" ")}</small></a>`;
  const fij = ver.filter(x => x.pin), otras = ver.filter(x => !x.pin);
  el.innerHTML = `<form data-f="n"><textarea name="x" rows="3" placeholder="Nueva nota… (la primera línea es el título)"></textarea><button class="pri">Agregar nota</button></form>
    <div class="chips plant">${PLANTILLAS.map(p => `<button type="button" class="chip" data-a="plant" data-id="${p.id}">${p.icono} ${esc(p.nombre)}</button>`).join("")}</div>
    ${todas.length ? `<div class="chips"><button class="chip${filtro ? "" : " on"}" data-a="f" data-t="">todas</button>${todas.map(t => `<button class="chip${filtro === t ? " on" : ""}" data-a="f" data-t="${esc(t)}">#${esc(t)}</button>`).join("")}</div>` : ""}
    ${fij.length ? `<h3>📌 Fijadas</h3>${fij.map(fila).join("")}${otras.length ? `<h3>Otras</h3>` : ""}` : ""}
    ${otras.length ? otras.map(fila).join("") : (fij.length ? "" : `<p class="vacio">Todavía no hay notas.</p>`)}`;
  eventos(el, {
    f: (a, f) => { const t = f.x.value.trim(); if (!t) return; location.hash = "#/notas/" + nueva(t).id; },
    a: (a, b) => {
      if (a === "f") { filtro = b.dataset.t; return SB.pintar(); }
      if (a === "plant") { const p = PLANTILLAS.find(x => x.id === b.dataset.id); if (!p) return; const t = p.texto(), n2 = nueva(t, {}); enfocar = n2.id; location.hash = "#/notas/" + n2.id + "/e"; }
    }
  });
}

function relacionadas(n) {
  const sal = links(n.x), ent = D().n.filter(o => o.id !== n.id && links(o.x).some(l => norm(l) === norm(titulo(n.x))));
  return `${sal.length ? `<section class="card"><h3>Enlaza a</h3>${sal.map(l => { const t = porTitulo(l); return t ? `<a class="item" href="#/notas/${t.id}">${esc(l)}</a>` : `<div class="fila"><span class="tx">${esc(l)}<small>no existe todavía</small></span><button data-a="crear" data-t="${esc(l)}">Crear</button></div>`; }).join("")}</section>` : ""}
    ${ent.length ? `<section class="card"><h3>Mencionada en</h3>${ent.map(o => `<a class="item" href="#/notas/${o.id}">${esc(titulo(o.x))}</a>`).join("")}</section>` : ""}`;
}
const fijar = n => { n.pin = n.pin ? 0 : 1; if (!n.pin) delete n.pin; SB.guardar("notas"); };
const borrar = n => { if (!confirm("¿Borrar esta nota?")) return false; D().n = D().n.filter(x => x.id !== n.id); SB.guardar("notas"); location.hash = "#/notas"; return true; };

function ver(el, n) {
  el.innerHTML = `<div class="fila-b barra"><a class="btn" href="#/notas">← Notas</a><a class="btn" href="#/notas/${n.id}/e">✏️ Editar</a><button type="button" data-a="pin">${n.pin ? "📌 Quitar de fijadas" : "📌 Fijar"}</button><button type="button" data-a="del" class="x">Borrar</button></div>
    <article class="card md" id="md">${render(n.x, {titulo: true}) || `<p class="vacio">Nota vacía. Tocá «Editar».</p>`}</article><div id="rel">${relacionadas(n)}</div>`;
  eventos(el, {a: (a, b) => {
    if (a === "ck") { if (alternarCheck(n, +b.dataset.l)) { SB.guardar("notas"); const md = document.getElementById("md"); md.innerHTML = render(n.x, {titulo: true}); } }
    else if (a === "pin") { fijar(n); SB.pintar(); }
    else if (a === "del") borrar(n);
    else if (a === "crear") { const t = nueva(b.dataset.t + "\n"); enfocar = t.id; location.hash = "#/notas/" + t.id + "/e"; }
  }});
}

function editar(el, n) {
  const botones = [["neg", "<b>N</b>", "Negrita (Ctrl+B)"], ["cur", "<i>C</i>", "Cursiva (Ctrl+I)"], ["tit", "T", "Título"], ["lis", "•", "Lista"], ["chk", "☑", "Lista de tareas"], ["num", "1.", "Lista numerada"], ["cit", "❝", "Cita"], ["cod", "&lt;/&gt;", "Código"], ["enl", "[[ ]]", "Enlace a otra nota"]];
  el.innerHTML = `<div class="fila-b barra"><button type="button" class="pri chico" data-a="listo">✓ Listo</button><button type="button" data-a="prev" id="bprev">👁 Vista previa</button><button type="button" data-a="pin">${n.pin ? "📌 Fijada" : "📌 Fijar"}</button><button type="button" data-a="del" class="x">Borrar</button></div>
    <div class="tb" id="tb">${botones.map(b => `<button type="button" data-a="h" data-h="${b[0]}" title="${b[2]}" aria-label="${b[2]}">${b[1]}</button>`).join("")}</div>
    <textarea id="ed" class="ed" rows="16" spellcheck="true" placeholder="Primera línea = título. Usá # para títulos, - para listas, - [ ] para tareas, #etiqueta y [[Otra nota]].">${esc(n.x)}</textarea>
    <article class="card md" id="pv" hidden></article>
    <small id="ok" class="ayuda">Se guarda solo.</small>`;
  const ta = document.getElementById("ed"), pv = document.getElementById("pv"), ok = document.getElementById("ok");
  document.getElementById("tb").onmousedown = e => { if (e.target.closest("button")) e.preventDefault(); };      // así el cuadro no pierde la selección al tocar un botón
  let t; const guardar = () => { clearTimeout(t); ok.textContent = "Guardando…"; t = setTimeout(() => { n.x = ta.value; n.m = Date.now(); SB.guardar("notas"); ok.textContent = "Guardado ✓"; }, 500); };
  const volcar = () => { if (t) { clearTimeout(t); t = 0; n.x = ta.value; n.m = Date.now(); SB.guardar("notas"); } };
  ta.oninput = guardar; ta.onkeydown = e => teclas(e, ta);
  if (enfocar === n.id) { enfocar = ""; ta.focus(); const f = ta.value.indexOf("\n"), p = f < 0 ? ta.value.length : f; ta.setSelectionRange(p, p); }
  else if (!n.x) ta.focus();
  eventos(el, {a: (a, b) => {
    if (a === "h") { if (HERR[b.dataset.h]) HERR[b.dataset.h](ta); }
    else if (a === "listo") { volcar(); if (!ta.value.trim()) { D().n = D().n.filter(x => x.id !== n.id); SB.guardar("notas"); location.hash = "#/notas"; } else location.hash = "#/notas/" + n.id; }
    else if (a === "prev") { const ver = pv.hidden; pv.hidden = !ver; ta.hidden = ver; document.getElementById("tb").hidden = ver; b.textContent = ver ? "✏️ Seguir editando" : "👁 Vista previa"; if (ver) pv.innerHTML = render(ta.value, {titulo: true}) || `<p class="vacio">Todavía no escribiste nada.</p>`; }
    else if (a === "pin") { volcar(); fijar(n); b.textContent = n.pin ? "📌 Fijada" : "📌 Fijar"; }
    else if (a === "del") { clearTimeout(t); t = 0; borrar(n); }
    else if (a === "ck") { const l = +b.dataset.l, copia = {x: ta.value}; if (alternarCheck(copia, l)) { ta.value = copia.x; guardar(); pv.innerHTML = render(ta.value, {titulo: true}); } }
  }});
}
})();
