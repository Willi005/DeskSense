// Repara la instalación de Electron en Linux. El postinstall del propio paquete
// descarga el ZIP a ~/.cache/electron pero termina con código 0 sin extraerlo,
// dejando node_modules/electron/dist vacío y la aplicación imposible de arrancar.
// Este script es idempotente y nunca falla: si no puede reparar, avisa y sale
// con código 0 para no romper `npm install` en otras plataformas.
import { existsSync, mkdirSync, readdirSync, chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const electronDir = join(process.cwd(), 'node_modules', 'electron')
const distDir = join(electronDir, 'dist')
const binary = join(distDir, 'electron')

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

// Busca el ZIP ya descargado en la caché de Electron. La caché usa un directorio
// por hash de descarga, así que hay que recorrerlos.
function findCachedZip() {
  const cacheRoot = join(homedir(), '.cache', 'electron')
  if (!existsSync(cacheRoot)) return null
  for (const entry of readdirSync(cacheRoot)) {
    let files = []
    try {
      files = readdirSync(join(cacheRoot, entry))
    } catch {
      continue
    }
    const zip = files.find((f) => f.startsWith('electron-v') && f.endsWith('-linux-x64.zip'))
    if (zip) return join(cacheRoot, entry, zip)
  }
  return null
}

async function main() {
  if (process.platform !== 'linux') return
  if (!existsSync(electronDir)) return
  if (existsSync(binary)) return

  const zip = findCachedZip()
  if (!zip) {
    console.warn(
      '[postinstall] Falta el binario de Electron y no hay ZIP en la caché. Ejecuta: npm rebuild electron'
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
  // electron-builder y el cargador del paquete leen esta ruta.
  writeFileSync(join(electronDir, 'path.txt'), 'dist/electron')
  console.log(`[postinstall] Binario de Electron extraído desde la caché (${used}).`)
}

main().catch((err) => {
  console.warn('[postinstall] No se pudo reparar Electron:', err.message)
})
