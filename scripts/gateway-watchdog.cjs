/**
 * RestroSuite gateway watchdog.
 * Runs independently under PM2 and restarts a stopped/unreachable gateway
 * after three consecutive failed health probes.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { loadGatewayEnv } = require('./load-gateway-env');

loadGatewayEnv(process.env);

const REPO_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.GATEWAY_PORT || process.env.PORT || 3000);
const PROBE_MS = 10000;
const FAILURE_THRESHOLD = 3;
const RECOVERY_COOLDOWN_MS = 60000;
const COMMAND_TIMEOUT_MS = 30000;

let failures = 0;
let recoveryInFlight = false;
let lastRecoveryAt = 0;
let timer = null;

function probeHealth() {
  return new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port: PORT, path: '/health', timeout: 3500 },
      (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try {
            const payload = JSON.parse(body);
            resolve(response.statusCode === 200 && typeof payload === 'object');
          } catch {
            resolve(false);
          }
        });
      }
    );
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

function resolvePm2() {
  if (process.platform === 'win32') {
    const candidate = path.join(process.env.APPDATA || '', 'npm', 'pm2.cmd');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'pm2';
}

function shellCommand(cmd) {
  return process.platform === 'win32' && /\s/.test(cmd) ? `"${cmd}"` : cmd;
}
function runPm2(args) {
  return new Promise((resolve) => {
    const child = spawn(shellCommand(resolvePm2()), args, {
      cwd: REPO_ROOT,
      shell: true,
      windowsHide: true,
      env: process.env,
    });
    let output = '';
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code, output: output.trim().slice(-800) });
    };
    const timeout = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish(124);
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('close', (code) => finish(code));
    child.on('error', (error) => {
      output += String(error && error.message || error);
      finish(1);
    });
  });
}

async function recover() {
  console.warn(`[gateway-watchdog] Gateway unreachable on port ${PORT}; recovery starting.`);
  let result = await runPm2(['restart', 'restrosuite-gateway', '--update-env']);
  if (result.code !== 0) {
    console.warn(`[gateway-watchdog] Named restart failed (${result.code}); starting ecosystem app.`);
    result = await runPm2([
      'start',
      'ecosystem.config.cjs',
      '--only',
      'restrosuite-gateway',
      '--update-env',
    ]);
  }
  if (result.code !== 0) {
    console.error(`[gateway-watchdog] Recovery command failed (${result.code}): ${result.output}`);
    return false;
  }
  console.log('[gateway-watchdog] Recovery command completed; awaiting health confirmation.');
  return true;
}

async function tick() {
  const healthy = await probeHealth();
  if (healthy) {
    if (failures > 0) {
      console.log('[gateway-watchdog] Gateway health restored.');
    }
    failures = 0;
    return;
  }

  failures += 1;
  console.warn(`[gateway-watchdog] Health probe failed (${failures}/${FAILURE_THRESHOLD}).`);
  const cooldownElapsed = Date.now() - lastRecoveryAt >= RECOVERY_COOLDOWN_MS;
  if (failures < FAILURE_THRESHOLD || recoveryInFlight || !cooldownElapsed) {
    return;
  }

  recoveryInFlight = true;
  lastRecoveryAt = Date.now();
  try {
    await recover();
  } finally {
    failures = 0;
    recoveryInFlight = false;
  }
}

console.log(`[gateway-watchdog] Monitoring http://127.0.0.1:${PORT}/health every ${PROBE_MS / 1000}s.`);
timer = setInterval(() => tick().catch((error) => {
  console.error('[gateway-watchdog] Tick error:', error && error.message);
}), PROBE_MS);
tick().catch((error) => console.error('[gateway-watchdog] Initial probe error:', error && error.message));

function shutdown() {
  if (timer) {
    clearInterval(timer);
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
