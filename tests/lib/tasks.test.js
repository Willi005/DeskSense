import { describe, it, expect } from 'vitest'
import {
  createTask,
  dayRange,
  weekRange,
  toDateKey,
  tasksInRange,
  completionRate,
  nextDeepTask,
} from '../../src/lib/tasks.js'

describe('createTask', () => {
  it('completa los valores por defecto', () => {
    const task = createTask({ title: 'Escribir informe' })
    expect(task.title).toBe('Escribir informe')
    expect(task.status).toBe('pending')
    expect(task.priority).toBe('medium')
    expect(task.complexity).toBe('shallow')
    expect(task.completedAt).toBeNull()
    expect(task.id).toBeTruthy()
  })

  it('respeta los valores entregados', () => {
    const task = createTask({
      title: 'Terminar el informe de redes',
      dueDate: '2026-09-03',
      priority: 'high',
      complexity: 'deep',
      estimatedMinutes: 120,
      source: 'voice',
    })
    expect(task.priority).toBe('high')
    expect(task.complexity).toBe('deep')
    expect(task.estimatedMinutes).toBe(120)
    expect(task.source).toBe('voice')
  })

  it('descarta una prioridad inválida y cae al valor por defecto', () => {
    expect(createTask({ title: 'X', priority: 'urgentísima' }).priority).toBe('medium')
  })
})

describe('rangos de fecha', () => {
  it('dayRange cubre el día local completo', () => {
    const { start, end } = dayRange(new Date('2026-09-02T15:30:00'))
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(end).getHours()).toBe(23)
    expect(toDateKey(new Date(start))).toBe('2026-09-02')
  })

  it('weekRange va de lunes a domingo, no de los últimos siete días', () => {
    // 2026-09-02 es miércoles.
    const { start, end } = weekRange(new Date('2026-09-02T15:30:00'))
    expect(toDateKey(new Date(start))).toBe('2026-08-31') // lunes
    expect(toDateKey(new Date(end))).toBe('2026-09-06') // domingo
  })

  it('weekRange trata el domingo como último día de su semana, no como primero', () => {
    const { start } = weekRange(new Date('2026-09-06T10:00:00')) // domingo
    expect(toDateKey(new Date(start))).toBe('2026-08-31')
  })
})

describe('tasksInRange', () => {
  const range = dayRange(new Date('2026-09-02T12:00:00'))

  it('incluye las tareas cuya fecha cae dentro', () => {
    const tasks = [createTask({ title: 'A', dueDate: '2026-09-02' })]
    expect(tasksInRange(tasks, range)).toHaveLength(1)
  })

  it('excluye las tareas de otro día', () => {
    const tasks = [createTask({ title: 'B', dueDate: '2026-09-05' })]
    expect(tasksInRange(tasks, range)).toHaveLength(0)
  })

  it('excluye las tareas sin fecha', () => {
    const tasks = [createTask({ title: 'C' })]
    expect(tasksInRange(tasks, range)).toHaveLength(0)
  })
})

describe('completionRate', () => {
  it('calcula el porcentaje de cumplimiento', () => {
    const tasks = [
      { status: 'done' },
      { status: 'done' },
      { status: 'pending' },
      { status: 'pending' },
    ]
    expect(completionRate(tasks)).toEqual({ done: 2, total: 4, percent: 50 })
  })

  it('devuelve cero por ciento sin tareas, en vez de dividir por cero', () => {
    expect(completionRate([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('nextDeepTask', () => {
  it('elige la tarea profunda pendiente de mayor prioridad', () => {
    const tasks = [
      createTask({ title: 'Ligera alta', priority: 'high', complexity: 'shallow' }),
      createTask({ title: 'Profunda baja', priority: 'low', complexity: 'deep' }),
      createTask({ title: 'Profunda alta', priority: 'high', complexity: 'deep' }),
    ]
    expect(nextDeepTask(tasks).title).toBe('Profunda alta')
  })

  it('ignora las tareas profundas ya completadas', () => {
    const done = { ...createTask({ title: 'Hecha', complexity: 'deep' }), status: 'done' }
    expect(nextDeepTask([done])).toBeNull()
  })

  it('devuelve null si no hay ninguna tarea profunda pendiente', () => {
    expect(nextDeepTask([createTask({ title: 'Ligera' })])).toBeNull()
  })

  it('desempata por la fecha de vencimiento más próxima', () => {
    const tasks = [
      createTask({ title: 'Lejana', priority: 'high', complexity: 'deep', dueDate: '2026-09-20' }),
      createTask({ title: 'Cercana', priority: 'high', complexity: 'deep', dueDate: '2026-09-03' }),
    ]
    expect(nextDeepTask(tasks).title).toBe('Cercana')
  })
})
