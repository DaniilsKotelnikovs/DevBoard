'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

const DEFAULTS = {
  opacity: 0.9,
  alwaysOnTop: true,
  refreshInterval: 5,
  theme: 'teal',
  windowBounds: { width: 400, height: 600 },
  panels: [
    {
      id: 'gitlab-mr',
      type: 'gitlab-mr',
      label: 'Merge Requests',
      collapsed: false,
    },
    {
      id: 'jira-sprint',
      type: 'jira-sprint',
      label: 'Active Sprint',
      collapsed: false,
      jql: null,
    },
    {
      id: 'jira-backlog',
      type: 'jira-backlog',
      label: 'Backlog',
      collapsed: true,
      jql: null,
    },
  ],
  gitlab: { url: 'https://gitlab.com' },
  jira: { url: '', email: '' },
};

let _config = {};

async function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const saved = JSON.parse(raw);
      _config = deepMerge(DEFAULTS, saved);
    } else {
      _config = deepClone(DEFAULTS);
    }
  } catch {
    _config = deepClone(DEFAULTS);
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(_config, null, 2), 'utf8');
  } catch (e) {
    console.error('[config] Failed to save:', e.message);
  }
}

function get() {
  return _config;
}

function set(key, value) {
  _config[key] = value;
  save();
}

function update(partial) {
  Object.assign(_config, partial);
  save();
}

function deepMerge(base, overrides) {
  const result = deepClone(base);
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { load, save, get, set, update, DEFAULTS };
