const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('macroAPI', {
  load:            () => ipcRenderer.invoke('macros:load'),
  save:            (data) => ipcRenderer.invoke('macros:save', data),
  getPath:         () => ipcRenderer.invoke('macros:getPath'),
  version:         () => ipcRenderer.invoke('app:version'),
  incrementUsage:  (abbr) => ipcRenderer.invoke('macros:incrementUsage', abbr),
  getUsage:        () => ipcRenderer.invoke('macros:getUsage'),
  exportMacros:    () => ipcRenderer.invoke('macros:export'),
  importMacros:    () => ipcRenderer.invoke('macros:import'),
  platform: process.platform,
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, version) => cb(version)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, version) => cb(version)),
  installUpdate: () => ipcRenderer.send('install-update'),
});
