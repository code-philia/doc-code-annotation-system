const { contextBridge, ipcRenderer } = require('electron')

window.__BUILD_TYPE__ = 'electron';

contextBridge.exposeInMainWorld('localFunctionality', {
  wordDocumentResolve: (buffer) => ipcRenderer.invoke('localFunctionality', buffer)
})
