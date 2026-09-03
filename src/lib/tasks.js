// Modelo de tarea y utilidades puras de fecha, cumplimiento y selección.
// Sin dependencias de React: todo esto se prueba de forma aislada.

export const PRIORITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' }
export const COMPLEXITY_LABELS = { deep: 'Profunda', shallow: 'Ligera' }

// Orden de mayor a menor urgencia, para elegir qué tarea sugerir.
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const VALID_PRIORITIES = Object.keys(PRIORITY_LABELS)
const VALID_COMPLEXITIES = Object.keys(COMPLEXITY_LABELS)
const VALID_SOURCES = ['text', 'voice', 'form']

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

export function createTask({
  title,
  dueDate = null,
  priority = 'medium',
  complexity = 'shallow',
  estimatedMinutes = null,
  source = 'form',
} = {}) {
  return {
    id: crypto.randomUUID(),
    title: String(title || '').trim(),
    createdAt: Date.now(),
    dueDate: dueDate || null,
    priority: oneOf(priority, VALID_PRIORITIES, 'medium'),
    complexity: oneOf(complexity, VALID_COMPLEXITIES, 'shallow'),
    estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : null,
    status: 'pending',
    completedAt: null,
    source: oneOf(source, VALID_SOURCES, 'form'),
  }
}

// 'YYYY-MM-DD' en hora local. No se usa toISOString, que convierte a UTC y
// puede devolver el día anterior según la zona horaria.
export function toDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dayRange(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

// Semana de lunes a domingo. getDay() devuelve 0 para domingo, por lo que el
// domingo se trata como el séptimo día de la semana que termina, no como inicio.
export function weekRange(date = new Date()) {
  const day = date.getDay()
  const offsetToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(date)
  monday.setDate(date.getDate() - offsetToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: dayRange(monday).start, end: dayRange(sunday).end }
}

// Las tareas sin fecha de vencimiento no pertenecen a ningún período y quedan
// fuera del cálculo de cumplimiento, para no distorsionar el porcentaje.
export function tasksInRange(tasks, range) {
  return tasks.filter((task) => {
    if (!task.dueDate) return false
    const [year, month, day] = task.dueDate.split('-').map(Number)
    const ts = new Date(year, month - 1, day, 12).getTime()
    return ts >= range.start && ts <= range.end
  })
}

export function completionRate(tasks) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status === 'done').length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

// Tarea que se sugiere al detectar una ventana de concentración: la pendiente
// de complejidad profunda con mayor prioridad y, a igualdad, la que vence antes.
export function nextDeepTask(tasks) {
  const candidates = tasks.filter(
    (task) => task.status === 'pending' && task.complexity === 'deep'
  )
  if (!candidates.length) return null

  return [...candidates].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (byPriority !== 0) return byPriority
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate) return -1
    if (b.dueDate) return 1
    return a.createdAt - b.createdAt
  })[0]
}
