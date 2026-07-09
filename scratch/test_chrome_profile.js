const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\MASTER PC\\AppData\\Local\\Google\\Chrome\\User Data';
const destDir = 'C:\\Users\\MASTER PC\\AppData\\Local\\Temp\\chrome_temp_profile';

function copyFile(src, dest) {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
  } catch (e) {
    console.warn(`Failed to copy ${src}: ${e.message}`);
  }
}

// Copy essential files for passwords and autofill
copyFile(path.join(srcDir, 'Local State'), path.join(destDir, 'Local State'));
copyFile(path.join(srcDir, 'Default', 'Login Data'), path.join(destDir, 'Default', 'Login Data'));
copyFile(path.join(srcDir, 'Default', 'Web Data'), path.join(destDir, 'Default', 'Web Data'));

(async () => {
  console.log("Launching Puppeteer with temp profile...");
  const browser = await puppeteer.launch({
    headless: false, // Show UI to trigger Chrome autofill mechanisms
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: destDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1200,800'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  console.log("Navigating to http://localhost:8001/login.html");
  await page.goto('http://localhost:8001/login.html', { waitUntil: 'networkidle2' });

  console.log("Waiting 5 seconds for autofill to trigger...");
  await new Promise(r => setTimeout(r, 5000));

  // Check if inputs have values
  const inputValues = await page.evaluate(() => {
    const tenantId = document.getElementById('tenant-id')?.value;
    const username = document.getElementById('username')?.value;
    const password = document.getElementById('password')?.value;
    return { tenantId, username, password: password ? '*** (Filled)' : '(Empty)' };
  });

  console.log("Detected Input Values:", inputValues);

  // Take a screenshot to visualize
  const screenshotPath = 'C:\\Users\\MASTER PC\\Downloads\\restrosuite\\autofill-check.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log("Browser closed.");
})();
