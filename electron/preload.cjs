const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  // `route` es opcional: indica a qué página llevar si se hace clic en la
  // notificación. Las alertas no la pasan y siguen comportándose igual.
  notify: (title, body, route) => ipcRenderer.send('notify', { title, body, route }),
  onNavigate: (cb) => {
    const handler = (_e, route) => cb(route)
    ipcRenderer.on('navigate', handler)
    return () => ipcRenderer.removeListener('navigate', handler)
  },
  platform: process.platform,
  store: {
    read: () => ipcRenderer.invoke('store:read'),
    write: (data) => ipcRenderer.invoke('store:write', data),
  },
})
