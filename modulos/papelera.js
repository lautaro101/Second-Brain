/* Módulo Papelera. Nada se borra de golpe: cualquier cosa que borres en otro módulo (una nota, una tarea, un hábito, un proyecto…) pasa acá 30 días y se puede devolver.
   Los módulos no tienen que hacer nada: este módulo mira cada guardado (SB.alCambio) y, si falta algo que había (por id), lo guarda.
   Lo que llega de otro dispositivo (sincronización) no cuenta como borrado tuyo, y las notas vacías se descartan sin dejar rastro.
   Datos: {x: [{id, g grupo (lo borrado de una vez), m módulo, k colección, i el elemento tal cual estaba, f cuándo, l etiqueta}]}. */
(function () {
const {esc, uid, eventos} = SB.u, D = () => SB.datos("papelera"), DIAS = 30, MAX = 400;

/* ---------- qué había antes del último guardado ---------- */
const FOTO = {};
const foto = id => { const d = SB.datos(id), r = {};
  if (d && typeof d === "object") Object.keys(d).forEach(k => { if (!Array.isArray(d[k])) return; const m = new Map(); d[k].forEach(v => { if (v && typeof v === "object" && v.id != null) m.set(String(v.id), v); }); r[k] = m; });
  return r; };
const etiqueta = v => { const t = [v.n, v.t, v.nom, v.x, v.c, v.d].find(a => typeof a === "string" && a.trim());
  return String(t || "Sin título").split("\n").find(l => l.trim()).replace(/^#+\s*/, "").trim().slice(0, 70); };
const vacio = v => v._sinPapelera === 1 || (typeof v.x === "string" && !v.x.trim() && !v.n && !v.t);   // _sinPapelera: lo que un módulo quita por su cuenta (ej.: la repetición de una tarea que se deshace)

function alCambiar(id, silencioso) {
  if (id === "papelera" || !SB.datos(id)) return;
  const antes = FOTO[id], ahora = foto(id); FOTO[id] = ahora;
  if (silencioso || !antes) return;
  const idos = []; Object.keys(antes).forEach(k => antes[k].forEach((v, i) => { if (!(ahora[k] && ahora[k].has(i)) && !vacio(v)) idos.push({k, v}); }));
  if (!idos.length || !SB.mods.papelera || !D()) return;
  const g = uid(), f = Date.now();
  idos.forEach(o => D().x.unshift({id: uid(), g, m: id, k: o.k, i: JSON.parse(JSON.stringify(o.v)), f, l: etiqueta(o.v)}));
  if (D().x.length > MAX) D().x.length = MAX;
  SB.guardar("papelera");
}
SB.alCambio.push(alCambiar);
SB.alArrancar.push(() => { SB.orden.forEach(id => { if (id !== "papelera" && SB.datos(id)) FOTO[id] = foto(id); }); vaciarVencidas(); });

function vaciarVencidas() { const lim = Date.now() - DIAS * 864e5, n = D().x.length; D().x = D().x.filter(e => e.f >= lim); if (D().x.length !== n) SB.guardar("papelera"); }
const grupos = () => { const m = new Map(); D().x.forEach(e => { if (!m.has(e.g)) m.set(e.g, []); m.get(e.g).push(e); }); return [...m.values()]; };
const hace = f => { const d = Math.floor((Date.now() - f) / 864e5); return d <= 0 ? "hoy" : d === 1 ? "ayer" : "hace " + d + " días"; };
const quedan = f => Math.max(0, DIAS - Math.floor((Date.now() - f) / 864e5));

function restaurar(g) {
  const es = D().x.filter(e => e.g === g); let n = 0, falta = 0;
  es.forEach(e => {
    const d = SB.datos(e.m), a = d && d[e.k];
    if (!Array.isArray(a)) { falta++; return; }
    if (!a.some(v => v && String(v.id) === String(e.i.id))) a.push(JSON.parse(JSON.stringify(e.i)));
    n++;
  });
  [...new Set(es.map(e => e.m))].forEach(m => { if (SB.datos(m)) SB.guardar(m); });
  D().x = D().x.filter(e => e.g !== g || !(SB.datos(e.m) && Array.isArray(SB.datos(e.m)[e.k])));
  SB.guardar("papelera");
  return {n, falta};
}

SB.registrar({
  id: "papelera", nombre: "Papelera", icono: "🗑️", esquema: 1,
  inicial: () => ({x: []}), migraciones: {}, sync: [{k: "x", orden: "desc", t: x => x.f || 0}],
  buscar: q => { const nq = SB.u.norm(q); return grupos().filter(gr => SB.u.norm(gr[0].l).includes(nq)).slice(0, 5).map(gr => ({t: gr[0].l, s: "en la papelera, " + hace(gr[0].f), ir: "#/papelera"})); },
  semana: () => { const n = grupos().length; return n ? ["La papelera tiene " + n + (n === 1 ? " cosa" : " cosas") + ". Se vacía sola a los " + DIAS + " días."] : []; },
  pantalla(el) {
    const gs = grupos();
    el.innerHTML = gs.length ? `<p class="ayuda" style="margin:0 0 12px">Lo que borrás en cualquier módulo queda acá ${DIAS} días y después se elimina solo.</p>`
      + gs.map(gr => { const e = gr[0], mod = SB.mods[e.m], mas = gr.length - 1;
        return `<section class="card"><div class="fila"><span class="ic-m">${mod ? esc(mod.icono) : "📄"}</span><div class="tx"><span><b>${esc(e.l)}</b></span><small>${mod ? esc(mod.nombre) : esc(e.m) + " (módulo no disponible)"} · borrado ${hace(e.f)}${mas ? " · con " + mas + (mas === 1 ? " elemento más" : " elementos más") : ""} · se elimina en ${quedan(e.f)} d</small></div></div>
          <div class="fila-b"><button type="button" class="pri chico" data-a="rest" data-g="${esc(e.g)}"${mod ? "" : " disabled"}>↩ Restaurar</button><button type="button" class="x" data-a="elim" data-g="${esc(e.g)}">Eliminar ya</button></div></section>`; }).join("")
      + `<button type="button" class="link" data-a="vaciar">Vaciar la papelera</button>`
      : `<p class="vacio">La papelera está vacía.<br>Lo que borres en cualquier módulo va a aparecer acá, por si te arrepentís.</p>`;
    eventos(el, {a: (a, b) => {
      if (a === "rest") { const r = restaurar(b.dataset.g); SB.aviso(r.falta ? "Restaurado (" + r.falta + " sin lugar donde volver)" : "Restaurado"); }
      else if (a === "elim") { if (confirm("¿Eliminar para siempre? Esto no se puede deshacer.")) { D().x = D().x.filter(e => e.g !== b.dataset.g); SB.guardar("papelera"); } }
      else if (a === "vaciar") { if (confirm("¿Vaciar la papelera? Se elimina todo para siempre.")) { D().x = []; SB.guardar("papelera"); } }
      SB.pintar();
    }});
  }
});
})();
