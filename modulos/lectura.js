/* Módulo Lectura: tu biblioteca y el seguimiento de cada libro. Cada libro tiene título, autor, género, formato (papel, ebook, audiolibro, PDF), páginas, calificación,
   cuándo lo empezaste y cuándo lo terminaste, y se va actualizando por qué página vas: el avance se ve como porcentaje y se calcula a qué ritmo vas y cuándo lo terminarías.
   Datos: {l: [{id, t título, a autor, g género, f formato, p páginas (o minutos si es audiolibro), pg por dónde va, st q por leer | l leyendo | t leído | x abandonado,
                i inicio AAAA-MM-DD, e fin, n calificación 0-5, r «qué me dejó», c creado, m modificado}],
           h: [{id, l libro, pg página, f fecha, c cuándo se anotó}]}   (un registro de avance por libro y por día)
   Archivos (PDF o EPUB): cada libro puede tener los suyos, en `l.ar: [{id, n nombre, s bytes, t tipo}]`. El archivo en sí es pesado, así que va en su propia base de IndexedDB
   («second_brain_archivos», clave «idLibro|idArchivo») y se queda en este dispositivo: no entra en la sincronización ni en las copias. En los demás dispositivos se ve el nombre y se puede volver a subir. */
(function () {
const {esc, norm, ymd, uid, sumar, dias, eventos} = SB.u, D = () => SB.datos("lectura");
const FORMATOS = ["Papel", "Ebook", "Audiolibro", "PDF"];
const ST = {q: ["Por leer", "📚"], l: ["Leyendo", "📖"], t: ["Leído", "✅"], x: ["Abandonado", "💤"]};
const ORDEN_ST = ["l", "q", "t", "x"];
const libro = id => D().l.find(l => l.id === id);
const unidad = l => l.f === "Audiolibro" ? "min" : "pág.";
const num = n => Number(n || 0).toLocaleString("es-AR");
const dmyl = f => /^\d{4}-\d{2}-\d{2}$/.test(f || "") ? f.slice(8) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4) : "";
const pct = l => l.st === "t" ? 100 : l.p > 0 ? Math.max(0, Math.min(100, Math.round(l.pg / l.p * 100))) : 0;
const estrellas = n => n > 0 ? "★".repeat(n) + "☆".repeat(5 - n) : "";
const log = l => D().h.filter(h => h.l === l.id).sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : a.c - b.c);
const guardar = () => SB.guardar("lectura");

/* ---------- archivos de los libros (solo en este dispositivo) ---------- */
const MAX_ARCHIVO = 300 * 1048576;
const ARCH = (() => {
  let db = null;
  const abrir = () => db ? Promise.resolve(db) : new Promise((ok, no) => { if (typeof indexedDB === "undefined") return no(new Error("sin IndexedDB")); const q = indexedDB.open("second_brain_archivos", 1); q.onupgradeneeded = () => q.result.createObjectStore("f"); q.onsuccess = () => { db = q.result; ok(db); }; q.onerror = () => no(q.error); });
  const tx = (modo, f) => abrir().then(d => new Promise((ok, no) => { const t = d.transaction("f", modo), r = f(t.objectStore("f")); t.oncomplete = () => ok(r && r.result); t.onerror = t.onabort = () => no(t.error || new Error("falló")); }));
  return {poner: (k, b) => tx("readwrite", s => s.put(b, k)), leer: k => tx("readonly", s => s.get(k)), borrar: k => tx("readwrite", s => s.delete(k)), claves: () => tx("readonly", s => s.getAllKeys ? s.getAllKeys() : {result: []})};
})();
const clave = (l, f) => l.id + "|" + f.id;
const tam = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const tipoDe = f => /\.pdf$/i.test(f.name) || f.type === "application/pdf" ? "application/pdf" : /\.epub$/i.test(f.name) || f.type === "application/epub+zip" ? "application/epub+zip" : "";
async function subir(l, files) {
  let n = 0; l.ar = l.ar || [];
  for (const f of Array.from(files || [])) {
    const t = tipoDe(f); if (!t) { SB.aviso("«" + f.name + "» no es un PDF ni un EPUB"); continue; }
    if (f.size > MAX_ARCHIVO) { SB.aviso("«" + f.name + "» pesa más de " + tam(MAX_ARCHIVO)); continue; }
    const a = {id: uid(), n: f.name.slice(0, 160), s: f.size, t};
    try { await ARCH.poner(clave(l, a), new Blob([f], {type: t})); l.ar.push(a); n++; } catch (e) { SB.aviso("No se pudo guardar «" + f.name + "»: " + (e && e.name === "QuotaExceededError" ? "no hay espacio" : "el navegador no lo permitió")); }
  }
  if (n) { l.m = Date.now(); guardar(); }
  return n;
}
async function abrirArchivo(l, a, w) {
  const desc = url => { const x = document.createElement("a"); x.href = url; x.download = a.n; document.body.appendChild(x); x.click(); x.remove(); };
  try {
    const b = await ARCH.leer(clave(l, a)); if (!b) { if (w) w.close(); SB.aviso("Este archivo no está en este dispositivo. Subilo de nuevo."); return false; }
    const url = URL.createObjectURL(b); setTimeout(() => URL.revokeObjectURL(url), 120000);
    if (w) w.location.href = url; else desc(url); return true;
  } catch (e) { if (w) w.close(); SB.aviso("No se pudo abrir el archivo"); return false; }
}
/* al arrancar: tira los archivos de libros que ya no existen (ni están en la Papelera) */
SB.alArrancar.push(() => { try {
  const vivos = new Set(D().l.map(l => l.id)); ((SB.datos("papelera") || {x: []}).x || []).forEach(e => { if (e.m === "lectura" && e.k === "l" && e.i) vivos.add(e.i.id); });
  ARCH.claves().then(ks => (ks || []).forEach(k => { if (String(k).includes("|") && !vivos.has(String(k).split("|")[0])) ARCH.borrar(k).catch(() => {}); })).catch(() => {});
} catch (e) {} });

function crear(t, st, extra) {
  const l = Object.assign({id: uid(), t: String(t).trim().slice(0, 140) || "Sin título", a: "", g: "", f: "Papel", p: 0, pg: 0, st: st || "q", i: "", e: "", n: 0, r: "", c: Date.now(), m: Date.now()}, extra || {});
  if (l.st === "l" && !l.i) l.i = ymd();
  if (l.st === "t" && !l.e) l.e = ymd();
  D().l.unshift(l); guardar(); return l;
}
/* anota por dónde vas (uno por día y por libro); si pasás de la última página, queda como leído */
function anotar(l, pg) {
  const hoy = ymd(); pg = Math.max(0, Math.round(+pg || 0)); if (l.p > 0) pg = Math.min(pg, l.p);
  l.pg = pg; l.m = Date.now();
  if (pg > 0 && (l.st === "q" || l.st === "x")) { l.st = "l"; if (!l.i) l.i = hoy; }
  if (l.st === "t" && l.p > 0 && pg < l.p) { l.st = "l"; l.e = ""; }
  const h = D().h.find(x => x.l === l.id && x.f === hoy);
  if (h) { h.pg = pg; h.c = Date.now(); } else D().h.push({id: uid(), l: l.id, pg, f: hoy, c: Date.now()});
  if (l.p > 0 && pg >= l.p) terminar(l, true);
  guardar(); return l;
}
function terminar(l, sinGuardar) {
  const hoy = ymd(); l.st = "t"; l.i = l.i || hoy; l.e = l.e || hoy; l.m = Date.now();
  if (l.p > 0 && l.pg !== l.p) { l.pg = l.p; const h = D().h.find(x => x.l === l.id && x.f === hoy); if (h) h.pg = l.p; else D().h.push({id: uid(), l: l.id, pg: l.p, f: hoy, c: Date.now()}); }
  if (!sinGuardar) guardar(); return l;
}
const empezar = l => { l.st = "l"; l.i = l.i || ymd(); l.e = ""; l.m = Date.now(); guardar(); return l; };
/* cuántas páginas leíste desde una fecha (de cada anotación sale la diferencia con la anterior; los audiolibros van aparte porque cuentan minutos) */
function porDia() {
  const m = {};
  D().l.filter(l => l.f !== "Audiolibro").forEach(l => { let ant = null; log(l).forEach(h => { const base = ant === null ? (l.i === h.f ? 0 : h.pg) : ant, d = Math.max(0, h.pg - base); if (d) m[h.f] = (m[h.f] || 0) + d; ant = h.pg; }); });
  return m;
}
const leidas = desde => { const m = porDia(); return Object.keys(m).filter(f => f >= desde).reduce((t, f) => t + m[f], 0); };
/* metas: libros por año y páginas por día (si no hay meta diaria, la racha cuenta los días con alguna página) */
const meta = () => D().meta || (D().meta = {libros: 0, pags: 0});
function racha() {
  const m = porDia(), min = Math.max(1, meta().pags || 1); let f = ymd(), n = 0; if ((m[f] || 0) < min) f = sumar(f, -1);
  while ((m[f] || 0) >= min && n < 800) { n++; f = sumar(f, -1); }
  return n;
}
function ritmoAnual() {
  const m = meta().libros, hoy = ymd(), anio = +hoy.slice(0, 4), hechos = D().l.filter(l => l.st === "t" && (l.e || "").startsWith(String(anio))).length;
  if (!(m > 0)) return null;
  const ini = anio + "-01-01", transc = dias(hoy, ini) + 1, total = (anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)) ? 366 : 365, esperado = m * transc / total, falta = m - hechos;
  return {hechos, meta: m, esperado, falta, cada: falta > 0 ? Math.max(1, Math.round((total - transc) / falta)) : 0, estado: hechos >= m ? "listo" : hechos + 0.5 >= esperado ? (hechos > esperado + 0.5 ? "adelantado" : "alDia") : "atrasado"};
}
/* ---------- importar una biblioteca (pegada o desde un CSV; entiende también el CSV de Goodreads) ---------- */
function filasCSV(txt) {
  const t = String(txt || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), prim = t.split("\n").find(x => x.trim()) || "";
  const cuenta = c => { let n = 0, q = false; for (const ch of prim) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } return n; };
  const sep = ["\t", ";", ","].map(c => [c, cuenta(c)]).sort((a, b) => b[1] - a[1])[0], d = sep[1] ? sep[0] : "";
  const filas = []; let fila = [], cel = "", q = false;
  const cerrar = () => { fila.push(cel.trim()); cel = ""; };
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; }
    else if (ch === '"') q = true; else if (d && ch === d) cerrar(); else if (ch === "\n") { cerrar(); if (fila.some(x => x)) filas.push(fila); fila = []; } else cel += ch; }
  cerrar(); if (fila.some(x => x)) filas.push(fila);
  return {filas, sep: d};
}
const COLS = {t: ["titulo", "title", "libro", "nombre", "book"], a: ["autor", "author", "autora"], p: ["paginas", "pages", "number of pages", "paginas totales", "n paginas"], f: ["formato", "format", "binding", "tipo"], g: ["genero", "clasificacion", "categoria", "genre", "tema"], st: ["estado", "status", "exclusive shelf", "shelf", "bookshelves"], n: ["calificacion", "rating", "my rating", "puntaje", "nota", "estrellas"], i: ["empece", "inicio", "empezado", "started", "date started", "fecha de inicio"], e: ["termine", "fin", "terminado", "date read", "finished", "fecha de fin", "leido el"]};
const fechaImp = v => { v = String(v || "").trim(); let m = v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/); if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); return ""; };
const estadoImp = v => { const x = norm(v); return /leid|termin|finaliz|\bread\b|complet/.test(x) && !/to-read|por leer/.test(x) ? "t" : /leyendo|en curso|currently|reading|actual/.test(x) ? "l" : /abandon|dej/.test(x) ? "x" : "q"; };
const formatoImp = v => { const x = norm(v); return /audio/.test(x) ? "Audiolibro" : /epub|ebook|kindle|digital|electr/.test(x) ? "Ebook" : /pdf/.test(x) ? "PDF" : "Papel"; };
const notaImp = v => { const s = String(v || ""), est = (s.match(/[★⭐]/g) || []).length; if (est) return Math.min(5, est); const n = parseFloat(s.replace(",", ".")); return n > 0 ? Math.min(5, Math.round(n)) : 0; };
function parsear(txt) {
  const {filas, sep} = filasCSV(txt); if (!filas.length) return [];
  let mapa = null; const enc = filas[0].map(x => norm(x).replace(/[^a-z0-9 ]/g, "").trim());
  if (enc.some(x => COLS.t.includes(x))) { mapa = {}; Object.keys(COLS).forEach(k => { const i = enc.findIndex(x => COLS[k].includes(x)); if (i >= 0) mapa[k] = i; }); filas.shift(); }
  else mapa = {t: 0, a: 1, p: 2, f: 3, g: 4};
  return filas.map(f => {
    let t = f[mapa.t] || "", a = mapa.a !== undefined ? f[mapa.a] || "" : "";
    if (!sep && !a) { const x = t.split(/\s+[-–—]\s+/); t = x[0]; a = (x[1] || "").trim(); }
    const g = k => mapa[k] !== undefined ? f[mapa[k]] || "" : "", st = g("st") ? estadoImp(g("st")) : (fechaImp(g("e")) ? "t" : "q");
    return {t: t.trim(), a: a.trim(), p: Math.max(0, Math.round(parseFloat(String(g("p")).replace(/[^\d.,]/g, "").replace(",", ".")) || 0)), f: formatoImp(g("f")), g: g("g").trim(), st, n: notaImp(g("n")), i: fechaImp(g("i")), e: fechaImp(g("e"))};
  }).filter(r => r.t);
}
function importar(txt) {
  const filas = parsear(txt), ya = new Set(D().l.map(l => norm(l.t + "|" + l.a))); let n = 0, rep = 0;
  filas.forEach(r => { const k = norm(r.t + "|" + r.a); if (ya.has(k)) { rep++; return; } ya.add(k);
    const l = crear(r.t, r.st, {a: r.a.slice(0, 80), g: r.g.slice(0, 60), f: r.f, p: r.p, n: r.n, i: r.i, e: r.st === "t" ? r.e : ""});
    if (l.st === "t" && l.p) l.pg = l.p; if (l.st !== "t") l.e = ""; n++; });
  if (n) guardar();
  return {n, rep, total: filas.length};
}
/* a qué ritmo vas (páginas por día entre tu primera y tu última anotación) y cuándo lo terminarías */
function ritmo(l) {
  const h = log(l); if (h.length < 2 || !(l.p > 0)) return null;
  const d = Math.max(1, dias(h[h.length - 1].f, h[0].f)), ganadas = h[h.length - 1].pg - h[0].pg; if (ganadas <= 0) return null;
  const r = ganadas / d, falta = l.p - l.pg; if (falta <= 0) return null;
  return {porDia: Math.max(1, Math.round(r)), fin: sumar(ymd(), Math.ceil(falta / r))};
}
const leyoHoy = l => D().h.some(h => h.l === l.id && h.f === ymd());
const barra = l => `<progress value="${pct(l)}" max="100" aria-label="Avance ${pct(l)} por ciento"></progress>`;
const detalleAvance = l => l.p > 0 ? `${pct(l)} % · ${unidad(l)} ${num(l.pg)} de ${num(l.p)}` : l.st === "l" ? `${unidad(l)} ${num(l.pg)} · cargá el total para ver el porcentaje` : "";

SB.registrar({
  id: "lectura", nombre: "Lectura", icono: "📖", esquema: 1,
  inicial: () => ({l: [], h: []}), migraciones: {},
  sync: [{k: "l", orden: "asc", t: x => x.m || x.c || 0}, {k: "h", orden: "desc", t: x => x.c || 0}],
  util: {crear, anotar, terminar, empezar, pct, leidas, ritmo, porDia, racha, meta, ritmoAnual, parsear, importar},
  captura: {etiqueta: "Libro", guardar: t => { const p = String(t).split(/\s+[-–—]\s+/); crear(p[0], "q", p[1] ? {a: p[1].trim().slice(0, 80)} : null); }},
  hoy() { const pm = meta().pags, hp = porDia()[ymd()] || 0, extra = pm > 0 && hp < pm ? [{t: "Leer " + pm + " páginas hoy", s: (hp ? "Llevás " + hp + " de " + pm : "Tu meta de lectura del día") + (racha() ? " · racha de " + racha() + (racha() === 1 ? " día" : " días") : ""), ir: "#/lectura"}] : [];
    return extra.concat(D().l.filter(l => l.st === "l" && !leyoHoy(l)).slice(0, 3).map(l => ({t: "Seguí con «" + l.t + "»", s: detalleAvance(l), ir: "#/lectura/" + l.id}))); },
  buscar(q) { const nq = norm(q); return D().l.filter(l => norm([l.t, l.a, l.g, l.r].join(" ")).includes(nq)).slice(0, 12).map(l => ({t: l.t, s: [l.a, ST[l.st][0]].filter(Boolean).join(" · "), ir: "#/lectura/" + l.id})); },
  semana() {
    const d = leidas(sumar(ymd(), -6)), ter = D().l.filter(l => l.st === "t" && l.e >= sumar(ymd(), -6)), ahora = D().l.filter(l => l.st === "l").length;
    return [d ? "Leíste " + num(d) + (d === 1 ? " página" : " páginas") + " en los últimos 7 días." : ahora ? "No anotaste avance de lectura en los últimos 7 días." : "No tenés ningún libro en curso.", ter.length ? "Terminaste " + ter.map(l => "«" + l.t + "»").join(", ") + "." : "", racha() > 1 ? "Racha de lectura: " + racha() + " días seguidos." : "", (() => { const r = ritmoAnual(); return r ? (r.estado === "listo" ? "Ya cumpliste tu meta del año (" + r.meta + " libros)." : "Meta del año: " + r.hechos + " de " + r.meta + " libros" + (r.estado === "atrasado" ? ", vas un poco atrás." : ".")) : ""; })()].filter(Boolean);
  },
  pantalla(el, sub) { const l = sub ? libro(String(sub).split("/")[0]) : null; if (sub && !l) { location.hash = "#/lectura"; return; } return l ? detalle(el, l) : inicio(el); }
});

let FILTRO = "", BUSCA = "";
function metas(ter, pags, sem) {
  const m = meta(), r = ritmoAnual(), hp = porDia()[ymd()] || 0, rc = racha(), anio = ymd().slice(0, 4);
  const lineas = [];
  if (r) lineas.push(`<p style="margin:0 0 4px"><b>${r.hechos}</b> de ${r.meta} libros en ${anio}</p><progress value="${Math.min(100, Math.round(r.hechos / r.meta * 100))}" max="100" aria-label="Meta del año"></progress><small>${r.estado === "listo" ? "¡Meta cumplida! 🎉" : r.estado === "adelantado" ? "Vas adelantado: ya deberías llevar " + Math.floor(r.esperado) + "." : r.estado === "alDia" ? "Vas al día." : "Vas un poco atrás: un libro cada " + r.cada + " días te lleva a la meta."}</small>`);
  else if (ter.length) lineas.push(`<p style="margin:0"><b>${ter.length}</b> ${ter.length === 1 ? "libro terminado" : "libros terminados"} en ${anio}${pags ? " · " + num(pags) + " páginas" : ""}</p>`);
  if (m.pags > 0) lineas.push(`<p style="margin:10px 0 4px">Hoy: <b>${num(hp)}</b> de ${num(m.pags)} páginas${hp >= m.pags ? " ✓" : ""}</p><progress value="${Math.min(100, Math.round(hp / m.pags * 100))}" max="100" aria-label="Meta de hoy"></progress>`);
  if (rc > 0) lineas.push(`<p style="margin:10px 0 0">🔥 Racha: <b>${rc}</b> ${rc === 1 ? "día" : "días"} seguidos</p>`);
  if (sem) lineas.push(`<small>${num(sem)} páginas en los últimos 7 días</small>`);
  return `<section class="card"><h3>🎯 Tu lectura</h3>${lineas.join("") || `<p class="ayuda" style="margin:0 0 6px">Poné una meta y mirá cómo avanzás.</p>`}
    <details><summary>Mis metas</summary><div class="fila-b"><label class="tx lt">Libros por año<input type="number" min="0" inputmode="numeric" data-c="meta" data-k="libros" value="${m.libros || ""}" placeholder="Ej: 12"></label><label class="tx lt">Páginas por día<input type="number" min="0" inputmode="numeric" data-c="meta" data-k="pags" value="${m.pags || ""}" placeholder="Ej: 20"></label></div></details></section>`;
}
function inicio(el) {
  const anio = ymd().slice(0, 4), ter = D().l.filter(l => l.st === "t" && (l.e || "").startsWith(anio)), pags = ter.filter(l => l.f !== "Audiolibro").reduce((s, l) => s + (l.p || 0), 0), sem = leidas(sumar(ymd(), -6));
  const fila = l => `<div class="fila"><a class="tx cr" href="#/lectura/${esc(l.id)}"><span><b>${esc(l.t)}</b></span><small>${[l.a, l.f !== "Papel" ? l.f : "", l.g, l.st === "t" && l.e ? "terminado el " + dmyl(l.e) : "", (l.ar || []).length ? "📎" : ""].filter(Boolean).map(esc).join(" · ")}${l.n ? ` <span class="est">${estrellas(l.n)}</span>` : ""}</small></a></div>`;
  const enCurso = l => `<div class="fila lcur"><div class="tx"><a class="cr" href="#/lectura/${esc(l.id)}"><span><b>${esc(l.t)}</b></span></a><small>${esc([l.a, l.f !== "Papel" ? l.f : ""].filter(Boolean).join(" · "))}</small>${barra(l)}<small>${esc(detalleAvance(l))}</small>
    <form data-f="avance" data-id="${esc(l.id)}" class="fila-b lav"><input name="pg" type="number" inputmode="numeric" min="0"${l.p ? ` max="${l.p}"` : ""} placeholder="${l.f === "Audiolibro" ? "Minuto actual" : "Página actual"}" aria-label="Por dónde vas" required><button class="pri chico">Actualizar</button></form></div></div>`;
  const nq = norm(BUSCA), vis = D().l.filter(l => (!FILTRO || l.st === FILTRO) && (!nq || norm([l.t, l.a, l.g].join(" ")).includes(nq)));
  const secciones = ORDEN_ST.map(st => { let ls = vis.filter(l => l.st === st); if (!ls.length) return "";
    ls = st === "t" ? ls.sort((a, b) => (b.e || "").localeCompare(a.e || "")) : st === "l" ? ls.sort((a, b) => b.m - a.m) : ls.sort((a, b) => b.c - a.c);
    return `<section class="card"><h3>${ST[st][1]} ${ST[st][0]} <small>${ls.length}</small></h3>${ls.map(st === "l" ? enCurso : fila).join("")}</section>`; }).join("");
  el.innerHTML = `${metas(ter, pags, sem)}
    <details class="card"${D().l.length ? "" : " open"}><summary><b>＋ Agregar libro</b></summary><form data-f="nuevo" class="lform"><input name="t" placeholder="Título del libro" autocomplete="off" required><input name="a" placeholder="Autor" autocomplete="off">
      <div class="fila-b"><input name="p" type="number" inputmode="numeric" min="1" placeholder="Páginas"><select name="f" aria-label="Formato">${FORMATOS.map(f => `<option>${f}</option>`).join("")}</select><select name="st" aria-label="Estado"><option value="q">Por leer</option><option value="l">Leyendo ahora</option><option value="t">Ya lo leí</option></select></div>
      <button class="pri">Agregar a la biblioteca</button></form></details>
    <details class="card"><summary><b>📥 Importar mi biblioteca</b></summary><form data-f="importar"><p class="ayuda" style="margin:0 0 8px">Pegá una lista (un libro por línea, «Título - Autor») o una tabla con columnas como título, autor, páginas, formato, género, estado, calificación, inicio y fin. También entiende el CSV de Goodreads.</p>
      <textarea name="txt" rows="6" placeholder="Rayuela - Julio Cortázar&#10;El Aleph - Jorge Luis Borges"></textarea><label class="btn lsub">📄 O elegir un archivo CSV o TXT<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden data-c="csv"></label><button class="pri" style="margin-top:10px">Importar libros</button></form></details>
    ${D().l.length ? `<input type="search" id="lq" placeholder="Buscar por título, autor o género…" value="${esc(BUSCA)}" autocomplete="off"><div class="chips" role="group" aria-label="Estado">${[["", "Todos"]].concat(ORDEN_ST.map(s => [s, ST[s][0]])).map(([s, n]) => `<button type="button" class="chip${FILTRO === s ? " on" : ""}" data-a="filtro" data-v="${s}">${n}${s ? " " + D().l.filter(l => l.st === s).length : ""}</button>`).join("")}</div>` : ""}
    <div id="lb">${secciones || `<p class="vacio">${D().l.length ? "Ningún libro coincide." : "Tu biblioteca está vacía.<br>Cargá el primer libro arriba: con las páginas totales ves el avance en porcentaje."}</p>`}</div>`;
  const q = el.querySelector("#lq"); if (q) q.oninput = e => { BUSCA = e.target.value; SB.pintar(); const n = document.getElementById("lq"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  eventos(el, {
    f: (a, f) => {
      if (a === "nuevo") { const p = Math.round(+f.p.value) || 0, l = crear(f.t.value, f.st.value, {a: f.a.value.trim().slice(0, 80), p, f: f.f.value}); if (l.st === "t" && p) l.pg = p; guardar(); SB.pintar(); }
      else if (a === "importar") { const x = importar(f.txt.value); SB.aviso(resumenImp(x)); SB.pintar(); }
      else if (a === "avance") { const l = libro(f.dataset.id); if (l) { const fin = anotar(l, f.pg.value).st === "t"; if (fin) SB.aviso("¡Terminaste «" + l.t + "»! 🎉"); SB.pintar(); } }
    },
    c: (a, n) => {
      if (a === "meta") { meta()[n.dataset.k] = Math.max(0, Math.round(+n.value) || 0); guardar(); SB.pintar(); }
      else if (a === "csv" && n.files && n.files[0]) { const f = n.files[0], r = new FileReader(); r.onload = () => { const x = importar(r.result); SB.aviso(resumenImp(x)); SB.pintar(); }; r.readAsText(f); n.value = ""; }
    },
    a: (a, b) => { if (a === "filtro") { FILTRO = b.dataset.v; SB.pintar(); } }
  });
}
const resumenImp = x => !x.total ? "No encontré libros para importar" : x.n ? "Se cargaron " + x.n + (x.n === 1 ? " libro" : " libros") + (x.rep ? " (" + x.rep + " ya estaban)" : "") : "Esos libros ya estaban en tu biblioteca";

function detalle(el, l) {
  const r = ritmo(l), hs = log(l).slice().reverse(), campo = (k, t, v, extra) => `<div class="fld"><label class="lt" for="c-${k}">${t}</label>${extra || `<input id="c-${k}" data-c="campo" data-k="${k}" value="${esc(v)}" autocomplete="off">`}</div>`;
  const acciones = l.st === "q" ? `<button type="button" class="pri chico" data-a="empezar">📖 Empezar a leer</button>` : l.st === "l" ? `<button type="button" class="pri chico" data-a="terminar">✅ Lo terminé</button><button type="button" data-a="abandonar">💤 Lo dejé</button>` : l.st === "x" ? `<button type="button" class="pri chico" data-a="empezar">📖 Retomarlo</button>` : `<button type="button" data-a="empezar">📖 Volver a leerlo</button>`;
  el.innerHTML = `<div class="fila-b barra"><a class="btn" href="#/lectura">← Biblioteca</a><button type="button" class="x" data-a="borrar">Borrar</button></div>
    <h2 class="fecha">${esc(l.t)}</h2>
    <section class="card"><p class="sub" style="margin:0">${ST[l.st][1]} ${ST[l.st][0]}${l.a ? " · " + esc(l.a) : ""}</p>
      <p class="lpct">${pct(l)} <span>%</span></p>${barra(l)}<small>${esc(detalleAvance(l)) || "Cargá el total de páginas (abajo) para ver el porcentaje."}</small>
      ${l.p > 0 && l.st !== "t" && l.p - l.pg > 0 ? `<small>Te ${l.p - l.pg === 1 ? "falta" : "faltan"} ${num(l.p - l.pg)} ${l.f === "Audiolibro" ? "minutos" : l.p - l.pg === 1 ? "página" : "páginas"}.${r ? " A tu ritmo (unas " + r.porDia + " " + unidad(l) + " por día) lo terminás hacia el " + dmyl(r.fin) + "." : ""}</small>` : ""}
      ${l.st === "t" ? `<small>${l.i ? "Empezado el " + dmyl(l.i) + ". " : ""}Terminado el ${esc(dmyl(l.e)) || "—"}${l.i && l.e ? " (" + (dias(l.e, l.i) + 1) + (dias(l.e, l.i) === 0 ? " día" : " días") + ")" : ""}.</small>` : ""}
      ${l.st !== "t" ? `<form data-f="avance" class="fila-b lav" style="margin-top:12px"><input name="pg" type="number" inputmode="numeric" min="0"${l.p ? ` max="${l.p}"` : ""} placeholder="${l.f === "Audiolibro" ? "Minuto actual" : "Página actual"}" aria-label="Por dónde vas" required><button class="pri chico">Actualizar</button></form>` : ""}
      <div class="fila-b" style="margin-top:10px">${acciones}</div></section>
    <section class="card"><h3>Datos del libro</h3>
      ${campo("t", "Título", l.t)}${campo("a", "Autor", l.a)}${campo("g", "Género o clasificación", l.g)}
      ${campo("f", "Formato", "", `<select id="c-f" data-c="campo" data-k="f">${FORMATOS.map(f => `<option${l.f === f ? " selected" : ""}>${f}</option>`).join("")}</select>`)}
      ${campo("p", l.f === "Audiolibro" ? "Duración total (minutos)" : "Páginas", "", `<input id="c-p" data-c="campo" data-k="p" type="number" inputmode="numeric" min="0" value="${l.p || ""}">`)}
      ${campo("n", "Mi calificación", "", `<select id="c-n" data-c="campo" data-k="n"><option value="0">Sin calificar</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${l.n === n ? " selected" : ""}>${estrellas(n)}</option>`).join("")}</select>`)}
      ${campo("i", "Lo empecé el", "", `<input id="c-i" data-c="campo" data-k="i" type="date" value="${esc(l.i)}">`)}
      ${campo("e", "Lo terminé el", "", `<input id="c-e" data-c="campo" data-k="e" type="date" value="${esc(l.e)}">`)}
      <small>Se guarda solo.</small></section>
    <section class="card"><h3>💭 Qué me dejó</h3><textarea data-c="campo" data-k="r" rows="4" placeholder="Ideas, frases, lo que aprendiste…" aria-label="Qué me dejó">${esc(l.r)}</textarea></section>
    <section class="card"><h3>📎 Archivos</h3>
      ${(l.ar || []).map(a => `<div class="fila" data-fid="${esc(a.id)}"><div class="tx"><span>${a.t === "application/pdf" ? "📕" : "📗"} ${esc(a.n)}</span><small>${tam(a.s)} · ${a.t === "application/pdf" ? "PDF" : "EPUB"}<span class="afa"></span></small></div><button type="button" data-a="abrirf" data-id="${esc(a.id)}">${a.t === "application/pdf" ? "Abrir" : "Descargar"}</button><button type="button" class="x" data-a="quitarf" data-id="${esc(a.id)}" aria-label="Quitar archivo">✕</button></div>`).join("") || `<p class="ayuda" style="margin:0 0 8px">Guardá acá el PDF o el EPUB del libro para tenerlo a mano.</p>`}
      <label class="btn lsub">＋ Subir PDF o EPUB<input type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" multiple hidden data-c="subir"></label>
      <small style="margin-top:8px">Los archivos pesan, así que quedan solo en este dispositivo: no se sincronizan ni entran en las copias. En los otros ves el nombre y podés volver a subirlo.</small></section>
    ${hs.length ? `<section class="card"><h3>Historial de avance</h3>${hs.map(h => `<div class="fila"><div class="tx"><span>${unidad(l)} ${num(h.pg)}${l.p > 0 ? " · " + Math.round(h.pg / l.p * 100) + " %" : ""}</span><small>${esc(dmyl(h.f))}</small></div><button type="button" class="x" data-a="hdel" data-id="${esc(h.id)}" aria-label="Quitar esta anotación">✕</button></div>`).join("")}</section>` : ""}`;
  (l.ar || []).forEach(a => ARCH.leer(clave(l, a)).then(b => { if (!b) { const x = el.querySelector && el.querySelector('[data-fid="' + a.id + '"] .afa'); if (x) x.textContent = " · no está en este dispositivo"; } }).catch(() => {}));
  eventos(el, {
    f: (a, f) => { if (a === "avance") { const fin = anotar(l, f.pg.value).st === "t"; if (fin) SB.aviso("¡Terminaste «" + l.t + "»! 🎉"); SB.pintar(); } },
    c: (a, n) => { if (a === "subir") return subir(l, n.files).then(c => { n.value = ""; if (c) SB.aviso(c === 1 ? "Archivo guardado" : c + " archivos guardados"); SB.pintar(); });
      if (a !== "campo") return; const k = n.dataset.k; let v = n.value;
      if (k === "p") { l.p = Math.max(0, Math.round(+v) || 0); if (l.p && l.pg > l.p) l.pg = l.p; }
      else if (k === "n") l.n = Math.max(0, Math.min(5, +v || 0));
      else if (k === "t") l.t = v.trim() || l.t; else if (k === "a" || k === "g" || k === "f" || k === "i" || k === "e") l[k] = v.trim(); else if (k === "r") l.r = v;
      l.m = Date.now(); guardar(); if (k === "p" || k === "f" || k === "t") SB.pintar(); },
    a: (a, b) => {
      if (a === "empezar") { empezar(l); SB.pintar(); }
      else if (a === "terminar") { terminar(l); SB.aviso("¡Terminaste «" + l.t + "»! 🎉"); SB.pintar(); }
      else if (a === "abandonar") { l.st = "x"; l.m = Date.now(); guardar(); SB.pintar(); }
      else if (a === "hdel") { D().h = D().h.filter(h => h.id !== b.dataset.id); const u = log(l).pop(); l.pg = u ? u.pg : 0; l.m = Date.now(); guardar(); SB.pintar(); }
      else if (a === "abrirf") { const f = (l.ar || []).find(x => x.id === b.dataset.id); if (f) abrirArchivo(l, f, f.t === "application/pdf" ? window.open("", "_blank") : null); }
      else if (a === "quitarf") { const f = (l.ar || []).find(x => x.id === b.dataset.id); if (f && confirm("¿Quitar «" + f.n + "» de este dispositivo?")) { ARCH.borrar(clave(l, f)).catch(() => {}); l.ar = l.ar.filter(x => x !== f); l.m = Date.now(); guardar(); SB.pintar(); } }
      else if (a === "borrar") { D().h = D().h.filter(h => h.l !== l.id); D().l = D().l.filter(x => x.id !== l.id); guardar(); SB.aviso("Borrado. Lo podés recuperar en la Papelera"); location.hash = "#/lectura"; }
    }
  });
}
})();
