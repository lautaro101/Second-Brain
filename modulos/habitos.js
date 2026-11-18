/* Módulo Hábitos. Un hábito: {id, n nombre, d días de la semana (0=dom…6=sáb), h {AAAA-MM-DD: 1} días cumplidos}. Racha = días programados seguidos cumplidos. */
(function () {
const {esc, norm, ymd, uid, sumar, eventos} = SB.u, D = () => SB.datos("habitos");
const NOM = ["D", "L", "M", "M", "J", "V", "S"], ORDEN = [1, 2, 3, 4, 5, 6, 0];
const toca = (h, f) => h.d.includes(new Date(f + "T12:00:00").getDay());
const racha = h => { let n = 0, f = ymd(), hoy = f; for (let i = 0; i < 400; i++, f = sumar(f, -1)) { if (!toca(h, f)) continue; if (h.h[f]) n++; else if (f !== hoy) break; } return n; };
const alternar = (h, f) => { if (h.h[f]) delete h.h[f]; else h.h[f] = 1; SB.guardar("habitos"); };

SB.registrar({
  id: "habitos", nombre: "Hábitos", icono: "🔁", esquema: 1,
  inicial: () => ({h: []}), migraciones: {}, sync: [{k: "h", orden: "asc"}],
  hoy() { const f = ymd(); return D().h.filter(h => toca(h, f)).map(h => ({t: h.n, s: racha(h) ? "Racha: " + racha(h) + (racha(h) === 1 ? " día" : " días") : "", hecho: !!h.h[f], tocar: () => alternar(h, f), o: h.h[f] ? 1 : 0}))
    .sort((a, b) => a.o - b.o); },
  buscar: q => D().h.filter(h => norm(h.n).includes(norm(q))).map(h => ({t: h.n, s: "racha " + racha(h)})),
  avisos: () => [],
  semana() { let prog = 0, hecho = 0; D().h.forEach(h => { for (let i = 0; i < 7; i++) { const f = sumar(ymd(), -i); if (toca(h, f)) { prog++; if (h.h[f]) hecho++; } } });
    return prog ? ["Cumpliste " + hecho + " de " + prog + " hábitos programados (" + Math.round(100 * hecho / prog) + " %)."] : ["Todavía no cargaste hábitos."]; },
  pantalla(el) {
    const f = ymd(), ult = [6, 5, 4, 3, 2, 1, 0].map(i => sumar(f, -i));
    el.innerHTML = `<form data-f="n"><input name="n" placeholder="Nuevo hábito (ej: Inglés 20 min)" required autocomplete="off"><div class="chips">${ORDEN.map(d => `<label class="chip"><input type="checkbox" name="d" value="${d}" checked hidden><span>${NOM[d]}</span></label>`).join("")}</div><button class="pri">Agregar</button></form>
      ${D().h.length ? D().h.map(h => `<section class="card"><div class="fila"><button class="chk${h.h[f] ? " on" : ""}" data-a="ok" data-id="${h.id}" aria-label="Hoy">${h.h[f] ? "✓" : ""}</button><div class="tx"><span>${esc(h.n)}</span><small>${ORDEN.filter(d => h.d.includes(d)).map(d => NOM[d]).join(" ")} · racha ${racha(h)}</small></div><button class="x" data-a="del" data-id="${h.id}" aria-label="Borrar">✕</button></div>
        <div class="puntos">${ult.map(d => `<i class="${h.h[d] ? "si" : toca(h, d) ? "no" : "na"}" title="${d}"></i>`).join("")}</div></section>`).join("") : `<p class="vacio">Cargá tu primer hábito.</p>`}`;
    el.querySelectorAll(".chips label input").forEach(i => { i.onchange = () => i.parentNode.classList.toggle("off", !i.checked); });
    eventos(el, {
      f: (a, fm) => { const d = [...fm.querySelectorAll("input[name=d]:checked")].map(i => +i.value); if (!d.length) return SB.aviso("Elegí al menos un día");
        D().h.push({id: uid(), n: fm.n.value.trim(), d, h: {}}); SB.guardar("habitos"); SB.pintar(); },
      a: (a, b) => { const h = D().h.find(x => x.id === b.dataset.id); if (!h) return;
        if (a === "ok") alternar(h, f); else if (a === "del" && confirm("¿Borrar «" + h.n + "» y su historial?")) { D().h = D().h.filter(x => x !== h); SB.guardar("habitos"); } SB.pintar(); }
    });
  }
});
})();
