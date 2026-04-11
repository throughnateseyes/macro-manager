const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('macroAPI', {
  load:            () => ipcRenderer.invoke('macros:load'),
  save:            (data) => ipcRenderer.invoke('macros:save', data),
  getPath:         () => ipcRenderer.invoke('macros:getPath'),
  getListenerStatus: () => ipcRenderer.invoke('macros:listenerStatus'),
  version:         () => ipcRenderer.invoke('app:version'),
  incrementUsage:  (abbr) => ipcRenderer.invoke('macros:incrementUsage', abbr),
  getUsage:        () => ipcRenderer.invoke('macros:getUsage'),
  platform: process.platform,
});
