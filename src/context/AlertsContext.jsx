import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useTelemetry } from './TelemetryContext'
import { useSettings } from './SettingsContext'
import { SENSORS, classify, WATCH_KEYS } from '../lib/sensors'
import { resolveModel } from '../lib/models'
import { generateAlertAdvice } from '../lib/ai'

const COOLDOWN_MS = 5 * 60 * 1000 // no repetir la misma métrica antes de 5 min
const MAX_TOASTS = 3

// Consejo de respaldo si no hay API key configurada.
const FALLBACK_ADVICE = {
  temperatura: 'Ajusta la climatización o ventila para volver al rango cómodo (20–24 °C).',
  humedad: 'Regula la humedad (humidificador o ventilación) hacia el rango ideal de 40–60 %.',
  luz: 'Ajusta la iluminación hasta un nivel cómodo para trabajar (50–80 %).',
  ruido: 'Reduce el ruido o usa audífonos; busca un entorno más silencioso para concentrarte.',
  pm25: 'Ventila el espacio o enciende un purificador de aire y evita fuentes de partículas.',
  pm1: 'Ventila y aleja fuentes de humo o combustión cercanas.',
  pm10: 'Ventila y reduce el polvo y los alérgenos; considera un purificador de aire.',
}

const AlertsContext = createContext(null)

export function AlertsProvider({ children }) {
  const { values, presence } = useTelemetry()
  const { settings } = useSettings()
  const [alerts, setAlerts] = useState([])
  const prevLevels = useRef({})
  const lastAlert = useRef({})
  const seeded = useRef(false)

  const dismiss = useCallback((id) => setAlerts((a) => a.filter((x) => x.id !== id)), [])

  const fireNotification = useCallback((title, body) => {
    try {
      // Ruta principal: notificación nativa vía proceso principal de Electron
      // (toast de Windows fiable). Cae a la API web solo si no está disponible.
      if (typeof window !== 'undefined' && window.electronAPI?.notify) {
        window.electronAPI.notify(title, body)
        return
      }
      if (typeof Notification === 'undefined') return
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification(title, { body })
        })
      }
    } catch {
      /* notificaciones no disponibles */
    }
  }, [])

  const triggerAlert = useCallback(
    async (sensorKey, level, snapshot) => {
      const sensor = SENSORS[sensorKey]
      const id = `${sensorKey}-${Date.now()}`
      const title = `${sensor.label}: ${level.label}`

      // Nota en pantalla inmediata (estado "cargando"), una por métrica, máx 3.
      setAlerts((prev) =>
        [
          { id, sensorKey, level, title, advice: '', loading: true },
          ...prev.filter((a) => a.sensorKey !== sensorKey),
        ].slice(0, MAX_TOASTS)
      )

      fireNotification(
        `⚠️ ${title}`,
        'Revisa la recomendación del asistente en pantalla para mejorar tu entorno.'
      )

      const active = resolveModel(settings)
      let advice = FALLBACK_ADVICE[sensorKey] || 'Revisa este parámetro para mejorar tu entorno.'
      if (active.apiKey) {
        try {
          advice = await generateAlertAdvice({
            provider: active.provider,
            apiKey: active.apiKey,
            model: active.model,
            values: snapshot,
            sensorKey,
            levelLabel: level.label,
            disabled: settings.disabledSensors || [],
          })
        } catch {
          /* se mantiene el consejo de respaldo */
        }
      }
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, advice, loading: false } : a)))
    },
    [settings, fireNotification]
  )

  useEffect(() => {
    if (settings.alertsEnabled === false) return
    if (presence === false) return // datos pausados: no tiene sentido alertar

    const firstRun = !seeded.current
    let sawData = false
    const now = Date.now()
    const disabled = settings.disabledSensors || []

    for (const key of WATCH_KEYS) {
      if (disabled.includes(key)) continue // sensor apagado en Apariencia
      const v = values[key]
      if (v == null) continue
      sawData = true
      const level = classify(key, v)
      const cur = level.id
      const prev = prevLevels.current[key]
      prevLevels.current[key] = cur

      // En la primera lectura solo memorizamos el estado, sin alertar, para no
      // disparar una ráfaga de avisos al abrir la app.
      if (firstRun) continue

      const isAlert = cur === 'bad' || cur === 'severe'
      const wasAlert = prev === 'bad' || prev === 'severe'
      const escalated = cur === 'severe' && prev !== 'severe'
      if (isAlert && (!wasAlert || escalated) && now - (lastAlert.current[key] || 0) > COOLDOWN_MS) {
        lastAlert.current[key] = now
        triggerAlert(key, level, { ...values })
      }
    }

    if (firstRun && sawData) seeded.current = true
  }, [values, presence, settings.alertsEnabled, settings.disabledSensors, triggerAlert])

  return <AlertsContext.Provider value={{ alerts, dismiss }}>{children}</AlertsContext.Provider>
}

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider')
  return ctx
}
