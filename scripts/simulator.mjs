// Simulador de telemetría de DeskSense. Publica a ThingsBoard como si fuera el
// ESP32, replicando su cadencia y su lógica de ahorro: sin presencia solo envía
// la distancia; con presencia envía el conjunto completo de sensores.
//
// Uso:
//   node scripts/simulator.mjs --escenario=optimo
//   node scripts/simulator.mjs --escenario=jornada --acelerado=120 --ciclos=2400
import { readFileSync, existsSync } from 'node:fs'
import { sampleScenario, SCENARIO_NAMES } from './simulator/scenarios.mjs'
import { resolveDeviceToken, publish } from './simulator/device.mjs'

const PUBLISH_INTERVAL_MS = 3000 // misma cadencia que el firmware
const PRESENCE_DISTANCE_CM = 80

function parseArgs(argv) {
  const args = {}
  for (const arg of argv.slice(2)) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    args[key] = value
  }
  return args
}

// Lector mínimo de .env: el simulador no depende de dotenv.
function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '')
  }
}

// Presencia con histéresis, igual que el firmware: entra de inmediato, sale solo
// tras varias lecturas consecutivas sin detección.
function makePresence() {
  let present = true
  let absentStreak = 0
  return (tick) => {
    // Ausencias periódicas: una pausa de unos minutos cada media hora simulada.
    const shouldBeAbsent = tick % 600 > 540
    if (shouldBeAbsent) {
      absentStreak += 1
      if (absentStreak >= 5) present = false
    } else {
      absentStreak = 0
      present = true
    }
    return present
  }
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv)
  const scenario = args.escenario || 'optimo'

  if (!SCENARIO_NAMES.includes(scenario)) {
    console.error(`Escenario desconocido: "${scenario}". Válidos: ${SCENARIO_NAMES.join(', ')}`)
    process.exit(1)
  }

  const speed = Number(args.acelerado || 1)
  const cycles = args.ciclos ? Number(args.ciclos) : Infinity
  const host = process.env.TB_HOST || 'http://200.13.5.20:8080'
  const deviceName = process.env.TB_DEVICE_NAME || 'monitoreo-escritorio'

  const token = await resolveDeviceToken({
    host,
    token: process.env.TB_DEVICE_TOKEN,
    username: process.env.TB_USERNAME,
    password: process.env.TB_PASSWORD,
    deviceName,
  })

  console.log(`Simulando "${scenario}" hacia ${host} (aceleración ×${speed}).`)
  console.log('Ctrl+C para detener.')

  const presenceOf = makePresence()
  // Con aceleración, se retrocede el inicio para que el historial generado quede
  // en el pasado y termine en el momento actual.
  const wallClockMs = Math.min(cycles, 100000) * PUBLISH_INTERVAL_MS * speed
  let simulatedTs = Date.now() - (speed > 1 ? wallClockMs : 0)

  for (let tick = 0; tick < cycles; tick++) {
    const present = presenceOf(tick)
    const sample = sampleScenario(scenario, tick)

    // Lógica anti-derroche del firmware: sin presencia solo se reporta distancia.
    const values = present
      ? { ...sample, distancia: sample.distancia, presencia: 1 }
      : { distancia: PRESENCE_DISTANCE_CM + 60, presencia: 0 }

    try {
      await publish({ host, token, ts: simulatedTs, values })
      if (tick % 20 === 0) {
        const stamp = new Date(simulatedTs).toLocaleTimeString('es-CL')
        console.log(`[${stamp}] tick ${tick} · presencia=${present ? 'sí' : 'no'}`)
      }
    } catch (err) {
      console.warn(`tick ${tick}: ${err.message}`)
    }

    simulatedTs += PUBLISH_INTERVAL_MS * speed
    if (speed === 1) await new Promise((r) => setTimeout(r, PUBLISH_INTERVAL_MS))
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
