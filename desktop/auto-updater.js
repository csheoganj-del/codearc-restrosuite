/* ============================================================
   RestroSuite Desktop — auto-updater
   ------------------------------------------------------------
   Installed (NSIS) builds: electron-updater against the generic
   feed at https://restrosuite.codearc.co.in/downloads/desktop
   (latest.yml + Setup .exe + .blockmap published by sync-downloads).

   Portable builds: electron-updater cannot replace a running
   portable safely, so we poll downloads/updates.json and offer
   to open the new portable download when a higher version ships.

   Dev (unpackaged): no-op.
   ============================================================ */
'use strict';

const { app, dialog, shell } = require('electron');
const https = require('https');
const http = require('http');

const FEED_URL = 'https://restrosuite.codearc.co.in/downloads/desktop';
const UPDATES_JSON = 'https://restrosuite.codearc.co.in/downloads/updates.json';
const DOWNLOADS_PAGE = 'https://restrosuite.codearc.co.in/#downloads';

const CHECK_DELAY_MS = 12 * 1000;
const PERIODIC_MS = 4 * 60 * 60 * 1000;

let _getMainWindow = () => null;
let _checking = false;
let _started = false;

function isPortable() {
  return !!(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE);
}

function parentWindow() {
  try {
    const w = _getMainWindow && _getMainWindow();
    return w && !w.isDestroyed() ? w : null;
  } catch (_) {
    return null;
  }
}

function fetchJson(url, timeoutMs) {
  const t = timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, t).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(t, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function cmpSemver(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkPortableUpdate({ silent } = {}) {
  if (_checking) return { status: 'busy' };
  _checking = true;
  try {
    const data = await fetchJson(UPDATES_JSON);
    const remote = data && data.desktop;
    const remoteVer = remote && (remote.version || remote.versionName);
    const localVer = app.getVersion();
    if (!remoteVer) {
      if (!silent) {
        await dialog.showMessageBox(parentWindow(), {
          type: 'info',
          title: 'RestroSuite updates',
          message: 'Could not read the update feed.',
          detail: 'Try again later or visit the downloads page.',
          buttons: ['OK', 'Open downloads'],
          defaultId: 0,
        }).then((r) => {
          if (r.response === 1) shell.openExternal(DOWNLOADS_PAGE);
        });
      }
      return { status: 'no-feed' };
    }
    if (cmpSemver(remoteVer, localVer) <= 0) {
      if (!silent) {
        await dialog.showMessageBox(parentWindow(), {
          type: 'info',
          title: 'RestroSuite updates',
          message: 'You are up to date.',
          detail: `This portable build is v${localVer}.`,
          buttons: ['OK'],
        });
      }
      return { status: 'current', version: localVer };
    }
    const url =
      (remote.portable && remote.portable.url) ||
      (remote.nsis && remote.nsis.url) ||
      DOWNLOADS_PAGE;
    const r = await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Update available',
      message: `RestroSuite ${remoteVer} is available`,
      detail:
        `You are running portable v${localVer}.\n\n` +
        'Portable builds cannot self-replace while running. Download the new file, close this app, then open the new .exe.\n\n' +
        'Tip: install the full Setup build for silent in-app updates next time.',
      buttons: ['Download update', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r.response === 0) {
      await shell.openExternal(url);
    }
    return { status: 'available', version: remoteVer };
  } catch (e) {
    if (!silent) {
      await dialog.showMessageBox(parentWindow(), {
        type: 'warning',
        title: 'Update check failed',
        message: 'Could not check for updates.',
        detail: String(e && e.message || e),
        buttons: ['OK'],
      });
    }
    return { status: 'error', error: String(e && e.message || e) };
  } finally {
    _checking = false;
  }
}

function setupNsisUpdater() {
  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    console.warn('[auto-updater] electron-updater not available:', e && e.message);
    return null;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URL });
  } catch (e) {
    console.warn('[auto-updater] setFeedURL failed:', e && e.message);
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-updater] checking…');
  });
  autoUpdater.on('update-available', (info) => {
    console.log('[auto-updater] available', info && info.version);
  });
  autoUpdater.on('update-not-available', (info) => {
    console.log('[auto-updater] current', info && info.version);
  });
  autoUpdater.on('error', (err) => {
    console.warn('[auto-updater] error:', err && err.message || err);
  });
  autoUpdater.on('download-progress', (p) => {
    if (p && typeof p.percent === 'number' && Math.floor(p.percent) % 25 === 0) {
      console.log('[auto-updater] download', Math.floor(p.percent) + '%');
    }
  });
  autoUpdater.on('update-downloaded', async (info) => {
    const ver = (info && info.version) || 'new';
    const r = await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Update ready',
      message: `RestroSuite ${ver} is ready to install`,
      detail:
        'The update was downloaded in the background. Restart now to apply it. ' +
        'Your data stays safe (cloud + local cache).',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r.response === 0) {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (e) {
        console.warn('[auto-updater] quitAndInstall failed:', e && e.message);
      }
    }
  });

  return autoUpdater;
}

/**
 * Start background update checks. Call once after app.whenReady().
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | null }} opts
 */
function start(opts) {
  if (_started) return;
  _started = true;
  _getMainWindow = (opts && opts.getMainWindow) || (() => null);

  if (!app.isPackaged) {
    console.log('[auto-updater] skipped (dev / unpackaged)');
    return;
  }

  if (isPortable()) {
    setTimeout(() => checkPortableUpdate({ silent: true }), CHECK_DELAY_MS);
    setInterval(() => checkPortableUpdate({ silent: true }), PERIODIC_MS);
    return;
  }

  const autoUpdater = setupNsisUpdater();
  if (!autoUpdater) return;

  const run = (silent) => {
    if (_checking) return Promise.resolve({ status: 'busy' });
    _checking = true;
    return autoUpdater
      .checkForUpdates()
      .then((result) => {
        if (!silent && result && result.updateInfo) {
          // update-downloaded dialog handles install; if not available, say current
        }
        return { status: 'checked', updateInfo: result && result.updateInfo };
      })
      .catch((e) => {
        console.warn('[auto-updater] check failed:', e && e.message);
        if (!silent) {
          dialog.showMessageBox(parentWindow(), {
            type: 'warning',
            title: 'Update check failed',
            message: 'Could not check for updates.',
            detail: String(e && e.message || e) + '\n\nYou can still download from the website.',
            buttons: ['OK', 'Open downloads'],
            defaultId: 0,
          }).then((r) => {
            if (r.response === 1) shell.openExternal(DOWNLOADS_PAGE);
          });
        }
        return { status: 'error', error: String(e && e.message || e) };
      })
      .finally(() => {
        _checking = false;
      });
  };

  setTimeout(() => run(true), CHECK_DELAY_MS);
  setInterval(() => run(true), PERIODIC_MS);

  // Stash for manual menu action
  start._nsisCheck = run;
}

/**
 * Menu / IPC: user-initiated EXE/shell check.
 * Feature/UI updates are handled by content-updater (live site) separately.
 */
async function checkNow() {
  if (!app.isPackaged) {
    // Dev: shell update N/A — content updater still handles feature updates.
    return { status: 'dev', version: app.getVersion() };
  }
  if (isPortable()) {
    return checkPortableUpdate({ silent: false });
  }
  if (typeof start._nsisCheck === 'function') {
    const r = await start._nsisCheck(false);
    if (r && r.status === 'checked') {
      await dialog.showMessageBox(parentWindow(), {
        type: 'info',
        title: 'App shell update',
        message: 'Checked for a new installer build.',
        detail:
          'If a newer Setup (EXE shell) is available it downloads in the background, then asks to restart.\n\n' +
          `Current shell: v${app.getVersion()}\n\n` +
          'Tip: feature updates (new Settings, POS modes) come from the live site and do not need a new installer.',
        buttons: ['OK'],
      });
    }
    return r;
  }
  return { status: 'unavailable' };
}

module.exports = {
  start,
  checkNow,
  isPortable,
  FEED_URL,
  UPDATES_JSON,
};
