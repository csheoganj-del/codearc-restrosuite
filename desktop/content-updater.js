/* ============================================================
   RestroSuite Desktop — live UI content updater
   ------------------------------------------------------------
   Git push + website deploy ships new HTML/JS immediately.
   The installed .exe still has a frozen copy inside the package.

   This module:
     1) Polls production app-update.json
     2) If version is newer than the local content version,
        downloads app-content-manifest.json + listed files
        into userData/web-overlay/
     3) Local server serves overlay files first → new Settings,
        POS, etc. without rebuilding the whole EXE.

   Shell/EXE binary updates remain electron-updater (version in
   package.json + published latest.yml). Content updates ride the
   normal website deploy — that is what "push and the app updates"
   should feel like for feature work.
   ============================================================ */
'use strict';

const { app, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const CHECK_DELAY_MS = 15 * 1000;
const PERIODIC_MS = 2 * 60 * 60 * 1000; // 2h
const MAX_FILES = 800;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB per file safety

let _getMainWindow = () => null;
let _getProductionOrigin = () => 'https://restrosuite.codearc.co.in';
let _onApplied = null;
let _started = false;
let _busy = false;
let _lastStatus = { status: 'idle' };

function parentWindow() {
  try {
    const w = _getMainWindow && _getMainWindow();
    return w && !w.isDestroyed() ? w : null;
  } catch (_) {
    return null;
  }
}

function overlayDir() {
  return path.join(app.getPath('userData'), 'web-overlay');
}

function statePath() {
  return path.join(app.getPath('userData'), 'content-state.json');
}

/** Strip UTF-8 BOM / junk so JSON.parse never fails on PowerShell-written files. */
function parseJsonFile(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  raw = raw.replace(/^\uFEFF/, '').trim();
  return JSON.parse(raw);
}

function readState() {
  try {
    return parseJsonFile(statePath());
  } catch (_) {
    return {};
  }
}

function writeState(obj) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    // Write without BOM (Node utf8 default). Explicit buffer avoids accidental BOM tools.
    const body = JSON.stringify(obj, null, 2);
    fs.writeFileSync(statePath(), body, { encoding: 'utf8' });
  } catch (e) {
    console.warn('[content-updater] state write failed', e && e.message);
  }
}

function readBundledAppUpdate(webRoot) {
  try {
    const p = path.join(webRoot || '', 'app-update.json');
    if (fs.existsSync(p)) return parseJsonFile(p);
  } catch (_) {}
  return null;
}

function readOverlayAppUpdate() {
  try {
    const p = path.join(overlayDir(), 'app-update.json');
    if (fs.existsSync(p)) return parseJsonFile(p);
  } catch (_) {}
  return null;
}

function localContentVersion(webRoot) {
  const st = readState();
  if (st && st.version) return String(st.version);
  // Overlay already applied (even if state file was corrupted / BOM-broken)
  const overlay = readOverlayAppUpdate();
  if (overlay && overlay.version) return String(overlay.version);
  const bundled = readBundledAppUpdate(webRoot);
  if (bundled && bundled.version) return String(bundled.version);
  return '0';
}

function fetchBuffer(url, timeoutMs) {
  const t = timeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Accept: '*/*',
          'User-Agent': 'RestroSuite-Desktop-ContentUpdater',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          fetchBuffer(next, t).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
          return;
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total > MAX_FILE_BYTES) {
            req.destroy(new Error('file too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.setTimeout(t, () => req.destroy(new Error('timeout')));
  });
}

async function fetchJson(url) {
  const buf = await fetchBuffer(url, 20000);
  return JSON.parse(buf.toString('utf8'));
}

function safeRelPath(rel) {
  const s = String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!s || s.includes('..') || path.isAbsolute(s)) return null;
  if (/^[a-zA-Z]:/.test(s)) return null;
  return s;
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Download remote content into a staging folder, then swap into web-overlay.
 */
async function applyContentUpdate({ origin, version, files, title }) {
  const base = String(origin || '').replace(/\/+$/, '');
  const staging = path.join(app.getPath('userData'), 'web-overlay-staging');
  const finalDir = overlayDir();

  // Clean staging
  try {
    fs.rmSync(staging, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(staging, { recursive: true });

  const list = Array.isArray(files) ? files : [];
  if (!list.length) throw new Error('Empty content manifest');
  if (list.length > MAX_FILES) throw new Error('Manifest too large (' + list.length + ' files)');

  let done = 0;
  for (const raw of list) {
    const rel = safeRelPath(typeof raw === 'string' ? raw : raw && raw.path);
    if (!rel) continue;
    const url = base + '/' + rel.split('/').map(encodeURIComponent).join('/').replace(/%2F/g, '/');
    // encodeURIComponent per segment
    const segs = rel.split('/');
    const fileUrl = base + '/' + segs.map((s) => encodeURIComponent(s)).join('/');
    const buf = await fetchBuffer(fileUrl, 45000);
    const dest = path.join(staging, ...segs);
    ensureDirFor(dest);
    fs.writeFileSync(dest, buf);
    done++;
    if (done % 25 === 0) {
      console.log('[content-updater] downloaded', done + '/' + list.length);
    }
  }

  // Always stamp version into overlay app-update.json if missing
  try {
    const auPath = path.join(staging, 'app-update.json');
    if (!fs.existsSync(auPath)) {
      fs.writeFileSync(
        auPath,
        JSON.stringify(
          {
            version: version,
            date: new Date().toISOString().slice(0, 10),
            title: title || 'Content update',
            summary: 'Live UI update applied by RestroSuite Desktop',
          },
          null,
          2
        ),
        'utf8'
      );
    }
  } catch (_) {}

  // Swap staging → overlay (replace)
  try {
    fs.rmSync(finalDir, { recursive: true, force: true });
  } catch (_) {}
  fs.renameSync(staging, finalDir);

  writeState({
    version: String(version),
    title: title || '',
    appliedAt: new Date().toISOString(),
    fileCount: done,
    origin: base,
  });

  return { ok: true, version, fileCount: done, overlay: finalDir };
}

async function loadRemoteManifest(origin) {
  const base = String(origin || '').replace(/\/+$/, '');
  // Prefer dedicated content manifest; fall back to minimal critical set
  try {
    const man = await fetchJson(base + '/app-content-manifest.json?v=' + Date.now());
    if (man && Array.isArray(man.files) && man.files.length) return man;
  } catch (e) {
    console.warn('[content-updater] manifest missing, using critical set', e && e.message);
  }
  return {
    version: null,
    files: [
      'app-update.json',
      'dashboard.html',
      'login.html',
      'index.html',
      'config.js',
      'assets/features-shell.js',
      'assets/features-pos.js',
      'assets/features-growth.js',
      'assets/dashboard.js',
      'assets/competitive-ops.js',
      'assets/print-bridge.js',
      'assets/modules/ops-mode.js',
      'assets/modules/qr-orders-ui.js',
      'assets/modules/pos-ui.js',
      'assets/modules/kds-ui.js',
      'assets/saas-core.js',
      'assets/db.js',
    ],
  };
}

/**
 * Check production for newer UI content.
 * @param {{ silent?: boolean, webRoot?: string, force?: boolean }} opts
 */
async function checkContentUpdate(opts) {
  const options = opts || {};
  if (_busy) return { status: 'busy' };
  _busy = true;
  _lastStatus = { status: 'checking' };
  try {
    const origin = String(_getProductionOrigin() || 'https://restrosuite.codearc.co.in').replace(/\/+$/, '');
    const webRoot = options.webRoot || '';
    const localVer = localContentVersion(webRoot);

    let remoteUpdate;
    try {
      remoteUpdate = await fetchJson(origin + '/app-update.json?v=' + Date.now());
    } catch (e) {
      _lastStatus = { status: 'error', error: String(e && e.message || e) };
      if (!options.silent) {
        await dialog.showMessageBox(parentWindow(), {
          type: 'warning',
          title: 'Update check failed',
          message: 'Could not reach the RestroSuite update server.',
          detail: String(e && e.message || e) + '\n\nCheck internet connection, then try Help → Check for Updates.',
          buttons: ['OK', 'Open website'],
          defaultId: 0,
        }).then((r) => {
          if (r.response === 1) shell.openExternal(origin);
        });
      }
      return _lastStatus;
    }

    const remoteVer = String((remoteUpdate && remoteUpdate.version) || '').trim();
    if (!remoteVer) {
      _lastStatus = { status: 'no-feed' };
      return _lastStatus;
    }

    // String compare is fine for our vNNN-date-slug scheme when equal means current
    if (!options.force && remoteVer === localVer) {
      _lastStatus = { status: 'current', version: localVer, kind: 'content' };
      if (!options.silent) {
        await dialog.showMessageBox(parentWindow(), {
          type: 'info',
          title: 'RestroSuite is up to date',
          message: 'You already have the latest features.',
          detail:
            `UI version: ${localVer}\n` +
            `App shell: v${app.getVersion()}\n\n` +
            'Feature updates install from the live site automatically when available.\n' +
            'Full Setup builds also receive silent EXE upgrades when a new shell ships.',
          buttons: ['OK'],
        });
      }
      return _lastStatus;
    }

    // Newer content available
    _lastStatus = {
      status: 'available',
      version: remoteVer,
      localVersion: localVer,
      title: (remoteUpdate && remoteUpdate.title) || 'Feature update',
      summary: (remoteUpdate && remoteUpdate.summary) || '',
      kind: 'content',
    };

    if (options.silent) {
      // Quiet background: still prompt so staff know — use non-blocking dialog
      const r = await dialog.showMessageBox(parentWindow(), {
        type: 'info',
        title: 'Update available',
        message: `RestroSuite ${remoteVer} is available`,
        detail:
          `${(remoteUpdate && remoteUpdate.title) || 'New features and fixes'}\n\n` +
          `${(remoteUpdate && remoteUpdate.summary) || ''}\n\n` +
          `You have: ${localVer}\n` +
          'This downloads only the updated screens (not the whole installer). Your bills and login stay safe.',
        buttons: ['Update now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response !== 0) return _lastStatus;
    } else {
      const r = await dialog.showMessageBox(parentWindow(), {
        type: 'info',
        title: 'Update available',
        message: `RestroSuite ${remoteVer} is available`,
        detail:
          `${(remoteUpdate && remoteUpdate.title) || 'New features and fixes'}\n\n` +
          `${(remoteUpdate && remoteUpdate.summary) || ''}\n\n` +
          `Installed UI: ${localVer}\n` +
          'Update now downloads the latest screens from the live server and reloads the app.',
        buttons: ['Update now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (r.response !== 0) return _lastStatus;
    }

    // Download + apply
    await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Downloading update',
      message: 'Downloading feature update…',
      detail: 'Please wait. This usually takes under a minute on a normal connection.',
      buttons: ['OK'],
    }).catch(() => {});

    const man = await loadRemoteManifest(origin);
    const files = man.files || [];
    // Ensure app-update.json is always pulled
    if (!files.includes('app-update.json')) files.unshift('app-update.json');

    const result = await applyContentUpdate({
      origin,
      version: remoteVer,
      files,
      title: remoteUpdate && remoteUpdate.title,
    });

    _lastStatus = {
      status: 'applied',
      version: remoteVer,
      fileCount: result.fileCount,
      kind: 'content',
    };

    const restart = await dialog.showMessageBox(parentWindow(), {
      type: 'info',
      title: 'Update installed',
      message: `RestroSuite ${remoteVer} is ready`,
      detail:
        `Updated ${result.fileCount} files.\n\n` +
        'Reload the app window to use the new screens. Your data is safe.',
      buttons: ['Reload now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (restart.response === 0 && typeof _onApplied === 'function') {
      try {
        _onApplied({ version: remoteVer });
      } catch (e) {
        console.warn('[content-updater] onApplied failed', e && e.message);
      }
    }

    return _lastStatus;
  } catch (e) {
    console.warn('[content-updater] failed', e);
    _lastStatus = { status: 'error', error: String(e && e.message || e) };
    if (!options.silent) {
      await dialog.showMessageBox(parentWindow(), {
        type: 'warning',
        title: 'Update failed',
        message: 'Could not install the feature update.',
        detail: String(e && e.message || e),
        buttons: ['OK'],
      });
    }
    return _lastStatus;
  } finally {
    _busy = false;
  }
}

function start(opts) {
  if (_started) return;
  _started = true;
  _getMainWindow = (opts && opts.getMainWindow) || (() => null);
  _getProductionOrigin = (opts && opts.getProductionOrigin) || (() => 'https://restrosuite.codearc.co.in');
  _onApplied = (opts && opts.onApplied) || null;
  const webRoot = (opts && opts.webRoot) || '';

  // Content updates work in packaged AND dev — always useful when online
  setTimeout(() => {
    checkContentUpdate({ silent: true, webRoot }).catch(() => {});
  }, CHECK_DELAY_MS);
  setInterval(() => {
    checkContentUpdate({ silent: true, webRoot }).catch(() => {});
  }, PERIODIC_MS);
}

function getStatus() {
  return Object.assign({}, _lastStatus, {
    localVersion: localContentVersion(),
    overlayPath: overlayDir(),
    hasOverlay: fs.existsSync(path.join(overlayDir(), 'app-update.json')) || fs.existsSync(overlayDir()),
  });
}

function getOverlayDir() {
  const d = overlayDir();
  try {
    if (fs.existsSync(d)) return d;
  } catch (_) {}
  return null;
}

module.exports = {
  start,
  checkContentUpdate,
  getStatus,
  getOverlayDir,
  localContentVersion,
  overlayDir,
};
