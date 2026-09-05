// Sensor metadata, thresholds and classification logic.
// Telemetry keys from ThingsBoard: distancia, luz, ruido, temperatura,
// humedad, pm1, pm25, pm4, pm10.
//
// Rangos de referencia (entorno de trabajo) según:
//  - Temperatura/Humedad: ASHRAE 55, ISO 7730, OMS.
//  - PM2.5/PM10: OMS Air Quality Guidelines 2021, EPA AQI.
//  - Luz: ISO 8995-1 / EN 12464-1 (el DFR0026 entrega % del ADC, no lux).
//  - Ruido: WHO Environmental Noise Guidelines 2018 (KY-037, amplitud cruda
//    calibrada en el entorno del prototipo).

// `color` es el tono de baja saturación para tema oscuro; `light` es la variante
// más oscura/saturada para tema claro, donde los tonos pastel no alcanzan el
// contraste mínimo (≥4.5:1) en las etiquetas pequeñas.
export const LEVELS = {
  good: { id: 'good', label: 'Bueno', color: '#5BD6A6', light: '#5BD6A6', text: 'text-status-good' },
  moderate: { id: 'moderate', label: 'Moderado', color: '#E8C468', light: '#E8C468', text: 'text-status-moderate' },
  bad: { id: 'bad', label: 'Malo', color: '#E88A8A', light: '#E88A8A', text: 'text-status-bad' },
  severe: { id: 'severe', label: 'Crítico', color: '#E06B9A', light: '#BE185D', text: 'text-status-severe' },
  unknown: { id: 'unknown', label: 'Sin datos', color: '#8A93A6', light: '#475569', text: 'text-white/40' },
}

// Devuelve un nivel (con su color) y, opcionalmente, una etiqueta específica
// del sensor (p. ej. "Óptimo", "Insuficiente", "Muy malo").
function lvl(id, label) {
  return label ? { ...LEVELS[id], label } : LEVELS[id]
}

// Distance (cm) below which we consider a person seated at the desk.
export const PRESENCE_DISTANCE_CM = 80

export const SENSORS = {
  temperatura: {
    key: 'temperatura',
    label: 'Temperatura',
    short: 'Temp.',
    unit: '°C',
    icon: 'thermometer',
    decimals: 1,
    // Óptimo 20–24 · Aceptable 18–26 · Malo <18/>26 · Crítico <15/>30
    classify: (v) =>
      v < 15 || v > 30
        ? lvl('severe', 'Crítico')
        : v < 18 || v > 26
        ? lvl('bad', 'Malo')
        : v < 20 || v > 24
        ? lvl('moderate', 'Aceptable')
        : lvl('good', 'Óptimo'),
    hint: 'Óptimo 20–24 °C · Aceptable 18–26 °C · Crítico <15 o >30 °C (ASHRAE 55)',
  },
  humedad: {
    key: 'humedad',
    label: 'Humedad',
    short: 'Hum.',
    unit: '%',
    icon: 'droplets',
    decimals: 0,
    // Óptimo 40–60 · Aceptable 30–70 · Malo <30/>70 · Crítico <20/>80
    classify: (v) =>
      v < 20 || v > 80
        ? lvl('severe', 'Crítico')
        : v < 30 || v > 70
        ? lvl('bad', 'Malo')
        : v < 40 || v > 60
        ? lvl('moderate', 'Aceptable')
        : lvl('good', 'Óptimo'),
    hint: 'Óptimo 40–60 % · Aceptable 30–70 % · Crítico <20 o >80 % (ASHRAE 55 / OMS)',
  },
  luz: {
    key: 'luz',
    label: 'Luz ambiental',
    short: 'Luz',
    unit: '%',
    icon: 'sun',
    decimals: 0,
    // DFR0026 entrega % del ADC. Insuficiente 0–20 · Aceptable 20–50 ·
    // Óptimo 50–80 · Excesivo >80
    classify: (v) =>
      v < 20
        ? lvl('bad', 'Insuficiente')
        : v < 50
        ? lvl('moderate', 'Aceptable')
        : v <= 80
        ? lvl('good', 'Óptimo')
        : lvl('bad', 'Excesivo'),
    descriptor: (v) =>
      v < 20 ? '< 200 lux' : v < 50 ? '200–500 lux' : v <= 80 ? '500–800 lux' : '> 800 lux',
    hint: 'Óptimo 50–80 % (≈500–800 lux) · Insuficiente <20 % · Excesivo >80 % (EN 12464-1)',
  },
  ruido: {
    key: 'ruido',
    label: 'Nivel de ruido',
    short: 'Ruido',
    unit: 'dB',
    icon: 'volume-2',
    decimals: 0,
    // dB aproximados estimados desde la amplitud del KY-037 (calibrado).
    // Silencio <50 · Bajo 50–60 · Moderado 60–68 · Alto >68
    classify: (v) =>
      v < 50
        ? lvl('good', 'Silencio')
        : v < 60
        ? lvl('good', 'Bajo')
        : v < 68
        ? lvl('moderate', 'Moderado')
        : lvl('bad', 'Alto'),
    descriptor: (v) =>
      v < 50
        ? 'Silencio · trabajo profundo'
        : v < 60
        ? 'Bajo · oficina tranquila'
        : v < 68
        ? 'Moderado · distrae'
        : 'Alto · impacto severo',
    hint: 'dB aproximados (KY-037 calibrado). Óptimo <50 · Moderado 60–68 · Alto >68 (WHO 2018)',
  },
  pm25: {
    key: 'pm25',
    label: 'PM2.5',
    short: 'PM2.5',
    unit: 'µg/m³',
    icon: 'wind',
    decimals: 1,
    // OMS 2021 / EPA: Bueno 0–12 · Moderado 12–35 · Malo sensibles 35–55 ·
    // Malo 55–150 · Muy malo >150
    classify: (v) =>
      v <= 12
        ? lvl('good', 'Bueno')
        : v <= 35
        ? lvl('moderate', 'Moderado')
        : v <= 55
        ? lvl('bad', 'Malo (sensibles)')
        : v <= 150
        ? lvl('severe', 'Malo')
        : lvl('severe', 'Muy malo'),
    hint: 'OMS — Bueno 0–12 · Moderado 12–35 · Malo (sensibles) 35–55 · Malo 55–150 · Muy malo >150',
  },
  pm1: {
    key: 'pm1',
    label: 'PM1.0',
    short: 'PM1',
    unit: 'µg/m³',
    icon: 'wind',
    decimals: 1,
    // Derivado de PM2.5: Bueno 0–10 · Moderado 10–25 · Malo >25
    classify: (v) =>
      v <= 10 ? lvl('good', 'Bueno') : v <= 25 ? lvl('moderate', 'Moderado') : lvl('bad', 'Malo'),
    hint: 'Partículas ultrafinas <1 µm — Bueno 0–10 · Moderado 10–25 · Malo >25',
  },
  pm4: {
    key: 'pm4',
    label: 'PM4.0',
    short: 'PM4',
    unit: 'µg/m³',
    icon: 'wind',
    decimals: 1,
    // Sin estándar oficial; interpolado entre PM2.5 y PM10.
    classify: (v) =>
      v <= 16 ? lvl('good', 'Bueno') : v <= 40 ? lvl('moderate', 'Moderado') : v <= 75 ? lvl('bad', 'Malo') : lvl('severe', 'Crítico'),
    hint: 'Partículas <4 µm (valor derivado, sin estándar oficial)',
  },
  pm10: {
    key: 'pm10',
    label: 'PM10',
    short: 'PM10',
    unit: 'µg/m³',
    icon: 'wind',
    decimals: 1,
    // OMS 2021: Bueno 0–20 · Moderado 20–45 · Malo 45–100 · Crítico >100
    classify: (v) =>
      v <= 20
        ? lvl('good', 'Bueno')
        : v <= 45
        ? lvl('moderate', 'Moderado')
        : v <= 100
        ? lvl('bad', 'Malo')
        : lvl('severe', 'Crítico'),
    hint: 'OMS — Bueno 0–20 · Moderado 20–45 · Malo 45–100 · Crítico >100',
  },
  distancia: {
    key: 'distancia',
    label: 'Distancia',
    short: 'Dist.',
    unit: 'cm',
    icon: 'ruler',
    decimals: 0,
    classify: () => LEVELS.unknown,
    hint: `HC-SR04 — presencia detectada bajo ${PRESENCE_DISTANCE_CM} cm`,
  },
}

export const TELEMETRY_KEYS = [
  'distancia',
  'luz',
  'ruido',
  'temperatura',
  'humedad',
  'pm1',
  'pm25',
  'pm4',
  'pm10',
]

// Métricas con niveles de calidad relevantes para alertas, índice de entorno y
// detección de ventanas de concentración (excluye distancia y presencia, que no
// tienen un nivel "bueno" o "malo").
export const WATCH_KEYS = ['temperatura', 'humedad', 'luz', 'ruido', 'pm25', 'pm1', 'pm10']

export function classify(key, value) {
  if (value == null || Number.isNaN(value)) return LEVELS.unknown
  const sensor = SENSORS[key]
  if (!sensor) return LEVELS.unknown
  return sensor.classify(value)
}

export function formatValue(key, value) {
  if (value == null || Number.isNaN(value)) return '—'
  const sensor = SENSORS[key]
  const decimals = sensor?.decimals ?? 1
  return Number(value).toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Presence is derived from the HC-SR04 distance reading.
export function derivePresence(distancia) {
  if (distancia == null || Number.isNaN(distancia)) return null
  return distancia > 0 && distancia <= PRESENCE_DISTANCE_CM
}

// Human readable air-quality summary for the AI context.
export function airQualitySummary(values) {
  const pm25 = values.pm25
  if (pm25 == null) return 'sin datos de calidad del aire'
  return `${classify('pm25', pm25).label} (PM2.5 ${pm25} µg/m³)`
}
