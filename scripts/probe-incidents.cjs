'use strict';
/**
 * Probe app_error_reports + optional resolve dry-run metadata.
 * Uses service role from .env / .env.local only.
 */
const fs = require('node:fs');
const path = require('node:path');

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

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  const { data, error } = await sb
    .from('app_error_reports')
    .select('id, message, status, tenant_slug, source, url_path, app_version, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.log('QUERY_FAIL', error.message);
    process.exit(1);
  }
  console.log('COUNT', data.length);
  for (const row of data || []) {
    console.log(JSON.stringify(row));
  }
  const open = (data || []).filter((r) => r.status === 'open');
  console.log('OPEN', open.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
