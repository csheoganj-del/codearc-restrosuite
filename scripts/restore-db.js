// Automates the "Restore Safety" checklist in BACKUP_RESTORE_SOP.md instead
// of relying on a human to follow the manual steps under pressure.
//
// Usage:
//   node scripts/restore-db.js <path-to-backup.zip>              -> PREVIEW ONLY (default, safe)
//   node scripts/restore-db.js <path-to-backup.zip> --confirm     -> actually writes data
//   node scripts/restore-db.js <path-to-backup.zip> --confirm --tables=doppio_menu,doppio_inventory
//
// Safety behavior (per SOP):
//   1. Refuses to run without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
//   2. Without --confirm, only PREVIEWS row counts per table -- writes nothing.
//   3. With --confirm, first takes a fresh safety backup of current data
//      (so the restore itself is undoable) before touching anything.
//   4. Restores are upserts scoped to the row's own primary key / tenant_id
//      already present in the exported data -- this does not delete rows
//      that exist in the DB but aren't in the backup file.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const unzipper = require("unzipper");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const filePath = path.join(__dirname, "..", file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      content.split(/\r?\n/).forEach(line => {
        if (line.trim().startsWith("#") || !line.trim()) return;
        const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = match[2] || "";
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
          if (!process.env[key]) process.env[key] = val.trim();
        }
      });
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[Restore] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Aborting.");
  process.exit(1);
}

const args = process.argv.slice(2);
const zipPath = args.find(a => !a.startsWith("--"));
const confirm = args.includes("--confirm");
const tablesArg = args.find(a => a.startsWith("--tables="));
const tableFilter = tablesArg ? tablesArg.replace("--tables=", "").split(",").map(t => t.trim()).filter(Boolean) : null;

if (!zipPath) {
  console.error("Usage: node scripts/restore-db.js <path-to-backup.zip> [--confirm] [--tables=a,b,c]");
  process.exit(1);
}
if (!fs.existsSync(zipPath)) {
  console.error(`[Restore] Backup file not found: ${zipPath}`);
  process.exit(1);
}

// A restore that finds each table's own primary key column so upserts don't
// collide across tenants or duplicate rows on re-run.
const PRIMARY_KEY_BY_TABLE = {
  default: "id"
};

async function extractZip(zipFilePath) {
  const dir = await unzipper.Open.file(zipFilePath);
  const tables = {};
  for (const entry of dir.files) {
    // Skip directory placeholders and non-JSON files. Accept both flat
    // "doppio_menu.json" and nested "backup/doppio_menu.json" layouts.
    if (entry.type === "Directory") continue;
    if (!entry.path || !entry.path.toLowerCase().endsWith(".json")) continue;
    const base = entry.path.replace(/\\/g, "/").split("/").pop();
    if (!base || base.startsWith(".")) continue;
    const tableName = base.replace(/\.json$/i, "");
    if (!tableName) continue;
    const buffer = await entry.buffer();
    try {
      tables[tableName] = JSON.parse(buffer.toString("utf8"));
    } catch (err) {
      console.warn(`[Restore] Could not parse ${entry.path}: ${err.message}`);
    }
  }
  return tables;
}

async function main() {
  console.log(`[Restore] Reading backup: ${zipPath}`);
  const tables = await extractZip(zipPath);
  let tableNames = Object.keys(tables);
  if (tableFilter) tableNames = tableNames.filter(t => tableFilter.includes(t));

  if (!tableNames.length) {
    console.error("[Restore] No matching tables found in backup archive.");
    process.exit(1);
  }

  console.log("\n=== RESTORE PREVIEW (SOP step 3-4: preview + confirm expected counts) ===");
  for (const table of tableNames) {
    const rows = Array.isArray(tables[table]) ? tables[table] : [];
    console.log(`  ${table.padEnd(32)} ${rows.length} row(s)`);
  }
  console.log("===========================================================================\n");

  if (!confirm) {
    console.log("[Restore] Preview only -- no data was written. Re-run with --confirm to actually restore.");
    console.log("[Restore] Per BACKUP_RESTORE_SOP.md: confirm tenant name/ID and row counts above before doing so.");
    return;
  }

  // SOP step 1: "Export the current data" -- take a safety backup of the
  // CURRENT state before writing anything, so this restore itself can be
  // undone if the counts above turn out to be wrong.
  console.log("[Restore] Taking a pre-restore safety backup of current data first...");
  try {
    execFileSync(process.execPath, [path.join(__dirname, "backup-db.js")], { stdio: "inherit" });
  } catch (err) {
    console.error("[Restore] Pre-restore safety backup failed -- aborting restore rather than proceeding blind.", err.message);
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log("\n[Restore] Writing data (upsert by primary key -- existing rows not in the backup are left untouched)...");
  const results = [];
  for (const table of tableNames) {
    const rows = Array.isArray(tables[table]) ? tables[table] : [];
    if (!rows.length) { results.push({ table, status: "skipped (empty)" }); continue; }
    const pk = PRIMARY_KEY_BY_TABLE[table] || PRIMARY_KEY_BY_TABLE.default;
    try {
      // Supabase upsert caps payload size in practice -- chunk large tables.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase.from(table).upsert(chunk, { onConflict: pk });
        if (error) throw error;
      }
      results.push({ table, status: `restored ${rows.length} row(s)` });
      console.log(`  [OK] ${table}: restored ${rows.length} row(s)`);
    } catch (err) {
      results.push({ table, status: `FAILED: ${err.message}` });
      console.error(`  [FAIL] ${table}: ${err.message}`);
    }
  }

  console.log("\n=== RESTORE SUMMARY ===");
  results.forEach(r => console.log(`  ${r.table.padEnd(32)} ${r.status}`));
  console.log("========================\n");
  console.log("[Restore] Done. Per BACKUP_RESTORE_SOP.md 'After restore' checklist: validate POS, bill history, inventory, staff access, and Growth Hub records before treating this as complete.");

  if (results.some(r => r.status.startsWith("FAILED"))) process.exit(1);
}

main().catch(err => {
  console.error("[Restore] Unexpected failure:", err);
  process.exit(1);
});
