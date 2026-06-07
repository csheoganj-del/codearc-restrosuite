const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const javascriptFiles = [
  "dashboard.js",
  "script.js",
  "src/dashboard/api.js",
  "src/dashboard/auth.js",
  "src/dashboard/billing.js",
  "src/dashboard/bills.js",
  "src/dashboard/inventory.js",
  "src/dashboard/operations.js",
  "src/dashboard/onboarding.js",
  "src/dashboard/people.js",
  "src/dashboard/pos.js",
  "src/dashboard/superadmin.js",
  "src/dashboard/whatsapp.js",
  "android-app/app/src/main/assets/dashboard.js",
  "android-app/app/src/main/assets/script.js",
  "android-app/app/src/main/assets/src/dashboard/api.js",
  "android-app/app/src/main/assets/src/dashboard/auth.js",
  "android-app/app/src/main/assets/src/dashboard/billing.js",
  "android-app/app/src/main/assets/src/dashboard/bills.js",
  "android-app/app/src/main/assets/src/dashboard/inventory.js",
  "android-app/app/src/main/assets/src/dashboard/operations.js",
  "android-app/app/src/main/assets/src/dashboard/onboarding.js",
  "android-app/app/src/main/assets/src/dashboard/people.js",
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
  "dashboard.js",
  "dashboard.html",
  "login.html",
  "script.js",
  "supabase_migration.sql",
  "src/dashboard/api.js",
  "src/dashboard/auth.js",
  "src/dashboard/billing.js",
  "src/dashboard/bills.js",
  "src/dashboard/inventory.js",
  "src/dashboard/operations.js",
  "src/dashboard/onboarding.js",
  "src/dashboard/people.js",
  "src/dashboard/pos.js",
  "src/dashboard/superadmin.js",
  "src/dashboard/whatsapp.js"
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
