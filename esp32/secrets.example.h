// Plantilla de credenciales. Copia este archivo como `secrets.h` en la misma
// carpeta y rellena los tres valores antes de compilar.
//
// `secrets.h` está en .gitignore: las credenciales reales nunca deben llegar al
// repositorio. Esta plantilla sí se versiona, con los valores vacíos.
#pragma once

// Nombre y contraseña de la red WiFi a la que se conecta el ESP32.
#define WIFI_SSID ""
#define WIFI_PASSWORD ""

// Token de acceso del dispositivo en ThingsBoard.
// Se obtiene en: Devices > monitoreo-escritorio > Manage credentials.
#define TB_TOKEN ""
