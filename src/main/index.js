'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

const config = require('./config');
const { createWindow, getMainWindow } = require('./window');
const { setupIPC } = require('./ipc');
const poller = require('./poller');

app.whenReady().then(async () => {
  await config.load();

  const win = createWindow();
  setupIPC(win);
  poller.init(win);
  poller.start();

  app.on('second-instance', () => {
    const w = getMainWindow();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      setupIPC(w);
      poller.init(w);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
