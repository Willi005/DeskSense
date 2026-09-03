import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createTask } from '../lib/tasks'

const TasksContext = createContext(null)

// Se agrupan las escrituras para no tocar el disco en cada pulsación de tecla.
const WRITE_DEBOUNCE_MS = 500

export function TasksProvider({ children }) {
  const [tasks, setTasks] = useState([])
  const [focusWindows, setFocusWindows] = useState([])
  const [loading, setLoading] = useState(true)
  const loadedRef = useRef(false)
  const timerRef = useRef(null)

  // Carga inicial desde el proceso principal.
  useEffect(() => {
    let cancelled = false
    const store = typeof window !== 'undefined' ? window.electronAPI?.store : null
    if (!store) {
      setLoading(false)
      loadedRef.current = true
      return
    }
    store
      .read()
      .then((data) => {
        if (cancelled) return
        setTasks(data?.tasks || [])
        setFocusWindows(data?.focusWindows || [])
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        loadedRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Persistencia con debounce. No escribe antes de la carga inicial, para no
  // sobrescribir el archivo con el estado vacío del primer render.
  useEffect(() => {
    if (!loadedRef.current) return
    const store = typeof window !== 'undefined' ? window.electronAPI?.store : null
    if (!store) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      store.read().then((current) => {
        store.write({ ...current, version: 1, tasks, focusWindows }).catch(() => {})
      })
    }, WRITE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tasks, focusWindows])

  const addTask = useCallback((fields) => {
    const task = createTask(fields)
    setTasks((prev) => [task, ...prev])
    return task
  }, [])

  const updateTask = useCallback((id, patch) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)))
  }, [])

  const toggleDone = useCallback((id) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task
        const done = task.status !== 'done'
        return {
          ...task,
          status: done ? 'done' : 'pending',
          // completedAt es la base del cruce con el ambiente en el reporte.
          completedAt: done ? Date.now() : null,
        }
      })
    )
  }, [])

  const removeTask = useCallback((id) => {
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }, [])

  const addFocusWindow = useCallback((window) => {
    setFocusWindows((prev) => [...prev, window].slice(-200))
  }, [])

  const value = useMemo(
    () => ({ tasks, addTask, updateTask, toggleDone, removeTask, focusWindows, addFocusWindow, loading }),
    [tasks, addTask, updateTask, toggleDone, removeTask, focusWindows, addFocusWindow, loading]
  )

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks() {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks must be used within TasksProvider')
  return ctx
}
