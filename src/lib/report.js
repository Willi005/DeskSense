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

// Índice a lo largo de un período: clasifica CADA instante y promedia esos
// puntajes.
//
// La alternativa —promediar los valores y clasificar el resultado— esconde la
// varianza, que es justo lo que un índice de calidad debe reflejar. Medido con
// datos reales de una jornada: la luz osciló entre 0 % (oscuridad) y 98,9 %
// (deslumbramiento) y la humedad rozó el umbral crítico, pero el promedio de
// cada sensor caía en su rango bueno y el índice daba 100 sobre 100. Este cálculo
// responde a "qué parte del tiempo el entorno acompañó", no a "cómo fue el valor
// típico", que es la pregunta útil para un reporte de rendimiento.
export function environmentIndexOverTime(series, disabled = []) {
  const keys = activeKeys(disabled).filter((key) => series?.[key]?.length)
  if (!keys.length) return null

  // Se agrupan los puntos por marca de tiempo. Con la agregación del servidor
  // todas las series comparten los mismos cubos, pero agrupar por `ts` no asume
  // que así sea: si una serie llega desalineada, cada instante se evalúa con lo
  // que haya en él en vez de emparejar valores de momentos distintos.
  const porInstante = new Map()
  for (const key of keys) {
    for (const punto of series[key]) {
      if (!porInstante.has(punto.ts)) porInstante.set(punto.ts, {})
      porInstante.get(punto.ts)[key] = Number(punto.value)
    }
  }

  const puntajes = []
  for (const valores of porInstante.values()) {
    const indice = environmentIndex(valores, disabled)
    if (indice != null) puntajes.push(indice)
  }
  if (!puntajes.length) return null
  return Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length)
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

// Cuánto puede alejarse una medición del instante que se quiere describir. Media
// hora cubre con holgura los cubos de un rango diario o semanal sin llegar a
// describir otro momento del día.
export const MAX_LEVEL_DISTANCE_MS = 30 * 60 * 1000

// Nivel del entorno en un instante dado, tomando de cada serie el punto más
// cercano en el tiempo. Es lo que permite situar una tarea completada.
//
// El punto más cercano solo vale si además está CERCA. `buildReport` selecciona
// las tareas por su fecha de vencimiento pero las sitúa por cuándo se
// completaron, así que una tarea que vence hoy y se terminó la semana pasada
// caía sobre la medición de hoy y recibía un entorno que no vivió. Sin límite,
// la frase del patrón afirmaba con aplomo algo que nadie midió.
export function levelAt(series, ts, disabled = []) {
  const values = {}
  for (const key of activeKeys(disabled)) {
    const points = series?.[key]
    if (!points?.length) continue
    let closest = points[0]
    for (const point of points) {
      if (Math.abs(point.ts - ts) < Math.abs(closest.ts - ts)) closest = point
    }
    if (Math.abs(closest.ts - ts) > MAX_LEVEL_DISTANCE_MS) continue
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

  // Sin telemetría del momento en que se completaron las tareas no hay patrón
  // que observar. Decirlo así evita la frase "con el entorno en nivel Sin datos",
  // que aparentaba una conclusión donde solo faltaban mediciones.
  if (topLevel === 'unknown') {
    const plural = completed.length === 1
      ? '1 tarea, pero no hay datos del entorno de ese momento para compararla'
      : `${completed.length} tareas, pero no hay datos del entorno de esos momentos para compararlas`
    return { byLevel, headline: `Completaste ${plural}.` }
  }

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
      // El índice recorre el período instante a instante; los promedios se
      // conservan aparte porque siguen siendo útiles para leer el detalle por
      // sensor, pero ya no son la base del puntaje.
      index: environmentIndexOverTime(series, disabled),
      average,
    },
    pattern: buildPattern(completed, series, disabled),
    focus: {
      count: windowsInRange.length,
      totalMinutes: windowsInRange.reduce((sum, w) => sum + (w.durationMinutes || 0), 0),
    },
  }
}
