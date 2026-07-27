/**
 * PM2 Ecosystem Config — RestroSuite WhatsApp Gateway
 * ─────────────────────────────────────────────────────
 * Usage:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   ← follow the printed command to enable OS-level auto-start
 *
 * Windows Service (NSSM) alternative — if PM2 startup is not available:
 *   1. Download nssm.exe from https://nssm.cc/download
 *   2. Run in an elevated (Admin) terminal:
 *        nssm install RestroSuiteGateway "C:\Program Files\nodejs\node.exe"
 *        nssm set RestroSuiteGateway Arguments "C:\Users\<YOU>\Downloads\restrosuite\whatsapp-gateway.js"
 *        nssm set RestroSuiteGateway AppDirectory "C:\Users\<YOU>\Downloads\restrosuite"
 *        nssm set RestroSuiteGateway AppEnvironmentExtra GATEWAY_TOKEN=<your-secret>
 *        nssm set RestroSuiteGateway Start SERVICE_AUTO_START
 *        nssm start RestroSuiteGateway
 *   3. To view logs: nssm edit RestroSuiteGateway → I/O tab
 *
 * Important: Set GATEWAY_TOKEN in your environment or in .env.local before starting.
 * Never commit a real token to source control.
 */

'use strict';

module.exports = {
  apps: [
    {
      // ── Main WhatsApp Gateway ───────────────────────────────────────────
      name: 'restrosuite-gateway',
      script: './whatsapp-gateway.js',

      // Single instance — Baileys sessions are per-process and not cluster-safe.
      instances: 1,
      exec_mode: 'fork',

      // ── Restart policy ─────────────────────────────────────────────────
      // Restart automatically on crash, with exponential backoff capped at
      // 30 seconds, and give up after 10 rapid consecutive failures (likely
      // a configuration error, not a transient crash).
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,

      // ── Graceful shutdown ──────────────────────────────────────────────
      // Give the gateway 10 seconds to flush the daily-send-counts.json and
      // close active WebSocket connections cleanly before SIGKILL.
      kill_timeout: 10000,
      listen_timeout: 30000,

      // ── Logging ────────────────────────────────────────────────────────
      // PM2 rotates logs when they exceed 10 MB. Keep the last 7 days.
      // Logs land in ~/.pm2/logs/ by default.
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_size: '10M',
      retain: 7,

      // ── Environment ────────────────────────────────────────────────────
      // Production values MUST be set via OS environment variables or
      // .env.local — never hard-code secrets here. The env block below
      // only sets non-secret defaults.
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      // PM2 does not load .env.local automatically; the gateway's own
      // .env loader at the top of whatsapp-gateway.js handles that.

      // ── Watch (disabled in production) ─────────────────────────────────
      watch: false,
      ignore_watch: ['node_modules', '.git', 'publish-static', '*.log'],
    },
  ],
};
