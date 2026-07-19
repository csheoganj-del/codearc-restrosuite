/**
 * RestroSuite Gateway Tray
 * - Ensures WhatsApp gateway + ngrok (PM2 or direct) stay running
 * - System tray icon; close (X) hides to tray
 * - Starts with Windows (openAtLogin)
 * - Quit from tray stops monitored processes (optional keep-alive on exit)
 */
'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  dialog,
  shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execFile } = require('child_process');

const HEALTH_HOST = '127.0.0.1';
const HEALTH_PORT = Number(process.env.GATEWAY_PORT || 3000);
const POLL_MS = 10000;

let tray = null;
let statusWindow = null;
let isQuitting = false;
let lastStatus = {
  ok: false,
  ready: false,
  status: 'unknown',
  number: null,
  message: 'Starting…',
};
let pollTimer = null;
let repoRoot = null;

// --- paths -----------------------------------------------------------------

function findRepoRoot() {
  const candidates = [
    process.env.RESTROSUITE_ROOT,
    path.resolve(__dirname, '..'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'restrosuite'),
    path.join(process.env.USERPROFILE || '', 'Downloads', 'RestroSuite'),
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (
        fs.existsSync(path.join(c, 'whatsapp-gateway.js')) &&
        fs.existsSync(path.join(c, 'ecosystem.config.cjs'))
      ) {
        return c;
      }
    } catch (_) {}
  }
  return candidates[0] || path.resolve(__dirname, '..');
}

function resolveIcon() {
  const list = [
    path.join(__dirname, 'build', 'tray-green.png'),
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build', 'tray-green.png'),
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.ico'),
  ];
  for (const p of list) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

/** Always-visible green “WA” style tray image (never empty/invisible). */
function trayImage() {
  const iconPath = resolveIcon();
  if (iconPath) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (img && !img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    } catch (_) {}
  }
  // Solid green 16×16 PNG — easy to spot among other tray icons
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGD4z0AEYBxVQFGgUQP+jxowatCoAaMGjBowasCoAaMGjBowasCoAQAJ6gD9bV9o4gAAAABJRU5ErkJggg=='
  );
}

// --- process helpers -------------------------------------------------------

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      shell: true,
      windowsHide: true,
      env: { ...process.env, ...(opts.env || {}) },
    });
    let out = '';
    let err = '';
    child.stdout && child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr && child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => resolve({ code, out, err }));
    child.on('error', (e) => resolve({ code: 1, out, err: String(e.message || e) }));
  });
}

function whichPm2() {
  return new Promise((resolve) => {
    execFile(
      process.platform === 'win32' ? 'where' : 'which',
      ['pm2'],
      { windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const line = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
        resolve(line || 'pm2');
      }
    );
  });
}

async function ensureGatewayRunning() {
  const pm2 = await whichPm2();
  if (pm2) {
    // Prefer ecosystem so both gateway + ngrok start with durable env
    let r = await run('pm2', ['describe', 'restrosuite-gateway']);
    if (r.code !== 0) {
      await run('pm2', ['start', 'ecosystem.config.cjs'], { cwd: repoRoot });
      await run('pm2', ['save']);
      return { mode: 'pm2', started: true };
    }
    // Ensure online
    await run('pm2', ['start', 'restrosuite-gateway']).catch(() => {});
    await run('pm2', ['start', 'restrosuite-ngrok']).catch(() => {});
    // If ngrok missing, start full ecosystem
    const n = await run('pm2', ['describe', 'restrosuite-ngrok']);
    if (n.code !== 0) {
      await run('pm2', ['start', 'ecosystem.config.cjs'], { cwd: repoRoot });
    }
    await run('pm2', ['save']);
    return { mode: 'pm2', started: false };
  }

  // Fallback: direct node (no PM2) — gateway only; ngrok if script present
  const health = await fetchHealth();
  if (health.ok) return { mode: 'direct', started: false };

  spawn('node', ['whatsapp-gateway.js'], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: true,
  }).unref();

  if (fs.existsSync(path.join(repoRoot, 'ngrok-service.js'))) {
    spawn('node', ['ngrok-service.js'], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: true,
      env: process.env,
    }).unref();
  }
  return { mode: 'direct', started: true };
}

async function restartGateway() {
  const pm2 = await whichPm2();
  if (pm2) {
    await run('pm2', ['restart', 'restrosuite-gateway']);
    await run('pm2', ['restart', 'restrosuite-ngrok']);
    return true;
  }
  // best-effort: start again
  await ensureGatewayRunning();
  return true;
}

async function stopGatewayOnQuit() {
  const pm2 = await whichPm2();
  if (!pm2) return;
  // Only stop our named apps — do not pm2 kill all (user may have others)
  await run('pm2', ['stop', 'restrosuite-gateway']);
  await run('pm2', ['stop', 'restrosuite-ngrok']);
}

// --- health ----------------------------------------------------------------

function fetchHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HEALTH_HOST, port: HEALTH_PORT, path: '/health', timeout: 4000 },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            resolve({
              ok: res.statusCode === 200,
              ready: !!(j.ready || j.status === 'ready'),
              status: j.status || 'unknown',
              number: j.number || null,
              message: j.ready
                ? 'WhatsApp ready'
                : (j.status ? `Gateway ${j.status}` : 'Gateway responding'),
              raw: j,
            });
          } catch {
            resolve({
              ok: res.statusCode === 200,
              ready: false,
              status: 'non-json',
              number: null,
              message: 'Gateway returned non-JSON',
            });
          }
        });
      }
    );
    req.on('error', () => {
      resolve({
        ok: false,
        ready: false,
        status: 'down',
        number: null,
        message: 'Cannot reach gateway on port ' + HEALTH_PORT,
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        ok: false,
        ready: false,
        status: 'timeout',
        number: null,
        message: 'Health check timed out',
      });
    });
  });
}

async function pollStatus() {
  lastStatus = await fetchHealth();
  updateTrayTooltip();
  return lastStatus;
}

// --- UI --------------------------------------------------------------------

function createStatusWindow() {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.show();
    statusWindow.focus();
    return;
  }
  statusWindow = new BrowserWindow({
    width: 420,
    height: 380,
    resizable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#0f1115',
    icon: resolveIcon() || undefined,
    title: 'RestroSuite Gateway',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  statusWindow.setMenuBarVisibility(false);
  statusWindow.loadFile(path.join(__dirname, 'status.html'));
  statusWindow.once('ready-to-show', () => statusWindow.show());

  statusWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      statusWindow.hide();
      try {
        if (tray) {
          tray.displayBalloon({
            title: 'RestroSuite Gateway still running',
            content: 'In the system tray. Right-click → Quit Gateway to stop WhatsApp fully.',
          });
        }
      } catch (_) {}
    }
  });
  statusWindow.on('closed', () => { statusWindow = null; });
}

function showStatusWindow() {
  createStatusWindow();
}

function updateTrayTooltip() {
  if (!tray) return;
  const line = lastStatus.ready
    ? `Online · Ready${lastStatus.number ? ' · ' + lastStatus.number : ''}`
    : lastStatus.ok
      ? `Online · ${lastStatus.status || 'connecting'}`
      : 'Offline — click Restart';
  tray.setToolTip('RestroSuite Gateway — ' + line);
}

function createTray() {
  if (tray) return;
  tray = new Tray(trayImage());
  updateTrayTooltip();

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open status',
      click: () => showStatusWindow(),
    },
    {
      label: 'Restart WhatsApp gateway',
      click: async () => {
        await restartGateway();
        setTimeout(pollStatus, 2000);
      },
    },
    {
      label: 'Open local health',
      click: () => shell.openExternal(`http://127.0.0.1:${HEALTH_PORT}/health`),
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: !!app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          openAsHidden: true,
          path: process.execPath,
          args: app.isPackaged ? [] : [path.resolve(__dirname)],
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Gateway (stop WhatsApp)',
      click: async () => {
        isQuitting = true;
        try {
          await stopGatewayOnQuit();
        } catch (_) {}
        app.quit();
      },
    },
    {
      label: 'Exit tray only (keep gateway running)',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => showStatusWindow());
  tray.on('click', () => {
    if (process.platform === 'win32') showStatusWindow();
  });

  // Windows often hides new tray icons under ^ — balloon helps user find us
  try {
    setTimeout(() => {
      if (!tray) return;
      tray.displayBalloon({
        title: 'RestroSuite Gateway is running',
        content: 'Look in the tray (^). Hover icons for “RestroSuite Gateway”. Click for status. Close window = stay in tray.',
      });
    }, 800);
  } catch (_) {}
}

// --- IPC -------------------------------------------------------------------

ipcMain.handle('gw-status', async () => pollStatus());
ipcMain.handle('gw-restart', async () => {
  await restartGateway();
  return pollStatus();
});
ipcMain.handle('gw-hide', async () => {
  if (statusWindow && !statusWindow.isDestroyed()) statusWindow.hide();
  return true;
});

// --- app lifecycle ---------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showStatusWindow());
}

app.whenReady().then(async () => {
  repoRoot = findRepoRoot();

  // Start with Windows by default (user can uncheck in tray)
  try {
    const login = app.getLoginItemSettings();
    if (!login.openAtLogin) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        path: process.execPath,
        args: app.isPackaged ? [] : [path.resolve(__dirname)],
      });
    }
  } catch (e) {
    console.warn('[gateway-tray] login item failed', e && e.message);
  }

  createTray();

  try {
    await ensureGatewayRunning();
  } catch (e) {
    dialog.showErrorBox(
      'RestroSuite Gateway',
      'Could not start gateway processes.\n\n' +
        String(e && e.message || e) +
        '\n\nRepo root: ' + repoRoot +
        '\nInstall PM2 globally (npm i -g pm2) and keep restrosuite project at this path.'
    );
  }

  await pollStatus();
  pollTimer = setInterval(pollStatus, POLL_MS);

  // Always show status window so users can find the app (tray icons hide under ^ on Windows)
  showStatusWindow();
});

app.on('window-all-closed', (e) => {
  if (!isQuitting && process.platform !== 'darwin') {
    // stay in tray
    return;
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (pollTimer) clearInterval(pollTimer);
});

app.on('quit', () => {
  try {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  } catch (_) {}
});
