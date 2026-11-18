/* Módulo Finanzas (resumen simple del día a día; el detalle del sueldo está en Mi Recibo). Datos (esquema 2):
   g movimientos   {id, t "g" gasto | "i" ingreso, a monto en CENTAVOS (entero), c categoría, n nota, f fecha AAAA-MM-DD, p id del pago fijo que lo originó (opcional), m modificado (ms)}
   f pagos fijos   {id, n nombre, d día de vencimiento (1-31), a monto en centavos (0 si es variable), v 1 si el monto es variable, pag {"AAAA-MM": 1} meses pagados, m modificado (ms)}
   b presupuestos  {categoría: tope mensual en centavos}, igual para todos los meses.
   Los montos NUNCA se guardan con decimales flotantes: se pasan de texto a centavos enteros con montoACentavos. */
(function () {
const {esc, norm, ymd, uid, dias, eventos} = SB.u;
const D = () => { const d = SB.datos("finanzas"); if (!Array.isArray(d.g)) d.g = []; if (!Array.isArray(d.f)) d.f = []; if (!d.b || typeof d.b !== "object" || Array.isArray(d.b)) d.b = {}; return d; };
const CATS = ["Comida", "Transporte", "Vivienda", "Servicios", "Salud", "Ocio", "Estudio", "Ropa", "Otros"], CATS_I = ["Sueldo", "Otros ingresos"];
const PALABRAS = {Comida: "super supermercado verduleria carniceria almacen kiosco comida cena almuerzo desayuno resto restaurante delivery pizza cafe panaderia", Transporte: "nafta combustible colectivo sube uber taxi peaje estacionamiento tren subte cochera", Vivienda: "alquiler expensas hipoteca", Servicios: "luz gas agua internet wifi celular telefono cable", Salud: "farmacia medico dentista obra remedio", Ocio: "cine salida bar boliche juego netflix spotify", Estudio: "libro curso apunte fotocopia", Ropa: "ropa zapatillas remera", "Sueldo": "sueldo salario honorarios cobro"};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const guardar = () => SB.guardar("finanzas");
let mes = ymd().slice(0, 7), tab = "mes";

/* ---------- montos ---------- */
/* «12.000,50» → 1200050 · «3500» → 350000 · «3.500» → 350000 · «1,5» → 150. Solo enteros; nada de decimales flotantes. Devuelve 0 si no hay número. */
function montoACentavos(txt) {
  const m = /\d[\d.,]*/.exec(String(txt == null ? "" : txt)); if (!m) return 0;
  let s = m[0].replace(/[.,]+$/, ""), ent, fr = "";
  if (s.includes(",")) { const i = s.lastIndexOf(","); ent = s.slice(0, i).replace(/\./g, ""); fr = s.slice(i + 1).replace(/\./g, ""); }
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) ent = s.replace(/\./g, "");
  else if (s.includes(".")) { const i = s.lastIndexOf("."); ent = s.slice(0, i).replace(/\./g, ""); fr = s.slice(i + 1); }
  else ent = s;
  const c = (parseInt(ent || "0", 10) || 0) * 100 + (parseInt((fr + "00").slice(0, 2), 10) || 0);
  return Number.isSafeInteger(c) ? c : 0;
}
const plata = c => { c = Math.round(c || 0); const neg = c < 0; c = Math.abs(c); const e = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "."), r = c % 100; return (neg ? "-$ " : "$ ") + e + (r ? "," + String(r).padStart(2, "0") : ""); };
const aTexto = c => { const r = c % 100; return Math.floor(c / 100) + (r ? "," + String(r).padStart(2, "0") : ""); };   // para precargar un campo al editar

/* ---------- fechas del mes ---------- */
const finMes = ym => { const [a, m] = ym.split("-").map(Number); return new Date(a, m, 0).getDate(); };
const venc = (ym, d) => ym + "-" + String(Math.min(Math.max(+d || 1, 1), finMes(ym))).padStart(2, "0");   // un fijo del 31 vence el 28/29/30 en los meses cortos
const sigMes = (ym, n) => { const [a, m] = ym.split("-").map(Number), d = new Date(a, m - 1 + n, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const nomMes = ym => { const [a, m] = ym.split("-").map(Number); return MESES[m - 1] + " " + a; };
const dmy = f => f.slice(8) + "/" + f.slice(5, 7);

/* ---------- cuentas ---------- */
const delMes = ym => D().g.filter(x => String(x.f).slice(0, 7) === ym);
const suma = a => a.reduce((s, x) => s + (x.a || 0), 0);
const gastosMes = (ym, cat) => suma(delMes(ym).filter(x => x.t === "g" && (!cat || x.c === cat)));
const resumen = ym => { const mv = delMes(ym), g = suma(mv.filter(x => x.t === "g")), i = suma(mv.filter(x => x.t === "i")), por = {};
  mv.filter(x => x.t === "g").forEach(x => { por[x.c || "Otros"] = (por[x.c || "Otros"] || 0) + (x.a || 0); });
  const top = Object.keys(por).sort((a, b) => por[b] - por[a])[0]; return {g, i, bal: i - g, por, top}; };
const pct = (ym, cat) => { const t = D().b[cat]; return t > 0 ? Math.floor(100 * gastosMes(ym, cat) / t) : 0; };

/* Categoría de un texto: se busca cada palabra en la lista de palabras conocidas (sin mayúsculas ni tildes). */
const adivinar = (txt, ingreso) => { const ws = norm(txt).split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of ws) for (const c of Object.keys(PALABRAS)) if (PALABRAS[c].split(" ").includes(w) && (c === "Sueldo") === !!ingreso) return c;
  return ingreso ? "Otros ingresos" : "Otros"; };

/* Captura: «gasto 3500 super», «nafta 12.000,50», «ingreso 800000 sueldo». El primer número es el monto. */
function interpretar(txt) {
  const t = String(txt).trim(), ingreso = /^(ingreso|cobr[eé])(?=\s|$)/i.test(t), a = montoACentavos(t); if (!(a > 0)) return null;
  const nota = t.replace(/^(gasto|gast[eé]|ingreso|cobr[eé])(?=\s|$)\s*/i, "").replace(/\d[\d.,]*/, " ").replace(/\s+/g, " ").trim();
  return {t: ingreso ? "i" : "g", a, nota, c: adivinar(nota, ingreso)};
}
const agregar = (o, f) => { const x = {id: uid(), t: o.t, a: o.a, c: o.c || (o.t === "i" ? "Otros ingresos" : "Otros"), n: o.n || o.nota || "", f: f || o.f || ymd(), m: Date.now()}; if (o.p) x.p = o.p; D().g.unshift(x); guardar(); return x; };

/* Avisos de presupuesto: cruzar el 80 % y el 100 % con un gasto nuevo. Devuelve el texto o "". */
function avisoPresupuesto(x, antes) {
  if (x.t !== "g" || !(D().b[x.c] > 0)) return "";
  const ym = String(x.f).slice(0, 7), tope = D().b[x.c], a = Math.floor(100 * antes / tope), d = pct(ym, x.c);
  if (a < 100 && d >= 100) return "Te pasaste del presupuesto de " + x.c + " (" + plata(gastosMes(ym, x.c)) + " de " + plata(tope) + ")";
  if (a < 80 && d >= 80 && d < 100) return "Vas en " + d + " % del presupuesto de " + x.c;
  return "";
}
function cargar(o, f) {   // agrega y devuelve el aviso de presupuesto, si corresponde
  const antes = gastosMes(String(f || o.f || ymd()).slice(0, 7), o.c); const x = agregar(o, f); return avisoPresupuesto(x, antes);
}

/* ---------- pagos fijos ---------- */
const fijoMes = (p, ym) => !!(p.pag && p.pag[ym]);
const pagar = (p, ym, monto) => {   // marca pagado; con monto, además lo carga como gasto para que el mes cierre
  p.pag = p.pag || {}; p.pag[ym] = 1; p.m = Date.now();
  if (monto > 0) agregar({t: "g", a: monto, c: adivinar(p.n, false) === "Otros" ? "Servicios" : adivinar(p.n, false), n: p.n, p: p.id}, ym === ymd().slice(0, 7) ? ymd() : venc(ym, p.d));
  guardar();
};
const despagar = (p, ym) => { if (p.pag) delete p.pag[ym]; D().g = D().g.filter(x => !(x.p === p.id && String(x.f).slice(0, 7) === ym)); p.m = Date.now(); guardar(); };
const pagarPreguntando = (p, ym) => {
  if (!p.v && p.a > 0) return pagar(p, ym, p.a);
  const r = prompt("¿Cuánto pagaste de «" + p.n + "»? (vacío = marcar pagado sin monto)"); if (r === null) return false;
  pagar(p, ym, montoACentavos(r));
};

SB.registrar({
  id: "finanzas", nombre: "Finanzas", icono: "💰", esquema: 2,
  inicial: () => ({g: [], f: [], b: {}}),
  migraciones: {2: d => Object.assign({}, d, {g: d.g || [], f: d.f || [], b: d.b || {}})},   // 1 → 2: se suman los presupuestos
  sync: [{k: "g", orden: "desc", t: x => x.m || 0}, {k: "f", orden: "asc", t: x => x.m || 0}, {k: "b"}],
  captura: {etiqueta: "Gasto", guardar: txt => {
    const o = interpretar(txt); if (!o) throw new Error("No encontré el monto. Probá con «gasto 3500 super».");
    const av = cargar(o); if (av) setTimeout(() => SB.aviso(av), 1900);   // con la demora justa para no pisar el «Guardado en Gasto»
  }},
  interpretar, montoACentavos,
  hoy() {
    const h = ymd(), ym = h.slice(0, 7), out = [];
    D().f.filter(p => !fijoMes(p, ym)).map(p => ({p, f: venc(ym, p.d)})).filter(x => dias(x.f, h) <= 3).sort((a, b) => a.f < b.f ? -1 : 1).forEach(({p, f}) => {
      const d = dias(f, h); out.push({t: p.n, s: (d < 0 ? "Atrasado: venció el " + dmy(f) : d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : "Vence en " + d + " días") + (p.v || !p.a ? " · monto variable" : " · " + plata(p.a)), hecho: false, tocar: () => pagarPreguntando(p, ym)});
    });
    Object.keys(D().b).filter(c => pct(ym, c) >= 80).sort((a, b) => pct(ym, b) - pct(ym, a)).slice(0, 2).forEach(c => out.push({t: "Presupuesto de " + c + ": " + pct(ym, c) + " %", s: plata(gastosMes(ym, c)) + " de " + plata(D().b[c]), hecho: false, ir: "#/finanzas"}));
    return out;
  },
  buscar: q => { const n = norm(q), v = montoACentavos(q);
    return D().g.filter(x => norm((x.n || "") + " " + (x.c || "")).includes(n) || (v > 0 && /^\d/.test(q.trim()) && x.a === v)).slice(0, 15).map(x => ({t: (x.t === "i" ? "Ingreso " : "Gasto ") + plata(x.a), s: [x.c, x.n, dmy(String(x.f))].filter(Boolean).join(" · "), ir: "#/finanzas"}))
      .concat(D().f.filter(p => norm(p.n).includes(n)).map(p => ({t: p.n, s: "pago fijo · día " + p.d, ir: "#/finanzas"}))); },
  avisos() {   // próximo vencimiento de cada pago fijo: 3 y 1 día antes y el mismo día
    const h = ymd(), ym = h.slice(0, 7), out = [];
    D().f.forEach(p => { let f = venc(ym, p.d); if (fijoMes(p, ym) || f < h) f = venc(sigMes(ym, 1), p.d); out.push({f, t: "Pago: " + p.n, c: p.v || !p.a ? "Monto variable" : plata(p.a), k: p.id, av: [3, 1], hoy: true}); });
    return out;
  },
  semana() {
    const d = SB.u.sumar(ymd(), -6), mv = D().g.filter(x => x.f >= d), g = suma(mv.filter(x => x.t === "g")), i = suma(mv.filter(x => x.t === "i")), ym = ymd().slice(0, 7);
    const pend = D().f.filter(p => !fijoMes(p, ym)).length;
    return ["Últimos 7 días: gastaste " + plata(g) + (i ? " y te entraron " + plata(i) : "") + ".", pend ? pend + (pend === 1 ? " pago fijo" : " pagos fijos") + " sin pagar este mes." : "Pagos fijos del mes al día."];
  },
  pantalla(el) { pintar(el); }
});

function pintar(el) {
  const R = resumen(mes), actual = mes === ymd().slice(0, 7), h = ymd();
  const cats = Object.keys(R.por).sort((a, b) => R.por[b] - R.por[a]);
  const fila = x => `<div class="fila"><div class="tx"><span>${esc(x.n || x.c)}</span><small>${esc(dmy(String(x.f)))} · ${esc(x.c || "")}</small></div><b style="color:${x.t === "i" ? "var(--ok)" : "inherit"}">${x.t === "i" ? "+" : "−"}${esc(plata(x.a))}</b><button data-a="edit" data-id="${esc(x.id)}" aria-label="Editar">✏️</button><button class="x" data-a="del" data-id="${esc(x.id)}" aria-label="Borrar">✕</button></div>`;
  const mv = delMes(mes).sort((a, b) => a.f < b.f ? 1 : a.f > b.f ? -1 : b.m - a.m);
  const nav = `<div class="fila-b barra"><button data-a="mes" data-n="-1" aria-label="Mes anterior">◀</button><b style="flex:1;text-align:center">${esc(nomMes(mes))}</b><button data-a="mes" data-n="1" aria-label="Mes siguiente">▶</button></div>`;
  const tabs = `<div class="chips">${[["mes", "📊 Mes"], ["fijos", "📌 Pagos fijos"], ["pres", "🎯 Presupuesto"]].map(([k, n]) => `<button class="chip${tab === k ? " on" : ""}" data-a="tab" data-t="${k}">${n}</button>`).join("")}</div>`;
  const catsOpt = `<datalist id="cats">${[...new Set([...CATS, ...CATS_I, ...D().g.map(x => x.c).filter(Boolean)])].map(c => `<option value="${esc(c)}">`).join("")}</datalist>`;
  let cuerpo = "";
  if (tab === "mes") cuerpo = `<form data-f="mov"><div class="fila-b"><select name="t" aria-label="Tipo"><option value="g">Gasto</option><option value="i">Ingreso</option></select><input name="a" inputmode="decimal" placeholder="Monto (ej: 12.000,50)" required autocomplete="off"></div><div class="fila-b"><input name="c" list="cats" placeholder="Categoría (se adivina)" autocomplete="off"><input type="date" name="f" value="${actual ? h : mes + "-01"}" aria-label="Fecha"></div><input name="n" placeholder="Nota (ej: super)" autocomplete="off"><button class="pri">Agregar</button></form>${catsOpt}
    <section class="card"><h3>Resumen</h3><p>Gastos <b>${esc(plata(R.g))}</b> · Ingresos <b>${esc(plata(R.i))}</b></p><p>Balance <b style="color:${R.bal < 0 ? "var(--bad)" : "var(--ok)"}">${esc(plata(R.bal))}</b></p>${R.top ? `<small>Lo que más pesa: ${esc(R.top)} (${esc(plata(R.por[R.top]))}, ${Math.round(100 * R.por[R.top] / R.g)} %)</small>` : ""}
      ${cats.map(c => { const t = D().b[c], p = t > 0 ? pct(mes, c) : 0; return `<div class="fila"><span class="tx">${esc(c)}${t > 0 ? `<small>${p} % del tope de ${esc(plata(t))}</small>` : ""}</span><b>${esc(plata(R.por[c]))}</b></div>`; }).join("")}</section>
    <h3>Movimientos</h3>${mv.length ? `<section class="card">${mv.map(fila).join("")}</section>` : `<p class="vacio">Sin movimientos este mes.</p>`}`;
  else if (tab === "fijos") cuerpo = `<form data-f="fijo"><input name="n" placeholder="Pago fijo (ej: Alquiler, Internet)" required autocomplete="off"><div class="fila-b"><input name="d" type="number" min="1" max="31" placeholder="Día de vencimiento" required><input name="a" inputmode="decimal" placeholder="Monto (vacío = variable)" autocomplete="off"></div><button class="pri">Agregar pago fijo</button></form>
    ${D().f.length ? `<section class="card"><h3>${esc(nomMes(mes))}</h3>${D().f.slice().sort((a, b) => a.d - b.d).map(p => { const pg = fijoMes(p, mes), f = venc(mes, p.d), d = dias(f, h), atras = !pg && d < 0;
      return `<div class="fila"><button class="chk${pg ? " on" : ""}" data-a="fok" data-id="${esc(p.id)}" aria-label="${pg ? "Marcar sin pagar" : "Marcar pagado"}">${pg ? "✓" : ""}</button><div class="tx${pg ? " hecha" : ""}"><span>${esc(p.n)}</span><small>vence ${esc(dmy(f))} · ${p.v || !p.a ? "monto variable" : esc(plata(p.a))}${atras ? " · atrasado" : ""}</small></div><button class="x" data-a="fdel" data-id="${esc(p.id)}" aria-label="Borrar">✕</button></div>`; }).join("")}</section>` : `<p class="vacio">Cargá alquiler, internet… y te aviso 3 y 1 día antes.</p>`}`;
  else cuerpo = `<section class="card"><h3>Tope mensual por categoría</h3><p class="ayuda">Igual para todos los meses. Te aviso al llegar al 80 % y al pasarte.</p>
    ${Object.keys(D().b).sort().map(c => `<div class="fila"><div class="tx"><span>${esc(c)}</span><small>${esc(plata(D().b[c]))} · este mes ${pct(mes, c)} %</small>${D().b[c] > 0 ? `<progress max="100" value="${Math.min(100, pct(mes, c))}"></progress>` : ""}</div><button class="x" data-a="bdel" data-c="${esc(c)}" aria-label="Quitar tope">✕</button></div>`).join("") || `<p class="ayuda">Sin topes cargados.</p>`}
    <form data-f="tope"><div class="fila-b"><input name="c" list="cats" placeholder="Categoría" required autocomplete="off"><input name="a" inputmode="decimal" placeholder="Tope (ej: 150.000)" required autocomplete="off"></div><button class="pri">Guardar tope</button></form>${catsOpt}</section>`;
  el.innerHTML = nav + tabs + cuerpo;
  eventos(el, {
    f: (a, f) => {
      if (a === "mov") { const m = montoACentavos(f.a.value); if (!(m > 0)) return SB.aviso("Poné un monto"); const t = f.t.value === "i" ? "i" : "g", c = f.c.value.trim() || adivinar(f.n.value, t === "i"), av = cargar({t, a: m, c, n: f.n.value.trim()}, f.f.value || h); if (av) SB.aviso(av); }
      else if (a === "fijo") { const d = Math.round(+f.d.value), m = montoACentavos(f.a.value), n = f.n.value.trim(); if (!n || !(d >= 1 && d <= 31)) return; D().f.push({id: uid(), n, d, a: m, v: m > 0 ? 0 : 1, pag: {}, m: Date.now()}); guardar(); }
      else if (a === "tope") { const m = montoACentavos(f.a.value), c = f.c.value.trim(); if (!c || !(m > 0)) return SB.aviso("Poné categoría y tope"); D().b[c] = m; guardar(); }
      SB.pintar();
    },
    a: (a, b) => {
      if (a === "mes") mes = sigMes(mes, +b.dataset.n);
      else if (a === "tab") tab = b.dataset.t;
      else if (a === "del") { const x = D().g.find(y => y.id === b.dataset.id); if (x && confirm("¿Borrar este movimiento?")) { if (x.p) { const p = D().f.find(q => q.id === x.p); if (p && p.pag) delete p.pag[String(x.f).slice(0, 7)]; } D().g = D().g.filter(y => y !== x); guardar(); } }
      else if (a === "edit") { editar(el, D().g.find(y => y.id === b.dataset.id)); return; }
      else if (a === "fok") { const p = D().f.find(q => q.id === b.dataset.id); if (!p) return; if (fijoMes(p, mes)) despagar(p, mes); else if (pagarPreguntando(p, mes) === false) return; }
      else if (a === "fdel") { const p = D().f.find(q => q.id === b.dataset.id); if (p && confirm("¿Borrar «" + p.n + "»? Los gastos ya cargados se quedan.")) { D().f = D().f.filter(q => q !== p); guardar(); } }
      else if (a === "bdel") { delete D().b[b.dataset.c]; guardar(); }
      SB.pintar();
    }
  });
}
function editar(el, x) {   // formulario de edición: monto, categoría, nota, fecha y tipo
  if (!x) return;
  el.innerHTML = `<div class="fila-b barra"><button data-a="volver">← Volver</button></div><section class="card"><h3>Editar movimiento</h3><form data-f="edit" data-id="${esc(x.id)}"><select name="t" aria-label="Tipo"><option value="g"${x.t === "g" ? " selected" : ""}>Gasto</option><option value="i"${x.t === "i" ? " selected" : ""}>Ingreso</option></select><input name="a" inputmode="decimal" value="${esc(aTexto(x.a || 0))}" aria-label="Monto" required autocomplete="off"><input name="c" list="cats2" value="${esc(x.c || "")}" placeholder="Categoría" autocomplete="off"><datalist id="cats2">${[...CATS, ...CATS_I].map(c => `<option value="${esc(c)}">`).join("")}</datalist><input name="n" value="${esc(x.n || "")}" placeholder="Nota" autocomplete="off"><input type="date" name="f" value="${esc(String(x.f))}" aria-label="Fecha"${x.p ? ` min="${esc(String(x.f).slice(0, 7))}-01" max="${esc(venc(String(x.f).slice(0, 7), 31))}"` : ""}>${x.p ? `<small>Es el gasto de un pago fijo: no puede cambiar de mes.</small>` : ""}<button class="pri">Guardar cambios</button></form></section>`;
  eventos(el, {f: (a, f) => { const y = D().g.find(q => q.id === f.dataset.id); if (!y) return; const m = montoACentavos(f.a.value); if (!(m > 0)) return SB.aviso("Poné un monto"); const nf = f.f.value || y.f;
      if (y.p && nf.slice(0, 7) !== String(y.f).slice(0, 7)) return SB.aviso("El gasto de un pago fijo no puede cambiar de mes");
      y.t = f.t.value === "i" ? "i" : "g"; y.a = m; y.c = f.c.value.trim() || y.c; y.n = f.n.value.trim(); y.f = nf; y.m = Date.now(); guardar(); SB.pintar(); },
    a: () => SB.pintar()});
}
})();
