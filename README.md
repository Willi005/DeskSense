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

## Empaquetar (instalador)

```bash
npm run dist     # genera build de Vite + instalador NSIS en release/
npm run pack     # solo empaqueta (sin instalador), útil para probar
npm run icon     # regenera build/icon.png e icon.ico desde build/icon.svg
```

> **Nota (OneDrive):** si el proyecto está dentro de una carpeta sincronizada con
> OneDrive (p. ej. `Documents`), electron-builder puede fallar con `EPERM` al
> renombrar `release/win-unpacked`. Genera el empaquetado **fuera de OneDrive**:
>
> ```bash
> npx electron-builder --win -c.directories.output=C:/Users/<tú>/AppData/Local/Temp/desksense-release
> ```

## Ejecución en Linux

El proyecto se desarrolló en Windows y funciona igual en Linux, con dos
particularidades del entorno:

- **npm 11 bloquea los install scripts.** El campo `allowScripts` de
  `package.json` autoriza los de `electron` y `esbuild`, necesarios para que
  ambos descarguen su binario.
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
