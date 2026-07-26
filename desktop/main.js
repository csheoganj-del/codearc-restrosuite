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
const PROD_ORIGIN = config.productionOrigin || 'https://codearc-restrosuite.vercel.app';

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
let appEntryUrl = null; // set in createWindow; used by the license re-check IPC
let tray = null;
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
      // Bind to loopback only -- never exposed on the network.
      srv.listen(candidate, '127.0.0.1', () => {
        PORT = candidate;
        if (PORT !== PREFERRED_PORT) {
          console.warn(`[main] listening on fallback port ${PORT} (preferred ${PREFERRED_PORT} was busy)`);
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

/** System tray / menu bar: close (X) hides; local server keeps running for silent POS. */
function createTray() {
  if (tray) return;
  // Windows: Tray(path-to-.ico) is far more reliable than Tray(NativeImage).
  // NativeImage-from-PNG often ends up blank in the notification area.
  const iconPath = resolveAppIcon();
  trayDebugLog('createTray start iconPath=' + iconPath + ' resourcesPath=' + (process.resourcesPath || ''));
  let created = false;
  if (iconPath && process.platform === 'win32') {
    try {
      tray = new Tray(iconPath);
      created = true;
      trayDebugLog('created from path ' + iconPath);
    } catch (e) {
      trayDebugLog('path create failed ' + (e && e.message));
    }
  }
  if (!created) {
    const image = loadTrayImage();
    try {
      tray = new Tray(image);
      created = true;
      trayDebugLog('created from NativeImage empty=' + image.isEmpty() + ' size=' + JSON.stringify(image.getSize()));
    } catch (e) {
      trayDebugLog('create failed ' + (e && e.message));
      try {
        tray = new Tray(solidTrayFallbackImage());
        created = true;
        trayDebugLog('created from solid fallback');
      } catch (e2) {
        trayDebugLog('fallback create failed ' + (e2 && e2.message));
        return;
      }
    }
  }
  try {
    // Keep brand logo (do NOT overwrite with letter/solid fallback).
    const image = loadTrayImage();
    if (image && !image.isEmpty()) {
      tray.setImage(image);
      trayDebugLog('setImage brand logo ok size=' + JSON.stringify(image.getSize()));
    }
  } catch (e) {
    trayDebugLog('setImage failed ' + (e && e.message));
  }
  try {
    tray.setIgnoreDoubleClickEvents(false);
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
  tray.on('double-click', () => showMainWindow());
  // Windows + macOS: left-click toggles window (menu still available via right-click / long-press)
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });

  // Windows 10 hides new icons under the ^ overflow — balloon + Notification + one dialog.
  if (process.platform === 'win32') {
    try {
      setTimeout(() => {
        if (!tray) return;
        try {
          tray.displayBalloon({
            title: 'RestroSuite Desktop is in the tray',
            content:
              'Look near the clock. Click ^ (Show hidden icons) if you do not see the orange R icon. Right-click for menu.',
          });
        } catch (_) {}
        try {
          if (Notification.isSupported()) {
            new Notification({
              title: 'RestroSuite Desktop is running',
              body: 'Tray icon should be near the clock (or under ^). Double-click it to open the app.',
            }).show();
          }
        } catch (_) {}
      }, 800);
    } catch (_) {}
  }
  trayDebugLog('createTray finished ok');
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

  // Offline-lease gate: re-verify the lease in the main process before loading
  // the dashboard. Fail OPEN on any gate error so a bug can never brick a
  // paying outlet.
  let locked = false;
  try {
    const decision = licenseGate.gate();
    locked = !!decision.locked;
    if (locked) console.warn('[main] license gate locked:', decision.reason);
  } catch (e) {
    console.warn('[main] license gate error (failing open):', e && e.message);
  }

  setTimeout(() => {
    if (locked) {
      win.loadFile(path.join(__dirname, 'lock.html')).catch((err) => {
        dialog.showErrorBox('RestroSuite is locked', String(err));
      });
      if (!win.isVisible()) win.show();
      return;
    }
    win.loadURL(url).catch((err) => {
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
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'RestroSuite Desktop',
              message: `${config.appName || 'RestroSuite'} Desktop`,
              detail:
                `App shell: v${app.getVersion()} (${kind})\n` +
                `UI features: ${uiVer || 'bundled'}\n` +
                `Local server: http://localhost:${PORT}\n` +
                `Backend: ${config.supabaseUrl || '(not set)'}\n` +
                `Feature feed: ${(config.productionOrigin || 'https://restrosuite.codearc.co.in')}/app-update.json\n` +
                `EXE feed: ${autoUpdater.FEED_URL}\n\n` +
                'Two update layers:\n' +
                '• Features (Settings, POS, kitchen modes) — download from live site when we publish.\n' +
                '• App shell (EXE) — Setup builds update silently; Portable opens a new download.\n',
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
      let decision;
      try { decision = licenseGate.gate(); }
      catch (e) { decision = { locked: false, reason: 'gate_error' }; }
      if (!decision.locked && appEntryUrl && mainWindow) mainWindow.loadURL(appEntryUrl).catch(() => {});
      return { locked: !!decision.locked, reason: decision.reason };
    });

    // Wave 4 — print bridge (silent HTML thermal + printer list)
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
    ipcMain.handle('rs-print-html', async (_evt, payload) => {
      const html = String((payload && payload.html) || '');
      if (!html) return { ok: false, error: 'empty html' };
      let silent = payload && payload.silent !== false; // default silent when desktop
      let deviceName = (payload && payload.deviceName) || null;
      if (!deviceName) {
        try {
          const pref = JSON.parse(fs.readFileSync(preferredPrinterPath(), 'utf8'));
          deviceName = pref && pref.name;
        } catch (_) {}
      }
      const printWin = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true, sandbox: true },
      });
      try {
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
        await printWin.loadURL(dataUrl);
        await new Promise((r) => setTimeout(r, 250));
        await new Promise((resolve, reject) => {
          printWin.webContents.print(
            {
              silent: !!silent,
              printBackground: true,
              deviceName: deviceName || undefined,
              margins: { marginType: 'none' },
            },
            (success, failureReason) => {
              if (!success) reject(new Error(failureReason || 'print failed'));
              else resolve();
            }
          );
        });
        return { ok: true, silent: !!silent, deviceName: deviceName || null };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      } finally {
        try { printWin.destroy(); } catch (_) {}
      }
    });
    // Wave 5 — ESC/POS raw: spool file + Windows RAW share copy when possible
    const { execFile } = require('child_process');
    function buildEscPosFromText(text) {
      const ESC = Buffer.from([0x1b, 0x40]);
      const body = Buffer.from(String(text || ''), 'utf8');
      const cut = Buffer.from([0x1d, 0x56, 0x00]);
      return Buffer.concat([ESC, body, Buffer.from('\n\n\n'), cut]);
    }
    function resolvePrinterShare(printerName) {
      if (!printerName) return null;
      const n = String(printerName).trim();
      if (!n) return null;
      if (n.startsWith('\\\\')) return n;
      // Local share path used by copy /b
      return '\\\\localhost\\' + n;
    }
    function rawPrintWindows(filePath, printerName) {
      return new Promise((resolve) => {
        if (process.platform !== 'win32') {
          return resolve({ ok: false, error: 'raw print only on Windows' });
        }
        const share = resolvePrinterShare(printerName);
        if (!share) return resolve({ ok: false, error: 'no printer name' });
        // copy /b sends RAW bytes to the printer share (works for many thermal USB/shared printers)
        execFile(
          'cmd.exe',
          ['/c', 'copy', '/b', filePath, share],
          { windowsHide: true, timeout: 15000 },
          (err, stdout, stderr) => {
            if (err) {
              // Fallback: PowerShell Out-Printer only works for text, not raw — report error
              return resolve({
                ok: false,
                error: String(err.message || err),
                stderr: String(stderr || ''),
                share,
              });
            }
            resolve({ ok: true, mode: 'copy-raw', share, stdout: String(stdout || '') });
          }
        );
      });
    }
    ipcMain.handle('rs-print-escpos', async (_evt, payload) => {
      try {
        const bytesB64 = payload && payload.base64;
        const text = payload && payload.text;
        let deviceName = (payload && payload.deviceName) || null;
        if (!deviceName) {
          try {
            const pref = JSON.parse(fs.readFileSync(preferredPrinterPath(), 'utf8'));
            deviceName = pref && pref.name;
          } catch (_) {}
        }
        const spoolDir = path.join(app.getPath('userData'), 'print-spool');
        if (!fs.existsSync(spoolDir)) fs.mkdirSync(spoolDir, { recursive: true });
        const file = path.join(spoolDir, 'job-' + Date.now() + '.bin');
        let raw;
        if (bytesB64) {
          raw = Buffer.from(String(bytesB64), 'base64');
        } else if (text) {
          raw = buildEscPosFromText(text);
        } else {
          return { ok: false, error: 'no payload' };
        }
        fs.writeFileSync(file, raw);

        // Prefer RAW to Windows printer share
        if (deviceName) {
          const rawRes = await rawPrintWindows(file, deviceName);
          if (rawRes.ok) {
            return { ok: true, spool: file, ...rawRes, deviceName };
          }
          // fall through to silent HTML
          console.warn('[print] raw copy failed, HTML silent fallback:', rawRes.error);
        }

        // Silent HTML monospace fallback (always available)
        const previewText = text || (bytesB64 ? '[binary ESC/POS job]' : '');
        const html = `<!doctype html><pre style="font:12px/1.3 monospace;width:280px;white-space:pre-wrap;margin:8px">${String(previewText)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
        const printWin = new BrowserWindow({
          show: false,
          webPreferences: { offscreen: true, sandbox: true },
        });
        try {
          await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          await new Promise((r) => setTimeout(r, 200));
          await new Promise((resolve, reject) => {
            printWin.webContents.print(
              { silent: true, printBackground: false, deviceName: deviceName || undefined, margins: { marginType: 'none' } },
              (success, failureReason) => {
                if (!success) reject(new Error(failureReason || 'print failed'));
                else resolve();
              }
            );
          });
          return { ok: true, spool: file, mode: 'html-silent', deviceName: deviceName || null };
        } finally {
          try { printWin.destroy(); } catch (_) {}
        }
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
  try { if (tray) { tray.destroy(); tray = null; } } catch (e) { /* noop */ }
  try { if (serverInstance) serverInstance.close(); } catch (e) { /* noop */ }
});
