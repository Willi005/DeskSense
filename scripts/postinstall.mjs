// Repara la instalación de Electron en Linux. El postinstall del propio paquete
// descarga el ZIP a ~/.cache/electron pero termina con código 0 sin extraerlo,
// dejando node_modules/electron/dist vacío y la aplicación imposible de arrancar.
// Este script es idempotente y nunca falla: si no puede reparar, avisa y sale
// con código 0 para no romper `npm install` en otras plataformas.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  chmodSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const electronDir = join(process.cwd(), 'node_modules', 'electron')
const distDir = join(electronDir, 'dist')
const binary = join(distDir, 'electron')
const pathFile = join(electronDir, 'path.txt')

// El binario puede estar bien extraído pero con path.txt mal escrito, lo que
// rompe require('electron') sin que nada más lo delate. La comparación es
// EXACTA, sin trim: `index.js` de electron concatena el contenido tal cual, así
// que un salto de línea final basta para romper la resolución del módulo.
function isHealthy() {
  if (!existsSync(binary)) return false
  try {
    return readFileSync(pathFile, 'utf8') === 'electron'
  } catch {
    return false
  }
}

// Extractores del sistema, en orden de preferencia. Deliberadamente NO se usa
// extract-zip: su dependencia transitiva fd-slicer, sin mantenimiento desde
// 2016, se cuelga a mitad del ZIP con Node 26 sin emitir error ni fin de flujo.
// Esa es exactamente la causa de que el postinstall del propio Electron termine
// con código 0 sin extraer nada, que es el fallo que este script repara.
const EXTRACTORS = [
  { cmd: 'unzip', args: (zip, dir) => ['-q', '-o', zip, '-d', dir] },
  { cmd: 'bsdtar', args: (zip, dir) => ['xf', zip, '-C', dir] },
]

function extract(zip, dir) {
  for (const { cmd, args } of EXTRACTORS) {
    try {
      execFileSync(cmd, args(zip, dir), { stdio: 'ignore' })
      if (existsSync(join(dir, 'electron'))) return cmd
    } catch {
      // Extractor ausente o fallido: se prueba el siguiente.
    }
  }
  return null
}

// Versión de Electron que este proyecto espera, leída de su propio package.json.
function installedVersion() {
  try {
    return JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version || null
  } catch {
    return null
  }
}

// Busca en la caché el ZIP de la versión exacta que el proyecto necesita. La
// caché de Electron es COMPARTIDA entre todos los proyectos de la máquina y usa
// un directorio por hash de descarga, así que puede contener ZIPs de varias
// versiones a la vez: coger el primero que aparezca instalaría en silencio el
// Electron de otro proyecto. Si no se puede determinar la versión esperada, se
// prefiere no reparar antes que instalar una versión desconocida.
function findCachedZip() {
  const version = installedVersion()
  if (!version) return null

  const cacheRoot = join(homedir(), '.cache', 'electron')
  if (!existsSync(cacheRoot)) return null

  const wanted = `electron-v${version}-linux-x64.zip`
  for (const entry of readdirSync(cacheRoot)) {
    let files = []
    try {
      files = readdirSync(join(cacheRoot, entry))
    } catch {
      continue
    }
    if (files.includes(wanted)) return join(cacheRoot, entry, wanted)
  }
  return null
}

async function main() {
  if (process.platform !== 'linux') return
  if (!existsSync(electronDir)) return
  if (isHealthy()) return

  // Binario correcto pero path.txt corrupto: basta con reescribirlo.
  if (existsSync(binary)) {
    writeFileSync(pathFile, 'electron')
    console.log('[postinstall] path.txt de Electron corregido.')
    return
  }

  const zip = findCachedZip()
  if (!zip) {
    console.warn(
      '[postinstall] Falta el binario de Electron y no hay en la caché un ZIP de la versión esperada. Ejecuta: npm rebuild electron && npm run postinstall'
    )
    return
  }

  mkdirSync(distDir, { recursive: true })
  const used = extract(zip, distDir)
  if (!used) {
    console.warn(
      '[postinstall] No se pudo extraer el binario de Electron. Instala unzip o bsdtar y ejecuta: npm run postinstall'
    )
    return
  }

  chmodSync(binary, 0o755)
  // `index.js` de electron resuelve el binario como
  // path.join(__dirname, 'dist', <contenido de path.txt>), así que este archivo
  // debe contener SOLO el nombre del ejecutable. Escribir 'dist/electron' aquí
  // produce la ruta duplicada 'dist/dist/electron' y rompe `require('electron')`,
  // es decir `npm run dev` y `npm start`, aunque el binario esté bien extraído.
  writeFileSync(pathFile, 'electron')
  console.log(`[postinstall] Binario de Electron extraído desde la caché (${used}).`)
}

main().catch((err) => {
  console.warn('[postinstall] No se pudo reparar Electron:', err.message)
})
