/**
 * sync-brand-icons.cjs
 * One master brand mark → every place icons are used:
 *   Web/PWA (PNG + maskable + SVG + social), Android mipmaps/splash,
 *   Desktop EXE .ico + window icon, images/ mirrors, android/desktop web copies.
 *
 * Master source (first that exists):
 *   assets/restrosuite-mark-new-source.jpg | .png
 *   assets/restrosuite-mark-512.png
 *
 * Usage: node scripts/sync-brand-icons.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const ICON_VERSION = '7'; // bump when regenerating — used in HTML ?v=

function resolveSource() {
  const candidates = [
    'assets/restrosuite-mark-new-source.png',
    'assets/restrosuite-mark-new-source.jpg',
    'assets/restrosuite-mark-512.png',
    'assets/restrosuite-mark.png',
  ];
  for (const rel of candidates) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) {return abs;}
  }
  throw new Error('No brand source image found under assets/');
}

async function writePng(input, outPath, size, opts = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  let pipeline = sharp(input).resize(size, size, {
    fit: 'cover',
    position: 'centre',
    kernel: sharp.kernel.lanczos3,
  });
  if (opts.flatten) {
    pipeline = pipeline.flatten({ background: opts.background || '#F3EFE8' });
  }
  if (opts.padSafe) {
    // Maskable: keep logo in center ~80% (extra padding ring)
    const inner = Math.round(size * 0.8);
    const buf = await sharp(input)
      .resize(inner, inner, { fit: 'contain', background: { r: 243, g: 239, b: 232, alpha: 1 } })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 243, g: 239, b: 232, alpha: 1 },
      },
    })
      .composite([{ input: buf, gravity: 'centre' }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    return;
  }
  await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outPath);
}

/** Multi-size ICO containing PNG frames (Vista+ / Electron compatible). */
function buildIcoFromPngs(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + dirEntrySize * count;
  let offset = dirSize;
  const entries = [];
  for (const buf of pngBuffers) {
    // Read PNG IHDR for width/height
    const w = buf[16] << 24 | buf[17] << 16 | buf[18] << 8 | buf[19];
    const h = buf[20] << 24 | buf[21] << 16 | buf[22] << 8 | buf[23];
    const widthByte = w >= 256 ? 0 : w;
    const heightByte = h >= 256 ? 0 : h;
    entries.push({ widthByte, heightByte, size: buf.length, offset, buf });
    offset += buf.length;
  }
  const out = Buffer.alloc(offset);
  // ICONDIR
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type = icon
  out.writeUInt16LE(count, 4);
  let dirOff = 6;
  for (const e of entries) {
    out[dirOff] = e.widthByte;
    out[dirOff + 1] = e.heightByte;
    out[dirOff + 2] = 0; // color palette
    out[dirOff + 3] = 0; // reserved
    out.writeUInt16LE(1, dirOff + 4); // color planes
    out.writeUInt16LE(32, dirOff + 6); // bits per pixel
    out.writeUInt32LE(e.size, dirOff + 8);
    out.writeUInt32LE(e.offset, dirOff + 12);
    dirOff += 16;
  }
  for (const e of entries) {
    e.buf.copy(out, e.offset);
  }
  return out;
}

async function pngBuffer(input, size) {
  return sharp(input)
    .resize(size, size, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

async function writeSvgFromPng(png192Path, outSvgPath) {
  const b64 = fs.readFileSync(png192Path).toString('base64');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 192 192" width="192" height="192" role="img" aria-label="RestroSuite">
  <image width="192" height="192" href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}"/>
</svg>
`;
  fs.writeFileSync(outSvgPath, svg, 'utf8');
}

async function writeSocial(input, outPath) {
  // 1200x630 OG image with centered mark on brand cream
  const mark = await sharp(input)
    .resize(360, 360, { fit: 'contain', background: { r: 243, g: 239, b: 232, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 3,
      background: { r: 243, g: 239, b: 232 },
    },
  })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

async function main() {
  const source = resolveSource();
  console.log('Brand source:', path.relative(ROOT, source));

  // Normalize master 1024 square (cover) for consistent crops
  const master1024 = await sharp(source)
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const targets = {
    mark192: path.join(ASSETS, 'restrosuite-mark.png'),
    mark512: path.join(ASSETS, 'restrosuite-mark-512.png'),
    maskable: path.join(ASSETS, 'restrosuite-maskable-512.png'),
    logo: path.join(ASSETS, 'restrosuite_logo.png'),
    social: path.join(ASSETS, 'restrosuite-social.png'),
    svg: path.join(ASSETS, 'restrosuite-mark.svg'),
  };

  await writePng(master1024, targets.mark192, 192);
  await writePng(master1024, targets.mark512, 512);
  await writePng(master1024, targets.logo, 512);
  // Full-bleed 512 is fine; also write padSafe maskable for install banners
  await writePng(master1024, targets.maskable, 512, { padSafe: true });
  await writeSocial(master1024, targets.social);
  await writeSvgFromPng(targets.mark192, targets.svg);

  // images/ mirror (legacy paths)
  const imgDir = path.join(ROOT, 'images');
  copyFile(targets.mark192, path.join(imgDir, 'restrosuite-mark.png'));
  copyFile(targets.logo, path.join(imgDir, 'restrosuite_logo.png'));
  copyFile(targets.social, path.join(imgDir, 'restrosuite-social.png'));
  copyFile(targets.svg, path.join(imgDir, 'restrosuite-mark.svg'));

  // Desktop EXE / window icon
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of icoSizes) {pngs.push(await pngBuffer(master1024, s));}
  const ico = buildIcoFromPngs(pngs);
  const icoPath = path.join(ROOT, 'desktop', 'build', 'icon.ico');
  fs.mkdirSync(path.dirname(icoPath), { recursive: true });
  fs.writeFileSync(icoPath, ico);
  // Also drop PNG for electron tools that accept it
  await writePng(master1024, path.join(ROOT, 'desktop', 'build', 'icon.png'), 512);
  // Splash logo for desktop splash.html
  await writePng(master1024, path.join(ROOT, 'desktop', 'build', 'splash-mark.png'), 192);

  // Android legacy mipmaps (square launcher)
  const mipmap = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };
  const resRoot = path.join(ROOT, 'android-app', 'app', 'src', 'main', 'res');
  for (const [folder, size] of Object.entries(mipmap)) {
    const dir = path.join(resRoot, folder);
    await writePng(master1024, path.join(dir, 'ic_launcher.png'), size);
    await writePng(master1024, path.join(dir, 'ic_launcher_round.png'), size);
  }
  // Adaptive foreground (108dp @ 4x = 432)
  await writePng(master1024, path.join(resRoot, 'drawable', 'ic_launcher_foreground.png'), 432);
  await writePng(master1024, path.join(resRoot, 'drawable', 'splash_logo.png'), 256);

  // Web asset copies inside Android & Desktop packaged apps
  const webCopies = [
    path.join(ROOT, 'android-app', 'app', 'src', 'main', 'assets', 'assets'),
    path.join(ROOT, 'android-app', 'app', 'src', 'main', 'assets', 'images'),
    path.join(ROOT, 'desktop', 'app', 'assets'),
    path.join(ROOT, 'desktop', 'app', 'images'),
  ];
  for (const dir of webCopies) {
    if (!fs.existsSync(path.dirname(dir))) {continue;}
    fs.mkdirSync(dir, { recursive: true });
    copyFile(targets.mark192, path.join(dir, 'restrosuite-mark.png'));
    if (path.basename(dir) === 'assets' || dir.endsWith(`${path.sep}assets`)) {
      copyFile(targets.mark512, path.join(dir, 'restrosuite-mark-512.png'));
      copyFile(targets.maskable, path.join(dir, 'restrosuite-maskable-512.png'));
      copyFile(targets.logo, path.join(dir, 'restrosuite_logo.png'));
      copyFile(targets.social, path.join(dir, 'restrosuite-social.png'));
      copyFile(targets.svg, path.join(dir, 'restrosuite-mark.svg'));
    } else {
      copyFile(targets.logo, path.join(dir, 'restrosuite_logo.png'));
      copyFile(targets.social, path.join(dir, 'restrosuite-social.png'));
      copyFile(targets.svg, path.join(dir, 'restrosuite-mark.svg'));
    }
  }

  // Manifest cache-buster note file (optional)
  fs.writeFileSync(
    path.join(ASSETS, '.brand-icon-version'),
    `v${ICON_VERSION}\nsource=${path.relative(ROOT, source)}\ngenerated=${new Date().toISOString()}\n`,
    'utf8'
  );

  console.log('Wrote web marks: 192, 512, maskable, logo, social, svg');
  console.log('Wrote desktop/build/icon.ico + icon.png + splash-mark.png');
  console.log('Wrote Android mipmaps + adaptive foreground + splash_logo');
  console.log('Synced android/desktop web asset copies');
  console.log(`HTML favicon query should use ?v=${ICON_VERSION}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
