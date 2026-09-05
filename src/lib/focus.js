// Detección de ventanas de concentración profunda. Se separa de las alertas
// porque la naturaleza del disparo es distinta: las alertas reaccionan a una
// transición de nivel, esto reacciona a una condición sostenida en el tiempo.
import { classify, WATCH_KEYS } from './sensors'

// El umbral se mide en tiempo transcurrido, no en número de muestras, para no
// depender de la cadencia de publicación del dispositivo.
export const FOCUS_HOLD_MS = 10 * 60 * 1000
export const FOCUS_COOLDOWN_MS = 60 * 60 * 1000

export const INITIAL_FOCUS_STATE = {
  phase: 'idle',
  since: null,
  lastNotifyTs: 0,
  // Qué tarea se sugirió al abrir esta ventana. Viaja con la ventana hasta que
  // se cierra, para que el reporte pueda cruzar las ventanas con las tareas en
  // vez de limitarse a contarlas por separado.
  suggestedTaskId: null,
}

// Antigüedad máxima de la telemetría para darla por vigente. El dispositivo
// publica cada 3 s, así que un minuto sin novedades ya significa que dejó de
// hablar.
export const MAX_TELEMETRY_AGE_MS = 60 * 1000

// Los valores en memoria son los ÚLTIMOS recibidos, no los actuales: si el
// dispositivo se queda sin WiFi, siguen ahí congelados y el entorno parece
// perfecto indefinidamente. Sin esta comprobación, una caída del ESP32 mientras
// alguien está en el escritorio acreditaba horas de concentración que nunca
// ocurrieron e inflaba el reporte. Medido: una ventana falsa de 266 minutos tras
// detener la fuente de datos.
export function isTelemetryFresh(lastUpdate, now = Date.now()) {
  if (!lastUpdate) return false
  return now - lastUpdate <= MAX_TELEMETRY_AGE_MS
}

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
export function nextFocusState(state, { now, optimal, suggestedTaskId = null }) {
  const none = { state, notify: false, closedWindow: null }

  if (optimal) {
    if (state.phase === 'idle') {
      return { state: { ...state, phase: 'building', since: now }, notify: false, closedWindow: null }
    }
    if (state.phase === 'building') {
      if (now - state.since < FOCUS_HOLD_MS) return none
      // Se activa igualmente durante el enfriamiento: así la ventana queda
      // registrada para el reporte aunque no se avise a la persona.
      const notify = state.lastNotifyTs === 0 || now - state.lastNotifyTs >= FOCUS_COOLDOWN_MS
      return {
        state: {
          ...state,
          phase: 'active',
          lastNotifyTs: notify ? now : state.lastNotifyTs,
          suggestedTaskId,
        },
        notify,
        closedWindow: null,
      }
    }
    return none
  }

  if (state.phase === 'active') {
    return {
      // La sugerencia se olvida al volver a reposo: pertenece a la ventana que
      // termina, no a la siguiente.
      state: { ...state, phase: 'idle', since: null, suggestedTaskId: null },
      notify: false,
      closedWindow: {
        startTs: state.since,
        endTs: now,
        durationMinutes: Math.round((now - state.since) / 60000),
        suggestedTaskId: state.suggestedTaskId ?? null,
      },
    }
  }

  if (state.phase === 'building') {
    return { state: { ...state, phase: 'idle', since: null }, notify: false, closedWindow: null }
  }

  return none
}
