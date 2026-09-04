import { describe, it, expect } from 'vitest'
import {
  environmentIndex,
  environmentIndexOverTime,
  averageSeries,
  levelAt,
  buildReport,
} from '../../src/lib/report.js'

// getTimeseries devuelve los valores como cadena de texto: se replica aquí.
const series = {
  temperatura: [
    { ts: 1000, value: '22' },
    { ts: 2000, value: '24' },
  ],
  ruido: [
    { ts: 1000, value: '45' },
    { ts: 2000, value: '75' },
  ],
}

describe('environmentIndex', () => {
  it('puntúa un entorno enteramente bueno como cien', () => {
    expect(environmentIndex({ temperatura: 22, humedad: 50, ruido: 40 })).toBe(100)
  })

  it('promedia niveles mixtos', () => {
    // temperatura 22 es good (100), ruido 75 es bad (33) → media 66.5 → 67
    expect(environmentIndex({ temperatura: 22, ruido: 75 })).toBe(67)
  })

  it('ignora los sensores deshabilitados', () => {
    expect(environmentIndex({ temperatura: 22, ruido: 75 }, ['ruido'])).toBe(100)
  })

  it('devuelve null sin datos, para no confundirse con cero', () => {
    expect(environmentIndex({})).toBeNull()
    expect(environmentIndex({ temperatura: 22 }, ['temperatura'])).toBeNull()
  })
})

describe('averageSeries', () => {
  it('promedia convirtiendo las cadenas a número', () => {
    expect(averageSeries(series)).toEqual({ temperatura: 23, ruido: 60 })
  })

  it('omite los sensores deshabilitados', () => {
    expect(averageSeries(series, ['ruido'])).toEqual({ temperatura: 23 })
  })
})

describe('levelAt', () => {
  it('clasifica usando el punto más cercano en el tiempo', () => {
    expect(levelAt(series, 1100)).toBe('good') // temp 22 + ruido 45
  })

  it('usa el punto posterior cuando está más cerca', () => {
    expect(levelAt(series, 1900)).toBe('moderate') // temp 24 (good) + ruido 75 (bad)
  })

  it('devuelve unknown si no hay serie', () => {
    expect(levelAt({}, 1000)).toBe('unknown')
  })
})

describe('environmentIndexOverTime', () => {
  it('penaliza la varianza en vez de esconderla en el promedio', () => {
    // Media jornada a oscuras y media deslumbrando: el promedio de los valores
    // da 50 (Óptimo) y ocultaría que el entorno nunca estuvo bien.
    const series = {
      luz: [
        { ts: 1000, value: '0' },
        { ts: 2000, value: '0' },
        { ts: 3000, value: '100' },
        { ts: 4000, value: '100' },
      ],
    }
    expect(environmentIndex(averageSeries(series))).toBe(100)
    expect(environmentIndexOverTime(series)).toBe(33)
  })

  it('un entorno realmente bueno sigue puntuando cien', () => {
    const series = {
      temperatura: [
        { ts: 1000, value: '22' },
        { ts: 2000, value: '23' },
      ],
      ruido: [
        { ts: 1000, value: '40' },
        { ts: 2000, value: '45' },
      ],
    }
    expect(environmentIndexOverTime(series)).toBe(100)
  })

  it('promedia los momentos, no los valores', () => {
    // Un instante bueno (100) y otro malo (33) dan 67, no la clasificación del
    // valor medio.
    const series = {
      ruido: [
        { ts: 1000, value: '40' },
        { ts: 2000, value: '75' },
      ],
    }
    expect(environmentIndexOverTime(series)).toBe(67)
  })

  it('ignora los sensores deshabilitados', () => {
    const series = {
      ruido: [{ ts: 1000, value: '75' }],
      temperatura: [{ ts: 1000, value: '22' }],
    }
    expect(environmentIndexOverTime(series, ['ruido'])).toBe(100)
  })

  it('devuelve null sin datos, para no confundirse con cero', () => {
    expect(environmentIndexOverTime({})).toBeNull()
    expect(environmentIndexOverTime({ ruido: [] })).toBeNull()
    expect(environmentIndexOverTime({ ruido: [{ ts: 1, value: '40' }] }, ['ruido'])).toBeNull()
  })
})

describe('buildReport', () => {
  const range = { start: 0, end: 10000 }

  it('reporta cumplimiento, entorno y ventanas', () => {
    const tasks = [
      { id: 'a', title: 'A', dueDate: '2026-09-02', status: 'done', completedAt: 1000 },
      { id: 'b', title: 'B', dueDate: '2026-09-02', status: 'pending', completedAt: null },
    ]
    const report = buildReport({
      tasks,
      series,
      focusWindows: [{ startTs: 0, endTs: 1000, durationMinutes: 30 }],
      range,
      disabled: [],
    })
    expect(report.completion.percent).toBe(50)
    expect(report.focus).toEqual({ count: 1, totalMinutes: 30 })
    expect(report.environment.index).toBeGreaterThan(0)
  })

  it('agrupa las tareas completadas por el nivel de entorno del momento', () => {
    const tasks = [{ id: 'a', title: 'A', dueDate: '2026-09-02', status: 'done', completedAt: 1000 }]
    const report = buildReport({ tasks, series, focusWindows: [], range, disabled: [] })
    expect(report.pattern.byLevel.good).toBe(1)
    expect(report.pattern.headline).toContain('1 de 1')
  })

  it('no inventa un nivel cuando no hay telemetría del momento', () => {
    // Sin serie, levelAt devuelve 'unknown', cuya etiqueta es "Sin datos". La
    // frase quedaba como "con el entorno en nivel Sin datos", que no dice nada.
    const tasks = [
      { id: 'a', title: 'A', dueDate: '2026-09-02', status: 'done', completedAt: 1000 },
      { id: 'b', title: 'B', dueDate: '2026-09-02', status: 'done', completedAt: 2000 },
    ]
    const report = buildReport({ tasks, series: {}, focusWindows: [], range, disabled: [] })
    expect(report.pattern.headline).not.toMatch(/nivel Sin datos/i)
    expect(report.pattern.headline).toMatch(/no hay datos del entorno/i)
  })

  it('no afirma un patrón sin tareas completadas', () => {
    const report = buildReport({ tasks: [], series, focusWindows: [], range, disabled: [] })
    expect(report.pattern.headline).toMatch(/sin tareas completadas/i)
  })
})
