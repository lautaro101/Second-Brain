/* ÚNICO lugar donde cambiás la versión de Second Brain.
   Para publicar algo nuevo: cambiá APP_VERSION y agregá arriba de APP_HISTORIAL una línea de qué cambió. Subí este archivo junto con index.html y sw.js. */
self.APP_VERSION = "1.2.0";
self.APP_NOVEDADES = "Ahora podés ponerle un PIN a la app y cifrar con una clave los archivos que guardás en Drive u OneDrive y las copias que descargás (Ajustes → Seguridad). Si pasan 15 días sin guardar una copia y tenés cambios nuevos, la app te avisa. Se sumaron pruebas de tareas, hábitos, diario, avisos y versión.";
self.APP_HISTORIAL = [
  ["1.2.0", "Ahora podés ponerle un PIN a la app y cifrar con una clave los archivos que guardás en Drive u OneDrive y las copias que descargás (Ajustes → Seguridad). Si pasan 15 días sin guardar una copia y tenés cambios nuevos, la app te avisa. Se sumaron pruebas de tareas, hábitos, diario, avisos y versión."],
  ["1.1.0", "Sincronizá tu PC y tu celu con un archivo en Google Drive u OneDrive (en Ajustes). Los datos pasan a IndexedDB, sin el tope de 5 MB. Las notas ahora tienen formato Markdown, notas fijadas y plantillas."],
  ["1.0.3", "Ajustes tiene el botón «Buscar actualizaciones», y la app también busca una versión nueva cada vez que volvés a abrirla."],
  ["1.0.2", "Ahora, después de cada actualización, se muestra una sola vez la lista de novedades (y un mensaje de bienvenida la primera vez que entrás). También las ves siempre en Ajustes."],
  ["1.0.1", "Ahora también se adapta a la PC: menú lateral, pantalla más ancha con tarjetas en columnas, atajos de teclado (N, /, H, Esc, Ctrl+Enter) y ventana de captura centrada."],
  ["1.0.0", "Primera versión: captura rápida, Inbox, notas con etiquetas y enlaces, búsqueda, pantalla Hoy, tareas, hábitos y diario."]
];
