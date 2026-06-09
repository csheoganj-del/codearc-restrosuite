const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

const frontendFiles = ["login.html", "dashboard.js", "script.js"];
const keyPattern = /const DEFAULT_SUPABASE_KEY = ['"]([^'"]+)['"]/;
const urlPattern = /const DEFAULT_SUPABASE_URL = ['"]([^'"]+)['"]/;
const discoveredKeys = new Set();
let configuredUrl = "";
let configuredKey = "";

for (const file of frontendFiles) {
  const source = read(file);
  const keyMatch = source.match(keyPattern);
  const urlMatch = source.match(urlPattern);
  if (!keyMatch) {
    fail(`${file} does not define DEFAULT_SUPABASE_KEY.`);
    continue;
  }
  if (!urlMatch) {
    fail(`${file} does not define DEFAULT_SUPABASE_URL.`);
    continue;
  }
  discoveredKeys.add(keyMatch[1]);
  configuredUrl = configuredUrl || urlMatch[1];
  configuredKey = configuredKey || keyMatch[1];
  try {
    const payload = JSON.parse(Buffer.from(keyMatch[1].split(".")[1], "base64url").toString("utf8"));
    const projectRef = new URL(urlMatch[1]).hostname.split(".")[0];
    if (payload.iss !== "supabase") fail(`${file} contains a malformed Supabase key issuer.`);
    if (payload.role !== "anon") fail(`${file} must use a public anon key.`);
    if (payload.ref !== projectRef) fail(`${file} key does not match its Supabase project URL.`);
  } catch {
    fail(`${file} contains an invalid Supabase anon JWT.`);
  }
}

if (discoveredKeys.size !== 1) {
  fail("Frontend files do not use one consistent Supabase anon key.");
}

const requiredFunctions = [
  "tenant-access",
  "tenant-admin",
  "tenant-data",
  "tenant-public",
  "tenant-users",
  "app-observability",
  "notify-registration",
];
const supabaseConfig = read("supabase/config.toml");
for (const functionName of requiredFunctions) {
  const functionPath = path.join(root, "supabase", "functions", functionName, "index.ts");
  if (!fs.existsSync(functionPath)) fail(`Missing Edge Function: ${functionName}.`);
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\[functions\\.${escaped}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`).test(supabaseConfig)) {
    fail(`supabase/config.toml must explicitly disable gateway JWT verification for ${functionName}.`);
  }
}

const coreTables = [
  "doppio_business_profile",
  "doppio_menu",
  "doppio_inventory",
  "doppio_bills",
  "doppio_pending_orders",
  "doppio_shifts",
  "doppio_shift_events",
  "doppio_employees",
  "doppio_leave_requests",
  "doppio_attendance",
  "doppio_crm",
  "doppio_inventory_batches",
  "doppio_notifications",
  "doppio_custom_recipes",
  "doppio_inventory_thresholds",
  "doppio_pos_popularity",
  "doppio_draft_orders",
];
const sqlFiles = [
  "supabase_migration.sql",
  ...fs.readdirSync(path.join(root, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => path.join("supabase", "migrations", name)),
];
const sql = sqlFiles.map(read).join("\n");
for (const table of coreTables) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:public\\.)?${escaped}\\b`, "i").test(sql)) {
    fail(`Core schema is not reproducible: missing CREATE TABLE for ${table}.`);
  }
}

async function checkLiveBackend() {
  if (process.env.SKIP_LIVE_LAUNCH_CHECK === "1" || !configuredUrl || !configuredKey) return;

  try {
    const settingsResponse = await fetch(`${configuredUrl}/auth/v1/settings`, {
      headers: { apikey: configuredKey, Authorization: `Bearer ${configuredKey}` },
    });
    if (!settingsResponse.ok) {
      fail(`Configured Supabase anon key was rejected by the live project (${settingsResponse.status}).`);
    }
  } catch (error) {
    fail(`Could not reach the configured Supabase project: ${error.message}`);
  }

  for (const functionName of requiredFunctions) {
    try {
      if (functionName === "notify-registration") {
        const response = await fetch(`${configuredUrl}/functions/v1/${functionName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (response.status === 404) fail(`Live Edge Function is not deployed: ${functionName}.`);
        continue;
      }
      const response = await fetch(`${configuredUrl}/functions/v1/${functionName}`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://codearc-restrosuite.vercel.app",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization,apikey,content-type",
        },
      });
      if (response.status === 404) fail(`Live Edge Function is not deployed: ${functionName}.`);
      else if (!response.ok) fail(`Live Edge Function preflight failed for ${functionName} (${response.status}).`);
    } catch (error) {
      fail(`Could not verify live Edge Function ${functionName}: ${error.message}`);
    }
  }
}

async function main() {
  await checkLiveBackend();
  if (failures.length) {
    for (const message of failures) console.error(`Launch check failed: ${message}`);
    process.exit(1);
  }
  console.log("Launch checks passed.");
}

main();
