'use strict';

let keytar = null;
let _keytarUnavailable = false;
try {
  keytar = require('keytar');
} catch (e) {
  _keytarUnavailable = true;
  console.error(
    '[keychain] CRITICAL: keytar could not be loaded. Tokens will NOT be persisted ' +
    'and exist only for the duration of this session. Run `npm run postinstall` to ' +
    'rebuild the native module.\n', e.message
  );
}

const SERVICE = 'DevBoard';

// In-memory fallback used only when keytar fails to load — session-only, never written to disk.
const _mem = {};

function isAvailable() {
  return !_keytarUnavailable;
}

async function setSecret(account, value) {
  if (keytar) {
    await keytar.setPassword(SERVICE, account, value);
  } else {
    _mem[account] = value;
  }
}

async function getSecret(account) {
  if (keytar) {
    return keytar.getPassword(SERVICE, account);
  }
  return _mem[account] ?? null;
}

async function deleteSecret(account) {
  if (keytar) {
    await keytar.deletePassword(SERVICE, account);
  } else {
    delete _mem[account];
  }
}

async function hasSecret(account) {
  const val = await getSecret(account);
  return typeof val === 'string' && val.length > 0;
}

module.exports = { setSecret, getSecret, deleteSecret, hasSecret, isAvailable };
