const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Compatibility check for dashboard-styles.css
const root = path.resolve(__dirname, "..");
const javascriptFiles = [
  "script.js",
  "pwa.js",
  "service-worker.js",
  "assets/dashboard.js",
  "assets/db.js",
  "assets/doppio-api.js",
  "assets/features-editor.js",
  "assets/features-extra.js",
  "assets/features-growth.js",
  "assets/features-manage.js",
  "assets/features-pos.js",
  "assets/features-shell.js",
  "assets/supabase-config.js",
  "src/dashboard/api.js",
  "src/dashboard/auth.js",
  "src/dashboard/billing.js",
  "src/dashboard/bills.js",
  "src/dashboard/inventory.js",
  "src/dashboard/operations.js",
  "src/dashboard/observability.js",
  "src/dashboard/onboarding.js",
  "src/dashboard/people.js",
  "src/dashboard/staff-access.js",
  "src/dashboard/pos.js",
  "src/dashboard/superadmin.js",
  "src/dashboard/whatsapp.js",
  "android-app/app/src/main/assets/script.js",
  "android-app/app/src/main/assets/pwa.js",
  "android-app/app/src/main/assets/assets/dashboard.js",
  "android-app/app/src/main/assets/assets/db.js",
  "android-app/app/src/main/assets/assets/doppio-api.js",
  "android-app/app/src/main/assets/assets/features-editor.js",
  "android-app/app/src/main/assets/assets/features-extra.js",
  "android-app/app/src/main/assets/assets/features-growth.js",
  "android-app/app/src/main/assets/assets/features-manage.js",
  "android-app/app/src/main/assets/assets/features-pos.js",
  "android-app/app/src/main/assets/assets/features-shell.js",
  "android-app/app/src/main/assets/assets/supabase-config.js",
  "android-app/app/src/main/assets/src/dashboard/api.js",
  "android-app/app/src/main/assets/src/dashboard/auth.js",
  "android-app/app/src/main/assets/src/dashboard/billing.js",
  "android-app/app/src/main/assets/src/dashboard/bills.js",
  "android-app/app/src/main/assets/src/dashboard/inventory.js",
  "android-app/app/src/main/assets/src/dashboard/operations.js",
  "android-app/app/src/main/assets/src/dashboard/observability.js",
  "android-app/app/src/main/assets/src/dashboard/onboarding.js",
  "android-app/app/src/main/assets/src/dashboard/people.js",
  "android-app/app/src/main/assets/src/dashboard/staff-access.js",
  "android-app/app/src/main/assets/src/dashboard/pos.js",
  "android-app/app/src/main/assets/src/dashboard/superadmin.js",
  "android-app/app/src/main/assets/src/dashboard/whatsapp.js"
];

for (const relativePath of javascriptFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Missing required file: ${relativePath}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, ["--check", absolutePath], {
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const mirroredFiles = [
  "dashboard.html",
  "login.html",
  "script.js",
  "styles.css",
  "pwa.js",
  "manifest.webmanifest",
  "supabase_migration.sql",
  "legal.css",
  "terms.html",
  "privacy.html",
  "refund-policy.html",
  "src/dashboard/api.js",
  "src/dashboard/auth.js",
  "src/dashboard/billing.js",
  "src/dashboard/bills.js",
  "src/dashboard/inventory.js",
  "src/dashboard/operations.js",
  "src/dashboard/observability.js",
  "src/dashboard/onboarding.js",
  "src/dashboard/people.js",
  "src/dashboard/staff-access.js",
  "src/dashboard/pos.js",
  "src/dashboard/superadmin.js",
  "src/dashboard/whatsapp.js",
  "assets/dashboard.js",
  "assets/db.js",
  "assets/doppio-api.js",
  "assets/features-editor.js",
  "assets/features-extra.js",
  "assets/features-growth.js",
  "assets/features-manage.js",
  "assets/features-pos.js",
  "assets/features-shell.js",
  "assets/supabase-config.js",
  "assets/dashboard.css",
  "assets/features.css",
  "assets/restrosuite.css"
];

for (const relativePath of mirroredFiles) {
  const web = fs.readFileSync(path.join(root, relativePath));
  const android = fs.readFileSync(
    path.join(root, "android-app/app/src/main/assets", relativePath)
  );
  if (!web.equals(android)) {
    console.error(`Android asset is out of sync: ${relativePath}`);
    process.exit(1);
  }
}

console.log("Project checks passed.");
