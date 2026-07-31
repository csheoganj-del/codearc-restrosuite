'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('standalone production minification never embeds inline source maps', () => {
  const source = read('scripts/build-critical.cjs');
  const pass2 = source.slice(source.indexOf('Pass 2: minifying'));
  assert.match(pass2, /sourcemap:\s*false/);
  assert.doesNotMatch(pass2, /sourcemap:\s*['"]inline['"]/);
});

test('accessibility CI covers ten representative pages at moderate severity', () => {
  const source = read('scripts/a11y-ci.cjs');
  for (const page of ['index.html', 'login.html', 'order.html', 'qr-order.html', 'install.html', 'feedback.html', 'status.html', 'privacy.html', 'terms.html', 'refund-policy.html']) {
    assert.ok(source.includes(page), `missing accessibility target: ${page}`);
  }
  assert.match(source, /A11Y_MIN_IMPACT\s*\|\|\s*'moderate'/);
  assert.match(source, /bypassCSP:\s*true/);
});

test('performance CI covers customer ordering and install surfaces', () => {
  const source = read('scripts/perf-ci.cjs');
  for (const page of ['index.html', 'login.html', 'order.html', 'qr-order.html', 'install.html']) {
    assert.ok(source.includes(page), `missing performance target: ${page}`);
  }
});

test('native asset sync keeps migrations and legal styling', () => {
  const android = read('sync-assets.ps1');
  const copySection = android.slice(android.indexOf('$FilesToCopy'), android.indexOf('$DirectoriesToCopy'));
  const staleSection = android.slice(android.indexOf('$StaleRoot'));
  assert.ok(copySection.includes('supabase_migration.sql'));
  assert.ok(!staleSection.includes('supabase_migration.sql'));
  assert.ok(read('desktop/sync-app.mjs').includes("'legal.css'"));
});

test('public order cart close control has an accessible name', () => {
  assert.match(read('order.html'), /class="close-btn"[^>]*aria-label="Close order cart"/);
});
test('documentation never contains a concrete E2E password', () => {
  const notes = read('docs/RELEASE_NOTES.md');
  assert.doesNotMatch(
    notes,
    /E2E_PASSWORD\s*=\s*['"](?!<|\$\{)[^'"\r\n]+['"]/i,
    'store E2E passwords in local environment variables or a secret manager, never documentation'
  );
});
test('local tenant administration fails closed and compares signatures safely', () => {
  const source = read('scripts/tenant-admin-local.cjs');
  assert.match(source, /SUPERADMIN_SESSION_SECRET is required/);
  assert.doesNotMatch(source, /decode and validate payload without signature verification/);
  assert.match(source, /timingSafeEqual\(expectedBytes, signatureBytes\)/);
  assert.match(source, /expectedBytes\.length !== signatureBytes\.length/);
});
test('gateway runtime honors the durable port and fails fast on bind errors', () => {
  const ecosystem = read('ecosystem.config.cjs');
  const gateway = read('whatsapp-gateway.js');
  const tray = read('gateway-tray/main.js');
  const tunnel = read('ngrok-service.js');
  const watchdog = read('scripts/gateway-watchdog.cjs');
  assert.match(ecosystem, /loadGatewayEnv\(process\.env\)/);
  assert.match(ecosystem, /GATEWAY_PORT:\s*gatewayPort/);
  assert.match(gateway, /gatewayServer\.on\('error'/);
  assert.match(gateway, /process\.exit\(1\)/);
  assert.match(tray, /\.restrosuite', 'gateway\.env'/);
  assert.match(tray, /if \(started\.code !== 0\) throw commandFailure/);
  assert.match(tray, /if \(gateway\.code !== 0 \|\| tunnel\.code !== 0\)/);
  assert.match(tray, /RECOVERY_FAILURE_THRESHOLD = 3/);
  assert.match(tray, /await restartGateway\(\)/);
  assert.match(tray, /process\.env\.APPDATA/);
  assert.match(tray, /await run\(pm2, \['restart'/);
  assert.match(tray, /PORT: String\(HEALTH_PORT\)/);
  assert.match(tray, /Command timed out after/);
  assert.match(tunnel, /localApi\('GET', '\/api\/tunnels'\)/);
  assert.match(tunnel, /localApi\('DELETE'/);
  assert.match(tunnel, /encodeURIComponent\(existing\.name\)/);
  assert.match(tunnel, /execFile\('taskkill', \['\/PID', String\(pid\), '\/T', '\/F'\]/);
  assert.match(ecosystem, /name: 'restrosuite-gateway-watchdog'/);
  assert.match(watchdog, /FAILURE_THRESHOLD = 3/);
  assert.match(watchdog, /function shellCommand\(cmd\)/);
  assert.match(watchdog, /spawn\(shellCommand\(resolvePm2\(\)\)/);
  assert.match(tray, /restrosuite-gateway-watchdog/);
  assert.match(watchdog, /runPm2\(\['restart', 'restrosuite-gateway'/);
  assert.match(watchdog, /'--only',\s*'restrosuite-gateway'/);
});

test('role refresh cannot fight operating mode over Kitchen tab visibility', () => {
  const dashboard = read('assets/dashboard.js');
  const opsMode = read('assets/modules/ops-mode.js');
  assert.match(opsMode, /id = 'rs-ops-mode-visibility-style'/);
  assert.match(
    opsMode,
    /html\.rs-billing-only-mode \[data-tab="kds-tab"\][\s\S]*display:none!important/
  );
  assert.match(
    opsMode,
    /html\.rs-kitchen-printer-mode \[data-tab="kds-tab"\][\s\S]*display:none!important/
  );
  const roleFilter = dashboard.slice(
    dashboard.indexOf('function applyStaffRoleTabFiltering'),
    dashboard.indexOf('applyStaffRoleTabFiltering(staffRole')
  );
  assert.match(roleFilter, /applyPosOnlyModeUI\(\)/);
});

test('Kitchen Setup has one guarded permission state during live role refresh', () => {
  const dashboard = read('assets/dashboard.js');
  const coach = read('assets/modules/kitchen-link-coach.js');
  const css = read('assets/dashboard.css');
  const roleFilter = dashboard.slice(
    dashboard.indexOf('function applyKitchenSetupAccess'),
    dashboard.indexOf('applyStaffRoleTabFiltering(staffRole')
  );
  assert.match(roleFilter, /classList\.toggle\('rs-kitchen-setup-denied'/);
  assert.match(
    roleFilter,
    /\.sidebar-link:not\(\[data-klc-nav="setup"\]\)/
  );
  assert.match(
    dashboard,
    /window\.RS_ROLE = \{[\s\S]*staffRole: resolvedRole[\s\S]*applyStaffRoleTabFiltering\(resolvedRole, resolvedTabs\)/
  );
  assert.match(
    coach,
    /\(window\.RS_ROLE && window\.RS_ROLE\.staffRole\)[\s\S]*RS_API\.session/
  );
  assert.match(
    css,
    /html\.rs-kitchen-setup-denied #klc-sidebar-setup[\s\S]*display: none !important/
  );
});
