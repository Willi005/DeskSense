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

describe('levelAt con distancia temporal', () => {
  const series = { ruido: [{ ts: 50_000_000, value: '40' }] }

  it('no atribuye el entorno de un momento lejano', () => {
    // Una tarea que vence hoy pero se completó la semana pasada recibía el
    // entorno de hoy: el punto "más cercano" estaba a horas de distancia.
    expect(levelAt(series, 1000)).toBe('unknown')
  })

  it('sí usa un punto cercano', () => {
    expect(levelAt(series, 50_000_000 + 60_000)).toBe('good')
  })
})

describe('cruce entre ventanas de concentración y tareas', () => {
  const range = { start: 0, end: 10_000 }

  it('cuenta cuántas ventanas sugirieron una tarea que acabó completándose', () => {
    const tasks = [
      { id: 'a', title: 'Profunda hecha', dueDate: '2026-09-02', status: 'done', completedAt: 5000 },
      { id: 'b', title: 'Profunda pendiente', dueDate: '2026-09-02', status: 'pending', completedAt: null },
    ]
    const focusWindows = [
      { id: 'w1', startTs: 1000, endTs: 2000, durationMinutes: 10, suggestedTaskId: 'a' },
      { id: 'w2', startTs: 3000, endTs: 4000, durationMinutes: 10, suggestedTaskId: 'b' },
      { id: 'w3', startTs: 5000, endTs: 6000, durationMinutes: 10, suggestedTaskId: null },
    ]
    const r = buildReport({ tasks, series: {}, focusWindows, range, disabled: [] })
    expect(r.focus.count).toBe(3)
    expect(r.focus.suggested).toBe(2)
    expect(r.focus.completed).toBe(1)
  })

  it('reconoce la tarea sugerida aunque venza fuera del período', () => {
    // La ventana ocurrió en este período; que la tarea venza otro día no cambia
    // si se completó. Filtrar por vencimiento hacía que estas nunca contaran.
    const delPeriodo = []
    const todas = [
      { id: 'a', title: 'Vence la semana próxima', dueDate: '2026-12-31', status: 'done', completedAt: 5000 },
    ]
    const focusWindows = [
      { id: 'w1', startTs: 1000, endTs: 2000, durationMinutes: 10, suggestedTaskId: 'a' },
    ]
    const r = buildReport({
      tasks: delPeriodo,
      allTasks: todas,
      series: {},
      focusWindows,
      range,
      disabled: [],
    })
    expect(r.focus.suggested).toBe(1)
    expect(r.focus.completed).toBe(1)
  })

  it('no afirma nada cuando ninguna ventana llegó a sugerir una tarea', () => {
    const focusWindows = [{ id: 'w', startTs: 1000, endTs: 2000, durationMinutes: 10, suggestedTaskId: null }]
    const r = buildReport({ tasks: [], series: {}, focusWindows, range, disabled: [] })
    expect(r.focus.suggested).toBe(0)
    expect(r.focus.headline).toMatch(/no hab(í|i)a ninguna tarea profunda/i)
  })

  it('resume el aprovechamiento en una frase legible', () => {
    const tasks = [{ id: 'a', title: 'X', dueDate: '2026-09-02', status: 'done', completedAt: 5000 }]
    const focusWindows = [
      { id: 'w1', startTs: 1000, endTs: 2000, durationMinutes: 10, suggestedTaskId: 'a' },
      { id: 'w2', startTs: 3000, endTs: 4000, durationMinutes: 10, suggestedTaskId: 'a' },
    ]
    const r = buildReport({ tasks, series: {}, focusWindows, range, disabled: [] })
    expect(r.focus.headline).toMatch(/2 ventanas/)
    // Dos ventanas sugirieron LA MISMA tarea: se completó una, no dos.
    expect(r.focus.completed).toBe(1)
  })

  it('no cuenta dos veces la misma tarea sugerida en varias ventanas', () => {
    // `nextDeepTask` devuelve la misma tarea tope hasta que se completa, así que
    // varias ventanas apuntando a una sola tarea es el caso normal, no un borde.
    const tasks = [{ id: 'a', title: 'X', dueDate: '2026-09-02', status: 'done', completedAt: 5000 }]
    const focusWindows = [1, 2, 3].map((n) => ({
      id: `w${n}`, startTs: n * 1000, endTs: n * 1000 + 500, durationMinutes: 10, suggestedTaskId: 'a',
    }))
    const r = buildReport({ tasks, series: {}, focusWindows, range, disabled: [] })
    expect(r.focus.completed).toBe(1)
    expect(r.focus.headline).not.toMatch(/3 de esas/)
  })

  it('distingue "no hay dato" de "no había ninguna tarea que sugerir"', () => {
    // Las ventanas guardadas antes de este cambio no traen el campo. Afirmar que
    // no había tarea pendiente es inventar un motivo que el dato no sostiene.
    const tasks = [{ id: 'a', title: 'Profunda pendiente', dueDate: '2026-09-02', status: 'pending', completedAt: null }]
    const antiguas = [{ id: 'w', startTs: 1000, endTs: 2000, durationMinutes: 10 }]
    const r = buildReport({ tasks, allTasks: tasks, series: {}, focusWindows: antiguas, range, disabled: [] })
    expect(r.focus.headline).not.toMatch(/no había ninguna tarea profunda/i)
    expect(r.focus.headline).toMatch(/sin registro de la tarea sugerida/i)
  })

  it('concuerda el número en la frase', () => {
    const dos = [
      { id: 'a', title: 'A', dueDate: '2026-09-02', status: 'done', completedAt: 5000 },
      { id: 'b', title: 'B', dueDate: '2026-09-02', status: 'done', completedAt: 6000 },
    ]
    const w = (n, t) => ({ id: `w${n}`, startTs: n * 1000, endTs: n * 1000 + 1, durationMinutes: 5, suggestedTaskId: t })
    expect(
      buildReport({ tasks: dos, series: {}, focusWindows: [w(1, 'a'), w(2, 'b')], range, disabled: [] }).focus.headline
    ).toMatch(/acabaron completándose/)
    const cero = [{ id: 'a', title: 'A', dueDate: '2026-09-02', status: 'pending', completedAt: null }]
    expect(
      buildReport({ tasks: cero, series: {}, focusWindows: [w(1, 'a')], range, disabled: [] }).focus.headline
    ).toMatch(/ninguna de esas tareas/i)
  })

  it('tolera ventanas antiguas sin el campo, guardadas antes de este cambio', () => {
    const focusWindows = [{ id: 'w', startTs: 1000, endTs: 2000, durationMinutes: 10 }]
    const r = buildReport({ tasks: [], series: {}, focusWindows, range, disabled: [] })
    expect(r.focus.count).toBe(1)
    expect(r.focus.suggested).toBe(0)
  })

  it('sin ventanas no inventa una frase', () => {
    const r = buildReport({ tasks: [], series: {}, focusWindows: [], range, disabled: [] })
    expect(r.focus.count).toBe(0)
    expect(r.focus.headline).toMatch(/sin ventanas/i)
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
    expect(report.focus.count).toBe(1)
    expect(report.focus.totalMinutes).toBe(30)
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
