#!/usr/bin/env node
/**
 * Auto-bump UI content version so desktop EXE content-updater ALWAYS
 * sees a newer feed after every deploy.
 *
 * Content updater only downloads when remote version ≠ local version.
 * Git push alone does not change version → EXE stays on old overlay.
 * This script fixes that for production builds.
 *
 * Usage:
 *   node scripts/bump-content-version.cjs
 *   node scripts/bump-content-version.cjs --slug settle-skel
 *   node scripts/bump-content-version.cjs --ci   (used on Vercel)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function parseMajor(v) {
  const m = String(v || '').match(/v(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function replaceBuiltin(filePath, version) {
  if (!fs.existsSync(filePath)) {return false;}
  let s = fs.readFileSync(filePath, 'utf8');
  const next = s.replace(
    /var builtin = ['"]v\d+[^'"]*['"]/,
    "var builtin = '" + version + "'"
  );
  if (next === s) {
    // alternate patterns
    const next2 = s.replace(
      /builtin\s*=\s*['"]v\d+[^'"]*['"]/,
      "builtin = '" + version + "'"
    );
    if (next2 === s) {return false;}
    s = next2;
  } else {
    s = next;
  }
  fs.writeFileSync(filePath, s, 'utf8');
  return true;
}

function stampHash() {
  // Short content fingerprint so even same-day redeploys differ
  const bits = [
    process.env.VERCEL_GIT_COMMIT_SHA || '',
    process.env.GITHUB_SHA || '',
    process.env.VERCEL_DEPLOYMENT_ID || '',
    String(Date.now()),
  ].join('|');
  return crypto.createHash('sha256').update(bits).digest('hex').slice(0, 12);
}

function main() {
  const args = process.argv.slice(2);
  const isCi = args.includes('--ci') || process.env.VERCEL === '1' || process.env.CI === 'true';
  let slug = 'auto';
  const si = args.indexOf('--slug');
  if (si >= 0 && args[si + 1]) {slug = String(args[si + 1]).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();}

  const auPath = path.join(ROOT, 'app-update.json');
  const prev = readJson(auPath) || {};
  const prevMajor = parseMajor(prev.version) || 216;
  const nextMajor = prevMajor + 1;

  const now = new Date();
  const ymd =
    now.getFullYear() +
    pad2(now.getMonth() + 1) +
    pad2(now.getDate());
  const version = 'v' + nextMajor + '-' + ymd + '-' + slug;
  const contentStamp = stampHash();
  const date = now.toISOString().slice(0, 10);

  const title =
    isCi && prev.title
      ? 'Live update ' + version
      : prev.title || 'Live feature update';
  const summary =
    isCi
      ? 'Automatic deploy update — installed desktop apps will download this UI content.'
      : prev.summary || 'Feature and fix update for web and desktop content overlay.';

  const nextAu = Object.assign({}, prev, {
    version,
    date,
    title,
    summary,
    contentStamp,
    buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || contentStamp,
    tour: prev.tour || 'auto',
  });
  if (isCi) {
    nextAu.highlights = [
      'Automatic content release ' + version,
      'Desktop EXE picks this up via content updater (no new installer required)',
      'Restart RestroSuite after Update now if prompted',
    ];
  }

  writeJson(auPath, nextAu);

  // dashboard builtins (web + packaged copies)
  const dashboards = [
    'dashboard.html',
    'desktop/app/dashboard.html',
    'android-app/app/src/main/assets/dashboard.html',
  ];
  for (const rel of dashboards) {
    const ok = replaceBuiltin(path.join(ROOT, rel), version);
    console.log('[bump-content] dashboard builtin', rel, ok ? '→ ' + version : '(pattern not found)');
  }

  // packaged app-update copies
  const auCopies = [
    'desktop/app/app-update.json',
    'android-app/app/src/main/assets/app-update.json',
    'publish-static/app-update.json',
  ];
  for (const rel of auCopies) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(path.dirname(p))) {continue;}
    writeJson(p, nextAu);
    console.log('[bump-content] wrote', rel);
  }

  // downloads feeds (if present)
  const updatesPath = path.join(ROOT, 'downloads', 'updates.json');
  const updates = readJson(updatesPath);
  if (updates) {
    if (!updates.web) {updates.web = {};}
    updates.web.version = version;
    updates.web.title = title;
    updates.web.summary = summary;
    updates.web.appUpdateJson = 'https://restrosuite.codearc.co.in/app-update.json';
    updates.generatedAt = new Date().toISOString();
    writeJson(updatesPath, updates);
    console.log('[bump-content] downloads/updates.json web.version →', version);
  }

  const manPath = path.join(ROOT, 'downloads', 'manifest.json');
  const man = readJson(manPath);
  if (man) {
    man.appVersion = version;
    man.generatedAt = new Date().toISOString();
    if (Array.isArray(man.items)) {
      man.items.forEach((it) => {
        if (it && (it.id === 'web-app' || it.kind === 'web')) {
          it.version = version;
        }
      });
    }
    writeJson(manPath, man);
    console.log('[bump-content] downloads/manifest.json appVersion →', version);
  }

  console.log('[bump-content] OK', prev.version || '(none)', '→', version, 'stamp', contentStamp);
  console.log(JSON.stringify({ ok: true, version, contentStamp, previous: prev.version || null }, null, 2));
}

main();
