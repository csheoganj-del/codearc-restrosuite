const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const dashboard = read("dashboard.js");
const vercel = read("vercel.json");
const tenantData = read("supabase/functions/tenant-data/index.ts");
const tenantPublic = read("supabase/functions/tenant-public/index.ts");
const retention = read("supabase/migrations/20260608170000_zero_cost_retention.sql");

const checks = [
  ["zero-cost launch mode is enabled", /const ZERO_COST_LAUNCH_MODE = true/.test(dashboard)],
  ["cloud gateway is not in Vercel connect-src", !/connect-src[^"]*hf\.space/.test(vercel)],
  ["tenant reads have a default cap", /ZERO_COST_DEFAULT_LIMIT = 250/.test(tenantData)],
  ["tenant reads have a maximum cap", /ZERO_COST_MAX_LIMIT = 500/.test(tenantData)],
  ["public menu reads are capped", /ZERO_COST_MENU_LIMIT = 300/.test(tenantPublic)],
  ["starter online orders are capped", /starter: \{ monthlyOrderLimit: 300 \}/.test(tenantPublic)],
  ["temporary records have retention cleanup", /cleanup_zero_cost_operational_data/.test(retention)],
  ["error reports expire", /app_error_reports[\s\S]*30 days/.test(retention)],
  ["audit logs expire", /tenant_audit_logs[\s\S]*90 days/.test(retention)],
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  for (const [label] of failed) console.error(`Free-tier guard failed: ${label}`);
  process.exit(1);
}

console.log("Free-tier guardrails passed.");
