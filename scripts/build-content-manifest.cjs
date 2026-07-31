#!/usr/bin/env node
/**
 * Build app-content-manifest.json — file list the desktop app downloads
 * when a new app-update.json version is published.
 *
 * Run: node scripts/build-content-manifest.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'app-content-manifest.json');

const ROOT_FILES = [
  'app-update.json',
  'dashboard.html',
  'login.html',
  'index.html',
  'home.html',
  'bill.html',
  'kds.html',
  'qr-order.html',
  'order.html',
  'tokens.html',
  'config.js',
  'env-config.js',
  'pwa.js',
  'service-worker.js',
  'script.js',
  'styles.css',
  'dashboard-styles.css',
  'legal.css',
  'manifest.webmanifest',
];

// Desktop content overlay = static UI only. Never ship Vercel serverless
// (api/*) — those are not public static files and 404/308 breaks older
// content-updaters that abort on the first failed download.
const DIRS = ['assets', 'src', 'images'];

function walk(dir, base, out) {
  if (!fs.existsSync(dir)) {return;}
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return;
  }
  for (const name of names) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') {continue;}
    if (name.startsWith('.')) {continue;}
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch (_) {
      continue;
    }
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (st.isDirectory()) {
      if (/node_modules|scratch|test-results|^api(\/|$)/.test(rel)) {continue;}
      walk(full, base, out);
    } else if (st.isFile()) {
      if (/\.(map|exe|apk|blockmap)$/i.test(name)) {continue;}
      // Private / underscore modules and server helpers are never static UI
      if (name.startsWith('_')) {continue;}
      if (st.size > 6 * 1024 * 1024) {continue;}
      out.push(rel);
    }
  }
}

function main() {
  const list = [];
  for (const f of ROOT_FILES) {
    if (fs.existsSync(path.join(ROOT, f))) {list.push(f);}
  }
  for (const d of DIRS) {
    walk(path.join(ROOT, d), ROOT, list);
  }

  const files = [...new Set(list)].sort();

  let version = 'unknown';
  let title = '';
  try {
    const au = JSON.parse(fs.readFileSync(path.join(ROOT, 'app-update.json'), 'utf8'));
    version = au.version || version;
    title = au.title || '';
  } catch (_) {}

  const payload = {
    version,
    title,
    generatedAt: new Date().toISOString(),
    baseUrl: 'https://restrosuite.codearc.co.in',
    fileCount: files.length,
    files,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[content-manifest] wrote', OUT, '(' + files.length + ' files, version ' + version + ')');
}

main();
