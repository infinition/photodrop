const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),
  isMaximized: () => ipcRenderer.invoke('app:is-maximized'),
  pickFolder: () => ipcRenderer.invoke('app:open-folder-dialog'),
  openExplorer: (folderPath) => ipcRenderer.invoke('app:open-explorer', folderPath),
  onWindowStateChanged: (callback) => {
    ipcRenderer.on('window-state-changed', (event, state) => callback(state));
  }
});
