import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react'
import { useTelemetry } from './TelemetryContext'
import { useSettings } from './SettingsContext'
import { useTasks } from './TasksContext'
import { isOptimal, nextFocusState, INITIAL_FOCUS_STATE } from '../lib/focus'
import { nextDeepTask } from '../lib/tasks'

const FocusContext = createContext(null)

// La condición se evalúa también por reloj, no solo cuando llega telemetría:
// el umbral es temporal y debe cumplirse aunque los valores no cambien.
const TICK_MS = 15000

export function FocusProvider({ children }) {
  const { values, presence } = useTelemetry()
  const { settings } = useSettings()
  const { tasks, addFocusWindow } = useTasks()
  const [phase, setPhase] = useState('idle')

  const stateRef = useRef(INITIAL_FOCUS_STATE)
  // Se leen por referencia para que el intervalo no se reinicie en cada render.
  const latest = useRef({ values, presence, tasks, settings })
  latest.current = { values, presence, tasks, settings }

  useEffect(() => {
    function evaluate() {
      const { values, presence, tasks, settings } = latest.current
      if (settings.focusEnabled === false) return

      const optimal = isOptimal(values, presence, settings.disabledSensors || [])
      const result = nextFocusState(stateRef.current, { now: Date.now(), optimal })
      stateRef.current = result.state
      setPhase(result.state.phase)

      if (result.notify) {
        const suggestion = nextDeepTask(tasks)
        const body = suggestion
          ? `Tu entorno lleva 10 minutos en condiciones óptimas. Buen momento para: «${suggestion.title}».`
          : 'Tu entorno lleva 10 minutos en condiciones óptimas. Buen momento para una tarea que exija concentración.'
        try {
          window.electronAPI?.notify?.('Ventana de concentración detectada', body)
        } catch {
          /* notificaciones no disponibles */
        }
      }

      if (result.closedWindow) {
        addFocusWindow({ id: crypto.randomUUID(), ...result.closedWindow })
      }
    }

    evaluate()
    const timer = setInterval(evaluate, TICK_MS)
    return () => clearInterval(timer)
  }, [addFocusWindow])

  const value = useMemo(
    () => ({ phase, currentWindowStart: stateRef.current.since }),
    [phase]
  )

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within FocusProvider')
  return ctx
}
