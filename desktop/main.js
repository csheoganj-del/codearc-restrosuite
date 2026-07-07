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

const { app, BrowserWindow, Menu, shell, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createServer } = require('./server');

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
const PORT = Number(config.port) || 8001;
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

// --- Single-instance lock: second launch focuses the existing window -------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
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
    const expressApp = createServer({ root, config });
    const srv = http.createServer(expressApp);
    srv.on('error', reject);
    // Bind to loopback only -- never exposed on the network.
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

// Rewrite the Origin header on Supabase requests to the whitelisted
// production origin. Safety net so online mode works even if port 8001
// is taken and we fall back to another port (whose origin would not be
// in ALLOWED_ORIGINS). The page itself is still served locally.
function installOriginRewrite() {
  const filter = { urls: ['https://*.supabase.co/*', 'wss://*.supabase.co/*'] };
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
    const headers = details.requestHeaders || {};
    headers['Origin'] = PROD_ORIGIN;
    cb({ requestHeaders: headers });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: (config.window && config.window.width) || 1280,
    height: (config.window && config.window.height) || 820,
    minWidth: (config.window && config.window.minWidth) || 1024,
    minHeight: (config.window && config.window.minHeight) || 640,
    backgroundColor: '#0f1115',
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    title: config.appName || 'RestroSuite',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Show a small splash immediately, then load the app.
  win.loadFile(path.join(__dirname, 'splash.html')).catch(() => {});

  const entry = (config.entry || '/login');
  const url = `http://localhost:${PORT}${entry.startsWith('/') ? entry : '/' + entry}`;

  win.webContents.once('did-finish-load', () => {
    if (!win.isVisible()) win.show();
  });

  // Load the real app after a short splash beat.
  setTimeout(() => {
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

  win.on('closed', () => { mainWindow = null; });
  mainWindow = win;
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
        { label: 'Toggle Developer Tools', accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About RestroSuite Desktop',
          click() {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'RestroSuite Desktop',
              message: `${config.appName || 'RestroSuite'} Desktop`,
              detail:
                `Version ${app.getVersion()}\n` +
                `Local server: http://localhost:${PORT}\n` +
                `Backend: ${config.supabaseUrl || '(not set)'}\n\n` +
                `Works offline-first and syncs to the cloud when online.`,
            });
          },
        },
        {
          label: 'Open Data Backend Status',
          click() { if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' }); },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    installOriginRewrite();
    serverInstance = await startLocalServer();
    buildMenu();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('RestroSuite could not start', String(err && err.message || err));
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  try { if (serverInstance) serverInstance.close(); } catch (e) { /* noop */ }
});
