'use strict';

const config = require('./config');
const keychain = require('./keychain');
const gitlab = require('./gitlab');
const jira = require('./jira');

const DEMO = process.env.DEVBOARD_DEMO === '1';
const demoData = DEMO ? require('./demo-data') : null;

let _win = null;
let _timer = null;

// Last-known good data per panel, kept so stale state can be shown
const _lastData = {};

function init(win) {
  _win = win;
}

function push(panelId, payload) {
  _lastData[panelId] = { ..._lastData[panelId], ...payload };
  if (_win && !_win.isDestroyed()) {
    _win.webContents.send('panel:update', { panelId, ...payload });
  }
}

function pollPanelDemo(panel) {
  const { GITLAB_MRS, JIRA_SPRINT, JIRA_BACKLOG } = demoData;
  if (panel.type === 'gitlab-mr') {
    push(panel.id, {
      status: 'ok',
      items:                  GITLAB_MRS.assigned,
      reviewPending:          GITLAB_MRS.reviewPending,
      reviewApproved:         GITLAB_MRS.reviewApproved,
      reviewChangesRequested: GITLAB_MRS.reviewChangesRequested,
      lastUpdated: Date.now(),
    });
    return;
  }
  const items = panel.type === 'jira-backlog' ? JIRA_BACKLOG : JIRA_SPRINT;
  push(panel.id, { status: 'ok', items, lastUpdated: Date.now() });
}

async function pollPanel(panel) {
  if (DEMO) return pollPanelDemo(panel);

  const cfg = config.get();

  if (panel.type === 'gitlab-mr') {
    const token = await keychain.getSecret('gitlab-token');
    if (!token) {
      push(panel.id, { status: 'unconfigured' });
      return;
    }
    const url = cfg.gitlab?.url || 'https://gitlab.com';
    push(panel.id, { status: 'loading' });
    try {
      const data = await gitlab.fetchMRData(url, token);
      push(panel.id, {
        status: 'ok',
        items:                  data.assigned,
        reviewPending:          data.reviewPending,
        reviewApproved:         data.reviewApproved,
        reviewChangesRequested: data.reviewChangesRequested,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      push(panel.id, {
        status: err.type === 'auth' ? 'auth-error' : 'error',
        error: { type: err.type, message: err.message },
      });
    }
    return;
  }

  const token = await keychain.getSecret('jira-token');
  const email = cfg.jira?.email || '';
  const url = cfg.jira?.url || '';

  if (!token || !email || !url) {
    push(panel.id, { status: 'unconfigured' });
    return;
  }

  push(panel.id, { status: 'loading' });
  try {
    let items;
    if (panel.type === 'jira-sprint') {
      items = await jira.fetchActiveSprint(url, email, token, panel.jql || undefined);
    } else if (panel.type === 'jira-backlog') {
      items = await jira.fetchBacklog(url, email, token, panel.jql || undefined);
    } else {
      items = await jira.fetchJQL(url, email, token, panel.jql || undefined);
    }
    push(panel.id, { status: 'ok', items, lastUpdated: Date.now() });
  } catch (err) {
    push(panel.id, {
      status: err.type === 'auth' ? 'auth-error' : 'error',
      error: { type: err.type, message: err.message },
    });
  }
}

let _pollRunning   = false;
let _pendingRefresh = false;

async function pollAll() {
  if (_pollRunning) {
    _pendingRefresh = true;
    return;
  }
  _pollRunning    = true;
  _pendingRefresh = false;
  try {
    const panels = config.get().panels || [];
    await Promise.allSettled(panels.map(pollPanel));
  } finally {
    _pollRunning = false;
    if (_pendingRefresh) {
      _pendingRefresh = false;
      pollAll();
    }
  }
}

function start() {
  stop();
  pollAll();
  const minutes = config.get().refreshInterval || 5;
  _timer = setInterval(pollAll, minutes * 60 * 1000);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

function restart() {
  start();
}

module.exports = { init, start, stop, restart, pollAll, pollPanel };
