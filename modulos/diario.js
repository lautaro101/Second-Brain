/* Módulo Diario y reflexión. Una entrada por día: e[AAAA-MM-DD] = {x texto, a ánimo 1-5, g algo bueno del día, q {idPregunta: respuesta}}.
   Check-ins guiados: tres momentos del día (mañana hasta las 12, tarde hasta las 19, noche) y tres áreas: desarrollo personal, físico (gym y calistenia) e informática y programación.
   El id de cada pregunta dice el momento y el área: «m-p1» = mañana, personal, la primera. Las respuestas viven en q y se guardan solas. */
(function () {
const {esc, norm, ymd, sumar, eventos} = SB.u, D = () => SB.datos("diario");
const CARAS = ["😞", "🙁", "😐", "🙂", "😄"];
const PREG = ["¿Qué salió bien hoy?", "¿Qué aprendí hoy?", "¿Qué me costó y qué haría distinto?", "¿Qué avancé en programación o estudio?", "¿Cómo está mi cuerpo y mi energía?", "¿De qué estoy orgulloso?", "¿Qué quiero hacer mañana primero?"];
const MOM = {m: ["Mañana", "🌅", "Plan del día"], t: ["Tarde", "🌤️", "Cómo va el día"], n: ["Noche", "🌙", "Cierre del día"]};
const AREAS = {p: ["🧠", "Desarrollo personal"], f: ["🏋️", "Físico (gym y calistenia)"], i: ["💻", "Informática y programación"]};
const QS = [
  {id: "m-p1", t: "¿Cuál es mi prioridad número 1 de hoy?"}, {id: "m-p2", t: "¿Cómo dormí y con qué energía arranco?"},
  {id: "m-f1", t: "¿Qué entreno hoy? (gym, calistenia o descanso)"}, {id: "m-f2", t: "¿Qué meta concreta tengo? (ej: 3×8 press, 5 dominadas, 1 min de plancha)"},
  {id: "m-i1", t: "¿Qué voy a programar o estudiar hoy?"}, {id: "m-i2", t: "¿Cuál es el primer paso concreto?"},
  {id: "t-p1", t: "¿Voy como planeé? ¿Qué me está distrayendo?"}, {id: "t-p2", t: "¿Qué puedo simplificar o dejar para mañana?"},
  {id: "t-f1", t: "¿Entrené o cuándo voy a entrenar? ¿Cómo vengo con la comida y el agua?"},
  {id: "t-i1", t: "¿Qué avancé hasta ahora?"}, {id: "t-i2", t: "¿En qué estoy trabado y qué probé?"},
  {id: "n-p1", t: "¿Qué salió bien hoy?"}, {id: "n-p2", t: "¿Qué aprendí o qué haría distinto?"}, {id: "n-p3", t: "¿Qué quiero hacer mañana primero?"},
  {id: "n-f1", t: "¿Qué entrené? (ejercicios, series, repeticiones, pesos)"}, {id: "n-f2", t: "¿Cómo me sentí y qué mejoro la próxima vez?"},
  {id: "n-i1", t: "¿Qué avancé en programación o informática hoy?"}, {id: "n-i2", t: "¿Qué aprendí o qué error resolví?"}
];
const delMom = mo => QS.filter(q => q.id[0] === mo);
const momento = (hh = new Date().getHours()) => hh < 12 ? "m" : hh < 19 ? "t" : "n";
const resp = (e, mo) => delMom(mo).filter(q => e && e.q && e.q[q.id]).length;
const preg = f => PREG[Math.floor(new Date(f + "T12:00:00").getTime() / 864e5) % PREG.length];
const ent = f => D().e[f] || (D().e[f] = {x: "", a: 0, g: ""});
const vacia = e => !e || (!e.x && !e.a && !e.g && !(e.q && Object.keys(e.q).length));
const resumen = e => e.x || e.g || Object.values(e.q || {})[0] || "";
const largo = f => new Date(f + "T12:00:00").toLocaleDateString("es-AR", {weekday: "long", day: "numeric", month: "long"});
let elegido = "";   // momento elegido en la pantalla (si no, el que corresponde a la hora)

SB.registrar({
  id: "diario", nombre: "Diario", icono: "📔", esquema: 1,
  inicial: () => ({e: {}}), migraciones: {}, sync: [{k: "e"}],
  util: {preguntas: QS, momento, respondidas: resp},
  captura: {etiqueta: "Diario", guardar: t => { const e = ent(ymd()); e.x = (e.x ? e.x + "\n" : "") + t; SB.guardar("diario"); }},
  hoy() { const e = D().e[ymd()], hecho = !!(e && e.x), mo = momento(), n = delMom(mo).length, r = resp(e, mo);
    return [{t: "Reflexión del día", s: hecho ? "Ya escribiste hoy" : preg(ymd()), hecho, ir: "#/diario"},
            {t: "Check-in de la " + MOM[mo][0].toLowerCase(), s: r ? r + " de " + n + " respondidas" : MOM[mo][2] + " · " + n + " preguntas", hecho: r > 0, ir: "#/diario"}]; },
  buscar: q => Object.keys(D().e).sort().reverse().filter(f => norm((D().e[f].x || "") + " " + (D().e[f].g || "") + " " + Object.values(D().e[f].q || {}).join(" ")).includes(norm(q))).map(f => ({t: largo(f), s: resumen(D().e[f]).slice(0, 70), ir: "#/diario/" + f})),
  avisos: () => { const f = ymd(); return SB.avisoActivo("diario") && vacia(D().e[f]) ? [{f, t: "Check-in del diario", c: "Todavía no escribiste nada hoy: mañana, tarde o noche, lo que toque.", k: "diario", solo: true, bg: true}] : []; },   // uno por día mientras no hayas escrito
  semana() { const fs = [0, 1, 2, 3, 4, 5, 6].map(i => sumar(ymd(), -i)), con = fs.filter(f => D().e[f] && D().e[f].x).length, an = fs.map(f => D().e[f] && D().e[f].a).filter(Boolean),
      ci = Object.keys(MOM).map(k => fs.filter(f => resp(D().e[f], k)).length);
    return [con + " de 7 días con reflexión escrita.", an.length ? "Ánimo promedio: " + (an.reduce((s, n) => s + n, 0) / an.length).toFixed(1).replace(".", ",") + " de 5." : "Sin ánimo registrado.",
      "Check-ins guiados: " + ci[0] + (ci[0] === 1 ? " mañana, " : " mañanas, ") + ci[1] + (ci[1] === 1 ? " tarde, " : " tardes, ") + ci[2] + (ci[2] === 1 ? " noche." : " noches.")]; },
  pantalla(el, sub) {
    const f = /^\d{4}-\d{2}-\d{2}$/.test(sub) ? sub : ymd(), e = D().e[f] || {x: "", a: 0, g: ""}, mo = elegido || momento(), qs = delMom(mo);
    const pas = Object.keys(D().e).filter(k => k !== f && !vacia(D().e[k])).sort().reverse().slice(0, 30);
    const checkin = `<section class="card"><h3>${MOM[mo][1]} ${MOM[mo][2]} <small>${resp(e, mo)}/${qs.length}</small></h3>
        <div class="chips">${Object.keys(MOM).map(k => `<button type="button" class="chip${k === mo ? " on" : ""}" data-a="mom" data-m="${k}">${MOM[k][1]} ${MOM[k][0]}${resp(e, k) ? " ✓" : ""}</button>`).join("")}</div>
        ${Object.keys(AREAS).map(a => { const l = qs.filter(q => q.id[2] === a); return l.length ? `<h4 style="margin:12px 0 4px">${AREAS[a][0]} ${AREAS[a][1]}</h4>` + l.map(q => `<label class="ayuda">${esc(q.t)}</label><textarea rows="2" data-q="${q.id}" maxlength="500" placeholder="Respuesta corta…">${esc((e.q || {})[q.id] || "")}</textarea>`).join("") : ""; }).join("")}</section>`;
    el.innerHTML = `<h2 class="fecha">${esc(largo(f))}</h2><section class="card"><div class="animo">${CARAS.map((c, i) => `<button class="${e.a === i + 1 ? "on" : ""}" data-a="a" data-n="${i + 1}" aria-label="Ánimo ${i + 1} de 5">${c}</button>`).join("")}</div></section>
      ${checkin}
      <section class="card"><p class="ayuda">${esc(preg(f))}</p><textarea id="dx" rows="8" placeholder="Escribí lo que quieras…">${esc(e.x)}</textarea>
      <input id="dg" placeholder="Una cosa buena de hoy" value="${esc(e.g)}" autocomplete="off"><small id="ok">Se guarda solo.</small></section>
      ${f !== ymd() ? `<a class="btn" href="#/diario">Volver a hoy</a>` : ""}
      ${pas.length ? `<section class="card"><h3>Días anteriores</h3>${pas.map(k => `<a class="item" href="#/diario/${k}"><b>${esc(SB.u.dmy(k))} ${D().e[k].a ? CARAS[D().e[k].a - 1] : ""}</b><small>${esc(resumen(D().e[k]).slice(0, 80))}</small></a>`).join("")}</section>` : ""}`;
    let t; const campos = () => [...el.querySelectorAll("[data-q]")];
    const guardarYa = () => { const n = ent(f); n.x = document.getElementById("dx").value; n.g = document.getElementById("dg").value;
      campos().forEach(i => { const v = i.value.trim().slice(0, 500); n.q = n.q || {}; if (v) n.q[i.dataset.q] = v; else delete n.q[i.dataset.q]; }); if (n.q && !Object.keys(n.q).length) delete n.q;
      if (vacia(n)) delete D().e[f]; SB.guardar("diario"); const o = document.getElementById("ok"); if (o) o.textContent = "Guardado ✓"; };
    const guardar = () => { clearTimeout(t); t = setTimeout(guardarYa, 500); };
    document.getElementById("dx").oninput = document.getElementById("dg").oninput = guardar; campos().forEach(i => { i.oninput = guardar; });
    eventos(el, {a: (a, b) => {
      if (a === "mom") { clearTimeout(t); guardarYa(); elegido = b.dataset.m; return SB.pintar(); }   // guarda lo escrito antes de cambiar de momento
      const n = ent(f); n.a = n.a === +b.dataset.n ? 0 : +b.dataset.n; if (vacia(n)) delete D().e[f]; SB.guardar("diario"); el.querySelectorAll(".animo button").forEach(x => x.classList.toggle("on", +x.dataset.n === n.a)); }});
  }
});
})();
