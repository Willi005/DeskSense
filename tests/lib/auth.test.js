import { describe, it, expect } from 'vitest'
import { jwtExpiresAt, needsRefresh, REFRESH_MARGIN_MS } from '../../src/lib/auth.js'

// Construye un JWT de mentira con la carga indicada. Solo interesa la parte
// central: la firma no se valida aquí, la valida ThingsBoard.
function fakeJwt(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS512' })}.${b64(payload)}.firma`
}

describe('jwtExpiresAt', () => {
  it('lee la expiración y la devuelve en milisegundos', () => {
    const exp = 1788470000
    expect(jwtExpiresAt(fakeJwt({ exp }))).toBe(exp * 1000)
  })

  it('devuelve null ante un token ilegible en vez de lanzar', () => {
    expect(jwtExpiresAt('')).toBeNull()
    expect(jwtExpiresAt(null)).toBeNull()
    expect(jwtExpiresAt('no-es-un-jwt')).toBeNull()
    expect(jwtExpiresAt('a.b.c')).toBeNull()
    expect(jwtExpiresAt(fakeJwt({ sub: 'sin exp' }))).toBeNull()
  })
})

describe('needsRefresh', () => {
  const ahora = 1_700_000_000_000

  it('no refresca un token con vida de sobra', () => {
    const jwt = fakeJwt({ exp: (ahora + 60 * 60 * 1000) / 1000 })
    expect(needsRefresh(jwt, ahora)).toBe(false)
  })

  it('refresca antes de que expire, no después', () => {
    // Justo dentro del margen: todavía es válido, pero se renueva ya para que
    // ninguna petición salga con un token a punto de morir.
    const jwt = fakeJwt({ exp: (ahora + REFRESH_MARGIN_MS - 1000) / 1000 })
    expect(needsRefresh(jwt, ahora)).toBe(true)
  })

  it('refresca un token ya expirado', () => {
    const jwt = fakeJwt({ exp: (ahora - 1000) / 1000 })
    expect(needsRefresh(jwt, ahora)).toBe(true)
  })

  it('refresca cuando no hay token', () => {
    expect(needsRefresh('', ahora)).toBe(true)
    expect(needsRefresh(null, ahora)).toBe(true)
  })

  it('refresca cuando el token es ilegible: mejor renovar que fallar', () => {
    expect(needsRefresh('basura', ahora)).toBe(true)
    expect(needsRefresh(fakeJwt({ sub: 'sin exp' }), ahora)).toBe(true)
  })
})
