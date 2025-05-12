const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localFunctionality', {
  wordDocumentResolve: async (buffer) => await ipcRenderer.invoke('wordDocumentResolve', buffer),
  retrieveLocalResource: async (localResourceUrl, ...paths) => await ipcRenderer.invoke('retrieveLocalResource', localResourceUrl, ...paths),
  electronShowOpenDialog: async (options) => await ipcRenderer.invoke('electron-show-open-dialog', options),
  scanDirectory: async (folderPath, suffix) => await ipcRenderer.invoke('scan-directory', folderPath, suffix)
})
