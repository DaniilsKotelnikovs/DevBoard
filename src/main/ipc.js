'use strict';

const { ipcMain, shell } = require('electron');
const config = require('./config');
const keychain = require('./keychain');
const poller = require('./poller');

function setupIPC(win) {
  ipcMain.handle('window:minimize', () => {
    win.minimize();
  });

  ipcMain.handle('window:close', () => {
    win.close();
  });

  ipcMain.handle('window:set-opacity', (_, opacity) => {
    const clamped = Math.max(0.1, Math.min(1, opacity));
    win.setOpacity(clamped);
    config.set('opacity', clamped);
  });

  ipcMain.handle('window:set-always-on-top', (_, value) => {
    win.setAlwaysOnTop(Boolean(value));
    config.set('alwaysOnTop', Boolean(value));
  });

  ipcMain.handle('config:get-all', () => {
    const cfg = config.get();
    const isDemo = process.env.DEVBOARD_DEMO === '1';
    return {
      opacity: cfg.opacity,
      alwaysOnTop: cfg.alwaysOnTop,
      refreshInterval: cfg.refreshInterval,
      theme: cfg.theme || 'teal',
      panels: cfg.panels,
      gitlab: { url: isDemo ? 'https://gitlab.example.com' : (cfg.gitlab?.url || 'https://gitlab.com') },
      jira:   { url: isDemo ? 'https://acme.atlassian.net'  : (cfg.jira?.url  || ''), email: isDemo ? 'alex@acme.io' : (cfg.jira?.email || '') },
    };
  });

  ipcMain.handle('config:save', (_, partial) => {
    const allowed = ['opacity', 'alwaysOnTop', 'refreshInterval', 'panels', 'theme'];
    const safe = {};
    for (const key of allowed) {
      if (key in partial) safe[key] = partial[key];
    }
    config.update(safe);

    if ('refreshInterval' in safe) poller.restart();
    if ('panels' in safe) poller.pollAll();
  });

  ipcMain.handle('credentials:save-gitlab', async (_, { url, token }) => {
    if (!token || typeof token !== 'string') throw new Error('Token is required');
    await keychain.setSecret('gitlab-token', token);
    config.set('gitlab', { url: (url || 'https://gitlab.com').trim() });
    const panels = config.get().panels.filter(p => p.type === 'gitlab-mr');
    await Promise.allSettled(panels.map(p => poller.pollPanel(p)));
    return { ok: true };
  });

  ipcMain.handle('credentials:save-jira', async (_, { url, email, token }) => {
    if (!token || !email || !url) throw new Error('All Jira fields are required');
    await keychain.setSecret('jira-token', token);
    config.set('jira', { url: url.trim(), email: email.trim() });
    const panels = config.get().panels.filter(p => p.type !== 'gitlab-mr');
    await Promise.allSettled(panels.map(p => poller.pollPanel(p)));
    return { ok: true };
  });

  ipcMain.handle('credentials:get-status', async () => {
    const [hasGitlab, hasJira] = await Promise.all([
      keychain.hasSecret('gitlab-token'),
      keychain.hasSecret('jira-token'),
    ]);
    return { gitlab: hasGitlab, jira: hasJira, keychainAvailable: keychain.isAvailable() };
  });

  ipcMain.handle('shell:open-url', (_, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });

  ipcMain.handle('data:refresh', () => {
    poller.pollAll();
  });
}

module.exports = { setupIPC };
