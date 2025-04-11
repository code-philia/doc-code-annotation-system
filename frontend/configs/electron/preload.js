const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localFunctionality', {
  wordDocumentResolve: async (buffer) => await ipcRenderer.invoke('wordDocumentResolve', buffer)
})
