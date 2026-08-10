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

const { app, dialog, shell, BrowserWindow, ipcMain } = require('electron');
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
let _progressWin = null;
let _progressReady = false;
let _pendingUiState = null;
let _uiActionResolver = null;
let _ipcWired = false;

/** Push status to main window (in-app banner) + optional progress window. */
function emitUpdateEvent(payload) {
  try {
    const w = parentWindow();
    if (w && w.webContents && !w.webContents.isDestroyed()) {
      w.webContents.send('rs-content-update-event', payload || {});
    }
  } catch (_) {}
  _lastStatus = Object.assign({}, _lastStatus, payload || {});
}

function ensureIpcWired() {
  if (_ipcWired) return;
  _ipcWired = true;
  try {
    ipcMain.on('rs-update-ui-ready', () => {
      _progressReady = true;
      if (_pendingUiState) {
        sendProgressState(_pendingUiState);
        _pendingUiState = null;
      }
    });
    ipcMain.on('rs-update-ui-action', (_e, data) => {
      const action = data && data.action;
      if (typeof _uiActionResolver === 'function') {
        const resolve = _uiActionResolver;
        _uiActionResolver = null;
        resolve(action || 'close');
      }
    });
  } catch (e) {
    console.warn('[content-updater] ipc wire failed', e && e.message);
  }
}

function progressHtmlPath() {
  return path.join(__dirname, 'update-progress.html');
}

function closeProgressWindow() {
  _progressReady = false;
  _pendingUiState = null;
  try {
    if (_progressWin && !_progressWin.isDestroyed()) {
      _progressWin.close();
    }
  } catch (_) {}
  _progressWin = null;
}

function sendProgressState(state) {
  _pendingUiState = state;
  try {
    if (_progressWin && !_progressWin.isDestroyed() && _progressWin.webContents) {
      if (_progressReady) {
        _progressWin.webContents.send('rs-update-ui-state', state);
      }
    }
  } catch (_) {}
  emitUpdateEvent(Object.assign({ source: 'content-updater' }, state || {}));
}

/**
 * Open (or reuse) the update progress window.
 * @returns {Promise<import('electron').BrowserWindow|null>}
 */
function openProgressWindow() {
  ensureIpcWired();
  return new Promise((resolve) => {
    try {
      if (_progressWin && !_progressWin.isDestroyed()) {
        try { _progressWin.focus(); } catch (_) {}
        resolve(_progressWin);
        return;
      }
      const parent = parentWindow();
      _progressReady = false;
      _progressWin = new BrowserWindow({
        width: 440,
        height: 320,
        parent: parent || undefined,
        modal: !!parent,
        show: false,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
        },
      });
      _progressWin.setMenuBarVisibility(false);
      _progressWin.on('closed', () => {
        _progressWin = null;
        _progressReady = false;
        if (typeof _uiActionResolver === 'function') {
          const resolveAction = _uiActionResolver;
          _uiActionResolver = null;
          resolveAction('close');
        }
      });
      _progressWin.once('ready-to-show', () => {
        try { _progressWin.show(); } catch (_) {}
      });
      _progressWin.loadFile(progressHtmlPath()).then(() => {
        resolve(_progressWin);
      }).catch((e) => {
        console.warn('[content-updater] progress window load failed', e && e.message);
        resolve(null);
      });
    } catch (e) {
      console.warn('[content-updater] openProgressWindow failed', e && e.message);
      resolve(null);
    }
  });
}

/** Wait for a button action from the progress UI (install / later / reload / close). */
function waitUiAction(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (action) => {
      if (settled) return;
      settled = true;
      _uiActionResolver = null;
      if (timer) clearTimeout(timer);
      resolve(action || 'close');
    };
    _uiActionResolver = done;
    const timer = timeoutMs
      ? setTimeout(() => done('timeout'), timeoutMs)
      : null;
  });
}

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
    // Merge with previous state so dismiss flags / origin are not wiped by accident.
    const prev = readState() || {};
    const next = Object.assign({}, prev, obj || {});
    // Write without BOM (Node utf8 default). Explicit buffer avoids accidental BOM tools.
    const body = JSON.stringify(next, null, 2);
    fs.writeFileSync(statePath(), body, { encoding: 'utf8' });
  } catch (e) {
    console.warn('[content-updater] state write failed', e && e.message);
  }
}

/** User clicked "Later" — do not re-prompt the same remote version until it changes. */
function rememberDismissed(version) {
  if (!version) return;
  writeState({
    dismissedVersion: String(version),
    dismissedAt: new Date().toISOString(),
  });
}

function clearDismissed() {
  const st = readState() || {};
  if (!st.dismissedVersion) return;
  writeState({ dismissedVersion: '', dismissedAt: '' });
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

/**
 * electron-builder / productName changes can move userData
 * (e.g. "RestroSuite" → "RestroSuite Desktop"). Copy applied UI
 * content so we don't re-prompt "You have: 0" after an upgrade.
 */
function migrateLegacyContent() {
  try {
    const cur = app.getPath('userData');
    const hasState = fs.existsSync(statePath());
    const hasOverlay = fs.existsSync(path.join(overlayDir(), 'app-update.json'));
    if (hasState && hasOverlay) return false;

    const home = path.dirname(cur);
    const candidates = [
      path.join(home, 'RestroSuite'),
      path.join(home, 'RestroSuite Desktop'),
      path.join(home, 'restrosuite-desktop'),
      path.join(home, 'RestroSuiteDesktop'),
    ].filter((p) => path.resolve(p) !== path.resolve(cur));

    let moved = false;
    for (const legacy of candidates) {
      try {
        if (!fs.existsSync(legacy)) continue;
        const legState = path.join(legacy, 'content-state.json');
        const legOverlay = path.join(legacy, 'web-overlay');
        if (!fs.existsSync(legState) && !fs.existsSync(legOverlay)) continue;

        if (!hasState && fs.existsSync(legState)) {
          fs.mkdirSync(path.dirname(statePath()), { recursive: true });
          fs.copyFileSync(legState, statePath());
          moved = true;
          console.log('[content-updater] migrated content-state from', legacy);
        }
        if (!hasOverlay && fs.existsSync(legOverlay)) {
          copyDirRecursive(legOverlay, overlayDir());
          moved = true;
          console.log('[content-updater] migrated web-overlay from', legacy);
        }
        if (moved) break;
      } catch (e) {
        console.warn('[content-updater] legacy migrate skip', legacy, e && e.message);
      }
    }
    return moved;
  } catch (e) {
    console.warn('[content-updater] migrateLegacyContent failed', e && e.message);
    return false;
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Rank app-update versions like v215-20260722-slug → 215 (higher = newer). */
function versionRank(v) {
  const m = String(v || '').match(/v(\d+)/i);
  return m ? Number(m[1]) : 0;
}

/**
 * Prefer the newest of: content-state, web-overlay, packaged EXE.
 * Old bug: state always won, so reinstalling a newer EXE still reported
 * "You have: v214" and kept nagging while serving a stale overlay.
 */
function localContentVersion(webRoot) {
  migrateLegacyContent();
  maybePromoteBundledOverStale(webRoot);
  const candidates = [];
  const st = readState();
  if (st && st.version) candidates.push(String(st.version));
  const overlay = readOverlayAppUpdate();
  if (overlay && overlay.version) candidates.push(String(overlay.version));
  const bundled = readBundledAppUpdate(webRoot);
  if (bundled && bundled.version) candidates.push(String(bundled.version));
  if (!candidates.length) return '0';
  candidates.sort((a, b) => versionRank(b) - versionRank(a) || String(b).localeCompare(String(a)));
  return candidates[0];
}

/**
 * When a fresh EXE ships a higher app-update version than the leftover
 * userData overlay, drop the stale overlay so packaged files win and
 * the "Update available" dialog stops incorrectly claiming an old UI.
 */
function maybePromoteBundledOverStale(webRoot) {
  try {
    const bundled = readBundledAppUpdate(webRoot);
    if (!bundled || !bundled.version) return;
    const bVer = String(bundled.version);
    const bRank = versionRank(bVer);
    if (!bRank) return;

    const st = readState();
    const ov = readOverlayAppUpdate();
    const stRank = versionRank(st && st.version);
    const ovRank = versionRank(ov && ov.version);

    if (bRank > stRank || bRank > ovRank) {
      // Remove outdated overlay so server serves the new EXE bundle
      if (ovRank && bRank > ovRank) {
        try {
          const dir = overlayDir();
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log('[content-updater] removed stale web-overlay', ov && ov.version, '<', bVer);
          }
        } catch (e) {
          console.warn('[content-updater] could not clear stale overlay', e && e.message);
        }
      }
      // Align state with the EXE so silent checks stop prompting for content
      // the installer already includes.
      if (bRank > stRank) {
        writeState({
          origin: (st && st.origin) || '',
          title: bundled.title || 'Packaged with installer',
          version: bVer,
          fileCount: st && st.fileCount,
          appliedAt: new Date().toISOString(),
          source: 'bundled-exe',
        });
        console.log('[content-updater] promoted content-state to bundled', bVer);
      }
    }
  } catch (e) {
    console.warn('[content-updater] maybePromoteBundledOverStale failed', e && e.message);
  }
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
 * @param {{ onProgress?: (p: { phase: string, done: number, total: number, file?: string }) => void }} opts
 */
async function applyContentUpdate({ origin, version, files, title, contentStamp, buildId, onProgress }) {
  const base = String(origin || '').replace(/\/+$/, '');
  const staging = path.join(app.getPath('userData'), 'web-overlay-staging');
  const finalDir = overlayDir();
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  // Clean staging
  try {
    fs.rmSync(staging, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(staging, { recursive: true });

  const list = Array.isArray(files) ? files : [];
  if (!list.length) throw new Error('Empty content manifest');
  if (list.length > MAX_FILES) throw new Error('Manifest too large (' + list.length + ' files)');

  // Count downloadable files for a truthful progress total
  const downloadable = [];
  for (const raw of list) {
    const rel = safeRelPath(typeof raw === 'string' ? raw : raw && raw.path);
    if (!rel) continue;
    const baseName = rel.split('/').pop() || '';
    if (/^api\//i.test(rel) || baseName.startsWith('_')) continue;
    downloadable.push(rel);
  }
  const total = Math.max(1, downloadable.length);
  report({ phase: 'installing', done: 0, total, version, title: 'Updating RestroSuite…' });

  let done = 0; // successful downloads
  let attempted = 0;
  let failed = 0;
  const failedPaths = [];
  for (const rel of downloadable) {
    attempted++;
    const segs = rel.split('/');
    const fileUrl = base + '/' + segs.map((s) => encodeURIComponent(s)).join('/');
    try {
      const buf = await fetchBuffer(fileUrl, 45000);
      const dest = path.join(staging, ...segs);
      ensureDirFor(dest);
      fs.writeFileSync(dest, buf);
      done++;
      if (done % 25 === 0) {
        console.log('[content-updater] downloaded', done + '/' + total);
      }
    } catch (e) {
      // One missing asset must not brick the whole feature update (old bug:
      // any 404 aborted apply → content-state never advanced → prompt forever).
      failed++;
      if (failedPaths.length < 12) failedPaths.push(rel + ' (' + String(e && e.message || e) + ')');
      console.warn('[content-updater] skip file', rel, e && e.message);
    }
    report({
      phase: 'progress',
      done: attempted,
      total,
      file: rel,
      version,
      title: 'Updating RestroSuite…',
      detail: 'Downloading the latest screens. This only takes a moment.',
      statusLine: attempted + ' of ' + total + ' files',
    });
  }

  if (done < 3) {
    throw new Error(
      'Too few files downloaded (' + done + '). Check internet / CDN. ' +
      (failedPaths[0] || '')
    );
  }

  // Always stamp the exact remote version into overlay app-update.json so the
  // next check sees local === remote even if the remote file was skipped.
  try {
    const auPath = path.join(staging, 'app-update.json');
    let au = {
      version: String(version),
      date: new Date().toISOString().slice(0, 10),
      title: title || 'Content update',
      summary: 'Live UI update applied by RestroSuite Desktop',
    };
    if (fs.existsSync(auPath)) {
      try {
        au = Object.assign({}, JSON.parse(fs.readFileSync(auPath, 'utf8')), {
          version: String(version),
          title: title || au.title,
        });
      } catch (_) {}
    }
    fs.writeFileSync(auPath, JSON.stringify(au, null, 2), 'utf8');
  } catch (e) {
    console.warn('[content-updater] could not stamp app-update.json', e && e.message);
  }

  // Swap staging → overlay (replace)
  try {
    fs.rmSync(finalDir, { recursive: true, force: true });
  } catch (_) {}
  fs.renameSync(staging, finalDir);

  writeState({
    version: String(version),
    title: title || '',
    contentStamp: String(contentStamp || buildId || ''),
    buildId: String(buildId || contentStamp || ''),
    appliedAt: new Date().toISOString(),
    fileCount: done,
    failedCount: failed,
    origin: base,
    dismissedVersion: '',
    dismissedAt: '',
    source: 'content-updater',
  });

  // Mirror into sibling userData folders so dual productName installs stop
  // re-prompting ("RestroSuite" vs "RestroSuite Desktop").
  try {
    syncStateToSiblingUserData(String(version), title, base, done);
  } catch (e) {
    console.warn('[content-updater] sibling sync failed', e && e.message);
  }

  return { ok: true, version, fileCount: done, failedCount: failed, overlay: finalDir };
}

function syncStateToSiblingUserData(version, title, origin, fileCount) {
  const cur = app.getPath('userData');
  const home = path.dirname(cur);
  const siblings = [
    path.join(home, 'RestroSuite'),
    path.join(home, 'RestroSuite Desktop'),
    path.join(home, 'restrosuite-desktop'),
  ].filter((p) => path.resolve(p) !== path.resolve(cur) && fs.existsSync(p));

  const payload = {
    version: String(version),
    title: title || '',
    appliedAt: new Date().toISOString(),
    fileCount: fileCount || 0,
    origin: origin || '',
    dismissedVersion: '',
    source: 'content-updater-mirror',
  };
  for (const dir of siblings) {
    try {
      const sp = path.join(dir, 'content-state.json');
      let prev = {};
      try {
        prev = JSON.parse(fs.readFileSync(sp, 'utf8'));
      } catch (_) {}
      fs.writeFileSync(sp, JSON.stringify(Object.assign({}, prev, payload), null, 2), 'utf8');
    } catch (_) {}
  }
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
  const useUi = !options.silent;
  let uiOpen = false;

  const showUi = async (state) => {
    if (!useUi) {
      emitUpdateEvent(state);
      return;
    }
    if (!uiOpen) {
      await openProgressWindow();
      uiOpen = true;
      // brief wait so renderer can bind ipc
      await new Promise((r) => setTimeout(r, 80));
    }
    sendProgressState(state);
  };

  try {
    migrateLegacyContent();
    const origin = String(_getProductionOrigin() || 'https://restrosuite.codearc.co.in').replace(/\/+$/, '');
    const webRoot = options.webRoot || '';
    const localVer = localContentVersion(webRoot);

    if (useUi) {
      await showUi({
        phase: 'checking',
        version: localVer,
        detail: 'Looking for the latest features and fixes on the live server.',
      });
    }

    let remoteUpdate;
    try {
      remoteUpdate = await fetchJson(origin + '/app-update.json?v=' + Date.now());
    } catch (e) {
      _lastStatus = { status: 'error', error: String(e && e.message || e) };
      if (useUi) {
        await showUi({
          phase: 'error',
          title: 'Could not check for updates',
          detail: String(e && e.message || e) + '\n\nCheck internet, then try Help → Check for Updates.',
        });
        await waitUiAction(0);
        closeProgressWindow();
      }
      return _lastStatus;
    }

    const remoteVer = String((remoteUpdate && remoteUpdate.version) || '').trim();
    if (!remoteVer) {
      _lastStatus = { status: 'no-feed' };
      if (uiOpen) closeProgressWindow();
      return _lastStatus;
    }

    const localRank = versionRank(localVer);
    const remoteRank = versionRank(remoteVer);
    // contentStamp / buildId: every Vercel deploy can force a pull even if
    // someone forgot to bump the human-facing vNNN (belt-and-suspenders).
    const remoteStamp = String(
      (remoteUpdate && (remoteUpdate.contentStamp || remoteUpdate.buildId)) || ''
    ).trim();
    const stForStamp = readState() || {};
    const localStamp = String(stForStamp.contentStamp || stForStamp.buildId || '').trim();
    // Also parse YYYYMMDD from version string (v280-20260808-slug) so a
    // same-or-higher calendar date can win even if major temporarily regressed
    // on a bad deploy (user had v259 while production briefly published v254).
    function dateRank(v) {
      const m = String(v || '').match(/v\d+-(\d{8})/i);
      return m ? Number(m[1]) : 0;
    }
    const localDate = dateRank(localVer);
    const remoteDate = dateRank(remoteVer);
    const dateAllows =
      !localDate || !remoteDate || remoteDate >= localDate;
    const stampNewer = !!(
      remoteStamp &&
      remoteStamp !== localStamp &&
      (remoteRank >= localRank || (dateAllows && remoteRank + 50 >= localRank))
    );

    // Need update when:
    //  - remote version string differs and is not older (by vNNN), OR
    //  - remote contentStamp/buildId differs (auto-deploy fingerprint)
    // Never re-prompt for a clearly *older* remote major after a reinstall
    // unless the calendar date is newer (handles major-number regressions).
    const needsUpdate =
      options.force ||
      (remoteVer !== localVer && remoteRank >= localRank) ||
      (remoteVer !== localVer && remoteDate > localDate) ||
      stampNewer;

    if (!options.force && !needsUpdate) {
      _lastStatus = { status: 'current', version: localVer, kind: 'content' };
      if (useUi) {
        await showUi({
          phase: 'current',
          version: localVer,
          detail:
            'UI ' + localVer + ' · App shell v' + app.getVersion() +
            '\nYou already have the latest features.',
        });
        await waitUiAction(0);
        closeProgressWindow();
      }
      return _lastStatus;
    }

    // Same remote already dismissed with "Later" — quiet until version changes
    const stNow = readState() || {};
    if (
      !options.force &&
      options.silent &&
      stNow.dismissedVersion &&
      String(stNow.dismissedVersion) === remoteVer
    ) {
      _lastStatus = {
        status: 'dismissed',
        version: remoteVer,
        localVersion: localVer,
        kind: 'content',
      };
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

    const promptDetail =
      ((remoteUpdate && remoteUpdate.title) || 'New features and fixes') +
      '\n\n' +
      ((remoteUpdate && remoteUpdate.summary) || '') +
      '\n\nYou have: ' + localVer +
      '\nThis downloads only the updated screens (not the whole installer). Your bills and login stay safe.';

    // Silent background prompt: open progress UI for available + install
    // (same polished bar whether Help → Check or auto-check)
    await showUi({
      phase: 'available',
      version: remoteVer,
      localVersion: localVer,
      title: 'RestroSuite ' + remoteVer + ' is ready',
      detail: promptDetail,
    });
    uiOpen = true;
    // FIX: silent background checks open no progress window, so no renderer
    // will ever send an IPC action — waitUiAction(0) (no timer) would hang
    // forever, leaving _busy stuck and silently disabling every later check
    // (including the user's manual "Check for Updates"). Auto-install instead.
    let action;
    if (useUi) {
      action = await waitUiAction(0);
    } else {
      console.log('[content-updater] silent check: auto-installing', remoteVer);
      action = 'install';
    }
    if (action !== 'install' && action !== 'primary') {
      rememberDismissed(remoteVer);
      _lastStatus = Object.assign({}, _lastStatus, { status: 'dismissed' });
      closeProgressWindow();
      return _lastStatus;
    }

    // Download + apply with live progress bar
    console.log('[content-updater] applying', remoteVer, 'from', origin);
    await showUi({
      phase: 'installing',
      version: remoteVer,
      title: 'Updating RestroSuite…',
      detail: 'Downloading the latest screens. This only takes a moment.',
      done: 0,
      total: 0,
    });

    const man = await loadRemoteManifest(origin);
    // Static UI only — drop serverless / private paths so a bad manifest never
    // 404-aborts install (especially on older EXEs without per-file skip).
    const files = (man.files || []).filter((f) => {
      const rel = String(typeof f === 'string' ? f : (f && f.path) || '').replace(/\\/g, '/');
      if (!rel || /^api\//i.test(rel)) return false;
      const base = rel.split('/').pop() || '';
      if (base.startsWith('_')) return false;
      return true;
    });
    // Ensure app-update.json is always pulled
    if (!files.includes('app-update.json')) files.unshift('app-update.json');

    const result = await applyContentUpdate({
      origin,
      version: remoteVer,
      files,
      title: remoteUpdate && remoteUpdate.title,
      contentStamp: remoteUpdate && (remoteUpdate.contentStamp || remoteUpdate.buildId),
      buildId: remoteUpdate && remoteUpdate.buildId,
      onProgress: (p) => {
        showUi(Object.assign({
          phase: 'progress',
          version: remoteVer,
          title: 'Updating RestroSuite…',
          detail: 'Downloading the latest screens. This only takes a moment.',
        }, p || {}));
      },
    });

    clearDismissed();

    // Re-read so UI message matches what was actually banked
    const banked = localContentVersion(webRoot);
    _lastStatus = {
      status: 'applied',
      version: banked || remoteVer,
      fileCount: result.fileCount,
      failedCount: result.failedCount || 0,
      kind: 'content',
    };

    const failNote =
      result.failedCount > 0
        ? ' (' + result.failedCount + ' optional files skipped)'
        : '';

    await showUi({
      phase: 'success',
      version: banked || remoteVer,
      title: 'RestroSuite ' + remoteVer + ' installed',
      detail:
        'Updated ' + result.fileCount + ' files' + failNote +
        '.\nReload to use the new screens. Your data is safe.',
      statusLine: 'Update complete',
    });

    // FIX: same silent-mode guard as the available branch — no progress
    // window is open in silent checks, so waitUiAction(0) would hang and
    // _busy would stay stuck, blocking all later update checks.
    let next;
    if (useUi) {
      next = await waitUiAction(0);
      closeProgressWindow();
    } else {
      next = 'reload';
      console.log('[content-updater] silent check: update applied, reloading');
    }
    if ((next === 'reload' || next === 'primary') && typeof _onApplied === 'function') {
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
    if (useUi) {
      await showUi({
        phase: 'error',
        title: 'Could not install update',
        detail: String(e && e.message || e),
      });
      await waitUiAction(0);
      closeProgressWindow();
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

  // Fix stale userData left by older installs before first check
  try {
    maybePromoteBundledOverStale(webRoot);
  } catch (_) {}

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
    if (!fs.existsSync(d)) return null;
    // Never serve an overlay older than the packaged EXE content version.
    const ov = readOverlayAppUpdate();
    // webRoot not always known here — compare against any content-state that
    // was promoted from the EXE, and against remote-applied versions only.
    // If overlay app-update is missing, still allow overlay (legacy).
    if (ov && ov.version) {
      const st = readState();
      // If state says we are on bundled-exe and ranks higher, overlay is stale
      if (st && st.source === 'bundled-exe' && versionRank(st.version) > versionRank(ov.version)) {
        return null;
      }
    }
    return d;
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
