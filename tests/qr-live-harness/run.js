// One-shot runner: starts the harness server, runs API + UI suites.
// Prereqs (dev only): npm i -D esbuild jsdom   then: node tests/qr-live-harness/run.js
'use strict';
const { spawn, spawnSync } = require('child_process');
const server = spawn(process.execPath, [__dirname + '/server.js'], { stdio: 'inherit' });
setTimeout(async () => {
  const api = spawnSync(process.execPath, [__dirname + '/e2e-api.test.js'], { stdio: 'inherit' });
  const ui = spawnSync(process.execPath, [__dirname + '/e2e-ui.test.js'], { stdio: 'inherit' });
  try {
    await fetch('http://localhost:4310/__shutdown', { method: 'POST' });
  } catch (_) {
    server.kill();
  }
  const code = api.status || ui.status || 0;
  server.once('exit', () => process.exit(code));
  setTimeout(() => process.exit(code), 1500);
}, 1500);
