import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react'
import { useSettings } from './SettingsContext'
import { TbWebSocket } from '../lib/thingsboardWs'
import { getLatest } from '../lib/thingsboard'
import { TELEMETRY_KEYS, derivePresence } from '../lib/sensors'

const MAX_POINTS = 60 // rolling window for live mini-charts

const TelemetryContext = createContext(null)

export function TelemetryProvider({ children }) {
  const { settings, isConfigured, ensureFreshToken } = useSettings()
  const [latest, setLatest] = useState({}) // { key: { ts, value } }
  const [history, setHistory] = useState(() =>
    Object.fromEntries(TELEMETRY_KEYS.map((k) => [k, []]))
  ) // { key: [{ ts, value }] }
  const [status, setStatus] = useState('idle')
  const wsRef = useRef(null)

  // Coalesce incoming WS frames into a single state update per animation frame
  // so bursts of telemetry don't trigger a render storm.
  const bufferRef = useRef({}) // { key: [{ ts, value }] }
  // Momento en que llegó el último dato, según el reloj LOCAL. `lastUpdate` usa
  // el `ts` del dispositivo (su NTP, o el del servidor de ThingsBoard), así que
  // no sirve para medir antigüedad: comparar ese sello contra Date.now() mezcla
  // dos relojes y un desfase entre ellos falsea la vigencia de los datos.
  const [lastArrival, setLastArrival] = useState(0)
  const rafRef = useRef(null)
  const timeoutRef = useRef(null)

  const flush = useCallback(() => {
    // Cancela ambos planificadores: el que no haya disparado queda obsoleto.
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const buffer = bufferRef.current
    bufferRef.current = {}
    const keys = Object.keys(buffer)
    if (!keys.length) return

    setLatest((prev) => {
      const next = { ...prev }
      for (const key of keys) {
        const points = buffer[key]
        next[key] = points[points.length - 1]
      }
      return next
    })
    setHistory((prev) => {
      const next = { ...prev }
      for (const key of keys) {
        const points = buffer[key].filter((p) => typeof p.value === 'number')
        if (!points.length) continue
        next[key] = [...(next[key] || []), ...points].slice(-MAX_POINTS)
      }
      return next
    })
  }, [])

  const ingest = useCallback(
    (parsed) => {
      setLastArrival(Date.now())
      const buffer = bufferRef.current
      for (const [key, point] of Object.entries(parsed)) {
        ;(buffer[key] ||= []).push(point)
      }
      // rAF para fluidez cuando la ventana es visible; un setTimeout de respaldo
      // garantiza el volcado aunque la ventana esté minimizada (rAF se pausa
      // mientras la página no es visible).
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush)
      }
      if (timeoutRef.current == null) {
        timeoutRef.current = setTimeout(flush, 250)
      }
    },
    [flush]
  )

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const { tbHost, jwt, deviceId } = settings

  useEffect(() => {
    if (!isConfigured) {
      setStatus('idle')
      return
    }

    let cancelled = false

    // Seed current values from REST so the UI is populated immediately.
    ensureFreshToken()
      .then((token) => getLatest(tbHost, token, deviceId, TELEMETRY_KEYS))
      .then((seed) => {
        if (!cancelled && seed && Object.keys(seed).length) ingest(seed)
      })
      .catch(() => {})

    const ws = new TbWebSocket({
      host: tbHost,
      jwt,
      // Cada (re)conexión pide un token vigente. Es lo que evita que una
      // expiración deje el WebSocket reintentando para siempre con un token
      // muerto, sin datos y sin explicación visible.
      getJwt: ensureFreshToken,
      deviceId,
      onData: (parsed) => !cancelled && ingest(parsed),
      onStatus: (s) => !cancelled && setStatus(s),
    })
    ws.connect()
    wsRef.current = ws

    return () => {
      cancelled = true
      ws.close()
      wsRef.current = null
    }
    // `jwt` NO está en las dependencias a propósito: el socket pide su propio
    // token vigente en cada conexión vía `getJwt`. Incluirlo derribaba y
    // reabría la conexión en cada renovación, y realimentaba el ciclo
    // renovar → guardar → reconectar → renovar.
  }, [isConfigured, tbHost, deviceId, ingest, ensureFreshToken])

  // Derived values recomputed only when `latest` changes (once per frame).
  const { values, presence, lastUpdate } = useMemo(() => {
    const vals = {}
    let last = 0
    for (const [k, v] of Object.entries(latest)) {
      vals[k] = v?.value
      if (v?.ts && v.ts > last) last = v.ts
    }
    // Prefer the explicit `presencia` flag sent by the device; fall back to
    // deriving it from the HC-SR04 distance.
    const pres =
      latest.presencia?.value != null
        ? latest.presencia.value > 0
        : derivePresence(latest.distancia?.value)
    return { values: vals, presence: pres, lastUpdate: last }
  }, [latest])

  const ctxValue = useMemo(
    () => ({ latest, values, history, status, presence, lastUpdate, lastArrival, isConfigured }),
    [latest, values, history, status, presence, lastUpdate, lastArrival, isConfigured]
  )

  return <TelemetryContext.Provider value={ctxValue}>{children}</TelemetryContext.Provider>
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext)
  if (!ctx) throw new Error('useTelemetry must be used within TelemetryProvider')
  return ctx
}
