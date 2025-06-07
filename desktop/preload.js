const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startOverleaf: () => ipcRenderer.invoke('start-overleaf'),
  onOverleafStarted: (callback) => ipcRenderer.on('overleaf-started', callback),
  onOverleafError: (callback) => ipcRenderer.on('overleaf-error', callback),
  onOverleafStatusUpdate: (callback) => ipcRenderer.on('overleaf-status-update', callback)
});
