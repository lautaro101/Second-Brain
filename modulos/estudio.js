/* Módulo Estudio. Datos (esquema 1):
   m materias       {id, n nombre, d días de cursada (0=dom…6=sáb)}
   e evaluaciones   {id, m id de materia, k "parcial"|"final"|"entrega", n título (opcional), f fecha AAAA-MM-DD, nota número o null, h 1 si ya se rindió o entregó}
   (cada materia puede tener st estado "c"|"r"|"a" y co correlativas [ids de materias que hay que aprobar antes])
   s sesiones       {id, m id de materia, f fecha AAAA-MM-DD, min minutos, c creada}
   El reloj en marcha vive en este dispositivo (clave sb_estudio_reloj) y no se sincroniza. Las notas de clase se crean en Notas con la etiqueta #clase #nombre-de-la-materia. */
(function () {
const {esc, norm, ymd, uid, sumar, dias, dmy, eventos} = SB.u, D = () => SB.datos("estudio");
const TIPO = {parcial: "Parcial", final: "Final", entrega: "Entrega"}, AV = {parcial: [7, 3, 1], final: [7, 3, 1], entrega: [3, 1]};
const NOM = ["D", "L", "M", "M", "J", "V", "S"], ORDEN = [1, 2, 3, 4, 5, 6, 0], RK = "sb_estudio_reloj";
const mat = id => D().m.find(x => x.id === id);
const slug = s => norm(s).replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "") || "materia";
const num = n => String(n).replace(".", ",");
const hm = min => min >= 60 ? Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) + " min" : "") : min + " min";
const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)), p = n => String(n).padStart(2, "0"); return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60); };
const reloj = () => { const r = SB.almacen.leer(RK, null); return r && r.m && r.t0 ? r : null; };
const cuando = (f, h) => { const d = dias(f, h); return d === 0 ? "Hoy" : d === 1 ? "Mañana" : "En " + d + " días"; };
const nomEval = e => TIPO[e.k] + (e.n ? ": " + e.n : "") + (mat(e.m) ? " · " + mat(e.m).n : "");
const sesiones7 = () => { const d = sumar(ymd(), -6); return D().s.filter(x => x.f >= d); };
const promedio = id => { const n = D().e.filter(e => e.m === id && typeof e.nota === "number").map(e => e.nota); return n.length ? {p: n.reduce((a, b) => a + b, 0) / n.length, n: n.length} : null; };
const ST = {"": "Sin cursar", c: "Cursando", r: "Regular", a: "Aprobada"};   // estado de la materia (m.st) y correlativas que hay que aprobar antes (m.co)
const faltan = m => (m.co || []).map(mat).filter(x => x && x.st !== "a");
const estadoHtml = m => { const fl = faltan(m), otras = D().m.filter(o => o.id !== m.id);
  return `<div class="fila-b"><select data-c="st" data-id="${esc(m.id)}" aria-label="Estado de la materia">${Object.keys(ST).map(k => `<option value="${k}"${(m.st || "") === k ? " selected" : ""}>${ST[k]}</option>`).join("")}</select></div>`
    + (!m.st ? `<small>${fl.length ? "🔒 Te falta aprobar: " + esc(fl.map(x => x.n).join(", ")) : "✅ Habilitada para cursar"}</small>` : "")
    + (otras.length ? `<details><summary>Correlativas (${(m.co || []).length})</summary><small>Marcá las que tenés que aprobar antes de esta.</small>${otras.map(o => `<label class="fila"><input type="checkbox" data-c="cor" data-id="${esc(m.id)}" data-o="${esc(o.id)}"${(m.co || []).includes(o.id) ? " checked" : ""}> ${esc(o.n)}</label>`).join("")}</details>` : ""); };
const progreso = () => { const M = D().m, t = M.length, a = M.filter(m => m.st === "a").length, cu = M.filter(m => m.st === "c").length, hab = M.filter(m => !m.st && !faltan(m).length), p = t ? Math.round(100 * a / t) : 0;
  return t ? `<section class="card"><h3>🎓 Avance de la carrera</h3><div style="height:8px;border-radius:4px;background:rgba(128,128,128,.25)"><i style="display:block;height:8px;border-radius:4px;background:#1c3556;width:${p}%"></i></div><p>${a} de ${t} materias aprobadas (${p} %)${cu ? " · " + cu + " cursando" : ""}</p>${hab.length ? `<small>Habilitadas para cursar: ${hab.map(m => esc(m.n)).join(", ")}</small>` : ""}</section>` : ""; };
let tic = 0;   // temporizador que mueve el reloj en pantalla
const guardar = () => SB.guardar("estudio");
const sesion = (m, min, f) => { D().s.unshift({id: uid(), m, f: f || ymd(), min, c: Date.now()}); guardar(); };

SB.registrar({
  id: "estudio", nombre: "Estudio", icono: "🎓", esquema: 1,
  inicial: () => ({m: [], e: [], s: []}), migraciones: {},
  sync: [{k: "m", orden: "asc"}, {k: "e", orden: "asc", t: x => Date.parse(x.f) || 0}, {k: "s", orden: "desc", t: x => x.c || 0}],
  hoy() {
    const f = ymd(), dow = new Date(f + "T12:00:00").getDay(), out = [];
    D().m.filter(m => (m.d || []).includes(dow)).forEach(m => out.push({t: "Cursada: " + m.n, s: "Hoy tenés clase", hecho: false, ir: "#/estudio"}));
    D().e.filter(e => !e.h && e.f >= f && dias(e.f, f) <= (e.k === "entrega" ? 3 : 7)).sort((a, b) => a.f < b.f ? -1 : 1).forEach(e => {
      const it = {t: nomEval(e), s: cuando(e.f, f) + " · " + dmy(e.f), hecho: false, ir: "#/estudio"};
      if (e.k === "entrega") it.tocar = () => { e.h = 1; guardar(); };
      out.push(it);
    });
    return out;
  },
  buscar: q => { const n = norm(q);
    return D().m.filter(m => norm(m.n).includes(n)).map(m => ({t: m.n, s: "materia"}))
      .concat(D().e.filter(e => norm((e.n || "") + " " + TIPO[e.k] + " " + ((mat(e.m) || {}).n || "")).includes(n)).map(e => ({t: nomEval(e), s: dmy(e.f) + (e.h ? " · hecho" : "")}))); },
  avisos: () => D().e.filter(e => !e.h && e.f >= ymd()).map(e => ({f: e.f, t: TIPO[e.k] + (mat(e.m) ? " de " + mat(e.m).n : ""), c: e.n || "", k: e.id, av: AV[e.k] || [3, 1], hoy: true})),
  semana() {
    const min = sesiones7().reduce((s, x) => s + (x.min || 0), 0), f = ymd(), prox = D().e.filter(e => !e.h && e.f >= f && dias(e.f, f) <= 7).length;
    return [min ? "Estudiaste " + hm(min) + " en los últimos 7 días." : "No cargaste sesiones de estudio esta semana.", prox ? prox + (prox === 1 ? " evaluación o entrega" : " evaluaciones o entregas") + " en los próximos 7 días." : "Nada para rendir o entregar en los próximos 7 días."];
  },
  pantalla(el) {
    const f = ymd(), M = D().m, r = reloj(), tipoSel = `<select name="k" aria-label="Tipo">${Object.keys(TIPO).map(k => `<option value="${k}">${TIPO[k]}</option>`).join("")}</select>`, matSel = (n, sel) => `<select name="${n}" aria-label="Materia" required>${M.map(m => `<option value="${esc(m.id)}"${m.id === sel ? " selected" : ""}>${esc(m.n)}</option>`).join("")}</select>`;
    const pend = D().e.filter(e => !e.h).sort((a, b) => a.f < b.f ? -1 : 1), hechas = D().e.filter(e => e.h).sort((a, b) => a.f < b.f ? 1 : -1).slice(0, 6);
    const notaIn = e => `<input type="number" step="0.01" min="0" max="10" inputmode="decimal" placeholder="Nota" value="${typeof e.nota === "number" ? e.nota : ""}" data-c="nota" data-id="${esc(e.id)}" aria-label="Nota" style="width:84px;margin:0">`;
    const filaE = e => `<div class="fila"><button class="chk${e.h ? " on" : ""}" data-a="eok" data-id="${esc(e.id)}" aria-label="${e.h ? "Deshacer" : "Marcar como hecho"}">${e.h ? "✓" : ""}</button><div class="tx${e.h ? " hecha" : ""}"><span>${esc(nomEval(e))}</span><small>${esc(dmy(e.f))}${!e.h && e.f >= f ? " · " + cuando(e.f, f).toLowerCase() : !e.h ? " · venció hace " + dias(f, e.f) + (dias(f, e.f) === 1 ? " día" : " días") : ""}</small></div>${notaIn(e)}<button class="x" data-a="edel" data-id="${esc(e.id)}" aria-label="Borrar">✕</button></div>`;
    const sem = sesiones7(), minSem = id => sem.filter(x => x.m === id).reduce((s, x) => s + (x.min || 0), 0);
    const clases = m => SB.mods.notas && SB.mods.notas.porEtiqueta ? SB.mods.notas.porEtiqueta(slug(m.n)).slice(0, 5) : [];
    const tarjeta = m => { const pr = promedio(m.id), cl = clases(m);
      return `<section class="card"><div class="fila"><div class="tx"><span><b>${esc(m.n)}</b></span><small>${ORDEN.filter(d => (m.d || []).includes(d)).map(d => NOM[d]).join(" ") || "sin días de cursada"} · ${minSem(m.id) ? hm(minSem(m.id)) + " esta semana" : "sin estudio esta semana"}${pr ? " · promedio " + num(Math.round(pr.p * 100) / 100) + " (" + pr.n + ")" : ""}</small></div><button class="x" data-a="mdel" data-id="${esc(m.id)}" aria-label="Borrar materia">✕</button></div>
        ${estadoHtml(m)}
        ${cl.map(n => `<a class="item" href="#/notas/${esc(n.id)}">📝 ${esc(SB.mods.notas.titulo(n.x))}</a>`).join("")}
        ${SB.mods.notas && SB.mods.notas.crear ? `<div class="fila-b"><button data-a="clase" data-id="${esc(m.id)}">📝 Nota de clase</button></div>` : ""}</section>`; };
    el.innerHTML = `<section class="card"><h3>⏱️ Sesión de estudio</h3>
      ${r ? `<div class="reloj" id="rl">${hms(Date.now() - r.t0)}</div><p class="centro">${esc((mat(r.m) || {n: "Materia borrada"}).n)}</p><div class="fila-b"><button class="pri" data-a="parar">Parar y guardar</button><button data-a="descartar">Descartar</button></div>`
        : M.length ? `<form data-f="iniciar"><div class="fila-b">${matSel("m")}<button class="pri" style="width:auto;margin:0">▶ Iniciar</button></div></form>
          <details><summary>Cargar una sesión a mano</summary><form data-f="manual">${matSel("m")}<div class="fila-b"><input type="number" name="min" min="1" max="1440" placeholder="Minutos" required><input type="date" name="f" value="${f}" aria-label="Fecha"></div><button class="pri">Guardar sesión</button></form></details>`
        : `<p class="ayuda">Cargá una materia para medir tu tiempo de estudio.</p>`}
      <small>Últimos 7 días: ${sem.length ? hm(sem.reduce((s, x) => s + (x.min || 0), 0)) + " en " + sem.length + (sem.length === 1 ? " sesión" : " sesiones") : "sin sesiones"}.</small></section>
      <section class="card"><h3>📅 Parciales, finales y entregas</h3>${pend.length ? pend.map(filaE).join("") : `<p class="ayuda">Nada pendiente.</p>`}
      ${hechas.length ? `<details><summary>Hechas hace poco</summary>${hechas.map(filaE).join("")}</details>` : ""}
      ${M.length ? `<details><summary>Agregar evaluación o entrega</summary><form data-f="eval"><div class="fila-b">${tipoSel}${matSel("m")}</div><input name="n" placeholder="Título (opcional, ej: Unidades 1 a 3)" autocomplete="off"><input type="date" name="f" required aria-label="Fecha"><button class="pri">Agregar</button></form></details>` : ""}</section>
      ${progreso()}<h3>Materias</h3>${M.length ? M.map(tarjeta).join("") : `<p class="vacio">Todavía no cargaste materias.</p>`}
      <form data-f="materia"><input name="n" placeholder="Nueva materia (ej: Álgebra)" required autocomplete="off"><div class="chips">${ORDEN.map(d => `<label class="chip off"><input type="checkbox" name="d" value="${d}" hidden><span>${NOM[d]}</span></label>`).join("")}</div><small>Los días de cursada aparecen en Hoy.</small><button class="pri">Agregar materia</button></form>`;
    el.querySelectorAll(".chips label input").forEach(i => { i.onchange = () => i.parentNode.classList.toggle("off", !i.checked); });
    clearInterval(tic);
    if (r) tic = setInterval(() => { const n = document.getElementById("rl"); if (!n) return clearInterval(tic); n.textContent = hms(Date.now() - r.t0); }, 1000);
    eventos(el, {
      f: (a, fm) => {
        if (a === "materia") { const n = fm.n.value.trim(); if (!n) return; D().m.push({id: uid(), n, d: [...fm.querySelectorAll("input[name=d]:checked")].map(i => +i.value)}); guardar(); }
        else if (a === "iniciar") { if (!fm.m.value) return; SB.almacen.poner(RK, {m: fm.m.value, t0: Date.now()}); }
        else if (a === "manual") { const min = Math.round(+fm.min.value); if (!fm.m.value || !(min > 0)) return; sesion(fm.m.value, min, fm.f.value || f); SB.aviso("Sesión guardada"); }
        else if (a === "eval") { if (!fm.m.value || !fm.f.value) return; D().e.push({id: uid(), m: fm.m.value, k: TIPO[fm.k.value] ? fm.k.value : "parcial", n: fm.n.value.trim(), f: fm.f.value, nota: null, h: 0}); guardar(); }
        SB.pintar();
      },
      c: (a, n) => {
        if (a === "st" || a === "cor") { const m = mat(n.dataset.id); if (!m) return; if (a === "st") { if (n.value) m.st = n.value; else delete m.st; } else { const co = new Set(m.co || []); if (n.checked) co.add(n.dataset.o); else co.delete(n.dataset.o); if (co.size) m.co = [...co]; else delete m.co; } guardar(); return a === "st" ? SB.pintar() : undefined; }
        if (a !== "nota") return; const e = D().e.find(x => x.id === n.dataset.id); if (!e) return; const v = parseFloat(String(n.value).replace(",", ".")); e.nota = isFinite(v) ? v : null; guardar(); SB.pintar(); },
      a: (a, b) => {
        if (a === "parar") { const x = reloj(); SB.almacen.quitar(RK); if (x) { const min = Math.max(1, Math.round((Date.now() - x.t0) / 60000)); if (mat(x.m)) sesion(x.m, min); SB.aviso("Sesión guardada: " + hm(min)); } return SB.pintar(); }
        if (a === "descartar") { if (confirm("¿Descartar esta sesión sin guardarla?")) SB.almacen.quitar(RK); return SB.pintar(); }
        if (a === "clase") { const m = mat(b.dataset.id); if (!m) return; const n = SB.mods.notas.crear("Clase: " + m.n + "\n#clase #" + slug(m.n) + "\n\n**Fecha:** " + new Date().toLocaleDateString("es-AR") + "\n\n## Temas\n- \n\n## Apuntes\n\n\n## Para repasar\n- [ ] \n\n## Dudas\n- "); location.hash = "#/notas/" + n.id + "/e"; return; }
        if (a === "eok") { const e = D().e.find(x => x.id === b.dataset.id); if (e) { e.h = e.h ? 0 : 1; guardar(); } }
        else if (a === "edel") { const e = D().e.find(x => x.id === b.dataset.id); if (e && confirm("¿Borrar «" + nomEval(e) + "»?")) { D().e = D().e.filter(x => x !== e); guardar(); } }
        else if (a === "mdel") { const m = mat(b.dataset.id); if (m && confirm("¿Borrar «" + m.n + "» con sus evaluaciones y sesiones? Las notas de clase quedan en Notas.")) { D().m = D().m.filter(x => x !== m); D().m.forEach(o => { if (o.co) { o.co = o.co.filter(i => i !== m.id); if (!o.co.length) delete o.co; } }); D().e = D().e.filter(x => x.m !== m.id); D().s = D().s.filter(x => x.m !== m.id); guardar(); } }
        SB.pintar();
      }
    });
  }
});
})();
