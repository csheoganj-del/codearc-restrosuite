const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const archiver = require("archiver");

// Load Environment Variables from local configuration files
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const filePath = path.join(__dirname, "..", file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      content.split(/\r?\n/).forEach(line => {
        // Skip comments and empty lines
        if (line.trim().startsWith("#") || !line.trim()) return;
        const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = match[2] || "";
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val.trim();
          }
        }
      });
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://htkauiibuejetimfiavs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk"; // Fallback to dev key if env not configured

const TABLES_TO_BACKUP = [
  "doppio_bills",
  "doppio_pending_orders",
  "doppio_draft_orders",
  "doppio_menu",
  "doppio_inventory",
  "doppio_inventory_batches",
  "doppio_inventory_thresholds",
  "doppio_shifts",
  "doppio_shift_events",
  "doppio_employees",
  "doppio_leave_requests",
  "doppio_attendance",
  "doppio_crm",
  "doppio_notifications",
  "doppio_custom_recipes",
  "doppio_pos_popularity",
  "doppio_support_tickets",
  "doppio_onboarding_tasks",
  "doppio_reservations",
  "doppio_vendors",
  "doppio_purchase_orders",
  "doppio_item_costs",
  "doppio_offers",
  "doppio_refund_requests",
  "doppio_device_setups",
  "doppio_backup_snapshots",
  "doppio_outlets",
  "doppio_migration_status",
  "doppio_saas_invoices",
];

async function runBackup() {
  console.log("Initializing database backup...");
  console.log(`Connecting to: ${SUPABASE_URL}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const tempDir = path.join(__dirname, "..", "temp_backup");
  const backupsDir = path.join(__dirname, "..", "backups");

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipFileName = `restrosuite-backup-${timestamp}.zip`;
  const zipFilePath = path.join(backupsDir, zipFileName);

  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(`Backup completed successfully! Size: ${archive.pointer()} bytes`);
    console.log(`Archive file saved at: ${zipFilePath}`);
    
    // Clean up temporary files
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(output);

  for (const table of TABLES_TO_BACKUP) {
    try {
      console.log(`Exporting table: ${table}...`);
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.warn(`[Warning] Could not export table ${table}: ${error.message}`);
        continue;
      }

      const fileContent = JSON.stringify(data || [], null, 2);
      const tempFilePath = path.join(tempDir, `${table}.json`);
      fs.writeFileSync(tempFilePath, fileContent, "utf8");
      
      archive.file(tempFilePath, { name: `${table}.json` });
    } catch (err) {
      console.warn(`[Warning] Error backing up table ${table}:`, err.message);
    }
  }

  console.log("Finalizing zip archive compression...");
  await archive.finalize();
}

runBackup().catch(err => {
  console.error("Backup failed:", err);
  process.exit(1);
});
