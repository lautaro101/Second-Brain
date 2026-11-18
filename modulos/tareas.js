/* Módulo Tareas y proyectos. Una tarea: {id, t título, f fecha límite (AAAA-MM-DD o ""), p proyecto, h cuándo se hizo (0 si no), c creada, a días antes para pasar a Prioridad (opcional)}.
   Niveles según la fecha límite: Urgente (vence hoy o ya venció) · Prioridad (faltan «a» días o menos; si la tarea no tiene «a», se usa el general, 3 por defecto) · Próxima (hasta 7 días) · normal.
   El número general se guarda en este dispositivo (clave sb_tareas_prio). */
(function () {
const {esc, norm, ymd, uid, dias, dmy, eventos} = SB.u, D = () => SB.datos("tareas");
let filtro = "";
const PK = "sb_tareas_prio", entero = v => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 0 && n <= 60 ? n : null; };
const base = () => { const n = entero(SB.almacen.leer(PK, 3)); return n == null ? 3 : n; };
const umbral = x => entero(x.a) == null ? base() : entero(x.a);
const nivel = (x, h) => { if (x.h || !x.f) return "normal"; const d = dias(x.f, h || ymd()); if (d <= 0) return "urgente"; if (d <= umbral(x)) return "prioridad"; if (d <= 7) return "proxima"; return "normal"; };
const NIV = {urgente: ["🔴 Urgente", "var(--bad)"], prioridad: ["🟠 Prioridad", "var(--warn)"], proxima: ["🟡 Próxima", "var(--mut)"]};
const porFecha = (a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : 0;
const agregar = (t, f, p, a) => { const x = {id: uid(), t, f: f || "", p: p || "", h: 0, c: Date.now()}; if (f && entero(a) != null) x.a = entero(a); D().t.unshift(x); SB.guardar("tareas"); };
const hoyF = ymd;

SB.registrar({
  id: "tareas", nombre: "Tareas", icono: "✅", esquema: 1,
  inicial: () => ({t: []}), migraciones: {}, sync: [{k: "t", orden: "desc", t: x => Math.max(x.c || 0, x.h || 0)}],
  nivel, crear: (t, f, p) => { agregar(t, f, p); return D().t[0]; }, porProyecto: p => D().t.filter(x => x.p === p),   // para que Programación se apoye en Tareas
  alternar: id => { const x = D().t.find(y => y.id === id); if (!x) return; x.h = x.h ? 0 : Date.now(); SB.guardar("tareas"); },
  captura: {etiqueta: "Tarea", guardar: txt => {   // "#proyecto" dentro del texto lo asigna como proyecto
    const m = /(^|\s)#([\p{L}\p{N}_-]+)/u.exec(txt); agregar(txt.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, " ").replace(/\s+/g, " ").trim() || txt, "", m ? m[2] : ""); }},
  hoy() {
    const h = hoyF(), pend = D().t.filter(x => !x.h), out = [], hecha = x => () => { x.h = Date.now(); SB.guardar("tareas"); };
    pend.filter(x => ["urgente", "prioridad"].includes(nivel(x, h))).sort(porFecha).forEach(x => { const d = dias(h, x.f);
      out.push({t: x.t, s: d > 0 ? "Venció hace " + d + (d === 1 ? " día" : " días") : d === 0 ? "Vence hoy" : "Prioridad · vence en " + (-d) + (d === -1 ? " día" : " días"), hecho: false, tocar: hecha(x)}); });
    pend.filter(x => !x.f).slice(-3).forEach(x => out.push({t: x.t, s: x.p ? "#" + x.p : "Sin fecha", hecho: false, tocar: hecha(x)}));
    return out;
  },
  buscar: q => D().t.filter(x => norm(x.t + " " + x.p).includes(norm(q))).map(x => ({t: x.t, s: (x.h ? "hecha" : x.f ? "vence " + dmy(x.f) : "pendiente") + (x.p ? " · #" + x.p : "")})),
  avisos: () => D().t.filter(x => !x.h && x.f).map(x => ({f: x.f, t: "Tarea", c: x.t, k: x.id})),
  semana() { const s = Date.now() - 7 * 864e5, h = hoyF(); return [D().t.filter(x => x.h > s).length + " tareas hechas en los últimos 7 días.", D().t.filter(x => !x.h && x.f && x.f < h).length + " vencidas sin hacer.", D().t.filter(x => !x.h).length + " pendientes en total.", D().t.filter(x => nivel(x, h) === "prioridad").length + " en prioridad (se acerca la fecha)."]; },
  pantalla(el) {
    const h = hoyF(), todas = D().t, proys = [...new Set(todas.map(x => x.p).filter(Boolean))].sort(), N = base();
    const v = todas.filter(x => !filtro || x.p === filtro), pend = v.filter(x => !x.h), hechas = v.filter(x => x.h).sort((a, b) => b.h - a.h).slice(0, 8);
    const fila = x => { const nv = nivel(x, h), n = NIV[nv];
      return `<div class="fila"><button class="chk${x.h ? " on" : ""}" data-a="ok" data-id="${x.id}" aria-label="${x.h ? "Deshacer" : "Hecha"}">${x.h ? "✓" : ""}</button><div class="tx${x.h ? " hecha" : ""}"><span>${esc(x.t)}</span><small>${n ? `<b style="color:${n[1]}">${n[0]}</b> · ` : ""}${[x.p ? "#" + esc(x.p) : "", x.f ? "vence " + dmy(x.f) : ""].filter(Boolean).join(" · ")}</small></div>${!x.h && x.f ? `<input type="number" min="0" max="60" inputmode="numeric" placeholder="${N}" value="${entero(x.a) == null ? "" : entero(x.a)}" data-c="ta" data-id="${x.id}" title="Días antes para pasar a Prioridad (vacío = ${N})" aria-label="Días antes para pasar a Prioridad" style="width:58px;margin:0">` : ""}<button class="x" data-a="del" data-id="${x.id}" aria-label="Borrar">✕</button></div>`; };
    const sec = (tit, a) => a.length ? `<section class="card"><h3>${tit}</h3>${a.map(fila).join("")}</section>` : "";
    const nv = k => pend.filter(x => nivel(x, h) === k).sort(porFecha);
    el.innerHTML = `<form data-f="n"><input name="t" placeholder="Nueva tarea" required autocomplete="off"><div class="fila-b"><input type="date" name="f" aria-label="Fecha límite"><input name="p" list="lp" placeholder="Proyecto" autocomplete="off"></div><input type="number" name="a" min="0" max="60" inputmode="numeric" placeholder="Pasa a Prioridad X días antes (vacío = ${N})" aria-label="Días antes para pasar a Prioridad"><datalist id="lp">${proys.map(p => `<option value="${esc(p)}">`).join("")}</datalist><button class="pri">Agregar</button></form>
      <section class="card"><div class="fila"><span class="tx">Pasa a Prioridad<small>días antes de la fecha límite (se puede cambiar en cada tarea)</small></span><input type="number" min="0" max="60" inputmode="numeric" value="${N}" data-c="gp" aria-label="Días generales para Prioridad" style="width:64px;margin:0"></div></section>
      ${proys.length ? `<div class="chips"><button class="chip${filtro ? "" : " on"}" data-a="f" data-p="">todos</button>${proys.map(p => `<button class="chip${filtro === p ? " on" : ""}" data-a="f" data-p="${esc(p)}">#${esc(p)}</button>`).join("")}</div>` : ""}
      ${sec("🔴 Urgentes <small>vencidas y de hoy</small>", nv("urgente"))}${sec("🟠 Prioridad", nv("prioridad"))}${sec("🟡 Próximas <small>hasta 7 días</small>", nv("proxima"))}${sec("Más adelante", pend.filter(x => x.f && nivel(x, h) === "normal").sort(porFecha))}${sec("Sin fecha", pend.filter(x => !x.f))}
      ${pend.length ? "" : `<p class="vacio">Sin tareas pendientes.</p>`}${sec("Hechas hace poco", hechas)}`;
    eventos(el, {
      f: (a, f) => { const t = f.t.value.trim(); if (!t) return; agregar(t, f.f.value, f.p.value.trim().replace(/^#/, ""), f.a.value); SB.pintar(); },
      c: (a, n) => {
        if (a === "gp") { const k = entero(n.value); if (k != null) SB.almacen.poner(PK, k); return SB.pintar(); }
        if (a === "ta") { const x = D().t.find(y => y.id === n.dataset.id); if (!x) return; const k = entero(n.value); if (k == null) delete x.a; else x.a = k; SB.guardar("tareas"); SB.pintar(); }
      },
      a: (a, b) => {
        if (a === "f") { filtro = b.dataset.p; return SB.pintar(); }
        const x = D().t.find(y => y.id === b.dataset.id); if (!x) return;
        if (a === "ok") x.h = x.h ? 0 : Date.now(); else if (a === "del") D().t = D().t.filter(y => y.id !== x.id);
        SB.guardar("tareas"); SB.pintar();
      }
    });
  }
});
})();
