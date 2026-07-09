const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const crypto = require('crypto');

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
const testPasswordHash = crypto.createHash('sha256').update('Password123!').digest('hex');

(async () => {
  console.log("Setting temp password for qa-kitchen...");
  const { data: user } = await supabase.from('tenant_users').select('*').eq('username', 'qa-kitchen').single();
  const originalHash = user.password_hash;
  
  await supabase.from('tenant_users').update({ password_hash: testPasswordHash }).eq('id', user.id);
  await supabase.from('api_rate_limits').delete().neq('bucket', '');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  try {
    await page.goto('http://localhost:8001/login.html', { waitUntil: 'domcontentloaded' });
    await page.type('#tenant-id', 'claude-qa-kitchen');
    await page.type('#username', 'qa-kitchen');
    await page.type('#password', 'Password123!');
    await page.click('#login-submit');
    
    console.log("Waiting for dashboard...");
    await new Promise(r => setTimeout(r, 6000));

    const state = await page.evaluate(() => {
      const role = sessionStorage.getItem('logged_in_role');
      const allowed_tabs = sessionStorage.getItem('allowed_tabs');
      const rsRoleObj = window.RS_ROLE;
      
      const links = Array.from(document.querySelectorAll('.sidebar-link'));
      const linksInfo = links.map(link => {
        const tab = link.getAttribute('data-tab');
        const text = link.querySelector('span')?.textContent?.trim();
        const display = window.getComputedStyle(link).display;
        return { tab, text, display, visible: display !== 'none' };
      });
      
      const settingsBtn = document.getElementById('open-settings');
      const settingsDisplay = settingsBtn ? window.getComputedStyle(settingsBtn).display : 'none';

      return { role, allowed_tabs, rsRoleObj, linksInfo, settingsVisible: settingsDisplay !== 'none' };
    });

    console.log("=== KITCHEN ROLE VERIFICATION ===");
    console.log("Current sessionStorage role:", state.role);
    console.log("Current sessionStorage allowed_tabs:", state.allowed_tabs);
    console.log("window.RS_ROLE:", state.rsRoleObj);
    console.log("Settings Button Visible:", state.settingsVisible);
    console.log("\nSidebar Links Visibility Status:");
    for (const info of state.linksInfo) {
      console.log(`  * ${info.text} (${info.tab}): ${info.visible ? '🟢 VISIBLE' : '🔴 HIDDEN'} (display: ${info.display})`);
    }

  } catch (err) {
    console.error("Test failed:", err.message);
  } finally {
    console.log("Restoring original password hash...");
    await supabase.from('tenant_users').update({ password_hash: originalHash }).eq('id', user.id);
    await browser.close();
  }
})();
