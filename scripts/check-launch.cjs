/**
 * Launch readiness checker.
 *
 * The frontend uses RUNTIME config (config.js -> /api/config -> Vercel env vars).
 * Hardcoded Supabase credentials in source are therefore a FAILURE, not a
 * requirement (this inverts the pre-runtime-config behavior of this script).
 *
 * Live backend checks resolve credentials in this order:
 *   1. SUPABASE_URL + SUPABASE_ANON_KEY environment variables
 *   2. The deployed /api/config endpoint (LIVE_CONFIG_URL, defaults to production)
 * Set SKIP_LIVE_LAUNCH_CHECK=1 to skip network checks (e.g. offline CI).
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const warnings = [];

const PROD_ORIGIN = "https://codearc-restrosuite.vercel.app";
const LIVE_CONFIG_URL = process.env.LIVE_CONFIG_URL || `${PROD_ORIGIN}/api/config`;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function normalizeSupabaseUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth|storage|functions)\/v1$/, "")
    .replace(/\/+$/, "");
}

// ── 1. Frontend must use runtime config, never hardcoded credentials ─────────
const frontendFiles = ["login.html", "assets/dashboard.js", "script.js", "home.html", "dashboard.html"];
const jwtPattern = /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/;
const projectUrlPattern = /https:\/\/[a-z0-9]{16,}\.supabase\.co/;

for (const file of frontendFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`Missing frontend file: ${file}.`);
    continue;
  }
  const source = read(file);
  if (jwtPattern.test(source)) {
    fail(`${file} contains a hardcoded JWT. Credentials must come from /api/config at runtime.`);
  }
  if (projectUrlPattern.test(source)) {
    fail(`${file} contains a hardcoded Supabase project URL. Use window.__SUPABASE_URL__.`);
  }
}

for (const file of ["login.html", "script.js"]) {
  const source = read(file);
  if (!source.includes("window.__SUPABASE_URL__") || !source.includes("window.__SUPABASE_ANON_KEY__")) {
    fail(`${file} does not read runtime config (window.__SUPABASE_URL__ / window.__SUPABASE_ANON_KEY__).`);
  }
}

const apiSource = read("assets/doppio-api.js");
if (!apiSource.includes("/api/config")) {
  fail("assets/doppio-api.js does not fetch /api/config.");
}

// ── 2. Runtime config plumbing must exist ─────────────────────────────────────
if (!fs.existsSync(path.join(root, "config.js"))) {
  fail("Missing config.js runtime loader.");
} else if (!read("config.js").includes("/api/config")) {
  fail("config.js does not fetch /api/config.");
}
if (!fs.existsSync(path.join(root, "api", "config.js"))) {
  fail("Missing api/config.js Vercel function.");
} else {
  const apiConfig = read("api/config.js");
  if (!apiConfig.includes("process.env.SUPABASE_URL") || !apiConfig.includes("process.env.SUPABASE_ANON_KEY")) {
    fail("api/config.js does not read SUPABASE_URL / SUPABASE_ANON_KEY env vars.");
  }
}

// ── 3. Edge Functions present + gateway JWT verification disabled ────────────
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

// CORS hardening contract: no suffix-matched origins in authenticated functions.
for (const functionName of ["tenant-access", "tenant-admin", "tenant-data", "tenant-users", "app-observability"]) {
  const source = read(path.join("supabase", "functions", functionName, "index.ts"));
  if (source.includes('origin.endsWith(".vercel.app")')) {
    fail(`${functionName} uses a suffix-matched CORS origin — exact-match allowlist required.`);
  }
}

// ── 4. Core schema reproducibility ───────────────────────────────────────────
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

// ── 5. Live backend checks ────────────────────────────────────────────────────
async function resolveLiveConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return {
      url: normalizeSupabaseUrl(process.env.SUPABASE_URL),
      key: process.env.SUPABASE_ANON_KEY.trim(),
      source: "environment variables",
    };
  }
  const response = await fetch(LIVE_CONFIG_URL);
  if (!response.ok) {
    fail(`Live /api/config returned HTTP ${response.status} — Vercel env vars missing or deploy broken.`);
    return null;
  }
  const cfg = await response.json();
  const rawUrl = String(cfg.supabaseUrl || "");
  if (/\/(rest|auth|storage|functions)\/v1\/?$/.test(rawUrl.replace(/\/+$/, ""))) {
    warn(`Live SUPABASE_URL env var includes an API path suffix ("${rawUrl}"). ` +
      "The deployed api/config.js must normalize it (fix the Vercel env var to the bare project URL).");
  }
  return {
    url: normalizeSupabaseUrl(rawUrl),
    key: String(cfg.supabaseAnonKey || "").trim(),
    source: LIVE_CONFIG_URL,
  };
}

function validateAnonKey(url, key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    const projectRef = new URL(url).hostname.split(".")[0];
    if (payload.iss !== "supabase") fail("Live anon key has a malformed issuer.");
    if (payload.role !== "anon") fail("Live key must be the public anon key (role=anon).");
    if (payload.ref !== projectRef) fail("Live anon key does not match the Supabase project URL.");
    if (payload.exp && payload.exp * 1000 < Date.now()) fail("Live anon key is expired.");
  } catch {
    fail("Live anon key is not a valid Supabase JWT.");
  }
}

async function checkLiveBackend() {
  if (process.env.SKIP_LIVE_LAUNCH_CHECK === "1") return;

  let config;
  try {
    config = await resolveLiveConfig();
  } catch (error) {
    fail(`Could not resolve live configuration: ${error.message}`);
    return;
  }
  if (!config || !config.url || !config.key) {
    if (config) fail(`Live configuration from ${config.source} is incomplete.`);
    return;
  }

  validateAnonKey(config.url, config.key);

  try {
    const settingsResponse = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    if (!settingsResponse.ok) {
      fail(`Live Supabase project rejected the anon key (${settingsResponse.status}).`);
    }
  } catch (error) {
    fail(`Could not reach the Supabase project: ${error.message}`);
  }

  for (const functionName of requiredFunctions) {
    try {
      if (functionName === "notify-registration") {
        const response = await fetch(`${config.url}/functions/v1/${functionName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (response.status === 404) fail(`Live Edge Function is not deployed: ${functionName}.`);
        continue;
      }
      const response = await fetch(`${config.url}/functions/v1/${functionName}`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_ORIGIN,
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
  for (const message of warnings) console.warn(`Launch check warning: ${message}`);
  if (failures.length) {
    for (const message of failures) console.error(`Launch check failed: ${message}`);
    process.exit(1);
  }
  console.log(warnings.length ? "Launch checks passed (with warnings)." : "Launch checks passed.");
}

main();
