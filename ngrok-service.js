/**
 * Durable local ngrok supervisor for the RestroSuite WhatsApp gateway.
 * Loads machine-local configuration, reconciles stale local tunnels, and
 * keeps the reserved endpoint attached to the configured gateway port.
 */
'use strict';

const { spawn, execFile } = require('child_process');
const http = require('http');
const { loadGatewayEnv, ensureMachineGatewayEnv } = require('./scripts/load-gateway-env');

try {
  ensureMachineGatewayEnv();
} catch (error) {
  console.warn('[ngrok-service] Could not write machine gateway.env:', error && error.message);
}

const { loadedFrom, machineEnvPath } = loadGatewayEnv(process.env);
console.log(
  loadedFrom.length
    ? `[ngrok-service] Loaded env from: ${loadedFrom.join(' | ')}`
    : '[ngrok-service] Using process.env only (no local env files found)'
);
console.log('[ngrok-service] Durable config path:', machineEnvPath);

function resolveDomain() {
  const direct = (process.env.NGROK_DOMAIN || process.env.NGROK_GATEWAY_DOMAIN || '').trim();
  if (direct) {
    return direct.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
  const raw = (process.env.NGROK_GATEWAY_URL || '').trim();
  if (!raw) {
    return '';
  }
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')[0] || '';
  }
}

const domain = resolveDomain();
const port = String(process.env.GATEWAY_PORT || process.env.PORT || '3000').trim();

if (!/^[a-z0-9.-]+$/i.test(domain) || !/^\d{1,5}$/.test(port) || Number(port) > 65535) {
  console.error('[ngrok-service] Invalid or missing NGROK_DOMAIN / GATEWAY_PORT.');
  console.error(`[ngrok-service] Review durable config: ${machineEnvPath}`);
  process.exit(1);
}

console.log(`Starting Ngrok tunnel ${domain} → localhost:${port}`);

let ngrokProcess = null;
let shuttingDown = false;
let restartAttempts = 0;
let adoptedMonitor = null;
const MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF = 5;
const BASE_RESTART_DELAY_MS = 3000;
const MAX_RESTART_DELAY_MS = 60000;
const ADOPTED_MONITOR_MS = 10000;

function localApi(method, apiPath) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: 4040, method, path: apiPath, timeout: 1800 },
      (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          if (response.statusCode >= 400) {
            reject(new Error(`ngrok API ${method} ${apiPath} returned ${response.statusCode}`));
            return;
          }
          if (!body) {
            resolve(null);
            return;
          }
          try { resolve(JSON.parse(body)); } catch { resolve(body); }
        });
      }
    );
    request.on('timeout', () => request.destroy(new Error('ngrok local API timeout')));
    request.on('error', reject);
    request.end();
  });
}

function tunnelPort(tunnel) {
  const address = String(tunnel && tunnel.config && tunnel.config.addr || '');
  try {
    return new URL(address.includes('://') ? address : `http://${address}`).port;
  } catch {
    const match = address.match(/:(\d+)\/?$/);
    return match ? match[1] : '';
  }
}

async function reconcileExistingTunnel() {
  let data;
  try {
    data = await localApi('GET', '/api/tunnels');
  } catch {
    return false;
  }

  const existing = Array.isArray(data && data.tunnels)
    ? data.tunnels.find((tunnel) => {
        try { return new URL(tunnel.public_url).hostname === domain; } catch { return false; }
      })
    : null;
  if (!existing) {
    return false;
  }

  if (tunnelPort(existing) === port) {
    if (!adoptedMonitor) {
      console.log(`[ngrok-service] Adopted existing healthy tunnel ${domain} → localhost:${port}`);
    }
    adoptedMonitor = setTimeout(() => {
      adoptedMonitor = null;
      startNgrok();
    }, ADOPTED_MONITOR_MS);
    return true;
  }

  console.warn(
    `[ngrok-service] Removing stale tunnel ${domain} targeting ${existing.config && existing.config.addr}; expected localhost:${port}`
  );
  try {
    await localApi('DELETE', `/api/tunnels/${encodeURIComponent(existing.name)}`);
    await new Promise((resolve) => {
      setTimeout(resolve, 800);
    });
  } catch (error) {
    console.error('[ngrok-service] Could not remove stale local tunnel:', error && error.message);
  }
  return false;
}

async function startNgrok() {
  if (shuttingDown) {
    return;
  }
  if (await reconcileExistingTunnel()) {
    return;
  }

  if (ngrokProcess && !ngrokProcess.killed) {
    stopNgrokTree();
  }

  console.log(`[ngrok-service] (Re)starting tunnel (attempt ${restartAttempts + 1}): ${domain} → localhost:${port}`);
  ngrokProcess = spawn('npx', ['ngrok', 'http', port, `--url=${domain}`], {
    shell: true,
    windowsHide: true,
  });

  ngrokProcess.stdout.on('data', (data) => console.log(`[Ngrok STDOUT] ${data.toString().trim()}`));
  ngrokProcess.stderr.on('data', (data) => console.error(`[Ngrok STDERR] ${data.toString().trim()}`));

  ngrokProcess.on('close', (code) => {
    ngrokProcess = null;
    if (shuttingDown) {
      return;
    }
    restartAttempts += 1;
    let delay = BASE_RESTART_DELAY_MS;
    if (restartAttempts > MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF) {
      const exponent = Math.min(restartAttempts - MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF, 6);
      delay = Math.min(BASE_RESTART_DELAY_MS * (2 ** exponent), MAX_RESTART_DELAY_MS);
      delay = Math.round(delay * (0.9 + Math.random() * 0.2));
    }
    console.log(`[ngrok-service] Tunnel exited with code ${code}. Restart #${restartAttempts} in ${delay}ms.`);
    setTimeout(startNgrok, delay);
  });

  ngrokProcess.on('error', (error) => {
    console.error(`[ngrok-service] Process spawn error: ${error && error.message}. Will retry.`);
  });

  setTimeout(() => {
    if (!shuttingDown && ngrokProcess && !ngrokProcess.killed) {
      restartAttempts = Math.max(0, restartAttempts - 2);
    }
  }, 30000);
}

function stopNgrokTree() {
  if (!ngrokProcess || !ngrokProcess.pid) {
    return;
  }
  const pid = ngrokProcess.pid;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
    return;
  }
  try { ngrokProcess.kill('SIGTERM'); } catch { /* noop */ }
}

function shutdown(signal) {
  console.log(`${signal} received. Stopping Ngrok process tree...`);
  shuttingDown = true;
  if (adoptedMonitor) {
    clearTimeout(adoptedMonitor);
  }
  stopNgrokTree();
  setTimeout(() => process.exit(0), 1500);
}

startNgrok().catch((error) => {
  console.error('[ngrok-service] Initial reconciliation failed:', error && error.message);
  setTimeout(startNgrok, BASE_RESTART_DELAY_MS);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
