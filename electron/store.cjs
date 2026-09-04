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

  // La escritura FUSIONA sobre lo que ya hay en disco, en vez de exigir que el
  // renderer lea primero y mande el documento completo.
  //
  // Esa lectura previa parecía inofensiva pero rompía el volcado al cerrar la
  // ventana: en `beforeunload` el renderer se destruye en cuanto vuelve el
  // manejador, así que la respuesta del `read` no llegaba nunca y el `write`
  // no se llegaba a enviar. Los cambios de los últimos instantes se perdían en
  // silencio, que es justo lo que ese volcado existía para evitar. Con la fusión
  // aquí, al renderer le basta un envío que sale de inmediato.
  ipcMain.handle('store:write', (_event, data) => {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false
      write({ ...read(), ...data })
      return true
    } catch {
      return false
    }
  })
}

module.exports = { registerStoreIpc }
