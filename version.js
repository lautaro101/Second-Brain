/* ÚNICO lugar donde cambiás la versión de Second Brain.
   Para publicar algo nuevo: cambiá APP_VERSION y agregá arriba de APP_HISTORIAL una línea de qué cambió. Subí este archivo junto con index.html y sw.js. */
self.APP_VERSION = "1.11.0";
self.APP_NOVEDADES = "Pantalla de entrada con el logo animado y una barra de carga, igual que la de Mi Recibo: sale una vez por apertura de la app (se cierra sola o al tocarla) y, si la página tarda en cargar, te avisa y te deja reintentar.";
self.APP_HISTORIAL = [
  ["1.11.0", "Pantalla de entrada con el logo animado y una barra de carga, igual que la de Mi Recibo: sale una vez por apertura de la app (se cierra sola o al tocarla) y, si la página tarda en cargar, te avisa y te deja reintentar."],
  ["1.10.1", "La bienvenida de la primera vez ahora muestra todo lo que fue sumando la app, no solo la última versión."],
  ["1.10.0", "Ahora podés instalar Second Brain como app: aparece un aviso con el botón «Instalar» y, si tu navegador no avisa (Brave, iPhone, Firefox), te explica el camino a mano. En Ajustes → «Instalar la app» siempre lo tenés a mano, aunque hayas cerrado el aviso."],
  ["1.9.0", "Finanzas: ahora podés editar un movimiento (monto, categoría, nota, fecha y tipo) y ponerle un tope mensual a cada categoría. Te avisa al llegar al 80 % y al pasarte (al cargar el gasto, en Hoy y en el resumen del mes)."],
  ["1.8.0", "Nuevo módulo Finanzas: anotá gastos e ingresos (también desde la captura rápida: «gasto 3500 super»), mirá el resumen del mes por categoría y cargá tus pagos fijos con aviso 3 y 1 día antes (Hoy te muestra los que están por vencer). Los montos se guardan en centavos, sin errores de redondeo."],
  ["1.7.0", "Nuevo módulo Programación: tus proyectos con estado, bitácora de avances, tareas y notas enlazadas (Hoy te avisa de los que llevan una semana quietos), y los temas que estás aprendiendo con su lista de recursos y el progreso. Lo que captures como «Proyecto» entra como idea."],
  ["1.6.0", "Nuevo módulo Estudio: cargá tus materias, los parciales, finales y entregas (con aviso 7, 3 y 1 día antes y en Hoy), y medí tus sesiones de estudio con un reloj. Cada materia crea sus notas de clase en Notas y te muestra el promedio y las horas de la semana."],
  ["1.5.0", "Tareas en tablero: columnas Pendiente, En curso y Hecha (arrastrás las tarjetas en la PC o usás ◀ ▶ en el celu), además de la lista. Las «En curso» salen en Hoy. El Inbox se ordena solo con reglas (por ejemplo «comprar…» va a Tareas, «idea…» a Notas): las editás en el Inbox. Arreglos: al deshacer una tarea hecha el cambio ahora también se sincroniza, y en Tareas los ajustes de abajo («Pasa a prioridad», «Avisos») ya no se ven con el texto aplastado."],
  ["1.4.0", "Tareas: avisos 7, 3 y 1 día antes (y el mismo día) y tareas que se repiten (cada día, semana, mes o N días). Hábitos: «veces por semana» sin día fijo, aviso diario mientras estén pendientes y una nota por día."],
  ["1.3.0", "En Tareas, las que se acercan a su fecha límite pasan solas a «Prioridad» (por defecto 3 días antes; lo cambiás en la misma pantalla) y también aparecen en Hoy. Si «Buscar actualizaciones» falla, ahora te dice el motivo real."],
  ["1.2.1", "Si «Buscar actualizaciones» falla, ahora te dice el motivo real en vez de culpar siempre a la conexión."],
  ["1.2.0", "Ahora podés ponerle un PIN a la app y cifrar con una clave los archivos que guardás en Drive u OneDrive y las copias que descargás (Ajustes → Seguridad). Si pasan 15 días sin guardar una copia y tenés cambios nuevos, la app te avisa. Se sumaron pruebas de tareas, hábitos, diario, avisos y versión."],
  ["1.1.0", "Sincronizá tu PC y tu celu con un archivo en Google Drive u OneDrive (en Ajustes). Los datos pasan a IndexedDB, sin el tope de 5 MB. Las notas ahora tienen formato Markdown, notas fijadas y plantillas."],
  ["1.0.3", "Ajustes tiene el botón «Buscar actualizaciones», y la app también busca una versión nueva cada vez que volvés a abrirla."],
  ["1.0.2", "Ahora, después de cada actualización, se muestra una sola vez la lista de novedades (y un mensaje de bienvenida la primera vez que entrás). También las ves siempre en Ajustes."],
  ["1.0.1", "Ahora también se adapta a la PC: menú lateral, pantalla más ancha con tarjetas en columnas, atajos de teclado (N, /, H, Esc, Ctrl+Enter) y ventana de captura centrada."],
  ["1.0.0", "Primera versión: captura rápida, Inbox, notas con etiquetas y enlaces, búsqueda, pantalla Hoy, tareas, hábitos y diario."]
];
