'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, 'publish-static');

  if (!fs.existsSync(outDir)) {
    run(process.execPath, [path.join(root, 'scripts', 'build-pages.cjs')], root);
    run(process.execPath, [path.join(root, 'scripts', 'minify-assets.cjs')], root);
  }

  const indexUrl = pathToFileURL(path.join(outDir, 'index.html')).toString() + '?home=1';
  const loginUrl = pathToFileURL(path.join(outDir, 'login.html')).toString();

  const maxLcp = process.env.MAX_LCP_MS || '3500';
  const maxFcp = process.env.MAX_FCP_MS || '2000';
  const maxTtfb = process.env.MAX_TTFB_MS || '800';
  const maxCls = process.env.MAX_CLS || '0.1';

  const r = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'measure-web-vitals.cjs'), indexUrl, loginUrl],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        MAX_LCP_MS: String(maxLcp),
        MAX_FCP_MS: String(maxFcp),
        MAX_TTFB_MS: String(maxTtfb),
        MAX_CLS: String(maxCls),
      },
    }
  );

  process.exit(r.status || 0);
}

main().catch((e) => {
  process.stderr.write((e && e.stack) ? e.stack + '\n' : String(e) + '\n');
  process.exit(1);
});
