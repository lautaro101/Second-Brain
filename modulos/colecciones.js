/* Módulo Colecciones: tus propias «bases de datos» como en Notion (libros, películas, ideas, lo que quieras).
   Datos: c colecciones {id, n nombre, i ícono, p propiedades [{id, n nombre, t tipo, o opciones}], v vista "tabla"|"tablero", g id de la propiedad que agrupa el tablero, k creada, m modificada};
   r registros {id, c colección, n título, v {idPropiedad: valor}, x página de texto (opcional, admite Markdown), k creado, m modificado}.
   Tipos: t texto · n número · f fecha · c casilla · s selección · ms selección múltiple · u enlace.
   La Papelera ya lo cubre sola (mira las listas c y r). Si se borra una colección, sus registros se van con ella en el mismo grupo. */
(function () {
const {esc, norm, ymd, uid, eventos} = SB.u, D = () => SB.datos("colecciones");
const TIPOS = {t: "Texto", n: "Número", f: "Fecha", c: "Casilla", s: "Selección", ms: "Selección múltiple", u: "Enlace"};
const PLANT = {
  libros: {n: "Libros", i: "📚", g: "Estado", p: [["Autor", "t"], ["Estado", "s", "Por leer, Leyendo, Leído"], ["Puntaje", "n"], ["Terminado", "f"]]},
  pelis: {n: "Películas y series", i: "🎬", g: "Estado", p: [["Tipo", "s", "Película, Serie"], ["Estado", "s", "Quiero ver, Viendo, Vista"], ["Puntaje", "n"]]},
  ideas: {n: "Ideas", i: "💡", g: "Estado", p: [["Estado", "s", "Nueva, Probando, Hecha"], ["Enlace", "u"], ["Fecha", "f"]]}
};
const UI = {};   // búsqueda y orden: solo mientras la app está abierta
const col = id => D().c.find(x => x.id === id), fila = id => D().r.find(x => x.id === id);
const fecha = f => String(f).split("-").reverse().join("/");
const url = l => /^https?:\/\/\S+$/i.test(l) ? l : "";
const num = s => { const n = parseFloat(String(s).trim().replace(",", ".")); return isFinite(n) ? n : null; };
const opciones = s => [...new Set(String(s).split(",").map(x => x.trim()).filter(Boolean))];
const vacioV = v => v == null || v === "" || v === false || (Array.isArray(v) && !v.length);
const mostrar = (p, v) => vacioV(v) ? "" : p.t === "ms" ? v.join(", ") : p.t === "f" ? fecha(v) : p.t === "c" ? "✓" : String(v);
const fechaProp = c => c.p.find(p => p.t === "f"), hecha = (c, r) => c.p.some(p => p.t === "c" && r.v[p.id]);
const guardar = c => { if (c) c.m = Date.now(); SB.guardar("colecciones"); };

function crear(n, i, plant) {
  const c = {id: uid(), n, i: i || "📁", p: [], v: "tabla", g: "", k: Date.now(), m: Date.now()};
  if (plant) plant.p.forEach(x => { const p = {id: uid(), n: x[0], t: x[1], o: x[2] ? opciones(x[2]) : []}; c.p.push(p); if (x[0] === plant.g) c.g = p.id; });
  D().c.unshift(c); guardar(c); return c;
}
function filas(c, u) {
  const q = norm(u.q || ""), p = c.p.find(x => x.id === u.o);
  let rs = D().r.filter(r => r.c === c.id && (!q || norm(r.n + " " + (r.x || "") + " " + c.p.map(x => mostrar(x, r.v[x.id])).join(" ")).includes(q)));
  const k = r => { const v = p ? r.v[p.id] : r.n; return p && p.t === "n" ? v : p && p.t === "c" ? (v ? 1 : 0) : vacioV(v) ? "" : norm(Array.isArray(v) ? v.join(",") : String(v)); };
  if (u.o !== undefined && (p || u.o === "")) rs = rs.slice().sort((a, b) => { const x = k(a), y = k(b), ex = x == null || x === "", ey = y == null || y === ""; return ex || ey ? (ex ? 1 : 0) - (ey ? 1 : 0) : (x < y ? -1 : x > y ? 1 : 0) * (u.d || 1); });
  else rs = rs.slice().sort((a, b) => b.k - a.k);
  return rs;
}

function pIndice(el) {
  const cs = D().c;
  el.innerHTML = `<form data-f="nueva"><div class="fila-b"><input name="i" size="2" placeholder="📁" aria-label="Ícono" autocomplete="off"><input name="n" placeholder="Nueva colección (ej: Series)" required autocomplete="off"></div><button class="pri">Crear colección</button></form>
    ${cs.length ? cs.map(c => { const n = D().r.filter(r => r.c === c.id).length; return `<a class="card enlace" href="#/colecciones/${esc(c.id)}"><b>${esc(c.i)} ${esc(c.n)}</b><small>${n} ${n === 1 ? "registro" : "registros"} · ${c.p.length} ${c.p.length === 1 ? "propiedad" : "propiedades"}</small></a>`; }).join("") : `<p class="vacio">Una colección es una lista con las columnas que vos elijas.<br>Empezá con una plantilla o creá la tuya.</p>`}
    <section class="card"><h3>Plantillas</h3><div class="chips">${Object.keys(PLANT).map(k => `<button class="chip" data-a="plant" data-k="${k}">${PLANT[k].i} ${esc(PLANT[k].n)}</button>`).join("")}</div></section>`;
  eventos(el, {
    f: (a, f) => { const n = f.n.value.trim(); if (!n) return; location.hash = "#/colecciones/p-" + crear(n, f.i.value.trim().slice(0, 4)).id; },
    a: (a, b) => { if (a === "plant") location.hash = "#/colecciones/" + crear(PLANT[b.dataset.k].n, PLANT[b.dataset.k].i, PLANT[b.dataset.k]).id; }
  });
}

function pColeccion(el, c) {
  const u = UI[c.id] || (UI[c.id] = {q: "", o: undefined, d: 1}), sels = c.p.filter(p => p.t === "s"), g = sels.find(p => p.id === c.g) || sels[0];
  const tab = c.v === "tablero" && g ? "tablero" : "tabla", rs = filas(c, u), est = "padding:6px 10px;text-align:left;white-space:nowrap;border-bottom:1px solid rgba(128,128,128,.25)";
  const fl = id => u.o === id ? (u.d > 0 ? " ▲" : " ▼") : "";
  const celda = (p, r) => { const v = r.v[p.id];
    if (p.t === "c") return `<button class="chk${v ? " on" : ""}" data-a="chk" data-r="${esc(r.id)}" data-p="${esc(p.id)}" aria-label="${esc(p.n)}">${v ? "✓" : ""}</button>`;
    return p.t === "u" && url(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">enlace</a>` : esc(mostrar(p, v)); };
  let cuerpo;
  if (tab === "tablero") {
    const cols = [""].concat(g.o), de = r => { const k = r.v[g.id] || ""; return g.o.includes(k) ? k : ""; };
    cuerpo = `<div style="display:flex;gap:10px;overflow-x:auto;align-items:flex-start">${cols.map((o, i) => `<div style="min-width:200px;flex:1"><h3>${o ? esc(o) : "Sin " + esc(g.n.toLowerCase())}</h3>${rs.filter(r => de(r) === o).map(r => `<div class="card"><a href="#/colecciones/r-${esc(r.id)}"><b>${esc(r.n)}</b></a><div class="fila-b">${i > 0 ? `<button data-a="mov" data-r="${esc(r.id)}" data-d="-1" aria-label="Mover a la izquierda">◀</button>` : ""}${i < cols.length - 1 ? `<button data-a="mov" data-r="${esc(r.id)}" data-d="1" aria-label="Mover a la derecha">▶</button>` : ""}</div></div>`).join("")}</div>`).join("")}</div>`;
  } else {
    cuerpo = rs.length ? `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%"><thead><tr><th style="${est}"><button class="link" data-a="ord" data-p="">Nombre${fl("")}</button></th>${c.p.map(p => `<th style="${est}"><button class="link" data-a="ord" data-p="${esc(p.id)}">${esc(p.n)}${fl(p.id)}</button></th>`).join("")}</tr></thead>
      <tbody>${rs.map(r => `<tr><td style="${est}"><a href="#/colecciones/r-${esc(r.id)}"><b>${esc(r.n)}</b>${r.x ? " 📄" : ""}</a></td>${c.p.map(p => `<td style="${est}">${celda(p, r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<p class="vacio">${u.q ? "Nada coincide con la búsqueda." : "Todavía no hay registros."}</p>`;
  }
  el.innerHTML = `<a class="btn" href="#/colecciones">← Colecciones</a><h2 class="fecha">${esc(c.i)} ${esc(c.n)}</h2>
    <div class="chips"><button class="chip${tab === "tabla" ? " on" : ""}" data-a="vista" data-v="tabla">Tabla</button>${g ? `<button class="chip${tab === "tablero" ? " on" : ""}" data-a="vista" data-v="tablero">Tablero</button>` : ""}<a class="chip" href="#/colecciones/p-${esc(c.id)}">⚙️ Propiedades</a></div>
    ${tab === "tablero" && sels.length > 1 ? `<select data-c="g" aria-label="Agrupar por">${sels.map(p => `<option value="${esc(p.id)}"${p.id === g.id ? " selected" : ""}>Agrupar por ${esc(p.n)}</option>`).join("")}</select>` : ""}
    <form data-f="fila"><input name="n" placeholder="Nuevo registro" required autocomplete="off"><button class="pri">Agregar</button></form>
    <input data-c="q" type="search" placeholder="Buscar en esta colección" value="${esc(u.q)}" aria-label="Buscar" autocomplete="off">${cuerpo}`;
  eventos(el, {
    f: (a, f) => { const n = f.n.value.trim(); if (!n) return; D().r.push({id: uid(), c: c.id, n, v: {}, k: Date.now(), m: Date.now()}); guardar(c); SB.pintar(); },
    c: (a, n) => { if (a === "q") u.q = n.value; else if (a === "g") { c.g = n.value; guardar(c); } SB.pintar(); },
    a: (a, b) => {
      if (a === "vista") { c.v = b.dataset.v; guardar(c); }
      else if (a === "ord") { const p = b.dataset.p; if (u.o === p) u.d = -u.d; else { u.o = p; u.d = 1; } }
      else if (a === "chk") { const r = fila(b.dataset.r); if (!r) return; if (r.v[b.dataset.p]) delete r.v[b.dataset.p]; else r.v[b.dataset.p] = true; r.m = Date.now(); SB.guardar("colecciones"); }
      else if (a === "mov") { const r = fila(b.dataset.r), cols = [""].concat(g.o); if (!r) return; const k = r.v[g.id] || "", i = Math.max(0, cols.indexOf(k)) + +b.dataset.d; if (i < 0 || i >= cols.length) return; if (cols[i]) r.v[g.id] = cols[i]; else delete r.v[g.id]; r.m = Date.now(); SB.guardar("colecciones"); }
      SB.pintar();
    }
  });
}

const campo = (p, v) => { const id = esc(p.id), et = `<label class="ayuda">${esc(p.n)}</label>`;
  if (p.t === "c") return `<label class="fila"><input type="checkbox" data-pid="${id}"${v ? " checked" : ""}> ${esc(p.n)}</label>`;
  if (p.t === "s") return et + `<select data-pid="${id}"><option value=""></option>${p.o.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  if (p.t === "ms") return et + `<div>${p.o.map(o => `<label class="fila"><input type="checkbox" data-pid="${id}" value="${esc(o)}"${(v || []).includes(o) ? " checked" : ""}> ${esc(o)}</label>`).join("") || "<small>Agregá opciones en Propiedades.</small>"}</div>`;
  return et + `<input data-pid="${id}" type="${p.t === "f" ? "date" : "text"}"${p.t === "n" ? ' inputmode="decimal"' : ""} value="${esc(v == null ? "" : String(v))}" autocomplete="off">`; };
const leer = (f, p) => { const es = [...f.querySelectorAll('[data-pid="' + p.id + '"]')]; if (!es.length) return null;
  if (p.t === "c") return es[0].checked; if (p.t === "ms") return es.filter(e => e.checked).map(e => e.value);
  const v = es[0].value.trim(); return p.t === "n" ? num(v) : v; };

function pFila(el, r, c) {
  el.innerHTML = `<a class="btn" href="#/colecciones/${esc(c.id)}">← ${esc(c.i)} ${esc(c.n)}</a>
    <form data-f="fila"><label class="ayuda">Nombre</label><input name="n" value="${esc(r.n)}" required autocomplete="off">${c.p.map(p => campo(p, r.v[p.id])).join("")}<label class="ayuda">Página (texto libre, admite Markdown)</label><textarea name="x" rows="8" placeholder="Apuntes, reseña, lo que quieras…">${esc(r.x || "")}</textarea><button class="pri">Guardar</button></form>
    ${r.x && SB.mods.notas && SB.mods.notas.md ? `<article class="card md">${SB.mods.notas.md(r.x)}</article>` : ""}
    <button class="link" data-a="del">Borrar este registro</button>`;
  eventos(el, {
    f: (a, f) => { r.n = f.n.value.trim() || r.n; if (f.x.value.trim()) r.x = f.x.value.replace(/\s+$/, ""); else delete r.x; c.p.forEach(p => { const v = leer(f, p); if (vacioV(v)) delete r.v[p.id]; else r.v[p.id] = v; }); r.m = Date.now(); SB.guardar("colecciones"); location.hash = "#/colecciones/" + c.id; },
    a: a => { if (a === "del" && confirm("¿Borrar «" + r.n + "»? Queda 30 días en la Papelera.")) { D().r = D().r.filter(x => x !== r); SB.guardar("colecciones"); location.hash = "#/colecciones/" + c.id; } }
  });
}

function pProps(el, c) {
  el.innerHTML = `<a class="btn" href="#/colecciones/${esc(c.id)}">← ${esc(c.i)} ${esc(c.n)}</a>
    <section class="card"><form data-f="cab"><div class="fila-b"><input name="i" size="2" value="${esc(c.i)}" aria-label="Ícono"><input name="n" value="${esc(c.n)}" required aria-label="Nombre" autocomplete="off"></div><button>Guardar nombre</button></form></section>
    <section class="card"><h3>Propiedades (las columnas)</h3>${c.p.length ? c.p.map(p => `<form data-f="prop" data-p="${esc(p.id)}"><div class="fila-b"><input name="n" value="${esc(p.n)}" required aria-label="Nombre" autocomplete="off"><small>${esc(TIPOS[p.t])}</small></div>
      ${p.t === "s" || p.t === "ms" ? `<input name="o" value="${esc(p.o.join(", "))}" placeholder="Opciones separadas por coma" autocomplete="off">` : ""}<div class="fila-b"><button>Guardar</button><button type="button" class="x" data-a="del-p" data-p="${esc(p.id)}">Quitar</button></div></form>`).join("") : `<p class="vacio">Todavía no tiene propiedades: además del nombre, agregá las que necesites.</p>`}</section>
    <section class="card"><h3>Nueva propiedad</h3><form data-f="nprop"><input name="n" placeholder="Nombre (ej: Autor)" required autocomplete="off"><select name="t" aria-label="Tipo">${Object.keys(TIPOS).map(k => `<option value="${k}">${TIPOS[k]}</option>`).join("")}</select>
      <input name="o" placeholder="Opciones, separadas por coma (solo selección)" autocomplete="off"><button class="pri">Agregar propiedad</button></form></section>
    <button class="link" data-a="del-c">Borrar la colección y sus registros</button>`;
  const limpiar = p => D().r.forEach(r => { if (r.c !== c.id || r.v[p.id] == null) return; if (p.t === "s" && !p.o.includes(r.v[p.id])) delete r.v[p.id]; else if (p.t === "ms") { r.v[p.id] = r.v[p.id].filter(o => p.o.includes(o)); if (!r.v[p.id].length) delete r.v[p.id]; } });
  eventos(el, {
    f: (a, f) => {
      if (a === "cab") { c.i = f.i.value.trim().slice(0, 4) || c.i; c.n = f.n.value.trim() || c.n; }
      else if (a === "prop") { const p = c.p.find(x => x.id === f.dataset.p); if (!p) return; p.n = f.n.value.trim() || p.n; if (f.o) { p.o = opciones(f.o.value); limpiar(p); } }
      else if (a === "nprop") { const t = f.t.value, n = f.n.value.trim(); if (!n) return; c.p.push({id: uid(), n, t, o: t === "s" || t === "ms" ? opciones(f.o.value) : []}); if (t === "s" && !c.g) c.g = c.p[c.p.length - 1].id; }
      guardar(c); SB.pintar();
    },
    a: (a, b) => {
      if (a === "del-p") { const p = c.p.find(x => x.id === b.dataset.p); if (!p || !confirm("¿Quitar «" + p.n + "»? Se pierden sus valores en todos los registros.")) return; c.p = c.p.filter(x => x !== p); D().r.forEach(r => { if (r.c === c.id) delete r.v[p.id]; }); if (c.g === p.id) c.g = ""; guardar(c); }
      else if (a === "del-c") { if (!confirm("¿Borrar «" + c.n + "» con todos sus registros? Queda 30 días en la Papelera.")) return; D().c = D().c.filter(x => x !== c); D().r = D().r.filter(r => r.c !== c.id); SB.guardar("colecciones"); location.hash = "#/colecciones"; return; }
      SB.pintar();
    }
  });
}

const rotulo = (c, r) => ({t: r.n, s: c.i + " " + c.n, ir: "#/colecciones/r-" + r.id});
SB.registrar({
  id: "colecciones", nombre: "Colecciones", icono: "🗂️", esquema: 1,
  inicial: () => ({c: [], r: []}), migraciones: {},
  sync: [{k: "c", orden: "desc", t: x => x.m || x.k || 0}, {k: "r", orden: "desc", t: x => x.m || x.k || 0}],
  hoy() { const h = ymd(), out = [];
    D().c.forEach(c => { const p = fechaProp(c); if (p) D().r.filter(r => r.c === c.id && r.v[p.id] === h && !hecha(c, r)).forEach(r => out.push(rotulo(c, r))); });
    return out; },
  buscar(q) { const k = norm(q), out = D().c.filter(c => norm(c.n).includes(k)).map(c => ({t: c.i + " " + c.n, s: "colección", ir: "#/colecciones/" + c.id}));
    D().r.forEach(r => { const c = col(r.c); if (c && out.length < 30 && norm(r.n + " " + (r.x || "") + " " + c.p.map(p => mostrar(p, r.v[p.id])).join(" ")).includes(k)) out.push(rotulo(c, r)); });
    return out; },
  avisos() { const h = ymd(), lim = SB.u.sumar(h, 60), out = [];
    D().c.forEach(c => { const p = fechaProp(c); if (p) D().r.forEach(r => { const f = r.c === c.id && r.v[p.id]; if (f && f >= h && f <= lim && !hecha(c, r)) out.push({f, t: r.n, c: c.n, k: "col" + r.id, av: [1], hoy: true}); }); });
    return out; },
  semana() { const d0 = Date.now() - 7 * 864e5, n = D().r.filter(r => r.k >= d0).length;
    return D().c.length ? [D().c.length + (D().c.length === 1 ? " colección" : " colecciones") + " y " + D().r.length + " registros en total." + (n ? " " + n + " nuevos esta semana." : "")] : []; },
  pantalla(el, sub) { sub = sub || ""; let c;
    if (sub.startsWith("r-")) { const r = fila(sub.slice(2)); if (r && col(r.c)) return pFila(el, r, col(r.c)); }
    else if (sub.startsWith("p-")) { c = col(sub.slice(2)); if (c) return pProps(el, c); }
    else if (sub && (c = col(sub))) return pColeccion(el, c);
    pIndice(el); }
});
})();
