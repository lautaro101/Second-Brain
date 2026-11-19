/* Módulo Objetivos: metas grandes con fecha límite y su avance.
   Datos: o objetivos {id, n nombre, a área (texto libre), f fecha límite AAAA-MM-DD o "", e estado "a" activo | "p" en pausa | "l" logrado,
   hi pasos [{id, t, h 0|ms}], pc avance manual 0-100 (solo si no hay pasos), x «para qué lo quiero», l fecha en que se logró, k creado, m modificado}.
   Avance: con pasos = pasos hechos / pasos; sin pasos = el % que ponés vos. Las tareas del objetivo son las de Tareas con la etiqueta #nombre-del-objetivo.
   La Papelera lo cubre sola (lista o, campo n). */
(function () {
const {esc, norm, ymd, uid, sumar, dias, dmy, eventos} = SB.u, D = () => SB.datos("objetivos");
const ST = {a: ["Activo", "🎯"], p: ["En pausa", "⏸️"], l: ["Logrado", "🏆"]}, ORDEN_ST = ["a", "p", "l"];
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "objetivo";
const obj = id => D().o.find(x => x.id === id), T = () => SB.mods.tareas;
const avance = o => o.e === "l" ? 100 : o.hi && o.hi.length ? Math.round(100 * o.hi.filter(h => h.h).length / o.hi.length) : Math.max(0, Math.min(100, o.pc || 0));
const plazo = o => { if (!o.f) return ""; const n = dias(o.f, ymd()); return n < 0 ? "venció hace " + -n + (n === -1 ? " día" : " días") : n === 0 ? "vence hoy" : n === 1 ? "vence mañana" : "faltan " + n + " días"; };
const ritmo = o => { if (o.e !== "a" || !o.f || avance(o) >= 100) return ""; const tot = dias(o.f, ymd(new Date(o.k))), pas = dias(ymd(), ymd(new Date(o.k)));
  if (tot < 2 || pas <= 0) return ""; if (pas >= tot) return "⚠️ fuera de plazo"; const esp = 100 * pas / tot, a = avance(o); return a >= esp + 10 ? "🚀 adelantado" : a >= esp - 10 ? "👍 al día" : "🐢 atrasado"; };
const guardar = o => { if (o) o.m = Date.now(); SB.guardar("objetivos"); };
function crear(n, extra) { const o = Object.assign({id: uid(), n: String(n).trim().slice(0, 120), a: "", f: "", e: "a", hi: [], pc: 0, x: "", k: Date.now(), m: Date.now()}, extra || {}); D().o.unshift(o); SB.guardar("objetivos"); return o; }
const barra = o => `<progress value="${avance(o)}" max="100" aria-label="Avance"></progress>`;
const cambiarEstado = (o, e) => { o.e = e; if (e === "l") o.l = ymd(); else delete o.l; };

function tarjeta(o) {
  const t = [avance(o) + " %", plazo(o), ritmo(o)].filter(Boolean).join(" · ");
  return `<a class="card enlace" href="#/objetivos/${esc(o.id)}"><b>${esc(o.n)}</b>${barra(o)}<small>${esc([o.a, t].filter(Boolean).join(" · "))}</small></a>`;
}
function inicio(el) {
  const D0 = D().o, anio = ymd().slice(0, 4), logrados = D0.filter(o => o.e === "l" && (o.l || "").startsWith(anio)).length;
  const orden = (a, b) => a.f && b.f ? (a.f < b.f ? -1 : 1) : a.f ? -1 : b.f ? 1 : b.m - a.m;
  el.innerHTML = `${D0.length ? `<section class="card"><h3>🎯 Tus objetivos</h3><p style="margin:0"><b>${D0.filter(o => o.e === "a").length}</b> activos · <b>${logrados}</b> ${logrados === 1 ? "logrado" : "logrados"} en ${anio}</p></section>` : ""}
    <details class="card"${D0.length ? "" : " open"}><summary><b>＋ Nuevo objetivo</b></summary><form data-f="nuevo"><input name="n" placeholder="¿Qué querés lograr? (ej: Recibirme)" required autocomplete="off">
      <div class="fila-b"><input name="a" placeholder="Área (ej: Estudio)" autocomplete="off"><input type="date" name="f" aria-label="Fecha límite"></div><small>La fecha límite es opcional: con ella el objetivo sale en Hoy y avisa.</small><button class="pri">Crear objetivo</button></form></details>
    ${ORDEN_ST.map(e => { const l = D0.filter(o => o.e === e).sort(e === "l" ? (a, b) => (b.l || "").localeCompare(a.l || "") : orden); return l.length ? `<section class="card"><h3>${ST[e][1]} ${ST[e][0]} <small>${l.length}</small></h3>${l.map(tarjeta).join("")}</section>` : ""; }).join("")}
    ${D0.length ? "" : `<p class="vacio">Un objetivo es algo grande que querés lograr (recibirte, correr 10 km, ahorrar para un viaje). Dividilo en pasos y mirá cómo avanzás.</p>`}`;
  eventos(el, {f: (a, f) => { const n = f.n.value.trim(); if (!n) return; const o = crear(n, {a: f.a.value.trim().slice(0, 40), f: f.f.value || ""}); location.hash = "#/objetivos/" + o.id; }});
}
function detalle(el, o) {
  const s = slug(o.n), ts = T() && T().porProyecto ? T().porProyecto(s) : null, hi = o.hi || [], todos = hi.length && hi.every(h => h.h);
  el.innerHTML = `<a class="btn" href="#/objetivos">← Objetivos</a><h2 class="fecha">${esc(o.n)}</h2>
    <div class="chips">${ORDEN_ST.map(e => `<button class="chip${o.e === e ? " on" : ""}" data-a="est" data-e="${e}">${ST[e][1]} ${ST[e][0]}</button>`).join("")}</div>
    <section class="card">${barra(o)}<p style="margin:4px 0 0"><b>${avance(o)} %</b>${o.f ? " · " + esc(plazo(o)) + " (" + dmy(o.f) + ")" : ""}${ritmo(o) ? " · " + ritmo(o) : ""}${o.l ? " · logrado el " + dmy(o.l) : ""}</p>
      ${todos && o.e !== "l" ? `<button class="pri" data-a="est" data-e="l">🏆 Completaste todos los pasos: darlo por logrado</button>` : ""}
      ${hi.length ? "" : `<label class="ayuda">Avance a mano: <b id="pcv">${avance(o)}</b> %</label><input type="range" min="0" max="100" step="5" value="${avance(o)}" data-c="pc" aria-label="Avance">`}</section>
    <section class="card"><h3>Pasos</h3>${hi.map((h, i) => `<div class="fila"><button class="chk${h.h ? " on" : ""}" data-a="hi" data-i="${i}" aria-label="Marcar paso">${h.h ? "✓" : ""}</button><div class="tx${h.h ? " hecha" : ""}"><span>${esc(h.t)}</span></div><button class="x" data-a="hd" data-i="${i}" aria-label="Quitar paso">✕</button></div>`).join("") || `<p class="vacio">Dividí el objetivo en pasos y el avance se calcula solo.</p>`}
      <form data-f="paso" class="fila-b"><input name="t" placeholder="Nuevo paso" required autocomplete="off"><button>＋</button></form></section>
    <section class="card"><h3>✅ Tareas</h3>${ts === null ? `<p class="vacio">El módulo Tareas no está disponible.</p>` : `<form data-f="tarea" class="fila-b"><input name="t" placeholder="Nueva tarea para este objetivo" required autocomplete="off"><button>＋</button></form>
      ${ts.map(x => `<div class="fila"><button class="chk${x.h ? " on" : ""}" data-a="tk" data-id="${esc(x.id)}" aria-label="Marcar tarea">${x.h ? "✓" : ""}</button><div class="tx${x.h ? " hecha" : ""}"><span>${esc(x.t)}</span></div></div>`).join("")}<small>Etiqueta: #${esc(s)}</small>`}</section>
    <section class="card"><h3>Datos</h3><form data-f="edit"><input name="n" value="${esc(o.n)}" required aria-label="Nombre" autocomplete="off"><div class="fila-b"><input name="a" value="${esc(o.a)}" placeholder="Área" autocomplete="off"><input type="date" name="f" value="${esc(o.f)}" aria-label="Fecha límite"></div>
      <textarea name="x" rows="3" placeholder="¿Para qué lo quiero? (lo que te va a motivar cuando cueste)">${esc(o.x || "")}</textarea><button>Guardar</button></form></section>
    <button class="link" data-a="del">Borrar el objetivo</button>`;
  eventos(el, {
    f: (a, f) => {
      if (a === "paso") { const t = f.t.value.trim(); if (!t) return; o.hi = o.hi || []; o.hi.push({id: uid(), t, h: 0}); if (o.e === "l") cambiarEstado(o, "a"); }
      else if (a === "tarea") { const t = f.t.value.trim(); if (!t || !T() || !T().crear) return; T().crear(t, "", s); }
      else if (a === "edit") { o.n = f.n.value.trim() || o.n; o.a = f.a.value.trim().slice(0, 40); o.f = f.f.value || ""; o.x = f.x.value.trim(); }
      guardar(o); SB.pintar();
    },
    c: (a, n) => { if (a !== "pc") return; o.pc = +n.value; guardar(o); const v = el.querySelector("#pcv"); if (v) v.textContent = o.pc; SB.pintar(); },
    a: (a, b) => {
      if (a === "est") cambiarEstado(o, b.dataset.e);
      else if (a === "hi") { const h = (o.hi || [])[+b.dataset.i]; if (!h) return; h.h = h.h ? 0 : Date.now(); }
      else if (a === "hd") o.hi.splice(+b.dataset.i, 1);
      else if (a === "tk") { const x = T().porProyecto(s).find(y => y.id === b.dataset.id); if (!x) return; x.h = x.h ? 0 : Date.now(); SB.guardar("tareas"); }
      else if (a === "del") { if (!confirm("¿Borrar «" + o.n + "»? Queda 30 días en la Papelera. Sus tareas se quedan en Tareas.")) return; D().o = D().o.filter(x => x !== o); SB.guardar("objetivos"); location.hash = "#/objetivos"; return; }
      guardar(o); SB.pintar();
    }
  });
}

SB.registrar({
  id: "objetivos", nombre: "Objetivos", icono: "🎯", esquema: 1,
  inicial: () => ({o: []}), migraciones: {},
  sync: [{k: "o", orden: "desc", t: x => x.m || x.k || 0}],
  util: {crear, avance, plazo},
  captura: {etiqueta: "Objetivo", guardar: t => { const n = String(t).split("\n")[0].trim(); if (!n) throw new Error("texto vacío"); crear(n); }},
  hoy() { return D().o.filter(o => o.e === "a" && o.f && dias(o.f, ymd()) <= 7).sort((a, b) => a.f < b.f ? -1 : 1).map(o => ({t: o.n, s: ST.a[1] + " " + plazo(o) + " · " + avance(o) + " %", ir: "#/objetivos/" + o.id})); },
  buscar(q) { const k = norm(q); return D().o.filter(o => norm([o.n, o.a, o.x].join(" ")).includes(k)).slice(0, 12).map(o => ({t: o.n, s: [ST[o.e][0], avance(o) + " %", o.a].filter(Boolean).join(" · "), ir: "#/objetivos/" + o.id})); },
  avisos: () => D().o.filter(o => o.e === "a" && o.f && o.f >= ymd()).map(o => ({f: o.f, t: o.n, c: "Objetivo", k: "obj" + o.id, av: [7, 1], hoy: true})),
  semana() { const act = D().o.filter(o => o.e === "a"), mes = ymd().slice(0, 7), lg = D().o.filter(o => o.e === "l" && (o.l || "").startsWith(mes)).length, p = act.filter(o => o.f).sort((a, b) => a.f < b.f ? -1 : 1)[0];
    if (!D().o.length) return []; return [act.length + (act.length === 1 ? " objetivo activo" : " objetivos activos") + (lg ? " · " + lg + (lg === 1 ? " logrado" : " logrados") + " este mes" : "") + ".", p ? "El próximo en vencer: «" + p.n + "» (" + plazo(p) + ", " + avance(p) + " %)." : ""].filter(Boolean); },
  pantalla(el, sub) { const o = sub ? obj(String(sub).split("/")[0]) : null; if (sub && !o) { location.hash = "#/objetivos"; return; } return o ? detalle(el, o) : inicio(el); }
});
})();
