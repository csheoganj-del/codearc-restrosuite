/* ============================================================
   RestroSuite Desktop — auto-updater
   ------------------------------------------------------------
   Windows Setup (NSIS): electron-updater against the generic
   feed at https://restrosuite.codearc.co.in/downloads/desktop
   (latest.yml + Setup .exe + .blockmap).

   macOS installed (.app from DMG): electron-updater against the
   same feed (latest-mac.yml + .zip). If the Mac feed is missing,
   fall back to updates.json and open the matching DMG download
   (Apple Silicon vs Intel).

   Windows Portable: cannot self-replace; poll updates.json and
   offer to open the new portable download.

   Dev (unpackaged): no-op.
   ============================================================ */
'use strict';

const { app, dialog, shell } = require('electron');
const https = require('https');
const http = require('http');
const os = require('os');

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

function isMac() {
  return process.platform === 'darwin';
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

/** Prefer matching Mac DMG (arm64 = Apple Silicon, else Intel). */
function pickMacDmgUrl(remote) {
  if (!remote || !remote.mac) return null;
  const mac = remote.mac;
  const arch = process.arch || os.arch();
  if (arch === 'arm64') {
    return (mac.appleSilicon && mac.appleSilicon.url) || (mac.intel && mac.intel.url) || null;
  }
  return (mac.intel && mac.intel.url) || (mac.appleSilicon && mac.appleSilicon.url) || null;
}

function macArchLabel() {
  return process.arch === 'arm64' ? 'Apple Silicon' : 'Intel';
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

/**
 * macOS DMG installs: when latest-mac.yml is not published yet (or fails),
 * offer the matching DMG from updates.json — same idea as Windows portable.
 */
async function checkMacDmgUpdate({ silent } = {}) {
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
          detail: `This Mac app is v${localVer} (${macArchLabel()}).`,
          buttons: ['OK'],
        });
      }
      return { status: 'current', version: localVer };
    }
    const url = pickMacDmgUrl(remote) || DOWNLOADS_PAGE;
    const r = await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Update available',
      message: `RestroSuite ${remoteVer} is available`,
      detail:
        `You are running v${localVer} on ${macArchLabel()}.\n\n` +
        'Download the new DMG, open it, drag RestroSuite to Applications (replace), then reopen.\n\n' +
        'Tip: feature/UI updates often arrive from the live site without a new DMG (Help → Check for Updates).',
      buttons: ['Download DMG', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });
    if (r.response === 0) {
      await shell.openExternal(url);
    }
    return { status: 'available', version: remoteVer, url };
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

/**
 * electron-updater for Windows NSIS + macOS (latest.yml / latest-mac.yml).
 */
function setupShellUpdater() {
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
    // Generic provider: Windows reads latest.yml, macOS reads latest-mac.yml
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

  const autoUpdater = setupShellUpdater();
  if (!autoUpdater) {
    // No electron-updater — Mac can still use DMG fallback
    if (isMac()) {
      setTimeout(() => checkMacDmgUpdate({ silent: true }), CHECK_DELAY_MS);
      setInterval(() => checkMacDmgUpdate({ silent: true }), PERIODIC_MS);
      start._macDmgCheck = (silent) => checkMacDmgUpdate({ silent: !!silent });
    }
    return;
  }

  const runShell = async (silent) => {
    if (_checking) return { status: 'busy' };
    _checking = true;
    let handedOffToDmg = false;
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: 'checked', updateInfo: result && result.updateInfo };
    } catch (e) {
      console.warn('[auto-updater] check failed:', e && e.message);
      // macOS: if latest-mac.yml missing, fall back to DMG download offer
      if (isMac()) {
        handedOffToDmg = true;
        _checking = false;
        return checkMacDmgUpdate({ silent: !!silent });
      }
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
    } finally {
      if (!handedOffToDmg) _checking = false;
    }
  };

  setTimeout(() => runShell(true), CHECK_DELAY_MS);
  setInterval(() => runShell(true), PERIODIC_MS);

  start._shellCheck = runShell;
  if (isMac()) {
    start._macDmgCheck = (silent) => checkMacDmgUpdate({ silent: !!silent });
  }
}

/**
 * Menu / IPC: user-initiated shell check.
 * Feature/UI updates are handled by content-updater (live site) separately.
 */
async function checkNow() {
  if (!app.isPackaged) {
    return { status: 'dev', version: app.getVersion() };
  }
  if (isPortable()) {
    return checkPortableUpdate({ silent: false });
  }
  if (typeof start._shellCheck === 'function') {
    const r = await start._shellCheck(false);
    if (r && r.status === 'checked') {
      await dialog.showMessageBox(parentWindow(), {
        type: 'info',
        title: 'App shell update',
        message: 'Checked for a new desktop build.',
        detail:
          (isMac()
            ? 'If a newer Mac build is on the auto-update feed it downloads in the background, then asks to restart.\n'
            : 'If a newer Setup (EXE shell) is available it downloads in the background, then asks to restart.\n') +
          `\nCurrent shell: v${app.getVersion()}` +
          (isMac() ? ` (${macArchLabel()})` : '') +
          '\n\nTip: feature updates (new Settings, POS modes) come from the live site and do not need a new installer.',
        buttons: ['OK'],
      });
    }
    return r;
  }
  if (typeof start._macDmgCheck === 'function') {
    return start._macDmgCheck(false);
  }
  return { status: 'unavailable' };
}

module.exports = {
  start,
  checkNow,
  isPortable,
  isMac,
  FEED_URL,
  UPDATES_JSON,
};
