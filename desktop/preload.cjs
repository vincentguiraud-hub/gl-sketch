const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('glNative', {
  saveAs: (name, data, isProject) => ipcRenderer.invoke('saveAs', name, data, !!isProject),
  write: (p, data) => ipcRenderer.invoke('write', p, data),
  open: () => ipcRenderer.invoke('open'),
  openPath: (p) => ipcRenderer.invoke('openPath', p),
  getRecent: () => ipcRenderer.invoke('getRecent'),
  appInfo: () => ipcRenderer.invoke('appInfo'),
  addRecent: (p) => ipcRenderer.send('addRecent', p),
  setDirty: (d) => ipcRenderer.send('setDirty', d),
  setTitle: (t) => ipcRenderer.send('setTitle', t),
  closeNow: () => ipcRenderer.send('closeNow'),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (e, f) => cb(f)),
  onSaveBeforeClose: (cb) => ipcRenderer.on('save-before-close', () => cb()),
});
