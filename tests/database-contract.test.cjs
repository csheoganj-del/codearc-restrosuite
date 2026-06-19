const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
function read(relativePath) {
  if (relativePath === "dashboard.js") {
    const files = [
      "assets/supabase-config.js",
      "assets/rs-api.js",
      "assets/db.js",
      "src/dashboard/observability.js",
      "assets/features-shell.js",
      "assets/features-editor.js",
      "assets/features-manage.js",
      "assets/features-extra.js",
      "assets/features-pos.js",
      "assets/features-growth.js",
      "assets/dashboard.js"
    ];
    return files.map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  }
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractQuotedSet(source, declaration) {
  const match = source.match(new RegExp(`${declaration}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  assert.ok(match, `${declaration} set must exist`);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

test("all tenant API tables are created by migrations and exposed by both adapters", () => {
  const browserApi = read("src/dashboard/api.js");
  const edgeApi = read("supabase/functions/tenant-data/index.ts");
  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations"))
    .sort()
    .map((file) => read(path.join("supabase", "migrations", file)))
    .join("\n");

  const browserTables = extractQuotedSet(browserApi, "TENANT_TABLES").sort();
  const edgeTables = extractQuotedSet(edgeApi, "TENANT_TABLES").sort();
  assert.deepEqual(browserTables, edgeTables);

  for (const table of edgeTables) {
    assert.match(
      migrations,
      new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(`),
      `${table} must be created by a migration`,
    );
  }
});

test("runtime schema contains every field required by imports and restores", () => {
  const core = read("supabase/migrations/20260601000000_core_pos_tables.sql");
  const requiredFragments = [
    "UNIQUE (tenant_id, name)",
    "UNIQUE (tenant_id, \"orderId\")",
    "\"expectedCash\"",
    "\"eventId\"",
    "\"clockInTime\"",
    "\"expiryDate\"",
    "ingredients jsonb",
    "threshold       numeric",
    "\"draftName\"",
    "\"isRead\"",
    "doppio_notifications (tenant_id, \"isRead\", created_at DESC)",
  ];
  for (const fragment of requiredFragments) {
    assert.ok(core.includes(fragment), `core schema must include ${fragment}`);
  }
});

test("dashboard upserts always use tenant-scoped conflict targets", () => {
  const dashboard = read("dashboard.js");
  const conflictTargets = [...dashboard.matchAll(/onConflict:\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
  assert.ok(conflictTargets.length > 0);
  for (const target of conflictTargets) {
    assert.ok(target.split(",").includes("tenant_id"), `${target} must include tenant_id`);
  }
  assert.match(dashboard, /ON CONFLICT \(tenant_id, "orderId"\) DO UPDATE SET/);
});

test("tenant data backend rejects unsafe cross-tenant upserts", () => {
  const edgeApi = read("supabase/functions/tenant-data/index.ts");
  assert.match(edgeApi, /conflictColumns\.includes\("tenant_id"\)/);
  assert.match(edgeApi, /Tenant upserts must use a tenant-scoped conflict key/);
});

test("base tenant migration runs before operational table migrations", () => {
  const files = fs.readdirSync(path.join(root, "supabase", "migrations")).sort();
  assert.equal(files[0], "20260531000000_saas_tenants.sql");
  assert.ok(files.indexOf("20260531000000_saas_tenants.sql") < files.indexOf("20260601000000_core_pos_tables.sql"));
});

test("alignment migration removes duplicate tenant business profiles before adding uniqueness", () => {
  const alignment = read("supabase/migrations/20260609110000_runtime_schema_alignment.sql");
  const cleanupPosition = alignment.indexOf("DELETE FROM public.doppio_business_profile older");
  const indexPosition = alignment.indexOf("doppio_business_profile_tenant_unique");
  assert.ok(cleanupPosition >= 0, "duplicate profile cleanup must exist");
  assert.ok(cleanupPosition < indexPosition, "duplicate profiles must be removed before the unique index");
  assert.match(alignment, /older\.updated_at < newer\.updated_at/);
});

test("growth hub migration tolerates a missing saas_plans table", () => {
  const migration = read("supabase/migrations/20260608190000_growth_hub_modules.sql");
  assert.match(migration, /to_regclass\('public\.saas_plans'\) IS NOT NULL/);
  assert.ok(
    migration.indexOf("to_regclass('public.saas_plans')") < migration.indexOf("UPDATE public.saas_plans"),
    "saas_plans must be checked before it is updated",
  );
});

test("zero-cost retention migration guards every optional table", () => {
  const migration = read("supabase/migrations/20260608170000_zero_cost_retention.sql");
  for (const table of ["api_rate_limits", "app_error_reports", "tenant_audit_logs", "gateway_health_log"]) {
    assert.match(migration, new RegExp(`to_regclass\\('public\\.${table}'\\) IS NOT NULL`));
  }
  assert.doesNotMatch(migration, /DROP TRIGGER IF EXISTS[^;]+ ON public\.(app_error_reports|tenant_audit_logs);/);
});

