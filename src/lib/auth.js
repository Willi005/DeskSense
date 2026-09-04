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
