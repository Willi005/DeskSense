import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { login as tbLogin, getDeviceByName, refreshSession } from '../lib/thingsboard'
import { needsRefresh } from '../lib/auth'

const STORAGE_KEY = 'monitoreo-settings'

const DEFAULTS = {
  tbHost: 'http://200.13.5.20:8080',
  tbUsername: '',
  tbPassword: '',
  jwt: '',
  // Permite renovar la sesión sin volver a pedir credenciales. Dura 7 días,
  // frente a los 150 minutos del JWT.
  refreshToken: '',
  deviceName: '',
  deviceId: '',
  deviceAccessToken: '',
  // ---- Asistente de IA ----
  // Modelo activo (ver src/lib/models.js). Por defecto Gemini 2.5 Flash.
  aiModelId: 'gemini-2.5-flash',
  // Las API keys se leen de variables de entorno o se ingresan en la app.
  // Nunca deben quedar escritas en el código fuente.
  openrouterApiKey: import.meta.env?.VITE_OPENROUTER_API_KEY || '',
  anthropicApiKey: import.meta.env?.VITE_ANTHROPIC_API_KEY || '',
  // Alertas automáticas cuando una métrica llega a nivel alto/crítico.
  alertsEnabled: true,
  // Ventanas de concentración: avisa cuando se detecta entorno óptimo sostenido.
  focusEnabled: true,
  // ---- Apariencia ----
  // Tema visual: 'dark' (por defecto) o 'light' (glass blanco).
  theme: 'dark',
  // Claves de sensores deshabilitados: su tarjeta del Dashboard se muestra en
  // estado pausado y no dispara alertas.
  disabledSensors: [],
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load)

  // Espejo del estado para que `ensureFreshToken` lea siempre los valores
  // actuales: es un callback estable que, si cerrara sobre `settings`, renovaría
  // usando el token de un render viejo.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const persist = useCallback((next) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      } catch {
        /* storage may be unavailable */
      }
      return merged
    })
  }, [])

  // Authenticate with ThingsBoard, store JWT and resolve the device UUID.
  const connect = useCallback(async ({ tbHost, tbUsername, tbPassword, deviceName }) => {
    const { token, refreshToken } = await tbLogin(tbHost, tbUsername, tbPassword)
    // Persist the JWT immediately so it is kept even if device lookup fails.
    persist({
      tbHost,
      tbUsername,
      tbPassword,
      deviceName,
      jwt: token,
      refreshToken: refreshToken || '',
      deviceId: '',
    })
    // Resolve the device; capture (not throw) the reason so the UI can show the
    // JWT and explain the device problem at the same time.
    try {
      const deviceId = await getDeviceByName(tbHost, token, deviceName)
      persist({ deviceId })
      return { token, deviceId, error: null }
    } catch (e) {
      return { token, deviceId: '', error: e.message || 'No se pudo resolver el dispositivo' }
    }
  }, [persist])

  // Renovación de la sesión en un único lugar. Devuelve siempre un JWT utilizable
  // o lanza si ya no hay forma de conseguirlo.
  //
  // Tres niveles, del más barato al más caro:
  //   1. El token vigente, si le queda vida.
  //   2. Renovación con el refresh token (una petición, sin credenciales).
  //   3. Login completo con el usuario y la contraseña guardados.
  //
  // Sin esto, el JWT moría a las 2,5 horas y la aplicación se quedaba mostrando
  // "Sin datos" hasta que alguien volvía a conectar a mano desde Configuración.
  const refreshing = useRef(null)

  const ensureFreshToken = useCallback(async () => {
    const actual = settingsRef.current
    if (!needsRefresh(actual.jwt)) return actual.jwt

    // Varias llamadas simultáneas (WebSocket + Reportes + Historial) deben
    // compartir una única renovación, no disparar una cada una.
    if (refreshing.current) return refreshing.current

    refreshing.current = (async () => {
      try {
        if (actual.refreshToken) {
          try {
            const datos = await refreshSession(actual.tbHost, actual.refreshToken)
            persist({ jwt: datos.token, refreshToken: datos.refreshToken || '' })
            return datos.token
          } catch {
            // El refresh token también caducó: se sigue al login completo.
          }
        }

        if (actual.tbUsername && actual.tbPassword) {
          const datos = await tbLogin(actual.tbHost, actual.tbUsername, actual.tbPassword)
          persist({ jwt: datos.token, refreshToken: datos.refreshToken || '' })
          return datos.token
        }

        throw new Error('La sesión expiró. Vuelve a conectar desde Configuración.')
      } finally {
        refreshing.current = null
      }
    })()

    return refreshing.current
  }, [persist])

  const isConfigured = Boolean(settings.jwt && settings.deviceId)

  return (
    <SettingsContext.Provider value={{ settings, update: persist, connect, ensureFreshToken, isConfigured }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
