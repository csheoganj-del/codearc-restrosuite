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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  console.log("=== Querying saas_tenants ===");
  const { data: tenants, error: err1 } = await supabase
    .from('saas_tenants')
    .select('*')
    .limit(1);

  if (err1) {
    console.error("Error fetching tenants:", err1);
  } else {
    console.log("Tenant schema keys:", Object.keys(tenants[0] || {}));
    
    // Now fetch all tenants with select('*')
    const { data: allTenants } = await supabase.from('saas_tenants').select('*');
    console.log("All tenants in DB:");
    for (const t of allTenants) {
      console.log(`- Slug: ${t.slug}, Username: ${t.username}, Plan: ${t.plan}, Status: ${t.status}`);
      
      const { data: users, error: err2 } = await supabase
        .from('tenant_users')
        .select('*')
        .eq('tenant_id', t.id);
      
      if (err2) {
        console.error(`  Error fetching users:`, err2);
      } else {
        console.log(`  Users (${users.length}):`);
        for (const u of users) {
          console.log(`    * Username: ${u.username}, Role: ${u.role}, Allowed Tabs: ${u.allowed_tabs}, Status: ${u.status}`);
        }
      }
    }
  }
})();
