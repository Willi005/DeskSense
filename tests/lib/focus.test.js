import { describe, it, expect } from 'vitest'
import {
  isTelemetryFresh,
  MAX_TELEMETRY_AGE_MS,
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
    expect(closedWindow).toEqual({
      startTs: 0,
      endTs: now,
      durationMinutes: 30,
      suggestedTaskId: null,
    })
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

describe('isTelemetryFresh', () => {
  it('acepta telemetría recién llegada', () => {
    const ahora = 1_000_000
    expect(isTelemetryFresh(ahora - 5000, ahora)).toBe(true)
  })

  it('rechaza telemetría vieja: un dispositivo caído deja los valores congelados', () => {
    const ahora = 1_000_000
    expect(isTelemetryFresh(ahora - MAX_TELEMETRY_AGE_MS - 1, ahora)).toBe(false)
  })

  it('rechaza cuando no ha llegado ningún dato', () => {
    expect(isTelemetryFresh(0, 1_000_000)).toBe(false)
    expect(isTelemetryFresh(null, 1_000_000)).toBe(false)
    expect(isTelemetryFresh(undefined, 1_000_000)).toBe(false)
  })
})

describe('la ventana recuerda qué tarea sugirió', () => {
  it('guarda la tarea sugerida al activarse', () => {
    const building = { phase: 'building', since: 0, lastNotifyTs: 0 }
    const { state } = nextFocusState(building, {
      now: FOCUS_HOLD_MS,
      optimal: true,
      suggestedTaskId: 't-42',
    })
    expect(state.phase).toBe('active')
    expect(state.suggestedTaskId).toBe('t-42')
  })

  it('la devuelve al cerrar la ventana, para poder cruzarla con las tareas', () => {
    const active = { phase: 'active', since: 0, lastNotifyTs: 0, suggestedTaskId: 't-42' }
    const { closedWindow } = nextFocusState(active, { now: 60_000, optimal: false })
    expect(closedWindow.suggestedTaskId).toBe('t-42')
  })

  it('acepta que no hubiera ninguna tarea profunda pendiente', () => {
    const building = { phase: 'building', since: 0, lastNotifyTs: 0 }
    const { state } = nextFocusState(building, { now: FOCUS_HOLD_MS, optimal: true })
    expect(state.suggestedTaskId).toBeNull()

    const { closedWindow } = nextFocusState(
      { ...state, phase: 'active' },
      { now: FOCUS_HOLD_MS + 60_000, optimal: false }
    )
    expect(closedWindow.suggestedTaskId).toBeNull()
  })

  it('olvida la sugerencia al volver a reposo, para no arrastrarla a la ventana siguiente', () => {
    const active = { phase: 'active', since: 0, lastNotifyTs: 0, suggestedTaskId: 't-42' }
    const { state } = nextFocusState(active, { now: 60_000, optimal: false })
    expect(state.phase).toBe('idle')
    expect(state.suggestedTaskId).toBeNull()
  })
})
