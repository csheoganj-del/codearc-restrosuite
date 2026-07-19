/**
 * PM2 process file for local WhatsApp gateway + reserved ngrok tunnel.
 *
 * Usage (from repo root):
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Env is loaded from:
 *   %USERPROFILE%\.restrosuite\gateway.env  (durable, outside git)
 *   then .env.local / .env
 *
 * ngrok-service.js also self-loads those files, so bare
 * `pm2 start ngrok-service.js` still works after a code pull.
 */
const path = require('path');
const {
  loadGatewayEnv,
  ensureMachineGatewayEnv,
  MACHINE_ENV,
} = require('./scripts/load-gateway-env');

const root = __dirname;
const env = { ...process.env };

try {
  ensureMachineGatewayEnv(env);
} catch (e) {
  console.warn('[ecosystem] ensureMachineGatewayEnv:', e && e.message);
}

const { loadedFrom } = loadGatewayEnv(env);
if (loadedFrom.length) {
  console.log('[ecosystem] Loaded env from:', loadedFrom.join(' | '));
}
console.log('[ecosystem] Durable config:', MACHINE_ENV);

module.exports = {
  apps: [
    {
      name: 'restrosuite-gateway',
      script: 'whatsapp-gateway.js',
      cwd: root,
      env,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 3000,
    },
    {
      name: 'restrosuite-ngrok',
      script: 'ngrok-service.js',
      cwd: root,
      env,
      max_restarts: 20,
      min_uptime: '5s',
      restart_delay: 5000,
    },
  ],
};
