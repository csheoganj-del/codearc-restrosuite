'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gatewayTray', {
  getStatus: () => ipcRenderer.invoke('gw-status'),
  restart: () => ipcRenderer.invoke('gw-restart'),
  hide: () => ipcRenderer.invoke('gw-hide'),
});
