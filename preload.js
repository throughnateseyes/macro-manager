const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('macroAPI', {
  getState:          () => ipcRenderer.invoke('app:state'),
  saveMacros:        (data) => ipcRenderer.invoke('macros:save', data),
  renameUsage:       (from, to) => ipcRenderer.invoke('usage:rename', from, to),
  deleteUsage:       (abbr) => ipcRenderer.invoke('usage:delete', abbr),
  previewTemplate:   (content) => ipcRenderer.invoke('template:preview', content),
  setSettings:       (patch) => ipcRenderer.invoke('settings:set', patch),
  exportMacros:      () => ipcRenderer.invoke('macros:export'),
  importMacros:      () => ipcRenderer.invoke('macros:import'),
  openDataFolder:    () => ipcRenderer.invoke('app:openDataFolder'),
  openReleases:      () => ipcRenderer.invoke('app:openReleases'),
  checkForUpdates:   () => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate:     () => ipcRenderer.invoke('app:installUpdate'),
  requestAccessibility: () => ipcRenderer.invoke('app:requestAccessibility'),
  showPalette:       () => ipcRenderer.invoke('app:showPalette'),
  popupMenu:         (items) => ipcRenderer.invoke('menu:popup', items),

  paletteInsert:     (payload) => ipcRenderer.invoke('palette:insert', payload),
  paletteClose:      () => ipcRenderer.invoke('palette:close'),
  paletteCopied:     (payload) => ipcRenderer.invoke('palette:copied', payload),
  paletteOpenMacro:  (index) => ipcRenderer.invoke('palette:openMacro', index),

  onMacrosChanged:   on('macros:changed'),
  onStatsChanged:    on('stats:changed'),
  onSettingsChanged: on('settings:changed'),
  onUpdateState:     on('update:state'),
  onNavigate:        on('navigate'),
  onAccessibility:   on('accessibility:changed'),
  onPaletteOpen:     on('palette:open'),
  onInsertToken:     on('editor:insertToken'),
});
