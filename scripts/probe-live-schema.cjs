/**
 * One-shot live schema probe (service role). Not for production app use.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) {continue;}
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) {continue;}
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!m) {continue;}
      let v = m[2] || '';
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {v = v.slice(1, -1);}
      if (!process.env[m[1]]) {process.env[m[1]] = v.trim();}
    }
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.log('NO_SERVICE_ROLE_IN_ENV');
  process.exit(1);
}

(async () => {
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const crm = await sb.from('doppio_crm').select('id,email,dues,marketing_opt_in').limit(1);
  if (crm.error) {console.log('CRM_PROBE_FAIL', crm.error.message);}
  else {console.log('CRM_PROBE_OK', crm.data && crm.data[0] ? Object.keys(crm.data[0]) : []);}

  const menu = await sb.from('doppio_menu').select('id,tax_category').limit(1);
  if (menu.error) {console.log('MENU_TAX_FAIL', menu.error.message);}
  else {console.log('MENU_TAX_OK', menu.data && menu.data[0] ? Object.keys(menu.data[0]) : []);}

  const tenants = await sb.from('saas_tenants').select('*', { count: 'exact', head: true });
  if (tenants.error) {console.log('TENANTS_FAIL', tenants.error.message);}
  else {console.log('TENANTS_OK count', tenants.count);}

  const bills = await sb.from('doppio_bills').select('id,status,refund_reason,refunded_at').limit(1);
  if (bills.error) {console.log('BILLS_REFUND_FAIL', bills.error.message);}
  else {console.log('BILLS_REFUND_OK', bills.data && bills.data[0] ? Object.keys(bills.data[0]) : []);}
})().catch((e) => {
  console.log('ERR', e.message);
  process.exit(1);
});
