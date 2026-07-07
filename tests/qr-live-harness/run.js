// One-shot runner: starts the harness server, runs API + UI suites.
// Prereqs (dev only): npm i -D esbuild jsdom   then: node tests/qr-live-harness/run.js
'use strict';
const { spawn, spawnSync } = require('child_process');
const server = spawn(process.execPath, [__dirname + '/server.js'], { stdio: 'inherit' });
setTimeout(() => {
  const api = spawnSync(process.execPath, [__dirname + '/e2e-api.test.js'], { stdio: 'inherit' });
  const ui = spawnSync(process.execPath, [__dirname + '/e2e-ui.test.js'], { stdio: 'inherit' });
  server.kill();
  process.exit(api.status || ui.status || 0);
}, 1500);
