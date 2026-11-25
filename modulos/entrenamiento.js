/* Módulo Entrenamiento. Datos:
   rutina: [{id, n «Torso A», ej: [{id, n, s series, a reps mínimas, b reps máximas, i cuánto subir (kg), p 1 si es un ejercicio principal, x nota de técnica, m músculos (opcional: ids de MUS; si falta se adivinan por el nombre)}]}]  (el orden es la rotación)
   ses: [{id, n día, d id del día, f fecha, ej: [{e id del ejercicio, n nombre, s: [{k kg, r reps, ok 1 si la hiciste}]}], x nota, fin cuándo la terminaste (0 = en curso), t}]
   p: {AAAA-MM-DD: gramos de proteína}, pm meta diaria, rev fecha de la última revisión de progresión.
   Progresión doble: si hiciste todas las series en el tope del rango con el mismo peso, la próxima te propone subir; si no, intentá una repetición más.
   Hoy aparece hasta cumplir las sesiones de la semana (tantas como días tiene tu rutina, de lunes a domingo): no hay días fijos, así se adapta a turnos que cambian. */
(function () {
const {esc, norm, ymd, uid, sumar, dmy, eventos} = SB.u, D = () => SB.datos("entrenamiento");
const dow = f => new Date(f + "T12:00:00").getDay();
const lunes = f => sumar(f, -((dow(f) + 6) % 7));
const fmt = n => Number(n).toLocaleString("es-AR", {maximumFractionDigits: 1});
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.min(2000, Math.round(n * 100) / 100) : 0; };
const ent = (v, mx) => { const n = Math.round(parseFloat(v)); return Number.isFinite(n) && n > 0 ? Math.min(mx, n) : 0; };
const hace = f => { const d = Math.round((new Date(ymd() + "T12:00:00") - new Date(f + "T12:00:00")) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "ayer" : "hace " + d + " días"; };
let tab = "hoy", dia = "", edit = "";   // pestaña, día elegido para empezar, ejercicio que se está editando

/* ---------- cuentas ---------- */
const abierta = () => D().ses.find(s => !s.fin);
const hechas = () => D().ses.filter(s => s.fin).sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : a.fin - b.fin);   // de la más vieja a la más nueva
const oks = e => (e.s || []).filter(x => x.ok && x.r > 0);
const e1rm = (kg, r) => Math.round((r === 1 ? kg : kg * (1 + r / 30)) * 10) / 10;                              // Epley: sirve para comparar series con distinto peso y repeticiones
const mejor1RM = e => oks(e).reduce((m, x) => Math.max(m, x.k > 0 ? e1rm(x.k, x.r) : 0), 0);
const volumen = s => s.ej.reduce((t, e) => t + oks(e).reduce((u, x) => u + x.k * x.r, 0), 0);
const rango = ex => { const a = ent(ex.a, 50) || 6, b = Math.max(a, ent(ex.b, 50) || 8); return [a, b]; };
const incr = ex => num(ex.i) || 2.5;
const sesionesSemana = f => { const l = lunes(f), h = sumar(l, 6); return hechas().filter(s => s.f >= l && s.f <= h).length; };
const ultima = ejId => { const h = hechas(); for (let i = h.length - 1; i >= 0; i--) { const e = h[i].ej.find(x => x.e === ejId && oks(x).length); if (e) return {f: h[i].f, e}; } return null; };
/* Qué proponerte para la próxima vez de un ejercicio: series copiadas de la última, o subir el peso si ya llegaste al tope del rango en todas. */
function plan(ex) {
  const [a, b] = rango(ex), n = ent(ex.s, 10) || 3, u = ultima(ex.id);
  if (!u) return {sets: Array.from({length: n}, () => ({k: 0, r: a})), subir: false, hint: "Primera vez: elegí un peso con el que llegues a " + a + "–" + b + " repeticiones."};
  const s = oks(u.e), top = Math.max(...s.map(x => x.k)), enTope = s.length >= n && s.every(x => x.k >= top && x.r >= b);
  if (enTope) return {sets: Array.from({length: n}, () => ({k: top + incr(ex), r: a})), subir: true, hint: "Llegaste a " + b + " en todas: subí a " + fmt(top + incr(ex)) + " kg."};
  const sets = Array.from({length: n}, (_, i) => { const x = s[i] || s[s.length - 1]; return {k: x.k, r: x.r}; });
  return {sets, subir: false, hint: (top ? "Objetivo: " + fmt(top) + " kg, " : "Objetivo: ") + "una repetición más que la última vez."};
}
function proximoDia() { const R = D().rutina; if (!R.length) return null; const h = hechas(), u = h[h.length - 1]; if (!u) return R[0]; const i = R.findIndex(x => x.id === u.d); return R[i < 0 ? 0 : (i + 1) % R.length]; }
/* Récord = una sesión en la que el mejor 1RM estimado de un ejercicio supera a todas las anteriores. La primera vez que lo hacés no cuenta (es tu punto de partida). */
function records() { const mejor = {}, out = new Set(); hechas().forEach(s => s.ej.forEach(e => { const b = mejor1RM(e); if (!b) return; if (mejor[e.e] !== undefined && b > mejor[e.e]) out.add(s.id + "|" + e.e); mejor[e.e] = Math.max(mejor[e.e] || 0, b); })); return out; }
const historia = ejId => hechas().map(s => ({f: s.f, v: mejor1RM(s.ej.find(x => x.e === ejId) || {s: []})})).filter(x => x.v > 0);
function chispa(vals) {
  if (vals.length < 2) return ""; const W = 120, H = 30, mn = Math.min(...vals), mx = Math.max(...vals), d = mx - mn || 1;
  const pts = vals.map((v, i) => [Math.round(i * (W - 8) / (vals.length - 1) + 4), Math.round(H - 5 - (v - mn) / d * (H - 10))]);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución del 1RM estimado" style="display:block"><polyline fill="none" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => p.join(",")).join(" ")}" style="stroke:var(--navy)"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3" style="fill:var(--ok)"/></svg>`;
}
const PLANTILLA = [["Torso A", [["Press banca", 3, 6, 8, 1], ["Remo con barra", 3, 6, 8, 1], ["Press militar", 3, 8, 10, 0], ["Jalón al pecho", 3, 8, 12, 0]]], ["Pierna A", [["Sentadilla", 3, 6, 8, 1], ["Hip thrust", 3, 8, 10, 0], ["Curl femoral", 3, 10, 12, 0]]],
  ["Torso B", [["Press inclinado", 3, 6, 8, 1], ["Remo en polea", 3, 8, 10, 0], ["Elevaciones laterales", 3, 12, 15, 0], ["Press francés", 3, 10, 12, 0]]], ["Pierna B", [["Peso muerto rumano", 3, 6, 8, 1], ["Prensa", 3, 8, 12, 0], ["Gemelos", 3, 12, 15, 0]]]];
const sembrar = () => { PLANTILLA.forEach(([n, ejs]) => D().rutina.push({id: uid(), n, ej: ejs.map(([n2, s, a, b, p]) => ({id: uid(), n: n2, s, a, b, i: 2.5, p, x: ""}))})); SB.guardar("entrenamiento"); };
/* ---------- recuperación muscular ----------
   Cada ejercicio de la rutina puede llevar sus músculos (e.m: lista de ids de MUS). Si no los cargaste, se adivinan por el nombre (adivinar), así sirve también para calistenia.
   Un músculo está «recuperado» cuando pasaron sus horas de descanso desde el fin de la última sesión en la que lo trabajaste: por defecto las de MUS (72 h los grupos grandes, 48 h los chicos), que el usuario puede cambiar por músculo (rec: {idMúsculo: {h}}).
   Son tiempos prudentes y varían con el ejercicio, la intensidad, la experiencia y el sueño: es una guía simple, no un diagnóstico. */
const MUS = {pecho: ["Pecho", 72], espalda: ["Espalda", 72], hombros: ["Hombros", 48], biceps: ["Bíceps", 48], triceps: ["Tríceps", 48], core: ["Abdomen y core", 48],
  cuadriceps: ["Cuádriceps", 72], isquios: ["Isquios", 72], gluteos: ["Glúteos", 72], gemelos: ["Gemelos", 48]};   // [nombre, horas de descanso por defecto]
const OPC_HORAS = [24, 36, 48, 60, 72, 96];
const horas = k => { const h = ((D().rec || {})[k] || {}).h; return h > 0 && h <= 240 ? h : MUS[k][1]; };   // las del usuario si las cambió, si no las de MUS
const REGLAS = [   // [palabras del nombre (sin tildes), músculos]; valen todas las que coincidan
  [/femoral|isquio|peso muerto rumano|rumano|good morning|nordic/, ["isquios", "gluteos"]],
  [/hip thrust|puente de gluteo|puente gluteo|patada de gluteo|gluteo/, ["gluteos"]],
  [/sentadilla|prensa|zancada|bulgara|estocada|cuadriceps|pistol|step.?up|hack/, ["cuadriceps", "gluteos"]],
  [/gemelo|pantorrilla|talones/, ["gemelos"]],
  [/peso muerto(?! rumano)/, ["espalda", "isquios", "gluteos"]],
  [/remo|jalon|dominada|pull.?up|chin.?up|muscle.?up|australian|pullover/, ["espalda", "biceps"]],
  [/face pull/, ["espalda", "hombros"]],
  [/curl(?! femoral)|biceps|martillo/, ["biceps"]],
  [/press militar|press de hombro|hombro|elevacion(es)? lateral|elevacion(es)? frontal|pajaro|arnold|pino|handstand|pike/, ["hombros"]],
  [/press banca|press de banca|press inclinado|press declinado|press plano|aperturas|cruces|pec deck|flexion|push.?up|fondos|dips/, ["pecho"]],
  [/press banca|press de banca|press inclinado|press declinado|press plano|press militar|arnold|flexion|push.?up|fondos|dips|triceps|press frances|copa|jm press|diamante|pino|handstand/, ["triceps"]],
  [/abdominal|plancha|crunch|\bcore\b|elevacion(es)? de piernas|hollow|l.?sit|rueda|ab wheel|russian|rotacion/, ["core"]]
];
const adivinar = nombre => { const t = norm(nombre || ""), out = []; REGLAS.forEach(([rx, ms]) => { if (rx.test(t)) ms.forEach(m => { if (!out.includes(m)) out.push(m); }); }); return out; };
const musculos = ex => Array.isArray(ex.m) && ex.m.some(k => MUS[k]) ? ex.m.filter(k => MUS[k]) : adivinar(ex.n);
const ultimoMusculo = () => { const R = D().rutina.flatMap(x => x.ej), out = {};
  hechas().forEach(s => s.ej.forEach(e => { if (!oks(e).length) return; musculos(R.find(x => x.id === e.e) || {n: e.n}).forEach(m => { if (!out[m] || s.fin > out[m]) out[m] = s.fin; }); })); return out; };
const recuperacion = (ahora = Date.now()) => { const u = ultimoMusculo();
  return Object.keys(u).map(k => { const listo = u[k] + horas(k) * 36e5; return {k, n: MUS[k][0], fin: u[k], listo, falta: Math.max(0, Math.ceil((listo - ahora) / 36e5)), ok: ahora >= listo}; }).sort((a, b) => a.listo - b.listo); };
const enRecuperacion = dia => { const r = recuperacion(); return [...new Set(dia.ej.flatMap(musculos))].map(k => r.find(x => x.k === k)).filter(x => x && !x.ok); };
const notaDia = dia => { const mal = enRecuperacion(dia); if (mal.length) return `<p class="ayuda">⚠️ Todavía en recuperación: ${mal.map(x => esc(x.n.toLowerCase()) + " (" + x.falta + " h)").join(", ")}. Si querés, elegí otro día.</p>`;
  const r = recuperacion(); return dia.ej.flatMap(musculos).some(k => r.find(x => x.k === k)) ? `<p class="ayuda">✅ Los músculos de este día ya se recuperaron.</p>` : ""; };
/* Mapa del cuerpo (de frente y de espalda): amarillo = en recuperación, verde = podés entrenarlo. Tocá un músculo para ver el detalle.
   Cada región se dibuja la mitad izquierda y se espeja para la derecha; viewBox centrado en x=100 por figura (la de espalda se corre 220). */
const BASE = ["M94 36 C80 38 66 40 58 50 L60 74 C64 90 72 106 79 120 L84 126 H116 L121 120 C128 106 136 90 140 74 L142 50 C134 40 120 38 106 36 Z", "M80 118 H120 L125 136 H75 Z", "M53 98 C50 110 48 122 49 132 L58 134 C60 122 62 110 63 98 Z", "M80 194 C78 206 79 216 82 226 L93 226 C96 216 97 206 97 194 Z"];
const FRENTE = [["hombros", "M80 38 C70 36 60 40 56 50 C54 58 58 64 64 64 C66 54 72 48 82 46 Z", 1], ["pecho", "M99 44 C92 42 84 44 80 48 C74 52 70 60 72 68 C80 72 92 72 99 68 Z", 1],
  ["biceps", "M56 66 C52 74 51 86 53 96 L63 96 C65 86 66 74 66 66 Z", 1], ["core", "M82 74 H118 V104 C118 112 110 120 100 120 C90 120 82 112 82 104 Z", 0],
  ["cuadriceps", "M82 130 C76 150 76 172 80 192 L97 192 C99 172 99 150 99 130 Z", 1]];
const ESPALDA = [["hombros", "M80 38 C70 36 60 40 56 50 C54 58 58 64 64 64 C66 54 72 48 82 46 Z", 1], ["espalda", "M99 40 C90 40 80 44 74 50 C72 66 76 90 86 106 C90 110 96 112 99 112 Z", 1],
  ["triceps", "M56 66 C52 74 51 86 53 96 L63 96 C65 86 66 74 66 66 Z", 1], ["gluteos", "M81 114 C77 128 84 142 99 142 L99 114 Z", 1],
  ["isquios", "M80 146 C76 160 77 178 80 192 L97 192 C99 176 99 160 99 146 Z", 1], ["gemelos", "M80 196 C76 206 78 218 83 226 L94 226 C98 216 99 206 97 196 Z", 1]];
const COLOR = {rec: "#f2c230", ok: "#3fb06a"};
let musSel = "", ajustando = false;   // músculo tocado en el mapa / panel de horas de descanso abierto
const estadoMus = (k, r) => { const x = r.find(y => y.k === k); return x && !x.ok ? "rec" : "ok"; };
const detalleMus = (k, r, ahora) => { const x = r.find(y => y.k === k), n = MUS[k][0];
  if (!x) return n + ": listo para entrenar (todavía no lo trabajaste).";
  return x.ok ? n + ": listo para entrenar (se recuperó " + hace(ymd(new Date(x.listo))) + ")." : n + ": en recuperación, faltan " + x.falta + " h (entrenado " + hace(ymd(new Date(x.fin))) + ")."; };
const figura = (regiones, r, marcados, dx, titulo) => { const un = d => `<path d="${d}" style="fill:var(--fill,#d9dde3);stroke:rgba(0,0,0,.3);stroke-width:.8"/>`;
  const reg = ([k, d, sim]) => { const e = estadoMus(k, r), resalta = marcados.has(k), t = detalleMus(k, r), est = `fill:${COLOR[e]};stroke:${resalta ? "currentColor" : "rgba(0,0,0,.35)"};stroke-width:${resalta ? 2.4 : .8}`;
    return `<g data-a="mus" data-k="${k}" role="button" tabindex="0" aria-label="${esc(t)}" style="cursor:pointer"><title>${esc(t)}</title><path d="${d}" style="${est}"/>${sim ? `<path d="${d}" transform="translate(200 0) scale(-1 1)" style="${est}"/>` : ""}</g>`; };
  const espejo = d => `<path d="${d}" style="fill:var(--fill,#d9dde3);stroke:rgba(0,0,0,.3);stroke-width:.8"/><path d="${d}" transform="translate(200 0) scale(-1 1)" style="fill:var(--fill,#d9dde3);stroke:rgba(0,0,0,.3);stroke-width:.8"/>`;
  return `<g transform="translate(${dx} 0)"><circle cx="100" cy="16" r="11" style="fill:var(--fill,#d9dde3);stroke:rgba(0,0,0,.3);stroke-width:.8"/><rect x="94" y="26" width="12" height="11" style="fill:var(--fill,#d9dde3)"/>
    ${un(BASE[0])}${un(BASE[1])}${espejo(BASE[2])}${espejo(BASE[3])}${regiones.map(reg).join("")}
    ${regiones.some(x => x[0] === "core") ? `<path d="M100 74 V118 M84 86 H116 M84 98 H116 M86 110 H114" style="fill:none;stroke:rgba(0,0,0,.35);stroke-width:.8;pointer-events:none"/>` : ""}
    <text x="100" y="244" text-anchor="middle" style="font-size:11px;fill:currentColor">${titulo}</text></g>`; };
const tarjetaRec = elegido => { const ahora = Date.now(), r = recuperacion(ahora), marcados = new Set(elegido ? elegido.ej.flatMap(musculos) : []), rec = r.filter(x => !x.ok);
  return `<section class="card"><h3>💪 Recuperación muscular</h3>
    <svg viewBox="40 0 340 250" role="group" aria-label="Mapa del cuerpo de frente y de espalda" style="width:100%;max-width:420px;display:block;margin:0 auto">${figura(FRENTE, r, marcados, 0, "Frente")}${figura(ESPALDA, r, marcados, 220, "Espalda")}</svg>
    <div class="ley"><i style="background:${COLOR.rec};color:#000">🟡 En recuperación</i><i style="background:${COLOR.ok};color:#000">🟢 Podés entrenarlo</i></div>
    ${musSel && MUS[musSel] ? `<p class="ayuda"><b>${esc(detalleMus(musSel, r, ahora))}</b></p>` : `<small>Tocá un músculo para ver el detalle.${marcados.size ? " Contorno oscuro: lo que trabaja el día elegido." : ""}</small>`}
    ${rec.length ? rec.map(x => `<div class="fila"><div class="tx"><span>🟡 ${esc(x.n)}</span><small>faltan ${x.falta} h</small></div></div>`).join("") : `<small>No tenés músculos en recuperación: podés entrenar lo que quieras.</small>`}
    <small>Guía simple, por defecto 72 h para los grupos grandes y 48 h para los chicos. Depende del ejercicio, la intensidad y tu sueño: si dormiste mal o entrenaste al fallo, dale más tiempo.</small>
    <button type="button" class="link" data-a="rec-ajustar">⚙️ ${ajustando ? "Cerrar" : "Ajustar las horas de descanso"}</button>${ajustando ? panelHoras() : ""}</section>`; };
const panelHoras = () => `<form data-f="rec">${Object.keys(MUS).map(k => `<label class="fila"><span class="tx">${esc(MUS[k][0])}</span><select name="${k}" aria-label="Horas de descanso de ${esc(MUS[k][0])}">${[...new Set(OPC_HORAS.concat([horas(k)]))].sort((a, b) => a - b).map(h => `<option value="${h}"${h === horas(k) ? " selected" : ""}>${h} h${h === MUS[k][1] ? " (por defecto)" : ""}</option>`).join("")}</select></label>`).join("")}
  <div class="fila-b"><button class="pri">Guardar</button><button type="button" data-a="rec-reset">Valores por defecto</button></div></form>`;
function empezar(diaId) {
  const d = D().rutina.find(x => x.id === diaId); if (!d || abierta()) return;
  D().ses.unshift({id: uid(), n: d.n, d: d.id, f: ymd(), ej: d.ej.map(ex => ({e: ex.id, n: ex.n, s: plan(ex).sets.map(x => ({k: x.k, r: x.r, ok: 0}))})), x: "", fin: 0, t: Date.now()});
  SB.guardar("entrenamiento");
}
function terminar() {
  const s = abierta(); if (!s) return "";
  if (!s.ej.some(e => oks(e).length)) { if (!confirm("No marcaste ninguna serie como hecha. ¿Descartar la sesión?")) return ""; s._sinPapelera = 1; D().ses = D().ses.filter(x => x !== s); SB.guardar("entrenamiento"); return "descartada"; }
  s.ej.forEach(e => { e.s = e.s.filter(x => x.ok); }); s.ej = s.ej.filter(e => e.s.length);   // las series que no hiciste no quedan guardadas
  s.fin = Date.now(); s.f = s.f || ymd(); SB.guardar("entrenamiento"); return "terminada";
}

SB.registrar({
  id: "entrenamiento", nombre: "Entrenamiento", icono: "🏋️", esquema: 1,
  inicial: () => ({rutina: [], ses: [], p: {}, pm: 130, rev: "", rec: {}}), migraciones: {},
  sync: [{k: "rutina", orden: "asc"}, {k: "ses", orden: "desc", t: x => x.t || 0}, {k: "rec"}],
  util: {ejercicios: () => [...new Map(D().rutina.flatMap(d => d.ej).map(e => [norm(e.n), e.n])).values()],   // nombres de los ejercicios de la rutina (lo usa Objetivos)
    sesionesDesde: desde => hechas().filter(s => s.f >= desde && s.f <= ymd()).length,
    mejorMarca: (nombre, tipo) => { let b = 0; hechas().forEach(s => s.ej.forEach(e => { if (norm(e.n) === norm(nombre)) oks(e).forEach(x => { b = Math.max(b, tipo === "reps" ? x.r : x.k); }); })); return b; },   // la mejor serie hecha: kg o repeticiones
    recuperacion, musculos, adivinar, plan, proximoDia, e1rm, mejor1RM, volumen, records, historia, chispa, sesionesSemana, ultima, empezar, terminar, lunes},
  avisos() {   // «ya se recuperaron…»: un aviso por día en que algún músculo termina de recuperarse (sale ese día, no a la hora exacta)
    if (!SB.avisoActivo("recuperacion")) return []; const hoyF = ymd(), por = {};
    recuperacion().forEach(r => { const f = ymd(new Date(r.listo)); if (f >= hoyF) (por[f] = por[f] || []).push(r); });
    return Object.keys(por).sort().map(f => ({f, t: "Recuperación muscular", c: "Ya se recuperaron: " + por[f].map(r => r.n.toLowerCase()).join(", ") + ". Podés volver a entrenarlos.", k: "rec", solo: true, bg: true})); },
  hoy() {
    const d = D(), f = ymd(), out = [], a = abierta(), meta = d.rutina.length, n = sesionesSemana(f), hoyS = hechas().filter(s => s.f === f).pop();
    if (a) out.push({t: "Sesión en curso: " + a.n, s: "Tocá para seguir", ir: "#/entrenamiento", hecho: false});
    else if (hoyS) out.push({t: "Entrenaste hoy: " + hoyS.n, s: fmt(volumen(hoyS)) + " kg de volumen · " + n + "/" + meta + " esta semana", ir: "#/entrenamiento", hecho: true});
    else if (meta && n < meta) { const p = proximoDia(), u = hechas().pop(); out.push({t: "Entrenar: " + p.n, s: n + "/" + meta + " esta semana" + (u ? " · última vez " + hace(u.f) : "") + (enRecuperacion(p).length ? " · ⚠️ " + enRecuperacion(p).map(x => x.n.toLowerCase()).join(", ") + " en recuperación" : ""), ir: "#/entrenamiento", hecho: false}); }
    const base = d.rev || (hechas()[0] && hechas()[0].f);
    if (base && hechas().length >= 2 && Math.round((new Date(f + "T12:00:00") - new Date(base + "T12:00:00")) / 864e5) >= 14) out.push({t: "Revisá tu progresión", s: "Pasaron 2 semanas: mirá qué ejercicios están listos para subir", ir: "#/entrenamiento/progreso", hecho: false, tocar: () => { d.rev = f; SB.guardar("entrenamiento"); }});
    if (Object.keys(d.p).length) { const g = d.p[f] || 0; out.push({t: "Proteína de hoy", s: g + " de " + d.pm + " g", ir: "#/entrenamiento", hecho: g >= d.pm}); }
    return out;
  },
  buscar: q => { const k = norm(q), r = []; D().rutina.forEach(d => d.ej.forEach(e => { if (norm(e.n + " " + (e.x || "")).includes(k)) r.push({t: e.n, s: d.n + " · " + e.s + " × " + rango(e).join("–")}); }));
    hechas().filter(s => norm(s.n + " " + (s.x || "")).includes(k)).slice(-5).forEach(s => r.push({t: s.n + " · " + dmy(s.f), s: s.x || fmt(volumen(s)) + " kg de volumen"})); return r; },
  semana() {
    const d = D(); if (!d.rutina.length && !d.ses.length) return [];
    const f = ymd(), desde = sumar(f, -6), s7 = hechas().filter(s => s.f >= desde), out = [];
    out.push(s7.length ? "Entrenaste " + s7.length + (s7.length === 1 ? " vez" : " veces") + " en los últimos 7 días (meta: " + d.rutina.length + ") con " + fmt(s7.reduce((t, s) => t + volumen(s), 0)) + " kg de volumen." : "No registraste sesiones en los últimos 7 días.");
    const rec = records(), pr = []; s7.forEach(s => s.ej.forEach(e => { if (rec.has(s.id + "|" + e.e)) pr.push(e.n); })); if (pr.length) out.push("🏅 Récords: " + [...new Set(pr)].join(", ") + ".");
    const ps = Array.from({length: 7}, (_, i) => d.p[sumar(f, -i)]).filter(Boolean); if (ps.length) out.push("Proteína: " + Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) + " g por día en promedio (meta: " + d.pm + ").");
    return out;
  },
  pantalla(el, sub) {
    if (sub === "progreso") tab = "prog";
    const d = D(), f = ymd(), a = abierta(), R = d.rutina, sig = proximoDia(), rec = records();
    const chips = [["hoy", "🏋️ Hoy"], ["prog", "📈 Progreso"], ["rutina", "📋 Rutina"]];
    const nav = `<div class="chips">${chips.map(c => `<button class="chip${tab === c[0] ? " on" : ""}" data-a="tab" data-t="${c[0]}">${c[1]}</button>`).join("")}</div>`;
    let cuerpo = "", elegidoMapa = null;   // elegidoMapa: el día elegido, para resaltarlo en el mapa del cuerpo
    if (tab === "hoy") {
      if (a) {
        cuerpo = `<section class="card"><h3>${esc(a.n)} · ${dmy(a.f)}</h3><p class="ayuda">Tocá ✓ en cada serie que hagas. Los números vienen de la última vez: corregilos si hoy cambió algo.</p></section>` + a.ej.map((e, ei) => {
          const ex = R.flatMap(x => x.ej).find(x => x.id === e.e), p = ex ? plan(ex) : null;
          return `<section class="card"><div class="fila"><div class="tx"><span>${esc(e.n)}</span><small>${ex ? ex.s + " × " + rango(ex).join("–") + (ex.p ? " · principal" : "") : ""}${p ? " · " + esc(p.hint) : ""}</small>${ex && ex.x ? `<small>📝 ${esc(ex.x)}</small>` : ""}</div></div>` + e.s.map((x, si) => `<div class="serie"><span>${si + 1}</span><input type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" value="${x.k || ""}" data-c="k" data-e="${ei}" data-s="${si}" aria-label="Kilos de la serie ${si + 1}"> × <input type="number" inputmode="numeric" min="0" placeholder="reps" value="${x.r || ""}" data-c="r" data-e="${ei}" data-s="${si}" aria-label="Repeticiones de la serie ${si + 1}"><button class="chk${x.ok ? " on" : ""}" data-a="ok" data-e="${ei}" data-s="${si}" aria-label="Serie hecha">${x.ok ? "✓" : ""}</button></div>`).join("") +
            `<div class="fila-b"><button type="button" class="chip" data-a="mas" data-e="${ei}">＋ Serie</button>${e.s.length > 1 ? `<button type="button" class="chip" data-a="menos" data-e="${ei}">− Serie</button>` : ""}</div></section>`;
        }).join("") + `<section class="card"><textarea data-c="nota" rows="2" placeholder="Nota de la sesión (técnica, cómo te sentiste…)" aria-label="Nota de la sesión">${esc(a.x || "")}</textarea><button class="pri" data-a="terminar">✓ Terminar sesión</button><button class="x" data-a="descartar">Descartar</button></section>`;
      } else if (!R.length) {
        cuerpo = `<section class="card"><h3>Armá tu rutina</h3><p class="ayuda">Todavía no hay días cargados. Podés empezar con una plantilla de Torso y Pierna (A/B), editarla a tu gusto en la pestaña Rutina, o crear la tuya desde cero.</p><button class="pri" data-a="plantilla">Cargar plantilla Torso / Pierna</button></section>`;
      } else {
        const elegido = elegidoMapa = R.find(x => x.id === dia) || sig, u = hechas().pop(), n = sesionesSemana(f);
        cuerpo = `<section class="card"><h3>Esta semana: ${n} de ${R.length}</h3><p class="ayuda">${u ? "Última sesión: " + esc(u.n) + " (" + hace(u.f) + ")." : "Todavía no registraste ninguna sesión."} Toca: <b>${esc(sig.n)}</b>.</p>
          <div class="chips">${R.map(x => `<button class="chip${x.id === elegido.id ? " on" : ""}" data-a="dia" data-d="${esc(x.id)}">${esc(x.n)}</button>`).join("")}</div>
          ${elegido.ej.length ? `<p class="ayuda">${elegido.ej.map(e => esc(e.n)).join(" · ")}</p>${notaDia(elegido)}<button class="pri" data-a="empezar" data-d="${esc(elegido.id)}">Empezar ${esc(elegido.n)}</button>` : `<p class="vacio">Este día no tiene ejercicios: agregalos en la pestaña Rutina.</p>`}</section>`;
      }
      cuerpo += tarjetaRec(elegidoMapa);
      const g = d.p[f] || 0, pct = d.pm > 0 ? Math.min(100, Math.round(100 * g / d.pm)) : 0;
      cuerpo += `<section class="card"><h3>🥩 Proteína de hoy</h3><div class="gbar" role="img" aria-label="${g} de ${d.pm} gramos"><i style="width:${pct}%;background:${g >= d.pm ? "var(--ok)" : "var(--navy)"}"></i></div><p>${g} de ${d.pm} g</p>
        <div class="fila-b">${[20, 30, 40].map(n => `<button type="button" class="chip" data-a="prot" data-g="${n}">+${n} g</button>`).join("")}</div>
        <form data-f="prot"><div class="fila-b"><input type="number" inputmode="numeric" name="g" min="0" max="999" placeholder="Total del día (g)" value="${g || ""}" aria-label="Total de proteína del día"><button>Guardar total</button></div></form>
        <details><summary>Meta diaria</summary><form data-f="meta"><div class="fila-b"><input type="number" inputmode="numeric" name="m" min="1" max="500" value="${d.pm}" aria-label="Meta diaria de proteína"><button>Guardar</button></div></form></details></section>`;
    } else if (tab === "prog") {
      const lista = R.flatMap(x => x.ej.map(e => ({e, dia: x.n}))).filter(x => historia(x.e.id).length), h20 = hechas().slice(-12).reverse();
      cuerpo = lista.length ? lista.sort((x, y) => (y.e.p || 0) - (x.e.p || 0)).map(({e, dia}) => {
        const h = historia(e.id), v = h.map(x => x.v), p = plan(e), ult = v[v.length - 1], prev = v.length > 4 ? v[v.length - 5] : v[0], dif = Math.round((ult - prev) * 10) / 10;
        return `<section class="card"><div class="fila"><div class="tx"><span>${esc(e.n)}${e.p ? " ⭐" : ""}</span><small>${esc(dia)} · 1RM estimado ${fmt(ult)} kg${v.length > 1 ? " (" + (dif > 0 ? "▲ +" : dif < 0 ? "▼ " : "= ") + fmt(dif) + (v.length > 4 ? " en 5 sesiones" : " desde el inicio") + ")" : ""}</small>${p.subir ? `<small style="color:var(--ok)"><b>↑ ${esc(p.hint)}</b></small>` : ""}</div>${chispa(v.slice(-12))}</div></section>`;
      }).join("") : `<p class="vacio">El progreso aparece cuando termines tu primera sesión.</p>`;
      cuerpo += `<section class="card"><h3>Últimas sesiones</h3>${h20.length ? h20.map(s => `<details><summary>${dmy(s.f)} · ${esc(s.n)} · ${fmt(volumen(s))} kg${s.ej.some(e => rec.has(s.id + "|" + e.e)) ? " 🏅" : ""}</summary>${s.ej.map(e => `<p><b>${esc(e.n)}</b>${rec.has(s.id + "|" + e.e) ? " 🏅" : ""}<br><small>${oks(e).map(x => fmt(x.k) + "×" + x.r).join(" · ")}</small></p>`).join("")}${s.x ? `<p><small>📝 ${esc(s.x)}</small></p>` : ""}<button class="x" data-a="borrar" data-id="${esc(s.id)}">Borrar sesión</button></details>`).join("") : `<p class="vacio">Sin sesiones todavía.</p>`}</section>`;
      cuerpo += `<section class="card"><p class="ayuda">El 1RM estimado (fórmula de Epley) sirve para comparar series con distinto peso y repeticiones: no es un máximo real. Cada 2 semanas revisá qué ejercicios te propone subir.</p><button data-a="revisado">Ya revisé mi progresión</button></section>`;
    } else {
      cuerpo = R.map((x, di) => `<section class="card"><div class="fila"><div class="tx"><span>${esc(x.n)}</span><small>${x.ej.length} ejercicio${x.ej.length === 1 ? "" : "s"}</small></div><button class="x" data-a="dia-ren" data-d="${esc(x.id)}" aria-label="Renombrar">✏️</button><button class="x" data-a="dia-del" data-d="${esc(x.id)}" aria-label="Borrar el día">✕</button></div>` +
        x.ej.map((e, ei) => edit === e.id ? `<form data-f="ej-guardar" data-d="${esc(x.id)}" data-e="${esc(e.id)}"><input name="n" value="${esc(e.n)}" required aria-label="Nombre"><div class="fila-b"><input name="s" type="number" min="1" max="10" value="${ent(e.s, 10) || 3}" aria-label="Series"><input name="a" type="number" min="1" max="50" value="${rango(e)[0]}" aria-label="Reps mínimas"><input name="b" type="number" min="1" max="50" value="${rango(e)[1]}" aria-label="Reps máximas"></div><div class="fila-b"><input name="i" type="number" step="0.5" min="0.5" value="${incr(e)}" aria-label="Cuánto subir (kg)"><label class="fila"><input type="checkbox" name="p"${e.p ? " checked" : ""}><span class="tx">Principal</span></label></div><small>Músculos que trabaja (se usan para avisarte cuándo se recuperan):</small><div class="chips mus">${Object.keys(MUS).map(k => `<label class="chip${musculos(e).includes(k) ? "" : " off"}"><input type="checkbox" name="m" value="${k}"${musculos(e).includes(k) ? " checked" : ""} hidden><span>${MUS[k][0]}</span></label>`).join("")}</div><input name="x" value="${esc(e.x || "")}" placeholder="Nota de técnica" aria-label="Nota de técnica"><button class="pri">Guardar</button><button type="button" class="x" data-a="ej-edit" data-e="">Cancelar</button></form>`
          : `<div class="fila"><div class="tx"><span>${esc(e.n)}${e.p ? " ⭐" : ""}</span><small>${ent(e.s, 10) || 3} × ${rango(e).join("–")} · +${fmt(incr(e))} kg · 💪 ${esc(musculos(e).map(k => MUS[k][0]).join(", ") || "sin músculos")}${e.x ? " · 📝 " + esc(e.x) : ""}</small></div><button class="x" data-a="ej-sube" data-d="${esc(x.id)}" data-e="${esc(e.id)}" aria-label="Subir"${ei ? "" : " disabled"}>↑</button><button class="x" data-a="ej-edit" data-e="${esc(e.id)}" aria-label="Editar">✏️</button><button class="x" data-a="ej-del" data-d="${esc(x.id)}" data-e="${esc(e.id)}" aria-label="Borrar">✕</button></div>`).join("") +
        `<form data-f="ej-nueva" data-d="${esc(x.id)}"><div class="fila-b"><input name="n" placeholder="Nuevo ejercicio" required aria-label="Nuevo ejercicio"><button>＋</button></div></form></section>`).join("") +
        `<section class="card"><form data-f="dia-nueva"><div class="fila-b"><input name="n" placeholder="Nuevo día (ej: Torso A)" required aria-label="Nuevo día"><button>＋ Día</button></div></form>${R.length ? "" : `<button data-a="plantilla">Cargar plantilla Torso / Pierna</button>`}<p class="ayuda">El orden de los días es la rotación: después de uno viene el siguiente. Un ejercicio nuevo arranca en 3 × 6–8, subiendo 2,5 kg; ajustalo con ✏️.</p></section>`;
    }
    el.innerHTML = nav + cuerpo;
    el.querySelectorAll(".mus input").forEach(i => { i.onchange = () => i.parentNode.classList.toggle("off", !i.checked); });
    const ses = () => abierta(), guardar = () => SB.guardar("entrenamiento"), buscarEj = (id, hacer) => D().rutina.forEach(x => { const i = x.ej.findIndex(e => e.id === id); if (i >= 0) hacer(x, i); });
    eventos(el, {
      a: (a, n) => {
        const s = ses();
        if (a === "tab") { tab = n.dataset.t; edit = ""; }
        else if (a === "dia") dia = n.dataset.d;
        else if (a === "mus") musSel = musSel === n.dataset.k ? "" : n.dataset.k;
        else if (a === "rec-ajustar") ajustando = !ajustando;
        else if (a === "rec-reset") { D().rec = {}; guardar(); }
        else if (a === "empezar") empezar(n.dataset.d);
        else if (a === "ok" && s) { const x = s.ej[+n.dataset.e] && s.ej[+n.dataset.e].s[+n.dataset.s]; if (x) { x.ok = x.ok ? 0 : 1; guardar(); } }
        else if (a === "mas" && s) { const e = s.ej[+n.dataset.e]; if (e && e.s.length < 12) { const u = e.s[e.s.length - 1] || {k: 0, r: 0}; e.s.push({k: u.k, r: u.r, ok: 0}); guardar(); } }
        else if (a === "menos" && s) { const e = s.ej[+n.dataset.e]; if (e && e.s.length > 1) { e.s.pop(); guardar(); } }
        else if (a === "terminar") terminar();
        else if (a === "descartar" && s && confirm("¿Descartar la sesión en curso? No se guarda nada.")) { s._sinPapelera = 1; D().ses = D().ses.filter(x => x !== s); guardar(); }
        else if (a === "prot") { d.p[f] = Math.min(999, (d.p[f] || 0) + (+n.dataset.g || 0)); guardar(); }
        else if (a === "revisado") { d.rev = f; guardar(); }
        else if (a === "borrar" && confirm("¿Borrar esta sesión? Queda 30 días en la Papelera.")) { D().ses = D().ses.filter(x => x.id !== n.dataset.id); guardar(); }
        else if (a === "plantilla") sembrar();
        else if (a === "dia-ren") { const x = R.find(y => y.id === n.dataset.d), v = x && prompt("Nombre del día:", x.n); if (v && v.trim()) { x.n = v.trim().slice(0, 40); guardar(); } }
        else if (a === "dia-del") { const x = R.find(y => y.id === n.dataset.d); if (x && confirm("¿Borrar «" + x.n + "» y sus ejercicios? Las sesiones ya guardadas no se tocan.")) { d.rutina = R.filter(y => y !== x); guardar(); } }
        else if (a === "ej-edit") edit = n.dataset.e;
        else if (a === "ej-del") { buscarEj(n.dataset.e, (x, i) => { if (confirm("¿Borrar «" + x.ej[i].n + "» de la rutina? Sus sesiones ya guardadas no se tocan.")) { x.ej.splice(i, 1); guardar(); } }); }
        else if (a === "ej-sube") { buscarEj(n.dataset.e, (x, i) => { if (i > 0) { x.ej.splice(i - 1, 0, x.ej.splice(i, 1)[0]); guardar(); } }); }
        SB.pintar();
      },
      c: (a, n) => {
        const s = ses(); if (!s) return;
        if (a === "nota") { s.x = n.value.slice(0, 600); guardar(); return; }   // sin volver a dibujar la pantalla: no se pierde el foco
        const x = s.ej[+n.dataset.e] && s.ej[+n.dataset.e].s[+n.dataset.s]; if (!x) return;
        if (a === "k") x.k = num(n.value); else if (a === "r") x.r = ent(n.value, 100); else return;
        guardar();
      },
      f: (a, fm) => {
        const v = k => fm.elements[k].value.trim();
        if (a === "dia-nueva") { if (v("n")) { D().rutina.push({id: uid(), n: v("n").slice(0, 40), ej: []}); guardar(); } }
        else if (a === "ej-nueva") { const x = R.find(y => y.id === fm.dataset.d); if (x && v("n")) { x.ej.push({id: uid(), n: v("n").slice(0, 60), s: 3, a: 6, b: 8, i: 2.5, p: 0, x: ""}); guardar(); } }
        else if (a === "ej-guardar") { buscarEj(fm.dataset.e, (x, i) => { const e = x.ej[i], mn = ent(v("a"), 50) || 6; e.n = v("n").slice(0, 60) || e.n; e.s = ent(v("s"), 10) || 3; e.a = mn; e.b = Math.max(mn, ent(v("b"), 50) || 8); e.i = num(v("i")) || 2.5; e.p = fm.elements.p.checked ? 1 : 0; e.x = v("x").slice(0, 160); const ms = fm.querySelectorAll ? [...fm.querySelectorAll("input[name=m]:checked")].map(i => i.value).filter(k => MUS[k]) : []; if (ms.length) e.m = ms; else delete e.m; guardar(); }); edit = ""; }
        else if (a === "rec") { d.rec = d.rec || {}; Object.keys(MUS).forEach(k => { const e = fm.elements[k], h = e ? +e.value : 0; if (h > 0 && h <= 240 && h !== MUS[k][1]) d.rec[k] = {h}; else if (e) delete d.rec[k]; }); guardar(); ajustando = false; }
        else if (a === "prot") { const g = Math.min(999, Math.round(+v("g")) || 0); if (g) d.p[f] = g; else delete d.p[f]; guardar(); }
        else if (a === "meta") { const m = Math.min(500, Math.round(+v("m")) || 0); if (m) { d.pm = m; guardar(); } }
        SB.pintar();
      }
    });
  }
});
})();
