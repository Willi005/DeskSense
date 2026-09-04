import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createTask, sanitizeTaskFields } from '../lib/tasks'

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
        // Se fusiona en vez de reemplazar: si la persona añadió algo mientras la
        // lectura estaba en vuelo, reemplazar lo descartaría en silencio.
        setTasks((prev) => [...prev, ...(data?.tasks || [])])
        setFocusWindows((prev) => [...prev, ...(data?.focusWindows || [])])
        // La escritura solo se habilita tras una lectura CORRECTA. Si la lectura
        // falla y aun así permitiéramos escribir, el primer cambio guardaría el
        // estado vacío encima del archivo real y borraría los datos.
        loadedRef.current = true
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Espejo del estado para poder volcarlo desde manejadores que no se recrean
  // en cada render (desmontaje y cierre de ventana).
  const stateRef = useRef({ tasks, focusWindows })
  stateRef.current = { tasks, focusWindows }

  const persist = useCallback(() => {
    const store = typeof window !== 'undefined' ? window.electronAPI?.store : null
    if (!store || !loadedRef.current) return
    const { tasks, focusWindows } = stateRef.current
    // Un único envío, sin ida y vuelta: el proceso principal fusiona sobre lo
    // que haya en disco. Encadenar aquí una lectura previa impedía que este
    // volcado funcionara al cerrar la ventana, porque el renderer muere antes de
    // que llegue la respuesta.
    store.write({ version: 1, tasks, focusWindows }).catch(() => {})
  }, [])

  // Persistencia con debounce. No escribe antes de la carga inicial, para no
  // sobrescribir el archivo con el estado vacío del primer render.
  useEffect(() => {
    if (!loadedRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      persist()
    }, WRITE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tasks, focusWindows, persist])

  // Volcado de la escritura pendiente al desmontar o al cerrar la ventana. Sin
  // esto, cualquier cambio hecho en los últimos WRITE_DEBOUNCE_MS antes de
  // cerrar la app se descartaba en silencio: el cleanup cancelaba el temporizador
  // sin llegar a guardar nada.
  useEffect(() => {
    const flushPending = () => {
      if (timerRef.current == null) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      persist()
    }
    window.addEventListener('beforeunload', flushPending)
    return () => {
      window.removeEventListener('beforeunload', flushPending)
      flushPending()
    }
  }, [persist])

  const addTask = useCallback((fields) => {
    const task = createTask(fields)
    setTasks((prev) => [task, ...prev])
    return task
  }, [])

  // Las ediciones pasan por la misma validación que la creación: es la única
  // forma de que la lista blanca de `createTask` sea de verdad la única puerta.
  const updateTask = useCallback((id, patch) => {
    const limpio = sanitizeTaskFields(patch)
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...limpio } : task)))
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
