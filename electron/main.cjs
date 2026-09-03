const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron')
const path = require('path')
const { registerStoreIpc } = require('./store.cjs')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 1024,
    minHeight: 720,
    center: true,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0c14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Local desktop app talking to a fixed ThingsBoard instance and the
      // Anthropic API directly from the renderer: disable same-origin policy
      // so cross-origin REST/WebSocket calls are not blocked by CORS.
      webSecurity: false,
      // Mantener el renderer a pleno ritmo cuando la ventana está minimizada u
      // oculta: si no, Chromium ralentiza timers y procesos en segundo plano y
      // las alertas/notificaciones solo se disparan al volver a la ventana.
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Open target=_blank links in the system browser instead of a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  return win
}

// Window control IPC (frameless window uses custom titlebar buttons).
ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('window:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w) return
  w.isMaximized() ? w.unmaximize() : w.maximize()
})
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

// Notificación nativa del sistema (toast de Windows / Notification Center).
// Se dispara desde el proceso principal porque es mucho más fiable que la API
// web Notification dentro del renderer de Electron en Windows.
ipcMain.on('notify', (e, payload) => {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: (payload && payload.title) || 'DeskSense',
      body: (payload && payload.body) || '',
      silent: false,
    })
    // Al hacer clic en el toast, traer la app al frente (restaurar + enfocar).
    n.on('click', () => {
      const win = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getAllWindows()[0]
      if (!win) return
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    })
    n.show()
  } catch {
    /* notificaciones no disponibles */
  }
})

app.whenReady().then(() => {
  // Fija la carpeta de datos ANTES de renombrar la app. Hoy setName no la mueve
  // porque Electron ya resolvió userData antes de ejecutar este JS, pero esa
  // garantía es incidental: fijarla explícitamente evita que un cambio de orden
  // aquí, o de Electron, deje huérfanas las credenciales y las claves guardadas.
  app.setPath('userData', app.getPath('userData'))
  // Nombre con el que el sistema identifica a la app. En Linux es lo que
  // aparece como emisor de las notificaciones: sin esto se muestra "Electron".
  app.setName('DeskSense')
  // Necesario para que las notificaciones nativas se muestren en Windows.
  if (process.platform === 'win32') app.setAppUserModelId('com.monitoreo.escritorio')
  registerStoreIpc(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
