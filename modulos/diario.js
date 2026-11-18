/* Módulo Diario y reflexión. Una entrada por día: e[AAAA-MM-DD] = {x texto, a ánimo 1-5, g algo bueno del día}. */
(function () {
const {esc, norm, ymd, sumar, eventos} = SB.u, D = () => SB.datos("diario");
const CARAS = ["😞", "🙁", "😐", "🙂", "😄"];
const PREG = ["¿Qué salió bien hoy?", "¿Qué aprendí hoy?", "¿Qué me costó y qué haría distinto?", "¿Qué avancé en programación o estudio?", "¿Cómo está mi cuerpo y mi energía?", "¿De qué estoy orgulloso?", "¿Qué quiero hacer mañana primero?"];
const preg = f => PREG[Math.floor(new Date(f + "T12:00:00").getTime() / 864e5) % PREG.length];
const ent = f => D().e[f] || (D().e[f] = {x: "", a: 0, g: ""});
const vacia = e => !e || (!e.x && !e.a && !e.g);
const largo = f => new Date(f + "T12:00:00").toLocaleDateString("es-AR", {weekday: "long", day: "numeric", month: "long"});

SB.registrar({
  id: "diario", nombre: "Diario", icono: "📔", esquema: 1,
  inicial: () => ({e: {}}), migraciones: {}, sync: [{k: "e"}],
  captura: {etiqueta: "Diario", guardar: t => { const e = ent(ymd()); e.x = (e.x ? e.x + "\n" : "") + t; SB.guardar("diario"); }},
  hoy() { const e = D().e[ymd()], hecho = !!(e && e.x); return [{t: "Reflexión del día", s: hecho ? "Ya escribiste hoy" : preg(ymd()), hecho, ir: "#/diario"}]; },
  buscar: q => Object.keys(D().e).sort().reverse().filter(f => norm((D().e[f].x || "") + " " + (D().e[f].g || "")).includes(norm(q))).map(f => ({t: largo(f), s: (D().e[f].x || D().e[f].g).slice(0, 70), ir: "#/diario/" + f})),
  avisos: () => [],
  semana() { const fs = [0, 1, 2, 3, 4, 5, 6].map(i => sumar(ymd(), -i)), con = fs.filter(f => D().e[f] && D().e[f].x).length, an = fs.map(f => D().e[f] && D().e[f].a).filter(Boolean);
    return [con + " de 7 días con reflexión escrita.", an.length ? "Ánimo promedio: " + (an.reduce((s, n) => s + n, 0) / an.length).toFixed(1).replace(".", ",") + " de 5." : "Sin ánimo registrado."]; },
  pantalla(el, sub) {
    const f = /^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : ymd(), e = D().e[f] || {x: "", a: 0, g: ""};
    const pas = Object.keys(D().e).filter(k => k !== f && !vacia(D().e[k])).sort().reverse().slice(0, 30);
    el.innerHTML = `<h2 class="fecha">${esc(largo(f))}</h2><section class="card"><div class="animo">${CARAS.map((c, i) => `<button class="${e.a === i + 1 ? "on" : ""}" data-a="a" data-n="${i + 1}" aria-label="Ánimo ${i + 1} de 5">${c}</button>`).join("")}</div>
      <p class="ayuda">${esc(preg(f))}</p><textarea id="dx" rows="8" placeholder="Escribí lo que quieras…">${esc(e.x)}</textarea>
      <input id="dg" placeholder="Una cosa buena de hoy" value="${esc(e.g)}" autocomplete="off"><small id="ok">Se guarda solo.</small></section>
      ${f !== ymd() ? `<a class="btn" href="#/diario">Volver a hoy</a>` : ""}
      ${pas.length ? `<section class="card"><h3>Días anteriores</h3>${pas.map(k => `<a class="item" href="#/diario/${k}"><b>${esc(SB.u.dmy(k))} ${D().e[k].a ? CARAS[D().e[k].a - 1] : ""}</b><small>${esc((D().e[k].x || D().e[k].g).slice(0, 80))}</small></a>`).join("")}</section>` : ""}`;
    let t; const guardar = () => { clearTimeout(t); t = setTimeout(() => { const n = ent(f); n.x = document.getElementById("dx").value; n.g = document.getElementById("dg").value; if (vacia(n)) delete D().e[f]; SB.guardar("diario"); const o = document.getElementById("ok"); if (o) o.textContent = "Guardado ✓"; }, 500); };
    document.getElementById("dx").oninput = document.getElementById("dg").oninput = guardar;
    eventos(el, {a: (a, b) => { const n = ent(f); n.a = n.a === +b.dataset.n ? 0 : +b.dataset.n; if (vacia(n)) delete D().e[f]; SB.guardar("diario"); el.querySelectorAll(".animo button").forEach(x => x.classList.toggle("on", +x.dataset.n === n.a)); }});
  }
});
})();
