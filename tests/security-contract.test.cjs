const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("login uses the tenant access backend", () => {
  const login = read("login.html");
  assert.match(login, /functions\/v1\/tenant-access/);
  assert.doesNotMatch(login, /superadmin.*admin.*bypass/i);
});

test("public ordering uses the tenant public backend", () => {
  const customerApp = read("script.js");
  assert.match(customerApp, /functions\/v1\/tenant-public/);
  assert.match(customerApp, /callTenantPublic\(['"]create_order['"]/);
});

test("public order backend validates menu prices and quantities", () => {
  const publicApi = read("supabase/functions/tenant-public/index.ts");
  assert.match(publicApi, /priceMap/);
  assert.match(publicApi, /Number\.isInteger\(quantity\)/);
  assert.match(publicApi, /Price mismatch for item/);
});

test("tenant approval and reset require the admin backend", () => {
  const dashboard = read("dashboard.js");
  assert.match(dashboard, /callTenantAdmin\(['"]update_tenant['"]/);
  assert.match(dashboard, /callTenantAdmin\(['"]reset_tenant_data['"]/);
});

test("production migration forces tenant RLS", () => {
  const migration = read("supabase/migrations/20260607053000_production_auth_hardening.sql");
  assert.match(migration, /ALTER TABLE public\.saas_tenants FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /tenant_id uuid REFERENCES public\.saas_tenants/);
});
