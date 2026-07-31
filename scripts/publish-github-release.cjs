/**
 * Publish large desktop/Android binaries to GitHub Releases (free CDN).
 * Vercel Hobby cannot host multi‑80MB EXEs — site links + auto-updater
 * point here instead.
 *
 * Usage:
 *   node scripts/publish-github-release.cjs
 *   node scripts/publish-github-release.cjs --tag v2.0.4
 *
 * Requires: gh CLI authenticated with repo scope.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP_PKG = path.join(ROOT, 'desktop', 'package.json');
const OUT_JSON = path.join(ROOT, 'downloads', 'github-release.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function exists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch (_) {
    return false;
  }
}

function run(cmd, args, opts) {
  console.log('>', cmd, args.join(' '));
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

function main() {
  const desktop = readJson(DESKTOP_PKG);
  const version = desktop.version || '0.0.0';
  let tag = 'v' + version;
  const argTag = process.argv.find((a) => a.startsWith('--tag='));
  if (argTag) {tag = argTag.slice('--tag='.length);}
  const ti = process.argv.indexOf('--tag');
  if (ti >= 0 && process.argv[ti + 1]) {tag = process.argv[ti + 1];}

  // Public downloads-only repo (source repo may be private — release assets must be public).
  // Override: --repo owner/name
  let repo = 'csheoganj-del/restrosuite-downloads';
  const argRepo = process.argv.find((a) => a.startsWith('--repo='));
  if (argRepo) {repo = argRepo.slice('--repo='.length);}
  const ri = process.argv.indexOf('--repo');
  if (ri >= 0 && process.argv[ri + 1] && !process.argv[ri + 1].startsWith('-')) {
    repo = process.argv[ri + 1];
  }

  const baseRelease = `https://github.com/${repo}/releases/download/${tag}`;

  const assets = [
    {
      key: 'setup',
      local: path.join(ROOT, 'downloads', 'RestroSuite-Windows-Setup.exe'),
      name: 'RestroSuite-Windows-Setup.exe',
    },
    {
      key: 'portable',
      local: path.join(ROOT, 'downloads', 'RestroSuite-Windows-Portable.exe'),
      name: 'RestroSuite-Windows-Portable.exe',
    },
    {
      key: 'nsis',
      local: path.join(ROOT, 'downloads', 'desktop', `RestroSuite-${version}-x64.exe`),
      name: `RestroSuite-${version}-x64.exe`,
    },
    {
      key: 'blockmap',
      local: path.join(ROOT, 'downloads', 'desktop', `RestroSuite-${version}-x64.exe.blockmap`),
      name: `RestroSuite-${version}-x64.exe.blockmap`,
    },
    {
      key: 'portableNamed',
      local: path.join(ROOT, 'downloads', 'desktop', `RestroSuite-Desktop-${version}-portable.exe`),
      name: `RestroSuite-Desktop-${version}-portable.exe`,
    },
    {
      key: 'apk',
      local: path.join(ROOT, 'downloads', 'RestroSuite-Android.apk'),
      name: 'RestroSuite-Android.apk',
    },
    {
      key: 'macArm',
      local: path.join(ROOT, 'downloads', 'RestroSuite-Mac-AppleSilicon.dmg'),
      name: 'RestroSuite-Mac-AppleSilicon.dmg',
    },
    {
      key: 'macX64',
      local: path.join(ROOT, 'downloads', 'RestroSuite-Mac-Intel.dmg'),
      name: 'RestroSuite-Mac-Intel.dmg',
    },
    // Versioned builder names (if stable copies not present yet)
    {
      key: 'macArmNamed',
      local: path.join(ROOT, 'downloads', 'desktop', `RestroSuite-${version}-mac-arm64.dmg`),
      name: `RestroSuite-${version}-mac-arm64.dmg`,
    },
    {
      key: 'macX64Named',
      local: path.join(ROOT, 'downloads', 'desktop', `RestroSuite-${version}-mac-x64.dmg`),
      name: `RestroSuite-${version}-mac-x64.dmg`,
    },
    {
      key: 'macYml',
      local: path.join(ROOT, 'downloads', 'desktop', 'latest-mac.yml'),
      name: 'latest-mac.yml',
    },
  ].filter((a) => exists(a.local));

  if (!assets.length) {
    console.error('No binary assets found. Build desktop + android, then run: node scripts/sync-downloads.cjs');
    process.exit(1);
  }

  console.log('Repo:', repo);
  console.log('Tag:', tag);
  console.log('Assets:', assets.map((a) => a.name).join(', '));

  // Ensure release exists
  let releaseExists = false;
  try {
    run('gh', ['release', 'view', tag, '--repo', repo]);
    releaseExists = true;
  } catch (_) {
    releaseExists = false;
  }

  const notes =
    `RestroSuite **${version}** — Windows + macOS + Android builds.\n\n` +
    '- Large installers hosted on GitHub Releases (not Vercel Hobby)\n\n' +
    '**Windows Setup:** RestroSuite-Windows-Setup.exe\n' +
    '**Windows Portable:** RestroSuite-Windows-Portable.exe\n' +
    '**Mac Apple Silicon:** RestroSuite-Mac-AppleSilicon.dmg\n' +
    '**Mac Intel:** RestroSuite-Mac-Intel.dmg\n' +
    '**Android:** RestroSuite-Android.apk\n';

  if (!releaseExists) {
    run('gh', [
      'release', 'create', tag,
      '--repo', repo,
      '--title', `RestroSuite ${version}`,
      '--notes', notes,
    ]);
  } else {
    try {
      run('gh', ['release', 'edit', tag, '--repo', repo, '--notes', notes]);
    } catch (e) {
      console.warn('Could not edit release notes:', e.message || e);
    }
  }

  // Upload (clobber existing assets with same name)
  for (const a of assets) {
    try {
      run('gh', [
        'release', 'upload', tag, a.local,
        '--repo', repo,
        '--clobber',
      ]);
      console.log('Uploaded', a.name);
    } catch (e) {
      console.error('Upload failed', a.name, e.stderr || e.message || e);
      process.exit(1);
    }
  }

  const urls = {
    generatedAt: new Date().toISOString(),
    repo,
    tag,
    version,
    baseUrl: baseRelease,
    assets: {},
  };
  for (const a of assets) {
    urls.assets[a.key] = {
      name: a.name,
      url: `${baseRelease}/${a.name}`,
      size: fs.statSync(a.local).size,
    };
  }
  // Stable names used by the website
  if (urls.assets.setup) {
    urls.windowsSetup = urls.assets.setup.url;
  }
  if (urls.assets.portable) {
    urls.windowsPortable = urls.assets.portable.url;
  }
  if (urls.assets.nsis) {
    urls.windowsNsis = urls.assets.nsis.url;
  }
  if (urls.assets.blockmap) {
    urls.windowsBlockmap = urls.assets.blockmap.url;
  }
  if (urls.assets.apk) {
    urls.androidApk = urls.assets.apk.url;
  }
  // Prefer stable public names for the website
  if (urls.assets.macArm) {
    urls.macAppleSilicon = urls.assets.macArm.url;
  } else if (urls.assets.macArmNamed) {
    urls.macAppleSilicon = urls.assets.macArmNamed.url;
  }
  if (urls.assets.macX64) {
    urls.macIntel = urls.assets.macX64.url;
  } else if (urls.assets.macX64Named) {
    urls.macIntel = urls.assets.macX64Named.url;
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(urls, null, 2) + '\n');
  console.log('Wrote', OUT_JSON);

  // latest.yml for electron-updater: absolute GitHub URLs so Vercel only hosts the tiny yml
  const ymlSrc = path.join(ROOT, 'downloads', 'desktop', 'latest.yml');
  const ymlOut = path.join(ROOT, 'downloads', 'desktop', 'latest.yml');
  if (urls.windowsNsis && exists(ymlSrc)) {
    let yml = fs.readFileSync(ymlSrc, 'utf8');
    // Replace relative file url with absolute GitHub asset URL
    const nsisName = urls.assets.nsis.name;
    yml = yml.replace(
      new RegExp(`url:\\s*${nsisName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
      `url: ${urls.windowsNsis}`
    );
    // path field
    yml = yml.replace(
      new RegExp(`^path:\\s*${nsisName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'),
      `path: ${urls.windowsNsis}`
    );
    fs.writeFileSync(ymlOut, yml);
    console.log('Updated latest.yml with absolute GitHub NSIS URL');
  } else if (urls.windowsNsis) {
    const size = urls.assets.nsis.size;
    const minimal =
      `version: ${version}\n` +
      'files:\n' +
      `  - url: ${urls.windowsNsis}\n` +
      `    size: ${size}\n` +
      `path: ${urls.windowsNsis}\n` +
      `releaseDate: ${new Date().toISOString()}\n`;
    fs.mkdirSync(path.dirname(ymlOut), { recursive: true });
    fs.writeFileSync(ymlOut, minimal);
    console.log('Wrote minimal latest.yml with GitHub URL');
  }

  console.log('\nDone. Public URLs:');
  console.log('  Setup:   ', urls.windowsSetup || '(missing)');
  console.log('  Portable:', urls.windowsPortable || '(missing)');
  console.log('  Mac M*:  ', urls.macAppleSilicon || '(missing)');
  console.log('  Mac Intel:', urls.macIntel || '(missing)');
  console.log('  Android: ', urls.androidApk || '(missing)');
  console.log('\nNext: node scripts/sync-downloads.cjs && npm run pages:build');
}

main();
