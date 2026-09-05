// Resolución del token de dispositivo y publicación de telemetría a ThingsBoard.
// Usa el fetch nativo de Node: el simulador no añade dependencias.

function normalizeHost(host) {
  return (host || '').replace(/\/+$/, '')
}

async function tbFetch(host, path, { jwt, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (jwt) headers['X-Authorization'] = `Bearer ${jwt}`
  const res = await fetch(`${normalizeHost(host)}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(`ThingsBoard ${res.status}: ${res.statusText}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Obtiene el token de acceso del dispositivo. Prioriza la variable de entorno;
// si no está, inicia sesión y lo resuelve por REST, para no tener que copiarlo
// a mano desde la interfaz de ThingsBoard.
export async function resolveDeviceToken({ host, token, username, password, deviceName }) {
  if (token) return token
  if (!username || !password) {
    throw new Error(
      'Falta TB_DEVICE_TOKEN, o bien TB_USERNAME y TB_PASSWORD para resolverlo automáticamente.'
    )
  }

  const { token: jwt } = await tbFetch(host, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

  const device = await tbFetch(
    host,
    `/api/tenant/devices?deviceName=${encodeURIComponent(deviceName)}`,
    { jwt }
  )
  const deviceId = device?.id?.id
  if (!deviceId) throw new Error(`No se encontró el dispositivo "${deviceName}".`)

  const credentials = await tbFetch(host, `/api/device/${deviceId}/credentials`, { jwt })
  if (!credentials?.credentialsId) {
    throw new Error('El dispositivo no tiene un token de acceso configurado.')
  }
  return credentials.credentialsId
}

// Publica un punto de telemetría con marca de tiempo propia. Enviar el ts evita
// que ThingsBoard selle con la hora del servidor, que es el origen del desfase
// horario documentado en el roadmap del proyecto.
export async function publish({ host, token, ts, values }) {
  const res = await fetch(`${normalizeHost(host)}/api/v1/${token}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts, values }),
  })
  if (!res.ok) throw new Error(`Publicación fallida: ${res.status} ${res.statusText}`)
}
