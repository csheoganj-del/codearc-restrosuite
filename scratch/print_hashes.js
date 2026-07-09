const { createClient } = require('@supabase/supabase-js');
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
} catch (e) {
  console.error("Failed to read .env.local", e);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  const { data: tenant } = await supabase.from('saas_tenants').select('*').eq('slug', 'claude-qa-kitchen').single();
  if (tenant) {
    console.log("Tenant Owner password hash:", tenant.password_hash);
    const { data: users } = await supabase.from('tenant_users').select('*').eq('tenant_id', tenant.id);
    for (const u of users) {
      console.log(`User: ${u.username}, Role: ${u.role}, Hash: ${u.password_hash}`);
    }
  }
})();
