/* Módulo Programación. Datos (esquema 1):
   p proyectos  {id, n nombre, e "idea"|"curso"|"pausa"|"fin", tec tecnologías (texto), url enlace, c creado, m último movimiento (ms)}
   b bitácora   {id, p id de proyecto, f fecha AAAA-MM-DD, x texto, c creada}
   a temas      {id, n nombre, e "estudiando"|"pausa", c creado}
   r recursos   {id, a id de tema, n nombre, h cuándo se tildó (ms, 0 si no)}
   Cada proyecto tiene una etiqueta propia (#nombre-del-proyecto): con ella se enlazan sus tareas (Tareas) y sus notas (Notas). */
(function () {
const {esc, norm, ymd, uid, dias, dmy, eventos} = SB.u, D = () => SB.datos("programacion");
const EST = {idea: "💡 Idea", curso: "🚧 En curso", pausa: "⏸️ Pausado", fin: "✅ Terminado"}, ORD = ["curso", "idea", "pausa", "fin"];
const slug = s => norm(s).replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "") || "proyecto";
const proy = id => D().p.find(x => x.id === id), tema = id => D().a.find(x => x.id === id);
const guardar = () => SB.guardar("programacion");
const mover = p => { p.m = Date.now(); };
const ultimo = p => Math.max(p.m || 0, p.c || 0, ...D().b.filter(x => x.p === p.id).map(x => x.c || 0));
const hace = ms => Math.floor((Date.now() - ms) / 864e5);
const recs = a => D().r.filter(x => x.a === a.id), sig = a => recs(a).find(x => !x.h);
const url = u => /^https?:\/\//i.test(u) ? u : "";
const nuevo = (n, e) => { const p = {id: uid(), n, e: e || "idea", tec: "", url: "", c: Date.now(), m: Date.now()}; D().p.unshift(p); guardar(); return p; };
const tareas = p => SB.mods.tareas && SB.mods.tareas.porProyecto ? SB.mods.tareas.porProyecto(slug(p.n)) : [];
const notas = p => SB.mods.notas && SB.mods.notas.porEtiqueta ? SB.mods.notas.porEtiqueta(slug(p.n)) : [];
let tab = "proyectos";

SB.registrar({
  id: "programacion", nombre: "Programación", icono: "💻", esquema: 1,
  inicial: () => ({p: [], b: [], a: [], r: []}), migraciones: {},
  sync: [{k: "p", orden: "desc", t: x => x.m || x.c || 0}, {k: "b", orden: "desc", t: x => x.c || 0}, {k: "a", orden: "asc", t: x => x.c || 0}, {k: "r", orden: "asc", t: x => x.h || 0}],
  captura: {etiqueta: "Proyecto", guardar: t => { nuevo(t.replace(/\s+/g, " ").trim().slice(0, 80) || t, "idea"); }},
  hoy() {
    const out = [];
    D().p.filter(p => p.e === "curso" && hace(ultimo(p)) >= 7).forEach(p => out.push({t: p.n, s: "En curso, sin movimiento hace " + hace(ultimo(p)) + " días", hecho: false, ir: "#/programacion/" + p.id}));
    D().a.filter(a => a.e === "estudiando" && sig(a)).forEach(a => { const r = sig(a); out.push({t: a.n + ": " + r.n, s: "Siguiente paso de lo que estás aprendiendo", hecho: false, tocar: () => { r.h = Date.now(); guardar(); }}); });
    return out;
  },
  buscar: q => { const n = norm(q);
    return D().p.filter(p => norm(p.n + " " + p.tec).includes(n)).map(p => ({t: p.n, s: EST[p.e].replace(/^\S+\s/, "") + (p.tec ? " · " + p.tec : ""), ir: "#/programacion/" + p.id}))
      .concat(D().a.filter(a => norm(a.n).includes(n)).map(a => ({t: a.n, s: "tema · " + recs(a).filter(r => r.h).length + "/" + recs(a).length + " recursos", ir: "#/programacion"})))
      .concat(D().b.filter(b => norm(b.x).includes(n)).slice(0, 5).map(b => ({t: b.x.slice(0, 60), s: "bitácora · " + ((proy(b.p) || {}).n || "") + " · " + dmy(b.f), ir: "#/programacion/" + b.p}))); },
  avisos: () => [],
  semana() {
    const s = Date.now() - 7 * 864e5, curso = D().p.filter(p => p.e === "curso").length, av = D().b.filter(b => b.c > s).length, rc = D().r.filter(r => r.h > s).length;
    return [curso + (curso === 1 ? " proyecto en curso." : " proyectos en curso."), av + (av === 1 ? " avance anotado" : " avances anotados") + " en la bitácora esta semana.", rc + (rc === 1 ? " recurso tildado" : " recursos tildados") + " de lo que estás aprendiendo."];
  },
  pantalla(el, sub) {
    const p = sub && proy(sub); if (p) return detalle(el, p);
    el.innerHTML = `<div class="chips"><button class="chip${tab === "proyectos" ? " on" : ""}" data-a="tab" data-t="proyectos">💻 Proyectos</button><button class="chip${tab === "aprender" ? " on" : ""}" data-a="tab" data-t="aprender">📚 Aprendiendo</button></div>${tab === "proyectos" ? vistaProyectos() : vistaTemas()}`;
    eventos(el, {
      f: (a, f) => {
        if (a === "proy") { const n = f.n.value.trim(); if (!n) return; const p = nuevo(n, f.e.value in EST ? f.e.value : "idea"); p.tec = f.tec.value.trim(); guardar(); location.hash = "#/programacion/" + p.id; return; }
        if (a === "tema") { const n = f.n.value.trim(); if (!n) return; D().a.push({id: uid(), n, e: "estudiando", c: Date.now()}); guardar(); }
        if (a === "rec") { const t = tema(f.dataset.id), n = f.n.value.trim(); if (!t || !n) return; D().r.push({id: uid(), a: t.id, n, h: 0}); guardar(); }
        SB.pintar();
      },
      a: (a, b) => {
        if (a === "tab") tab = b.dataset.t;
        else if (a === "rok") { const r = D().r.find(x => x.id === b.dataset.id); if (r) { r.h = r.h ? 0 : Date.now(); guardar(); } }
        else if (a === "rdel") { D().r = D().r.filter(x => x.id !== b.dataset.id); guardar(); }
        else if (a === "tpausa") { const t = tema(b.dataset.id); if (t) { t.e = t.e === "estudiando" ? "pausa" : "estudiando"; guardar(); } }
        else if (a === "tdel") { const t = tema(b.dataset.id); if (t && confirm("¿Borrar «" + t.n + "» y sus recursos?")) { D().a = D().a.filter(x => x !== t); D().r = D().r.filter(x => x.a !== t.id); guardar(); } }
        SB.pintar();
      }
    });
  }
});

function vistaProyectos() {
  const ps = D().p.slice().sort((a, b) => ORD.indexOf(a.e) - ORD.indexOf(b.e));
  return `<form data-f="proy"><input name="n" placeholder="Nuevo proyecto" required autocomplete="off"><div class="fila-b"><select name="e" aria-label="Estado">${ORD.map(e => `<option value="${e}"${e === "idea" ? " selected" : ""}>${EST[e]}</option>`).join("")}</select><input name="tec" placeholder="Tecnologías (ej: JS, Arduino)" autocomplete="off"></div><button class="pri">Agregar proyecto</button></form>
    ${ps.length ? ps.map(p => `<a class="card item" href="#/programacion/${esc(p.id)}"><b>${esc(p.n)}</b><small>${EST[p.e]}${p.tec ? " · " + esc(p.tec) : ""}${p.e === "curso" ? " · último movimiento hace " + hace(ultimo(p)) + " d" : ""}</small></a>`).join("") : `<p class="vacio">Todavía no hay proyectos. Lo que captures como «Proyecto» entra como idea.</p>`}`;
}

function vistaTemas() {
  return `<form data-f="tema"><input name="n" placeholder="Algo que estás aprendiendo (ej: React)" required autocomplete="off"><button class="pri">Agregar tema</button></form>
    ${D().a.length ? D().a.map(a => { const rs = recs(a), ok = rs.filter(r => r.h).length;
      return `<section class="card"><div class="fila"><div class="tx"><span><b>${esc(a.n)}</b></span><small>${a.e === "estudiando" ? "Estudiando" : "En pausa"} · ${ok}/${rs.length} recursos</small></div><button data-a="tpausa" data-id="${esc(a.id)}">${a.e === "estudiando" ? "⏸️" : "▶"}</button><button class="x" data-a="tdel" data-id="${esc(a.id)}" aria-label="Borrar tema">✕</button></div>
        ${rs.length ? `<progress max="${rs.length}" value="${ok}"></progress>` : ""}
        ${rs.map(r => `<div class="fila"><button class="chk${r.h ? " on" : ""}" data-a="rok" data-id="${esc(r.id)}" aria-label="${r.h ? "Destildar" : "Tildar"}">${r.h ? "✓" : ""}</button><div class="tx${r.h ? " hecha" : ""}"><span>${esc(r.n)}</span></div><button class="x" data-a="rdel" data-id="${esc(r.id)}" aria-label="Borrar recurso">✕</button></div>`).join("")}
        <form data-f="rec" data-id="${esc(a.id)}"><div class="fila-b"><input name="n" placeholder="Agregar recurso (curso, video, libro…)" autocomplete="off" required><button>＋</button></div></form></section>`; }).join("") : `<p class="vacio">Cargá un tema y sus recursos: el siguiente paso sale en Hoy.</p>`}`;
}

function detalle(el, p) {
  const bit = D().b.filter(x => x.p === p.id).sort((a, b) => b.c - a.c).slice(0, 15), ts = tareas(p), ns = notas(p), tag = slug(p.n), N = SB.mods.notas, T = SB.mods.tareas;
  el.innerHTML = `<div class="fila-b barra"><a class="btn" href="#/programacion">← Proyectos</a><button type="button" class="x" data-a="del">Borrar</button></div>
    <section class="card"><h2 class="fecha" style="margin:0 0 8px">${esc(p.n)}</h2><small>Etiqueta: #${esc(tag)}</small>
      <form data-f="datos"><select name="e" aria-label="Estado">${ORD.map(e => `<option value="${e}"${e === p.e ? " selected" : ""}>${EST[e]}</option>`).join("")}</select><input name="tec" placeholder="Tecnologías" value="${esc(p.tec)}" autocomplete="off"><input name="url" type="url" placeholder="Enlace (https://…)" value="${esc(p.url)}" autocomplete="off"><button class="pri">Guardar</button></form>
      ${url(p.url) ? `<a href="${esc(url(p.url))}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>` : ""}</section>
    <section class="card"><h3>📓 Bitácora de avances</h3><form data-f="bit"><div class="fila-b"><input name="x" placeholder="¿Qué avanzaste hoy?" autocomplete="off" required><button>＋</button></div></form>
      ${bit.length ? bit.map(b => `<div class="fila"><div class="tx"><span>${esc(b.x)}</span><small>${esc(dmy(b.f))}</small></div><button class="x" data-a="bdel" data-id="${esc(b.id)}" aria-label="Borrar">✕</button></div>`).join("") : `<p class="ayuda">Sin avances anotados.</p>`}</section>
    ${T ? `<section class="card"><h3>✅ Tareas <small>#${esc(tag)}</small></h3><form data-f="tarea"><div class="fila-b"><input name="t" placeholder="Nueva tarea del proyecto" autocomplete="off" required><input type="date" name="f" aria-label="Fecha límite"><button>＋</button></div></form>
      ${ts.length ? ts.map(t => `<div class="fila"><button class="chk${t.h ? " on" : ""}" data-a="tok" data-id="${esc(t.id)}" aria-label="${t.h ? "Deshacer" : "Hecha"}">${t.h ? "✓" : ""}</button><div class="tx${t.h ? " hecha" : ""}"><span>${esc(t.t)}</span>${t.f ? `<small>vence ${esc(dmy(t.f))}</small>` : ""}</div></div>`).join("") : `<p class="ayuda">Sin tareas.</p>`}</section>` : ""}
    ${N ? `<section class="card"><h3>📝 Notas <small>#${esc(tag)}</small></h3>${ns.map(n => `<a class="item" href="#/notas/${esc(n.id)}">${esc(N.titulo(n.x))}</a>`).join("") || `<p class="ayuda">Sin notas.</p>`}<div class="fila-b"><button data-a="nota">📝 Nueva nota del proyecto</button></div></section>` : ""}`;
  eventos(el, {
    f: (a, f) => {
      if (a === "datos") { p.e = f.e.value in EST ? f.e.value : p.e; p.tec = f.tec.value.trim(); p.url = f.url.value.trim(); mover(p); guardar(); SB.aviso("Guardado"); }
      else if (a === "bit") { const x = f.x.value.trim(); if (!x) return; D().b.unshift({id: uid(), p: p.id, f: ymd(), x, c: Date.now()}); mover(p); guardar(); }
      else if (a === "tarea") { const t = f.t.value.trim(); if (!t) return; T.crear(t, f.f.value, tag); mover(p); guardar(); }
      SB.pintar();
    },
    a: (a, b) => {
      if (a === "del") { if (confirm("¿Borrar «" + p.n + "» y su bitácora? Las tareas y notas con su etiqueta quedan donde están.")) { D().p = D().p.filter(x => x !== p); D().b = D().b.filter(x => x.p !== p.id); guardar(); location.hash = "#/programacion"; } return; }
      if (a === "nota") { const n = N.crear(p.n + "\n#" + tag + "\n\n"); mover(p); guardar(); location.hash = "#/notas/" + n.id + "/e"; return; }
      if (a === "bdel") { D().b = D().b.filter(x => x.id !== b.dataset.id); guardar(); }
      else if (a === "tok") { T.alternar(b.dataset.id); mover(p); guardar(); }
      SB.pintar();
    }
  });
}
})();
