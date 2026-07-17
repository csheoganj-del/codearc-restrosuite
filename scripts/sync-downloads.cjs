/**
 * Sync public download hub under /downloads/
 *
 * Copies the latest client apps + guides into stable public URLs so the
 * homepage "Downloads" section always points at current files after you rebuild.
 *
 * Sources (latest preferred):
 *   Android APK  → android-app/dist/RestroSuite-POS-*-debug.apk (or release)
 *   Windows EXE  → desktop/dist/RestroSuite-*-portable.exe
 *   Product PDF  → docs/RestroSuite-Product-Features-Guide.pdf
 *   Desktop guide→ docs/RestroSuite-Complete-Onboarding-Guide.pdf
 *   Mobile guide → docs/RestroSuite-Mobile-Onboarding-Guide.pdf
 *
 * Usage: node scripts/sync-downloads.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'downloads');

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function latestFile(dir, re) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { path: p, name: f, mtime: st.mtimeMs, size: st.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

function copyStable(src, destName) {
  if (!src || !fs.existsSync(src.path || src)) return null;
  const from = src.path || src;
  const to = path.join(OUT, destName);
  fs.copyFileSync(from, to);
  const st = fs.statSync(to);
  return {
    file: destName,
    url: '/downloads/' + destName,
    size: st.size,
    sizeLabel: formatBytes(st.size),
    updatedAt: st.mtime.toISOString(),
  };
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return {};
  }
}

function main() {
  ensureDir(OUT);

  const appUpdate = readJsonSafe(path.join(ROOT, 'app-update.json'));
  const desktopPkg = readJsonSafe(path.join(ROOT, 'desktop', 'package.json'));
  const rootPkg = readJsonSafe(path.join(ROOT, 'package.json'));

  // Prefer highest version-looking APK / portable EXE by mtime
  const apk = latestFile(path.join(ROOT, 'android-app', 'dist'), /RestroSuite.*\.apk$/i)
    || latestFile(path.join(ROOT, 'android-app', 'dist'), /\.apk$/i);
  const exe =
    latestFile(path.join(ROOT, 'desktop', 'dist'), /portable\.exe$/i) ||
    latestFile(path.join(ROOT, 'desktop', 'dist'), /RestroSuite-.*\.exe$/i);

  const pdfProduct = path.join(ROOT, 'docs', 'RestroSuite-Product-Features-Guide.pdf');
  const pdfDesktop = path.join(ROOT, 'docs', 'RestroSuite-Complete-Onboarding-Guide.pdf');
  const pdfMobile = path.join(ROOT, 'docs', 'RestroSuite-Mobile-Onboarding-Guide.pdf');

  const items = [];

  // Apps
  if (apk) {
    const meta = copyStable(apk, 'RestroSuite-Android.apk');
    if (meta) {
      items.push({
        id: 'android-apk',
        kind: 'app',
        platform: 'Android',
        title: 'RestroSuite for Android',
        blurb: 'Install the POS app on kitchen tablets and counter phones (APK).',
        icon: 'fa-android',
        brand: 'brands',
        version: desktopPkg.version || rootPkg.version || '2.0.2',
        filename: meta.file,
        url: meta.url,
        size: meta.size,
        sizeLabel: meta.sizeLabel,
        updatedAt: meta.updatedAt,
        available: true,
      });
      console.log('APK  →', meta.file, meta.sizeLabel, 'from', apk.name);
    }
  } else {
    items.push({
      id: 'android-apk',
      kind: 'app',
      platform: 'Android',
      title: 'RestroSuite for Android',
      blurb: 'APK not built yet. Run the Android build, then re-run sync-downloads.',
      icon: 'fa-android',
      brand: 'brands',
      version: null,
      filename: null,
      url: null,
      size: 0,
      sizeLabel: '—',
      updatedAt: null,
      available: false,
    });
    console.warn('APK missing (android-app/dist/*.apk)');
  }

  if (exe) {
    const meta = copyStable(exe, 'RestroSuite-Windows-Portable.exe');
    if (meta) {
      items.push({
        id: 'windows-exe',
        kind: 'app',
        platform: 'Windows',
        title: 'RestroSuite for Windows',
        blurb: 'Portable .exe for counter PCs — no install wizard required.',
        icon: 'fa-windows',
        brand: 'brands',
        version: desktopPkg.version || '2.0.2',
        filename: meta.file,
        url: meta.url,
        size: meta.size,
        sizeLabel: meta.sizeLabel,
        updatedAt: meta.updatedAt,
        available: true,
      });
      console.log('EXE  →', meta.file, meta.sizeLabel, 'from', exe.name);
    }
  } else {
    items.push({
      id: 'windows-exe',
      kind: 'app',
      platform: 'Windows',
      title: 'RestroSuite for Windows',
      blurb: 'Portable EXE not built yet. Run desktop dist:portable, then re-sync.',
      icon: 'fa-windows',
      brand: 'brands',
      version: null,
      filename: null,
      url: null,
      size: 0,
      sizeLabel: '—',
      updatedAt: null,
      available: false,
    });
    console.warn('EXE missing (desktop/dist/*portable*.exe)');
  }

  // PWA / web (always available — not a binary file)
  items.push({
    id: 'web-pwa',
    kind: 'app',
    platform: 'Web / PWA',
    title: 'Use in browser (PWA)',
    blurb: 'Open the live web app — install to home screen from Chrome/Safari for offline use.',
    icon: 'fa-globe',
    brand: 'solid',
    version: appUpdate.version || rootPkg.version || null,
    filename: null,
    url: 'https://restrosuite.codearc.co.in/login.html',
    size: 0,
    sizeLabel: 'Online',
    updatedAt: new Date().toISOString(),
    available: true,
    openInPlace: true,
  });

  // Guides
  const guides = [
    {
      id: 'pdf-product',
      title: 'Product features guide',
      blurb: 'Full brochure of every client feature — good for owners evaluating the product.',
      src: pdfProduct,
      file: 'RestroSuite-Product-Features-Guide.pdf',
      icon: 'fa-book-open',
    },
    {
      id: 'pdf-onboarding-desktop',
      title: 'Desktop / web onboarding',
      blurb: 'Step-by-step with real screenshots: every tab, button, and flow on desktop.',
      src: pdfDesktop,
      file: 'RestroSuite-Complete-Onboarding-Guide.pdf',
      icon: 'fa-desktop',
    },
    {
      id: 'pdf-onboarding-mobile',
      title: 'Mobile / Android onboarding',
      blurb: 'Same depth for phone layout — bottom nav, More menu, checkout bar.',
      src: pdfMobile,
      file: 'RestroSuite-Mobile-Onboarding-Guide.pdf',
      icon: 'fa-mobile-screen',
    },
  ];

  for (const g of guides) {
    if (fs.existsSync(g.src)) {
      const meta = copyStable({ path: g.src }, g.file);
      items.push({
        id: g.id,
        kind: 'guide',
        platform: 'PDF',
        title: g.title,
        blurb: g.blurb,
        icon: g.icon,
        brand: 'solid',
        version: null,
        filename: meta.file,
        url: meta.url,
        size: meta.size,
        sizeLabel: meta.sizeLabel,
        updatedAt: meta.updatedAt,
        available: true,
      });
      console.log('PDF  →', meta.file, meta.sizeLabel);
    } else {
      items.push({
        id: g.id,
        kind: 'guide',
        platform: 'PDF',
        title: g.title,
        blurb: g.blurb + ' (not generated yet)',
        icon: g.icon,
        brand: 'solid',
        version: null,
        filename: null,
        url: null,
        size: 0,
        sizeLabel: '—',
        updatedAt: null,
        available: false,
      });
      console.warn('PDF missing', g.src);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    appVersion: appUpdate.version || rootPkg.version || 'unknown',
    desktopVersion: desktopPkg.version || null,
    support: 'support@codearc.co.in',
    site: 'https://restrosuite.codearc.co.in',
    items,
  };

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    [
      '# Public downloads',
      '',
      'Stable files served at `https://restrosuite.codearc.co.in/downloads/…`',
      '',
      'Regenerate / refresh with:',
      '',
      '```bash',
      'node scripts/sync-downloads.cjs',
      '```',
      '',
      'PDF generators call this automatically after a successful build.',
      '',
    ].join('\n')
  );

  console.log('\nManifest written:', path.join(OUT, 'manifest.json'));
  console.log('Items:', items.filter((i) => i.available).length, 'available /', items.length, 'total');
}

main();
