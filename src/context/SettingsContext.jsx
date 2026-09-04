import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { login as tbLogin, getDeviceByName, refreshSession } from '../lib/thingsboard'
import { createTokenRefresher } from '../lib/auth'

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

  // Renovación de la sesión en un único lugar. La máquina de decisión vive en
  // src/lib/auth.js con las dependencias inyectadas, para poder probarla sin
  // React ni red: ahí están el orden de los tres niveles, el freno anti-bucle y
  // el reparto de una sola renovación entre llamadas simultáneas.
  const ensureFreshTokenRef = useRef(null)
  if (!ensureFreshTokenRef.current) {
    ensureFreshTokenRef.current = createTokenRefresher({
      getSettings: () => settingsRef.current,
      persist: (cambios) => persist(cambios),
      refreshSession,
      login: tbLogin,
    })
  }
  const ensureFreshToken = useCallback((...args) => ensureFreshTokenRef.current(...args), [])

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
