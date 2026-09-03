# Plan de Implementación — Tareas, Reportes de Rendimiento y Ventanas de Concentración

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de casilla (`- [ ]`) para seguimiento.

**Objetivo:** Incorporar las tareas del usuario a DeskSense y cruzarlas con la telemetría ambiental, de modo que el sistema pase de monitorear un escritorio a relacionar el ambiente con el rendimiento de quien lo usa.

**Arquitectura:** Se añade una capa de persistencia local en el proceso principal de Electron (el renderer no puede tocar `fs`), sobre la que se apoya un `TasksContext` nuevo. La lógica de cálculo —índice de entorno, agregación del reporte y máquina de estados de las ventanas de concentración— vive en módulos puros bajo `src/lib/`, separada de React y cubierta por pruebas unitarias. Un simulador independiente publica telemetría sintética a ThingsBoard para que todo el pipeline real funcione sin el dispositivo físico.

**Stack:** Electron 33, React 18, Vite 5, Tailwind 3, Recharts 2, Vitest, ThingsBoard (REST y WebSocket), OpenRouter y Anthropic para IA.

**Spec:** `docs/superpowers/specs/2026-09-02-tareas-reportes-y-enfoque-design.md`

## Restricciones globales

- Los **identificadores del código** —variables, funciones, constantes, claves— van en **inglés**. Los **comentarios** van en **español**, siguiendo la convención ya establecida en todo el repositorio (`src/lib/sensors.js`, `electron/main.cjs`, `scripts/make-icon.mjs`). Los textos visibles para el usuario y los mensajes de commit van en **español**.
- Los commits **no llevan co-autoría ni atribución a herramientas de IA**.
- Nomenclatura de commits: `feat:`, `fix:`, `chore:` seguido de una descripción breve en español.
- Gitflow: se trabaja en `feature/tareas-y-reportes`, creada desde `develop` **después** de integrar `feature/compatibilidad-linux`.
- **No se añaden dependencias de runtime.** El simulador usa el `fetch` nativo de Node. La única dependencia nueva es `vitest`, como dependencia de desarrollo.
- **El período "esta semana" es de lunes a domingo**, no los últimos siete días móviles.
- **Las tareas sin `dueDate` no entran en el cálculo de cumplimiento.**
- El cruce entre tareas y ambiente se denomina **"patrón observado"**, nunca "correlación". No hay muestra suficiente para sostener una afirmación estadística.
- `getTimeseries` devuelve `{ key: [{ ts, value }] }` con los **valores como cadena de texto**: hay que convertirlos con `Number()` antes de operar.
- `appId` y `AppUserModelId` siguen siendo `com.monitoreo.escritorio`. No tocarlos.

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `scripts/simulator/scenarios.mjs` | Definición de escenarios y generación de valores. Puro. |
| `scripts/simulator/device.mjs` | Resolución del token del dispositivo y publicación a ThingsBoard. |
| `scripts/simulator.mjs` | Interfaz de línea de comandos del simulador. |
| `electron/store.cjs` | Persistencia JSON atómica en `userData`, expuesta por IPC. |
| `src/lib/tasks.js` | Modelo de tarea, rangos de fecha, cumplimiento y selección. Puro. |
| `src/lib/report.js` | Índice de entorno, promedios y armado del reporte. Puro. |
| `src/lib/focus.js` | Máquina de estados de las ventanas de concentración. Pura. |
| `src/lib/voice.js` | Captura de audio y reencodeo a WAV. |
| `src/context/TasksContext.jsx` | Estado de tareas y ventanas, persistido. |
| `src/context/FocusContext.jsx` | Detección de ventanas de concentración. |
| `src/pages/Tasks.jsx` | Página de gestión de tareas. |
| `src/pages/Reports.jsx` | Página de reportes. |
| `src/components/TaskComposer.jsx` | Entrada de texto con IA y botón de voz. |
| `src/components/TaskItem.jsx` | Fila de una tarea. |
| `src/components/TaskFormDialog.jsx` | Formulario manual de creación y edición. |
| `src/components/ReportSummary.jsx` | Tarjetas de cumplimiento, entorno y patrón. |
| `tests/lib/tasks.test.js`, `tests/lib/report.test.js`, `tests/lib/focus.test.js`, `tests/simulator/scenarios.test.js` | Pruebas de la lógica pura. |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `src/lib/sensors.js` | Se mueve aquí `WATCH_KEYS`, hoy dentro de `AlertsContext`. |
| `src/context/AlertsContext.jsx` | Importa `WATCH_KEYS` desde `sensors.js`. |
| `src/lib/ai.js` | Añade `parseTask`, `parseTaskFromAudio` y `summarizeReport`. |
| `electron/main.cjs` | Registra el IPC del almacén. |
| `electron/preload.cjs` | Expone `store` y `requestMicrophone`. |
| `src/main.jsx` | Añade los providers `Tasks` y `Focus`. |
| `src/App.jsx` | Añade las páginas `tasks` y `reports`. |
| `src/components/Sidebar.jsx` | Añade los dos ítems de navegación. |
| `src/context/SettingsContext.jsx` | Añade el campo `focusEnabled`. |
| `src/pages/Settings.jsx` | Añade el interruptor de ventanas de concentración. |
| `package.json` | Añade `vitest` y los scripts `test` y `simulate`. |

**Orden de ejecución.** El simulador va primero pese a ser la capa 5 del spec: sin datos en ThingsBoard no hay forma de probar los reportes ni las ventanas de concentración.

---

### Tarea 1: Escenarios del simulador y arranque de las pruebas

**Archivos:**
- Crear: `scripts/simulator/scenarios.mjs`
- Crear: `tests/simulator/scenarios.test.js`
- Modificar: `package.json`

**Interfaces:**
- Consume: `classify` y `TELEMETRY_KEYS` de `src/lib/sensors.js`.
- Produce: `sampleScenario(name, tick, rng)` → objeto con todas las claves de telemetría; `SCENARIO_NAMES` → array de nombres válidos. Los usa la Tarea 2.

- [ ] **Paso 1: Instalar Vitest y declarar los scripts**

```bash
npm install --save-dev vitest
```

En `package.json`, dentro de `scripts`, añadir:

```json
"test": "vitest run",
"test:watch": "vitest",
```

- [ ] **Paso 2: Escribir la prueba que falla**

Crear `tests/simulator/scenarios.test.js`. La prueba valida el escenario contra la clasificación real de la aplicación: si el escenario dice "óptimo", `classify` debe estar de acuerdo. Así se verifican ambos lados a la vez.

```js
import { describe, it, expect } from 'vitest'
import { sampleScenario, SCENARIO_NAMES } from '../../scripts/simulator/scenarios.mjs'
import { classify, WATCH_KEYS } from '../../src/lib/sensors.js'

// Generador determinista para que las pruebas no dependan del azar.
function seededRng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('sampleScenario', () => {
  it('expone los cuatro escenarios del diseño', () => {
    expect(SCENARIO_NAMES).toEqual(['optimo', 'degradado', 'critico', 'jornada'])
  })

  it('genera todas las claves de telemetría', () => {
    const sample = sampleScenario('optimo', 0, seededRng(1))
    for (const key of WATCH_KEYS) {
      expect(typeof sample[key]).toBe('number')
    }
    expect(typeof sample.distancia).toBe('number')
  })

  it('el escenario optimo clasifica todos los sensores como buenos', () => {
    const rng = seededRng(42)
    for (let tick = 0; tick < 200; tick++) {
      const sample = sampleScenario('optimo', tick, rng)
      for (const key of WATCH_KEYS) {
        expect(classify(key, sample[key]).id, `${key}=${sample[key]} en tick ${tick}`).toBe('good')
      }
    }
  })

  it('el escenario critico degrada ruido y PM2.5 a nivel de alerta', () => {
    const rng = seededRng(7)
    for (let tick = 0; tick < 200; tick++) {
      const sample = sampleScenario('critico', tick, rng)
      expect(['bad', 'severe']).toContain(classify('ruido', sample.ruido).id)
      expect(['bad', 'severe']).toContain(classify('pm25', sample.pm25).id)
    }
  })

  it('rechaza un escenario desconocido', () => {
    expect(() => sampleScenario('inexistente', 0)).toThrow(/desconocido/i)
  })
})
```

- [ ] **Paso 3: Mover `WATCH_KEYS` a sensors.js**

La prueba importa `WATCH_KEYS` desde `sensors.js`, donde todavía no existe. Está declarada en `src/context/AlertsContext.jsx` línea 9 y la necesitarán también el reporte y la detección de concentración.

En `src/lib/sensors.js`, tras la declaración de `TELEMETRY_KEYS`, añadir:

```js
// Métricas con niveles de calidad relevantes para alertas, índice de entorno y
// detección de ventanas de concentración (excluye distancia y presencia, que no
// tienen un nivel "bueno" o "malo").
export const WATCH_KEYS = ['temperatura', 'humedad', 'luz', 'ruido', 'pm25', 'pm1', 'pm10']
```

En `src/context/AlertsContext.jsx`, eliminar la declaración local de `WATCH_KEYS` (línea 9 y su comentario) y añadirla a la importación existente de sensores:

```js
import { SENSORS, classify, WATCH_KEYS } from '../lib/sensors'
```

- [ ] **Paso 4: Ejecutar la prueba para verificar que falla**

```bash
npm test
```

Esperado: FALLA con un error de resolución de `scripts/simulator/scenarios.mjs`, que aún no existe.

- [ ] **Paso 5: Implementar los escenarios**

Crear `scripts/simulator/scenarios.mjs`:

```js
// Escenarios del simulador de telemetría. Cada uno declara un rango objetivo por
// sensor; los valores se generan dentro de ese rango con ruido y una deriva lenta
// para que no parezcan sintéticos. Los rangos están elegidos para caer dentro del
// nivel que el escenario promete según src/lib/sensors.js.

export const SCENARIO_NAMES = ['optimo', 'degradado', 'critico', 'jornada']

// [min, max] por sensor. Ver la tabla de umbrales del spec.
const RANGES = {
  optimo: {
    temperatura: [21, 23],
    humedad: [45, 55],
    luz: [58, 74],
    ruido: [38, 46],
    pm1: [2, 7],
    pm25: [3, 9],
    pm4: [4, 12],
    pm10: [5, 15],
  },
  degradado: {
    temperatura: [18.5, 19.5],
    humedad: [32, 38],
    luz: [25, 45],
    ruido: [61, 66],
    pm1: [12, 22],
    pm25: [16, 30],
    pm4: [20, 36],
    pm10: [25, 42],
  },
  critico: {
    temperatura: [29, 31],
    humedad: [78, 84],
    luz: [8, 16],
    ruido: [72, 82],
    pm1: [30, 45],
    pm25: [60, 110],
    pm4: [80, 130],
    pm10: [110, 160],
  },
}

// La jornada recorre el día: arranca fresca, se degrada hacia la tarde y se
// recupera al final. Se expresa como una lista de tramos por fracción del día.
const WORKDAY = [
  { until: 0.25, scenario: 'optimo' },
  { until: 0.5, scenario: 'degradado' },
  { until: 0.7, scenario: 'critico' },
  { until: 0.85, scenario: 'degradado' },
  { until: 1, scenario: 'optimo' },
]

// Ticks que dura una jornada simulada completa (8 h a una muestra cada 3 s).
const WORKDAY_TICKS = (8 * 60 * 60) / 3

function pick([min, max], rng) {
  return min + (max - min) * rng()
}

// Deriva suave y determinista, para que los valores se muevan en vez de saltar.
function drift(tick, amplitude) {
  return Math.sin(tick / 40) * amplitude
}

function clamp(value, [min, max]) {
  return Math.min(max, Math.max(min, value))
}

export function sampleScenario(name, tick, rng = Math.random) {
  let ranges = RANGES[name]

  if (name === 'jornada') {
    const progress = (tick % WORKDAY_TICKS) / WORKDAY_TICKS
    const segment = WORKDAY.find((s) => progress <= s.until) ?? WORKDAY[WORKDAY.length - 1]
    ranges = RANGES[segment.scenario]
  }

  if (!ranges) {
    throw new Error(
      `Escenario desconocido: "${name}". Válidos: ${SCENARIO_NAMES.join(', ')}`
    )
  }

  const sample = {}
  for (const [key, range] of Object.entries(ranges)) {
    const span = range[1] - range[0]
    const raw = pick(range, rng) + drift(tick, span * 0.15)
    sample[key] = Number(clamp(raw, range).toFixed(2))
  }

  // La distancia la fija el llamador según el estado de presencia; aquí se deja
  // un valor por defecto de persona sentada.
  sample.distancia = Number((45 + drift(tick, 8)).toFixed(1))
  return sample
}
```

- [ ] **Paso 6: Ejecutar las pruebas para verificar que pasan**

```bash
npm test
```

Esperado: los cinco casos de `scenarios.test.js` en verde.

- [ ] **Paso 7: Verificar que no se rompieron las alertas**

```bash
npm run build
```

Esperado: compila sin error. Confirma que mover `WATCH_KEYS` no dejó ninguna referencia rota en `AlertsContext`.

- [ ] **Paso 8: Commit**

```bash
git add package.json package-lock.json tests/ scripts/simulator/ src/lib/sensors.js src/context/AlertsContext.jsx
git commit -m "feat: escenarios del simulador de telemetria con pruebas unitarias"
```

---

### Tarea 2: Publicación del simulador a ThingsBoard

**Archivos:**
- Crear: `scripts/simulator/device.mjs`
- Crear: `scripts/simulator.mjs`
- Modificar: `package.json`, `.env.example`

**Interfaces:**
- Consume: `sampleScenario` y `SCENARIO_NAMES` de la Tarea 1.
- Produce: telemetría real en ThingsBoard, de la que dependen las Tareas 8, 9 y 11 para poder verificarse.

- [ ] **Paso 1: Escribir el resolutor de token y el publicador**

Crear `scripts/simulator/device.mjs`:

```js
// Resolución del token de dispositivo y publicación de telemetría a ThingsBoard.
// Usa el fetch nativo de Node: el simulador no añade dependencias.

function normalizeHost(host) {
  return (host || '').replace(/\/+$/, '')
}

async function tbFetch(host, path, { jwt, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (jwt) headers['X-Authorization'] = `Bearer ${jwt}`
  const res = await fetch(`${normalizeHost(host)}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(`ThingsBoard ${res.status}: ${res.statusText}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Obtiene el token de acceso del dispositivo. Prioriza la variable de entorno;
// si no está, inicia sesión y lo resuelve por REST, para no tener que copiarlo
// a mano desde la interfaz de ThingsBoard.
export async function resolveDeviceToken({ host, token, username, password, deviceName }) {
  if (token) return token
  if (!username || !password) {
    throw new Error(
      'Falta TB_DEVICE_TOKEN, o bien TB_USERNAME y TB_PASSWORD para resolverlo automáticamente.'
    )
  }

  const { token: jwt } = await tbFetch(host, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

  const device = await tbFetch(
    host,
    `/api/tenant/devices?deviceName=${encodeURIComponent(deviceName)}`,
    { jwt }
  )
  const deviceId = device?.id?.id
  if (!deviceId) throw new Error(`No se encontró el dispositivo "${deviceName}".`)

  const credentials = await tbFetch(host, `/api/device/${deviceId}/credentials`, { jwt })
  if (!credentials?.credentialsId) {
    throw new Error('El dispositivo no tiene un token de acceso configurado.')
  }
  return credentials.credentialsId
}

// Publica un punto de telemetría con marca de tiempo propia. Enviar el ts evita
// que ThingsBoard selle con la hora del servidor, que es el origen del desfase
// horario documentado en el roadmap del proyecto.
export async function publish({ host, token, ts, values }) {
  const res = await fetch(`${normalizeHost(host)}/api/v1/${token}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts, values }),
  })
  if (!res.ok) throw new Error(`Publicación fallida: ${res.status} ${res.statusText}`)
}
```

- [ ] **Paso 2: Escribir la interfaz de línea de comandos**

Crear `scripts/simulator.mjs`:

```js
// Simulador de telemetría de DeskSense. Publica a ThingsBoard como si fuera el
// ESP32, replicando su cadencia y su lógica de ahorro: sin presencia solo envía
// la distancia; con presencia envía el conjunto completo de sensores.
//
// Uso:
//   node scripts/simulator.mjs --escenario=optimo
//   node scripts/simulator.mjs --escenario=jornada --acelerado=120 --ciclos=240
//
// Cada tick representa 3 s x aceleracion de tiempo simulado. Con --acelerado=120
// cada tick son 6 min, de modo que 240 ciclos cubren 24 h y 1680 cubren 7 dias.
import { readFileSync, existsSync } from 'node:fs'
import { sampleScenario, SCENARIO_NAMES } from './simulator/scenarios.mjs'
import { resolveDeviceToken, publish } from './simulator/device.mjs'

const PUBLISH_INTERVAL_MS = 3000 // misma cadencia que el firmware
const PRESENCE_DISTANCE_CM = 80

function parseArgs(argv) {
  const args = {}
  for (const arg of argv.slice(2)) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    args[key] = value
  }
  return args
}

// Lector mínimo de .env: el simulador no depende de dotenv.
// El grupo del valor es NO codicioso (`.*?`) para que `\s*$` recorte de verdad
// los espacios finales. Con `.*` codicioso, un valor con espacios al final se
// quedaba con ellos dentro y, si además iba entrecomillado, el recorte de
// comillas dejaba una comilla suelta pegada al valor — rompiendo el host o el
// token en silencio, que es el peor modo de fallo posible aquí.
function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '')
  }
}

// Presencia con histéresis, igual que el firmware: entra de inmediato, sale solo
// tras varias lecturas consecutivas sin detección.
function makePresence() {
  let present = true
  let absentStreak = 0
  return (tick) => {
    // Ausencias periódicas: una pausa de unos minutos cada media hora simulada.
    const shouldBeAbsent = tick % 600 > 540
    if (shouldBeAbsent) {
      absentStreak += 1
      if (absentStreak >= 5) present = false
    } else {
      absentStreak = 0
      present = true
    }
    return present
  }
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv)
  const scenario = args.escenario || 'optimo'

  if (!SCENARIO_NAMES.includes(scenario)) {
    console.error(`Escenario desconocido: "${scenario}". Válidos: ${SCENARIO_NAMES.join(', ')}`)
    process.exit(1)
  }

  const speed = Number(args.acelerado || 1)
  const cycles = args.ciclos ? Number(args.ciclos) : Infinity

  // Un argumento no numérico produciría NaN y acabaría escribiendo `ts: null`
  // en el payload, corrompiendo la marca de tiempo sin que nada lo delate.
  if (!Number.isFinite(speed) || speed <= 0) {
    console.error('--acelerado debe ser un número mayor que 0.')
    process.exit(1)
  }
  if (args.ciclos && (!Number.isFinite(cycles) || cycles <= 0)) {
    console.error('--ciclos debe ser un número entero mayor que 0.')
    process.exit(1)
  }
  // En modo acelerado el historial se sitúa hacia atrás desde ahora, así que
  // hace falta saber cuántos puntos son. Sin ese límite el reloj simulado
  // seguiría avanzando más rápido que el real y acabaría publicando en el futuro.
  if (speed > 1 && !Number.isFinite(cycles)) {
    console.error('--acelerado requiere --ciclos para saber cuánto historial generar.')
    process.exit(1)
  }

  const host = process.env.TB_HOST || 'http://200.13.5.20:8080'
  const deviceName = process.env.TB_DEVICE_NAME || 'monitoreo-escritorio'

  const token = await resolveDeviceToken({
    host,
    token: process.env.TB_DEVICE_TOKEN,
    username: process.env.TB_USERNAME,
    password: process.env.TB_PASSWORD,
    deviceName,
  })

  console.log(`Simulando "${scenario}" hacia ${host} (aceleración ×${speed}).`)
  console.log('Ctrl+C para detener.')

  const presenceOf = makePresence()
  const step = PUBLISH_INTERVAL_MS * speed

  // Marca de tiempo de cada punto. En modo acelerado el historial se construye
  // hacia atrás DESDE AHORA: cada punto se sitúa a los pasos que le falten para
  // llegar al final, de modo que el último caiga exactamente en el presente y
  // ninguno pueda quedar en el futuro. Calcularlo contra Date.now() en cada
  // iteración lo hace además inmune al tiempo real que tarde el bucle en
  // completar las peticiones: un reloj simulado acumulado se iba desfasando.
  const timestampFor = (tick) =>
    speed > 1 ? Date.now() - (cycles - 1 - tick) * step : Date.now()

  for (let tick = 0; tick < cycles; tick++) {
    const simulatedTs = timestampFor(tick)
    const present = presenceOf(tick)
    const sample = sampleScenario(scenario, tick)

    // Lógica anti-derroche del firmware: sin presencia solo se reporta distancia.
    const values = present
      ? { ...sample, distancia: sample.distancia, presencia: 1 }
      : { distancia: PRESENCE_DISTANCE_CM + 60, presencia: 0 }

    try {
      await publish({ host, token, ts: simulatedTs, values })
      if (tick % 20 === 0) {
        const stamp = new Date(simulatedTs).toLocaleTimeString('es-CL')
        console.log(`[${stamp}] tick ${tick} · presencia=${present ? 'sí' : 'no'}`)
      }
    } catch (err) {
      console.warn(`tick ${tick}: ${err.message}`)
    }

    // En tiempo real se espera la cadencia del firmware; en modo acelerado no,
    // porque el reloj lo marca `timestampFor`, no la espera.
    if (speed === 1) await new Promise((r) => setTimeout(r, PUBLISH_INTERVAL_MS))
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
```

- [ ] **Paso 3: Declarar el script y las variables de entorno**

En `package.json`, dentro de `scripts`:

```json
"simulate": "node scripts/simulator.mjs",
```

En `.env.example`, añadir al final:

```
# Simulador de telemetría (scripts/simulator.mjs). El token se puede pegar
# directo, o dejarse vacío y resolverlo con las credenciales de ThingsBoard.
TB_HOST=http://200.13.5.20:8080
TB_DEVICE_NAME=monitoreo-escritorio
TB_DEVICE_TOKEN=
TB_USERNAME=
TB_PASSWORD=
```

- [ ] **Paso 4: Verificar la resolución del token**

Crear un `.env` local con `TB_USERNAME` y `TB_PASSWORD` reales, y ejecutar:

```bash
timeout 20 npm run simulate -- --escenario=optimo --ciclos=3
```

Esperado: imprime `Simulando "optimo"...` y tres ticks sin errores de publicación. Si falla en la resolución del token, pegar el token directamente en `TB_DEVICE_TOKEN`.

- [ ] **Paso 5: Verificar que los datos llegan a la aplicación**

Con `npm run dev` corriendo y la aplicación conectada a ThingsBoard, ejecutar en otra terminal:

```bash
npm run simulate -- --escenario=critico
```

Esperado: el dashboard muestra valores en vivo y, a los pocos segundos, se disparan las alertas de ruido y PM2.5 con notificación nativa. Esto valida de una vez el WebSocket, la clasificación y el sistema de alertas existente sobre Linux.

- [ ] **Paso 6: Generar historial para los reportes**

```bash
npm run simulate -- --escenario=jornada --acelerado=120 --ciclos=240
```

Cada tick representa `3 s x aceleracion` de tiempo simulado: con `--acelerado=120` cada tick son 6 minutos, así que **240 ciclos cubren exactamente 24 horas**. Para el reporte semanal hacen falta `--ciclos=1680` (7 días).

Esperado: el historial queda poblado y el último punto cae en el momento actual. Verificar en la página de Historial, con rango de 24 h, que la curva cubre la ventana completa sin hueco al final.

- [ ] **Paso 7: Commit**

```bash
git add scripts/ package.json .env.example
git commit -m "feat: simulador de telemetria que publica escenarios a ThingsBoard"
```

---

### Tarea 3: Almacenamiento persistente

**Archivos:**
- Crear: `electron/store.cjs`
- Modificar: `electron/main.cjs`, `electron/preload.cjs`

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: `window.electronAPI.store.read()` → `Promise<StoreData>` y `window.electronAPI.store.write(data)` → `Promise<boolean>`, donde `StoreData` es `{ version, tasks, focusWindows }`. Los usa la Tarea 4.

- [ ] **Paso 1: Escribir el módulo de almacenamiento**

Crear `electron/store.cjs`:

```js
// Persistencia local de tareas, ventanas de concentración y caché de reportes.
// Vive en el proceso principal porque el renderer corre con contextIsolation y
// sin nodeIntegration, de modo que no puede acceder a fs — y así debe seguir.
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const FILE_NAME = 'desksense-data.json'

const EMPTY_DATA = { version: 1, tasks: [], focusWindows: [] }

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function read() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8')
    const parsed = JSON.parse(raw)
    // Se completan las claves ausentes para tolerar archivos de versiones previas.
    return { ...EMPTY_DATA, ...parsed }
  } catch {
    // Archivo inexistente o corrupto: la app nunca debe fallar al iniciar por esto.
    return { ...EMPTY_DATA }
  }
}

// Escritura atómica: se escribe a un temporal y se renombra, de modo que un
// cierre abrupto no pueda dejar el JSON a medias.
function write(data) {
  const target = filePath()
  const temp = `${target}.tmp`
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(temp, target)
}

function registerStoreIpc(ipcMain) {
  ipcMain.handle('store:read', () => read())
  ipcMain.handle('store:write', (_event, data) => {
    try {
      write(data)
      return true
    } catch {
      return false
    }
  })
}

module.exports = { registerStoreIpc }
```

- [ ] **Paso 2: Registrar el IPC en el proceso principal**

En `electron/main.cjs`, añadir la importación junto a las existentes de la cabecera:

```js
const { registerStoreIpc } = require('./store.cjs')
```

Y dentro de `app.whenReady().then(...)`, antes de `createWindow()`:

```js
  registerStoreIpc(ipcMain)
```

- [ ] **Paso 3: Exponer el almacén al renderer**

En `electron/preload.cjs`, añadir la clave `store` dentro del objeto expuesto:

```js
  store: {
    read: () => ipcRenderer.invoke('store:read'),
    write: (data) => ipcRenderer.invoke('store:write', data),
  },
```

Se usa `invoke` y no `send` porque la lectura necesita devolver un valor.

- [ ] **Paso 4: Verificar el ciclo de lectura y escritura**

Levantar la aplicación con `npm run dev` y, en la consola de las herramientas de desarrollo, ejecutar:

```js
await window.electronAPI.store.write({ version: 1, tasks: [{ id: 'x', title: 'prueba' }], focusWindows: [], reportCache: {} })
await window.electronAPI.store.read()
```

Esperado: la escritura devuelve `true` y la lectura devuelve el objeto con la tarea de prueba. Cerrar y reabrir la aplicación, volver a leer y comprobar que la tarea sigue ahí.

- [ ] **Paso 5: Verificar la tolerancia a archivo corrupto**

```bash
echo "{ esto no es json" > "$HOME/.config/desksense/desksense-data.json"
```

> La carpeta es `desksense` en minúsculas, no `DeskSense`. Está verificado: `app.getPath('userData')` se resuelve desde el campo `name` de `package.json`, y el `app.setName('DeskSense')` que añade la capa de compatibilidad con Linux se ejecuta después de `whenReady`, así que **no** mueve la carpeta de datos. Eso es deseable: cambiarla dejaría huérfanos los datos de cualquier instalación previa.

Reabrir la aplicación y leer de nuevo.

Esperado: devuelve la estructura vacía por defecto en lugar de fallar. Confirma que un archivo dañado no impide arrancar.

- [ ] **Paso 6: Commit**

```bash
git add electron/
git commit -m "feat: almacenamiento local persistente para tareas y reportes"
```

---

### Tarea 4: Modelo de tareas y contexto de React

**Archivos:**
- Crear: `src/lib/tasks.js`, `tests/lib/tasks.test.js`, `src/context/TasksContext.jsx`
- Modificar: `src/main.jsx`

**Interfaces:**
- Consume: `window.electronAPI.store` de la Tarea 3.
- Produce:
  - De `src/lib/tasks.js`: `createTask(fields)`, `dayRange(date)`, `weekRange(date)`, `toDateKey(date)`, `tasksInRange(tasks, range)`, `completionRate(tasks)`, `nextDeepTask(tasks)`, `PRIORITY_LABELS`, `COMPLEXITY_LABELS`.
  - De `TasksContext`: `useTasks()` → `{ tasks, addTask, updateTask, toggleDone, removeTask, focusWindows, addFocusWindow, loading }`.
  - Los usan las Tareas 5, 6, 8, 9 y 11.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `tests/lib/tasks.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  createTask,
  dayRange,
  weekRange,
  toDateKey,
  tasksInRange,
  completionRate,
  nextDeepTask,
} from '../../src/lib/tasks.js'

describe('createTask', () => {
  it('completa los valores por defecto', () => {
    const task = createTask({ title: 'Escribir informe' })
    expect(task.title).toBe('Escribir informe')
    expect(task.status).toBe('pending')
    expect(task.priority).toBe('medium')
    expect(task.complexity).toBe('shallow')
    expect(task.completedAt).toBeNull()
    expect(task.id).toBeTruthy()
  })

  it('respeta los valores entregados', () => {
    const task = createTask({
      title: 'Terminar el informe de redes',
      dueDate: '2026-09-03',
      priority: 'high',
      complexity: 'deep',
      estimatedMinutes: 120,
      source: 'voice',
    })
    expect(task.priority).toBe('high')
    expect(task.complexity).toBe('deep')
    expect(task.estimatedMinutes).toBe(120)
    expect(task.source).toBe('voice')
  })

  it('descarta una prioridad inválida y cae al valor por defecto', () => {
    expect(createTask({ title: 'X', priority: 'urgentísima' }).priority).toBe('medium')
  })
})

describe('rangos de fecha', () => {
  it('dayRange cubre el día local completo', () => {
    const { start, end } = dayRange(new Date('2026-09-02T15:30:00'))
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(end).getHours()).toBe(23)
    expect(toDateKey(new Date(start))).toBe('2026-09-02')
  })

  it('weekRange va de lunes a domingo, no de los últimos siete días', () => {
    // 2026-09-02 es miércoles.
    const { start, end } = weekRange(new Date('2026-09-02T15:30:00'))
    expect(toDateKey(new Date(start))).toBe('2026-08-31') // lunes
    expect(toDateKey(new Date(end))).toBe('2026-09-06') // domingo
  })

  it('weekRange trata el domingo como último día de su semana, no como primero', () => {
    const { start } = weekRange(new Date('2026-09-06T10:00:00')) // domingo
    expect(toDateKey(new Date(start))).toBe('2026-08-31')
  })
})

describe('tasksInRange', () => {
  const range = dayRange(new Date('2026-09-02T12:00:00'))

  it('incluye las tareas cuya fecha cae dentro', () => {
    const tasks = [createTask({ title: 'A', dueDate: '2026-09-02' })]
    expect(tasksInRange(tasks, range)).toHaveLength(1)
  })

  it('excluye las tareas de otro día', () => {
    const tasks = [createTask({ title: 'B', dueDate: '2026-09-05' })]
    expect(tasksInRange(tasks, range)).toHaveLength(0)
  })

  it('excluye las tareas sin fecha', () => {
    const tasks = [createTask({ title: 'C' })]
    expect(tasksInRange(tasks, range)).toHaveLength(0)
  })
})

describe('completionRate', () => {
  it('calcula el porcentaje de cumplimiento', () => {
    const tasks = [
      { status: 'done' },
      { status: 'done' },
      { status: 'pending' },
      { status: 'pending' },
    ]
    expect(completionRate(tasks)).toEqual({ done: 2, total: 4, percent: 50 })
  })

  it('devuelve cero por ciento sin tareas, en vez de dividir por cero', () => {
    expect(completionRate([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('nextDeepTask', () => {
  it('elige la tarea profunda pendiente de mayor prioridad', () => {
    const tasks = [
      createTask({ title: 'Ligera alta', priority: 'high', complexity: 'shallow' }),
      createTask({ title: 'Profunda baja', priority: 'low', complexity: 'deep' }),
      createTask({ title: 'Profunda alta', priority: 'high', complexity: 'deep' }),
    ]
    expect(nextDeepTask(tasks).title).toBe('Profunda alta')
  })

  it('ignora las tareas profundas ya completadas', () => {
    const done = { ...createTask({ title: 'Hecha', complexity: 'deep' }), status: 'done' }
    expect(nextDeepTask([done])).toBeNull()
  })

  it('devuelve null si no hay ninguna tarea profunda pendiente', () => {
    expect(nextDeepTask([createTask({ title: 'Ligera' })])).toBeNull()
  })

  it('desempata por la fecha de vencimiento más próxima', () => {
    const tasks = [
      createTask({ title: 'Lejana', priority: 'high', complexity: 'deep', dueDate: '2026-09-20' }),
      createTask({ title: 'Cercana', priority: 'high', complexity: 'deep', dueDate: '2026-09-03' }),
    ]
    expect(nextDeepTask(tasks).title).toBe('Cercana')
  })
})
```

- [ ] **Paso 2: Ejecutar las pruebas para verificar que fallan**

```bash
npm test
```

Esperado: FALLA por no poder resolver `src/lib/tasks.js`.

- [ ] **Paso 3: Implementar el modelo de tareas**

Crear `src/lib/tasks.js`:

```js
// Modelo de tarea y utilidades puras de fecha, cumplimiento y selección.
// Sin dependencias de React: todo esto se prueba de forma aislada.

export const PRIORITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' }
export const COMPLEXITY_LABELS = { deep: 'Profunda', shallow: 'Ligera' }

// Orden de mayor a menor urgencia, para elegir qué tarea sugerir.
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const VALID_PRIORITIES = Object.keys(PRIORITY_LABELS)
const VALID_COMPLEXITIES = Object.keys(COMPLEXITY_LABELS)
const VALID_SOURCES = ['text', 'voice', 'form']

// Formato de fecha aceptado. Se valida en la entrada para que ninguna tarea
// quede con una fecha que después no se pueda interpretar.
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Una jornada de trabajo como techo razonable: valores negativos, cero o
// absurdos no son estimaciones, son errores de entrada.
const MAX_ESTIMATED_MINUTES = 24 * 60

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function isValidMinutes(value) {
  return Number.isFinite(value) && value > 0 && value <= MAX_ESTIMATED_MINUTES
}

export function createTask({
  title,
  dueDate = null,
  priority = 'medium',
  complexity = 'shallow',
  estimatedMinutes = null,
  source = 'form',
} = {}) {
  return {
    id: crypto.randomUUID(),
    title: String(title || '').trim(),
    createdAt: Date.now(),
    // Una fecha con formato inesperado se descarta en vez de guardarse: si se
    // guardara, `tasksInRange` la convertiría en NaN y la tarea desaparecería de
    // todos los períodos sin que nada lo delatara.
    dueDate: DATE_KEY_PATTERN.test(dueDate) ? dueDate : null,
    priority: oneOf(priority, VALID_PRIORITIES, 'medium'),
    complexity: oneOf(complexity, VALID_COMPLEXITIES, 'shallow'),
    estimatedMinutes: isValidMinutes(estimatedMinutes) ? Math.round(estimatedMinutes) : null,
    status: 'pending',
    completedAt: null,
    source: oneOf(source, VALID_SOURCES, 'form'),
  }
}

// 'YYYY-MM-DD' en hora local. No se usa toISOString, que convierte a UTC y
// puede devolver el día anterior según la zona horaria.
export function toDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dayRange(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

// Semana de lunes a domingo. getDay() devuelve 0 para domingo, por lo que el
// domingo se trata como el séptimo día de la semana que termina, no como inicio.
export function weekRange(date = new Date()) {
  const day = date.getDay()
  const offsetToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(date)
  monday.setDate(date.getDate() - offsetToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: dayRange(monday).start, end: dayRange(sunday).end }
}

// Las tareas sin fecha de vencimiento no pertenecen a ningún período y quedan
// fuera del cálculo de cumplimiento, para no distorsionar el porcentaje.
export function tasksInRange(tasks, range) {
  return tasks.filter((task) => {
    if (!task.dueDate) return false
    const [year, month, day] = task.dueDate.split('-').map(Number)
    const ts = new Date(year, month - 1, day, 12).getTime()
    return ts >= range.start && ts <= range.end
  })
}

export function completionRate(tasks) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status === 'done').length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

// Tarea que se sugiere al detectar una ventana de concentración: la pendiente
// de complejidad profunda con mayor prioridad y, a igualdad, la que vence antes.
export function nextDeepTask(tasks) {
  const candidates = tasks.filter(
    (task) => task.status === 'pending' && task.complexity === 'deep'
  )
  if (!candidates.length) return null

  return [...candidates].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (byPriority !== 0) return byPriority
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return a.createdAt - b.createdAt
  })[0]
}
```

- [ ] **Paso 4: Ejecutar las pruebas para verificar que pasan**

```bash
npm test
```

Esperado: todos los casos de `tasks.test.js` en verde.

- [ ] **Paso 5: Implementar el contexto de tareas**

Crear `src/context/TasksContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createTask } from '../lib/tasks'

const TasksContext = createContext(null)

// Se agrupan las escrituras para no tocar el disco en cada pulsación de tecla.
const WRITE_DEBOUNCE_MS = 500

export function TasksProvider({ children }) {
  const [tasks, setTasks] = useState([])
  const [focusWindows, setFocusWindows] = useState([])
  const [loading, setLoading] = useState(true)
  const loadedRef = useRef(false)
  const timerRef = useRef(null)

  // Carga inicial desde el proceso principal.
  useEffect(() => {
    let cancelled = false
    const store = typeof window !== 'undefined' ? window.electronAPI?.store : null
    if (!store) {
      setLoading(false)
      loadedRef.current = true
      return
    }
    store
      .read()
      .then((data) => {
        if (cancelled) return
        // Se fusiona en vez de reemplazar: si la persona añadió algo mientras la
        // lectura estaba en vuelo, reemplazar lo descartaría en silencio.
        setTasks((prev) => [...prev, ...(data?.tasks || [])])
        setFocusWindows((prev) => [...prev, ...(data?.focusWindows || [])])
        // La escritura solo se habilita tras una lectura CORRECTA. Si la lectura
        // falla y aun así permitiéramos escribir, el primer cambio guardaría el
        // estado vacío encima del archivo real y borraría los datos.
        loadedRef.current = true
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Espejo del estado para poder volcarlo desde manejadores que no se recrean
  // en cada render (desmontaje y cierre de ventana).
  const stateRef = useRef({ tasks, focusWindows })
  stateRef.current = { tasks, focusWindows }

  const persist = useCallback(() => {
    const store = typeof window !== 'undefined' ? window.electronAPI?.store : null
    if (!store || !loadedRef.current) return
    const { tasks, focusWindows } = stateRef.current
    // Lectura previa para conservar cualquier clave del archivo que este
    // contexto no gestione.
    store
      .read()
      .then((current) => store.write({ ...current, version: 1, tasks, focusWindows }))
      .catch(() => {})
  }, [])

  // Persistencia con debounce. No escribe antes de la carga inicial, para no
  // sobrescribir el archivo con el estado vacío del primer render.
  useEffect(() => {
    if (!loadedRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      persist()
    }, WRITE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tasks, focusWindows, persist])

  // Volcado de la escritura pendiente al desmontar o al cerrar la ventana. Sin
  // esto, cualquier cambio hecho en los últimos WRITE_DEBOUNCE_MS antes de
  // cerrar la app se descartaba en silencio: el cleanup cancelaba el temporizador
  // sin llegar a guardar nada.
  useEffect(() => {
    const flushPending = () => {
      if (timerRef.current == null) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      persist()
    }
    window.addEventListener('beforeunload', flushPending)
    return () => {
      window.removeEventListener('beforeunload', flushPending)
      flushPending()
    }
  }, [persist])

  const addTask = useCallback((fields) => {
    const task = createTask(fields)
    setTasks((prev) => [task, ...prev])
    return task
  }, [])

  const updateTask = useCallback((id, patch) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)))
  }, [])

  const toggleDone = useCallback((id) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task
        const done = task.status !== 'done'
        return {
          ...task,
          status: done ? 'done' : 'pending',
          // completedAt es la base del cruce con el ambiente en el reporte.
          completedAt: done ? Date.now() : null,
        }
      })
    )
  }, [])

  const removeTask = useCallback((id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }, [])

  const addFocusWindow = useCallback((window) => {
    setFocusWindows((prev) => [...prev, window].slice(-200))
  }, [])

  const value = useMemo(
    () => ({ tasks, addTask, updateTask, toggleDone, removeTask, focusWindows, addFocusWindow, loading }),
    [tasks, addTask, updateTask, toggleDone, removeTask, focusWindows, addFocusWindow, loading]
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks() {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks must be used within TasksProvider')
  return ctx
}
```

- [ ] **Paso 6: Añadir el provider al árbol**

En `src/main.jsx`, importar `TasksProvider` y anidarlo entre `TelemetryProvider` y `AlertsProvider`, quedando:

```jsx
<SettingsProvider>
  <TelemetryProvider>
    <TasksProvider>
      <AlertsProvider>
        <App />
      </AlertsProvider>
    </TasksProvider>
  </TelemetryProvider>
</SettingsProvider>
```

`Tasks` va antes que `Alerts` porque en la Tarea 11 el contexto de concentración, que se anidará más adentro, necesita consultar las tareas pendientes.

- [ ] **Paso 7: Verificar que la aplicación sigue arrancando**

```bash
npm run build && npm test
```

Esperado: compila y todas las pruebas pasan.

- [ ] **Paso 8: Commit**

```bash
git add src/lib/tasks.js tests/lib/tasks.test.js src/context/TasksContext.jsx src/main.jsx
git commit -m "feat: modelo de tareas y contexto persistente"
```

---

### Tarea 5: Parseo de tareas en lenguaje natural

**Archivos:**
- Modificar: `src/lib/ai.js`
- Crear: `tests/lib/parseTask.test.js`

**Interfaces:**
- Consume: `createTask` de la Tarea 4.
- Produce: `parseTaskResponse(text, today)` → campos de tarea, exportada aparte para poder probarla sin red; `parseTask({ provider, apiKey, model, input, today })` → `Promise<fields>`. Las usan las Tareas 6 y 7.

- [ ] **Paso 1: Escribir las pruebas del parseo**

La función que importa probar es la que interpreta la respuesta del modelo, porque es donde vive el respaldo. La llamada de red no se prueba.

Crear `tests/lib/parseTask.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseTaskResponse } from '../../src/lib/ai.js'

const TODAY = '2026-09-02'

describe('parseTaskResponse', () => {
  it('interpreta una respuesta JSON válida', () => {
    const raw = JSON.stringify({
      title: 'Terminar el informe de redes',
      dueDate: '2026-09-03',
      priority: 'high',
      complexity: 'deep',
      estimatedMinutes: 120,
    })
    const fields = parseTaskResponse(raw, TODAY, 'texto original')
    expect(fields.title).toBe('Terminar el informe de redes')
    expect(fields.dueDate).toBe('2026-09-03')
    expect(fields.priority).toBe('high')
    expect(fields.complexity).toBe('deep')
    expect(fields.estimatedMinutes).toBe(120)
  })

  it('tolera que el modelo envuelva el JSON en un bloque de código', () => {
    const raw = '```json\n{"title":"Regar las plantas","priority":"low"}\n```'
    expect(parseTaskResponse(raw, TODAY, 'original').title).toBe('Regar las plantas')
  })

  it('cae al respaldo conservando el texto original si el JSON es inválido', () => {
    const fields = parseTaskResponse('lo siento, no puedo', TODAY, 'comprar café')
    expect(fields.title).toBe('comprar café')
    expect(fields.priority).toBe('medium')
    expect(fields.complexity).toBe('shallow')
    expect(fields.dueDate).toBe(TODAY)
  })

  it('cae al respaldo si el JSON es válido pero no trae título', () => {
    const fields = parseTaskResponse('{"priority":"high"}', TODAY, 'texto original')
    expect(fields.title).toBe('texto original')
  })

  it('descarta una fecha con formato inesperado', () => {
    const raw = '{"title":"X","dueDate":"mañana"}'
    expect(parseTaskResponse(raw, TODAY, 'X').dueDate).toBe(TODAY)
  })
})
```

- [ ] **Paso 2: Ejecutar para verificar que falla**

```bash
npm test tests/lib/parseTask.test.js
```

Esperado: FALLA porque `parseTaskResponse` no está exportada.

- [ ] **Paso 3: Implementar el parseo y la llamada**

Añadir al final de `src/lib/ai.js`:

```js
// ---------------------------------------------------------------------------
// Interpretación de tareas en lenguaje natural
// ---------------------------------------------------------------------------

// Prompt propio, deliberadamente separado de SYSTEM_PROMPT: aquel restringe al
// asistente al ambiente del escritorio y rechazaría esta petición por
// considerarla fuera de alcance.
const TASK_PROMPT = `Conviertes una frase en español en una tarea estructurada.
Respondes ÚNICAMENTE con un objeto JSON, sin texto adicional ni bloques de código.

Campos:
- "title": el enunciado de la tarea, limpio y en español, sin la información de fecha ni prioridad.
- "dueDate": fecha objetivo en formato YYYY-MM-DD, resuelta a partir de expresiones como "hoy", "mañana" o "el viernes". Si no se menciona ninguna, usa la fecha de hoy.
- "priority": "high", "medium" o "low".
- "complexity": "deep" si la tarea exige concentración sostenida (redactar, programar, estudiar, analizar); "shallow" si es mecánica o breve (responder un correo, ordenar, enviar algo).
- "estimatedMinutes": número entero de minutos, o null si no se menciona duración.`

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Se exporta aparte de parseTask para poder probar el respaldo sin red.
export function parseTaskResponse(text, today, originalInput) {
  const fallback = {
    title: String(originalInput || '').trim(),
    dueDate: today,
    priority: 'medium',
    complexity: 'shallow',
    estimatedMinutes: null,
  }

  try {
    // Los modelos suelen envolver el JSON en un bloque de código pese a la
    // instrucción; se extrae el primer objeto que aparezca.
    const match = String(text || '').match(/\{[\s\S]*\}/)
    if (!match) return fallback

    const parsed = JSON.parse(match[0])
    // El título tiene que ser texto de verdad. Con `String(parsed.title)`, un
    // objeto se convertiría en "[object Object]" y un array en "a,b": basura que
    // acabaría mostrándose en pantalla en lugar de caer al respaldo y conservar
    // lo que la persona escribió, que es la garantía central de esta función.
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    if (!title) return fallback

    return {
      title,
      dueDate: DATE_PATTERN.test(parsed.dueDate) ? parsed.dueDate : today,
      // `priority` y `complexity` se pasan tal cual a propósito: `createTask`
      // los valida contra su lista blanca y cae a los valores por defecto ante
      // cualquier cosa inesperada. Validar aquí también sería duplicar esa regla
      // en dos sitios que tendrían que mantenerse sincronizados.
      priority: parsed.priority,
      complexity: parsed.complexity,
      estimatedMinutes: Number.isFinite(parsed.estimatedMinutes) ? parsed.estimatedMinutes : null,
    }
  } catch {
    // Nunca se pierde lo que escribió la persona.
    return fallback
  }
}

// Interpreta una frase escrita. Devuelve campos listos para createTask.
export async function parseTask({ provider, apiKey, model, input, today }) {
  const text = await callModel({
    provider,
    apiKey,
    model,
    system: TASK_PROMPT,
    messages: [{ role: 'user', content: `Hoy es ${today}. Frase: "${input}"` }],
    maxTokens: 300,
  })
  return parseTaskResponse(text, today, input)
}
```

> Antes de escribir este paso, revisar la firma real de `callModel` en `src/lib/ai.js` y ajustar los nombres de los parámetros (`system`, `messages`, `maxTokens`) a los que la función ya usa. El resto del código no cambia.

- [ ] **Paso 4: Ejecutar las pruebas para verificar que pasan**

```bash
npm test
```

Esperado: los cinco casos de `parseTask.test.js` en verde.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/ai.js tests/lib/parseTask.test.js
git commit -m "feat: interpretacion de tareas escritas en lenguaje natural"
```

---

### Tarea 6: Página de Tareas

**Archivos:**
- Crear: `src/pages/Tasks.jsx`, `src/components/TaskComposer.jsx`, `src/components/TaskItem.jsx`, `src/components/TaskFormDialog.jsx`
- Modificar: `src/App.jsx`, `src/components/Sidebar.jsx`

**Interfaces:**
- Consume: `useTasks()` de la Tarea 4, `parseTask` de la Tarea 5, `resolveModel` de `src/lib/models.js`, `useSettings()`.
- Produce: la página `tasks`, navegable desde la barra lateral. La Tarea 7 le añade el botón de voz.

- [ ] **Paso 1: Crear la fila de tarea**

Crear `src/components/TaskItem.jsx`. Sigue el lenguaje visual existente: superficie de vidrio, badges con color y etiqueta, nunca solo color.

```jsx
import { memo } from 'react'
import Icon from './Icon'
import { PRIORITY_LABELS, COMPLEXITY_LABELS } from '../lib/tasks'

const PRIORITY_STYLES = {
  high: 'text-status-bad',
  medium: 'text-status-moderate',
  low: 'text-white/50',
}

function TaskItem({ task, onToggle, onEdit, onRemove }) {
  const done = task.status === 'done'
  return (
    <li className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
      <button
        onClick={() => onToggle(task.id)}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como completada'}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors ${
          done ? 'bg-status-good/20 ring-status-good/40' : 'ring-white/20 hover:ring-white/40'
        }`}
      >
        {done && <Icon name="check" className="h-4 w-4 text-status-good" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${done ? 'text-white/40 line-through' : 'text-white/90'}`}>
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <span className={PRIORITY_STYLES[task.priority]}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          <span aria-hidden>·</span>
          <span>{COMPLEXITY_LABELS[task.complexity]}</span>
          {task.dueDate && (
            <>
              <span aria-hidden>·</span>
              <span>{task.dueDate}</span>
            </>
          )}
          {task.estimatedMinutes && (
            <>
              <span aria-hidden>·</span>
              <span>{task.estimatedMinutes} min</span>
            </>
          )}
        </div>
      </div>

      <button
        onClick={() => onEdit(task)}
        aria-label="Editar tarea"
        className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <Icon name="settings" className="h-4 w-4" />
      </button>
      <button
        onClick={() => onRemove(task.id)}
        aria-label="Eliminar tarea"
        className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-status-bad"
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </li>
  )
}

export default memo(TaskItem)
```

> **`Icon` usa un mapa explícito y hay que ampliarlo primero.** `src/components/Icon.jsx` define `const MAP = { ... }` y cae a `Activity` ante un nombre desconocido, **sin avisar**: un icono mal nombrado no da error, solo aparece el icono equivocado. `check` ya existe (mapea a `CheckCircle2`), pero **faltan `trash`, `mic`, `check-square` y `bar-chart`**, que usan esta tarea y las Tareas 7 y 9. Antes de escribir los componentes, añadir a la importación de `lucide-react` y al mapa:
>
> ```js
>   trash: Trash2,
>   mic: Mic,
>   'check-square': CheckSquare,
>   'bar-chart': BarChart3,
> ```
>
> con `Trash2`, `Mic`, `CheckSquare` y `BarChart3` añadidos a la lista de importaciones del principio del archivo.

- [ ] **Paso 2: Crear el compositor de tareas**

Crear `src/components/TaskComposer.jsx`. En esta tarea solo entrada de texto; la Tarea 7 añade el micrófono.

```jsx
import { useState } from 'react'
import Icon from './Icon'
import { useSettings } from '../context/SettingsContext'
import { resolveModel } from '../lib/models'
import { parseTask } from '../lib/ai'
import { toDateKey } from '../lib/tasks'

export default function TaskComposer({ onCreate }) {
  const { settings } = useSettings()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return

    setBusy(true)
    const today = toDateKey()
    const active = resolveModel(settings)

    let fields
    if (active.apiKey) {
      try {
        fields = await parseTask({
          provider: active.provider,
          apiKey: active.apiKey,
          model: active.model,
          input: text,
          today,
        })
      } catch {
        fields = null
      }
    }
    // Sin API key o ante cualquier fallo, la tarea se crea igual con el texto tal cual.
    onCreate({ ...(fields || { title: text, dueDate: today }), source: 'text' })

    setInput('')
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
      <Icon name="sparkles" className="h-5 w-5 shrink-0 text-accent-soft" />
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Describe una tarea: «mañana terminar el informe de redes, alta prioridad, 2 horas»"
        aria-label="Nueva tarea"
        className="min-w-0 flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/35"
      />
      <button
        type="submit"
        disabled={!input.trim() || busy}
        className="rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
      >
        {busy ? 'Interpretando…' : 'Agregar'}
      </button>
    </form>
  )
}
```

- [ ] **Paso 3: Crear el formulario manual**

Crear `src/components/TaskFormDialog.jsx`. Es también la red de seguridad cuando no hay API key configurada.

```jsx
import { useState, useEffect, useRef } from 'react'
import { PRIORITY_LABELS, COMPLEXITY_LABELS, toDateKey } from '../lib/tasks'

// Mismas clases que `inputCls` de Settings.jsx, para que los controles del
// diálogo no desentonen con el resto de la aplicación.
const FIELD =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white/90 placeholder-white/30 outline-none transition-colors focus:border-accent/60'

export default function TaskFormDialog({ task, onSave, onClose }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState({
    title: task?.title || '',
    // Al EDITAR se conserva la ausencia de fecha. Poner la de hoy por defecto
    // aquí haría que corregir el título de una tarea sin fecha le asignara una
    // en silencio, cambiando el período al que pertenece sin que nadie lo pida.
    // Al CREAR sí tiene sentido proponer hoy.
    dueDate: task ? task.dueDate || '' : toDateKey(),
    priority: task?.priority || 'medium',
    complexity: task?.complexity || 'shallow',
    estimatedMinutes: task?.estimatedMinutes ?? '',
  })

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function submit(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    onSave({
      ...form,
      title: form.title.trim(),
      dueDate: form.dueDate || null,
      estimatedMinutes: form.estimatedMinutes === '' ? null : Number(form.estimatedMinutes),
      source: 'form',
    })
  }

  // `role="dialog"` con `aria-modal` promete un comportamiento modal: cerrarse
  // con Escape y no dejar que el foco se escape por detrás del overlay. Sin esto
  // los atributos anuncian algo que la interfaz no cumple.
  useEffect(() => {
    const previouslyFocused = document.activeElement

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll(
        'input:not([disabled]), select:not([disabled]), button:not([disabled])'
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Devolver el foco a donde estaba evita que quede perdido al cerrar.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={task ? 'Editar tarea' : 'Nueva tarea'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        ref={dialogRef}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="glass w-full max-w-md space-y-4 rounded-3xl p-6"
      >
        <h2 className="text-lg font-semibold text-white">
          {task ? 'Editar tarea' : 'Nueva tarea'}
        </h2>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Título</span>
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            autoFocus
            className={FIELD}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Fecha objetivo</span>
          <input
            type="date"
            value={form.dueDate || ''}
            onChange={(e) => set('dueDate', e.target.value)}
            className={FIELD}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Prioridad</span>
            <select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              className={FIELD}
            >
              {Object.entries(PRIORITY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Complejidad</span>
            <select
              value={form.complexity}
              onChange={(e) => set('complexity', e.target.value)}
              className={FIELD}
            >
              {Object.entries(COMPLEXITY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Minutos estimados (opcional)</span>
          <input
            type="number"
            min="0"
            value={form.estimatedMinutes}
            onChange={(e) => set('estimatedMinutes', e.target.value)}
            className={FIELD}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-white/60 transition-colors hover:text-white/90"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!form.title.trim()}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-deep active:scale-[0.99] disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
```

La complejidad es el campo que después conecta las tareas con las ventanas de concentración: marcar una tarea como profunda es lo que la hace candidata a ser sugerida.

- [ ] **Paso 4: Crear la página**

Crear `src/pages/Tasks.jsx`:

```jsx
import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import TaskComposer from '../components/TaskComposer'
import TaskItem from '../components/TaskItem'
import TaskFormDialog from '../components/TaskFormDialog'
import { useTasks } from '../context/TasksContext'
import { completionRate, dayRange, tasksInRange, toDateKey } from '../lib/tasks'

export default function Tasks() {
  const { tasks, addTask, updateTask, toggleDone, removeTask } = useTasks()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const today = useMemo(() => {
    const range = dayRange()
    return { range, key: toDateKey() }
  }, [])

  const groups = useMemo(() => {
    const todays = tasksInRange(tasks, today.range)
    const todayIds = new Set(todays.map((t) => t.id))
    return {
      today: todays,
      undated: tasks.filter((t) => !t.dueDate),
      others: tasks.filter((t) => t.dueDate && !todayIds.has(t.id)),
    }
  }, [tasks, today.range])

  const rate = completionRate(groups.today)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tareas"
        subtitle={`Hoy ${today.key} · ${rate.done} de ${rate.total} completadas (${rate.percent} %)`}
      />

      <TaskComposer onCreate={addTask} />

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-white/50 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
        >
          Agregar sin asistente
        </button>
      </div>

      {[
        { label: 'Hoy', items: groups.today },
        { label: 'Otras fechas', items: groups.others },
        { label: 'Sin fecha', items: groups.undated },
      ].map((group) =>
        group.items.length ? (
          <section key={group.label} className="space-y-2">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-white/40">
              {group.label}
            </h2>
            <ul className="space-y-2">
              {group.items.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggle={toggleDone}
                  onEdit={setEditing}
                  onRemove={removeTask}
                />
              ))}
            </ul>
          </section>
        ) : null
      )}

      {!tasks.length && (
        <p className="glass rounded-2xl px-5 py-8 text-center text-sm text-white/45">
          Todavía no hay tareas. Describe una arriba y el asistente la ordenará por ti.
        </p>
      )}

      {(editing || creating) && (
        <TaskFormDialog
          task={editing}
          onSave={(fields) => {
            if (editing) updateTask(editing.id, fields)
            else addTask({ ...fields, source: 'form' })
            setEditing(null)
            setCreating(false)
          }}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Paso 5: Enlazar la navegación**

En `src/components/Sidebar.jsx`, añadir al array `NAV`, tras `history`:

```js
  { id: 'tasks', label: 'Tareas', icon: 'check-square' },
```

En `src/App.jsx`, importar `Tasks` y añadir el render condicional junto a los existentes:

```jsx
            {page === 'tasks' && <Tasks />}
```

- [ ] **Paso 6: Verificar en la aplicación**

```bash
npm run dev
```

Comprobaciones, con una API key configurada:
1. Escribir *"mañana terminar el informe de redes, alta prioridad, como 2 horas, es complejo"* y agregar. La tarea debe aparecer con prioridad Alta, complejidad Profunda, 120 min y fecha de mañana.
2. Marcarla como completada y verificar que se tacha.
3. Cerrar y reabrir la aplicación: la tarea debe seguir ahí. Es la verificación real de la persistencia de la Tarea 3.
4. Quitar la API key en Configuración y agregar otra tarea: debe crearse igualmente con el texto tal cual, sin error visible.

- [ ] **Paso 7: Commit**

```bash
git add src/pages/Tasks.jsx src/components/Task*.jsx src/App.jsx src/components/Sidebar.jsx
git commit -m "feat: pagina de tareas con entrada asistida por IA"
```

---

### Tarea 7: Entrada de tareas por voz

Es el punto de mayor incertidumbre técnica del plan. Se aborda de forma acotada y con una salida definida.

**Archivos:**
- Crear: `src/lib/voice.js`
- Modificar: `src/lib/ai.js`, `src/components/TaskComposer.jsx`, `electron/main.cjs`

**Interfaces:**
- Consume: `parseTaskResponse` de la Tarea 5, `onCreate` del compositor de la Tarea 6.
- Produce: `startRecording()` → `Promise<{ stop: () => Promise<string> }>` donde la cadena es el WAV en base64; `parseTaskFromAudio({ provider, apiKey, model, wavBase64, today })` → `Promise<fields>`.

- [ ] **Paso 1: Conceder el permiso de micrófono en Electron**

Sin esto, `getUserMedia` es rechazado en silencio. En `electron/main.cjs`, dentro de `createWindow()` y tras crear la ventana, añadir:

```js
  // El renderer pide el micrófono para la entrada de tareas por voz. Se conceden
  // solo los permisos de medios; el resto se deniega.
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
```

- [ ] **Paso 2: Verificar que el micrófono es accesible**

Con `npm run dev`, ejecutar en la consola de las herramientas de desarrollo:

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
console.log('pistas de audio:', stream.getAudioTracks().length)
stream.getTracks().forEach((t) => t.stop())
```

Esperado: imprime `pistas de audio: 1`.

**Punto de decisión.** Si aquí falla y no se resuelve con un par de intentos, detenerse y aplicar la degradación definida en el spec 7.2: dejar la voz fuera de esta entrega y continuar con la Tarea 8. Las capas restantes no dependen de la voz.

- [ ] **Paso 3: Implementar la captura y el reencodeo a WAV**

Los modelos aceptan WAV o MP3, no el webm/opus que produce `MediaRecorder`. Se decodifica y se reencoda a PCM de 16 bits, sin dependencias.

Crear `src/lib/voice.js`:

```js
// Captura de audio del micrófono y reencodeo a WAV PCM de 16 bits mono.
// MediaRecorder entrega webm/opus, que los modelos multimodales no aceptan;
// se decodifica con AudioContext y se reconstruye la cabecera WAV a mano.

const TARGET_SAMPLE_RATE = 16000

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

// Construye un WAV mono de 16 bits a partir de muestras en punto flotante.
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // tamaño del bloque fmt
  view.setUint16(20, 1, true) // PCM sin comprimir
  view.setUint16(22, 1, true) // canales
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes por segundo
  view.setUint16(32, 2, true) // alineación de bloque
  view.setUint16(34, 16, true) // bits por muestra
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Inicia la grabación. Devuelve un objeto con stop(), que corta la captura y
// resuelve con el audio ya en WAV codificado en base64.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks = []
  let finished = false

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start()

  // Cierra el micrófono pase lo que pase. Mientras haya una pista viva el
  // sistema muestra el indicador de grabación encendido, así que liberarlas no
  // es una cortesía: es lo que le dice a la persona que ya no se la escucha.
  const releaseMicrophone = () => {
    finished = true
    stream.getTracks().forEach((track) => track.stop())
  }

  return {
    // Aborta sin procesar el audio. Lo usa el componente al desmontarse: sin
    // esto, salir de la página a media grabación dejaba el micrófono abierto
    // indefinidamente, porque las pistas solo se cerraban dentro de `onstop`.
    cancel: () => {
      if (finished) return
      releaseMicrophone()
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        /* ya estaba detenido */
      }
    },
    stop: () =>
      new Promise((resolve, reject) => {
        // Una segunda llamada reasignaba `onstop` y dejaba la primera promesa
        // colgada para siempre. Se rechaza de forma explícita.
        if (finished) {
          reject(new Error('La grabación ya se había detenido.'))
          return
        }
        recorder.onstop = async () => {
          releaseMicrophone()
          let context = null
          try {
            const raw = new Blob(chunks, { type: recorder.mimeType })
            context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
            const decoded = await context.decodeAudioData(await raw.arrayBuffer())
            const wav = encodeWav(decoded.getChannelData(0), decoded.sampleRate)
            resolve(await blobToBase64(wav))
          } catch (err) {
            reject(err)
          } finally {
            // El contexto se cierra también si la decodificación falla.
            if (context) await context.close().catch(() => {})
          }
        }
        recorder.stop()
      }),
  }
}
```

- [ ] **Paso 4: Implementar la llamada al modelo con audio**

Añadir a `src/lib/ai.js`, junto a `parseTask`:

```js
// Interpreta una tarea dictada. Un solo viaje: el modelo transcribe y estructura
// a la vez, reutilizando el contrato de parseTaskResponse.
export async function parseTaskFromAudio({ provider, apiKey, model, wavBase64, today }) {
  if (provider !== 'openrouter') {
    throw new Error('La entrada por voz requiere un modelo de OpenRouter.')
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: 'system', content: TASK_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Hoy es ${today}. Transcribe el audio y conviértelo en la tarea.` },
            { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)
  const body = await res.json()
  const text = body?.choices?.[0]?.message?.content || ''
  return parseTaskResponse(text, today, '')
}
```

- [ ] **Paso 5: Añadir el botón de micrófono al compositor**

En `src/components/TaskComposer.jsx`, añadir las importaciones de `useRef`, `startRecording` y `parseTaskFromAudio`, el estado de grabación y este manejador junto al `submit` existente:

```jsx
  const recorderRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [voiceError, setVoiceError] = useState('')

  async function toggleRecording() {
    setVoiceError('')

    if (!recording) {
      try {
        recorderRef.current = await startRecording()
        setRecording(true)
      } catch {
        setVoiceError('No se pudo acceder al micrófono. Escribe la tarea.')
      }
      return
    }

    setRecording(false)
    setBusy(true)
    try {
      const wavBase64 = await recorderRef.current.stop()
      const active = resolveModel(settings)
      if (!active.apiKey) throw new Error('sin-clave')
      const fields = await parseTaskFromAudio({
        provider: active.provider,
        apiKey: active.apiKey,
        model: active.model,
        wavBase64,
        today: toDateKey(),
      })
      if (!fields.title) throw new Error('sin-transcripcion')
      onCreate({ ...fields, source: 'voice' })
    } catch (err) {
      // Nada se pierde: la persona puede escribir la tarea a continuación. Pero
      // el motivo importa: decir "no se entendió el audio" cuando el problema es
      // la cuenta manda a buscar el fallo donde no está.
      setVoiceError(describeVoiceError(err))
    } finally {
      recorderRef.current = null
      setBusy(false)
    }
  }
```

Y, fuera del componente, la función que traduce el fallo a una causa accionable:

```jsx
// Distingue las causas de fallo de la voz. Cada una se arregla en un sitio
// distinto, así que colapsarlas en un único mensaje deja a la persona sin saber
// dónde mirar. El caso del saldo es real y frecuente: los modelos cobran el
// audio aparte y exigen un mínimo de crédito.
function describeVoiceError(err) {
  const detalle = String(err?.message || '')
  if (detalle.includes('sin-clave')) {
    return 'Falta la API key del modelo. Configúrala en Configuración.'
  }
  if (detalle.includes('requiere un modelo de OpenRouter')) {
    return 'La voz necesita un modelo de OpenRouter. Cámbialo en el selector.'
  }
  if (detalle.includes('402')) {
    return 'Tu cuenta de OpenRouter no tiene saldo suficiente para audio.'
  }
  if (detalle.includes('401') || detalle.includes('403')) {
    return 'La API key fue rechazada. Revísala en Configuración.'
  }
  if (detalle.includes('sin-transcripcion')) {
    return 'No se entendió el dictado. Inténtalo de nuevo o escribe la tarea.'
  }
  return 'No se pudo procesar el audio. Escribe la tarea.'
}
```

Y el botón, antes del botón de envío dentro del formulario:

```jsx
      <button
        type="button"
        onClick={toggleRecording}
        disabled={busy && !recording}
        aria-label={recording ? 'Detener grabación' : 'Dictar tarea'}
        className={`rounded-xl p-2 transition-colors ${
          recording ? 'bg-status-bad/20 text-status-bad' : 'text-white/50 hover:bg-white/5 hover:text-white/90'
        }`}
      >
        <Icon name="mic" className="h-4 w-4" />
      </button>
```

El estado de grabación se comunica con el `aria-label` además del color, para no depender solo del color. Renderizar `voiceError` bajo el formulario cuando exista:

```jsx
      {voiceError && <p className="px-1 pt-1 text-xs text-status-bad">{voiceError}</p>}
```

Y una limpieza al desmontar, para que salir de la página a media grabación no deje el micrófono abierto:

```jsx
  useEffect(() => () => recorderRef.current?.cancel?.(), [])
```

Requiere añadir `useEffect` a la importación de React del componente.

- [ ] **Paso 6: Verificar de extremo a extremo**

Con `npm run dev`, pulsar el micrófono, dictar *"mañana revisar el informe de redes, es complejo, como una hora"* y detener.

Esperado: se crea la tarea con el título transcrito, complejidad profunda, 60 minutos y fecha de mañana.

Si el modelo rechaza el audio, comprobar en `src/lib/models.js` que el modelo activo lo admite; `google/gemini-2.5-flash` sí. Si el formato es rechazado, es la señal para aplicar la degradación del spec 7.2.

- [ ] **Paso 7: Commit**

```bash
git add src/lib/voice.js src/lib/ai.js src/components/TaskComposer.jsx electron/main.cjs
git commit -m "feat: entrada de tareas por voz con transcripcion e interpretacion en un paso"
```

---

### Tarea 8: Índice de entorno y armado del reporte

**Archivos:**
- Crear: `src/lib/report.js`, `tests/lib/report.test.js`

**Interfaces:**
- Consume: `classify` y `WATCH_KEYS` de `sensors.js`, `completionRate` y `tasksInRange` de la Tarea 4.
- Produce: `environmentIndex(values, disabled)` → `number|null`; `averageSeries(series, disabled)` → `{ key: number }`; `levelAt(series, ts)` → `string`; `buildReport({ tasks, series, focusWindows, range, disabled })` → objeto de reporte. Los usa la Tarea 9.

- [ ] **Paso 1: Escribir las pruebas**

Crear `tests/lib/report.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { environmentIndex, averageSeries, levelAt, buildReport } from '../../src/lib/report.js'

// getTimeseries devuelve los valores como cadena de texto: se replica aquí.
const series = {
  temperatura: [
    { ts: 1000, value: '22' },
    { ts: 2000, value: '24' },
  ],
  ruido: [
    { ts: 1000, value: '45' },
    { ts: 2000, value: '75' },
  ],
}

describe('environmentIndex', () => {
  it('puntúa un entorno enteramente bueno como cien', () => {
    expect(environmentIndex({ temperatura: 22, humedad: 50, ruido: 40 })).toBe(100)
  })

  it('promedia niveles mixtos', () => {
    // temperatura 22 es good (100), ruido 75 es bad (33) → media 66.5 → 67
    expect(environmentIndex({ temperatura: 22, ruido: 75 })).toBe(67)
  })

  it('ignora los sensores deshabilitados', () => {
    expect(environmentIndex({ temperatura: 22, ruido: 75 }, ['ruido'])).toBe(100)
  })

  it('devuelve null sin datos, para no confundirse con cero', () => {
    expect(environmentIndex({})).toBeNull()
    expect(environmentIndex({ temperatura: 22 }, ['temperatura'])).toBeNull()
  })
})

describe('averageSeries', () => {
  it('promedia convirtiendo las cadenas a número', () => {
    expect(averageSeries(series)).toEqual({ temperatura: 23, ruido: 60 })
  })

  it('omite los sensores deshabilitados', () => {
    expect(averageSeries(series, ['ruido'])).toEqual({ temperatura: 23 })
  })
})

describe('levelAt', () => {
  it('clasifica usando el punto más cercano en el tiempo', () => {
    expect(levelAt(series, 1100)).toBe('good') // temp 22 + ruido 45
  })

  it('usa el punto posterior cuando está más cerca', () => {
    expect(levelAt(series, 1900)).toBe('moderate') // temp 24 (good) + ruido 75 (bad)
  })

  it('devuelve unknown si no hay serie', () => {
    expect(levelAt({}, 1000)).toBe('unknown')
  })
})

describe('buildReport', () => {
  const range = { start: 0, end: 10000 }

  it('reporta cumplimiento, entorno y ventanas', () => {
    const tasks = [
      { id: 'a', title: 'A', dueDate: '2026-09-02', status: 'done', completedAt: 1000 },
      { id: 'b', title: 'B', dueDate: '2026-09-02', status: 'pending', completedAt: null },
    ]
    const report = buildReport({
      tasks,
      series,
      focusWindows: [{ startTs: 0, endTs: 1000, durationMinutes: 30 }],
      range,
      disabled: [],
    })
    expect(report.completion.percent).toBe(50)
    expect(report.focus).toEqual({ count: 1, totalMinutes: 30 })
    expect(report.environment.index).toBeGreaterThan(0)
  })

  it('agrupa las tareas completadas por el nivel de entorno del momento', () => {
    const tasks = [{ id: 'a', title: 'A', dueDate: '2026-09-02', status: 'done', completedAt: 1000 }]
    const report = buildReport({ tasks, series, focusWindows: [], range, disabled: [] })
    expect(report.pattern.byLevel.good).toBe(1)
    expect(report.pattern.headline).toContain('1 de 1')
  })

  it('no afirma un patrón sin tareas completadas', () => {
    const report = buildReport({ tasks: [], series, focusWindows: [], range, disabled: [] })
    expect(report.pattern.headline).toMatch(/sin tareas completadas/i)
  })
})
```

- [ ] **Paso 2: Ejecutar para verificar que falla**

```bash
npm test tests/lib/report.test.js
```

Esperado: FALLA por no poder resolver `src/lib/report.js`.

- [ ] **Paso 3: Implementar el módulo de reporte**

Crear `src/lib/report.js`:

```js
// Cálculo del reporte de rendimiento: cumplimiento de tareas, calidad del
// entorno y el patrón que las relaciona. Todo puro y sin dependencias de React.
import { classify, LEVELS, WATCH_KEYS } from './sensors'
import { completionRate } from './tasks'

// Puntuación de cada nivel para promediar la calidad del entorno.
export const LEVEL_SCORE = { good: 100, moderate: 66, bad: 33, severe: 0 }

function activeKeys(disabled = []) {
  return WATCH_KEYS.filter((key) => !disabled.includes(key))
}

// Índice 0–100. Devuelve null si no hay ningún sensor con dato: un entorno sin
// medir no es lo mismo que un entorno pésimo.
export function environmentIndex(values, disabled = []) {
  const scores = []
  for (const key of activeKeys(disabled)) {
    const value = values?.[key]
    if (value == null || Number.isNaN(Number(value))) continue
    const level = classify(key, Number(value))
    const score = LEVEL_SCORE[level.id]
    if (score != null) scores.push(score)
  }
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// getTimeseries entrega { key: [{ ts, value }] } con value como cadena.
export function averageSeries(series, disabled = []) {
  const out = {}
  for (const key of activeKeys(disabled)) {
    const points = series?.[key]
    if (!points?.length) continue
    const numbers = points.map((p) => Number(p.value)).filter((n) => !Number.isNaN(n))
    if (!numbers.length) continue
    out[key] = Number((numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(2))
  }
  return out
}

// Nivel del entorno en un instante dado, tomando de cada serie el punto más
// cercano en el tiempo. Es lo que permite situar una tarea completada.
export function levelAt(series, ts, disabled = []) {
  const values = {}
  for (const key of activeKeys(disabled)) {
    const points = series?.[key]
    if (!points?.length) continue
    let closest = points[0]
    for (const point of points) {
      if (Math.abs(point.ts - ts) < Math.abs(closest.ts - ts)) closest = point
    }
    values[key] = Number(closest.value)
  }
  const index = environmentIndex(values, disabled)
  if (index == null) return 'unknown'
  if (index >= 84) return 'good'
  if (index >= 50) return 'moderate'
  if (index >= 17) return 'bad'
  return 'severe'
}

// Se denomina "patrón observado" y no "correlación": con días o semanas de datos
// no hay muestra suficiente para sostener una afirmación estadística.
function buildPattern(completed, series, disabled) {
  const byLevel = { good: 0, moderate: 0, bad: 0, severe: 0, unknown: 0 }
  for (const task of completed) {
    byLevel[levelAt(series, task.completedAt, disabled)] += 1
  }

  if (!completed.length) {
    return { byLevel, headline: 'Sin tareas completadas en este período.' }
  }

  const [topLevel, count] = Object.entries(byLevel).sort((a, b) => b[1] - a[1])[0]
  const label = LEVELS[topLevel]?.label || 'desconocido'
  return {
    byLevel,
    headline: `Completaste ${count} de ${completed.length} tareas con el entorno en nivel ${label}.`,
  }
}

export function buildReport({ tasks, series, focusWindows = [], range, disabled = [] }) {
  const completed = tasks.filter((task) => task.status === 'done' && task.completedAt != null)
  const average = averageSeries(series, disabled)
  const windowsInRange = focusWindows.filter(
    (w) => w.startTs >= range.start && w.startTs <= range.end
  )

  return {
    range,
    completion: completionRate(tasks),
    environment: {
      index: environmentIndex(average, disabled),
      average,
    },
    pattern: buildPattern(completed, series, disabled),
    focus: {
      count: windowsInRange.length,
      totalMinutes: windowsInRange.reduce((sum, w) => sum + (w.durationMinutes || 0), 0),
    },
  }
}
```

- [ ] **Paso 4: Ejecutar las pruebas para verificar que pasan**

```bash
npm test
```

Esperado: todos los casos de `report.test.js` en verde. Si el caso de niveles mixtos no cuadra, revisar los umbrales de `levelAt` contra `LEVEL_SCORE` antes de tocar la prueba: la prueba expresa la intención del diseño.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/report.js tests/lib/report.test.js
git commit -m "feat: calculo del indice de entorno y del reporte de rendimiento"
```

---

### Tarea 9: Página de Reportes

**Archivos:**
- Crear: `src/pages/Reports.jsx`, `src/components/ReportSummary.jsx`
- Modificar: `src/App.jsx`, `src/components/Sidebar.jsx`, `src/lib/ai.js`

**Interfaces:**
- Consume: `buildReport` de la Tarea 8, `useTasks()` de la Tarea 4, `getTimeseries` de `src/lib/thingsboard.js`, `useSettings()`.
- Produce: la página `reports`, y `summarizeReport({ provider, apiKey, model, report })` → `Promise<string>` en `ai.js`.

- [ ] **Paso 1: Crear el resumen visual**

Crear `src/components/ReportSummary.jsx`:

```jsx
import { LEVELS } from '../lib/sensors'

// Traduce el índice 0–100 a un nivel, con los mismos cortes que levelAt.
function indexLevel(index) {
  if (index == null) return LEVELS.unknown
  if (index >= 84) return LEVELS.good
  if (index >= 50) return LEVELS.moderate
  if (index >= 17) return LEVELS.bad
  return LEVELS.severe
}

function StatCard({ label, value, caption, color }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-semibold tnum" style={color ? { color } : undefined}>
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-white/45">{caption}</p>}
    </div>
  )
}

export default function ReportSummary({ report }) {
  const { completion, environment, focus, pattern } = report
  const level = indexLevel(environment.index)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Cumplimiento"
          value={`${completion.percent} %`}
          caption={`${completion.done} de ${completion.total} tareas`}
        />
        <StatCard
          label="Índice de entorno"
          // Sin datos no es lo mismo que un entorno pésimo: nunca se muestra 0.
          value={environment.index == null ? 'Sin datos' : environment.index}
          caption={level.label}
          color={environment.index == null ? undefined : level.color}
        />
        <StatCard
          label="Concentración"
          value={focus.count}
          caption={`${focus.totalMinutes} min en total`}
        />
      </div>

      <div className="glass rounded-2xl px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-white/40">Patrón observado</p>
        <p className="mt-2 text-sm text-white/85">{pattern.headline}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">
          Patrón observado sobre las tareas del período. No constituye una correlación
          estadística: la cantidad de datos no lo permite.
        </p>
      </div>
    </div>
  )
}
```

El índice se acompaña siempre de su etiqueta de texto, nunca solo del color, siguiendo el criterio de accesibilidad ya establecido en `StatusBadge`.

- [ ] **Paso 2: Crear la página**

Crear `src/pages/Reports.jsx`:

```jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import NotConfigured from '../components/NotConfigured'
import ReportSummary from '../components/ReportSummary'
import Markdown from '../components/Markdown'
import { useSettings } from '../context/SettingsContext'
import { useTasks } from '../context/TasksContext'
import { getTimeseries } from '../lib/thingsboard'
import { WATCH_KEYS } from '../lib/sensors'
import { buildReport } from '../lib/report'
import { dayRange, weekRange, tasksInRange } from '../lib/tasks'
import { resolveModel } from '../lib/models'
import { summarizeReport } from '../lib/ai'

const PERIODS = [
  { id: 'today', label: 'Hoy', range: dayRange },
  { id: 'week', label: 'Esta semana', range: weekRange },
]

export default function Reports({ onNavigate }) {
  const { settings, isConfigured } = useSettings()
  const { tasks, focusWindows } = useTasks()
  const [period, setPeriod] = useState('today')
  const [series, setSeries] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const range = useMemo(
    () => PERIODS.find((p) => p.id === period).range(new Date()),
    [period]
  )

  useEffect(() => {
    if (!isConfigured) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        // Mismo cálculo de cubos que la página de Historial: el servidor agrega
        // a lo largo de toda la ventana en vez de devolver solo el final.
        const interval = Math.max(1000, Math.round((range.end - range.start) / 600))
        const data = await getTimeseries(
          settings.tbHost,
          settings.jwt,
          settings.deviceId,
          WATCH_KEYS,
          range.start,
          range.end,
          { agg: 'AVG', interval }
        )
        if (!cancelled) setSeries(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isConfigured, range, settings])

  // El resumen deja de corresponder al cambiar de período.
  useEffect(() => setSummary(''), [period])

  const report = useMemo(
    () =>
      buildReport({
        tasks: tasksInRange(tasks, range),
        series,
        focusWindows,
        range,
        disabled: settings.disabledSensors || [],
      }),
    [tasks, series, focusWindows, range, settings.disabledSensors]
  )

  const requestSummary = useCallback(async () => {
    const active = resolveModel(settings)
    if (!active.apiKey) {
      setSummary(
        `Cumpliste el ${report.completion.percent} % de tus tareas (${report.completion.done} de ${report.completion.total}). ${report.pattern.headline}`
      )
      return
    }
    setSummarizing(true)
    try {
      setSummary(
        await summarizeReport({
          provider: active.provider,
          apiKey: active.apiKey,
          model: active.model,
          report,
        })
      )
    } catch {
      // Respaldo con las mismas cifras, sin depender del modelo.
      setSummary(
        `Cumpliste el ${report.completion.percent} % de tus tareas (${report.completion.done} de ${report.completion.total}). ${report.pattern.headline}`
      )
    } finally {
      setSummarizing(false)
    }
  }, [settings, report])

  if (!isConfigured) {
    return (
      <div>
        <PageHeader title="Reportes" subtitle="Conecta con ThingsBoard para ver tu rendimiento" />
        <NotConfigured onConfigure={() => onNavigate('settings')} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reportes" subtitle="Cumplimiento de tareas y calidad del entorno">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            aria-pressed={period === p.id}
            className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
              period === p.id
                ? 'bg-white/[0.10] text-white ring-1 ring-white/10'
                : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90'
            }`}
          >
            {p.label}
          </button>
        ))}
      </PageHeader>

      {error && (
        <p className="glass rounded-2xl px-5 py-4 text-sm text-status-bad">{error}</p>
      )}

      {loading ? (
        <div className="glass h-48 animate-shimmer rounded-2xl" />
      ) : (
        <ReportSummary report={report} />
      )}

      <div className="space-y-3">
        <button
          onClick={requestSummary}
          disabled={summarizing || loading}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
        >
          {summarizing ? 'Analizando…' : 'Resumen del asistente'}
        </button>
        {summary && (
          <div className="glass rounded-2xl px-5 py-4 text-sm text-white/80">
            <Markdown text={summary} />
          </div>
        )}
      </div>
    </div>
  )
}
```

> `Markdown` recibe el texto por la prop `text` (`Markdown({ text, className })`), no como `children`. Verificado en `src/components/Markdown.jsx:16`.

- [ ] **Paso 3: Añadir el resumen por IA**

Añadir a `src/lib/ai.js`:

```js
// Resumen en lenguaje natural del reporte ya calculado. La IA no calcula nada:
// solo redacta a partir de las cifras que se le entregan.
export async function summarizeReport({ provider, apiKey, model, report }) {
  const lines = [
    `Cumplimiento: ${report.completion.done} de ${report.completion.total} tareas (${report.completion.percent} %).`,
    `Índice de entorno: ${report.environment.index ?? 'sin datos'}.`,
    `Promedios: ${Object.entries(report.environment.average)
      .map(([key, value]) => `${key} ${value}`)
      .join(', ')}.`,
    `Ventanas de concentración: ${report.focus.count} (${report.focus.totalMinutes} min).`,
    `Patrón observado: ${report.pattern.headline}`,
  ].join('\n')

  return callModel({
    provider,
    apiKey,
    model,
    system: `${SYSTEM_PROMPT}

Además de tu ámbito habitual, puedes comentar el rendimiento de la persona en sus tareas cuando se te entregue un reporte ya calculado. Redacta de dos a tres conclusiones breves en español, relacionando el ambiente con el cumplimiento. No inventes cifras que no estén en el reporte y no afirmes causalidad: los datos solo muestran coincidencia.`,
    messages: [{ role: 'user', content: lines }],
    maxTokens: 400,
  })
}
```

El `SYSTEM_PROMPT` se extiende en lugar de reemplazarse, para que el guardarraíl de alcance del asistente siga vigente.

- [ ] **Paso 4: Enlazar la navegación**

En `src/components/Sidebar.jsx`, tras el ítem `tasks`:

```js
  { id: 'reports', label: 'Reportes', icon: 'bar-chart' },
```

En `src/App.jsx`, importar `Reports` y añadir el render condicional. La página necesita `onNavigate` para poder llevar a Configuración cuando no hay conexión:

```jsx
            {page === 'reports' && <Reports onNavigate={setPage} />}
```

- [ ] **Paso 5: Verificar con datos reales**

```bash
npm run simulate -- --escenario=jornada --acelerado=120 --ciclos=1680
```

(1680 ciclos a 6 min por tick cubren los 7 días que necesita el reporte semanal.)

Después, en la aplicación: crear tres o cuatro tareas con fecha de hoy, completar algunas, y abrir Reportes.

Esperado: el porcentaje de cumplimiento coincide con lo marcado; el índice de entorno muestra un número coherente con lo que se ve en Historial; el patrón menciona el nivel dominante; el resumen del asistente redacta conclusiones sin inventar cifras.

- [ ] **Paso 6: Commit**

```bash
git add src/pages/Reports.jsx src/components/ReportSummary.jsx src/App.jsx src/components/Sidebar.jsx src/lib/ai.js
git commit -m "feat: pagina de reportes de rendimiento con resumen del asistente"
```

---

### Tarea 10: Máquina de estados de las ventanas de concentración

**Archivos:**
- Crear: `src/lib/focus.js`, `tests/lib/focus.test.js`

**Interfaces:**
- Consume: `classify` y `WATCH_KEYS` de `sensors.js`.
- Produce: `isOptimal(values, presence, disabled)` → `boolean`; `INITIAL_FOCUS_STATE`; `nextFocusState(state, { now, optimal })` → `{ state, notify, closedWindow }`; `FOCUS_HOLD_MS`, `FOCUS_COOLDOWN_MS`. Los usa la Tarea 11.

- [ ] **Paso 1: Escribir las pruebas**

Crear `tests/lib/focus.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  isOptimal,
  nextFocusState,
  INITIAL_FOCUS_STATE,
  FOCUS_HOLD_MS,
  FOCUS_COOLDOWN_MS,
} from '../../src/lib/focus.js'

const GOOD = { temperatura: 22, humedad: 50, luz: 65, ruido: 42, pm25: 5, pm1: 4, pm10: 10 }

describe('isOptimal', () => {
  it('es verdadero con presencia y todos los sensores en nivel bueno', () => {
    expect(isOptimal(GOOD, true, [])).toBe(true)
  })

  it('es falso sin presencia', () => {
    expect(isOptimal(GOOD, false, [])).toBe(false)
  })

  it('es falso si un sensor no está en nivel bueno', () => {
    expect(isOptimal({ ...GOOD, ruido: 75 }, true, [])).toBe(false)
  })

  it('ignora los sensores deshabilitados', () => {
    expect(isOptimal({ ...GOOD, ruido: 75 }, true, ['ruido'])).toBe(true)
  })

  it('es falso si todos los sensores están deshabilitados, en vez de cumplirse en vacío', () => {
    const all = ['temperatura', 'humedad', 'luz', 'ruido', 'pm25', 'pm1', 'pm10']
    expect(isOptimal(GOOD, true, all)).toBe(false)
  })

  it('es falso si no hay ningún dato', () => {
    expect(isOptimal({}, true, [])).toBe(false)
  })
})

describe('nextFocusState', () => {
  it('pasa de reposo a acumulando al cumplirse la condición', () => {
    const { state } = nextFocusState(INITIAL_FOCUS_STATE, { now: 1000, optimal: true })
    expect(state.phase).toBe('building')
    expect(state.since).toBe(1000)
  })

  it('no notifica antes de completar el tiempo de sostenimiento', () => {
    const building = { phase: 'building', since: 0, lastNotifyTs: 0 }
    const { state, notify } = nextFocusState(building, { now: FOCUS_HOLD_MS - 1, optimal: true })
    expect(state.phase).toBe('building')
    expect(notify).toBe(false)
  })

  it('activa y notifica al sostenerse el tiempo requerido', () => {
    const building = { phase: 'building', since: 0, lastNotifyTs: 0 }
    const { state, notify } = nextFocusState(building, { now: FOCUS_HOLD_MS, optimal: true })
    expect(state.phase).toBe('active')
    expect(notify).toBe(true)
    expect(state.lastNotifyTs).toBe(FOCUS_HOLD_MS)
  })

  it('activa sin notificar si el enfriamiento sigue vigente', () => {
    const building = { phase: 'building', since: FOCUS_HOLD_MS, lastNotifyTs: FOCUS_HOLD_MS }
    const now = FOCUS_HOLD_MS * 2
    const { state, notify } = nextFocusState(building, { now, optimal: true })
    expect(state.phase).toBe('active')
    expect(notify).toBe(false)
  })

  it('vuelve a notificar pasado el enfriamiento', () => {
    const now = FOCUS_COOLDOWN_MS + FOCUS_HOLD_MS + 1
    const building = { phase: 'building', since: now - FOCUS_HOLD_MS, lastNotifyTs: 1 }
    expect(nextFocusState(building, { now, optimal: true }).notify).toBe(true)
  })

  it('cierra y registra la ventana al romperse la condición estando activa', () => {
    const active = { phase: 'active', since: 0, lastNotifyTs: 0 }
    const now = 30 * 60 * 1000
    const { state, closedWindow } = nextFocusState(active, { now, optimal: false })
    expect(state.phase).toBe('idle')
    expect(closedWindow).toEqual({ startTs: 0, endTs: now, durationMinutes: 30 })
  })

  it('no registra nada si la condición se rompe mientras acumulaba', () => {
    const building = { phase: 'building', since: 0, lastNotifyTs: 0 }
    const { state, closedWindow } = nextFocusState(building, { now: 1000, optimal: false })
    expect(state.phase).toBe('idle')
    expect(closedWindow).toBeNull()
  })

  it('se mantiene en reposo si la condición nunca se cumple', () => {
    const { state, notify, closedWindow } = nextFocusState(INITIAL_FOCUS_STATE, {
      now: 5000,
      optimal: false,
    })
    expect(state.phase).toBe('idle')
    expect(notify).toBe(false)
    expect(closedWindow).toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar para verificar que falla**

```bash
npm test tests/lib/focus.test.js
```

Esperado: FALLA por no poder resolver `src/lib/focus.js`.

- [ ] **Paso 3: Implementar la máquina de estados**

Crear `src/lib/focus.js`:

```js
// Detección de ventanas de concentración profunda. Se separa de las alertas
// porque la naturaleza del disparo es distinta: las alertas reaccionan a una
// transición de nivel, esto reacciona a una condición sostenida en el tiempo.
import { classify, WATCH_KEYS } from './sensors'

// El umbral se mide en tiempo transcurrido, no en número de muestras, para no
// depender de la cadencia de publicación del dispositivo.
export const FOCUS_HOLD_MS = 10 * 60 * 1000
export const FOCUS_COOLDOWN_MS = 60 * 60 * 1000

export const INITIAL_FOCUS_STATE = { phase: 'idle', since: null, lastNotifyTs: 0 }

// Entorno óptimo: hay alguien presente y todos los sensores vigilados que estén
// habilitados y tengan dato se clasifican como buenos. Se exige al menos un
// sensor con dato para que deshabilitarlos todos no cumpla la condición en vacío.
export function isOptimal(values, presence, disabled = []) {
  if (presence !== true) return false

  let measured = 0
  for (const key of WATCH_KEYS) {
    if (disabled.includes(key)) continue
    const value = values?.[key]
    if (value == null || Number.isNaN(Number(value))) continue
    measured += 1
    if (classify(key, Number(value)).id !== 'good') return false
  }
  return measured > 0
}

// Transición pura. Devuelve el estado siguiente y los efectos que el contexto
// debe ejecutar: notificar y registrar la ventana que acaba de cerrarse.
export function nextFocusState(state, { now, optimal }) {
  const none = { state, notify: false, closedWindow: null }

  if (optimal) {
    if (state.phase === 'idle') {
      return { state: { ...state, phase: 'building', since: now }, notify: false, closedWindow: null }
    }
    if (state.phase === 'building') {
      if (now - state.since < FOCUS_HOLD_MS) return none
      // Se activa igualmente durante el enfriamiento: así la ventana queda
      // registrada para el reporte aunque no se avise a la persona.
      // `lastNotifyTs === 0` significa "nunca se ha notificado" y debe avisar sin
      // exigir el enfriamiento. Sin ese caso explícito, la resta funcionaría por
      // accidente con marcas de tiempo reales (epoch, del orden de 1,8e12) pero
      // no con las pequeñas de las pruebas, escondiendo la intención del diseño
      // detrás de la magnitud de los números.
      const notify = state.lastNotifyTs === 0 || now - state.lastNotifyTs >= FOCUS_COOLDOWN_MS
      return {
        state: { ...state, phase: 'active', lastNotifyTs: notify ? now : state.lastNotifyTs },
        notify,
        closedWindow: null,
      }
    }
    return none
  }

  if (state.phase === 'active') {
    return {
      state: { ...state, phase: 'idle', since: null },
      notify: false,
      closedWindow: {
        startTs: state.since,
        endTs: now,
        durationMinutes: Math.round((now - state.since) / 60000),
      },
    }
  }

  if (state.phase === 'building') {
    return { state: { ...state, phase: 'idle', since: null }, notify: false, closedWindow: null }
  }

  return none
}
```

- [ ] **Paso 4: Ejecutar las pruebas para verificar que pasan**

```bash
npm test
```

Esperado: los quince casos de `focus.test.js` en verde, y el resto de la batería sin regresiones.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/focus.js tests/lib/focus.test.js
git commit -m "feat: maquina de estados de las ventanas de concentracion"
```

---

### Tarea 11: Contexto de concentración, notificación y ajuste

**Archivos:**
- Crear: `src/context/FocusContext.jsx`
- Modificar: `src/main.jsx`, `src/context/SettingsContext.jsx`, `src/pages/Settings.jsx`

**Interfaces:**
- Consume: `nextFocusState` e `isOptimal` de la Tarea 10, `useTelemetry()`, `useTasks()` y `nextDeepTask` de la Tarea 4.
- Produce: `useFocus()` → `{ phase, currentWindowStart }`, y el registro de ventanas en el almacén.

- [ ] **Paso 1: Añadir el ajuste de configuración**

En `src/context/SettingsContext.jsx`, añadir el campo a los valores por defecto, junto a `alertsEnabled`:

```js
  focusEnabled: true,
```

- [ ] **Paso 2: Implementar el contexto**

Crear `src/context/FocusContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react'
import { useTelemetry } from './TelemetryContext'
import { useSettings } from './SettingsContext'
import { useTasks } from './TasksContext'
import { isOptimal, nextFocusState, INITIAL_FOCUS_STATE } from '../lib/focus'
import { nextDeepTask } from '../lib/tasks'

const FocusContext = createContext(null)

// La condición se evalúa también por reloj, no solo cuando llega telemetría:
// el umbral es temporal y debe cumplirse aunque los valores no cambien.
const TICK_MS = 15000

export function FocusProvider({ children }) {
  const { values, presence } = useTelemetry()
  const { settings } = useSettings()
  const { tasks, addFocusWindow } = useTasks()
  const [phase, setPhase] = useState('idle')

  const stateRef = useRef(INITIAL_FOCUS_STATE)
  // Se leen por referencia para que el intervalo no se reinicie en cada render.
  const latest = useRef({ values, presence, tasks, settings })
  latest.current = { values, presence, tasks, settings }

  useEffect(() => {
    function evaluate() {
      const { values, presence, tasks, settings } = latest.current
      if (settings.focusEnabled === false) return

      const optimal = isOptimal(values, presence, settings.disabledSensors || [])
      const result = nextFocusState(stateRef.current, { now: Date.now(), optimal })
      stateRef.current = result.state
      setPhase(result.state.phase)

      if (result.notify) {
        const suggestion = nextDeepTask(tasks)
        const body = suggestion
          ? `Tu entorno lleva 10 minutos en condiciones óptimas. Buen momento para: «${suggestion.title}».`
          : 'Tu entorno lleva 10 minutos en condiciones óptimas. Buen momento para una tarea que exija concentración.'
        try {
          window.electronAPI?.notify?.('Ventana de concentración detectada', body)
        } catch {
          /* notificaciones no disponibles */
        }
      }

      if (result.closedWindow) {
        addFocusWindow({ id: crypto.randomUUID(), ...result.closedWindow })
      }
    }

    evaluate()
    const timer = setInterval(evaluate, TICK_MS)
    return () => clearInterval(timer)
  }, [addFocusWindow])

  const value = useMemo(
    () => ({ phase, currentWindowStart: stateRef.current.since }),
    [phase]
  )

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within FocusProvider')
  return ctx
}
```

- [ ] **Paso 3: Añadir el provider al árbol**

En `src/main.jsx`, anidar `FocusProvider` como el más interno:

```jsx
<SettingsProvider>
  <TelemetryProvider>
    <TasksProvider>
      <AlertsProvider>
        <FocusProvider>
          <App />
        </FocusProvider>
      </AlertsProvider>
    </TasksProvider>
  </TelemetryProvider>
</SettingsProvider>
```

- [ ] **Paso 4: Añadir el interruptor a Configuración**

En `src/pages/Settings.jsx`, junto al interruptor de alertas existente (alrededor de la línea 174), añadir el de concentración.

**Importante:** la página no escribe en los ajustes directamente. Mantiene un estado local `form` (`const [form, setForm] = useState(settings)`, línea 47) y lo vuelca con `update({ ...form, ... })` al enviar (línea 82). El interruptor nuevo debe seguir ese mismo patrón, **no** llamar a `update` por su cuenta:

```jsx
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/90">Ventanas de concentración</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
                    Avisa cuando tu entorno lleve 10 minutos en condiciones óptimas y te
                    sugiere una tarea que exija concentración.
                  </p>
                </div>
                <Toggle
                  checked={form.focusEnabled !== false}
                  onChange={() => setForm((f) => ({ ...f, focusEnabled: f.focusEnabled === false }))}
                />
              </div>
```

Copiar las clases exactas del bloque de alertas contiguo para que ambos queden idénticos.

- [ ] **Paso 5: Verificar el disparo**

Para no esperar diez minutos, bajar temporalmente `FOCUS_HOLD_MS` a `30 * 1000` en `src/lib/focus.js` y ejecutar:

```bash
npm run simulate -- --escenario=optimo
```

Con al menos una tarea pendiente de complejidad profunda creada.

Esperado: a los treinta segundos aparece la notificación nativa nombrando esa tarea. Después, cambiar a `--escenario=critico`: la condición se rompe y la ventana queda registrada.

**Restaurar `FOCUS_HOLD_MS` a `10 * 60 * 1000` antes de commitear** y volver a ejecutar `npm test` para confirmar que las pruebas siguen pasando con el valor real.

- [ ] **Paso 6: Verificar que la ventana llega al reporte**

Abrir Reportes con período Hoy.

Esperado: la tarjeta de ventanas de concentración muestra al menos una, con su duración en minutos.

- [ ] **Paso 7: Commit**

```bash
git add src/context/FocusContext.jsx src/main.jsx src/context/SettingsContext.jsx src/pages/Settings.jsx src/lib/focus.js
git commit -m "feat: deteccion de ventanas de concentracion con notificacion y ajuste propio"
```

---

### Tarea 12: Documentación y bóveda de Obsidian

**Archivos:**
- Modificar: `README.md`
- Crear en `/home/gsm/Documents/Vaults/DeskSense/`: `05 Funcionalidades/Tareas.md`, `05 Funcionalidades/Reportes de Rendimiento.md`, `05 Funcionalidades/Ventanas de Concentración.md`, `07 Proyecto/Simulador de Telemetría.md`, `07 Proyecto/Compatibilidad Linux.md`
- Modificar en la bóveda: `DeskSense MOC.md`, `06 Código/Contextos - Estado React.md`, `06 Código/Componentes y Estructura del Código.md`, `07 Proyecto/Roadmap y Mejoras Futuras.md`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: el contexto que usarán las sesiones futuras de trabajo sobre este proyecto.

- [ ] **Paso 1: Verificar la batería completa**

```bash
npm test && npm run build
```

Esperado: todas las pruebas en verde y compilación sin error.

- [ ] **Paso 2: Actualizar el README**

Añadir una sección que describa las tres funcionalidades nuevas y documente el simulador con sus escenarios y banderas, incluyendo el ejemplo de generación de historial acelerado.

- [ ] **Paso 3: Escribir las notas de la bóveda**

Cada nota sigue el formato de las existentes: frontmatter con `tags`, un enlace de vuelta a `[[DeskSense MOC]]`, la ruta del archivo relevante y enlaces cruzados con doble corchete a las notas relacionadas. **Se escriben en español.**

Contenido mínimo de cada una:

- **Tareas:** modelo de datos, los tres caminos de entrada, el respaldo determinista del parseo y por qué `parseTask` necesita un prompt propio distinto del `SYSTEM_PROMPT`.
- **Reportes de Rendimiento:** definición de los períodos, fórmula del índice de entorno, y la razón de llamarlo patrón observado y no correlación.
- **Ventanas de Concentración:** la máquina de estados, el umbral y el enfriamiento, y por qué vive separada del sistema de alertas.
- **Simulador de Telemetría:** escenarios, banderas, resolución del token y cómo el envío de `ts` propio corrige el desfase horario.
- **Compatibilidad Linux:** los problemas de npm 11 y del instalador de Electron, el empaquetado AppImage y la ausencia de identidad de Git en el equipo nuevo.

- [ ] **Paso 4: Actualizar el MOC y las notas afectadas**

En `DeskSense MOC.md`, añadir las notas nuevas a las secciones "Funcionalidades" y "Proyecto".

En `Contextos - Estado React.md`, actualizar el diagrama de providers al nuevo orden con `Tasks` y `Focus`, explicando por qué `Tasks` precede a `Focus`.

En `Componentes y Estructura del Código.md`, añadir los archivos nuevos al árbol y los componentes nuevos a la tabla.

En `Roadmap y Mejoras Futuras.md`, marcar como resuelto el desfase horario en el caso del simulador y dejar constancia de que el firmware sigue pendiente de enviar su propio `ts`.

- [ ] **Paso 5: Commit e integración**

```bash
git add README.md
git commit -m "docs: documenta tareas, reportes, ventanas de concentracion y simulador"

git checkout develop
git merge --no-ff feature/tareas-y-reportes -m "Merge: tareas, reportes de rendimiento y ventanas de concentracion"
npm test && npm run build
```

Esperado: el merge se completa, las pruebas pasan y la aplicación compila sobre `develop`. La bóveda no se versiona en este repositorio: vive en `/home/gsm/Documents/Vaults/DeskSense`.
