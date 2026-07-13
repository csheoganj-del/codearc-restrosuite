#!/usr/bin/env node
/**
 * Local PC gateway launcher
 * - Loads .env.local
 * - Starts whatsapp-gateway.js
 * - Auto-restarts if the process crashes
 * - On Windows: asks the OS not to sleep while the gateway is running
 *   (sleep/hibernate after a few hours is a common cause of "WhatsApp disconnected")
 */
const fs   = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT    = path.resolve(__dirname, '..');
const envPath = path.join(ROOT, '.env.local');
const env     = Object.assign({}, process.env);

// Load .env.local
if (fs.existsSync(envPath)) {
  const seen = {};
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq < 0) return;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!seen[k]) { seen[k] = true; env[k] = v; }
  });
  console.log('[launcher] Loaded .env.local');
} else {
  console.warn('[launcher] .env.local not found -- gateway may fail');
}

console.log('[launcher] Mode          : LOCAL PC (not Hugging Face / cloud)');
console.log('[launcher] SUPABASE_URL  :', env.SUPABASE_URL   || '(not set)');
console.log('[launcher] GATEWAY_TOKEN :', (env.GATEWAY_TOKEN || env.GATEWAY_AUTH_TOKEN || '(not set)').slice(0, 12) + '...');
console.log('[launcher] Session path  : %USERPROFILE%\\.restrosuite\\whatsapp-auth (Windows default)');
console.log('');
console.log('[launcher] Keep this window open. Closing it stops WhatsApp sending.');
console.log('[launcher] Recommended: Windows power plan = "Never sleep" while on AC power.');
console.log('');

// ------------------------------------------------------------
// Windows: prevent system sleep while gateway is running
// ------------------------------------------------------------
let stayAwakeTimer = null;
function enableWindowsStayAwake() {
  if (process.platform !== 'win32') return;
  // ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)
  // Keeps the machine from sleeping; display may still turn off.
  const ps = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class RSGatewayPower {',
    '  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);',
    '}',
    '"@',
    '[void][RSGatewayPower]::SetThreadExecutionState([uint32]0x80000001)',
  ].join('; ');

  const pulse = () => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { windowsHide: true, timeout: 10000 },
      (err) => {
        if (err && !enableWindowsStayAwake._warned) {
          enableWindowsStayAwake._warned = true;
          console.warn('[launcher] Could not set Windows stay-awake flag:', err.message);
          console.warn('[launcher] Set Power Options → Sleep → Never (plugged in) manually.');
        }
      }
    );
  };

  pulse();
  stayAwakeTimer = setInterval(pulse, 60 * 1000);
  console.log('[launcher] Windows stay-awake: ON (system will not sleep while this process runs)');
}

function disableWindowsStayAwake() {
  if (process.platform !== 'win32') return;
  if (stayAwakeTimer) {
    clearInterval(stayAwakeTimer);
    stayAwakeTimer = null;
  }
  // Clear continuous requirement
  const ps = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class RSGatewayPowerClear {',
    '  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);',
    '}',
    '"@',
    '[void][RSGatewayPowerClear]::SetThreadExecutionState([uint32]0x80000000)',
  ].join('; ');
  try {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 8000,
    });
  } catch (_) {}
}

enableWindowsStayAwake();

// ------------------------------------------------------------
// Crash auto-restart (local PC reliability)
// ------------------------------------------------------------
let child = null;
let restartCount = 0;
let stopping = false;
let lastStartAt = 0;
const MAX_FAST_RESTARTS = 20;

function startGateway() {
  lastStartAt = Date.now();
  console.log('[launcher] Starting whatsapp-gateway.js ...\n');

  child = spawn(process.execPath, [path.join(ROOT, 'whatsapp-gateway.js')], {
    env,
    stdio: 'inherit',
    cwd: ROOT,
  });

  child.on('error', err => {
    console.error('[launcher] Failed to start gateway:', err.message);
    if (!stopping) scheduleRestart();
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) {
      console.log('\n[launcher] Gateway stopped cleanly.');
      disableWindowsStayAwake();
      process.exit(code || 0);
      return;
    }
    // Ctrl+C / taskkill graceful
    if (signal === 'SIGINT' || signal === 'SIGTERM') {
      console.log('\n[launcher] Gateway received', signal);
      disableWindowsStayAwake();
      process.exit(0);
      return;
    }
    console.error(`\n[launcher] Gateway exited unexpectedly (code=${code}, signal=${signal || 'none'})`);
    scheduleRestart();
  });
}

function scheduleRestart() {
  // Reset counter if the process stayed up for a while
  if (Date.now() - lastStartAt > 10 * 60 * 1000) {
    restartCount = 0;
  }
  restartCount += 1;
  if (restartCount > MAX_FAST_RESTARTS) {
    console.error('[launcher] Too many rapid restarts — stopping. Check logs and run start-gateway.bat again.');
    disableWindowsStayAwake();
    process.exit(1);
    return;
  }
  const delay = Math.min(60_000, 2000 * restartCount);
  console.log(`[launcher] Auto-restart #${restartCount} in ${Math.round(delay / 1000)}s...`);
  setTimeout(startGateway, delay);
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\n[launcher] Shutting down...');
  disableWindowsStayAwake();
  if (child) {
    try { child.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => {
      if (child) {
        try { child.kill('SIGKILL'); } catch (_) {}
      }
      process.exit(0);
    }, 4000);
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startGateway();
