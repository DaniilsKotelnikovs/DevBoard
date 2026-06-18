'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devboard', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
    setOpacity: (v) => ipcRenderer.invoke('window:set-opacity', v),
    setAlwaysOnTop: (v) => ipcRenderer.invoke('window:set-always-on-top', v),
  },

  config: {
    getAll: () => ipcRenderer.invoke('config:get-all'),
    save: (partial) => ipcRenderer.invoke('config:save', partial),
  },

  credentials: {
    saveGitLab: (data) => ipcRenderer.invoke('credentials:save-gitlab', data),
    saveJira: (data) => ipcRenderer.invoke('credentials:save-jira', data),
    getStatus: () => ipcRenderer.invoke('credentials:get-status'),
  },

  shell: {
    openUrl: (url) => ipcRenderer.invoke('shell:open-url', url),
  },

  data: {
    refresh: () => ipcRenderer.invoke('data:refresh'),
    // Returns an unsubscribe function
    onPanelUpdate: (cb) => {
      const handler = (_, payload) => cb(payload);
      ipcRenderer.on('panel:update', handler);
      return () => ipcRenderer.removeListener('panel:update', handler);
    },
  },
});
