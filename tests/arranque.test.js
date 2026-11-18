const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), {leer, RAIZ} = require("./helpers"), path = require("path");

test("cada archivo de modulos/lista.js existe y el service worker lo guarda para usar sin conexión", () => {
  const vm = require("vm"), c = {self: {}}; vm.createContext(c); vm.runInContext(leer("modulos/lista.js"), c);
  c.self.SB_ARCHIVOS.forEach(f => assert.ok(fs.existsSync(path.join(RAIZ, f)), f + " no existe"));
  const sw = leer("sw.js"); assert.match(sw, /SB_ARCHIVOS/); assert.match(sw, /\.\/core\.js/); assert.match(sw, /\.\/sync\.js/); assert.match(sw, /\.\/seguridad\.js/);
});
test("la versión y las novedades están parejas", () => {
  const v = leer("version.js"), ver = /APP_VERSION = "([^"]+)"/.exec(v)[1], nov = /APP_NOVEDADES = "([^"]+)"/.exec(v)[1];
  assert.match(ver, /^\d+\.\d+\.\d+$/); assert.ok(v.includes('["' + ver + '", "' + nov + '"]'), "la primera línea del historial debe ser la versión actual");
});
test("index.html carga version.js, lista, núcleo y no incluye módulos a mano", () => {
  const h = leer("index.html"); ["version.js", "modulos/lista.js", "core.js", "sync.js", "seguridad.js"].forEach(s => assert.ok(h.includes('src="' + s + '"'), s));
  assert.ok(!/src="modulos\/(notas|tareas|habitos|diario)/.test(h));
});
test("index.html abre los datos guardados (iniciar) antes de cargar los módulos", () => {
  const h = leer("index.html"); assert.match(h, /SB\.iniciar\(\)\.then\(cargar, cargar\)/); assert.ok(h.indexOf('src="core.js"') < h.indexOf('src="sync.js"'));
});
