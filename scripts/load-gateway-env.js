/**
 * Load durable local gateway / ngrok settings into process.env.
 *
 * Priority (first non-empty wins per key — later files do not override):
 *   1. process.env already set (PM2 / shell)
 *   2. %USERPROFILE%\.restrosuite\gateway.env   ← machine-local, outside repo
 *   3. <repo>/.env.local
 *   4. <repo>/.env
 *
 * Why a home-dir file?
 *   Code cleanups / git pulls must never wipe the reserved ngrok domain.
 *   That value is operational config for THIS PC, not product source.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const MACHINE_ENV = path.join(os.homedir(), '.restrosuite', 'gateway.env');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function applyEnv(map, target) {
  let applied = 0;
  for (const [k, v] of Object.entries(map)) {
    if (v == null || v === '') continue;
    if (target[k] == null || target[k] === '') {
      target[k] = v;
      applied += 1;
    }
  }
  return applied;
}

/**
 * @param {NodeJS.ProcessEnv} [target=process.env]
 * @returns {{ loadedFrom: string[], machineEnvPath: string }}
 */
function loadGatewayEnv(target = process.env) {
  const loadedFrom = [];

  // Later sources only fill missing keys — machine file is preferred over repo.
  const sources = [
    { label: MACHINE_ENV, data: parseEnvFile(MACHINE_ENV) },
    { label: path.join(REPO_ROOT, '.env.local'), data: parseEnvFile(path.join(REPO_ROOT, '.env.local')) },
    { label: path.join(REPO_ROOT, '.env'), data: parseEnvFile(path.join(REPO_ROOT, '.env')) },
  ];

  for (const src of sources) {
    if (Object.keys(src.data).length === 0) continue;
    const n = applyEnv(src.data, target);
    if (n > 0) loadedFrom.push(src.label);
  }

  // Derive NGROK_DOMAIN from URL if only URL is present
  if (!target.NGROK_DOMAIN && target.NGROK_GATEWAY_URL) {
    try {
      const raw = String(target.NGROK_GATEWAY_URL);
      const url = raw.includes('://') ? raw : `https://${raw}`;
      target.NGROK_DOMAIN = new URL(url).hostname;
    } catch {
      target.NGROK_DOMAIN = String(target.NGROK_GATEWAY_URL)
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
        .split('/')[0];
    }
  }

  if (!target.GATEWAY_PORT) target.GATEWAY_PORT = '3000';

  return { loadedFrom, machineEnvPath: MACHINE_ENV };
}

/**
 * Ensure the durable machine file exists with critical tunnel keys.
 * Never overwrites existing non-empty values in that file.
 */
function ensureMachineGatewayEnv(seed = {}) {
  const dir = path.dirname(MACHINE_ENV);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const existing = parseEnvFile(MACHINE_ENV);
  const merged = { ...existing };

  const keys = [
    'NGROK_DOMAIN',
    'NGROK_GATEWAY_URL',
    'GATEWAY_PORT',
    'GATEWAY_TOKEN',
    'WHATSAPP_GATEWAY_TOKEN',
    'WHATSAPP_GATEWAY_URL',
  ];

  for (const k of keys) {
    const fromSeed = seed[k] || process.env[k] || '';
    if ((!merged[k] || merged[k] === '') && fromSeed) merged[k] = fromSeed;
  }

  // Always keep domain derived if URL exists
  if (!merged.NGROK_DOMAIN && merged.NGROK_GATEWAY_URL) {
    try {
      const raw = merged.NGROK_GATEWAY_URL;
      merged.NGROK_DOMAIN = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    } catch {
      /* ignore */
    }
  }

  const lines = [
    '# RestroSuite — machine-local gateway settings',
    '# Location: %USERPROFILE%\\.restrosuite\\gateway.env',
    '# Outside the git repo — safe from code cleanups and pulls.',
    '# Edit this file only when you change your reserved ngrok domain.',
    '',
  ];
  for (const [k, v] of Object.entries(merged)) {
    if (v == null || v === '') continue;
    lines.push(`${k}=${v}`);
  }
  lines.push('');
  fs.writeFileSync(MACHINE_ENV, lines.join('\n'), 'utf8');
  return MACHINE_ENV;
}

module.exports = {
  loadGatewayEnv,
  ensureMachineGatewayEnv,
  MACHINE_ENV,
  REPO_ROOT,
};
