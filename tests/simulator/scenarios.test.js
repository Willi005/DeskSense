import { describe, it, expect } from 'vitest'
import { sampleScenario, SCENARIO_NAMES } from '../../scripts/simulator/scenarios.mjs'
import { classify, WATCH_KEYS } from '../../src/lib/sensors.js'

// Generador determinista para que las pruebas no dependan del azar.
function seededRng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('sampleScenario', () => {
  it('expone los cuatro escenarios del diseño', () => {
    expect(SCENARIO_NAMES).toEqual(['optimo', 'degradado', 'critico', 'jornada'])
  })

  it('genera todas las claves de telemetría', () => {
    const sample = sampleScenario('optimo', 0, seededRng(1))
    for (const key of WATCH_KEYS) {
      expect(typeof sample[key]).toBe('number')
    }
    expect(typeof sample.distancia).toBe('number')
  })

  it('el escenario optimo clasifica todos los sensores como buenos', () => {
    const rng = seededRng(42)
    for (let tick = 0; tick < 200; tick++) {
      const sample = sampleScenario('optimo', tick, rng)
      for (const key of WATCH_KEYS) {
        expect(classify(key, sample[key]).id, `${key}=${sample[key]} en tick ${tick}`).toBe('good')
      }
    }
  })

  it('el escenario critico degrada ruido y PM2.5 a nivel de alerta', () => {
    const rng = seededRng(7)
    for (let tick = 0; tick < 200; tick++) {
      const sample = sampleScenario('critico', tick, rng)
      expect(['bad', 'severe']).toContain(classify('ruido', sample.ruido).id)
      expect(['bad', 'severe']).toContain(classify('pm25', sample.pm25).id)
    }
  })

  it('rechaza un escenario desconocido', () => {
    expect(() => sampleScenario('inexistente', 0)).toThrow(/desconocido/i)
  })
})
