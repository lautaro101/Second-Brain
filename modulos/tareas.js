/* Módulo Tareas y proyectos. Una tarea: {id, t título, f fecha límite (AAAA-MM-DD o ""), p proyecto, h cuándo se hizo (0 si no), c creada}. */
(function () {
const {esc, norm, ymd, uid, dias, dmy, eventos} = SB.u, D = () => SB.datos("tareas");
let filtro = "";
const agregar = (t, f, p) => { D().t.unshift({id: uid(), t, f: f || "", p: p || "", h: 0, c: Date.now()}); SB.guardar("tareas"); };
const hoyF = ymd;

SB.registrar({
  id: "tareas", nombre: "Tareas", icono: "✅", esquema: 1,
  inicial: () => ({t: []}), migraciones: {}, sync: [{k: "t", orden: "desc", t: x => Math.max(x.c || 0, x.h || 0)}],
  captura: {etiqueta: "Tarea", guardar: txt => {   // "#proyecto" dentro del texto lo asigna como proyecto
    const m = /(^|\s)#([\p{L}\p{N}_-]+)/u.exec(txt); agregar(txt.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, " ").replace(/\s+/g, " ").trim() || txt, "", m ? m[2] : ""); }},
  hoy() {
    const h = hoyF(), pend = D().t.filter(x => !x.h), out = [];
    pend.filter(x => x.f && x.f <= h).sort((a, b) => a.f < b.f ? -1 : 1).forEach(x => out.push({t: x.t, s: x.f < h ? "Venció hace " + dias(h, x.f) + (dias(h, x.f) === 1 ? " día" : " días") : "Vence hoy", hecho: false, tocar: () => { x.h = Date.now(); SB.guardar("tareas"); }}));
    pend.filter(x => !x.f).slice(-3).forEach(x => out.push({t: x.t, s: x.p ? "#" + x.p : "Sin fecha", hecho: false, tocar: () => { x.h = Date.now(); SB.guardar("tareas"); }}));
    return out;
  },
  buscar: q => D().t.filter(x => norm(x.t + " " + x.p).includes(norm(q))).map(x => ({t: x.t, s: (x.h ? "hecha" : x.f ? "vence " + dmy(x.f) : "pendiente") + (x.p ? " · #" + x.p : "")})),
  avisos: () => D().t.filter(x => !x.h && x.f).map(x => ({f: x.f, t: "Tarea", c: x.t})),
  semana() { const s = Date.now() - 7 * 864e5, h = hoyF(); return [D().t.filter(x => x.h > s).length + " tareas hechas en los últimos 7 días.", D().t.filter(x => !x.h && x.f && x.f < h).length + " vencidas sin hacer.", D().t.filter(x => !x.h).length + " pendientes en total."]; },
  pantalla(el) {
    const h = hoyF(), todas = D().t, proys = [...new Set(todas.map(x => x.p).filter(Boolean))].sort();
    const v = todas.filter(x => !filtro || x.p === filtro), pend = v.filter(x => !x.h), hechas = v.filter(x => x.h).sort((a, b) => b.h - a.h).slice(0, 8);
    const fila = x => `<div class="fila"><button class="chk${x.h ? " on" : ""}" data-a="ok" data-id="${x.id}" aria-label="${x.h ? "Deshacer" : "Hecha"}">${x.h ? "✓" : ""}</button><div class="tx${x.h ? " hecha" : ""}"><span>${esc(x.t)}</span><small>${[x.p ? "#" + esc(x.p) : "", x.f ? "vence " + dmy(x.f) : ""].filter(Boolean).join(" · ")}</small></div><button class="x" data-a="del" data-id="${x.id}" aria-label="Borrar">✕</button></div>`;
    const sec = (tit, a) => a.length ? `<section class="card"><h3>${tit}</h3>${a.map(fila).join("")}</section>` : "";
    el.innerHTML = `<form data-f="n"><input name="t" placeholder="Nueva tarea" required autocomplete="off"><div class="fila-b"><input type="date" name="f" aria-label="Fecha límite"><input name="p" list="lp" placeholder="Proyecto" autocomplete="off"></div><datalist id="lp">${proys.map(p => `<option value="${esc(p)}">`).join("")}</datalist><button class="pri">Agregar</button></form>
      ${proys.length ? `<div class="chips"><button class="chip${filtro ? "" : " on"}" data-a="f" data-p="">todos</button>${proys.map(p => `<button class="chip${filtro === p ? " on" : ""}" data-a="f" data-p="${esc(p)}">#${esc(p)}</button>`).join("")}</div>` : ""}
      ${sec("Vencidas", pend.filter(x => x.f && x.f < h))}${sec("Hoy", pend.filter(x => x.f === h))}${sec("Próximas", pend.filter(x => x.f > h).sort((a, b) => a.f < b.f ? -1 : 1))}${sec("Sin fecha", pend.filter(x => !x.f))}
      ${pend.length ? "" : `<p class="vacio">Sin tareas pendientes.</p>`}${sec("Hechas hace poco", hechas)}`;
    eventos(el, {
      f: (a, f) => { const t = f.t.value.trim(); if (!t) return; agregar(t, f.f.value, f.p.value.trim().replace(/^#/, "")); SB.pintar(); },
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
