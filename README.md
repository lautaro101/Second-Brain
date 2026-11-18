# Second Brain

Organizador de vida personal (PWA sin frameworks ni build). Núcleo: captura rápida, Inbox, búsqueda, Hoy, revisión semanal, ajustes. Módulos: Notas, Tareas, Hábitos, Diario, Estudio, Programación, Finanzas.

## Cómo está armado
- `index.html`: pantalla de entrada (splash: el logo del ícono que se dibuja, nombre, barra de carga y versión; una vez por apertura según `sessionStorage`, mínimo 2,4 s, tope 3,5 s, se cierra al tocarla, respeta «reducir movimiento» y avisa si `version.js` no llega en 7 s), estilos, arranque y carga de módulos (uno por uno: si uno falla, los demás siguen).
- `core.js`: núcleo y almacenamiento. No se toca para sumar módulos.
- `sync.js`: sincronización por archivo (Drive / OneDrive).
- `seguridad.js`: PIN de acceso, cifrado de archivos (AES-256-GCM con una clave tuya) y recordatorio de copia a los 15 días. El PIN es un candado de pantalla: no cifra lo guardado en el dispositivo. Si se pierde la clave de cifrado, esos archivos no se pueden abrir.
- `modulos/*.js`: un archivo por módulo; cada uno llama a `SB.registrar({...})`.
- `modulos/lista.js`: la lista de módulos (la leen la página y el service worker).
- `instalar.js`: instalar como app. Se carga ANTES de `core.js` (para no perderse el aviso del navegador) y no depende del núcleo. Aviso abajo con botón «Instalar» (se cierra y vuelve a los 14 días); donde el navegador no avisa (Brave, iPhone, Firefox) explica el camino a mano; Ajustes → «Instalar la app» siempre lo ofrece. Solo anda desde la página publicada (https).
- `version.js`: único lugar donde se cambia la versión. `sw.js` + `manifest.webmanifest`: instalable y sin conexión.

## Sumar un módulo
1. Creá `modulos/salud.js` con `SB.registrar({id, nombre, icono, esquema, inicial, migraciones, pantalla, hoy, buscar, avisos, semana, captura})` (mirá `modulos/habitos.js` como ejemplo).
2. Agregá `"modulos/salud.js"` a `SB_ARCHIVOS` en `modulos/lista.js`.
3. Subí la versión en `version.js` (y una línea en `APP_HISTORIAL`).

Los datos de cada módulo viven en **IndexedDB** (base `second_brain`, clave `sb_m_<id>`) con su propia versión de esquema. Al abrir la 1.1 los datos de localStorage se pasan de a uno, se verifican y recién ahí se borran del original; si uno falla, ese queda en localStorage y todo sigue andando. Sin IndexedDB, la app usa localStorage como antes. Para cambiar la forma de los datos, subí `esquema` y escribí `migraciones[N]` (de la N-1 a la N): antes de migrar se guarda una copia en `sb_bak_<id>`.

## Sincronización
Ajustes → «Sincronizar PC y celu». En PC con Chrome/Edge/Brave se vincula un archivo y se actualiza solo; en el celu se guarda/comparte el `.json` a Drive u OneDrive y en el otro dispositivo se carga. Se junta por nota, tarea, hábito o día de diario (gana el último cambio) y los borrados viajan. Para que un módulo nuevo se sincronice fino, declará `sync: [{k: "propiedad", orden: "desc", t: x => x.m}]`; sin eso se junta entero (gana el modificado más tarde).

## Tareas
Prioridad por fecha: Urgente (vence hoy o venció), Prioridad (faltan N días o menos: 3 por defecto, general en cada dispositivo y propio por tarea con el campo «a»), Próxima (hasta 7 días). Urgentes y en Prioridad salen en Hoy. Vista lista o tablero (Pendiente / En curso / Hecha); la vista se recuerda por dispositivo. «Hecha» pasa por `completar`/`deshacer`, así que las repeticiones funcionan igual desde el tablero. Cada cambio de columna anota `m` (último cambio) para que la sincronización lo lleve.

## Inbox que se ordena solo
Reglas «empieza con» / «contiene» (palabras separadas por coma, sin mayúsculas ni tildes, por palabra entera) que mandan lo capturado al módulo que tenga `captura`. Vienen unas básicas (comprar, pagar, llamar → Tareas; idea → Notas; hoy aprendí → Diario), se editan en el Inbox, se pueden apagar y se aplican al capturar o con «Ordenar con las reglas». Se guardan en cada dispositivo, no se sincronizan.

## Estudio
Materias (con días de cursada: ese día aparecen en Hoy), parciales / finales / entregas con fecha, nota y aviso (parciales 7, 3 y 1 día antes; entregas 3 y 1; y el mismo día), y sesiones de estudio con reloj (o cargadas a mano). Cada materia crea «notas de clase» en Notas con una etiqueta propia (`#clase #nombre-de-la-materia`) y las lista. El reloj en marcha vive en cada dispositivo; las sesiones, evaluaciones y materias se sincronizan. Datos: `m` materias, `e` evaluaciones, `s` sesiones (ver el encabezado de `modulos/estudio.js`). Notas ofrece `crear` y `porEtiqueta` para que otros módulos se apoyen en él.

## Programación
Proyectos con estado (idea, en curso, pausado, terminado), tecnologías, enlace, bitácora de avances y, por una etiqueta propia (`#nombre-del-proyecto`), sus tareas de Tareas y sus notas de Notas. Un proyecto en curso sin movimiento hace 7 días o más aparece en Hoy. Aprendizaje: temas con una lista de recursos que se tildan (el siguiente paso de los que estás estudiando sale en Hoy). Lo capturado como «Proyecto» entra como idea. Tareas ofrece `crear` y `porProyecto` para esto. Datos: `p` proyectos, `b` bitácora, `a` temas, `r` recursos (ver el encabezado de `modulos/programacion.js`).

## Finanzas
Resumen simple del día a día (el detalle del sueldo está en Mi Recibo): gastos e ingresos con categoría y fecha, resumen por mes (gastos, ingresos, balance y qué categoría pesa más) y **pagos fijos** (alquiler, internet…) con día de vencimiento, monto fijo o variable y aviso 3 y 1 día antes y el mismo día. Hoy muestra los que vencen en 3 días o menos (o están atrasados este mes); tocarlos los marca pagados. Al pagar un fijo con monto queda cargado como gasto, así el mes cierra; si es de monto variable se pregunta cuánto (o se tilda sin monto). Captura rápida: «gasto 3500 super», «nafta 12.000,50», «ingreso 800000 sueldo» (el primer número es el monto; la categoría se adivina por palabras como super, nafta, alquiler). Una regla del Inbox manda lo que empieza con gasto / gasté / ingreso / cobré. Los montos se guardan **en centavos enteros** (sin decimales flotantes). **Editar** (✏️ en cada movimiento: monto, categoría, nota, fecha y tipo; el gasto de un pago fijo no puede cambiar de mes). **Presupuesto** (pestaña 🎯): un tope mensual por categoría, igual para todos los meses; avisa al cruzar el 80 % y el 100 % al cargar el gasto (con la demora justa para no pisar el «Guardado en Gasto»), en Hoy (los que van en 80 % o más, máx. 2) y en el resumen. No manda notificaciones de fondo: el aviso depende de la fecha del gasto y se repetiría cada día. Datos (esquema 2): `g` movimientos, `f` pagos fijos, `b` presupuestos (ver el encabezado de `modulos/finanzas.js`). Como los datos viajan por la sincronización, se cifran junto con todo lo demás si activás el cifrado en Ajustes → Seguridad (el PIN solo bloquea la pantalla).

## Notas
Markdown (títulos, listas, `- [ ]` tareas tildables, código, citas, enlaces), `#etiquetas`, `[[enlaces]]`, notas fijadas (salen en Hoy) y plantillas (clase, idea de app, reunión).

## Pruebas
```
npm test
```
No necesitan instalar nada. También corren solas en GitHub (pestaña Actions).
