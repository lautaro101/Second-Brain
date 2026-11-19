const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs");
const {abrir, leer} = require("./helpers");

test("apariencia: tema y letra se guardan en este dispositivo y se leen de vuelta", () => {
  const {SB, ls} = abrir();
  assert.deepEqual(JSON.parse(JSON.stringify(SB.ui.leer())), {tema: "auto", letra: 0});
  SB.ui.poner({tema: "oscuro"}); SB.ui.poner({letra: 2});
  assert.deepEqual(JSON.parse(JSON.stringify(SB.ui.leer())), {tema: "oscuro", letra: 2});
  assert.ok(ls.getItem("sb_ui"));
});
test("apariencia: valores raros se ignoran y no entra en lo que se sincroniza ni en las copias", () => {
  const {SB} = abrir({datos: {sb_ui: JSON.stringify({tema: "rosa", letra: 9})}});
  assert.deepEqual(JSON.parse(JSON.stringify(SB.ui.leer())), {tema: "auto", letra: 0});
  SB.ui.poner({tema: "claro"});
  assert.ok(!Object.keys(SB.almacen.usuario()).includes("sb_ui"));
});
test("la hoja de estilos y las fuentes existen y el service worker las guarda", () => {
  assert.ok(fs.existsSync(__dirname + "/../fuentes.css"));
  assert.match(leer("sw.js"), /fuentes\.css/);
  assert.match(leer("index.html"), /href="fuentes\.css"/);
  assert.match(leer("index.html"), /data-tema/);
});
