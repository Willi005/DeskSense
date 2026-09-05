# DeskSense

Aplicación de escritorio (**Electron + React + Vite + Tailwind**) para monitorear en
tiempo real las condiciones ambientales de un escritorio de trabajo, a partir de un
prototipo IoT basado en **ESP32-WROOM-32X** que publica telemetría a **ThingsBoard**
vía MQTT. Incluye un asistente de IA acotado al entorno y alertas automáticas.

Sensores: HC-SR04 (presencia), DHT11 (temperatura/humedad), Sensirion SPS30
(PM1.0/2.5/4.0/10), KY-037 (ruido) y DFRobot DFR0026 (luz).

## Descargar e instalar (Windows)

La versión empaquetada está disponible en las
[**Releases** del repositorio](https://github.com/Willi005/DeskSense/releases).

1. Descarga **`DeskSense-Setup-1.0.1.exe`** de la última release.
2. Ejecútalo y sigue el asistente de instalación.
3. Se crea un **acceso directo en el escritorio** y en el menú Inicio.

> El instalador no está firmado digitalmente, así que Windows SmartScreen puede
> mostrar un aviso: *Más información → Ejecutar de todas formas*.

## Características

- **Dashboard en tiempo real** con layout *bento grid* y estética *glassmorphism*
  (visionOS / Apple): tarjeta por sensor con valor actual, badge de estado,
  mini-gráfico de historial reciente (Recharts) e indicador de presencia destacado.
- **Historial** con selector de rango (presets + rango personalizado). Usa la REST
  API de ThingsBoard con **agregación del lado del servidor** para cubrir todo el
  rango sin saturar de puntos.
- **Asistente de IA multi-proveedor** con selector de modelo: Gemini, GPT y Llama
  vía **OpenRouter**, y Claude vía **Anthropic**. Recibe los valores actuales de los
  sensores como contexto y está **acotado al ambiente de trabajo** (rechaza temas
  ajenos como código o consultas generales).
- **Alertas automáticas**: cuando una métrica entra en nivel malo/crítico, muestra
  una nota en pantalla con un consejo de la IA y lanza una **notificación push del
  sistema** (funciona incluso con la app minimizada).
- **Tareas**: modelo con título, fecha de vencimiento, prioridad (Alta/Media/Baja),
  complejidad (Profunda/Ligera), minutos estimados y estado. Tres caminos de entrada:
  texto en lenguaje natural (interpretado por IA con respaldo determinista), voz, y
  formulario manual. Se guardan en `~/.config/desksense/desksense-data.json` vía
  puente IPC.
- **Reportes de rendimiento**: períodos Hoy y Esta semana (lunes a domingo) con
  porcentaje de cumplimiento de tareas, Índice de Entorno (0–100, que
  clasifica el entorno en cada instante del período y promedia esos puntajes, de modo
  que una jornada inestable no se disfrace de perfecta) y el "patrón observado" que agrupa las tareas
  completadas según la calidad del entorno del momento.
- **Ventanas de concentración**: máquina de estados que avisa cuando el entorno lleva
  10 minutos continuos en nivel óptimo con presencia, sugiriendo la tarea profunda
  pendiente de mayor prioridad. Enfriamiento de 60 minutos para no abrumar. Se
  registran para los reportes.
- **Apariencia**: tema **claro/oscuro** (glass en ambos) y la opción de
  **habilitar/deshabilitar sensores** del panel (los deshabilitados se pausan en el
  Dashboard y se excluyen de las alertas y del contexto de la IA).

## Tecnología

- Tiempo real: **WebSocket** de ThingsBoard (`/api/ws/plugins/telemetry`).
- Historial: **REST API** (`/api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries`)
  con `agg=AVG` + `interval`.
- Autenticación: login usuario/contraseña → **JWT** (configurable en la app).
- IA: llamadas directas desde la app al proveedor configurado (OpenRouter / Anthropic).

## Desarrollo

```bash
npm install

# (opcional) API keys por variable de entorno
cp .env.example .env   # edita VITE_OPENROUTER_API_KEY / VITE_ANTHROPIC_API_KEY

# Desarrollo (Vite + Electron con hot reload)
npm run dev

# Build de producción + ejecutar en Electron
npm start
```

## Simulador de telemetría

Publica telemetría sintética a ThingsBoard sin necesidad del ESP32 físico. Escenarios
disponibles: `optimo`, `degradado`, `critico` y `jornada` (ciclo completo de un día
laboral).

```bash
# Tiempo real: publica cada 3 segundos
node scripts/simulator.mjs --escenario=optimo

# Modo acelerado: genera historial completo de 7 días
# Cada tick son 6 minutos (aceleración ×120)
# 1680 ciclos cubren 7 días
node scripts/simulator.mjs --escenario=jornada --acelerado=120 --ciclos=1680

# 240 ciclos cubren 24 horas
node scripts/simulator.mjs --escenario=jornada --acelerado=120 --ciclos=240
```

El simulador envía su propio `ts` (marca de tiempo), lo que corrige automáticamente
el desfase horario que de otro modo sufriría el historial. En modo acelerado, el
historial se construye hacia atrás desde el presente, garantizando que ningún punto
caiga en el futuro.

## Empaquetar (instalador)

```bash
npm run dist        # empaqueta para la plataforma anfitriona (NSIS en Windows, AppImage en Linux)
npm run dist:win    # fuerza el instalador NSIS de Windows
npm run dist:linux  # fuerza el AppImage de Linux
npm run pack        # solo empaqueta (sin instalador), útil para probar
npm run icon        # regenera build/icon.png e icon.ico desde build/icon.svg
```

> **Nota (OneDrive):** si el proyecto está dentro de una carpeta sincronizada con
> OneDrive (p. ej. `Documents`), electron-builder puede fallar con `EPERM` al
> renombrar `release/win-unpacked`. Genera el empaquetado **fuera de OneDrive**:
>
> ```bash
> npx electron-builder --win -c.directories.output=C:/Users/<tú>/AppData/Local/Temp/desksense-release
> ```

## Ejecución en Linux

El proyecto se desarrolló en Windows y funciona igual en Linux, con tres
particularidades del entorno:

- **npm 11 avisa de los install scripts no revisados.** El campo `allowScripts`
  de `package.json` marca como revisados los de `electron` y `esbuild` y silencia
  el aviso; no es necesario para que descarguen su binario.
- **El instalador de Electron puede no extraer su binario.** Descarga el ZIP a
  `~/.cache/electron` y termina sin descomprimirlo. El script
  `scripts/postinstall.mjs` lo detecta y lo repara automáticamente tras cada
  `npm install`. Si aun así falta, ejecutar `npm run postinstall`.
- **La reparación automática necesita `unzip` o `bsdtar` instalados en el
  sistema.** Si faltan ambos, `scripts/postinstall.mjs` avisa por consola y no
  repara nada; instala cualquiera de los dos y ejecuta `npm run postinstall`.

Para generar un ejecutable distribuible:

```bash
npm run dist:linux   # genera release/DeskSense-<versión>.AppImage
```

`npm run dist:win` sigue generando el instalador NSIS, pero requiere ejecutarse
en Windows o disponer de `wine`.

## Configuración

Abre **Configuración** dentro de la app:

1. Servidor ThingsBoard (por defecto `http://200.13.5.20:8080`).
2. Usuario y **contraseña** → *Conectar y obtener token*: obtiene el JWT y resuelve
   el *Device ID* a partir del nombre del dispositivo.
3. **Modelo de IA** y su **API key** (OpenRouter o Anthropic; o variables de entorno).

Los datos se guardan en `localStorage`. La API key de IA nunca se envía a ThingsBoard.

## Notas

- La ventana de Electron usa `webSecurity: false` para permitir las llamadas
  REST/WebSocket directas a ThingsBoard y a la IA sin bloqueos CORS, apropiado para
  una app de escritorio local que apunta a un servidor fijo.
- Claves de telemetría esperadas: `distancia, luz, ruido, temperatura, humedad,
  pm1, pm25, pm4, pm10`.
- Umbrales calibrados según ASHRAE 55 / ISO 7730 (temperatura, humedad), OMS 2021 /
  EPA (PM), EN 12464-1 (luz) y WHO 2018 (ruido). La luz se expresa como **% del ADC**
  (no lux) y el ruido como **dB aproximados** estimados desde la amplitud del KY-037
  (no es un sonómetro calibrado).
- El firmware del ESP32 está en `esp32/`. Completa `WIFI_SSID`, `WIFI_PASSWORD` y
  `TB_TOKEN` antes de compilar y flashear.
