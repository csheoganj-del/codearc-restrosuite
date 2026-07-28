/**
 * Optional local ngrok helper for WhatsApp gateway (this PC only).
 *
 * Domain is NEVER hardcoded. It is loaded (in order) from:
 *   1. process.env (PM2 / shell)
 *   2. %USERPROFILE%\.restrosuite\gateway.env   ← durable, outside repo
 *   3. .env.local / .env in the project
 *
 * Required (any one):
 *   NGROK_DOMAIN | NGROK_GATEWAY_DOMAIN | NGROK_GATEWAY_URL
 * Optional:
 *   GATEWAY_PORT (default 3000)
 */
const { spawn } = require('child_process');
const { loadGatewayEnv, ensureMachineGatewayEnv } = require('./scripts/load-gateway-env');

// Seed durable machine file from whatever is already available, then load.
try {
  ensureMachineGatewayEnv();
} catch (e) {
  console.warn('[ngrok-service] Could not write machine gateway.env:', e && e.message);
}

const { loadedFrom, machineEnvPath } = loadGatewayEnv(process.env);
if (loadedFrom.length) {
  console.log('[ngrok-service] Loaded env from:', loadedFrom.join(' | '));
} else {
  console.log('[ngrok-service] Using process.env only (no local env files found)');
}
console.log('[ngrok-service] Durable config path:', machineEnvPath);

function resolveDomain() {
  const direct = (process.env.NGROK_DOMAIN || process.env.NGROK_GATEWAY_DOMAIN || '').trim();
  if (direct) {return direct.replace(/^https?:\/\//i, '').replace(/\/+$/, '');}
  const url = (process.env.NGROK_GATEWAY_URL || '').trim();
  if (!url) {return '';}
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname;
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('/')[0] || '';
  }
}

const domain = resolveDomain();
const port = String(process.env.GATEWAY_PORT || process.env.PORT || '3000').trim();

if (!domain) {
  console.error('[ngrok-service] Missing reserved ngrok domain.');
  console.error(`[ngrok-service] Create or edit: ${machineEnvPath}`);
  console.error('[ngrok-service] Example contents:');
  console.error('  NGROK_DOMAIN=your-name.ngrok-free.dev');
  console.error('  NGROK_GATEWAY_URL=https://your-name.ngrok-free.dev');
  console.error('  GATEWAY_PORT=3000');
  process.exit(1);
}

console.log(`Starting Ngrok tunnel ${domain} → localhost:${port}`);

let ngrokProcess = null;
let shuttingDown = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF = 5;
const BASE_RESTART_DELAY_MS = 3000;
const MAX_RESTART_DELAY_MS = 60000;

function startNgrok() {
  if (shuttingDown) {return;}

  if (ngrokProcess && !ngrokProcess.killed) {
    try { ngrokProcess.kill(); } catch (_) { /* noop */ }
  }

  console.log(`[ngrok-service] (Re)starting tunnel (attempt ${restartAttempts + 1}): ${domain} → localhost:${port}`);
  ngrokProcess = spawn('npx', ['ngrok', 'http', port, `--url=${domain}`], {
    shell: true,
    windowsHide: true,
  });

  ngrokProcess.stdout.on('data', (data) => {
    console.log(`[Ngrok STDOUT] ${data.toString().trim()}`);
  });

  ngrokProcess.stderr.on('data', (data) => {
    console.error(`[Ngrok STDERR] ${data.toString().trim()}`);
  });

  ngrokProcess.on('close', (code) => {
    if (shuttingDown) {return;}

    restartAttempts += 1;
    let delay = BASE_RESTART_DELAY_MS;
    if (restartAttempts > MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF) {
      // Exponential backoff capped at 60s, plus 20% jitter to avoid thundering herds
      const exponent = Math.min(restartAttempts - MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF, 6);
      delay = Math.min(BASE_RESTART_DELAY_MS * (2 ** exponent), MAX_RESTART_DELAY_MS);
      delay = Math.round(delay * (0.9 + Math.random() * 0.2));
    }

    console.log(
      `[ngrok-service] Tunnel exited with code ${code}. ` +
      `Restart #${restartAttempts} in ${delay}ms (backoff active after ${MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF} rapid failures).`
    );

    setTimeout(() => {
      // Reset counter if it has been a while (restart is clearly recovered)
      if (restartAttempts > MAX_RESTART_ATTEMPTS_BEFORE_BACKOFF + 4) {
        restartAttempts = Math.floor(restartAttempts / 2);
      }
      startNgrok();
    }, delay);
  });

  ngrokProcess.on('error', (err) => {
    console.error(`[ngrok-service] Process spawn error: ${err && err.message}. Will retry.`);
  });

  // Successful start: decay the attempt counter over time
  setTimeout(() => {
    if (!shuttingDown && ngrokProcess && !ngrokProcess.killed) {
      restartAttempts = Math.max(0, restartAttempts - 2);
    }
  }, 30000);
}

startNgrok();

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Killing Ngrok tunnel and shutting down...');
  shuttingDown = true;
  if (ngrokProcess) {try { ngrokProcess.kill('SIGTERM'); } catch (_) { /* noop */ }}
  setTimeout(() => process.exit(0), 1500);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Killing Ngrok tunnel and shutting down...');
  shuttingDown = true;
  if (ngrokProcess) {try { ngrokProcess.kill('SIGINT'); } catch (_) { /* noop */ }}
  setTimeout(() => process.exit(0), 1500);
});
