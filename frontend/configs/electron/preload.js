const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localFunctionality', {
  wordDocumentResolve: async (buffer) => await ipcRenderer.invoke('wordDocumentResolve', buffer),
  retrieveLocalResource: async (localResourceUrl, ...paths) => await ipcRenderer.invoke('retrieveLocalResource', localResourceUrl, ...paths)
})
