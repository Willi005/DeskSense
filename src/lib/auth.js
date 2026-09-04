// Vigencia del JWT de ThingsBoard. Lógica pura, sin red ni React, para poder
// decidir cuándo renovar sin depender de que una petición falle primero.
//
// El JWT de ThingsBoard dura 150 minutos y su refresh token 7 días (medido
// contra el servidor del proyecto). Renovar a tiempo evita el 401 que dejaba la
// aplicación mostrando "Sin datos" hasta que alguien volvía a iniciar sesión.

// Cuánto antes de la expiración se renueva. Un margen amplio cubre relojes
// ligeramente desfasados y peticiones lentas: no sirve de nada un token que
// caduca mientras la petición viaja.
export const REFRESH_MARGIN_MS = 5 * 60 * 1000

// Instante de expiración del token, en milisegundos, o null si no se puede leer.
// Nunca lanza: un token ilegible es un caso a manejar, no un error del programa.
export function jwtExpiresAt(jwt) {
  if (typeof jwt !== 'string' || !jwt) return null
  const partes = jwt.split('.')
  if (partes.length !== 3) return null
  try {
    // base64url → base64 antes de decodificar.
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const carga = JSON.parse(atob(base64))
    return typeof carga?.exp === 'number' ? carga.exp * 1000 : null
  } catch {
    return null
  }
}

// Ante la duda, renovar: un token que no se puede interpretar se trata como
// vencido. Renovar de más cuesta una petición; renovar de menos deja la
// aplicación sin datos sin explicar por qué.
export function needsRefresh(jwt, now = Date.now(), margin = REFRESH_MARGIN_MS) {
  const expira = jwtExpiresAt(jwt)
  if (expira == null) return true
  return expira - now <= margin
}

// Tiempo mínimo entre dos renovaciones. Es un freno, no una optimización:
// renovar guarda el token nuevo, eso reejecuta los efectos que dependen de él, y
// esos vuelven a pedir renovación. Si el token recién emitido sigue pareciendo
// vencido —reloj del equipo desfasado, TTL del servidor más corto que el margen,
// o un `exp` ilegible— el ciclo no se cierra solo y machaca la red a toda
// velocidad.
export const MIN_REFRESH_INTERVAL_MS = 10 * 1000

// Renovador de sesión con las dependencias inyectadas, para poder probar la
// máquina de decisión sin React ni red.
//
// Tres niveles, del más barato al más caro: token vigente → refresh token →
// login completo con las credenciales guardadas.
export function createTokenRefresher({ getSettings, persist, refreshSession, login }) {
  let pendiente = null
  let ultimaRenovacion = 0

  return async function ensureFreshToken() {
    const actual = getSettings()
    if (!needsRefresh(actual.jwt)) return actual.jwt

    // Varias llamadas simultáneas (WebSocket + Reportes + Historial) comparten
    // una única renovación en vez de disparar una cada una.
    if (pendiente) return pendiente

    // Freno anti-bucle: se devuelve el token que haya, aunque esté vencido. Una
    // petición que falla con 401 es un problema acotado; un bucle de renovación
    // es un problema que crece.
    const ahora = Date.now()
    if (ahora - ultimaRenovacion < MIN_REFRESH_INTERVAL_MS) return actual.jwt
    ultimaRenovacion = ahora

    const promesa = (async () => {
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
        const datos = await login(actual.tbHost, actual.tbUsername, actual.tbPassword)
        persist({ jwt: datos.token, refreshToken: datos.refreshToken || '' })
        return datos.token
      }

      throw new Error('La sesión expiró. Vuelve a conectar desde Configuración.')
    })()

    // La limpieza se engancha DESPUÉS de guardar la promesa. Al revés, un fallo
    // inmediato limpiaba el hueco antes de que se asignara y dejaba dentro la
    // promesa ya rechazada: todas las llamadas posteriores recibían ese mismo
    // rechazo sin intentar nada, y la sesión no se recuperaba ni volviendo a
    // introducir las credenciales. Solo se arreglaba reiniciando la aplicación.
    pendiente = promesa
    promesa
      .catch(() => {})
      .finally(() => {
        if (pendiente === promesa) pendiente = null
      })

    return promesa
  }
}
