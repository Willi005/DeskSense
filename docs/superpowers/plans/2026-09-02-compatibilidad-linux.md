# Plan de Implementación — Compatibilidad con Linux

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de casilla (`- [ ]`) para seguimiento.

**Objetivo:** Dejar DeskSense ejecutable, empaquetable y con notificaciones funcionales en Linux, tras haber sido desarrollado íntegramente en Windows.

**Arquitectura:** Son cuatro cambios independientes entre sí: un script de reparación que se engancha al `postinstall` del proyecto para resolver que npm 11 y el instalador de Electron dejen el binario sin extraer; la configuración de empaquetado para Linux en electron-builder; unos ajustes del proceso principal para que la aplicación se identifique correctamente ante el sistema; y la verificación de extremo a extremo con su documentación.

**Stack:** Node 26.7.0, npm 11.19.0, Electron 33.4.11, electron-builder 26, Vite 5.

**Spec:** `docs/superpowers/specs/2026-09-02-tareas-reportes-y-enfoque-design.md` (sección 5).

## Restricciones globales

- Los **identificadores del código** —variables, funciones, constantes, claves— van en **inglés**. Los **comentarios** van en **español**, siguiendo la convención ya establecida en todo el repositorio (`src/lib/sensors.js`, `electron/main.cjs`, `scripts/make-icon.mjs`). Los textos visibles para el usuario, los mensajes de consola y los mensajes de commit van en **español**.
- Los commits **no llevan co-autoría ni atribución a herramientas de IA**.
- Nomenclatura de commits: `feat:`, `fix:`, `chore:` seguido de una descripción breve en español.
- Gitflow: se trabaja en `feature/compatibilidad-linux`, ya creada desde `develop`. Nunca se commitea directo sobre `main`.
- **`appId` y `AppUserModelId` siguen siendo `com.monitoreo.escritorio`.** Cambiarlos rompe las notificaciones en Windows. El `productName` sí es `DeskSense`.
- Ningún script del proyecto debe terminar con código de salida distinto de cero por un fallo de reparación: eso rompería `npm install` en Windows y en CI.
- Identidad de Git de este repositorio: `GuillermoSalgado1 <g.salgado04@ufromail.cl>` (ya configurada localmente).

---

### Tarea 1: Reparación automática del binario de Electron

El `postinstall` del paquete `electron` descarga el ZIP de 106 MB a `~/.cache/electron` y termina con código 0 **sin extraerlo**, dejando `node_modules/electron/dist` vacío. Sin esto, la aplicación no arranca tras un `npm install` limpio.

**Archivos:**
- Crear: `scripts/postinstall.mjs`
- Modificar: `package.json` (sección `scripts`)

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: el binario ejecutable en `node_modules/electron/dist/electron`, del que dependen las tareas 3 y 4 y todo el desarrollo posterior.

- [ ] **Paso 1: Reproducir el fallo para confirmar que existe**

```bash
rm -rf node_modules/electron/dist
ls node_modules/electron/dist 2>&1
```

Esperado: `No such file or directory`. Confirma el punto de partida.

- [ ] **Paso 2: Verificar que la reparación aún no existe**

```bash
node scripts/postinstall.mjs 2>&1; echo "exit=$?"
```

Esperado: falla con `Cannot find module`, porque el script todavía no está escrito.

- [ ] **Paso 3: Escribir el script de reparación**

Crear `scripts/postinstall.mjs`:

```js
// Repara la instalación de Electron en Linux. El postinstall del propio paquete
// descarga el ZIP a ~/.cache/electron pero termina con código 0 sin extraerlo,
// dejando node_modules/electron/dist vacío y la aplicación imposible de arrancar.
// Este script es idempotente y nunca falla: si no puede reparar, avisa y sale
// con código 0 para no romper `npm install` en otras plataformas.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  chmodSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const electronDir = join(process.cwd(), 'node_modules', 'electron')
const distDir = join(electronDir, 'dist')
const binary = join(distDir, 'electron')

// Extractores del sistema, en orden de preferencia. Deliberadamente NO se usa
// extract-zip: su dependencia transitiva fd-slicer, sin mantenimiento desde
// 2016, se cuelga a mitad del ZIP con Node 26 sin emitir error ni fin de flujo.
// Esa es exactamente la causa de que el postinstall del propio Electron termine
// con código 0 sin extraer nada, que es el fallo que este script repara.
const EXTRACTORS = [
  { cmd: 'unzip', args: (zip, dir) => ['-q', '-o', zip, '-d', dir] },
  { cmd: 'bsdtar', args: (zip, dir) => ['xf', zip, '-C', dir] },
]

function extract(zip, dir) {
  for (const { cmd, args } of EXTRACTORS) {
    try {
      execFileSync(cmd, args(zip, dir), { stdio: 'ignore' })
      if (existsSync(join(dir, 'electron'))) return cmd
    } catch {
      // Extractor ausente o fallido: se prueba el siguiente.
    }
  }
  return null
}

// Versión de Electron que este proyecto espera, leída de su propio package.json.
function installedVersion() {
  try {
    return JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version || null
  } catch {
    return null
  }
}

// Busca en la caché el ZIP de la versión exacta que el proyecto necesita. La
// caché de Electron es COMPARTIDA entre todos los proyectos de la máquina y usa
// un directorio por hash de descarga, así que puede contener ZIPs de varias
// versiones a la vez: coger el primero que aparezca instalaría en silencio el
// Electron de otro proyecto. Si no se puede determinar la versión esperada, se
// prefiere no reparar antes que instalar una versión desconocida.
function findCachedZip() {
  const version = installedVersion()
  if (!version) return null

  const cacheRoot = join(homedir(), '.cache', 'electron')
  if (!existsSync(cacheRoot)) return null

  const wanted = `electron-v${version}-linux-x64.zip`
  for (const entry of readdirSync(cacheRoot)) {
    let files = []
    try {
      files = readdirSync(join(cacheRoot, entry))
    } catch {
      continue
    }
    if (files.includes(wanted)) return join(cacheRoot, entry, wanted)
  }
  return null
}

async function main() {
  if (process.platform !== 'linux') return
  if (!existsSync(electronDir)) return
  if (existsSync(binary)) return

  const zip = findCachedZip()
  if (!zip) {
    console.warn(
      '[postinstall] Falta el binario de Electron y no hay en la caché un ZIP de la versión esperada. Ejecuta: npm rebuild electron'
    )
    return
  }

  mkdirSync(distDir, { recursive: true })
  const used = extract(zip, distDir)
  if (!used) {
    console.warn(
      '[postinstall] No se pudo extraer el binario de Electron. Instala unzip o bsdtar y ejecuta: npm run postinstall'
    )
    return
  }

  chmodSync(binary, 0o755)
  // `index.js` de electron resuelve el binario como
  // path.join(__dirname, 'dist', <contenido de path.txt>), así que este archivo
  // debe contener SOLO el nombre del ejecutable. Escribir 'dist/electron' aquí
  // produce la ruta duplicada 'dist/dist/electron' y rompe `require('electron')`,
  // es decir `npm run dev` y `npm start`, aunque el binario esté bien extraído.
  writeFileSync(join(electronDir, 'path.txt'), 'electron')
  console.log(`[postinstall] Binario de Electron extraído desde la caché (${used}).`)
}

main().catch((err) => {
  console.warn('[postinstall] No se pudo reparar Electron:', err.message)
})
```

- [ ] **Paso 4: Ejecutar el script y verificar que repara**

```bash
node scripts/postinstall.mjs && node_modules/electron/dist/electron --version
```

Esperado: `[postinstall] Binario de Electron extraído desde la caché (unzip).` seguido de `v33.4.11`. El extractor nombrado entre paréntesis puede ser `unzip` o `bsdtar`, según cuál esté instalado.

- [ ] **Paso 5: Verificar que es idempotente**

```bash
node scripts/postinstall.mjs && echo "segunda ejecución OK"
```

Esperado: no imprime nada del script y muestra `segunda ejecución OK`. Al existir ya el binario, sale temprano sin hacer trabajo.

- [ ] **Paso 6: Engancharlo al ciclo de instalación**

En `package.json`, dentro de `scripts`, añadir la entrada `postinstall` como primera línea del bloque:

```json
"postinstall": "node scripts/postinstall.mjs",
```

- [ ] **Paso 7: Verificar el enganche y la resolución del módulo**

```bash
rm -rf node_modules/electron/dist && npm run postinstall
node_modules/electron/dist/electron --version
node -e "console.log(require('electron'))"
```

Esperado: repara, muestra `v33.4.11`, y la última línea imprime la ruta **sin `dist` duplicado**:
`.../node_modules/electron/dist/electron`.

> Ejecutar el binario por su ruta directa **no** basta como verificación: no pasa por `index.js` y por tanto no valida `path.txt`. Un `path.txt` mal escrito deja el binario perfectamente extraído pero rompe `npm run dev` y `npm start`, que sí resuelven el módulo. La tercera línea es la que detecta ese fallo.

- [ ] **Paso 8: Commit**

```bash
git add scripts/postinstall.mjs package.json
git commit -m "fix: repara automaticamente la instalacion de Electron en Linux"
```

---

### Tarea 2: Empaquetado para Linux

`npm run dist` está clavado a `--win` y en este equipo no hay `wine` ni `makensis`, de modo que hoy es imposible generar un ejecutable.

**Archivos:**
- Modificar: `package.json` (secciones `build` y `scripts`)

**Interfaces:**
- Consume: el binario de Electron reparado en la Tarea 1, y `build/icon.png`, que ya genera `npm run icon` mediante `sharp` (verificado en Linux).
- Produce: `release/DeskSense-1.0.1.AppImage`, ejecutable sin instalación.

- [ ] **Paso 1: Confirmar que el empaquetado actual falla**

```bash
timeout 300 npx electron-builder --linux 2>&1 | tail -8
ls -la release/ 2>&1
```

Esperado: **cualquiera de dos resultados** confirma la línea base, y ambos son válidos: o bien falla por falta de configuración, o bien produce un artefacto usando los valores por defecto de electron-builder (nombre genérico, sin el icono del proyecto). Lo que la tarea añade es configuración *explícita y reproducible*, no la capacidad de empaquetar. Anota cuál de los dos ocurrió y sigue adelante en ambos casos.

Si generó algo, borrar `release/` antes de continuar para que el paso 4 verifique el resultado de la configuración nueva y no un artefacto viejo.

- [ ] **Paso 2: Añadir la configuración de Linux**

En `package.json`, dentro de `build`, añadir un bloque `linux` hermano del bloque `win` existente:

```json
"linux": {
  "target": [
    "AppImage"
  ],
  "icon": "build/icon.png",
  "category": "Utility",
  "synopsis": "Monitoreo ambiental inteligente del escritorio",
  "artifactName": "DeskSense-${version}.${ext}"
},
```

Se usa únicamente AppImage. El target `deb` requiere `dpkg` y `fakeroot`, que no están presentes en esta distribución, y el AppImage ya cubre el objetivo de tener un ejecutable distribuible.

- [ ] **Paso 3: Separar los scripts por plataforma**

En `package.json`, reemplazar la línea de `dist` por estas tres:

```json
"dist": "npm run icon && npm run build && electron-builder",
"dist:win": "npm run icon && npm run build && electron-builder --win",
"dist:linux": "npm run icon && npm run build && electron-builder --linux",
```

Sin bandera de plataforma, `electron-builder` empaqueta para el sistema en el que corre, que es el comportamiento deseado por defecto.

- [ ] **Paso 4: Generar el paquete**

```bash
timeout 600 npm run dist:linux 2>&1 | tail -15
ls -la release/*.AppImage
```

Esperado: el comando termina sin error y aparece un archivo `.AppImage` de aproximadamente 100 MB.

- [ ] **Paso 5: Verificar que el paquete arranca**

```bash
chmod +x release/DeskSense-1.0.1.AppImage
timeout 20 ./release/DeskSense-1.0.1.AppImage 2>&1 | head -20
```

Esperado: la ventana de DeskSense aparece. Si falla con un error de espacio de nombres o de sandbox, reintentar con `--no-sandbox`; en tal caso, anotarlo para documentarlo en la Tarea 4.

- [ ] **Paso 6: Commit**

```bash
git add package.json
git commit -m "feat: empaquetado de la app para Linux en formato AppImage"
```

---

### Tarea 3: Ajustes del proceso principal para Linux

Tres correcciones en el mismo archivo, todas relativas a cómo la aplicación se presenta ante el sistema operativo.

**Archivos:**
- Modificar: `electron/main.cjs`

**Interfaces:**
- Consume: el binario reparado en la Tarea 1.
- Produce: notificaciones nativas identificadas como DeskSense, de las que depende el sistema de alertas existente y, más adelante, las ventanas de concentración de la funcionalidad nueva.

- [ ] **Paso 1: Corregir el nombre de la aplicación**

En `electron/main.cjs`, dentro del bloque `app.whenReady().then(...)`, añadir `app.setName` **antes** de la línea de `setAppUserModelId`, dejando el bloque así:

```js
app.whenReady().then(() => {
  // Nombre con el que el sistema identifica a la app. En Linux es lo que
  // aparece como emisor de las notificaciones: sin esto se muestra "Electron".
  app.setName('DeskSense')
  // Necesario para que las notificaciones nativas se muestren en Windows.
  if (process.platform === 'win32') app.setAppUserModelId('com.monitoreo.escritorio')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
```

`setAppUserModelId` se mantiene intacto y guardado por plataforma: es lo que hace funcionar los toasts en Windows y no debe tocarse.

- [ ] **Paso 2: Corregir el título por defecto de las notificaciones**

En el manejador `ipcMain.on('notify', ...)`, la cadena de respaldo todavía dice `'Monitoreo Inteligente'`, el nombre anterior del proyecto. Sustituirla:

```js
      title: (payload && payload.title) || 'DeskSense',
```

- [ ] **Paso 3: Corregir la altura mínima de la ventana**

En `createWindow()`, la ventana declara `minHeight: 1024`, que no cabe en un monitor de 1080p con barra de sistema. Cambiar esa línea:

```js
    minHeight: 720,
```

`minWidth: 1024` se mantiene: el diseño bento necesita ese ancho para no romperse.

- [ ] **Paso 4: Verificar que la aplicación arranca con los cambios**

```bash
npm run build && timeout 25 npx electron . 2>&1 | head -20
```

Esperado: la ventana aparece sin errores en consola. Cerrarla o dejar que expire el `timeout`.

- [ ] **Paso 5: Verificar las notificaciones nativas**

Con la aplicación abierta, ejecutar en otra terminal:

```bash
notify-send "Prueba" "Verificación de libnotify"
```

Esperado: la notificación aparece en el escritorio. Confirma que el servidor de notificaciones responde, que es de lo que depende `electron.Notification`.

- [ ] **Paso 6: Commit**

```bash
git add electron/main.cjs
git commit -m "fix: la app se identifica como DeskSense en Linux y su ventana cabe en pantallas de 1080p"
```

---

### Tarea 4: Verificación de extremo a extremo y documentación

**Archivos:**
- Modificar: `README.md`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: la confirmación de que la rama puede integrarse a `develop`.

- [ ] **Paso 1: Verificar la instalación desde cero**

Es la prueba que realmente importa: que alguien que clone el repositorio en Linux pueda trabajar.

```bash
rm -rf node_modules
npm install 2>&1 | tail -5
node_modules/electron/dist/electron --version
```

Esperado: `npm install` termina sin error, el `postinstall` repara si hace falta, y el binario responde `v33.4.11`.

- [ ] **Paso 2: Verificar el modo de desarrollo**

```bash
timeout 40 npm run dev 2>&1 | head -25
```

Esperado: Vite levanta en el puerto 5173 y la ventana de Electron abre contra `localhost:5173`. Es el flujo que se usará durante toda la implementación de la funcionalidad nueva.

- [ ] **Paso 3: Verificar la conexión real a ThingsBoard**

Con la aplicación abierta, ir a Configuración, introducir las credenciales de ThingsBoard con el host `http://200.13.5.20:8080` y el dispositivo `monitoreo-escritorio`, y pulsar conectar.

Esperado: se obtiene el JWT y se resuelve el `deviceId`. El dashboard puede quedar sin valores mientras el dispositivo no publique, lo cual es correcto: no hay hardware armado todavía. Lo que se verifica aquí es que la autenticación y la resolución del dispositivo funcionan desde Linux.

- [ ] **Paso 4: Documentar la instalación en Linux**

En `README.md`, añadir una sección tras las instrucciones de instalación existentes:

```markdown
## Ejecución en Linux

El proyecto se desarrolló en Windows y funciona igual en Linux, con dos
particularidades del entorno:

- **npm 11 avisa de los install scripts no revisados.** El campo `allowScripts`
  de `package.json` marca como revisados los de `electron` y `esbuild` y silencia
  el aviso; no es necesario para que descarguen su binario.
- **El instalador de Electron puede no extraer su binario.** Descarga el ZIP a
  `~/.cache/electron` y termina sin descomprimirlo. El script
  `scripts/postinstall.mjs` lo detecta y lo repara automáticamente tras cada
  `npm install`. Si aun así falta, ejecutar `npm run postinstall`.

Para generar un ejecutable distribuible:

```bash
npm run dist:linux   # genera release/DeskSense-<versión>.AppImage
```

`npm run dist:win` sigue generando el instalador NSIS, pero requiere ejecutarse
en Windows o disponer de `wine`.
```

Si en el paso 5 de la Tarea 2 hizo falta `--no-sandbox`, añadir también esa nota aquí.

- [ ] **Paso 5: Commit**

```bash
git add README.md
git commit -m "docs: documenta la ejecucion y el empaquetado en Linux"
```

- [ ] **Paso 6: Dejar la rama lista, sin integrarla**

```bash
git log --oneline develop..HEAD
git status --short
```

Esperado: los commits de las cuatro tareas listados y el árbol de trabajo limpio.

**La integración a `develop` no forma parte de esta tarea.** Un merge es una acción que se decide y ejecuta al cerrar el plan, no dentro de una tarea de implementación. No se toca `main` en ningún caso: la integración a `main` corresponde a una release, no a una feature.
