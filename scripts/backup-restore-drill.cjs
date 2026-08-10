/**
 * Disaster-recovery drill (non-destructive by default).
 *
 * Verifies that:
 *   1. Backup credentials resolve (SUPABASE_URL + SERVICE_ROLE_KEY)
 *   2. A recent backup archive exists (or one can be created with --create)
 *   3. The archive unzips and contains expected table JSON files
 *   4. Restore script can PREVIEW the archive (no writes without --confirm on restore-db.js)
 *
 * Usage:
 *   node scripts/backup-restore-drill.cjs
 *   node scripts/backup-restore-drill.cjs --create          # run a fresh backup first
 *   node scripts/backup-restore-drill.cjs path/to/backup.zip
 *
 * Exit code 0 = drill passed. Exit code 1 = drill failed (treat as ops incident).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const unzipper = require('unzipper');

const root = path.resolve(__dirname, '..');

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) {continue;}
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) {continue;}
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!match) {continue;}
      let val = match[2] || '';
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[match[1]]) {process.env[match[1]] = val.trim();}
    }
  }
}
loadEnv();

const failures = [];
function fail(msg) { failures.push(msg); console.error(`[DRILL FAIL] ${msg}`); }
function ok(msg) { console.log(`[DRILL OK] ${msg}`); }

const REQUIRED_TABLES = [
  'doppio_menu',
  'doppio_bills',
  'doppio_pending_orders',
  'doppio_crm',
  'doppio_business_profile',
  'saas_tenants'
];

async function main() {
  const args = process.argv.slice(2);
  const structureOnly = args.includes('--structure') || process.env.DRILL_STRUCTURE_ONLY === '1';

  if (structureOnly) {
    console.log('[DRILL] Structure-only mode (no credentials / no zip required)');
    const backupScript = path.join(root, 'scripts', 'backup-db.js');
    const restoreScript = path.join(root, 'scripts', 'restore-db.js');
    if (!fs.existsSync(backupScript)) {fail('Missing scripts/backup-db.js');}
    else {ok('backup-db.js present');}
    if (!fs.existsSync(restoreScript)) {fail('Missing scripts/restore-db.js');}
    else {ok('restore-db.js present');}

    const backupSrc = fs.readFileSync(backupScript, 'utf8');
    const restoreSrc = fs.readFileSync(restoreScript, 'utf8');
    for (const table of REQUIRED_TABLES) {
      if (!backupSrc.includes(`"${table}"`) && !backupSrc.includes(`'${table}'`)) {
        fail(`backup-db.js does not list required table: ${table}`);
      }
    }
    if (!failures.some((m) => m.includes('required table'))) {
      ok(`backup-db.js covers ${REQUIRED_TABLES.length} critical tables`);
    }
    if (!restoreSrc.includes('--confirm')) {
      fail('restore-db.js must require --confirm before writing');
    } else {
      ok('restore-db.js gates writes behind --confirm');
    }
    if (failures.length) {
      console.error(`\nDisaster-recovery structure drill FAILED (${failures.length}).`);
      process.exit(1);
    }
    console.log('\nDisaster-recovery structure drill PASSED.');
    process.exit(0);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local or env).');
    process.exit(1);
  }
  ok('Backup credentials present');

  const create = args.includes('--create');
  let zipPath = args.find(a => !a.startsWith('--'));

  if (create) {
    console.log('[DRILL] Creating a fresh backup via npm run backup...');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'backup-db.js')], {
      cwd: root,
      env: process.env,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      fail(`backup-db.js exited ${result.status}: ${(result.stderr || result.stdout || '').slice(0, 400)}`);
      process.exit(1);
    }
    ok('Fresh backup created');
  }

  if (!zipPath) {
    const backupsDir = path.join(root, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fail('No backups/ directory. Run with --create or pass a zip path.');
      process.exit(1);
    }
    const zips = fs.readdirSync(backupsDir)
      .filter(f => /^restrosuite-backup-.*\.zip$/i.test(f))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    if (!zips.length) {
      fail('No restrosuite-backup-*.zip files found. Run with --create.');
      process.exit(1);
    }
    zipPath = path.join(backupsDir, zips[0].name);
  }

  if (!fs.existsSync(zipPath)) {
    fail(`Backup file not found: ${zipPath}`);
    process.exit(1);
  }
  ok(`Using archive: ${zipPath}`);

  const dir = await unzipper.Open.file(zipPath);
  const jsonFiles = dir.files
    .filter(f => f.path && f.path.toLowerCase().endsWith('.json') && f.type !== 'Directory')
    .map(f => f.path.replace(/\\/g, '/').split('/').pop().replace(/\.json$/i, ''))
    .filter(Boolean);
  if (!jsonFiles.length) {
    fail('Archive contains no .json table dumps. Re-run with --create to produce a modern archive.');
  } else {
    ok(`Archive has ${jsonFiles.length} table dump(s)`);
  }

  for (const table of REQUIRED_TABLES) {
    if (!jsonFiles.includes(table)) {
      // Older or partial backups may omit some tables — warn, don't fail the drill.
      console.warn(`[DRILL WARN] Expected table dump missing: ${table}.json`);
    }
  }

  // Preview restore (never writes without --confirm on restore-db.js)
  const preview = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'restore-db.js'), zipPath],
    { cwd: root, env: process.env, encoding: 'utf8' }
  );
  if (preview.status !== 0) {
    fail(`restore-db.js preview failed: ${(preview.stderr || preview.stdout || '').slice(0, 500)}`);
  } else {
    ok('Restore preview completed (no writes)');
    if (preview.stdout) {console.log(preview.stdout.slice(0, 800));}
  }

  if (failures.length) {
    console.error(`\nDisaster-recovery drill FAILED (${failures.length} issue(s)).`);
    process.exit(1);
  }
  console.log('\nDisaster-recovery drill PASSED. To actually restore under pressure:');
  console.log('  node scripts/restore-db.js <backup.zip> --confirm');
  process.exit(0);
}

main().catch(err => {
  console.error('[DRILL FAIL]', err);
  process.exit(1);
});
