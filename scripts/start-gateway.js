#!/usr/bin/env node
/**
 * Gateway launcher -- reads .env.local and starts whatsapp-gateway.js
 * with all environment variables correctly set.
 */
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
    const v = t.slice(eq + 1).trim();
    if (!seen[k]) { seen[k] = true; env[k] = v; }
  });
  console.log('[launcher] Loaded .env.local');
} else {
  console.warn('[launcher] .env.local not found -- gateway may fail');
}

console.log('[launcher] SUPABASE_URL   :', env.SUPABASE_URL   || '(not set)');
console.log('[launcher] GATEWAY_TOKEN  :', (env.GATEWAY_TOKEN || '(not set)').slice(0, 12) + '...');
console.log('[launcher] Starting whatsapp-gateway.js ...\n');

const child = spawn(process.execPath, [path.join(ROOT, 'whatsapp-gateway.js')], {
  env,
  stdio: 'inherit',
  cwd: ROOT,
});

child.on('error', err => {
  console.error('[launcher] Failed to start gateway:', err.message);
  process.exit(1);
});

child.on('exit', code => {
  console.log('\n[launcher] Gateway exited with code', code);
  process.exit(code || 0);
});
