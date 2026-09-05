// ThingsBoard REST helpers. The desktop app talks directly to the TB instance
// (CORS is disabled in the Electron BrowserWindow via webSecurity:false).

function normalizeHost(host) {
  return (host || '').replace(/\/+$/, '')
}

async function tbFetch(host, path, { jwt, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (jwt) headers['X-Authorization'] = `Bearer ${jwt}`
  const res = await fetch(`${normalizeHost(host)}${path}`, { ...options, headers })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body.message || JSON.stringify(body)
    } catch {
      detail = res.statusText
    }
    throw new Error(`ThingsBoard ${res.status}: ${detail}`)
  }
  // Some endpoints return empty bodies
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// POST /api/auth/login -> { token, refreshToken }
export async function login(host, username, password) {
  const data = await tbFetch(host, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return data // { token, refreshToken }
}

// POST /api/auth/token -> { token, refreshToken }
// Renueva la sesión sin volver a pedir usuario y contraseña. El refresh token
// dura mucho más que el JWT (7 días frente a 150 minutos), así que basta con
// esto para que la aplicación no exija iniciar sesión cada dos horas y media.
export async function refreshSession(host, refreshToken) {
  const data = await tbFetch(host, '/api/auth/token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  })
  return data // { token, refreshToken }
}

// Resolve a device UUID from its name (needs JWT with tenant rights).
// GET /api/tenant/devices?deviceName=...
// ThingsBoard's NULL_UUID, used when a user has no assigned customer.
const NULL_UUID = '13814000-1dd2-11b2-8080-808080808080'

// GET /api/auth/user -> current user (authority, customerId, tenantId)
export async function getCurrentUser(host, jwt) {
  return tbFetch(host, '/api/auth/user', { jwt })
}

// Resolve a device UUID from its name. Works for both Tenant Admins and
// Customer Users by trying several endpoints in order.
export async function getDeviceByName(host, jwt, deviceName) {
  // 1) Tenant admin: exact-name endpoint (returns a single device object).
  try {
    const data = await tbFetch(
      host,
      `/api/tenant/devices?deviceName=${encodeURIComponent(deviceName)}`,
      { jwt }
    )
    if (data?.id?.id) return data.id.id
  } catch {
    /* not a tenant admin or device not under tenant scope — keep trying */
  }

  // Figure out who we are to pick the right scoped endpoint.
  let customerId = null
  try {
    const user = await getCurrentUser(host, jwt)
    customerId = user?.customerId?.id
  } catch {
    /* ignore */
  }

  const findInPage = (page) =>
    (page?.data || []).find((d) => d.name === deviceName) || null

  // 2) Customer user: search the customer's devices by text and match by name.
  if (customerId && customerId !== NULL_UUID) {
    const params = new URLSearchParams({
      pageSize: '200',
      page: '0',
      textSearch: deviceName,
    })
    try {
      const page = await tbFetch(
        host,
        `/api/customer/${customerId}/devices?${params.toString()}`,
        { jwt }
      )
      const match = findInPage(page)
      if (match?.id?.id) return match.id.id
    } catch {
      /* fall through */
    }
  }

  // 3) Tenant paged search fallback (servers where the exact endpoint differs).
  try {
    const params = new URLSearchParams({
      pageSize: '200',
      page: '0',
      textSearch: deviceName,
    })
    const page = await tbFetch(host, `/api/tenant/devices?${params.toString()}`, {
      jwt,
    })
    const match = findInPage(page)
    if (match?.id?.id) return match.id.id
  } catch {
    /* fall through */
  }

  throw new Error(
    `No se encontró un dispositivo llamado "${deviceName}" accesible con este usuario. ` +
      'Verifica el nombre exacto, o pega el Device ID manualmente.'
  )
}

// GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries
// keys: array, startTs/endTs: ms epoch.
// opts: { limit, agg, interval }
//  - Sin agg: datos crudos limitados a `limit` (devuelve los MÁS RECIENTES, por
//    lo que en rangos largos con publicación frecuente solo se ve el final).
//  - Con agg (p. ej. 'AVG') + interval (ms): el servidor agrega en cubos a lo
//    largo de TODO el rango, cubriendo la ventana completa con pocos puntos.
export async function getTimeseries(host, jwt, deviceId, keys, startTs, endTs, opts = {}) {
  const { limit = 5000, agg, interval } = opts
  const params = new URLSearchParams({
    keys: keys.join(','),
    startTs: String(startTs),
    endTs: String(endTs),
    limit: String(limit),
    orderBy: 'ASC',
  })
  if (agg) params.set('agg', agg)
  if (interval) params.set('interval', String(interval))
  const data = await tbFetch(
    host,
    `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?${params.toString()}`,
    { jwt }
  )
  // Shape: { key: [{ ts, value }] }
  return data || {}
}

// GET latest values for all keys (fallback when WS is not connected yet).
export async function getLatest(host, jwt, deviceId, keys) {
  const params = new URLSearchParams({ keys: keys.join(',') })
  const data = await tbFetch(
    host,
    `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?${params.toString()}`,
    { jwt }
  )
  const out = {}
  for (const [k, arr] of Object.entries(data || {})) {
    if (arr?.length) out[k] = { ts: arr[0].ts, value: Number(arr[0].value) }
  }
  return out
}

export function wsUrl(host) {
  const base = normalizeHost(host)
  return base.replace(/^http/, 'ws') + '/api/ws/plugins/telemetry'
}
