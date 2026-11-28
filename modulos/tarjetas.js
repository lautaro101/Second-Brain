/* Módulo Tarjetas y exámenes. Datos (esquema 1):
   z mazos       {id, n nombre, m id de materia de Estudio (opcional), c creado}
   t tarjetas    {id, z mazo, t frente, a dorso, tp «d» definición | «p» pregunta | «c» completar | «s» sección | «m» a mano o importada, c creada,
                  ef facilidad (2,5), it intervalo en días, rp repasos seguidos bien, v próximo repaso AAAA-MM-DD, ul último repaso, pr primer repaso, ll veces que fallaste}
   mt materiales {id, z mazo, n nombre, x texto leído (hasta 100.000 caracteres), c creado}
   ex exámenes   {id, n título, z mazo, f fecha, p preguntas, ok aciertos, nota sobre 10, mal [ids de tarjetas falladas], c}
   rv {AAAA-MM-DD: [tarjetas repasadas, bien]}   np tarjetas nuevas por día
   Sin inteligencia artificial: las tarjetas salen de buscar en el texto definiciones («Término: explicación»), preguntas con su respuesta, frases con una palabra clave para completar (en negrita,
   un año, una cifra, una sigla o un nombre propio) y, si querés, secciones con título. Sirve mucho con apuntes ordenados y bastante menos con prosa corrida: por eso las propuestas se revisan antes de guardarlas.
   Los archivos .txt, .md, .docx y .pdf se leen en este dispositivo; el PDF usa PDF.js (vendor/pdfjs), que se descarga recién cuando importás un PDF. */
(function () {
const {esc, norm, ymd, uid, sumar, dmy, eventos} = SB.u, D = () => SB.datos("tarjetas");
const MAXTX = 100000, MAXARCH = 15 * 1024 * 1024;
const TIPOS = {d: "Definición", p: "Pregunta", c: "Completar", s: "Sección", m: "Manual", i: "IA"};

/* ======================= lectores de archivos ======================= */
const ents = {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'"};
const desXml = s => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e) => ents[e.toLowerCase()] || (e[1] && e[1].toLowerCase() === "x" ? String.fromCodePoint(parseInt(e.slice(2), 16) || 32) : /^#\d+$/.test(e) ? String.fromCodePoint(+e.slice(1) || 32) : m));
async function inflar(datos) {   // deflate sin cabecera, con lo que trae el navegador (Chrome 80+, Safari 16.4+, Firefox 113+)
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no puede abrir archivos .docx. Guardalo como .txt o actualizá el navegador.");
  return new Uint8Array(await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
}
/* Un .docx es un zip: buscamos word/document.xml en el directorio central. */
async function leerZip(u8, nombre) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let fin = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("El archivo no es un .docx válido.");
  let p = v.getUint32(fin + 16, true); const n = v.getUint16(fin + 10, true), dec = new TextDecoder();
  for (let k = 0; k < n && p + 46 <= u8.length && v.getUint32(p, true) === 0x02014b50; k++) {
    const met = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true), nom = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    if (nom === nombre) { const ini = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), dat = u8.subarray(ini, ini + csz); return met === 0 ? dat : met === 8 ? await inflar(dat) : Promise.reject(new Error("Compresión no compatible")); }
    p += 46 + nl + el + cl;
  }
  throw new Error("No encontré el texto dentro del .docx.");
}
/* Del XML de Word al texto: títulos como «# », listas como «- », negrita como «**», filas de tabla de 2 columnas como «término: definición». */
function docxATexto(xml) {
  const celda = c => c.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, m => parrafo(m)).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const parrafo = p => {
    const est = (/<w:pStyle w:val="([^"]+)"/.exec(p) || [])[1] || "", tit = /^(?:heading|t[ií]?tulo|ttulo)\s*(\d)/i.exec(est), lista = /<w:numPr>/.test(p) || /^(?:list|prrafo?delista|p[aá]rrafo ?de ?lista)/i.test(est);
    let t = ""; p.replace(/<w:r[ >][\s\S]*?<\/w:r>/g, r => { const b = /<w:b\/>|<w:b w:val="(?:1|true)"\/>/.test(r), tx = (r.match(/<w:t[ >][^]*?<\/w:t>|<w:tab\/>|<w:br\/>/g) || []).map(x => x === "<w:tab/>" ? " " : x === "<w:br/>" ? "\n" : desXml(x.replace(/<[^>]+>/g, ""))).join(""); t += tx && b && tx.trim() ? "**" + tx + "**" : tx; return ""; });
    t = t.replace(/\*\*\s*\*\*/g, "").replace(/\*\*(\s+)\*\*/g, "$1");
    return (tit ? "#".repeat(Math.min(6, +tit[1] || 1)) + " " : lista && t.trim() ? "- " : "") + t.trim();
  };
  xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tb => (tb.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(tr => { const cs = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(celda).filter(Boolean); return cs.length === 2 ? "<w:p><w:r><w:t>" + cs[0] + ": " + cs[1] + "</w:t></w:r></w:p>" : cs.length ? "<w:p><w:r><w:t>" + cs.join(" | ") + "</w:t></w:r></w:p>" : ""; }).join(""));
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(parrafo).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function leerDocx(u8) { return docxATexto(new TextDecoder().decode(await leerZip(u8, "word/document.xml"))); }
const cargarPdfjs = async () => window.__pdfjs ? window.__pdfjs : import(new URL("vendor/pdfjs/pdf.min.mjs", document.baseURI).href).then(lib => { lib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", document.baseURI).href; return lib; });
async function leerPdf(u8) {
  const lib = await cargarPdfjs().catch(() => { throw new Error("No pude cargar el lector de PDF (la primera vez hace falta conexión). Probá con un .docx o .txt, o pegá el texto."); }), doc = await lib.getDocument({data: u8, isEvalSupported: false}).promise, pag = [];
  for (let i = 1; i <= doc.numPages && i <= 300; i++) {
    const tc = await (await doc.getPage(i)).getTextContent(); let l = "", y = null; const ls = [];
    for (const it of tc.items) { if (!("str" in it)) continue; const yy = it.transform ? it.transform[5] : 0; if (y !== null && Math.abs(yy - y) > 3 && l) { ls.push(l); l = ""; } l += it.str; y = yy; if (it.hasEOL) { ls.push(l); l = ""; y = null; } }
    if (l) ls.push(l); pag.push(ls.map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  }
  const t = pag.join("\n\n").trim(); if (!t) throw new Error("Este PDF no tiene texto seleccionable (¿es un escaneo?). Probá copiar el texto o usar otro archivo.");
  return t;
}
async function leerArchivo(file) {
  const nom = file.name || "material", ext = (nom.split(".").pop() || "").toLowerCase();
  if (file.size > MAXARCH) throw new Error("El archivo pesa más de 15 MB.");
  if (["txt", "md", "markdown", "csv", "tsv"].includes(ext) || (file.type || "").startsWith("text/")) return {n: nom, x: await file.text(), pdf: false};
  const buf = new Uint8Array(await file.arrayBuffer());
  if (ext === "docx") return {n: nom, x: await leerDocx(buf), pdf: false};
  if (ext === "pdf") return {n: nom, x: await leerPdf(buf), pdf: true};
  if (["doc", "odt", "rtf", "pages"].includes(ext)) throw new Error("Los archivos ." + ext + " no se pueden leer. Abrilo en Word y guardalo como .docx (o como .txt).");
  throw new Error("Formato no compatible. Usá .txt, .md, .docx o .pdf.");
}

/* ======================= de un texto a tarjetas ======================= */
const ARTICULO = /^(el|la|los|las|un|una|unos|unas)$/i, SIN_TERMINO = /^(nota|ojo|ejemplo|ejemplos|ver|obs|observaci[oó]n|fuente|importante|p|r|pregunta|respuesta|pd|nb|http|https|figura|tabla)$|\b(p[aá]gina|cap[ií]tulo|unidad|tema|clase|figura|tabla|anexo|ejemplo)\b/i;
const sinMarcas = s => s.replace(/\*\*/g, "").replace(/^[-*•·]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
const mayus = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const fin = s => /[.!?…:]$/.test(s) ? s : s + ".";
const sinSalto = s => s.replace(/\s+/g, " ").trim();
/* Los PDF cortan los renglones a mitad de frase: se unen los que no terminan en punto y siguen en minúscula, y se arreglan las palabras cortadas con guion. */
function reflujo(t) {
  const ls = t.split("\n"), out = [];
  ls.forEach(l => { const p = out[out.length - 1], s = l.trim(); if (p !== undefined && p && s && !/[.:;!?)»”]$/.test(p) && /^[a-záéíóúñ(]/.test(s) && !/^[-*•]/.test(s) && !/^#/.test(p)) out[out.length - 1] = /[a-záéíóúñ]-$/.test(p) ? p.slice(0, -1) + s : p + " " + s; else out.push(s); });
  return out.join("\n");
}
const oraciones = p => { const out = []; (p.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []).forEach(x => { x = sinSalto(x); if (!x) return; if (out.length && /^[a-záéíóúñ]/.test(x)) out[out.length - 1] += " " + x; else out.push(x); }); return out; };   // corta en . ! ? y vuelve a unir si sigue en minúscula (etc., Dr.)
const palabras = s => s.split(/\s+/).filter(Boolean).length;
function claveDe(s) {
  let m = /\*\*([^*]{2,40})\*\*/.exec(s); if (m) return m[1].trim();
  const resto = s.replace(/\*\*/g, "");
  m = /\b(?:[A-ZÁÉÍÓÚÑ]{2,6})\b/g; let a; while ((a = m.exec(resto))) if (a.index > 0 && !/^(EL|LA|LOS|LAS|UN|UNA|DE|EN|SE|ES|Y|O)$/.test(a[0]) && !/^[IVXLCDM]+$/.test(a[0])) return a[0];
  m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(resto); if (m) return m[1];
  m = /\b\d{1,3}(?:[.,]\d+)?\s?(?:%|por ciento|kg|km|cm|mm|°C|ºC|años|días|horas|minutos|segundos)(?=\W|$)/.exec(resto); if (m) return m[0].trim();
  const ws = resto.split(/\s+/);   // nombre propio: palabra con mayúscula que no abre la oración (y las que le siguen)
  for (let i = 1; i < ws.length; i++) if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}[,;]?$/.test(ws[i]) && !/[.!?:]$/.test(ws[i - 1])) { let j = i; const nom = [ws[i].replace(/[,;]$/, "")]; while (j + 1 < ws.length && nom.length < 3 && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}[,;]?$/.test(ws[j + 1]) && !/[,;]$/.test(ws[j])) { nom.push(ws[j + 1].replace(/[,;]$/, "")); j++; } return nom.join(" "); }
  return "";
}
/* Devuelve [{t, a, tp, ok}]. op: {d definiciones, p preguntas, c completar, s secciones}. */
function generar(texto, op = {}, max = 150) {
  op = Object.assign({d: true, p: true, c: true, s: false}, op);
  const L = String(texto || "").replace(/\r/g, "").split("\n").map(x => x.replace(/[\u200b\u00a0]/g, " ").trim()), out = [], vistos = new Set(), usadas = new Set();
  const agregar = (t, a, tp) => { t = sinSalto(t); a = sinSalto(a); const k = norm(t); if (!t || !a || vistos.has(k) || t.length > 400 || a.length > 700) return false; vistos.add(k); out.push({t, a, tp, ok: true}); return true; };
  /* 1) Preguntas con su respuesta: «¿…?» y las líneas siguientes; o «P: … / R: …» */
  if (op.p) for (let i = 0; i < L.length; i++) {
    const l = sinMarcas(L[i]), pr = /^(?:p|pregunta)\s*[:.-]\s*(.+)$/i.exec(l);
    if (pr || (/\?$/.test(l) && l.length >= 8 && l.length <= 220 && !/^#/.test(L[i]))) {
      let j = i + 1; const resp = [];   // la respuesta es el renglón siguiente; los que siguen se suman solo si la frase quedó cortada o son viñetas
      while (j < L.length && L[j] && !/^#/.test(L[j]) && !/\?$/.test(sinMarcas(L[j])) && !/^(?:p|pregunta)\s*[:.-]/i.test(sinMarcas(L[j])) && resp.join(" ").length < 500 && (!resp.length || !/[.!?…]$/.test(resp[resp.length - 1]) || /^[-*•·]|^\d+[.)]\s/.test(L[j]))) { resp.push(sinMarcas(L[j]).replace(/^(?:r|respuesta)\s*[:.-]\s*/i, "")); j++; }
      if (resp.length && agregar(pr ? pr[1] : l, resp.join(" "), "p")) { for (let k = i; k < j; k++) usadas.add(k); i = j - 1; }
    }
  }
  /* 2) Definiciones: «Término: explicación» (también con =, – o →) y «X es …» */
  if (op.d) L.forEach((raw, i) => {
    if (usadas.has(i) || !raw || /^#/.test(raw)) return; const l = sinMarcas(raw);
    const m = /^(.{2,60}?)\s*(?::\s|\s=\s|\s[–—-]\s|\s→\s)\s*(.{12,500})$/.exec(l);
    if (m && palabras(m[1]) <= 6 && !SIN_TERMINO.test(m[1].trim()) && !/[.!?;]$/.test(m[1]) && !/^\d+$/.test(m[1]) && !/https?/i.test(m[1]) && palabras(m[2]) >= 3) { if (agregar(m[1], fin(mayus(m[2])), "d")) usadas.add(i); return; }
    oraciones(l).forEach(s => {
      const e = /^([A-ZÁÉÍÓÚÑ][^.!?:;,]{1,50}?)\s+(es|son|consiste en|se refiere a)\s+(.{15,300}?)\.?$/.exec(s); if (!e || palabras(e[1]) > 6 || /\b(que|cuando|porque|donde)\b/i.test(e[1])) return;
      const sujeto = ARTICULO.test(e[1].split(" ")[0]) ? e[1][0].toLowerCase() + e[1].slice(1) : e[1], q = e[2] === "es" ? "¿Qué es " : e[2] === "son" ? "¿Qué son " : e[2] === "consiste en" ? "¿En qué consiste " : "¿A qué se refiere ";
      if (agregar(q + sujeto + "?", fin(mayus(e[3])), "d")) usadas.add(i);
    });
  });
  /* 3) Frases para completar */
  if (op.c) L.forEach((raw, i) => {
    if (usadas.has(i) || !raw || /^#/.test(raw) || /\?$/.test(raw)) return;
    oraciones(raw.replace(/^[-*•·]\s+|^\d+[.)]\s+/, "")).forEach(s => {
      const n = palabras(s); if (n < 7 || n > 38) return; const k = claveDe(s); if (!k || k.length > 40) return;
      const limpia = s.replace(/\*\*/g, ""), hueco = limpia.split(k).join("_____"); if (hueco === limpia || (hueco.match(/_____/g) || []).length > 2) return;
      agregar("Completá: " + hueco, k, "c");
    });
  });
  /* 4) Secciones con título (apagado por defecto: salen menos precisas) */
  if (op.s) for (let i = 0; i < L.length; i++) if (/^#{1,6}\s+\S/.test(L[i])) {
    const tit = L[i].replace(/^#+\s*/, "").replace(/\*\*/g, ""); let j = i + 1; const cuerpo = []; while (j < L.length && !/^#/.test(L[j])) { if (L[j]) cuerpo.push(sinMarcas(L[j])); j++; }
    const c = cuerpo.join(" "); if (c.length >= 40) agregar("Explicá: " + tit, c.length > 450 ? c.slice(0, 450).replace(/\s\S*$/, "") + "…" : c, "s");
  }
  return out.slice(0, max);
}
/* Tarjetas ya hechas: «frente ;; dorso», «frente | dorso» o tabulaciones (lo que exporta Anki). */
function parsearTarjetas(texto) {
  const out = [];
  String(texto || "").replace(/\r/g, "").split("\n").forEach(l => {
    l = l.trim(); if (!l || /^#/.test(l)) return;
    const sep = l.includes("\t") ? "\t" : l.includes(";;") ? ";;" : l.includes(" || ") ? " || " : l.includes(" | ") ? " | " : "";
    if (!sep) return; const p = l.split(sep).map(x => sinSalto(x.replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, ""))); if (p[0] && p[1]) out.push({t: p[0], a: p[1], tp: "m", ok: true});
  });
  return out;
}
const pedidoClaude = (texto, tope = 15000) => "Armá flashcards en español con este material. Formato: una tarjeta por línea, «pregunta ;; respuesta», sin numerar y sin texto extra. Preguntas concretas, respuestas de una o dos líneas. Máximo 30 tarjetas.\n\nMaterial:\n---\n" + String(texto).slice(0, tope) + (String(texto).length > tope ? "\n[…el resto del material no entró]" : "");

/* ======================= repaso espaciado (SM-2 simplificado) ======================= */
const NUEVAS = () => (Number.isInteger(D().np) && D().np >= 0 && D().np <= 200) ? D().np : 15;
function calificar(t, q, hoy) {   // q: 0 otra vez, 1 difícil, 2 bien, 3 fácil
  const ef0 = t.ef || 2.5, it0 = t.it || 0, rp0 = t.rp || 0; let ef = ef0, it, rp;
  if (q === 0) { rp = 0; it = 0; ef = Math.max(1.3, ef0 - 0.2); t.ll = (t.ll || 0) + 1; }
  else { rp = rp0 + 1;
    if (q === 1) { ef = Math.max(1.3, ef0 - 0.15); it = rp0 === 0 ? 1 : Math.max(it0 + 1, Math.round(it0 * 1.2)); }
    else if (q === 2) it = rp0 === 0 ? 1 : rp0 === 1 ? 3 : Math.max(it0 + 1, Math.round(it0 * ef0));
    else { ef = ef0 + 0.15; it = rp0 === 0 ? 3 : Math.max(it0 + 2, Math.round(it0 * ef0 * 1.3)); } }
  it = Math.min(365, it); t.ef = Math.round(ef * 100) / 100; t.it = it; t.rp = rp; t.ul = hoy; t.pr = t.pr || hoy; t.v = q === 0 ? hoy : sumar(hoy, it);
  return t;
}
/* Cola del día: primero las vencidas (las más atrasadas arriba) y después tarjetas nuevas hasta el tope diario. */
function cola(zs, hoy) {
  const ts = D().t.filter(t => !zs || zs.includes(t.z)), venc = ts.filter(t => t.ul && t.v <= hoy).sort((a, b) => a.v < b.v ? -1 : a.v > b.v ? 1 : 0);
  const hechas = D().t.filter(t => t.pr === hoy).length, nuevas = ts.filter(t => !t.ul).slice(0, Math.max(0, NUEVAS() - hechas));
  return venc.concat(nuevas);
}

/* ======================= exámenes ======================= */
const mezclar = (a, azar = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function distractores(c, otras, k, azar) {
  const cerca = otras.slice().sort((x, y) => (Math.abs(x.a.length - c.a.length) + (x.tp === c.tp ? 0 : 25)) - (Math.abs(y.a.length - c.a.length) + (y.tp === c.tp ? 0 : 25))).slice(0, 12), vis = new Set([norm(c.a)]), out = [];
  mezclar(cerca, azar).forEach(o => { if (out.length < k && !vis.has(norm(o.a))) { vis.add(norm(o.a)); out.push(o); } });
  return out;
}
/* tipo: «op» opción múltiple, «vf» verdadero o falso, «es» escribir la respuesta (te corregís vos), «mixto». */
function armarExamen(pool, n, tipo, azar = Math.random) {
  const ok = pool.filter(c => c.t && c.a);
  return mezclar(ok, azar).slice(0, n).map(c => {
    const otras = ok.filter(o => norm(o.a) !== norm(c.a)); let ty = tipo;
    if (tipo === "mixto") { const r = azar(); ty = r < 0.6 ? "op" : r < 0.8 ? "vf" : "es"; }
    if (ty === "op") { const d = distractores(c, otras, 3, azar); if (d.length >= 3) { const ops = mezclar([c.a].concat(d.map(x => x.a)), azar); return {c: c.id, ty: "op", q: c.t, ops, ok: ops.indexOf(c.a)}; } ty = tipo === "op" ? "es" : "vf"; }
    if (ty === "vf" && otras.length) { const verdad = azar() < 0.5; return {c: c.id, ty: "vf", q: c.t, mostrar: verdad ? c.a : otras[Math.floor(azar() * otras.length)].a, ok: verdad}; }
    return {c: c.id, ty: "es", q: c.t, resp: c.a};
  });
}
const acerto = (p, r) => p.ty === "es" ? !!(r && r.ok === true) : r === p.ok;
const notaDe = (ok, n) => n ? Math.round(100 * ok / n) / 10 : 0;
const fmtNota = n => String(n).replace(".", ",");

/* ======================= con IA local (opcional, ver ia.js) ======================= */
const ia = () => (window.SB && SB.ia && SB.ia.disponible()) ? SB.ia : null;
const ESQ_TARJETAS = {type: "object", properties: {tarjetas: {type: "array", items: {type: "object", properties: {frente: {type: "string"}, dorso: {type: "string"}}, required: ["frente", "dorso"]}}}, required: ["tarjetas"]};
const ESQ_CORREGIR = {type: "object", properties: {correcto: {type: "boolean"}, explicacion: {type: "string"}}, required: ["correcto", "explicacion"]};
const SISTEMA = "Sos un docente que prepara material de estudio en español. Usás solo la información que está en el texto o en lo que te piden: no inventes datos ni agregues cosas de afuera.";
/* Parte un texto largo en trozos de unos n caracteres, cortando en renglones o, si hace falta, en espacios. */
function trozos(texto, n = 3500) {
  const out = []; let cur = "";
  String(texto || "").replace(/\r/g, "").split("\n").forEach(l => {
    l = l.trim(); if (!l) return;
    while (l.length > n) { let cut = l.lastIndexOf(" ", n); if (cut < n / 2) cut = n; if (cur) { out.push(cur); cur = ""; } out.push(l.slice(0, cut)); l = l.slice(cut).trim(); }
    if (cur && cur.length + l.length + 1 > n) { out.push(cur); cur = ""; } cur = cur ? cur + "\n" + l : l;
  });
  if (cur) out.push(cur); const res = [];   // un trozo muy corto se une al anterior en vez de perderse
  out.forEach(c => { if (res.length && c.length < 200) res[res.length - 1] += "\n" + c; else res.push(c); }); return res;
}
function jsonDe(txt) {   // saca el JSON de una respuesta, aunque venga con ```json … ``` o con texto alrededor
  const t = String(txt || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""), a = [t.indexOf("{"), t.indexOf("[")].filter(i => i >= 0).sort((x, y) => x - y)[0];
  if (a === undefined) return null; const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]")); try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
function tarjetasDeRespuesta(txt) {
  const j = jsonDe(txt), arr = Array.isArray(j) ? j : j && typeof j === "object" ? (j.tarjetas || j.flashcards || j.cards || j.preguntas || []) : [];
  const out = (Array.isArray(arr) ? arr : []).map(x => x && typeof x === "object" ? {t: sinSalto(String(x.frente || x.pregunta || x.front || x.q || "")), a: sinSalto(String(x.dorso || x.respuesta || x.back || x.a || ""))} : null).filter(x => x && x.t && x.a);
  return out.length ? out : parsearTarjetas(txt).map(x => ({t: x.t, a: x.a}));
}
/* Control contra inventos: ¿lo que dice el dorso aparece en el texto? Se comparan las raíces (5 letras) de las palabras de contenido; las respuestas cortas (un año, una sigla) tienen que estar tal cual. */
function fundada(dorso, texto) {
  const nt = norm(texto), pal = [...new Set(norm(dorso).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 5))];
  if (!pal.length) return nt.includes(norm(dorso).trim());
  return pal.filter(w => nt.includes(w.slice(0, 5))).length / pal.length >= 0.5;
}
async function generarConIA(texto, op) {
  op = op || {}; const I = ia(); if (!I) throw new Error("La IA no está activada: activala en Ajustes → IA local.");
  const todas = trozos(texto), usar = todas.slice(0, op.max || 12), out = [], vistos = new Set(); let fallidas = 0, error = "";
  for (let i = 0; i < usar.length; i++) {
    if (op.signal && op.signal.aborted) break; if (op.onProgreso) op.onProgreso(i + 1, usar.length);
    let r; try { r = await I.chat([{role: "system", content: SISTEMA}, {role: "user", content: "Del siguiente material creá hasta 8 tarjetas de estudio (flashcards). Cada tarjeta tiene un frente (una pregunta concreta que se entienda sin ver el texto) y un dorso (la respuesta breve, de una o dos oraciones). Evitá las preguntas de sí o no y las demasiado generales; cubrí lo más importante. Respondé solo con JSON.\n\nMaterial:\n" + usar[i]}], {formato: ESQ_TARJETAS, signal: op.signal}); }
    catch (e) { if (e.tipo === "cancelado") break; if (!out.length) throw e; error = e.message; break; }
    const its = tarjetasDeRespuesta(r); if (!its.length) { fallidas++; continue; }
    its.forEach(x => { const k = norm(x.t); if (vistos.has(k) || x.t.length > 400) return; vistos.add(k); const ok = fundada(x.a, usar[i]); out.push({t: x.t, a: x.a.slice(0, 700), tp: "i", ok, rev: !ok}); });
  }
  return {items: out, partes: usar.length, total: todas.length, fallidas, error};
}
async function corregirConIA(pregunta, esperada, dada, op) {
  const I = ia(); if (!I) throw new Error("La IA no está activada: activala en Ajustes → IA local."); if (!String(dada || "").trim()) return {ok: false, expl: "No escribiste nada."};
  const r = await I.chat([{role: "system", content: "Corregís respuestas de estudiantes con criterio justo: aceptás sinónimos, otra redacción y errores de ortografía, y no exigís las mismas palabras. Marcás incorrecto solo si falta lo esencial o dice algo falso."}, {role: "user", content: "Pregunta: " + pregunta + "\nRespuesta esperada: " + esperada + "\nRespuesta del estudiante: " + dada + "\n\nDevolvé JSON con «correcto» (true o false) y «explicacion» (una o dos oraciones en español)."}], {formato: ESQ_CORREGIR, signal: op && op.signal}), j = jsonDe(r);
  if (!j || typeof j.correcto !== "boolean") throw new Error("La IA devolvió una respuesta que no pude leer. Corregí vos con «Acerté / Fallé».");
  return {ok: j.correcto, expl: sinSalto(String(j.explicacion || "")).slice(0, 400)};
}
async function explicarConIA(pregunta, correcta, tuya, op) {
  const I = ia(); if (!I) throw new Error("La IA no está activada: activala en Ajustes → IA local.");
  const t = await I.chat([{role: "system", content: SISTEMA}, {role: "user", content: "Pregunta: " + pregunta + "\nRespuesta correcta: " + correcta + "\nLo que respondió el estudiante: " + tuya + "\n\nExplicá en dos o tres oraciones por qué la respuesta correcta es esa y en qué se equivocó el estudiante. Si no estás seguro de algo, decilo."}], {signal: op && op.signal, temperatura: 0.3});
  return sinSalto(t).slice(0, 700);
}
const textosFallo = (p, r) => ({mia: p.ty === "op" ? (r === undefined ? "sin responder" : p.ops[r]) : p.ty === "vf" ? (r === undefined ? "sin responder" : r ? "Verdadero" : "Falso") : (r && r.txt) || "sin responder", cor: p.ty === "op" ? p.ops[p.ok] : p.ty === "vf" ? (p.ok ? "Verdadero" : "Falso (era: " + (D().t.find(t => t.id === p.c) || {a: "?"}).a + ")") : p.resp});
const realResp = p => p.ty === "op" ? p.ops[p.ok] : p.ty === "vf" ? (D().t.find(t => t.id === p.c) || {a: "?"}).a : p.resp;

const GUIA = `<section class="card"><h3>❓ Cómo se usa Tarjetas</h3><p class="ayuda">Tarjetas sirve para estudiar de memoria: armás mazos con una pregunta de un lado y la respuesta del otro, los repasás cada día y tomás exámenes. Todo se guarda en este dispositivo y se sincroniza con tu archivo, como el resto de la app.</p>
  <details open><summary>1. Armar un mazo</summary><p class="ayuda">Tocá <b>＋ Mazo</b>, ponele un nombre y abrilo. Hay cuatro formas de agregar tarjetas:</p><ul>
    <li><b>Desde un material:</b> elegí un archivo <b>.txt, .md, .docx o .pdf</b> o pegá el texto. La app propone tarjetas y vos elegís cuáles guardar. Los .doc viejos no se pueden leer (guardalos como .docx) y los PDF escaneados tampoco, porque son imágenes. La primera vez que importás un PDF hace falta internet.</li>
    <li><b>A mano:</b> escribís el frente y el dorso.</li>
    <li><b>Pegar tarjetas ya hechas:</b> una por línea, <b>frente ;; dorso</b>. También sirve lo que exporta Anki.</li>
    <li><b>Con Claude u otra IA:</b> «Copiar el pedido para Claude» copia un pedido listo; lo pegás en una conversación con tu material y traés el resultado con «Pegar tarjetas ya hechas».</li></ul></details>
  <details><summary>2. Cómo escribir los apuntes para que salgan buenas tarjetas</summary><p class="ayuda">La app no entiende el texto: busca patrones. Cuanto más ordenados tus apuntes, mejores las tarjetas:</p><ul>
    <li><b>Definiciones:</b> <i>Mitocondria: organela que produce energía.</i> (también con = o –). En Word sirve una tabla de dos columnas: término y definición.</li>
    <li><b>Preguntas con su respuesta:</b> una línea con <i>¿Qué es el ADN?</i> y la respuesta en el renglón de abajo.</li>
    <li><b>Frases para completar:</b> pone un hueco en la palabra clave si está en <b>negrita</b>, o es un año, una cifra con unidad, una sigla o un nombre propio.</li>
    <li><b>«X es …»</b> se vuelve la pregunta «¿Qué es X?». Las «Secciones» (título + párrafo) están apagadas porque salen menos precisas.</li>
    <li>Con prosa corrida sin esas marcas salen pocas tarjetas. Ahí ayuda la IA local (opcional) o Claude.</li></ul><p class="ayuda">Antes de guardar, destildá las que no sirvan; después podés editarlas con ✏️.</p></details>
  <details><summary>3. Repasar</summary><p class="ayuda">Tocá <b>Repasar</b>, mirá el frente, pensá la respuesta y tocá <b>Mostrar respuesta</b>. Después elegí cómo te fue:</p><ul>
    <li><b>Otra vez:</b> no la sabías. Vuelve en esta misma sesión (hasta 3 veces) y mañana otra vez.</li>
    <li><b>Difícil:</b> la sabías con esfuerzo. Vuelve pronto.</li>
    <li><b>Bien:</b> la ves en 1 día, después en 3, y cada vez con más separación.</li>
    <li><b>Fácil:</b> la separa más todavía.</li></ul><p class="ayuda">Cada día te muestra las que vencen y hasta 15 tarjetas nuevas (lo cambiás al pie de la pantalla de mazos). Si repasás un poco todos los días, aprendés más que con una sesión larga de vez en cuando. Aparece en <b>Hoy</b> cuando hay algo para repasar.</p></details>
  <details><summary>4. Exámenes</summary><p class="ayuda">Tocá <b>📝 Examen</b>, elegí el mazo, cuántas preguntas y el tipo: <b>opción múltiple</b> (las opciones falsas salen de otras tarjetas), <b>verdadero o falso</b>, <b>escribir la respuesta</b> (te corregís vos con «Acerté / Fallé») o mixto. Al final ves la nota sobre 10 y qué fallaste. Lo que fallás vuelve a tocar hoy en el repaso, y podés repasar solo esas. Hacen falta al menos dos tarjetas, y para opción múltiple, cuatro respuestas distintas.</p></details>
  <details><summary>5. IA local (opcional)</summary><p class="ayuda">Si instalás Ollama en tu PC, la IA puede crear tarjetas desde prosa corrida (<b>Generar más con IA</b>), corregir tus respuestas escritas (<b>Corregir con IA</b>) y explicarte lo que fallaste (<b>Explicame</b>). Está apagada por defecto, no manda nada a internet y puede equivocarse: revisá lo que propone. La guía para instalarla está en <b>Ajustes → IA local</b>.</p></details>
  <details><summary>6. Cosas para saber</summary><ul><li>Un mazo con más de 150 tarjetas es demasiado grande para la Papelera: al borrarlo no se puede recuperar. Los más chicos quedan 30 días en la Papelera.</li><li>Los materiales que importás se guardan (hasta 100 mil caracteres cada uno) para volver a proponer tarjetas más tarde.</li><li>Podés asociar un mazo a una materia de Estudio.</li></ul></details>
  <div class="fila-b"><button class="pri" data-a="ir" data-v="inicio">Entendido</button></div></section>`;

/* ======================= estado de la pantalla ======================= */
let vista = "inicio", mz = "", rep = null, exm = null, cand = null, filtro = "", lim = 40, editar = "", msg = "", msgErr = false, cargando = false, trab = null;
const mazo = id => D().z.find(x => x.id === id), nomMazo = id => (mazo(id) || {n: "(mazo borrado)"}).n;
const materias = () => { try { return SB.mods.estudio && SB.datos("estudio") ? SB.datos("estudio").m || [] : []; } catch (e) { return []; } };
const nomMateria = id => { const m = materias().find(x => x.id === id); return m ? m.n : ""; };
const guardar = () => SB.guardar("tarjetas");
const sumar2 = (hoy, ok) => { const r = D().rv[hoy] || [0, 0]; D().rv[hoy] = [r[0] + 1, r[1] + (ok ? 1 : 0)]; };
const conteo = (z, hoy) => { const ts = D().t.filter(t => t.z === z); return {n: ts.length, venc: ts.filter(t => t.ul && t.v <= hoy).length, nuevas: ts.filter(t => !t.ul).length}; };
function empezarRepaso(zs, ids) {
  const hoy = ymd(), cs = ids ? ids.map(id => D().t.find(t => t.id === id)).filter(Boolean) : cola(zs, hoy);
  if (!cs.length) { msg = "No hay tarjetas para repasar ahora."; return false; }
  rep = {ids: cs.map(t => t.id), i: 0, mostrar: false, vistas: 0, bien: 0, otra: {}, zs}; vista = "repaso"; return true;
}
function empezarExamen(zs, n, tipo) {
  const pool = D().t.filter(t => !zs || zs.includes(t.z)), ps = armarExamen(pool, n, tipo);
  if (ps.length < 2) { msg = "Hacen falta al menos 2 tarjetas para armar un examen."; return false; }
  exm = {zs, ps, i: 0, resp: [], listo: false, tipo, res: null}; vista = "examen"; return true;
}
function terminarExamen() {
  const e = exm, ok = e.ps.filter((p, i) => acerto(p, e.resp[i])).length, mal = e.ps.filter((p, i) => !acerto(p, e.resp[i])).map(p => p.c), hoy = ymd(), z = e.zs && e.zs.length === 1 ? e.zs[0] : "";
  mal.forEach(id => { const t = D().t.find(x => x.id === id); if (t && t.ul) { t.v = hoy; t.ll = (t.ll || 0) + 1; } });   // lo que fallaste vuelve a tocar hoy
  const r = {id: uid(), n: "Examen · " + (z ? nomMazo(z) : "todos los mazos"), z, f: hoy, p: e.ps.length, ok, nota: notaDe(ok, e.ps.length), mal, c: Date.now()};
  D().ex.unshift(r); if (D().ex.length > 60) D().ex.length = 60; guardar(); e.res = r; e.listo = true;
}
function agregarTarjetas(items, z, extra) {
  const hoy = Date.now(), ya = new Set(D().t.filter(t => t.z === z).map(t => norm(t.t))); let n = 0;
  items.forEach(it => { const k = norm(it.t); if (!it.t || !it.a || ya.has(k)) return; ya.add(k); D().t.push({id: uid(), z, t: it.t.slice(0, 400), a: it.a.slice(0, 700), tp: it.tp || "m", c: hoy + n}); n++; });
  return n;
}
const portapapeles = txt => (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt).then(() => true) : Promise.resolve(false)).catch(() => false);

SB.registrar({
  id: "tarjetas", nombre: "Tarjetas", icono: "🃏", esquema: 1,
  inicial: () => ({z: [], t: [], mt: [], ex: [], rv: {}, np: 15}), migraciones: {},
  sync: [{k: "z", orden: "asc"}, {k: "t", orden: "asc", t: x => x.c || 0}, {k: "mt", orden: "desc", t: x => x.c || 0}, {k: "ex", orden: "desc", t: x => x.c || 0}],
  util: {leerDocx, docxATexto, leerPdf, leerArchivo, generar, parsearTarjetas, pedidoClaude, calificar, cola, armarExamen, acerto, notaDe, reflujo, claveDe, agregarTarjetas, trozos, tarjetasDeRespuesta, fundada, generarConIA, corregirConIA, explicarConIA, estado: () => ({vista, rep, exm, cand, trab})},
  hoy() { const n = cola(null, ymd()).length; return n ? [{t: "Repasar tarjetas", s: n + (n === 1 ? " tarjeta" : " tarjetas") + " para hoy", ir: "#/tarjetas/repasar", hecho: false}] : []; },
  buscar: q => { const k = norm(q), r = []; D().z.filter(z => norm(z.n).includes(k)).forEach(z => r.push({t: z.n, s: "Mazo · " + D().t.filter(t => t.z === z.id).length + " tarjetas"}));
    D().t.filter(t => norm(t.t + " " + t.a).includes(k)).slice(0, 8).forEach(t => r.push({t: t.t, s: t.a.slice(0, 80) + " · " + nomMazo(t.z)})); return r; },
  semana() {
    const d = D(), f = ymd(), dias = Array.from({length: 7}, (_, i) => sumar(f, -i)), rs = dias.map(x => d.rv[x]).filter(Boolean), tot = rs.reduce((a, r) => a + r[0], 0), bien = rs.reduce((a, r) => a + r[1], 0), ex = d.ex.filter(e => e.f >= dias[6]);
    if (!d.t.length && !d.ex.length) return [];
    const out = [tot ? "Repasaste " + tot + " tarjetas (" + Math.round(100 * bien / tot) + " % bien)." : "No repasaste tarjetas en los últimos 7 días."];
    if (ex.length) out.push(ex.length + (ex.length === 1 ? " examen" : " exámenes") + ", promedio " + fmtNota(Math.round(10 * ex.reduce((a, e) => a + e.nota, 0) / ex.length) / 10) + " sobre 10.");
    return out;
  },
  pantalla(el, sub) {
    if (sub === "repasar" && vista !== "repaso") { vista = "inicio"; empezarRepaso(null); try { history.replaceState(null, "", "#/tarjetas"); } catch (e) {} }   // se consume el atajo: al terminar no vuelve a empezar
    const d = D(), hoy = ymd(); if (vista === "mazo" && !mazo(mz)) vista = "inicio";
    let h = msg ? `<p class="${msgErr || /^(No |Hacen|El archivo|Este|Los |Formato)/.test(msg) ? "sy-err" : "sy-ok"}" role="status">${esc(msg)}</p>` : ""; msg = ""; msgErr = false;
    const volver = `<button class="chip" data-a="ir" data-v="inicio">← Mazos</button>`, mats = materias();
    const bloqueIA = () => ia() ? (trab && trab.tipo === "gen" ? `<p class="ayuda">✨ ${esc(trab.txt)}</p><button data-a="ia-cancelar">Cancelar</button>` : `<button data-a="ia-gen"${trab ? " disabled" : ""}>✨ Generar más con IA</button><p class="ayuda">La IA lee el material por partes y puede equivocarse: revisá lo que propone antes de guardarlo.</p>`) : `<p class="ayuda">Si conectás una IA local en Ajustes, también puede crear tarjetas desde prosa corrida.</p>`;
    if (vista === "guia") { h += GUIA; }
    else if (vista === "repaso" && rep) {
      const t = D().t.find(x => x.id === rep.ids[rep.i]);
      if (!t || rep.i >= rep.ids.length) { const r = rep; h += `<section class="card"><h3>🎉 Repaso terminado</h3><p>Repasaste ${r.vistas} ${r.vistas === 1 ? "tarjeta" : "tarjetas"} y acertaste ${r.bien}.</p><button class="pri" data-a="ir" data-v="${mz && mazo(mz) ? "mazo" : "inicio"}">Listo</button></section>`; }
      else h += `<div class="fila-b"><button class="chip" data-a="salir-repaso">✕ Salir</button><small>${rep.i + 1} de ${rep.ids.length} · ${esc(nomMazo(t.z))}</small></div><section class="card tj"><p class="tj-t">${esc(t.t)}</p>${rep.mostrar ? `<hr><p class="tj-a">${esc(t.a)}</p><div class="tj-n"><button data-a="nota" data-q="0" class="x">Otra vez</button><button data-a="nota" data-q="1">Difícil</button><button data-a="nota" data-q="2" class="pri">Bien</button><button data-a="nota" data-q="3">Fácil</button></div>` : `<button class="pri" data-a="mostrar">Mostrar respuesta</button>`}</section>`;
    } else if (vista === "examen" && exm) {
      const e = exm;
      if (e.listo) { const r = e.res, malos = e.ps.map((p, i) => ({p, i})).filter(x => !acerto(x.p, e.resp[x.i])); h += `<section class="card"><h3>Resultado: ${fmtNota(r.nota)} sobre 10</h3><p>${r.ok} de ${r.p} bien (${Math.round(100 * r.ok / r.p)} %).</p>${malos.length ? `<button data-a="repasar-fallos">Repasar las ${malos.length} que fallé</button>` : "<p>¡Todo bien! 🎉</p>"}<button class="pri" data-a="ir" data-v="${mz && mazo(mz) ? "mazo" : "inicio"}">Listo</button></section>`
        + (malos.length ? `<section class="card"><h3>Lo que fallaste</h3>${malos.map(({p, i}) => { const {mia, cor} = textosFallo(p, e.resp[i]); return `<div class="fila"><div class="tx"><span>${esc(p.q)}</span><small>Tu respuesta: ${esc(mia)}</small><small>Correcta: <b>${esc(cor)}</b></small>${e.expl && e.expl[i] ? `<small>🤖 ${esc(e.expl[i])}</small>` : ia() ? (trab && trab.tipo === "expl" && trab.i === i ? `<small>🤖 Pensando…</small>` : `<button class="chip" data-a="ia-expl" data-i="${i}"${trab ? " disabled" : ""}>🤖 Explicame</button>`) : ""}</div></div>`; }).join("")}${e.expl && Object.keys(e.expl).length ? `<p class="ayuda">Las explicaciones las genera una IA y pueden tener errores: verificalas con tu material.</p>` : ""}</section>` : ""); }
      else { const p = e.ps[e.i], r = e.resp[e.i], resp = r !== undefined && (p.ty !== "es" || (r && r.ok !== undefined));
        h += `<div class="fila-b"><button class="chip" data-a="salir-examen">✕ Salir</button><small>Pregunta ${e.i + 1} de ${e.ps.length}</small></div><progress max="${e.ps.length}" value="${e.i}"></progress><section class="card"><p class="tj-t">${p.ty === "vf" ? "¿Verdadero o falso?<br><small>" + esc(p.q) + "</small><br><b>" + esc(p.mostrar) + "</b>" : esc(p.q)}</p>`
          + (p.ty === "op" ? p.ops.map((o, k) => `<button class="op${r === k ? " sel" : ""}" data-a="opcion" data-i="${k}">${esc(o)}</button>`).join("") : p.ty === "vf" ? `<div class="tj-n"><button class="op${r === true ? " sel" : ""}" data-a="vf" data-v="1">Verdadero</button><button class="op${r === false ? " sel" : ""}" data-a="vf" data-v="0">Falso</button></div>`
          : r && r.rev ? `<p>Tu respuesta: ${esc(r.txt || "(vacía)")}</p><p>Respuesta: <b>${esc(p.resp)}</b></p>${r.ia ? `<p class="ayuda">🤖 ${esc(r.ia)} <small>(la IA puede equivocarse: si no coincide, elegí vos)</small></p>` : ""}<div class="tj-n"><button class="op${r.ok === true ? " sel" : ""}" data-a="acerte">Acerté</button><button class="op${r.ok === false ? " sel" : ""}" data-a="falle">Fallé</button></div>` : `<textarea rows="2" placeholder="Escribí tu respuesta" data-c="escrita" aria-label="Tu respuesta">${esc(r && r.txt || "")}</textarea>${ia() ? (trab && trab.tipo === "corr" ? `<p class="ayuda">🤖 Corrigiendo…</p>` : `<button data-a="ia-corregir">🤖 Corregir con IA</button>`) : ""}<button class="pri" data-a="revelar">Ver la respuesta</button>`)
          + `<button class="pri" data-a="siguiente"${resp ? "" : " disabled"}>${e.i + 1 === e.ps.length ? "Terminar examen" : "Siguiente"}</button></section>`; }
    } else if (vista === "cand" && cand) {
      const n = cand.items.filter(x => x.ok).length;
      h += `<div class="fila-b">${volver}</div><section class="card"><h3>Tarjetas propuestas</h3><p class="ayuda">De «${esc(cand.nombre)}»${cand.pdf ? " (PDF)" : ""}. Destildá las que no sirvan: después podés editarlas en el mazo. ${cand.items.length ? "" : "No encontré definiciones, preguntas ni frases con palabra clave. Probá activar «Secciones», o pegá tarjetas ya hechas."}</p>
        <form data-f="gen-opts"><div class="fila-b">${[["d", "Definiciones"], ["p", "Preguntas"], ["c", "Completar"], ["s", "Secciones"]].map(([k, t]) => `<label class="chip${cand.op[k] ? " on" : ""}"><input type="checkbox" name="${k}"${cand.op[k] ? " checked" : ""} hidden>${t}</label>`).join("")}<button>Volver a buscar</button></div></form>${bloqueIA()}</section>`
        + (cand.items.length ? `<section class="card"><div class="fila-b"><button class="chip" data-a="cand-todas">${n === cand.items.length ? "Destildar todas" : "Tildar todas"}</button><small>${n} de ${cand.items.length}</small></div>${cand.items.map((x, i) => `<div class="fila"><label class="tx"><span><input type="checkbox" data-c="cand-sel" data-i="${i}"${x.ok ? " checked" : ""}> ${esc(x.t)}</span><small>${esc(x.a)}</small><small>${TIPOS[x.tp] || ""}${x.rev ? " · ⚠️ revisar: la respuesta no parece estar en el texto" : ""}</small></label></div>`).join("")}<button class="pri" data-a="cand-guardar"${n ? "" : " disabled"}>Agregar ${n} al mazo</button></section>` : "");
    } else if (vista === "exam-cfg") {
      const zs = d.z.filter(z => D().t.some(t => t.z === z.id));
      h += `<div class="fila-b">${volver}</div><section class="card"><h3>Tomar un examen</h3>${zs.length ? `<form data-f="exam-ir"><label class="tx"><span>Mazo</span><select name="z">${zs.length > 1 ? `<option value="">Todos los mazos</option>` : ""}${zs.map(z => `<option value="${esc(z.id)}"${z.id === mz ? " selected" : ""}>${esc(z.n)} (${D().t.filter(t => t.z === z.id).length})</option>`).join("")}</select></label>
        <label class="tx"><span>Preguntas</span><select name="n">${[5, 10, 20, 40].map(n => `<option value="${n}"${n === 10 ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="tx"><span>Tipo</span><select name="tipo"><option value="op">Opción múltiple</option><option value="mixto">Mixto (opciones, verdadero/falso y escribir)</option><option value="vf">Verdadero o falso</option><option value="es">Escribir la respuesta</option></select></label><button class="pri">Empezar</button></form><p class="ayuda">Las preguntas salen de tus tarjetas y las opciones falsas, de las respuestas de otras tarjetas. Lo que falles vuelve a tocar hoy en el repaso.</p>` : `<p class="vacio">Primero creá un mazo con tarjetas.</p>`}</section>`;
    } else if (vista === "mazo" && mazo(mz)) {
      const z = mazo(mz), c = conteo(z.id, hoy), q = norm(filtro), ts = d.t.filter(t => t.z === z.id && (!q || norm(t.t + " " + t.a).includes(q))).sort((a, b) => (b.c || 0) - (a.c || 0)), ms = d.mt.filter(m => m.z === z.id), nuevasHoy = cola([z.id], hoy).length;
      h += `<div class="fila-b">${volver}</div><section class="card"><div class="fila"><div class="tx"><span>${esc(z.n)}</span><small>${c.n} tarjetas · ${c.venc} para repasar · ${c.nuevas} nuevas${z.m && nomMateria(z.m) ? " · 📚 " + esc(nomMateria(z.m)) : ""}</small></div><button class="x" data-a="mazo-ren" aria-label="Renombrar">✏️</button><button class="x" data-a="mazo-del" aria-label="Borrar mazo">✕</button></div>
        <div class="fila-b"><button class="pri" data-a="repasar" data-z="${esc(z.id)}"${nuevasHoy ? "" : " disabled"}>Repasar (${nuevasHoy})</button><button data-a="examen" data-z="${esc(z.id)}"${c.n >= 2 ? "" : " disabled"}>📝 Examen</button></div>${mats.length ? `<label class="tx"><span>Materia de Estudio</span><select data-c="materia"><option value="">(ninguna)</option>${mats.map(m => `<option value="${esc(m.id)}"${z.m === m.id ? " selected" : ""}>${esc(m.n)}</option>`).join("")}</select></label>` : ""}</section>
        <section class="card"><h3>Agregar tarjetas</h3><details open><summary>📄 Desde un material (.txt, .md, .docx, .pdf)</summary><p class="ayuda">Se lee en este dispositivo. Te propongo tarjetas y elegís cuáles guardar.</p><label class="btn lsub">＋ Elegir archivo<input type="file" accept=".txt,.md,.markdown,.docx,.pdf,text/plain,application/pdf" hidden data-c="archivo"></label>${cargando ? `<p class="ayuda">Leyendo el archivo…</p>` : ""}
          <form data-f="texto-material"><textarea name="x" rows="4" placeholder="…o pegá acá el texto de tus apuntes" aria-label="Texto del material"></textarea><div class="fila-b"><input name="n" placeholder="Nombre del material (opcional)" aria-label="Nombre del material"><button>Proponer tarjetas</button></div></form></details>
          <details><summary>✍️ A mano</summary><form data-f="tarjeta-nueva"><textarea name="t" rows="2" placeholder="Frente (pregunta)" required aria-label="Frente"></textarea><textarea name="a" rows="2" placeholder="Dorso (respuesta)" required aria-label="Dorso"></textarea><button class="pri">Agregar tarjeta</button></form></details>
          <details><summary>📥 Pegar tarjetas ya hechas</summary><p class="ayuda">Una por línea: <b>frente ;; dorso</b> (o con barra | o tabulación, como exporta Anki).</p><form data-f="importar"><textarea name="x" rows="5" placeholder="¿Capital de Francia? ;; París" aria-label="Tarjetas para importar"></textarea><button class="pri">Importar</button></form>
          <p class="ayuda">¿Querés que las arme Claude? Copiá el pedido, pegalo en una conversación con tu material y traé el resultado acá.</p><button data-a="copiar-pedido">Copiar el pedido para Claude</button></details></section>`
        + (ms.length ? `<section class="card"><h3>Materiales</h3>${ms.map(m => `<div class="fila"><div class="tx"><span>${esc(m.n)}</span><small>${Math.round(m.x.length / 1000)} mil caracteres</small></div><button class="x" data-a="mat-gen" data-id="${esc(m.id)}" aria-label="Proponer tarjetas de nuevo">🔁</button><button class="x" data-a="mat-pedido" data-id="${esc(m.id)}" aria-label="Copiar pedido para Claude">📋</button><button class="x" data-a="mat-del" data-id="${esc(m.id)}" aria-label="Borrar material">✕</button></div>`).join("")}</section>` : "")
        + `<section class="card"><h3>Tarjetas</h3>${c.n > 8 ? `<input type="search" data-c="filtro" placeholder="Buscar en este mazo…" value="${esc(filtro)}" aria-label="Buscar tarjetas">` : ""}${ts.length ? ts.slice(0, lim).map(t => editar === t.id ? `<form data-f="tarjeta-guardar" data-id="${esc(t.id)}"><textarea name="t" rows="2" required aria-label="Frente">${esc(t.t)}</textarea><textarea name="a" rows="2" required aria-label="Dorso">${esc(t.a)}</textarea><button class="pri">Guardar</button><button type="button" class="x" data-a="tj-edit" data-id="">Cancelar</button></form>` : `<div class="fila"><div class="tx"><span>${esc(t.t)}</span><small>${esc(t.a)}</small><small>${TIPOS[t.tp] || ""} · ${t.ul ? "próximo repaso " + dmy(t.v) : "nueva"}</small></div><button class="x" data-a="tj-edit" data-id="${esc(t.id)}" aria-label="Editar">✏️</button><button class="x" data-a="tj-del" data-id="${esc(t.id)}" aria-label="Borrar">✕</button></div>`).join("") + (ts.length > lim ? `<button data-a="mas">Ver más (${ts.length - lim})</button>` : "") : `<p class="vacio">${c.n ? "Ninguna coincide." : "Todavía no hay tarjetas."}</p>`}</section>`;
    } else {
      vista = "inicio"; const n = cola(null, hoy).length, ultimos = d.ex.slice(0, 5);
      h += `<section class="card"><div class="fila"><h3>Hoy</h3><button class="chip" data-a="guia">❓ Guía</button></div><p>${n ? n + (n === 1 ? " tarjeta para repasar" : " tarjetas para repasar") : d.t.length ? "No tenés nada para repasar. 🎉" : "Armá tu primer mazo."}</p><div class="fila-b"><button class="pri" data-a="repasar" data-z=""${n ? "" : " disabled"}>Repasar todo (${n})</button><button data-a="examen" data-z="">📝 Tomar examen</button></div></section>`
        + (d.z.length ? d.z.map(z => { const c = conteo(z.id, hoy); return `<section class="card"><div class="fila"><div class="tx"><span>${esc(z.n)}</span><small>${c.n} tarjetas · ${c.venc} para repasar · ${c.nuevas} nuevas${z.m && nomMateria(z.m) ? " · 📚 " + esc(nomMateria(z.m)) : ""}</small></div><button data-a="abrir" data-z="${esc(z.id)}">Abrir</button></div></section>`; }).join("") : `<p class="vacio">Todavía no hay mazos.</p>`)
        + `<section class="card"><form data-f="mazo-nuevo"><div class="fila-b"><input name="n" placeholder="Nuevo mazo (ej: Biología unidad 1)" required autocomplete="off" aria-label="Nombre del mazo"><button>＋ Mazo</button></div>${mats.length ? `<select name="m" aria-label="Materia de Estudio"><option value="">Sin materia</option>${mats.map(m => `<option value="${esc(m.id)}">${esc(m.n)}</option>`).join("")}</select>` : ""}</form></section>`
        + (ultimos.length ? `<section class="card"><h3>Últimos exámenes</h3>${ultimos.map(e => `<div class="fila"><div class="tx"><span>${esc(e.n)}</span><small>${dmy(e.f)} · ${e.ok}/${e.p} bien</small></div><b>${fmtNota(e.nota)}</b></div>`).join("")}</section>` : "")
        + `<section class="card"><form data-f="np"><div class="fila-b"><label class="tx"><span>Tarjetas nuevas por día</span><small>Las que ya viste y vencen no tienen tope.</small></label><input type="number" name="n" min="0" max="200" value="${NUEVAS()}" aria-label="Tarjetas nuevas por día"><button>Guardar</button></div></form></section>`;
    }
    el.innerHTML = h;
    const listo = () => SB.pintar();
    eventos(el, {
      a: (a, n) => {
        const z = n.dataset.z;
        if (a === "ir") { vista = n.dataset.v === "mazo" && mazo(mz) ? "mazo" : "inicio"; rep = exm = cand = null; editar = ""; filtro = ""; lim = 40; }
        else if (a === "guia") vista = "guia";
        else if (a === "abrir") { mz = z; vista = "mazo"; filtro = ""; lim = 40; editar = ""; }
        else if (a === "repasar") { if (z) mz = z; empezarRepaso(z ? [z] : null); }
        else if (a === "mostrar" && rep) rep.mostrar = true;
        else if (a === "nota" && rep) { const t = D().t.find(x => x.id === rep.ids[rep.i]), q = +n.dataset.q; if (t) { calificar(t, q, ymd()); sumar2(ymd(), q >= 2); rep.vistas++; if (q >= 2) rep.bien++; if (q === 0 && (rep.otra[t.id] || 0) < 3) { rep.otra[t.id] = (rep.otra[t.id] || 0) + 1; rep.ids.push(t.id); } guardar(); } rep.i++; rep.mostrar = false; }
        else if (a === "salir-repaso") { rep = null; vista = mz && mazo(mz) ? "mazo" : "inicio"; }
        else if (a === "examen") { if (z) mz = z; vista = "exam-cfg"; }
        else if (a === "salir-examen") { if (confirm("¿Salir del examen? Se pierde lo respondido.")) { exm = null; vista = mz && mazo(mz) ? "mazo" : "inicio"; } }
        else if (a === "opcion" && exm) exm.resp[exm.i] = +n.dataset.i;
        else if (a === "vf" && exm) exm.resp[exm.i] = n.dataset.v === "1";
        else if (a === "revelar" && exm) exm.resp[exm.i] = Object.assign({}, exm.resp[exm.i], {rev: true});
        else if ((a === "acerte" || a === "falle") && exm) exm.resp[exm.i] = Object.assign({}, exm.resp[exm.i], {rev: true, ok: a === "acerte"});
        else if (a === "siguiente" && exm) { const p = exm.ps[exm.i], r = exm.resp[exm.i]; if (r === undefined || (p.ty === "es" && (!r || r.ok === undefined))) return; exm.i + 1 >= exm.ps.length ? terminarExamen() : exm.i++; }
        else if (a === "repasar-fallos" && exm && exm.res) { const ids = exm.res.mal; if (!empezarRepaso(null, ids)) vista = "examen"; }
        else if (a === "ia-cancelar") { if (trab && trab.ctrl) trab.ctrl.abort(); }
        else if (a === "ia-gen" && cand && !trab) { const ctrl = new AbortController(), mio = cand; trab = {tipo: "gen", txt: "Preparando…", ctrl};
          generarConIA(mio.texto, {signal: ctrl.signal, onProgreso: (i, k) => { if (trab && trab.ctrl === ctrl) { trab.txt = "Parte " + i + " de " + k + "…"; listo(); } }})
            .then(r => { trab = null; const ya = new Set(mio.items.map(x => norm(x.t))), nu = r.items.filter(x => !ya.has(norm(x.t))); mio.items = mio.items.concat(nu); msgErr = !!r.error;
              msg = "La IA propuso " + nu.length + (nu.length === 1 ? " tarjeta nueva" : " tarjetas nuevas") + (nu.some(x => x.rev) ? " (las marcadas con ⚠️ quedaron sin tildar)" : "") + (r.fallidas ? "; " + r.fallidas + (r.fallidas === 1 ? " parte no se pudo leer" : " partes no se pudieron leer") : "") + (r.total > r.partes ? ". El material es largo: usé las primeras " + r.partes + " partes de " + r.total : "") + (r.error ? ". Se cortó: " + r.error : "") + "."; listo(); })
            .catch(e => { trab = null; msgErr = true; msg = e.message; listo(); }); }
        else if (a === "ia-corregir" && exm && !trab) { const pq = exm.ps[exm.i], r0 = exm.resp[exm.i], txt = r0 && r0.txt ? r0.txt : "", mio = exm, i = exm.i;
          if (!txt.trim()) { msgErr = true; msg = "Escribí tu respuesta primero."; } else { const ctrl = new AbortController(); trab = {tipo: "corr", ctrl};
            corregirConIA(pq.q, pq.resp, txt, {signal: ctrl.signal}).then(v => { trab = null; mio.resp[i] = {txt, rev: true, ok: v.ok, ia: v.expl}; listo(); }).catch(e => { trab = null; msgErr = true; msg = e.message; listo(); }); } }
        else if (a === "ia-expl" && exm && exm.listo && !trab) { const i = +n.dataset.i, pq = exm.ps[i], mio = exm; if (pq) { const ctrl = new AbortController(); trab = {tipo: "expl", i, ctrl};
          explicarConIA(pq.ty === "vf" ? pq.q + " (se mostraba: " + pq.mostrar + ")" : pq.q, realResp(pq), textosFallo(pq, mio.resp[i]).mia, {signal: ctrl.signal}).then(t => { trab = null; (mio.expl = mio.expl || {})[i] = t; listo(); }).catch(e => { trab = null; msgErr = true; msg = e.message; listo(); }); } }
        else if (a === "mazo-ren") { const x = mazo(mz), v = x && prompt("Nombre del mazo:", x.n); if (v && v.trim()) { x.n = v.trim().slice(0, 60); guardar(); } }
        else if (a === "mazo-del") { const x = mazo(mz), ts = D().t.filter(t => t.z === mz), grande = ts.length > 150;
          if (x && confirm(grande ? "«" + x.n + "» tiene " + ts.length + " tarjetas: es demasiado grande para la Papelera, así que se borra sin vuelta atrás. ¿Seguro?" : "¿Borrar «" + x.n + "» con sus " + ts.length + " tarjetas? Podés devolverlas desde la Papelera durante 30 días.")) { if (grande) { x._sinPapelera = 1; ts.forEach(t => { t._sinPapelera = 1; }); D().mt.filter(m => m.z === mz).forEach(m => { m._sinPapelera = 1; }); }
            D().z = D().z.filter(y => y !== x); D().t = D().t.filter(t => t.z !== mz); D().mt = D().mt.filter(m => m.z !== mz); guardar(); vista = "inicio"; mz = ""; } }
        else if (a === "tj-edit") editar = n.dataset.id;
        else if (a === "tj-del") { D().t = D().t.filter(t => t.id !== n.dataset.id); guardar(); }
        else if (a === "mas") lim += 40;
        else if (a === "mat-del") { D().mt = D().mt.filter(m => m.id !== n.dataset.id); guardar(); }
        else if (a === "mat-gen") { const m = D().mt.find(x => x.id === n.dataset.id); if (m) { cand = {nombre: m.n, texto: m.x, pdf: false, op: {d: true, p: true, c: true, s: false}, items: generar(m.x), z: mz, guardado: true}; vista = "cand"; } }
        else if (a === "mat-pedido" || a === "copiar-pedido") { const m = a === "mat-pedido" ? D().mt.find(x => x.id === n.dataset.id) : null; portapapeles(pedidoClaude(m ? m.x : "[pegá acá tu material]")).then(ok => { msg = ok ? "Pedido copiado. Pegalo en una conversación con Claude y después traé las tarjetas con «Pegar tarjetas ya hechas»." : "No pude copiar automáticamente."; listo(); }); return; }
        else if (a === "cand-todas" && cand) { const t = !cand.items.every(x => x.ok); cand.items.forEach(x => { x.ok = t; }); }
        else if (a === "cand-guardar" && cand) { const n2 = agregarTarjetas(cand.items.filter(x => x.ok), cand.z); guardar(); msg = n2 + (n2 === 1 ? " tarjeta agregada." : " tarjetas agregadas.") + (n2 < cand.items.filter(x => x.ok).length ? " Las repetidas no se duplican." : ""); vista = "mazo"; cand = null; }
        listo();
      },
      c: (a, n) => {
        if (a === "archivo" && n.files && n.files[0]) { const f = n.files[0]; cargando = true; listo();
          leerArchivo(f).then(r => { const x = r.x.length > MAXTX ? r.x.slice(0, MAXTX) : r.x; cargando = false; if (!x.trim()) { msg = "El archivo no tiene texto."; return listo(); }
            const t = r.pdf ? reflujo(x) : x; if (!D().mt.some(m => m.z === mz && m.n === r.n && m.x === t)) { D().mt.unshift({id: uid(), z: mz, n: r.n, x: t, c: Date.now()}); guardar(); }
            cand = {nombre: r.n, texto: t, pdf: r.pdf, op: {d: true, p: true, c: true, s: false}, items: generar(t), z: mz}; vista = "cand"; listo(); })
            .catch(e => { cargando = false; msg = e && e.message ? e.message : "No pude leer el archivo."; listo(); }); return; }
        if (a === "cand-sel" && cand) { const x = cand.items[+n.dataset.i]; if (x) x.ok = n.checked; return listo(); }
        if (a === "filtro") { filtro = n.value; lim = 40; return listo(); }
        if (a === "materia") { const z = mazo(mz); if (z) { z.m = n.value; guardar(); } return listo(); }
        if (a === "escrita" && exm) exm.resp[exm.i] = Object.assign({}, exm.resp[exm.i], {txt: n.value.slice(0, 500)});
      },
      f: (a, fm) => {
        const v = k => fm.elements[k].value.trim();
        if (a === "mazo-nuevo") { if (v("n")) { const z = {id: uid(), n: v("n").slice(0, 60), m: fm.elements.m ? fm.elements.m.value : "", c: Date.now()}; D().z.push(z); guardar(); mz = z.id; vista = "mazo"; } }
        else if (a === "tarjeta-nueva") { if (v("t") && v("a")) { agregarTarjetas([{t: v("t"), a: v("a"), tp: "m"}], mz); guardar(); msg = "Tarjeta agregada."; } }
        else if (a === "tarjeta-guardar") { const t = D().t.find(x => x.id === fm.dataset.id); if (t && v("t") && v("a")) { t.t = v("t").slice(0, 400); t.a = v("a").slice(0, 700); guardar(); } editar = ""; }
        else if (a === "importar") { const its = parsearTarjetas(fm.elements.x.value), n = agregarTarjetas(its, mz); guardar(); msg = its.length ? n + (n === 1 ? " tarjeta importada." : " tarjetas importadas.") + (n < its.length ? " Las repetidas no se duplican." : "") : "No encontré tarjetas: usá «frente ;; dorso», una por línea."; }
        else if (a === "texto-material") { const x = fm.elements.x.value.trim(); if (!x) { msg = "Pegá algún texto primero."; } else { const tx = x.slice(0, MAXTX), nom = v("n") || "Texto pegado"; D().mt.unshift({id: uid(), z: mz, n: nom.slice(0, 80), x: tx, c: Date.now()}); guardar(); cand = {nombre: nom, texto: tx, pdf: false, op: {d: true, p: true, c: true, s: false}, items: generar(tx), z: mz}; vista = "cand"; } }
        else if (a === "gen-opts" && cand) { cand.op = {d: !!fm.elements.d.checked, p: !!fm.elements.p.checked, c: !!fm.elements.c.checked, s: !!fm.elements.s.checked}; cand.items = generar(cand.texto, cand.op); }
        else if (a === "exam-ir") { const zz = v("z"), ok = empezarExamen(zz ? [zz] : null, +v("n") || 10, v("tipo") || "op"); if (zz) mz = zz; if (!ok) vista = "exam-cfg"; }
        else if (a === "np") { const n = Math.round(+v("n")); if (Number.isInteger(n) && n >= 0 && n <= 200) { D().np = n; guardar(); msg = "Listo."; } }
        listo();
      }
    });
  }
});
})();
