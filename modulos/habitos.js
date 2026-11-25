/* Módulo Hábitos. Un hábito: {id, n nombre, d días de la semana (0=dom…6=sáb), v veces por semana (opcional: sin día fijo, y d queda vacío), h {AAAA-MM-DD: 1} días cumplidos, x {AAAA-MM-DD: nota} una nota por día (opcional)}.
   Racha = días programados seguidos cumplidos; en los de «veces por semana», semanas seguidas con la meta cumplida (la semana va de lunes a domingo).
   Pausa: pz = desde cuándo está pausado (si lo está), pr = pausas ya terminadas [[desde, hasta]]. Los días en pausa no cuentan ni cortan la racha, y no entran en Hoy, avisos ni porcentajes.
   Estadísticas (📊 en cada hábito): cumplimiento de la semana / 30 días / mes, racha actual y mejor racha, y el mapa de calor del mes.
   Aviso: mientras el hábito de hoy siga pendiente, llega un aviso por día (el service worker no lo muestra si la app está abierta y a la vista). */
(function () {
const {esc, norm, ymd, uid, sumar, dmy, eventos} = SB.u, D = () => SB.datos("habitos");
const NOM = ["D", "L", "M", "M", "J", "V", "S"], ORDEN = [1, 2, 3, 4, 5, 6, 0];
const dow = f => new Date(f + "T12:00:00").getDay();
const lunes = f => sumar(f, -((dow(f) + 6) % 7));
const veces = h => Number.isInteger(h.v) && h.v >= 1 && h.v <= 7 ? h.v : 0;
const cuantas = (h, f) => { const l = lunes(f); let n = 0; for (let i = 0; i < 7; i++) if (h.h[sumar(l, i)]) n++; return n; };   // cumplidas en la semana de f
const toca = (h, f) => veces(h) ? !!h.h[f] || cuantas(h, f) < veces(h) : h.d.includes(dow(f));   // «veces por semana»: hasta cumplir la meta, cualquier día
const pausado = (h, f) => (!!h.pz && f >= h.pz) || (h.pr || []).some(r => f >= r[0] && f <= r[1]);
const pend = (h, f) => !h.h[f] && !pausado(h, f) && (veces(h) ? cuantas(h, f) < veces(h) : h.d.includes(dow(f)));
const racha = h => {
  if (veces(h)) { let n = 0, l = lunes(ymd()); for (let i = 0; i < 200; i++, l = sumar(l, -7)) { if (cuantas(h, l) >= veces(h)) n++; else if (i > 0 && ![0, 1, 2, 3, 4, 5, 6].some(k => pausado(h, sumar(l, k)))) break; } return n; }
  let n = 0, f = ymd(), hoy = f; for (let i = 0; i < 400; i++, f = sumar(f, -1)) { if (!h.d.includes(dow(f)) || pausado(h, f)) continue; if (h.h[f]) n++; else if (f !== hoy) break; } return n; };
const unidad = (h, n) => veces(h) ? (n === 1 ? " semana" : " semanas") : (n === 1 ? " día" : " días");
const alternar = (h, f) => { if (h.h[f]) delete h.h[f]; else h.h[f] = 1; SB.guardar("habitos"); };
/* Estadísticas. Cumplimiento = hechos / programados en el rango, sin contar los días en pausa ni el día de hoy si todavía está pendiente.
   «Veces por semana»: se cuenta por semana (lunes a domingo); la semana en curso solo entra si ya cumpliste la meta. */
const cumplimiento = (h, desde, hasta) => { const hoy = ymd(), fin = hasta > hoy ? hoy : hasta; if (fin < desde) return null; let prog = 0, hecho = 0;
  if (veces(h)) { const v = veces(h); for (let l = lunes(desde), i = 0; l <= fin && i < 600; l = sumar(l, 7), i++) { const dias = [0, 1, 2, 3, 4, 5, 6].map(k => sumar(l, k)); if (dias.every(d => pausado(h, d))) continue;
      const c = cuantas(h, l); if (sumar(l, 6) < hoy) { prog += v; hecho += Math.min(v, c); } else if (c >= v) { prog += v; hecho += v; } } }
  else for (let f = desde, i = 0; f <= fin && i < 4000; f = sumar(f, 1), i++) if (h.d.includes(dow(f)) && !pausado(h, f) && (h.h[f] || f < hoy)) { prog++; if (h.h[f]) hecho++; }
  return prog ? Math.round(100 * hecho / prog) : null; };
const mejor = h => { const ks = Object.keys(h.h).sort(), hoy = ymd(); if (!ks.length) return 0; let best = 0, run = 0;
  if (veces(h)) { for (let l = lunes(ks[0]), i = 0; l <= hoy && i < 600; l = sumar(l, 7), i++) { if (cuantas(h, l) >= veces(h)) { run++; best = Math.max(best, run); } else if (sumar(l, 6) < hoy && ![0, 1, 2, 3, 4, 5, 6].some(k => pausado(h, sumar(l, k)))) run = 0; } return best; }
  for (let f = ks[0], i = 0; f <= hoy && i < 4000; f = sumar(f, 1), i++) { if (!h.d.includes(dow(f)) || pausado(h, f)) continue; if (h.h[f]) { run++; best = Math.max(best, run); } else if (f < hoy) run = 0; } return best; };
const mesMas = (m, n) => { const [a, x] = m.split("-").map(Number), d = new Date(a, x - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const mesNom = m => { const [a, x] = m.split("-").map(Number); return new Date(a, x - 1, 1).toLocaleDateString("es-AR", {month: "long", year: "numeric"}); };
const mapa = (h, mes) => { const [a, m] = mes.split("-").map(Number), dias = new Date(a, m, 0).getDate(), ini = (dow(mes + "-01") + 6) % 7, hoy = ymd(); let c = "";
  for (let i = 0; i < ini; i++) c += "<span></span>";
  for (let d = 1; d <= dias; d++) { const f = mes + "-" + String(d).padStart(2, "0"), est = h.h[f] ? "si" : pausado(h, f) ? "pz" : f < hoy && !veces(h) && h.d.includes(dow(f)) ? "no" : "na";
    c += `<i class="${est}" title="${f}"${f === hoy ? ' style="outline:2px solid currentColor"' : ""}>${d}</i>`; }
  return `<div class="mes-hm">${["L", "M", "M", "J", "V", "S", "D"].map(x => `<b>${x}</b>`).join("")}${c}</div>`; };
let abierto = "", estAbierto = "", mesVer = ymd().slice(0, 7);   // hábito con el panel de notas abierto / con las estadísticas abiertas

SB.registrar({
  id: "habitos", nombre: "Hábitos", icono: "🔁", esquema: 1,
  inicial: () => ({h: []}), migraciones: {}, sync: [{k: "h", orden: "asc"}],
  util: {racha, mejor, cumplimiento, pausado, lista: () => D().h.map(h => ({id: h.id, n: h.n})), cumplidos: (id, desde) => { const h = D().h.find(x => x.id === id), hoy = ymd(); return h ? Object.keys(h.h).filter(d => d >= desde && d <= hoy).length : 0; }},   // «cumplidos» lo usa Objetivos
  hoy() { const f = ymd();
    return D().h.filter(h => toca(h, f) && !pausado(h, f)).map(h => ({t: h.n, s: veces(h) ? cuantas(h, f) + "/" + veces(h) + " esta semana" + (racha(h) ? " · racha: " + racha(h) + unidad(h, racha(h)) : "") : racha(h) ? "Racha: " + racha(h) + unidad(h, racha(h)) : "", hecho: !!h.h[f], tocar: () => alternar(h, f), o: h.h[f] ? 1 : 0}))
      .sort((a, b) => a.o - b.o); },
  buscar: q => D().h.filter(h => norm(h.n + " " + Object.values(h.x || {}).join(" ")).includes(norm(q))).map(h => ({t: h.n, s: (veces(h) ? veces(h) + " veces por semana · racha " : "racha ") + racha(h)})),
  avisos: () => { const f = ymd(); return D().h.filter(h => pend(h, f)).map(h => ({f, t: "Hábito", c: h.n + (racha(h) ? " · racha " + racha(h) + unidad(h, racha(h)) : ""), k: h.id, solo: true, bg: true})); },   // uno por día mientras siga pendiente
  semana() { let prog = 0, hecho = 0; D().h.forEach(h => { const ult = [0, 1, 2, 3, 4, 5, 6].map(i => sumar(ymd(), -i)); if (ult.every(d => pausado(h, d))) return;
      if (veces(h)) { prog += veces(h); hecho += Math.min(veces(h), ult.filter(d => h.h[d]).length); }
      else ult.forEach(f => { if (h.d.includes(dow(f)) && !pausado(h, f)) { prog++; if (h.h[f]) hecho++; } }); });
    return prog ? ["Cumpliste " + hecho + " de " + prog + " hábitos programados (" + Math.round(100 * hecho / prog) + " %)."] : ["Todavía no cargaste hábitos."]; },
  pantalla(el) {
    const f = ymd(), ult = [6, 5, 4, 3, 2, 1, 0].map(i => sumar(f, -i));
    const notas = h => { const t = (h.x || {})[f], tg = `<button type="button" class="link" data-a="nota" data-id="${h.id}">📝 ${t ? "Nota de hoy ✓" : "Nota de hoy"}</button>`;
      if (abierto !== h.id) return tg;
      const ant = Object.keys(h.x || {}).filter(d => d !== f).sort().reverse().slice(0, 5);
      return tg + `<form data-f="nota" data-id="${h.id}" class="fila-b"><input name="t" value="${esc(t || "")}" maxlength="500" placeholder="¿Cómo te fue hoy con esto?" autocomplete="off"><button>Guardar</button></form>${ant.map(d => `<small style="display:block;margin:2px 0"><b>${esc(dmy(d))}</b> ${esc(h.x[d])}</small>`).join("")}`; };
    const pc = x => x == null ? "—" : x + " %";
    const estad = h => { const tg = `<button type="button" class="link" data-a="est" data-id="${h.id}">📊 ${estAbierto === h.id ? "Ocultar estadísticas" : "Estadísticas"}</button>`;
      if (estAbierto !== h.id) return tg;
      const r = racha(h), mj = mejor(h);
      return tg + `<div style="margin:6px 0"><small>Cumplimiento · esta semana: <b>${pc(cumplimiento(h, lunes(f), f))}</b> · 30 días: <b>${pc(cumplimiento(h, sumar(f, -29), f))}</b> · este mes: <b>${pc(cumplimiento(h, f.slice(0, 7) + "-01", f))}</b></small><br><small>Racha actual: <b>${r}${unidad(h, r)}</b> · Mejor racha: <b>${mj}${unidad(h, mj)}</b></small></div>
        <div class="fila-b"><button type="button" data-a="mes" data-d="-1" data-id="${h.id}" aria-label="Mes anterior">‹</button><b style="flex:1;text-align:center">${esc(mesNom(mesVer))}</b><button type="button" data-a="mes" data-d="1" data-id="${h.id}" aria-label="Mes siguiente">›</button></div>
        ${mapa(h, mesVer)}<div class="ley"><i class="si">hecho</i><i class="no">faltó</i><i class="pz">en pausa</i></div>
        <button type="button" class="link" data-a="pausa" data-id="${h.id}">${h.pz ? "▶️ Reanudar el hábito" : "⏸️ Pausar el hábito (no corta la racha)"}</button>`; };
    el.innerHTML = `<form data-f="n"><input name="n" placeholder="Nuevo hábito (ej: Inglés 20 min)" required autocomplete="off"><div class="chips">${ORDEN.map(d => `<label class="chip"><input type="checkbox" name="d" value="${d}" checked hidden><span>${NOM[d]}</span></label>`).join("")}</div><input type="number" name="v" min="1" max="7" inputmode="numeric" placeholder="O: veces por semana, cualquier día (1 a 7)" aria-label="Veces por semana"><button class="pri">Agregar</button></form>
      ${D().h.length ? D().h.map(h => `<section class="card"><div class="fila"><button class="chk${h.h[f] ? " on" : ""}" data-a="ok" data-id="${h.id}" aria-label="Hoy">${h.h[f] ? "✓" : ""}</button><div class="tx"><span>${esc(h.n)}</span><small>${veces(h) ? veces(h) + " veces por semana · esta semana " + cuantas(h, f) + "/" + veces(h) : ORDEN.filter(d => h.d.includes(d)).map(d => NOM[d]).join(" ")} · racha ${racha(h)}${veces(h) ? unidad(h, racha(h)) : ""}${h.pz ? " · ⏸️ en pausa desde " + esc(dmy(h.pz)) : ""}</small></div><button class="x" data-a="del" data-id="${h.id}" aria-label="Borrar">✕</button></div>
        <div class="puntos">${ult.map(d => `<i class="${h.h[d] ? "si" : !veces(h) && h.d.includes(dow(d)) ? "no" : "na"}" title="${d}"></i>`).join("")}</div>${notas(h)}${estad(h)}</section>`).join("") : `<p class="vacio">Cargá tu primer hábito.</p>`}`;
    el.querySelectorAll(".chips label input").forEach(i => { i.onchange = () => i.parentNode.classList.toggle("off", !i.checked); });
    eventos(el, {
      f: (a, fm) => {
        if (a === "nota") { const h = D().h.find(x => x.id === fm.dataset.id); if (!h) return; const t = fm.t.value.trim().slice(0, 500); h.x = h.x || {}; if (t) h.x[f] = t; else delete h.x[f]; if (!Object.keys(h.x).length) delete h.x; SB.guardar("habitos"); return SB.pintar(); }
        const n = fm.n.value.trim(), v = parseInt(fm.v ? fm.v.value : "", 10), d = [...fm.querySelectorAll("input[name=d]:checked")].map(i => +i.value);
        if (!n) return; if (!(v >= 1 && v <= 7) && !d.length) return SB.aviso("Elegí al menos un día o cuántas veces por semana");
        D().h.push(v >= 1 && v <= 7 ? {id: uid(), n, d: [], v, h: {}} : {id: uid(), n, d, h: {}}); SB.guardar("habitos"); SB.pintar(); },
      a: (a, b) => { const h = D().h.find(x => x.id === b.dataset.id); if (!h) return;
        if (a === "nota") { abierto = abierto === h.id ? "" : h.id; return SB.pintar(); }
        if (a === "est") { estAbierto = estAbierto === h.id ? "" : h.id; mesVer = f.slice(0, 7); return SB.pintar(); }
        if (a === "mes") { const n = mesMas(mesVer, +b.dataset.d); if (n <= f.slice(0, 7)) mesVer = n; return SB.pintar(); }
        if (a === "pausa") { if (h.pz) { if (h.pz < f) (h.pr = h.pr || []).push([h.pz, sumar(f, -1)]); delete h.pz; } else h.pz = f; SB.guardar("habitos"); return SB.pintar(); }
        if (a === "ok") alternar(h, f); else if (a === "del" && confirm("¿Borrar «" + h.n + "» y su historial?")) { D().h = D().h.filter(x => x !== h); SB.guardar("habitos"); } SB.pintar(); }
    });
  }
});
})();
