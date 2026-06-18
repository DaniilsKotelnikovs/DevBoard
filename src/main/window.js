'use strict';

const { BrowserWindow } = require('electron');
const path = require('node:path');
const config = require('./config');
const { createAppIcon } = require('./app-icon');

let mainWindow = null;

// The only URL this window is ever allowed to load
const LOCAL_PAGE = `file://${path.join(__dirname, '../renderer/index.html').replaceAll('\\', '/')}`;

function createWindow() {
  const cfg = config.get();
  const bounds = cfg.windowBounds || {};

  mainWindow = new BrowserWindow({
    width:  bounds.width  || 400,
    height: bounds.height || 600,
    x: bounds.x == null ? undefined : bounds.x,
    y: bounds.y == null ? undefined : bounds.y,
    minWidth: 320,
    minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: cfg.alwaysOnTop !== false,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    icon: createAppIcon(cfg.theme || 'teal'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.setOpacity(cfg.opacity == null ? 0.9 : cfg.opacity);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Block navigation away from the local page
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== LOCAL_PAGE) event.preventDefault();
  });

  // Block server-side redirects
  mainWindow.webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });

  // Block window.open() and target="_blank"
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    config.set('windowBounds', mainWindow.getBounds());
  };

  mainWindow.on('resized', saveBounds);
  mainWindow.on('moved',   saveBounds);
  mainWindow.on('closed',  () => { mainWindow = null; });

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

module.exports = { createWindow, getMainWindow };
