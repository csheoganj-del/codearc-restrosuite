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

const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createServer } = require('./server');
const licenseGate = require('./license-main');

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
let appEntryUrl = null; // set in createWindow; used by the license re-check IPC

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
      // Hardening: no remote module, no insecure content, sandbox when possible
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // DevTools only via explicit menu in development (see buildMenu)
      devTools: !app.isPackaged || process.env.RS_ALLOW_DEVTOOLS === '1',
    },
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
