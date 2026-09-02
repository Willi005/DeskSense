# DeskSense — Tareas, Reportes de Rendimiento y Ventanas de Concentración

**Fecha:** 2026-09-02
**Versión base:** v1.0.1
**Estado:** diseño aprobado, pendiente de plan de implementación

## 1. Contexto y objetivo

DeskSense hoy mide el ambiente de un escritorio (ESP32 → ThingsBoard → app Electron) y
reacciona a él con alertas y un asistente de IA. Mide el entorno, pero no sabe nada de lo
que la persona intenta hacer en ese entorno.

Esta funcionalidad cierra ese vacío: incorpora las **tareas** del usuario al sistema y las
cruza con la telemetría, de modo que el proyecto pase de "monitorear un escritorio" a
"relacionar el ambiente con el rendimiento de quien lo usa".

Es la última funcionalidad del ramo de Internet de las Cosas, y se implementa sin el
dispositivo físico armado, por lo que el desarrollo depende de un simulador que alimente
ThingsBoard.

## 2. La idea unificadora

La propuesta original describía tres cosas que podían leerse como funcionalidades sueltas:
agregar tareas, generar reportes y notificar ventanas de concentración. Lo que las
convierte en un solo sistema es un campo del modelo de datos: cada tarea declara su
**complejidad** (`deep` o `shallow`).

Con ese campo, el ciclo se cierra:

> El **entorno** detecta el momento óptimo → las **tareas** dicen qué hacer con él →
> el **reporte** mide si sirvió.

Sin ese vínculo, la detección de concentración sería una notificación decorativa que no
alimenta ni consume nada del resto del sistema.

## 3. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Entrada de tareas | Texto con parseo por IA **y** voz, ambos en esta entrega | La voz aporta a la defensa del ramo; el texto garantiza que siempre haya un camino que funcione |
| Persistencia | Archivo JSON en `app.getPath('userData')` vía IPC | Robusto, sin límite de tamaño, funciona sin conexión y sobrevive a que se limpie el almacenamiento del renderer |
| Alcance del reporte | Cumplimiento + cruce con el entorno | Es lo que justifica que el proyecto sea IoT y no una aplicación de tareas cualquiera |
| Simulación | Script de Node que publica a ThingsBoard | El pipeline real completo funciona: WebSocket en vivo, historial agregado y por lo tanto reportes con datos reales |

## 4. Alcance

**Dentro:**

- Reparación de la compatibilidad con Linux (bloqueante).
- Capa de persistencia local en el proceso principal.
- Gestión de tareas (crear, completar, editar, eliminar) con entrada por texto, por voz y por formulario.
- Página de reportes diarios y semanales con índice de entorno y patrón observado.
- Detección de ventanas de concentración con notificación nativa y registro histórico.
- Simulador de telemetría con escenarios.
- Pruebas unitarias de la lógica pura mediante Vitest.
- Actualización de la bóveda de Obsidian.

**Fuera:**

- Sincronización de tareas entre equipos o con servicios externos.
- Correlación estadística formal (ver la sección 8.3: se declara explícitamente como patrón descriptivo).
- Firma de código del instalador.
- Cambios en el firmware del ESP32.

---

## 5. Capa 0 — Compatibilidad con Linux

Es prerequisito de todo lo demás y se entrega en su propia rama, porque es independiente
de la funcionalidad nueva.

### 5.1 Problemas detectados

1. **npm 11 avisa de los install scripts no revisados.** No bloquea su ejecución, solo
   emite un aviso; el motivo real de que Electron no dejara un binario utilizable es
   el del punto 2 (el extractor roto).
2. **El `postinstall` de Electron falla en silencio.** Descarga el ZIP de 106 MB a
   `~/.cache/electron` y termina con código 0 sin extraer nada. Hubo que descomprimirlo a
   mano; sin automatizarlo, el entorno queda roto tras cada `npm install`.
3. **`npm run dist` está clavado a `--win`.** No hay `wine` ni `makensis` en el sistema, y
   no existe target de Linux configurado.
4. **Las notificaciones se identificarían como "Electron".** Falta `app.setName`.
5. **`minHeight: 1024` es frágil.** En la pantalla actual (2880×1800) no molesta, pero en
   un monitor de 1080p con barra de sistema la ventana no cabe.

### 5.2 Soluciones

- Mantener el campo `allowScripts` que `npm install-scripts approve` añadió a
  `package.json` (ya aplicado en la rama).
- Añadir `scripts/postinstall.mjs`, idempotente y guardado por `process.platform === 'linux'`:
  si el binario de Electron falta pero el ZIP está en caché, lo extrae y le da permisos de
  ejecución. Se engancha como `postinstall` del proyecto raíz, que sí se ejecuta.
- Añadir el bloque `linux` a la configuración de electron-builder con targets AppImage y
  deb, `icon: build/icon.png` y categoría `Utility`. Separar los scripts en `dist:win` y
  `dist:linux`.
- Llamar a `app.setName('DeskSense')` antes de `app.whenReady()`. El `appId` y el
  `AppUserModelId` siguen siendo `com.monitoreo.escritorio`: cambiarlos rompería las
  notificaciones en Windows.
- Bajar `minHeight` a 720.

### 5.3 Verificación

La capa se da por terminada cuando la aplicación arranca en Linux, muestra el dashboard,
se conecta a ThingsBoard y emite una notificación nativa visible con el nombre correcto.

**Riesgo conocido:** en algunas distribuciones `chrome-sandbox` necesita `setuid root`. Si
el arranque falla por eso, la salida alternativa es lanzar con `--no-sandbox` en desarrollo
y documentarlo; el paquete AppImage no sufre el problema.

---

## 6. Capa 1 — Modelo de datos y persistencia

### 6.1 Almacenamiento

`electron/store.cjs` lee y escribe un único archivo JSON en `app.getPath('userData')`.
Vive en el proceso principal porque el renderer corre con `contextIsolation: true` y
`nodeIntegration: false`, de modo que no puede acceder a `fs` — y así debe seguir siendo.

La API se expone en `preload.cjs`:

```js
window.electronAPI.store.read()        // → Promise<StoreData>
window.electronAPI.store.write(data)   // → Promise<void>
```

Se escribe el documento completo con escritura atómica (archivo temporal y `rename`) para
que un cierre abrupto no deje el JSON corrupto. Las escrituras se agrupan con un debounce
de 500 ms desde el renderer.

Forma del archivo:

```json
{
  "version": 1,
  "tasks": [],
  "focusWindows": []
}
```

Si el archivo no existe o no se puede parsear, se arranca con el documento vacío por
defecto: la aplicación nunca debe fallar al iniciar por culpa del almacenamiento.

### 6.2 Entidades

Los identificadores del código van en inglés; las etiquetas visibles, en español.

```js
// Task
{
  id: string,                              // crypto.randomUUID()
  title: string,
  createdAt: number,                       // epoch ms
  dueDate: string | null,                  // 'YYYY-MM-DD'
  priority: 'high' | 'medium' | 'low',
  complexity: 'deep' | 'shallow',
  estimatedMinutes: number | null,
  status: 'pending' | 'done',
  completedAt: number | null,              // epoch ms — base del cruce ambiental
  source: 'text' | 'voice' | 'form'
}

// FocusWindow
{
  id: string,
  startTs: number,
  endTs: number,
  durationMinutes: number,
  suggestedTaskId: string | null
}
```

### 6.3 Contexto de React

`TasksContext` expone `{ tasks, addTask, updateTask, toggleDone, removeTask, focusWindows,
addFocusWindow, loading }`. Carga desde el store al montar y persiste ante cada cambio.

El orden de providers pasa a ser:

```
Settings → Telemetry → Tasks → Alerts → Focus
```

`Tasks` se ubica antes de `Alerts` y `Focus` porque `Focus` necesita consultar las tareas
pendientes para sugerir cuál abordar.

### 6.4 Mejora puntual del código existente

`WATCH_KEYS` está hoy declarado dentro de `AlertsContext.jsx`, pero el índice de entorno y
la detección de concentración necesitan exactamente la misma lista. Se mueve a
`src/lib/sensors.js` y los tres consumidores la importan de ahí. Es el único refactor de
código existente que contempla este diseño.

---

## 7. Capa 2 — Entrada de tareas

Tres caminos que desembocan en la misma entidad `Task`.

### 7.1 Texto con parseo por IA

Un campo único donde se escribe en lenguaje natural, por ejemplo *"mañana terminar el
informe de redes, alta prioridad, como 2 horas, es complejo"*.

Se añade `parseTask({ provider, apiKey, model, input, today })` a `src/lib/ai.js`, que
devuelve:

```json
{
  "title": "Terminar el informe de redes",
  "dueDate": "2026-09-03",
  "priority": "high",
  "complexity": "deep",
  "estimatedMinutes": 120
}
```

Dos consideraciones que condicionan la implementación:

- **`parseTask` usa su propio prompt de sistema, no el `SYSTEM_PROMPT` existente.** Ese
  prompt restringe al asistente al ambiente del escritorio y rechazaría esta petición por
  considerarla fuera de alcance. El prompt de `parseTask` pide exclusivamente JSON, sin
  texto adicional, y recibe la fecha de hoy para poder resolver expresiones relativas como
  "mañana" o "el viernes".
- **Respaldo determinista.** Si la respuesta no parsea como JSON válido o le faltan campos,
  la tarea se crea igualmente con el texto original como título, prioridad `medium`,
  complejidad `shallow` y vencimiento hoy. La entrada del usuario nunca se pierde. Es el
  mismo criterio que ya usa `FALLBACK_ADVICE` en el sistema de alertas.

### 7.2 Voz

Es el punto de mayor incertidumbre técnica del diseño y se aborda primero dentro de esta
capa, como sondeo acotado.

La Web Speech API no sirve: Chromium la elimina de las compilaciones de Electron. El camino
viable es capturar audio y enviarlo a un modelo multimodal:

1. `MediaRecorder` graba mientras el botón está presionado.
2. El audio resultante (webm/opus) se decodifica con `AudioContext.decodeAudioData` y se
   reencoda a WAV PCM 16 bits mono, sin dependencias externas, porque los modelos esperan
   WAV o MP3 antes que webm.
3. El WAV en base64 se envía a Gemini 2.5 Flash vía OpenRouter en un único viaje que pide a
   la vez transcribir y estructurar, reutilizando el contrato de `parseTask`.
4. Electron debe conceder el micrófono mediante `session.setPermissionRequestHandler`.

**Criterio de degradación:** si el envío de audio no funciona tras un par de intentos
razonables, se degrada a "graba, se muestra la transcripción, el usuario confirma antes de
crear la tarea", y si tampoco eso resulta, la voz se pospone. En ningún caso bloquea el
resto de las capas.

### 7.3 Formulario

Diálogo con campos explícitos para editar una tarea existente o crearla sin IA. Es también
la red de seguridad cuando no hay API key configurada.

---

## 8. Capa 3 — Reportes de rendimiento

Página nueva con selector de período: **Hoy** y **Esta semana**.

**Definición de los períodos.** "Hoy" abarca desde las 00:00 hasta las 23:59 de la fecha
local actual. "Esta semana" abarca de lunes a domingo de la semana en curso, no los últimos
siete días móviles, porque el reporte se presenta como un balance de la semana y un rango
móvil haría que las cifras cambiaran de significado cada día.

### 8.1 Fuentes

- Tareas del período, filtradas por `dueDate`. Las tareas sin fecha de vencimiento
  (`dueDate: null`) **no entran** en el cálculo de cumplimiento, porque no tienen un
  período al que pertenecer y distorsionarían el porcentaje. Sí aparecen en la lista de
  tareas, agrupadas como "sin fecha".
- Telemetría del mismo rango, mediante el `getTimeseries` que ya existe en
  `src/lib/thingsboard.js`, con `agg=AVG` y el intervalo calculado como ya lo hace la
  página de Historial.
- Ventanas de concentración registradas en el store.

No se introduce ninguna forma nueva de consultar ThingsBoard ni de clasificar sensores: se
reutilizan `getTimeseries` y `classify`.

### 8.2 Métricas

**Cumplimiento:** `done / total` de las tareas del período.

**Índice de Entorno (0–100):** promedio de los niveles de cada sensor vigilado y habilitado,
mapeando `good = 100`, `moderate = 66`, `bad = 33`, `severe = 0`. Se calcula sobre los
valores agregados del período. Si no hay ningún sensor con dato, el índice es `null` y la
interfaz lo muestra como "sin datos" en lugar de como cero.

**Ventanas de concentración:** cantidad y minutos totales del período.

### 8.3 Patrón observado

Para cada tarea completada se toma su `completedAt` y se busca el cubo de telemetría más
cercano, se clasifica el entorno de ese momento y se agrupan los resultados por nivel. De
ahí sale una frase legible, generada de forma determinista a partir de los datos:

> "Completaste 4 de 5 tareas con el entorno en nivel Bueno."

**Se denomina "patrón observado", nunca "correlación".** Con los volúmenes de datos que
maneja este proyecto —días o semanas— no existe muestra suficiente para sostener una
afirmación de correlación estadística, y presentarlo como tal sería indefendible ante una
pregunta directa en la evaluación. La interfaz debe usar ese lenguaje de forma consistente.

### 8.4 Resumen por IA

Botón opcional que envía el reporte ya calculado al modelo activo y devuelve dos o tres
conclusiones en lenguaje natural. Reutiliza `callModel`. Si no hay API key o la llamada
falla, se muestra un resumen de plantilla construido con las mismas cifras.

### 8.5 Sin caché de reportes

Se descarta deliberadamente cachear los reportes. Un caché solo aporta valor para períodos
ya cerrados, pero los dos períodos que ofrece la interfaz —hoy y la semana en curso— están
siempre abiertos y deben recalcularse en cada visita. Guardar un caché que nunca se leería
sería código muerto desde el primer día.

Si en el futuro se añadiera un selector de períodos históricos, este es el punto donde
introducirlo.

---

## 9. Capa 4 — Ventanas de concentración profunda

### 9.1 Por qué un contexto propio

`FocusContext` se implementa aparte de `AlertsContext` porque la lógica es de naturaleza
distinta: las alertas reaccionan a una **transición** de nivel, mientras que las ventanas de
concentración reaccionan a una condición **sostenida en el tiempo**. Mezclarlas ensuciaría
un contexto que hoy está limpio y bien acotado.

### 9.2 Máquina de estados

Estados: `idle` → `building` → `active` → `idle`.

La condición de entorno óptimo se cumple cuando hay presencia confirmada **y** todos los
sensores vigilados que estén habilitados y tengan dato se clasifican como `good`. Se exige
al menos un sensor con dato, para que deshabilitar todos los sensores no haga que la
condición se cumpla de forma vacía.

- Si la condición se cumple estando en `idle`, se pasa a `building` y se anota el instante.
- Si se mantiene en `building` durante **10 minutos continuos**, se pasa a `active` y se
  dispara la notificación. El umbral se mide en **tiempo transcurrido, no en número de
  muestras**, para no depender de la cadencia de publicación del dispositivo.
- Si la condición se rompe estando en `active`, la ventana se cierra y se registra como
  `FocusWindow` en el store, alimentando el reporte.
- Si se rompe estando en `building`, simplemente se vuelve a `idle` sin registrar nada.

**Cooldown de 60 minutos** entre notificaciones, para que el sistema no resulte molesto.

### 9.3 La notificación

Usa la misma vía IPC que ya emplean las alertas (`window.electronAPI.notify`), que dispara
la notificación desde el proceso principal.

El cuerpo sugiere la tarea **pendiente de complejidad `deep` con mayor prioridad**, y ante
empate la de vencimiento más próximo:

> **Ventana de concentración detectada**
> Tu entorno lleva 10 minutos en condiciones óptimas. Buen momento para: «Terminar el
> informe de redes».

Si no hay ninguna tarea profunda pendiente, el mensaje es genérico e invita a aprovechar el
momento.

### 9.4 Configuración

Interruptor propio `focusEnabled` en la página de Configuración, independiente de
`alertsEnabled`. El umbral de 10 minutos queda como constante del código en esta entrega.

---

## 10. Capa 5 — Simulador de telemetría

`scripts/simulator.mjs`, Node puro con el `fetch` nativo. No añade ninguna dependencia.

### 10.1 Funcionamiento

Publica a `POST http://{host}/api/v1/{deviceToken}/telemetry` cada 3 segundos, la misma
cadencia del firmware, y replica su comportamiento de ahorro: sin presencia solo publica la
distancia; con presencia publica el conjunto completo de sensores. La presencia se modela
con la misma histéresis del firmware, de modo que la aplicación no distinga la simulación
de un dispositivo real.

El token se resuelve de dos maneras: desde `TB_DEVICE_TOKEN` en `.env`, o vía REST con las
credenciales de ThingsBoard, resolviendo el dispositivo por nombre y consultando
`GET /api/device/{deviceId}/credentials`. La segunda evita tener que copiar tokens a mano.

### 10.2 Escenarios

Se seleccionan con `--escenario`:

| Escenario | Qué produce | Para qué sirve |
|---|---|---|
| `optimo` | Todos los sensores en verde de forma sostenida | Disparar ventanas de concentración |
| `degradado` | Valores en nivel moderado con deriva lenta | Estado intermedio realista |
| `critico` | PM2.5 y ruido elevados | Disparar el sistema de alertas |
| `jornada` | Un día laboral completo con transiciones | Poblar el historial y probar reportes |

Cada escenario define rangos objetivo por sensor y añade ruido aleatorio y deriva suave,
para que los valores no parezcan sintéticos.

`--acelerado=N` comprime el tiempo, haciendo avanzar el `ts` N veces más rápido que el reloj
real, de modo que se puedan generar días de historial en minutos y probar el reporte
semanal sin esperar una semana.

### 10.3 Corrección incidental del desfase horario

El simulador envía su propio `ts` dentro del payload, con el formato
`{ "ts": ..., "values": { ... } }`. Esto **corrige de paso el desfase horario** que la
bóveda tiene registrado como pendiente en el roadmap: el desfase ocurre porque el ESP32 no
envía marca de tiempo y ThingsBoard sella con la hora del servidor. Queda demostrado que la
solución correcta es que el dispositivo envíe su propio `ts`, lo que documenta el arreglo
para el firmware.

---

## 11. Pruebas

El proyecto no tiene infraestructura de pruebas. Se añade **Vitest**, que se integra sin
fricción con Vite, y se cubre exclusivamente la lógica pura:

- Cálculo del índice de entorno, incluido el caso sin datos.
- Agregación del reporte y generación de la frase del patrón observado.
- Máquina de estados de las ventanas de concentración: entrada, mantenimiento, ruptura en
  `building`, ruptura en `active`, cooldown y el caso de todos los sensores deshabilitados.
- Parseo de la respuesta de `parseTask`, sobre todo las rutas de respaldo ante JSON inválido.

La interfaz se valida manualmente contra el simulador. No se introducen pruebas de
componentes de React en esta entrega.

---

## 12. Entrega

### 12.1 Ramas

Dos ramas, ambas partiendo de `develop`, que se sincronizó con `main` porque estaba 22
commits atrás:

1. **`feature/compatibilidad-linux`** — capa 0. Se integra primero por ser prerequisito.
2. **`feature/tareas-y-reportes`** — capas 1 a 5.

Commits en español con la nomenclatura `feat:` / `fix:` / `chore:`, sin atribución a
herramientas de IA. Integración por merge, nunca directo sobre `main`.

### 12.2 Bóveda de Obsidian

Al cerrar la implementación se añaden a `/home/gsm/Documents/Vaults/DeskSense` las notas
correspondientes a tareas, reportes, ventanas de concentración, simulador y compatibilidad
con Linux, y se actualiza el MOC y el canvas. La bóveda se escribe en español.

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La entrada por voz no funciona en Electron sobre Wayland | Medio | Se aborda primero como sondeo acotado, con degradación definida en 7.2 y sin bloquear otras capas |
| El modelo devuelve JSON inválido al parsear tareas | Bajo | Respaldo determinista que nunca descarta la entrada del usuario |
| `chrome-sandbox` impide arrancar Electron | Medio | `--no-sandbox` en desarrollo; el AppImage no sufre el problema |
| Datos insuficientes para que el reporte diga algo | Bajo | El simulador con `--acelerado` genera historial suficiente |
| Ambición excesiva para el plazo del ramo | Medio | Las capas están ordenadas por dependencia: las capas 0 a 3 ya constituyen una entrega defendible sin las capas 4 y 5 |
