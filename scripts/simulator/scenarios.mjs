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
