/**
 * Render scripts/og-card.html → assets/restrosuite-social.png (1200×630)
 * High-DPI capture + optional PNG compression for WhatsApp reliability.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const htmlPath = path.join(root, 'scripts', 'og-card.html');
  const outAssets = path.join(root, 'assets', 'restrosuite-social.png');
  const outImages = path.join(root, 'images', 'restrosuite-social.png');
  const outPublish = path.join(root, 'publish-static', 'assets', 'restrosuite-social.png');
  const outPublishImg = path.join(root, 'publish-static', 'images', 'restrosuite-social.png');
  const outDesktop = path.join(root, 'desktop', 'app', 'assets', 'restrosuite-social.png');

  if (!fs.existsSync(htmlPath)) {throw new Error('Missing scripts/og-card.html');}

  const browser = await chromium.launch({ headless: true });
  try {
    // 2× DPR for crisp text, then we keep logical 1200×630
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 2,
    });
    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(400);
    // Wait for product screenshot to load
    await page.waitForFunction(() => {
      const img = document.querySelector('img.shot');
      return img && img.complete && img.naturalWidth > 0;
    }, { timeout: 15000 }).catch(() => {});
    await page.locator('.card').screenshot({
      path: outAssets,
      type: 'png',
    });

    // Prefer smaller file for WhatsApp if sharp is available; else keep PNG
    const finalPath = outAssets;
    try {
      const sharp = require('sharp');
      const buf = await sharp(outAssets)
        .resize(1200, 630, { fit: 'fill' })
        .png({ compressionLevel: 9, palette: false })
        .toBuffer();
      // If still huge, use high-quality JPEG under WhatsApp-friendly size
      if (buf.length > 280 * 1024) {
        const jpg = await sharp(outAssets)
          .resize(1200, 630, { fit: 'fill' })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer();
        const jpgPath = outAssets.replace(/\.png$/i, '.jpg');
        fs.writeFileSync(jpgPath, jpg);
        // Keep PNG as primary (meta says image/png) — try optimize PNG more aggressively
        const png2 = await sharp(outAssets)
          .resize(1200, 630, { fit: 'fill' })
          .png({ compressionLevel: 9, quality: 80, effort: 10 })
          .toBuffer();
        fs.writeFileSync(outAssets, png2.length < buf.length ? png2 : buf);
        // Also write jpg as alternate asset
        console.log('Also wrote', jpgPath, `(${(jpg.length / 1024).toFixed(1)} KB)`);
      } else {
        fs.writeFileSync(outAssets, buf);
      }
    } catch {
      // no sharp — leave playwright PNG as-is; downscale via canvas not needed at 2x
      // Re-render at 1x if file is enormous
      const size = fs.statSync(outAssets).size;
      if (size > 500 * 1024) {
        const page1 = await browser.newPage({
          viewport: { width: 1200, height: 630 },
          deviceScaleFactor: 1,
        });
        await page1.goto(fileUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await page1.waitForTimeout(400);
        await page1.locator('.card').screenshot({ path: outAssets, type: 'png' });
        await page1.close();
      }
    }

    const copies = [outImages, outPublish, outPublishImg, outDesktop];
    for (const dest of copies) {
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(outAssets, dest);
      } catch (e) {
        console.warn('Skip copy', dest, e.message);
      }
    }

    const sizeKb = (fs.statSync(outAssets).size / 1024).toFixed(1);
    console.log('Wrote', finalPath, `(${sizeKb} KB)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
