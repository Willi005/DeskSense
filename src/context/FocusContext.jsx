import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react'
import { useTelemetry } from './TelemetryContext'
import { useSettings } from './SettingsContext'
import { useTasks } from './TasksContext'
import {
  isOptimal,
  isTelemetryFresh,
  nextFocusState,
  resetFocusState,
  INITIAL_FOCUS_STATE,
  FOCUS_HOLD_MS,
} from '../lib/focus'
import { nextDeepTask } from '../lib/tasks'

const FocusContext = createContext(null)

// La condición se evalúa también por reloj, no solo cuando llega telemetría:
// el umbral es temporal y debe cumplirse aunque los valores no cambien.
const TICK_MS = 15000

// El texto del aviso se deriva del umbral real. Escribirlo a mano hacía que la
// notificación afirmara "10 minutos" aunque la constante dijera otra cosa: un
// mensaje que miente sobre lo que el sistema acaba de medir.
const holdLabel =
  FOCUS_HOLD_MS >= 60000
    ? `${Math.round(FOCUS_HOLD_MS / 60000)} minutos`
    : `${Math.round(FOCUS_HOLD_MS / 1000)} segundos`

export function FocusProvider({ children }) {
  const { values, presence, lastArrival } = useTelemetry()
  const { settings } = useSettings()
  const { tasks, addFocusWindow } = useTasks()
  const [phase, setPhase] = useState('idle')
  // Tarea que se está sugiriendo mientras la ventana está activa, para que la
  // interfaz pueda mostrarla en vez de depender de una notificación efímera.
  const [suggestedTask, setSuggestedTask] = useState(null)

  const stateRef = useRef(INITIAL_FOCUS_STATE)
  // Se leen por referencia para que el intervalo no se reinicie en cada render.
  const latest = useRef({ values, presence, tasks, settings })
  latest.current = { values, presence, tasks, settings, lastArrival }

  useEffect(() => {
    function evaluate() {
      const { values, presence, tasks, settings, lastArrival } = latest.current

      // Con la detección apagada se vuelve a reposo de forma explícita. Salir
      // antes de actualizar el estado lo dejaba congelado en `active`: el aviso
      // del panel se quedaba pegado, y al reactivar se registraba una ventana
      // que abarcaba todo el tiempo apagado.
      if (settings.focusEnabled === false) {
        if (stateRef.current.phase !== 'idle') {
          stateRef.current = resetFocusState(stateRef.current).state
          setPhase('idle')
          setSuggestedTask(null)
        }
        return
      }

      // Sin telemetría vigente no se afirma nada sobre el entorno: los valores en
      // memoria son los últimos recibidos y sobreviven a que el dispositivo deje
      // de publicar.
      const optimal =
        isTelemetryFresh(lastArrival) && isOptimal(values, presence, settings.disabledSensors || [])

      // La sugerencia se calcula ANTES de la transición: la ventana se activa
      // aunque el enfriamiento impida notificar, y aun así debe quedar
      // registrada con la tarea que le correspondía. Calcularla solo dentro del
      // `if (notify)` dejaba sin sugerencia justo a esas ventanas.
      const suggestion = nextDeepTask(tasks)
      const result = nextFocusState(stateRef.current, {
        now: Date.now(),
        optimal,
        suggestedTaskId: suggestion?.id ?? null,
      })
      stateRef.current = result.state
      setPhase(result.state.phase)
      // Se muestra la tarea REGISTRADA en la ventana, no la que sería la mejor
      // ahora: si divergieran, el panel nombraría una tarea distinta de la que
      // el reporte va a acreditar.
      const registrada = result.state.suggestedTaskId
      setSuggestedTask(
        result.state.phase === 'active' && registrada
          ? tasks.find((t) => t.id === registrada) || null
          : null
      )

      if (result.notify) {
        const body = suggestion
          ? `Tu entorno lleva ${holdLabel} en condiciones óptimas. Buen momento para: «${suggestion.title}».`
          : `Tu entorno lleva ${holdLabel} en condiciones óptimas. Buen momento para una tarea que exija concentración.`
        try {
          window.electronAPI?.notify?.('Ventana de concentración detectada', body, 'tasks')
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
    () => ({ phase, suggestedTask }),
    [phase, suggestedTask]
  )

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}

export function useFocus() {
  const ctx = useContext(FocusContext)
  if (!ctx) throw new Error('useFocus must be used within FocusProvider')
  return ctx
}
