# Second Brain

Organizador de vida personal (PWA sin frameworks ni build). Núcleo: captura rápida, Inbox, búsqueda, Hoy, revisión semanal, ajustes. Módulos 1.0.0: Notas, Tareas, Hábitos, Diario.

## Cómo está armado
- `index.html`: estilos, arranque y carga de módulos (uno por uno: si uno falla, los demás siguen).
- `core.js`: núcleo y almacenamiento. No se toca para sumar módulos.
- `sync.js`: sincronización por archivo (Drive / OneDrive).
- `seguridad.js`: PIN de acceso, cifrado de archivos (AES-256-GCM con una clave tuya) y recordatorio de copia a los 15 días. El PIN es un candado de pantalla: no cifra lo guardado en el dispositivo. Si se pierde la clave de cifrado, esos archivos no se pueden abrir.
- `modulos/*.js`: un archivo por módulo; cada uno llama a `SB.registrar({...})`.
- `modulos/lista.js`: la lista de módulos (la leen la página y el service worker).
- `version.js`: único lugar donde se cambia la versión. `sw.js` + `manifest.webmanifest`: instalable y sin conexión.

## Sumar un módulo
1. Creá `modulos/salud.js` con `SB.registrar({id, nombre, icono, esquema, inicial, migraciones, pantalla, hoy, buscar, avisos, semana, captura})` (mirá `modulos/habitos.js` como ejemplo).
2. Agregá `"modulos/salud.js"` a `SB_ARCHIVOS` en `modulos/lista.js`.
3. Subí la versión en `version.js` (y una línea en `APP_HISTORIAL`).

Los datos de cada módulo viven en **IndexedDB** (base `second_brain`, clave `sb_m_<id>`) con su propia versión de esquema. Al abrir la 1.1 los datos de localStorage se pasan de a uno, se verifican y recién ahí se borran del original; si uno falla, ese queda en localStorage y todo sigue andando. Sin IndexedDB, la app usa localStorage como antes. Para cambiar la forma de los datos, subí `esquema` y escribí `migraciones[N]` (de la N-1 a la N): antes de migrar se guarda una copia en `sb_bak_<id>`.

## Sincronización
Ajustes → «Sincronizar PC y celu». En PC con Chrome/Edge/Brave se vincula un archivo y se actualiza solo; en el celu se guarda/comparte el `.json` a Drive u OneDrive y en el otro dispositivo se carga. Se junta por nota, tarea, hábito o día de diario (gana el último cambio) y los borrados viajan. Para que un módulo nuevo se sincronice fino, declará `sync: [{k: "propiedad", orden: "desc", t: x => x.m}]`; sin eso se junta entero (gana el modificado más tarde).

## Notas
Markdown (títulos, listas, `- [ ]` tareas tildables, código, citas, enlaces), `#etiquetas`, `[[enlaces]]`, notas fijadas (salen en Hoy) y plantillas (clase, idea de app, reunión).

## Pruebas
```
npm test
```
No necesitan instalar nada. También corren solas en GitHub (pestaña Actions).
