const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const fs = require('fs');

let supabaseUrl = '';
let supabaseServiceKey = '';

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...valueParts] = line.split('=');
    const val = valueParts.join('=').trim();
    if (key.trim() === 'SUPABASE_URL') supabaseUrl = val;
    if (key.trim() === 'SUPABASE_SERVICE_ROLE_KEY') supabaseServiceKey = val;
  }
} catch (e) {}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  await supabase.from('api_rate_limits').delete().neq('bucket', '');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  await page.goto('http://localhost:8001/login.html', { waitUntil: 'domcontentloaded' });
  await page.type('#tenant-id', 'claude-qa-kitchen');
  await page.type('#username', 'qa-kitchen');
  await page.type('#password', 'Password123!');
  
  console.log("Submitting login form...");
  await page.click('#login-submit');
  
  await new Promise(r => setTimeout(r, 6000));

  const pageState = await page.evaluate(() => {
    const url = window.location.href;
    const title = document.title;
    const toast = document.getElementById('toast')?.innerText || '';
    const errContainer = document.querySelector('.error-message')?.innerText || '';
    const bodyText = document.body.innerText.slice(0, 500);
    return { url, title, toast, errContainer, bodyText };
  });

  console.log("=== LOGIN DEBUG RESULT ===");
  console.log(pageState);

  await browser.close();
})();
