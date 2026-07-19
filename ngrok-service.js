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
  if (direct) return direct.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const url = (process.env.NGROK_GATEWAY_URL || '').trim();
  if (!url) return '';
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

const ngrokProcess = spawn('npx', ['ngrok', 'http', port, `--url=${domain}`], {
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
  console.log(`Ngrok tunnel process exited with code ${code}`);
  // Exit so PM2 can restart a clean child (do not spin forever on fatal ngrok errors).
  process.exit(code == null ? 1 : code);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Killing Ngrok tunnel...');
  ngrokProcess.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Killing Ngrok tunnel...');
  ngrokProcess.kill();
  process.exit(0);
});
