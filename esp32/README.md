# Firmware del ESP32 — DeskSense

Este es el dispositivo que mide el ambiente del escritorio y publica la telemetría
a ThingsBoard por MQTT. La aplicación de escritorio la consume desde ahí.

## Antes de nada: las credenciales

Las credenciales **no viven en el `.ino`**, sino en un archivo aparte que git ignora.
Si acabas de clonar el repositorio, este es el primer paso:

```bash
cp esp32/secrets.example.h esp32/secrets.h
```

Y rellena los tres valores de `secrets.h`:

| Constante | Qué es | Dónde se obtiene |
|---|---|---|
| `WIFI_SSID` | Nombre de la red WiFi | Tu red. **Debe ser de 2,4 GHz**: el ESP32 no ve las de 5 GHz |
| `WIFI_PASSWORD` | Contraseña de esa red | — |
| `TB_TOKEN` | Token del dispositivo | ThingsBoard → **Devices** → `monitoreo-escritorio` → **Manage credentials** |

`secrets.h` está en `.gitignore`. No lo quites de ahí ni pegues las credenciales
en el `.ino`: es lo único que impide que acaben publicadas en el repositorio.

## Cómo se usa PlatformIO

PlatformIO trata **esta carpeta** como su proyecto, no la raíz del repositorio.
Eso es deliberado: la raíz tiene una carpeta `src/` que es la aplicación de React,
y PlatformIO intentaría compilarla como si fuera C++.

**Abre la carpeta `esp32` en VS Code** (Archivo → Abrir carpeta → `esp32`). Al
detectar el `platformio.ini`, la extensión se activa y aparece una barra de
iconos abajo del todo, en la barra de estado azul:

| Icono | Qué hace | Atajo |
|---|---|---|
| ✓ | **Compilar.** Traduce el código sin tocar la placa. Es lo primero que debes probar | `Ctrl+Alt+B` |
| → | **Subir.** Compila y graba el firmware en el ESP32 por USB | `Ctrl+Alt+U` |
| 🔌 | **Monitor serie.** Abre la consola donde el ESP32 imprime lo que está midiendo | `Ctrl+Alt+S` |
| 🗑 | **Limpiar.** Borra lo compilado. Útil si algo quedó en un estado raro | — |

La primera compilación tarda varios minutos porque descarga el compilador y las
librerías. Las siguientes son cuestión de segundos.

Las tres librerías **no hay que instalarlas a mano**: están declaradas en
`platformio.ini` y PlatformIO las descarga solo.

## Flujo normal de trabajo

1. Conecta el ESP32 por USB.
2. Pulsa **✓ Compilar**. Si falla, el problema está en el código o en las librerías, no en la placa.
3. Pulsa **→ Subir**.
4. Pulsa **🔌 Monitor serie** y mira lo que imprime. Deberías ver la conexión WiFi,
   la sincronización del reloj, el arranque del SPS30 y luego una lectura cada
   3 segundos con el payload que envía.

## Cableado

Los pines evitan los *strapping pins* (GPIO 0, 2, 5, 12, 15), que interfieren con
el arranque, y usan solo ADC1 (GPIO 32–39), porque **ADC2 deja de funcionar
cuando el WiFi está activo** — un error clásico que hace que las lecturas
analógicas devuelvan basura solo después de conectar a la red.

| Sensor | Modelo | Pin del ESP32 | Notas |
|---|---|---|---|
| Presencia | HC-SR04 | TRIG → **13**, ECHO → **14** | Ver el aviso de abajo sobre ECHO |
| Temperatura y humedad | DHT11 | DATA → **16** | Resistencia de pull-up de 10 kΩ entre DATA y 3,3 V |
| Calidad del aire | Sensirion SPS30 | SDA → **21**, SCL → **22** | I²C. El pin **SEL debe ir a GND** para que hable I²C en vez de UART |
| Luz | DFR0026 | AO → **33** | ADC1 |
| Ruido | KY-037 | AO → **34** | ADC1. Se usa la salida analógica, no la digital |

> **El HC-SR04 puede quemarte el ESP32.** Funciona a 5 V y su pin ECHO devuelve
> 5 V, pero las entradas del ESP32 toleran como máximo 3,3 V. Hay que bajar esa
> tensión con un divisor: ECHO → resistencia de 5,1 kΩ → GPIO 14, y desde GPIO 14
> otra de 10 kΩ a GND. Conectar ECHO directo al GPIO daña la placa, a veces no de
> inmediato sino tras unas horas de uso.

Alimentación: el SPS30 necesita **5 V** (VIN del ESP32 cuando está por USB), igual
que el HC-SR04. El DHT11, el DFR0026 y el KY-037 van a **3,3 V**.

## Qué publica el dispositivo

Diez claves de telemetría, que son exactamente las que la aplicación espera
(`TELEMETRY_KEYS` en `src/lib/sensors.js`):

```
distancia, presencia, luz, ruido, temperatura, humedad, pm1, pm25, pm4, pm10
```

**Lógica de ahorro:** solo publica el conjunto completo cuando detecta a alguien
a menos de 80 cm. Sin presencia envía únicamente `distancia` y `presencia`, para
no llenar ThingsBoard de datos de un escritorio vacío. Por eso el panel muestra
un aviso de "datos pausados" cuando no hay nadie: no es un fallo.

**Marca de tiempo propia.** Al arrancar, el dispositivo sincroniza su reloj por
NTP y sella cada envío con `{"ts": ..., "values": {...}}`. Sin esto, ThingsBoard
usaría la hora de su propio servidor, y si esa hora está desfasada el historial y
los reportes diarios y semanales de la aplicación salen corridos. Si NTP no
responde, el firmware vuelve al formato plano y deja que selle el servidor: es
preferible una hora aproximada a fechar la telemetría en 1970.

## Cuando algo no funciona

| Síntoma | Causa probable |
|---|---|
| El monitor serie muestra caracteres sin sentido | La velocidad no coincide. Debe ser **115200** |
| Se queda en `Conectando a WiFi ....` sin avanzar | Red de 5 GHz (el ESP32 no las ve), o SSID/contraseña mal escritos en `secrets.h` |
| `ERROR: SPS30 no responde` | El pin **SEL** no está a GND, o el sensor está a 3,3 V en vez de 5 V |
| `ERROR - revisar cableado del DHT11` | Falta la resistencia de pull-up de 10 kΩ, o el sensor está en otro pin |
| `MQTT: no se pudo conectar` | Token incorrecto en `secrets.h`, o el servidor `200.13.5.20:1883` no es alcanzable desde tu red |
| La distancia siempre marca 0 o 500 | El divisor de tensión del ECHO está mal montado |
| La luz y el ruido dan valores absurdos **solo tras conectar el WiFi** | Algún sensor analógico quedó en un pin ADC2. Deben ir a ADC1 (32–39) |
| `NTP no respondio` | La red bloquea el puerto 123. No es grave: sella ThingsBoard |

## Dos cosas por verificar contra el hardware físico

1. **¿DHT11 o DHT22?** El código, los comentarios y la bóveda dicen **DHT11**, pero
   la tabla de librerías del informe menciona DHT22. Son sensores distintos: leer
   un DHT22 declarado como DHT11 devuelve valores incorrectos **sin dar ningún
   error**. Si tu sensor es el azul, es un DHT11; si es blanco y más grande, un
   DHT22, y entonces hay que cambiar `DHTesp::DHT11` por `DHTesp::DHT22` en el
   `setup()`.

2. **¿La placa es una ESP32-CAM?** El archivo se llama `CODIGO_ESP32_CAM_DEFINITIVO.ino`,
   pero los pines que usa no son compatibles con una ESP32-CAM, donde casi todos
   están ocupados por la cámara y la ranura SD. La configuración asume una
   **ESP32-WROOM-32 DevKit** normal, que es lo que documenta la bóveda. Si tu
   placa fuera realmente una CAM, hay que reasignar los pines antes de conectar nada.

## Calibración

Los valores de luz y ruido **no son medidas absolutas**:

- **Luz:** porcentaje del ADC (`raw / 4095 × 100`), no lux. Los tramos que muestra
  la aplicación son una equivalencia aproximada.
- **Ruido:** dB estimados a partir de la amplitud del KY-037, con la fórmula
  `dB = 42 + 20·log10(amplitud / 130)`. El 130 es el piso de silencio medido en
  este prototipo. Para afinarlo, mide el silencio de tu habitación con una app de
  sonómetro y ajusta `RUIDO_DB_REF` a ese valor.

## Probar sin el dispositivo

Mientras el hardware no esté montado, el simulador publica telemetría sintética a
ThingsBoard y la aplicación no nota la diferencia:

```bash
npm run simulate -- --escenario=optimo
```

Ver el README principal del proyecto para los escenarios disponibles.
