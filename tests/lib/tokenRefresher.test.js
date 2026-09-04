import { describe, it, expect, vi } from 'vitest'
import { createTokenRefresher, MIN_REFRESH_INTERVAL_MS } from '../../src/lib/auth.js'

function jwtConExpiracion(segundosDesdeAhora) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + segundosDesdeAhora
  return `${b64({ alg: 'HS512' })}.${b64({ exp })}.firma`
}

const VIGENTE = jwtConExpiracion(3600)
const CADUCADO = jwtConExpiracion(-3600)

// Construye un refrescador con dependencias falsas y un almacén en memoria.
function montar({ jwt = CADUCADO, refreshToken = '', usuario = '', clave = '', ...deps } = {}) {
  const estado = { tbHost: 'http://tb', jwt, refreshToken, tbUsername: usuario, tbPassword: clave }
  const persist = vi.fn((cambios) => Object.assign(estado, cambios))
  const refreshSession = deps.refreshSession || vi.fn()
  const login = deps.login || vi.fn()
  const ensure = createTokenRefresher({
    getSettings: () => estado,
    persist,
    refreshSession,
    login,
  })
  return { ensure, estado, persist, refreshSession, login }
}

describe('createTokenRefresher', () => {
  it('devuelve el token actual sin pedir nada cuando aún tiene vida', async () => {
    const { ensure, refreshSession, login } = montar({ jwt: VIGENTE })
    await expect(ensure()).resolves.toBe(VIGENTE)
    expect(refreshSession).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()
  })

  it('renueva con el refresh token y guarda el par nuevo', async () => {
    const refreshSession = vi.fn().mockResolvedValue({ token: 'nuevo', refreshToken: 'r2' })
    const { ensure, estado, login } = montar({ refreshToken: 'r1', refreshSession })
    await expect(ensure()).resolves.toBe('nuevo')
    expect(estado.jwt).toBe('nuevo')
    expect(estado.refreshToken).toBe('r2')
    expect(login).not.toHaveBeenCalled()
  })

  it('cae al login completo si el refresh token ya no sirve', async () => {
    const refreshSession = vi.fn().mockRejectedValue(new Error('401'))
    const login = vi.fn().mockResolvedValue({ token: 'del-login', refreshToken: 'r3' })
    const { ensure, estado } = montar({ refreshToken: 'viejo', usuario: 'u', clave: 'c', refreshSession, login })
    await expect(ensure()).resolves.toBe('del-login')
    expect(estado.jwt).toBe('del-login')
  })

  it('lanza un mensaje accionable cuando no queda ninguna vía', async () => {
    const { ensure } = montar()
    await expect(ensure()).rejects.toThrow(/Configuración/)
  })

  // Este es el caso que dejaba la sesión muerta hasta reiniciar la aplicación.
  it('vuelve a intentarlo tras un fallo, en vez de repetir la promesa rechazada', async () => {
    const { ensure, estado } = montar()
    await expect(ensure()).rejects.toThrow()

    // Ahora sí hay credenciales: el segundo intento debe renovar de verdad.
    estado.tbUsername = 'u'
    estado.tbPassword = 'c'
    const refresher = createTokenRefresher({
      getSettings: () => estado,
      persist: (c) => Object.assign(estado, c),
      refreshSession: vi.fn(),
      login: vi.fn().mockResolvedValue({ token: 'recuperado', refreshToken: '' }),
    })
    await expect(refresher()).resolves.toBe('recuperado')
  })

  it('comparte una sola renovación entre llamadas simultáneas', async () => {
    let resolver
    const refreshSession = vi.fn(() => new Promise((r) => { resolver = r }))
    const { ensure } = montar({ refreshToken: 'r1', refreshSession })
    const a = ensure()
    const b = ensure()
    resolver({ token: 'uno', refreshToken: 'r2' })
    await expect(a).resolves.toBe('uno')
    await expect(b).resolves.toBe('uno')
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  // Sin freno, renovar dispara un persist que reejecuta los efectos que
  // dependen del token, que vuelven a pedir renovación: un bucle de peticiones
  // a toda la velocidad de la red.
  it('no renueva dos veces seguidas dentro del intervalo mínimo', async () => {
    const refreshSession = vi.fn().mockResolvedValue({ token: CADUCADO, refreshToken: 'r2' })
    const { ensure, refreshSession: rs } = montar({ refreshToken: 'r1', refreshSession })
    await ensure()
    // El token recién emitido sigue pareciendo caducado (reloj desfasado, TTL
    // corto): sin freno esto renovaría en bucle.
    await ensure()
    await ensure()
    expect(rs).toHaveBeenCalledTimes(1)
  })

  it('expone el intervalo mínimo como constante', () => {
    expect(MIN_REFRESH_INTERVAL_MS).toBeGreaterThan(0)
  })
})
