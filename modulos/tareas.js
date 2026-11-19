/* Módulo Tareas y proyectos. Una tarea: {id, t título, s pasos [{t, h}] (opcional), f fecha límite (AAAA-MM-DD o ""), p proyecto, h cuándo se hizo (0 si no), c creada, a días antes para pasar a Prioridad (opcional), u 1 si la marcaste como prioritaria a mano (opcional), e 1 si está «en curso» (opcional), r repetición {u "d"|"s"|"m", n cada cuántos, d día del mes} (opcional), g id de la próxima repetición que generó al hacerse (opcional)}.
   Estados del tablero: Pendiente (sin h ni e) · En curso (e) · Hecha (h). La vista (lista o tablero) se guarda en este dispositivo (clave sb_tareas_vista).
   Niveles según la fecha límite: Urgente (vence hoy o ya venció) · Prioridad (faltan «a» días o menos —si la tarea no tiene «a» se usa el general, 3 por defecto— o la marcaste con ⭐ aunque falte mucho o no tenga fecha) · Próxima (hasta 7 días) · normal.
   Repetición: al hacer una tarea que se repite se crea sola la siguiente (cada día, semana, mes o N días) con los pasos sin tildar; si la deshacés, esa siguiente se quita.
   El número general se guarda en este dispositivo (clave sb_tareas_prio). */
(function () {
const {esc, norm, ymd, uid, sumar, dias, dmy, eventos} = SB.u, D = () => SB.datos("tareas");
let filtro = "";
const PK = "sb_tareas_prio", entero = v => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 0 && n <= 60 ? n : null; };
const base = () => { const n = entero(SB.almacen.leer(PK, 3)); return n == null ? 3 : n; };
const umbral = x => entero(x.a) == null ? base() : entero(x.a);
const nivel = (x, h) => { if (x.h) return "normal"; if (!x.f) return x.u ? "prioridad" : "normal"; const d = dias(x.f, h || ymd()); if (d <= 0) return "urgente"; if (d <= umbral(x) || x.u) return "prioridad"; return d <= 7 ? "proxima" : "normal"; };
const NIV = {urgente: ["🔴 Urgente", "var(--bad)"], prioridad: ["🟠 Prioridad", "var(--warn)"], proxima: ["🟡 Próxima", "var(--mut)"]};
const VK = "sb_tareas_vista", vista = () => SB.almacen.leer(VK, "lista") === "tablero" ? "tablero" : "lista";
const est = x => x.h ? 2 : x.e ? 1 : 0, RN = {urgente: 0, prioridad: 1, proxima: 2, normal: 3};
const porFecha = (a, b) => { const x = a.f || "9999", y = b.f || "9999"; return x < y ? -1 : x > y ? 1 : 0; };   // sin fecha al final
const agregar = (t, f, p, a, u, r) => { const x = {id: uid(), t, f: f || "", p: p || "", h: 0, c: Date.now()}; if (f && entero(a) != null) x.a = entero(a); if (u) x.u = 1; if (r && f) x.r = r; D().t.unshift(x); SB.guardar("tareas"); return x; };

/* ---------- repeticiones ---------- */
const mesMas = (f, k, d) => { const [a, m] = f.split("-").map(Number), t = new Date(a, m - 1 + k, 1), fin = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();   // el día del mes se mantiene; en los meses cortos cae el último día
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(Math.min(d || +f.slice(8), fin)).padStart(2, "0"); };
const proxima = (x, h) => { const r = x.r; if (!r || !(r.n >= 1) || !["d", "s", "m"].includes(r.u)) return ""; h = h || ymd();
  const paso = f => r.u === "m" ? mesMas(f, r.n, r.d) : sumar(f, r.u === "s" ? 7 * r.n : r.n);
  let n = paso(x.f || h), i = 0; while (n <= h && i++ < 2000) n = paso(n); return n; };   // desde la fecha límite; si la hiciste tarde, la primera que todavía no pasó
const regla = (sel, rn, f) => { const k = Math.min(365, Math.max(1, parseInt(rn, 10) || 1)); return sel === "d" ? {u: "d", n: 1} : sel === "s" ? {u: "s", n: 1} : sel === "m" ? {u: "m", n: 1, d: +f.slice(8)} : sel === "n" ? {u: "d", n: k} : null; };
const etiquetaR = r => !r ? "" : "cada " + (r.n > 1 ? r.n + " " : "") + (r.u === "d" ? (r.n > 1 ? "días" : "día") : r.u === "s" ? (r.n > 1 ? "semanas" : "semana") : (r.n > 1 ? "meses" : "mes"));
function completar(x) {
  x.h = Date.now(); delete x.e;
  if (!x.r || (x.g && D().t.some(y => y.id === x.g))) return;
  const f = proxima(x); if (!f) return;
  const n = {id: uid(), t: x.t, f, p: x.p || "", h: 0, c: Date.now(), r: Object.assign({}, x.r)};
  if (entero(x.a) != null) n.a = x.a; if (x.u) n.u = 1; if (x.s) n.s = x.s.map(p => ({t: p.t, h: 0}));
  D().t.unshift(n); x.g = n.id;
}
function deshacer(x) {
  x.h = 0; delete x.e; const g = x.g && D().t.find(y => y.id === x.g);
  if (g && !g.h) { g._sinPapelera = 1; D().t = D().t.filter(y => y !== g); }   // la repetición que se había creado, si todavía no la tocaste (no es un borrado tuyo: no va a la Papelera)
  delete x.g;
}
function pasar(x, n) {   // 0 Pendiente · 1 En curso · 2 Hecha
  const a = est(x); if (n === a) return;
  if (n === 2) return completar(x);
  if (a === 2) deshacer(x); x.h = 0; if (n === 1) x.e = 1; else delete x.e;
}
const hoyF = ymd;
let abierta = "";   // tarea con el panel de pasos abierto
const pasos = x => { const s = x.s || [], n = s.filter(p => p.h).length;
  const tg = s.length || !x.h ? `<button type="button" class="link" data-a="sub" data-id="${x.id}">${s.length ? "☰ " + n + "/" + s.length + " pasos" : "＋ pasos"}</button>` : "";
  if (abierta !== x.id) return tg;
  return tg + `<div style="margin:4px 0 10px 12px">${s.map((p, i) => `<div class="fila"><button class="chk${p.h ? " on" : ""}" data-a="sk" data-id="${x.id}" data-i="${i}" aria-label="Marcar paso">${p.h ? "✓" : ""}</button><div class="tx${p.h ? " hecha" : ""}"><span>${esc(p.t)}</span></div><button class="x" data-a="sd" data-id="${x.id}" data-i="${i}" aria-label="Quitar paso">✕</button></div>`).join("")}<form data-f="s" data-id="${x.id}" class="fila-b"><input name="p" placeholder="Nuevo paso" required autocomplete="off"><button>＋</button></form></div>`; };

SB.registrar({
  id: "tareas", nombre: "Tareas", icono: "✅", esquema: 1,
  inicial: () => ({t: []}), migraciones: {}, sync: [{k: "t", orden: "desc", t: x => Math.max(x.c || 0, x.h || 0)}],
  nivel, proxima, crear: (t, f, p) => agregar(t, f, p), porProyecto: p => D().t.filter(x => x.p === p),   // para que Programación se apoye en Tareas
  alternar: id => { const x = D().t.find(y => y.id === id); if (!x) return; pasar(x, x.h ? 0 : 2); SB.guardar("tareas"); },
  captura: {etiqueta: "Tarea", guardar: txt => {   // "#proyecto" dentro del texto lo asigna como proyecto
    const m = /(^|\s)#([\p{L}\p{N}_-]+)/u.exec(txt); agregar(txt.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, " ").replace(/\s+/g, " ").trim() || txt, "", m ? m[2] : ""); }},
  hoy() {   // orden: vencidas (la más vieja primero), vencen hoy, prioritarias (por fecha; las sin fecha al final), y después las últimas sin fecha
    const h = hoyF(), pend = D().t.filter(x => !x.h), out = [], hecha = x => () => { completar(x); SB.guardar("tareas"); };
    const rango = x => x.f && x.f < h ? 0 : x.f === h ? 1 : 2;
    pend.filter(x => ["urgente", "prioridad"].includes(nivel(x, h))).sort((a, b) => rango(a) - rango(b) || porFecha(a, b)).forEach(x => { const d = x.f ? dias(h, x.f) : null;
      out.push({t: x.t, s: d > 0 ? "Venció hace " + d + (d === 1 ? " día" : " días") : d === 0 ? "Vence hoy" : (x.u ? "⭐ Prioritaria" : "Prioridad") + (d === null ? "" : " · vence en " + (-d) + (d === -1 ? " día" : " días")), hecho: false, tocar: hecha(x)}); });
    pend.filter(x => x.e && !["urgente", "prioridad"].includes(nivel(x, h))).sort(porFecha).forEach(x => out.push({t: x.t, s: "🔧 En curso" + (x.f ? " · vence " + dmy(x.f) : ""), hecho: false, tocar: hecha(x)}));
    pend.filter(x => !x.f && !x.u && !x.e).slice(-3).forEach(x => out.push({t: x.t, s: x.p ? "#" + x.p : "Sin fecha", hecho: false, tocar: hecha(x)}));
    return out;
  },
  buscar: q => D().t.filter(x => norm(x.t + " " + x.p).includes(norm(q))).map(x => ({t: x.t, s: (x.h ? "hecha" : x.f ? "vence " + dmy(x.f) : "pendiente") + (x.p ? " · #" + x.p : "")})),
  avisos: () => D().t.filter(x => !x.h && x.f).map(x => ({f: x.f, t: "Tarea", c: x.t, k: x.id, av: [...new Set([umbral(x), 1].filter(n => n >= 1))].sort((a, b) => b - a), hoy: true})),   // avisa al entrar en Prioridad (X días antes), el día antes y el mismo día
  semana() { const s = Date.now() - 7 * 864e5, h = hoyF(); return [D().t.filter(x => x.h > s).length + " tareas hechas en los últimos 7 días.", D().t.filter(x => !x.h && x.f && x.f < h).length + " vencidas sin hacer.", D().t.filter(x => !x.h).length + " pendientes en total.", D().t.filter(x => nivel(x, h) === "prioridad").length + " en prioridad (se acerca la fecha)."]; },
  pantalla(el) {
    const h = hoyF(), todas = D().t, proys = [...new Set(todas.map(x => x.p).filter(Boolean))].sort(), N = base();
    const v = todas.filter(x => !filtro || x.p === filtro), pend = v.filter(x => !x.h), hechas = v.filter(x => x.h).sort((a, b) => b.h - a.h).slice(0, 8);
    const mv = x => `${est(x) > 0 ? `<button class="x" data-a="mover" data-d="-1" data-id="${x.id}" aria-label="Pasar a ${est(x) === 2 ? "En curso" : "Pendiente"}">◀</button>` : ""}${est(x) < 2 ? `<button class="x" data-a="mover" data-d="1" data-id="${x.id}" aria-label="Pasar a ${est(x) === 0 ? "En curso" : "Hecha"}">▶</button>` : ""}`;
    const fila0 = (x, tb) => { const nv = nivel(x, h), n = NIV[nv];
      return `<div class="fila">${tb ? "" : `<button class="chk${x.h ? " on" : ""}" data-a="ok" data-id="${x.id}" aria-label="${x.h ? "Deshacer" : "Hecha"}">${x.h ? "✓" : ""}</button>`}<div class="tx${x.h ? " hecha" : ""}"><span>${esc(x.t)}</span><small>${n ? `<b style="color:${n[1]}">${n[0]}</b>${x.u && !x.h ? " ⭐" : ""} · ` : ""}${x.e && !x.h ? "🔧 en curso · " : ""}${x.r && !x.h ? "🔁 " + etiquetaR(x.r) + " · " : ""}${[x.p ? "#" + esc(x.p) : "", x.f ? "vence " + dmy(x.f) : ""].filter(Boolean).join(" · ")}</small></div>${tb ? mv(x) : ""}${x.r && !x.h ? `<button class="x" data-a="norep" data-id="${x.id}" aria-label="Dejar de repetir" title="Dejar de repetir (${etiquetaR(x.r)})">🔁</button>` : ""}${!x.h ? `<button class="x" data-a="star" data-id="${x.id}" aria-label="${x.u ? "Quitar prioridad" : "Marcar como prioritaria"}" title="${x.u ? "Prioritaria (tocá para quitar)" : "Marcar como prioritaria"}">${x.u ? "⭐" : "☆"}</button>` : ""}${!x.h && x.f && !tb ? `<input type="number" min="0" max="60" inputmode="numeric" placeholder="${N}" value="${entero(x.a) == null ? "" : entero(x.a)}" data-c="ta" data-id="${x.id}" title="Días antes para pasar a Prioridad (vacío = ${N})" aria-label="Días antes para pasar a Prioridad" style="width:58px;margin:0">` : ""}<button class="x" data-a="del" data-id="${x.id}" aria-label="Borrar">✕</button></div>`; };
    const fila = (x, tb) => fila0(x, tb) + pasos(x);
    const sec = (tit, a) => a.length ? `<section class="card"><h3>${tit}</h3>${a.map(fila).join("")}</section>` : "";
    const nv = k => pend.filter(x => nivel(x, h) === k).sort(porFecha);
    const lista = () => `${sec("🔴 Urgentes <small>vencidas y de hoy</small>", nv("urgente"))}${sec("🟠 Prioridad", nv("prioridad"))}${sec("🟡 Próximas <small>hasta 7 días</small>", nv("proxima"))}${sec("Más adelante", pend.filter(x => x.f && nivel(x, h) === "normal").sort(porFecha))}${sec("Sin fecha", pend.filter(x => !x.f && nivel(x, h) === "normal"))}${pend.length ? "" : `<p class="vacio">Sin tareas pendientes.</p>`}${sec("Hechas hace poco", hechas)}`;
    const orden = (a, b) => RN[nivel(a, h)] - RN[nivel(b, h)] || porFecha(a, b);
    const tablero = () => `<div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px">${[["Pendiente", pend.filter(x => !x.e).sort(orden)], ["🔧 En curso", pend.filter(x => x.e).sort(orden)], ["Hecha", hechas]].map(([t, a], i) => `<section class="card" data-col="${i}" style="flex:0 0 84%;min-width:250px;scroll-snap-align:start"><h3>${t} <small>${a.length}</small></h3>${a.map(x => `<div data-drag="${x.id}" draggable="true" style="cursor:grab">${fila(x, true)}</div>`).join("") || `<p class="ayuda">Nada acá.</p>`}</section>`).join("")}</div>`;
    el.innerHTML = `<form data-f="n"><input name="t" placeholder="Nueva tarea" required autocomplete="off"><div class="fila-b"><input type="date" name="f" aria-label="Fecha límite"><input name="p" list="lp" placeholder="Proyecto" autocomplete="off"></div><input type="number" name="a" min="0" max="60" inputmode="numeric" placeholder="Pasa a Prioridad X días antes (vacío = ${N})" aria-label="Días antes para pasar a Prioridad"><datalist id="lp">${proys.map(p => `<option value="${esc(p)}">`).join("")}</datalist><div class="fila-b"><select name="r" aria-label="Repetir"><option value="">No se repite</option><option value="d">Cada día</option><option value="s">Cada semana</option><option value="m">Cada mes</option><option value="n">Cada N días…</option></select><input type="number" name="rn" min="1" max="365" inputmode="numeric" placeholder="N (días)" aria-label="Cada cuántos días"></div><label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" name="u" style="width:auto;margin:0"> ⭐ Marcar como prioritaria</label><button class="pri">Agregar</button></form>
      <section class="card"><div class="fila"><span class="tx">Pasa a Prioridad<small>días antes de la fecha límite (se puede cambiar en cada tarea)</small></span><input type="number" min="0" max="60" inputmode="numeric" value="${N}" data-c="gp" aria-label="Días generales para Prioridad" style="width:64px;margin:0"></div></section>
      ${proys.length ? `<div class="chips"><button class="chip${filtro ? "" : " on"}" data-a="f" data-p="">todos</button>${proys.map(p => `<button class="chip${filtro === p ? " on" : ""}" data-a="f" data-p="${esc(p)}">#${esc(p)}</button>`).join("")}</div>` : ""}
      <div class="chips"><button class="chip${vista() === "lista" ? " on" : ""}" data-a="vista" data-v="lista">☰ Lista</button><button class="chip${vista() === "tablero" ? " on" : ""}" data-a="vista" data-v="tablero">▦ Tablero</button></div>
      ${vista() === "tablero" ? tablero() : lista()}`;
    el.querySelectorAll("[data-drag]").forEach(r => { r.ondragstart = e => { e.dataTransfer.setData("text/plain", r.dataset.drag); e.dataTransfer.effectAllowed = "move"; r.style.opacity = ".5"; }; r.ondragend = () => { r.style.opacity = ""; }; });
    el.querySelectorAll("[data-col]").forEach(c => { c.ondragover = e => { e.preventDefault(); c.style.outline = "2px dashed currentColor"; }; c.ondragleave = () => { c.style.outline = ""; };
      c.ondrop = e => { e.preventDefault(); c.style.outline = ""; const x = D().t.find(y => y.id === e.dataTransfer.getData("text/plain")); if (!x) return; pasar(x, +c.dataset.col); SB.guardar("tareas"); SB.pintar(); }; });
    eventos(el, {
      f: (a, f) => { if (a === "s") { const x = D().t.find(y => y.id === f.dataset.id), p = f.p.value.trim(); if (x && p) { (x.s = x.s || []).push({t: p, h: 0}); SB.guardar("tareas"); } return SB.pintar(); }
        const t = f.t.value.trim(); if (!t) return; const rs = f.r ? f.r.value : "", fe = f.f.value || (rs ? hoyF() : ""); agregar(t, fe, f.p.value.trim().replace(/^#/, ""), f.a.value, f.u.checked, fe ? regla(rs, f.rn ? f.rn.value : "", fe) : null); SB.pintar(); },
      c: (a, n) => {
        if (a === "gp") { const k = entero(n.value); if (k != null) SB.almacen.poner(PK, k); return SB.pintar(); }
        if (a === "ta") { const x = D().t.find(y => y.id === n.dataset.id); if (!x) return; const k = entero(n.value); if (k == null) delete x.a; else x.a = k; SB.guardar("tareas"); SB.pintar(); }
      },
      a: (a, b) => {
        if (a === "f") { filtro = b.dataset.p; return SB.pintar(); }
        if (a === "vista") { SB.almacen.poner(VK, b.dataset.v === "tablero" ? "tablero" : "lista"); return SB.pintar(); }
        const x = D().t.find(y => y.id === b.dataset.id); if (!x) return;
        if (a === "sub") { abierta = abierta === x.id ? "" : x.id; return SB.pintar(); }
        if (a === "sk" || a === "sd") { const p = (x.s || [])[+b.dataset.i]; if (!p) return; if (a === "sk") p.h = p.h ? 0 : 1; else x.s.splice(+b.dataset.i, 1); if (!x.s.length) delete x.s; SB.guardar("tareas"); return SB.pintar(); }
        if (a === "ok") pasar(x, x.h ? 0 : 2); else if (a === "mover") pasar(x, Math.min(2, Math.max(0, est(x) + (+b.dataset.d || 0)))); else if (a === "norep") { delete x.r; } else if (a === "star") { if (x.u) delete x.u; else x.u = 1; } else if (a === "del") D().t = D().t.filter(y => y.id !== x.id);
        SB.guardar("tareas"); SB.pintar();
      }
    });
  }
});
})();
