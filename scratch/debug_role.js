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
  // Clear rate limits
  await supabase.from('api_rate_limits').delete().neq('bucket', '');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  await page.goto('http://localhost:8001/login.html', { waitUntil: 'domcontentloaded' });
  await page.type('#tenant-id', 'claude-qa-kitchen');
  await page.type('#username', 'qa-kitchen');
  await page.type('#password', 'Password123!');
  
  await page.click('#login-submit');
  
  // Wait for login redirection and page rendering
  console.log("Waiting for dashboard to load...");
  await new Promise(r => setTimeout(r, 6000));

  const debugInfo = await page.evaluate(() => {
    const sessionRole = sessionStorage.getItem('logged_in_role');
    const sessionTabs = sessionStorage.getItem('allowed_tabs');
    const rsRoleObj = window.RS_ROLE;
    const apiSession = window.RS_API ? window.RS_API.session() : null;

    const links = Array.from(document.querySelectorAll('.sidebar-link'));
    const linkVisibilities = links.map(link => {
      const tab = link.getAttribute('data-tab');
      const styleDisplay = link.style.display;
      const computedDisplay = window.getComputedStyle(link).display;
      const isHiddenClass = link.classList.contains('hidden') || link.style.display === 'none';
      return { tab, styleDisplay, computedDisplay, isHiddenClass };
    });

    const bodyClasses = Array.from(document.body.classList);

    return { sessionRole, sessionTabs, rsRoleObj, apiSession, linkVisibilities, bodyClasses };
  });

  console.log("=== DEBUG INFO ===");
  console.log(JSON.stringify(debugInfo, null, 2));

  await browser.close();
})();
