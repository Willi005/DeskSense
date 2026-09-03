// Persistencia local de tareas, ventanas de concentración y caché de reportes.
// Vive en el proceso principal porque el renderer corre con contextIsolation y
// sin nodeIntegration, de modo que no puede acceder a fs — y así debe seguir.
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const FILE_NAME = 'desksense-data.json'

const EMPTY_DATA = { version: 1, tasks: [], focusWindows: [] }

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function read() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8')
    const parsed = JSON.parse(raw)
    // Se completan las claves ausentes para tolerar archivos de versiones previas.
    return { ...EMPTY_DATA, ...parsed }
  } catch {
    // Archivo inexistente o corrupto: la app nunca debe fallar al iniciar por esto.
    return { ...EMPTY_DATA }
  }
}

// Escritura atómica: se escribe a un temporal y se renombra, de modo que un
// cierre abrupto no pueda dejar el JSON a medias.
function write(data) {
  const target = filePath()
  const temp = `${target}.tmp`
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(temp, target)
}

function registerStoreIpc(ipcMain) {
  ipcMain.handle('store:read', () => read())
  ipcMain.handle('store:write', (_event, data) => {
    try {
      write(data)
      return true
    } catch {
      return false
    }
  })
}

module.exports = { registerStoreIpc }
