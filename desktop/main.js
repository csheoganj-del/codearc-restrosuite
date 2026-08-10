/* ============================================================
   RestroSuite Desktop -- Electron main process
   ------------------------------------------------------------
   - Boots a local Express server (server.js) that serves a copy
     of the web app from ./app and provides /api/config.
   - Opens a BrowserWindow pointed at http://localhost:<port>.
   - Works fully OFFLINE (all files + config are local) and
     ONLINE (Supabase reachable, RS_DB syncs). No web-app code
     is modified -- this is a pure wrapper.
   ============================================================ */
'use strict';

const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain, safeStorage, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createServer } = require('./server');
const licenseGate = require('./license-main');
const autoUpdater = require('./auto-updater');
const contentUpdater = require('./content-updater');

// --- Load config -----------------------------------------------------------
function loadConfig() {
  const candidates = [
    path.join(__dirname, 'config.json'),
    path.join(process.resourcesPath || '', 'config.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { /* try next */ }
  }
  return {};
}
const config = loadConfig();
/** Mutable: may advance if preferred port is busy (EADDRINUSE). */
let PORT = Number(config.port) || 8001;
const PREFERRED_PORT = PORT;
const PROD_ORIGIN = config.productionOrigin || 'https://restrosuite.codearc.co.in';

// Resolve the web-app root: packaged builds unpack it to resources/app-web,
// dev runs serve it straight from ./app.
function resolveWebRoot() {
  const packaged = path.join(process.resourcesPath || '', 'app-web');
  const dev = path.join(__dirname, 'app');
  if (fs.existsSync(packaged)) return packaged;
  return dev;
}

let mainWindow = null;
let serverInstance = null;
let lanDiscoveryInstance = null;
let appEntryUrl = null; // set in createWindow; used by the license re-check IPC
let tray = null;
/** Must stay referenced — if GC'd after tray.setImage(), Windows tray icon vanishes
 *  (often when user opens the ^ "Show hidden icons" overflow). */
let trayImageRef = null;
let trayIconPathRef = null;
let trayWatchTimer = null;
let isQuitting = false; // true only for real Quit (tray / menu), not window X

// --- Single-instance lock: second launch focuses the existing window -------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Re-open from tray if user launches the shortcut again
    showMainWindow();
  });
}

/**
 * Windows "Start with Windows" via Electron's setLoginItemSettings writes
 * electron.app.* Run keys that often omit quotes. Username paths with spaces
 * (e.g. C:\Users\MASTER PC\...) become C:\Users\MASTER →
 * "Unable to find Electron app at C:\Users\MASTER".
 *
 * We write a properly quoted HKCU\...\Run value ourselves and clear the
 * broken electron.app.* keys Electron may have left behind.
 */
function setStartWithWindows(enabled) {
  if (process.platform !== 'win32') {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        openAsHidden: true,
        path: process.execPath,
        args: app.isPackaged ? [] : ['.'],
      });
    } catch (e) {
      console.warn('[main] openAtLogin failed:', e && e.message);
    }
    return;
  }

  const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const valueName = 'RestroSuiteDesktop';
  const { execFileSync } = require('child_process');

  try {
    // Prefer clean quoted entry; never rely on electron.app.* for spaces-in-path.
    if (enabled) {
      const cmdLine = app.isPackaged
        ? `"${process.execPath}"`
        : `"${process.execPath}" "${path.resolve(__dirname)}"`;
      // reg add requires extra quotes around the data when it contains quotes
      execFileSync(
        'reg',
        ['add', runKey, '/v', valueName, '/t', 'REG_SZ', '/d', cmdLine, '/f'],
        { windowsHide: true, stdio: 'ignore' }
      );
    } else {
      try {
        execFileSync('reg', ['delete', runKey, '/v', valueName, '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch (_) { /* value may not exist */ }
    }
  } catch (e) {
    console.warn('[main] registry login item failed:', e && e.message);
  }

  // Disable Electron's own Run entry so it does not re-introduce unquoted paths.
  try {
    app.setLoginItemSettings({ openAtLogin: false });
  } catch (_) {}

  // Best-effort cleanup of broken keys from older builds / portable / dev runs.
  for (const bad of [
    'electron.app.RestroSuite',
    'electron.app.Electron',
    'electron.app.RestroSuite Desktop',
  ]) {
    try {
      execFileSync('reg', ['delete', runKey, '/v', bad, '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch (_) {}
  }
}

function isStartWithWindowsEnabled() {
  if (process.platform !== 'win32') {
    try {
      return !!app.getLoginItemSettings().openAtLogin;
    } catch (_) {
      return false;
    }
  }
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'RestroSuiteDesktop'],
      { windowsHide: true, encoding: 'utf8' }
    );
    return /RestroSuiteDesktop/i.test(out);
  } catch (_) {
    return false;
  }
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const root = resolveWebRoot();
    if (!fs.existsSync(root)) {
      return reject(new Error(
        'Web app files not found at: ' + root +
        '\nRun "npm run sync" in the desktop/ folder before building.'
      ));
    }
    // Live feature updates land in userData/web-overlay and win over packaged files.
    // getOverlay is re-read per request so first install of an update does not need
    // a full process restart (window reload is enough).
    const expressApp = createServer({
      root,
      config,
      getPort: () => PORT,
      lanStateFile: path.join(app.getPath('userData'), 'lan-hub-orders.json'),
      lanCredentialsFile: path.join(app.getPath('userData'), 'lan-hub-pairing.json'),
      getOverlay: () => {
        try {
          return contentUpdater.getOverlayDir();
        } catch (_) {
          return null;
        }
      },
    });

    const maxAttempts = 20;
    let attempt = 0;
    let candidate = PREFERRED_PORT;

    function tryListen() {
      const srv = http.createServer(expressApp);
      srv.once('error', (err) => {
        try { srv.close(); } catch (_) {}
        const code = err && err.code;
        if ((code === 'EADDRINUSE' || code === 'EACCES') && attempt < maxAttempts - 1) {
          attempt += 1;
          candidate = PREFERRED_PORT + attempt;
          console.warn(
            `[main] port ${PORT} busy (${code}); trying ${candidate}`
          );
          tryListen();
          return;
        }
        reject(err);
      });
      // Bind all interfaces so kitchen displays on the same Wi‑Fi can open
      // http://POS_LAN_IP:port for LAN KOT sync when internet is down.
      // The Windows installer creates private-network-only firewall rules for
      // this executable and the complete 8001–8020 fallback range.
      const host = config.lanBindHost != null ? String(config.lanBindHost) : '0.0.0.0';
      srv.listen(candidate, host, () => {
        PORT = candidate;
        if (PORT !== PREFERRED_PORT) {
          console.warn(`[main] listening on fallback port ${PORT} (preferred ${PREFERRED_PORT} was busy)`);
        }
        try {
          const { listLanIPs } = require('./lan-hub');
          const ips = listLanIPs();
          if (ips.length) {
            console.log('[main] LAN kitchen hub: open on tablets → http://' + ips[0] + ':' + PORT);
          }
        } catch (_) {}
        try {
          const { startLanDiscovery } = require('./lan-hub');
          if (lanDiscoveryInstance) lanDiscoveryInstance.close();
          lanDiscoveryInstance = startLanDiscovery(() => PORT);
        } catch (error) {
          console.warn('[main] automatic LAN discovery unavailable:', error && error.message);
        }
        resolve(srv);
      });
    }

    tryListen();
  });
}

// Desktop serves the UI from http://localhost:<port>, but Supabase Edge
// Functions CORS-allowlist production origins. Without a bridge, Chromium
// blocks login as a CORS failure (works in browser, fails in the .exe).
//
// Bridge:
//   1) Outbound: set Origin to a production origin the functions accept.
//   2) Inbound: rewrite Access-Control-Allow-Origin back to the real page
//      origin (http://localhost:<port>) so Chromium's CORS check passes.
//
// Also covers fallback ports if 8001 is busy.
function installOriginRewrite() {
  const filter = { urls: ['https://*.supabase.co/*', 'wss://*.supabase.co/*'] };
  const localOrigin = () => `http://localhost:${PORT}`;

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
    const headers = details.requestHeaders || {};
    // Prefer configured production origin (must be in Edge ALLOWED_ORIGINS).
    headers['Origin'] = PROD_ORIGIN || 'https://restrosuite.codearc.co.in';
    // Some stacks also key off Referer.
    if (headers['Referer'] || headers['referer']) {
      headers['Referer'] = (PROD_ORIGIN || 'https://restrosuite.codearc.co.in') + '/';
    }
    cb({ requestHeaders: headers });
  });

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, cb) => {
    const headers = { ...(details.responseHeaders || {}) };
    const allow = localOrigin();
    // Electron header maps are case-sensitive arrays of strings.
    const drop = ['access-control-allow-origin', 'Access-Control-Allow-Origin'];
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === 'access-control-allow-origin') delete headers[k];
    }
    headers['Access-Control-Allow-Origin'] = [allow];
    headers['Access-Control-Allow-Credentials'] = ['true'];
    // Ensure preflight / custom headers survive
    const hasAllowHeaders = Object.keys(headers).some(
      (k) => k.toLowerCase() === 'access-control-allow-headers'
    );
    if (!hasAllowHeaders) {
      headers['Access-Control-Allow-Headers'] = [
        'authorization, x-client-info, apikey, content-type',
      ];
    }
    const hasAllowMethods = Object.keys(headers).some(
      (k) => k.toLowerCase() === 'access-control-allow-methods'
    );
    if (!hasAllowMethods) {
      headers['Access-Control-Allow-Methods'] = ['POST, GET, OPTIONS, PUT, DELETE'];
    }
    void drop;
    cb({ responseHeaders: headers });
  });
}

function resolveAppIcon() {
  // Prefer REAL filesystem paths outside asar — brand plate/flame logo first.
  // resources/tray/* is installed next to the EXE (not inside asar).
  const candidates = [
    path.join(process.resourcesPath || '', 'tray', 'tray.ico'),
    path.join(process.resourcesPath || '', 'tray', 'icon.ico'),
    path.join(process.resourcesPath || '', 'tray', 'tray.png'),
    path.join(process.resourcesPath || '', 'tray', 'icon.png'),
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(__dirname, 'build', 'tray.ico'),
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, 'build', 'tray.png'),
    path.join(__dirname, 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

/**
 * Last-resort tray image only if brand files are missing.
 * Prefer loading the real logo via resolveAppIcon / loadTrayImage.
 */
function solidTrayFallbackImage() {
  // Tiny brand-colored square — never the letter "R" (logo is preferred above).
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFUlEQVR42mP4z8BQz0BFwEhVQ0YN' +
      'GDVg1AAKAAD//wMA8v8D/eqMYc0AAAAASUVORK5CYII='
  );
}

function trayDebugLog(msg) {
  try {
    const p = path.join(app.getPath('userData'), 'tray-debug.log');
    fs.appendFileSync(p, new Date().toISOString() + ' ' + msg + '\n', 'utf8');
  } catch (_) {}
  try { console.log('[tray]', msg); } catch (_) {}
}

function loadTrayImage() {
  const iconPath = resolveAppIcon();
  let image = null;
  if (iconPath) {
    try {
      image = nativeImage.createFromPath(iconPath);
    } catch (e) {
      console.warn('[tray] createFromPath failed', iconPath, e && e.message);
    }
  }
  if (!image || image.isEmpty()) {
    console.warn('[tray] icon empty/missing, using solid fallback. path=', iconPath);
    image = solidTrayFallbackImage();
  }
  try {
    // Windows tray is ~16–20px; oversized icons sometimes render blank.
    if (image && !image.isEmpty()) {
      const size = image.getSize();
      if (size.width > 32 || size.height > 32) {
        image = image.resize({ width: 16, height: 16, quality: 'best' });
      }
    }
  } catch (_) {}
  if (!image || image.isEmpty()) image = solidTrayFallbackImage();
  return image;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.show(); } catch (_) {}
  }
}

/** Notify once when hiding to tray/menu-bar (Windows balloon / macOS Notification). */
let _hideNotified = false;
function notifyStillRunning() {
  if (_hideNotified) return;
  _hideNotified = true;
  const title = 'RestroSuite is still running';
  const body = process.platform === 'darwin'
    ? 'App is in the menu bar. Click the icon to open again, or Quit from the menu.'
    : 'App is in the system tray. Double-click the tray icon to open again, or right-click → Quit.';
  try {
    if (process.platform === 'win32' && tray) {
      tray.displayBalloon({ title, content: body });
      return;
    }
  } catch (_) {}
  try {
    if (Notification && Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (_) {}
}

/**
 * Re-pin tray icon from disk path. Avoid ephemeral NativeImage-only icons —
 * Windows GC + overflow (^) refresh makes them vanish.
 */
function reassertTrayIcon() {
  if (!tray || isQuitting) return;
  try {
    if (trayIconPathRef && fs.existsSync(trayIconPathRef)) {
      // Path-based is stable across Shell_NotifyIcon refresh
      tray.setImage(trayIconPathRef);
      return;
    }
  } catch (_) {}
  try {
    if (trayImageRef && !trayImageRef.isEmpty()) {
      tray.setImage(trayImageRef);
    }
  } catch (_) {}
}

/** System tray / menu bar: close (X) hides; local server keeps running for silent POS. */
function createTray() {
  if (tray) return;
  // Windows: Tray(path-to-.ico) is far more reliable than Tray(NativeImage).
  // NEVER replace a path tray with an unpinned NativeImage — when GC runs
  // (often when user opens ^ "Show hidden icons"), the icon disappears.
  const iconPath = resolveAppIcon();
  trayIconPathRef = iconPath;
  trayDebugLog('createTray start iconPath=' + iconPath + ' resourcesPath=' + (process.resourcesPath || ''));
  let created = false;
  let usedPath = false;
  if (iconPath && process.platform === 'win32') {
    try {
      tray = new Tray(iconPath);
      created = true;
      usedPath = true;
      trayDebugLog('created from path ' + iconPath);
    } catch (e) {
      trayDebugLog('path create failed ' + (e && e.message));
    }
  }
  if (!created) {
    const image = loadTrayImage();
    trayImageRef = image; // pin — required for setImage lifetime
    try {
      tray = new Tray(image);
      created = true;
      trayDebugLog('created from NativeImage empty=' + image.isEmpty() + ' size=' + JSON.stringify(image.getSize()));
    } catch (e) {
      trayDebugLog('create failed ' + (e && e.message));
      try {
        trayImageRef = solidTrayFallbackImage();
        tray = new Tray(trayImageRef);
        created = true;
        trayDebugLog('created from solid fallback');
      } catch (e2) {
        trayDebugLog('fallback create failed ' + (e2 && e2.message));
        return;
      }
    }
  }
  // Windows path-based tray: do NOT setImage(NativeImage) — that unpins the
  // stable shell icon and the icon vanishes when the overflow flyout refreshes.
  if (!usedPath) {
    try {
      const image = loadTrayImage();
      trayImageRef = image;
      if (image && !image.isEmpty()) {
        tray.setImage(image);
        trayDebugLog('setImage brand logo ok size=' + JSON.stringify(image.getSize()));
      }
    } catch (e) {
      trayDebugLog('setImage failed ' + (e && e.message));
    }
  } else {
    trayDebugLog('keeping path-based tray icon (no setImage NativeImage)');
  }
  try {
    tray.setIgnoreDoubleClickEvents(true); // single-click = open (no double-click race)
  } catch (_) {}
  tray.setToolTip('RestroSuite Desktop — running in background');
  const loginLabel = process.platform === 'darwin'
    ? 'Open at Login'
    : process.platform === 'win32'
      ? 'Open at Login (Start with Windows)'
      : 'Open at Login';
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open RestroSuite',
      click: () => showMainWindow(),
    },
    {
      label: 'Check for Updates…',
      click: () => { try { runFullUpdateCheck(); } catch (_) {} },
    },
    { type: 'separator' },
    {
      label: loginLabel,
      type: 'checkbox',
      checked: isStartWithWindowsEnabled(),
      click: (item) => {
        try {
          setStartWithWindows(!!item.checked);
        } catch (_) {}
      },
    },
    { type: 'separator' },
    {
      label: 'Quit RestroSuite',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  // Always show on click — never hide from tray (hide is window X only).
  // Toggle-hide made the app "disappear" when staff clicked the tray icon.
  const openFromTray = () => {
    reassertTrayIcon();
    showMainWindow();
  };
  tray.on('double-click', openFromTray);
  tray.on('click', openFromTray);
  // Right-click already opens context menu via setContextMenu

  // Re-pin icon after display / power changes (Windows overflow refresh)
  try {
    const { screen, powerMonitor } = require('electron');
    const bump = () => {
      try { reassertTrayIcon(); } catch (_) {}
    };
    screen.on('display-metrics-changed', bump);
    if (powerMonitor) {
      powerMonitor.on('resume', bump);
      powerMonitor.on('unlock-screen', bump);
    }
  } catch (_) {}
  // Light watchdog: if Shell drops the icon after overflow use, re-set path
  if (process.platform === 'win32' && !trayWatchTimer) {
    trayWatchTimer = setInterval(() => {
      if (isQuitting) return;
      try { reassertTrayIcon(); } catch (_) {}
    }, 45000);
    if (trayWatchTimer.unref) trayWatchTimer.unref();
  }

  // One quiet tip only (balloons themselves can glitch the tray on some PCs)
  if (process.platform === 'win32') {
    try {
      setTimeout(() => {
        if (!tray || isQuitting) return;
        reassertTrayIcon();
        try {
          if (Notification.isSupported()) {
            new Notification({
              title: 'RestroSuite Desktop is running',
              body: 'Icon is near the clock (or under ^). Click it to open. Right-click → Quit.',
            }).show();
          }
        } catch (_) {}
      }, 1200);
    } catch (_) {}
  }
  trayDebugLog('createTray finished ok path=' + !!usedPath);
}

function createWindow() {
  const win = new BrowserWindow({
    width: (config.window && config.window.width) || 1280,
    height: (config.window && config.window.height) || 820,
    minWidth: (config.window && config.window.minWidth) || 1024,
    minHeight: (config.window && config.window.minHeight) || 640,
    backgroundColor: '#0f1115',
    show: false,
    icon: resolveAppIcon() || undefined,
    title: (config.appName || 'RestroSuite') + ' Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Hardening: no remote module, no insecure content, sandbox when possible
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // DevTools only via explicit menu in development (see buildMenu)
      devTools: !app.isPackaged || process.env.RS_ALLOW_DEVTOOLS === '1',
    },
  });

  // Close (X) → hide to tray / menu bar (silent background). Real quit via tray menu.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
      notifyStillRunning();
    }
  });

  // Show a small splash immediately, then load the app.
  win.loadFile(path.join(__dirname, 'splash.html')).catch(() => {});

  const entry = (config.entry || '/login');
  const url = `http://localhost:${PORT}${entry.startsWith('/') ? entry : '/' + entry}`;
  appEntryUrl = url;

  win.webContents.once('did-finish-load', () => {
    if (!win.isVisible()) win.show();
  });

  // Offline-lease gate: re-verify in main for logging / HWM, but NEVER show
  // lock.html on cold start. Staff were forced to click "Retry now" every boot
  // even with good internet — main often has no DPAPI lease yet while the web
  // layer still has a valid one (or can mint one online). Soft-open always;
  // license-guard enforces after it can refresh. lock.html remains for rare
  // manual recheck paths only.
  try {
    const decision = licenseGate.gate();
    if (decision && decision.locked) {
      console.warn('[main] license gate advisory (soft-open always):', decision.reason || '');
    }
  } catch (e) {
    console.warn('[main] license gate error (soft-open):', e && e.message);
  }

  setTimeout(() => {
    const bootUrl =
      url + (url.includes('?') ? '&' : '?') + 'rs_desktop_boot=1&t=' + Date.now();
    win.loadURL(bootUrl).catch((err) => {
      dialog.showErrorBox('RestroSuite failed to start', String(err));
    });
  }, 600);

  // Open external links (mailto, https to other sites) in the system browser,
  // not inside the app window.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\/localhost:/.test(target)) return { action: 'allow' };
    shell.openExternal(target).catch(() => {});
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, target) => {
    if (!target.startsWith(`http://localhost:${PORT}`)) {
      e.preventDefault();
      shell.openExternal(target).catch(() => {});
    }
  });

  // Production: block DevTools keyboard shortcuts and context-menu inspect
  if (app.isPackaged && process.env.RS_ALLOW_DEVTOOLS !== '1') {
    win.webContents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase();
      if (input.type === 'keyDown') {
        if (key === 'f12') event.preventDefault();
        if (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) {
          event.preventDefault();
        }
        if (input.control && key === 'u') event.preventDefault();
      }
    });
    win.webContents.on('context-menu', (e) => {
      e.preventDefault();
    });
  }

  win.on('closed', () => { mainWindow = null; });
  mainWindow = win;
}

/**
 * Professional update check: features (live site) first, then EXE shell.
 * Help → Check for Updates and tray "Check for updates" both use this.
 */
async function runFullUpdateCheck() {
  const webRoot = resolveWebRoot();
  // 1) Feature / UI content (works on every build: Setup, Portable, even dev)
  let contentResult = { status: 'skipped' };
  try {
    contentResult = await contentUpdater.checkContentUpdate({
      silent: false,
      webRoot,
    });
  } catch (e) {
    console.warn('[main] content check failed', e && e.message);
  }

  // After a feature update was just installed, skip shell dialogs so the user
  // only sees "reload". Still check the EXE shell when features are already
  // current so 2.0.7 → 2.0.8 installers can still auto-update.
  if (contentResult && contentResult.status === 'applied') {
    return { content: contentResult, shell: { status: 'skipped' } };
  }

  // 2) App shell (packaged only)
  let shellResult = { status: 'skipped' };
  try {
    // When UI is already current, avoid a second "features up to date" style
    // spam if the shell check finds nothing — shell path handles its own UX.
    shellResult = await autoUpdater.checkNow({
      quietIfCurrent: contentResult && contentResult.status === 'current',
    });
  } catch (e) {
    console.warn('[main] shell check failed', e && e.message);
  }
  return { content: contentResult, shell: shellResult };
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [ isMac ? { role: 'close' } : { role: 'quit' } ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        // DevTools only when unpackaged or RS_ALLOW_DEVTOOLS=1 (production EXE locked down)
        ...(!app.isPackaged || process.env.RS_ALLOW_DEVTOOLS === '1'
          ? [{ label: 'Toggle Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', role: 'toggleDevTools' }]
          : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click() { runFullUpdateCheck().catch(() => {}); },
        },
        {
          label: 'About RestroSuite Desktop',
          click() {
            const kind = autoUpdater.isPortable() ? 'Portable' : 'Installed';
            let uiVer = '';
            try {
              uiVer = contentUpdater.localContentVersion(resolveWebRoot());
            } catch (_) {}
            const shortUi = String(uiVer || 'bundled').split('-')[0] || uiVer;
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'RestroSuite Desktop',
              message: `${config.appName || 'RestroSuite'} Desktop`,
              // One plain-language version story for owners (no feed URLs).
              detail:
                `App ${app.getVersion()} (${kind})\n` +
                `Features ${shortUi}\n\n` +
                'App = desktop installer (print, tray, updates).\n' +
                'Features = menus, settings, POS screens (update online).\n\n' +
                'Support: support@codearc.co.in',
            });
          },
        },
        // Dev-only: misnamed legacy entry that opened DevTools. Hidden in production EXE.
        ...(!app.isPackaged || process.env.RS_ALLOW_DEVTOOLS === '1'
          ? [{
              label: 'Toggle Developer Tools',
              accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
              click() {
                try {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.toggleDevTools();
                  }
                } catch (_) {}
              },
            }]
          : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    // Windows: stable toast/tray identity (helps icons show under correct name)
    try {
      if (process.platform === 'win32') {
        app.setAppUserModelId('com.restrosuite.desktop');
      }
    } catch (_) {}

    installOriginRewrite();

    try {
      licenseGate.init({ userDataDir: app.getPath('userData'), webRoot: resolveWebRoot(), safeStorage });
    } catch (e) {
      console.warn('[main] license gate init failed (failing open):', e && e.message);
    }

    ipcMain.handle('rs-license-store', (_evt, leaseToken, serverTimeMs) => {
      try { return licenseGate.persistLease(leaseToken, serverTimeMs); }
      catch (e) { return { error: String(e && e.message) }; }
    });
    ipcMain.handle('rs-license-recheck', () => {
      // Always soft-open the web app on Retry. lock.html cannot mint a lease;
      // the renderer license-guard does. Main gate alone used to keep staff
      // stuck until a second click raced past a cold-start glitch.
      try {
        licenseGate.gate();
      } catch (_) {}
      if (appEntryUrl && mainWindow && !mainWindow.isDestroyed()) {
        const u =
          appEntryUrl +
          (appEntryUrl.includes('?') ? '&' : '?') +
          'rs_license_retry=1&t=' +
          Date.now();
        mainWindow.loadURL(u).catch(() => {});
      }
      return { locked: false, reason: 'soft_retry', soft: true };
    });

    // Wave 4 — print bridge (silent HTML thermal + printer list)
    // Default-printer restore helpers are defined near openReceiptInSystemBrowser.
    try {
      app.on('before-quit', () => {
        try {
          const p = path.join(app.getPath('userData'), 'print-default-restore.json');
          if (!fs.existsSync(p)) return;
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          const name = data && data.previousDefault ? String(data.previousDefault).trim() : '';
          if (name) {
            try {
              require('child_process').execFileSync(
                'rundll32.exe',
                ['printui.dll,PrintUIEntry', '/y', '/n', name],
                { windowsHide: true, timeout: 5000 }
              );
            } catch (_) {}
          }
          try { fs.unlinkSync(p); } catch (_) {}
        } catch (_) {}
      });
    } catch (_) {}

    const preferredPrinterPath = () => path.join(app.getPath('userData'), 'preferred-printer.json');
    ipcMain.handle('rs-list-printers', async () => {
      try {
        if (!mainWindow) return [];
        if (typeof mainWindow.webContents.getPrintersAsync === 'function') {
          return await mainWindow.webContents.getPrintersAsync();
        }
        return mainWindow.webContents.getPrinters() || [];
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
    });
    ipcMain.handle('rs-get-preferred-printer', async () => {
      try {
        const p = preferredPrinterPath();
        if (!fs.existsSync(p)) return { name: null };
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (_) {
        return { name: null };
      }
    });
    ipcMain.handle('rs-set-preferred-printer', async (_e, name) => {
      try {
        fs.writeFileSync(preferredPrinterPath(), JSON.stringify({ name: name || null, at: Date.now() }));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    });
    // ── Thermal print: NEVER use Chromium webContents.print ─────────────────
    // POS58 / ESC-POS drivers rasterize HTML (data:text/html jobs) as a solid
    // black roll. Always send RAW bytes (or plain text via Out-Printer).
    const { execFile } = require('child_process');

    function buildEscPosFromText(text) {
      const ESC = Buffer.from([0x1b, 0x40]); // init
      // ASCII-only for POS58. Keep digits intact — never turn amounts into "?12".
      const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\u20B9\u00A3\u20AC]/g, 'Rs.')
        .replace(/[\u00A0\u202F\u2007\u2009\u200A\u200B]/g, ' ')
        .replace(/Rs\.\s*/g, 'Rs.')
        .replace(/([A-Za-z])Rs\./g, '$1 Rs.')
        .replace(/[–—]/g, '-')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[^\x09\x0a\x20-\x7e]/g, '');
      const body = Buffer.from(normalized, 'ascii');
      const feed = Buffer.from('\n\n\n');
      const cut = Buffer.from([0x1d, 0x56, 0x00]); // full cut
      return Buffer.concat([ESC, body, feed, cut]);
    }

    function htmlToPlainTextMain(html) {
      let s = String(html || '');
      s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
      s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
      s = s.replace(/<br\s*\/?>/gi, '\n');
      s = s.replace(/<\/(div|p|tr|li|h[1-6]|section|table)>/gi, '\n');
      s = s.replace(/<hr[^>]*>/gi, '\n--------------------------------\n');
      s = s.replace(/<[^>]+>/g, '');
      s = s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n) || 32))
        .replace(/&quot;/g, '"');
      s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      return s;
    }

    function resolvePreferredPrinterName(explicit) {
      if (explicit && String(explicit).trim()) return String(explicit).trim();
      try {
        const pref = JSON.parse(fs.readFileSync(preferredPrinterPath(), 'utf8'));
        if (pref && pref.name) return String(pref.name).trim();
      } catch (_) {}
      return null;
    }

    function resolvePrinterShare(printerName) {
      if (!printerName) return null;
      const n = String(printerName).trim();
      if (!n) return null;
      if (n.startsWith('\\\\')) return n;
      return '\\\\localhost\\' + n;
    }

    /** PowerShell winspool WritePrinter — works without printer Sharing. */
    function rawPrintWinspool(filePath, printerName) {
      return new Promise((resolve) => {
        if (process.platform !== 'win32') {
          return resolve({ ok: false, error: 'raw print only on Windows' });
        }
        const name = String(printerName || '').trim();
        if (!name) return resolve({ ok: false, error: 'no printer name' });
        // Escape for PowerShell single-quoted strings
        const pName = name.replace(/'/g, "''");
        const pFile = String(filePath).replace(/'/g, "''");
        const ps = `
$ErrorActionPreference = 'Stop'
$printerName = '${pName}'
$filePath = '${pFile}'
$bytes = [System.IO.File]::ReadAllBytes($filePath)
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RsRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static bool SendBytes(string printer, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printer.Normalize(), out hPrinter, IntPtr.Zero)) return false;
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "RestroSuite Receipt";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) return false;
      try {
        if (!StartPagePrinter(hPrinter)) return false;
        try {
          IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, p, bytes.Length);
          int written;
          bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
          Marshal.FreeCoTaskMem(p);
          return ok;
        } finally { EndPagePrinter(hPrinter); }
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@
if (-not [RsRawPrinter]::SendBytes($printerName, $bytes)) {
  throw "WritePrinter failed (Win32 $( [Runtime.InteropServices.Marshal]::GetLastWin32Error() ))"
}
Write-Output 'OK'
`;
        const tmpPs = path.join(app.getPath('userData'), 'print-spool', 'raw-print-' + Date.now() + '.ps1');
        try {
          fs.mkdirSync(path.dirname(tmpPs), { recursive: true });
          fs.writeFileSync(tmpPs, ps, 'utf8');
        } catch (e) {
          return resolve({ ok: false, error: 'ps1 write failed: ' + (e && e.message) });
        }
        execFile(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs],
          { windowsHide: true, timeout: 20000 },
          (err, stdout, stderr) => {
            try { fs.unlinkSync(tmpPs); } catch (_) {}
            if (err) {
              return resolve({
                ok: false,
                error: String(err.message || err),
                stderr: String(stderr || ''),
                mode: 'winspool-fail',
              });
            }
            resolve({ ok: true, mode: 'winspool-raw', stdout: String(stdout || '').trim() });
          }
        );
      });
    }

    function rawPrintCopyShare(filePath, printerName) {
      return new Promise((resolve) => {
        if (process.platform !== 'win32') {
          return resolve({ ok: false, error: 'raw print only on Windows' });
        }
        const share = resolvePrinterShare(printerName);
        if (!share) return resolve({ ok: false, error: 'no printer name' });
        execFile(
          'cmd.exe',
          ['/c', 'copy', '/b', filePath, share],
          { windowsHide: true, timeout: 15000 },
          (err, stdout, stderr) => {
            if (err) {
              return resolve({
                ok: false,
                error: String(err.message || err),
                stderr: String(stderr || ''),
                share,
                mode: 'copy-raw-fail',
              });
            }
            resolve({ ok: true, mode: 'copy-raw', share, stdout: String(stdout || '') });
          }
        );
      });
    }

    /** Plain text via Out-Printer — last resort (no Chromium). */
    function textPrintOutPrinter(text, printerName) {
      return new Promise((resolve) => {
        if (process.platform !== 'win32') {
          return resolve({ ok: false, error: 'text print only on Windows' });
        }
        const name = String(printerName || '').trim();
        if (!name) return resolve({ ok: false, error: 'no printer name' });
        const spoolDir = path.join(app.getPath('userData'), 'print-spool');
        try { fs.mkdirSync(spoolDir, { recursive: true }); } catch (_) {}
        const txtPath = path.join(spoolDir, 'job-' + Date.now() + '.txt');
        const body = String(text || '')
          .replace(/[\u20B9\u00A3\u20AC]/g, 'Rs.')
          .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
          .replace(/Rs\.\s*/g, 'Rs.')
          .replace(/([A-Za-z])Rs\./g, '$1 Rs.')
          .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '');
        try {
          fs.writeFileSync(txtPath, body + '\r\n\r\n\r\n', 'ascii');
        } catch (e) {
          return resolve({ ok: false, error: 'txt write failed: ' + (e && e.message) });
        }
        const pName = name.replace(/'/g, "''");
        const pFile = txtPath.replace(/'/g, "''");
        const ps = `Get-Content -LiteralPath '${pFile}' -Raw | Out-Printer -Name '${pName}'`;
        execFile(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
          { windowsHide: true, timeout: 20000 },
          (err, stdout, stderr) => {
            try { fs.unlinkSync(txtPath); } catch (_) {}
            if (err) {
              return resolve({
                ok: false,
                error: String(err.message || err),
                stderr: String(stderr || ''),
                mode: 'out-printer-fail',
              });
            }
            resolve({ ok: true, mode: 'out-printer-text', stdout: String(stdout || '') });
          }
        );
      });
    }

    async function sendThermalJob({ raw, text, deviceName }) {
      const name = resolvePreferredPrinterName(deviceName);
      if (!name) {
        return {
          ok: false,
          error: 'No printer selected. Click the printer chip in the top bar and choose POS58 Printer.',
        };
      }
      const spoolDir = path.join(app.getPath('userData'), 'print-spool');
      if (!fs.existsSync(spoolDir)) fs.mkdirSync(spoolDir, { recursive: true });
      const file = path.join(spoolDir, 'job-' + Date.now() + '.bin');
      let bytes = raw;
      if (!bytes && text) bytes = buildEscPosFromText(text);
      if (!bytes || !bytes.length) return { ok: false, error: 'empty print payload' };
      fs.writeFileSync(file, bytes);

      // 1) Winspool RAW (no share required) — correct path for POS58 USB
      let res = await rawPrintWinspool(file, name);
      if (res.ok) return { ok: true, spool: file, deviceName: name, ...res };

      // 2) copy /b to shared printer
      const res2 = await rawPrintCopyShare(file, name);
      if (res2.ok) return { ok: true, spool: file, deviceName: name, ...res2 };

      // 3) Plain text Out-Printer (still not Chromium)
      const plain = text || '';
      if (plain) {
        const res3 = await textPrintOutPrinter(plain, name);
        if (res3.ok) return { ok: true, spool: file, deviceName: name, ...res3 };
        return {
          ok: false,
          error:
            'Could not print to "' + name + '". ' +
            'Tried RAW + text. Last error: ' + (res3.error || res2.error || res.error || 'unknown'),
          deviceName: name,
          spool: file,
        };
      }
      return {
        ok: false,
        error:
          'RAW print failed for "' + name + '": ' + (res.error || res2.error || 'unknown') +
          '. Ensure the printer is online and selected in the top bar.',
        deviceName: name,
        spool: file,
      };
    }

    /**
     * Professional POS print (same HTML+QR as web, no Ctrl+P):
     * 1) Write receipt HTML with auto window.print()
     * 2) Temporarily set preferred thermal as Windows default printer
     * 3) Launch Chrome/Edge with --kiosk-printing (silent, no dialog)
     * 4) Restore previous default printer
     *
     * Electron webContents.print blacks POS58; system Chrome does not.
     */
    function findSystemBrowser() {
      const env = process.env || {};
      const candidates = [
        path.join(env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ];
      for (const c of candidates) {
        try {
          if (c && fs.existsSync(c)) return c;
        } catch (_) {}
      }
      return null;
    }

    function getWindowsDefaultPrinter() {
      return new Promise((resolve) => {
        if (process.platform !== 'win32') return resolve(null);
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            "(Get-CimInstance Win32_Printer | Where-Object {$_.Default}).Name",
          ],
          { windowsHide: true, timeout: 8000 },
          (err, stdout) => {
            if (err) return resolve(null);
            const name = String(stdout || '').trim().split(/\r?\n/).filter(Boolean)[0] || null;
            resolve(name);
          }
        );
      });
    }

    function setWindowsDefaultPrinter(printerName) {
      return new Promise((resolve) => {
        if (process.platform !== 'win32' || !printerName) return resolve({ ok: false });
        const name = String(printerName).replace(/'/g, "''");
        // PrintUI is the reliable way to set default without admin elevation
        execFile(
          'rundll32.exe',
          ['printui.dll,PrintUIEntry', '/y', '/n', String(printerName)],
          { windowsHide: true, timeout: 8000 },
          (err) => {
            if (!err) return resolve({ ok: true, mode: 'printui' });
            // Fallback: WMI
            execFile(
              'powershell.exe',
              [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                `$p = Get-CimInstance Win32_Printer -Filter "Name='${name}'"; if ($p) { Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter | Out-Null; 'OK' } else { throw 'not found' }`,
              ],
              { windowsHide: true, timeout: 10000 },
              (err2) => resolve({ ok: !err2, mode: err2 ? 'fail' : 'wmi' })
            );
          }
        );
      });
    }

    function injectAutoprintScript(html, opts) {
      // NEVER put a full-screen "Printing…" overlay in the document body —
      // kiosk-printing would print only that text on the thermal roll.
      // Status stays on RestroSuite toast; this page is receipt-only.
      // Print policy: never rasterize page backgrounds. Thermal GDI drivers
      // render background fills as solid black, so receipts print on a forced
      // white page with print-color-adjust: economy (backgrounds suppressed).
      const suppressBackgrounds = !(opts && opts.printBackground === true);
      const printColorAdjust = suppressBackgrounds ? 'economy' : 'exact';
      const script =
        '<script>(function(){' +
        'var printed=false;' +
        'function go(){' +
        'if(printed)return;printed=true;' +
        'try{window.focus()}catch(e){}' +
        'try{window.print()}catch(e){printed=false}' +
        '}' +
        'function waitImgs(cb){' +
        'var imgs=Array.prototype.slice.call(document.images||[]);' +
        'if(!imgs.length)return cb();' +
        'var left=imgs.length,done=false;' +
        'function one(){if(done)return;if(--left<=0){done=true;cb()}}' +
        'imgs.forEach(function(img){if(img.complete)one();else{img.onload=img.onerror=one}});' +
        'setTimeout(function(){if(!done){done=true;cb()}},2500)' +
        '}' +
        'function start(){waitImgs(function(){setTimeout(go,300)})}' +
        'if(document.readyState==="complete")start();' +
        'else window.addEventListener("load",start);' +
        'window.addEventListener("afterprint",function(){' +
        'setTimeout(function(){try{window.close()}catch(e){}},300)' +
        '});' +
        'setTimeout(function(){try{window.close()}catch(e){}},10000);' +
        '})();</script>';
      // Ensure print CSS never shows screen-only chrome
      const printCss =
        '<style id="rs-print-only">' +
        '@page{margin:2mm;size:80mm auto}' +
        'html,body{margin:0;padding:0;background:#fff!important;color:#000!important}' +
        '*,*:before,*:after{-webkit-print-color-adjust:' + printColorAdjust + '!important;print-color-adjust:' + printColorAdjust + '!important}' +
        '@media print{html,body{background:#fff!important} #rs-print-status,.rs-no-print{display:none!important}}' +
        '</style>';
      let doc = String(html || '');
      if (!/<html[\s>]/i.test(doc)) {
        doc =
          '<!doctype html><html><head><meta charset="utf-8">' +
          printCss +
          '</head><body>' +
          doc +
          '</body></html>';
      } else if (/<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, printCss + '</head>');
      } else if (/<body/i.test(doc)) {
        doc = doc.replace(/<body/i, printCss + '<body');
      }
      if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, script + '</body>');
      return doc + script;
    }

    async function openReceiptInSystemBrowser(html, opts) {
      const options = opts || {};
      // dialog:true → show print dialog (Ctrl+P style). Default = silent kiosk print.
      const wantDialog = options.dialog === true || options.silent === false;
      const spoolDir = path.join(app.getPath('userData'), 'print-spool');
      try {
        if (!fs.existsSync(spoolDir)) fs.mkdirSync(spoolDir, { recursive: true });
      } catch (e) {
        return { ok: false, error: 'spool dir failed: ' + (e && e.message), mode: 'system-browser-fail' };
      }
      const safeTitle = String(options.title || 'Receipt')
        .replace(/[^\w\-]+/g, '_')
        .slice(0, 40) || 'Receipt';
      const file = path.join(spoolDir, safeTitle + '-' + Date.now() + '.html');
      try {
        fs.writeFileSync(file, injectAutoprintScript(html, { dialog: wantDialog, printBackground: false }), 'utf8');
      } catch (e) {
        return { ok: false, error: 'html write failed: ' + (e && e.message), mode: 'system-browser-fail' };
      }
      const fileUrl = 'file:///' + file.replace(/\\/g, '/');
      const browser = findSystemBrowser();

      // Preferred thermal for this job (top-bar printer chip)
      const targetPrinter = resolvePreferredPrinterName(options.deviceName || null);

      // ── Default-printer switch with crash-safe restore ────────────────
      // kiosk-printing uses Windows default. We may temporarily set POS58 as
      // default, but MUST restore the previous default (file-backed so a
      // crash mid-print still recovers on next app start).
      const defaultRestorePath = path.join(app.getPath('userData'), 'print-default-restore.json');
      let previousDefault = null;
      let switchedDefault = false;

      const persistPendingRestore = (name) => {
        try {
          fs.writeFileSync(
            defaultRestorePath,
            JSON.stringify({ previousDefault: name, at: Date.now() }),
            'utf8'
          );
        } catch (_) {}
      };
      const clearPendingRestore = () => {
        try { fs.unlinkSync(defaultRestorePath); } catch (_) {}
      };
      const restoreDefault = async () => {
        if (!switchedDefault || !previousDefault) {
          // Still clear any stale pending file
          clearPendingRestore();
          return;
        }
        try {
          await setWindowsDefaultPrinter(previousDefault);
        } catch (_) {}
        clearPendingRestore();
        switchedDefault = false;
      };

      if (!wantDialog && targetPrinter && process.platform === 'win32') {
        try {
          previousDefault = await getWindowsDefaultPrinter();
          if (!previousDefault || previousDefault.toLowerCase() !== targetPrinter.toLowerCase()) {
            persistPendingRestore(previousDefault || '');
            const sw = await setWindowsDefaultPrinter(targetPrinter);
            switchedDefault = !!(sw && sw.ok);
            if (!switchedDefault) clearPendingRestore();
          }
        } catch (_) {
          clearPendingRestore();
        }
      }

      try {
        if (browser) {
          const { spawn } = require('child_process');
          const profileDir = path.join(app.getPath('userData'), 'chrome-print-profile');
          try { fs.mkdirSync(profileDir, { recursive: true }); } catch (_) {}
          // Dedicated profile + kiosk-printing = silent print, no Ctrl+P
          const args = [
            '--user-data-dir=' + profileDir,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-popup-blocking',
            '--disable-translate',
          ];
          if (!wantDialog) {
            args.push('--kiosk-printing');
          }
          args.push('--app=' + fileUrl);
          const child = spawn(browser, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
          });
          child.unref();
        } else {
          const err = await shell.openPath(file);
          if (err) await shell.openExternal(fileUrl);
        }

        // Restore previous Windows default quickly + retries (never leave POS58 stuck)
        setTimeout(() => { restoreDefault().catch(() => {}); }, 4000);
        setTimeout(() => { restoreDefault().catch(() => {}); }, 10000);
        setTimeout(() => { restoreDefault().catch(() => {}); }, 20000);
        setTimeout(() => {
          try { fs.unlinkSync(file); } catch (_) {}
        }, 10 * 60 * 1000);

        return {
          ok: true,
          mode: wantDialog ? 'system-browser-dialog' : 'system-browser-silent',
          browser: browser ? path.basename(browser) : 'default',
          printer: targetPrinter || null,
          switchedDefault,
          file,
        };
      } catch (e) {
        await restoreDefault();
        return {
          ok: false,
          error: String(e && e.message || e),
          mode: 'system-browser-fail',
          file,
        };
      }
    }

    /** If a prior print crashed mid-switch, restore Windows default printer. */
    async function recoverPendingDefaultPrinter() {
      if (process.platform !== 'win32') return;
      const p = path.join(app.getPath('userData'), 'print-default-restore.json');
      try {
        if (!fs.existsSync(p)) return;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const name = data && data.previousDefault ? String(data.previousDefault).trim() : '';
        if (name) {
          await setWindowsDefaultPrinter(name);
        }
        try { fs.unlinkSync(p); } catch (_) {}
      } catch (_) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
    // Run once handlers exist (after cold start or crash mid-print)
    try { await recoverPendingDefaultPrinter(); } catch (_) {}

    function isThermalPrinterNameMain(name) {
      const n = String(name || '').toLowerCase();
      if (!n) return true;
      return /pos\s*58|pos\s*80|pos58|pos80|thermal|receipt|rongta|xprinter|xp-|epson\s*tm|gprinter|bixolon|citizen\s*ct|star\s*tsp|generic\s*\/\s*text|esc\/?pos/i.test(n);
    }

    // Primary HTML path: always real Chrome/Edge (never Electron print for receipts)
    ipcMain.handle('rs-open-receipt-browser', async (_evt, payload) => {
      const html = String((payload && payload.html) || '');
      if (!html) return { ok: false, error: 'empty html' };
      return openReceiptInSystemBrowser(html, {
        title: (payload && payload.title) || 'Receipt',
        deviceName: (payload && payload.deviceName) || null,
        // Default silent POS print (no Ctrl+P). Pass dialog:true to show dialog.
        silent: payload && payload.silent === false ? false : true,
        dialog: payload && payload.dialog === true,
      });
    });

    ipcMain.handle('rs-print-html', async (_evt, payload) => {
      const html = String((payload && payload.html) || '');
      if (!html) return { ok: false, error: 'empty html' };
      const deviceName = resolvePreferredPrinterName((payload && payload.deviceName) || null);
      const browserStyle =
        payload &&
        (payload.browserStyle === true ||
          payload.mode === 'browser-html' ||
          payload.mode === 'system-browser' ||
          payload.openInBrowser === true);
      const forceRaw =
        payload && (payload.raw === true || payload.mode === 'raw' || payload.mode === 'escpos');

      // Option A (default for formatted receipts): silent Chrome HTML to POS58
      if (browserStyle && !forceRaw) {
        const res = await openReceiptInSystemBrowser(html, {
          title: (payload && payload.title) || 'Receipt',
          deviceName,
          silent: payload && payload.silent === false ? false : true,
          dialog: payload && payload.dialog === true,
        });
        if (res && res.ok) return res;
        console.warn('[print] system browser open failed:', res && res.error);
      }

      // RAW text for thermal (fallback or forced)
      if (forceRaw || isThermalPrinterNameMain(deviceName)) {
        const plain = htmlToPlainTextMain(html);
        if (!plain) return { ok: false, error: 'empty text after html strip' };
        return sendThermalJob({ text: plain, deviceName });
      }

      // Non-thermal A4/etc: still prefer system browser over Electron print
      const res = await openReceiptInSystemBrowser(html, {
        title: (payload && payload.title) || 'Print',
      });
      if (res && res.ok) return res;
      const plain = htmlToPlainTextMain(html);
      if (!plain) return { ok: false, error: 'empty text after html strip' };
      return sendThermalJob({ text: plain, deviceName });
    });

    ipcMain.handle('rs-print-escpos', async (_evt, payload) => {
      try {
        const bytesB64 = payload && payload.base64;
        const text = payload && payload.text;
        const deviceName = (payload && payload.deviceName) || null;
        let raw = null;
        if (bytesB64) raw = Buffer.from(String(bytesB64), 'base64');
        return await sendThermalJob({ raw, text, deviceName });
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    });

    serverInstance = await startLocalServer();
    buildMenu();
    createTray();

    // Open at login by default (Windows + macOS). User can toggle via tray / menu bar.
    // On Windows we write a properly quoted Run key (space-safe for "MASTER PC" etc.).
    try {
      if (!isStartWithWindowsEnabled()) {
        setStartWithWindows(true);
      } else if (process.platform === 'win32') {
        // Re-assert quoted path and strip any broken electron.app.* keys.
        setStartWithWindows(true);
      }
    } catch (e) {
      console.warn('[main] openAtLogin failed:', e && e.message);
    }

    // Login auto-start: stay in tray/menu-bar only; manual launch opens the window.
    const openedAtLogin = !!(app.getLoginItemSettings && app.getLoginItemSettings().wasOpenedAtLogin);
    if (!openedAtLogin) {
      createWindow();
    } else if (process.platform === 'darwin' && app.dock) {
      // Launched at login hidden — keep dock tile so user can re-open easily
      try { app.dock.show(); } catch (_) {}
    }

    // Dual updates:
    // 1) Content/UI — pulls latest screens from production after website deploy
    // 2) Shell/EXE — electron-updater for Setup; portable opens download link
    try {
      contentUpdater.start({
        getMainWindow: () => mainWindow,
        getProductionOrigin: () => config.productionOrigin || 'https://restrosuite.codearc.co.in',
        webRoot: resolveWebRoot(),
        onApplied: () => {
          // Overlay already on disk; reload window so Express serves new files.
          // Server was started with overlay path that exists after apply — restart
          // local window is enough if overlay was already configured; if first
          // overlay, soft-relaunch is safer.
          try {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const url = appEntryUrl || `http://localhost:${PORT}/dashboard`;
              mainWindow.loadURL(url + (url.includes('?') ? '&' : '?') + 'rs_content=' + Date.now());
            }
          } catch (e) {
            console.warn('[main] content reload failed', e && e.message);
          }
        },
      });
    } catch (e) {
      console.warn('[main] content-updater start failed:', e && e.message);
    }
    try {
      autoUpdater.start({ getMainWindow: () => mainWindow });
    } catch (e) {
      console.warn('[main] auto-updater start failed:', e && e.message);
    }
    ipcMain.handle('rs-check-for-updates', () => runFullUpdateCheck());
    ipcMain.handle('rs-content-update-status', () => contentUpdater.getStatus());
  } catch (err) {
    dialog.showErrorBox('RestroSuite could not start', String(err && err.message || err));
    isQuitting = true;
    app.quit();
  }

  app.on('activate', () => {
    showMainWindow();
  });
});

// With tray/menu-bar, do not quit when the window is hidden/closed — keep server + app alive.
app.on('window-all-closed', () => {
  // macOS: never quit on last window close (standard + tray pattern)
  if (process.platform === 'darwin') return;
  // Windows/Linux: stay in tray unless user chose Quit
  if (!isQuitting) return;
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('quit', () => {
  try {
    if (trayWatchTimer) {
      clearInterval(trayWatchTimer);
      trayWatchTimer = null;
    }
  } catch (_) {}
  try { if (tray) { tray.destroy(); tray = null; } } catch (e) { /* noop */ }
  trayImageRef = null;
  trayIconPathRef = null;
  try { if (lanDiscoveryInstance) lanDiscoveryInstance.close(); } catch (e) { /* noop */ }
  try { if (serverInstance) serverInstance.close(); } catch (e) { /* noop */ }
});
