const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  if (relativePath === "dashboard.js") {
    const files = [
      "assets/supabase-config.js",
      "assets/doppio-api.js",
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

test("login uses the tenant access backend", () => {
  const login = read("login.html");
  const api = read("assets/doppio-api.js");
  assert.match(login, /RS_API\.login/);
  assert.match(api, /'tenant-access'/);
  assert.doesNotMatch(login, /superadmin.*admin.*bypass/i);
});

test("superadmin never uses local demo data", () => {
  const api = read("assets/doppio-api.js");
  assert.match(api, /Super-Admin is cloud-only/);
  assert.match(api, /isSuperadminSlug\(slug\)/);
  assert.doesNotMatch(api, /demo-admin-token/);
  assert.doesNotMatch(api, /mock_tenants_v2/);
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
  assert.match(publicApi, /Math\.abs\(clientSubtotal - expectedSubtotal\)/);
  assert.match(publicApi, /UPI - Pending Verification/);
  assert.match(publicApi, /This order was already submitted/);
  assert.match(publicApi, /const safeItems/);
  assert.match(publicApi, /items: JSON\.stringify\(safeItems\)/);
  assert.doesNotMatch(publicApi, /expectedSubtotal \* 0\.5/);
});

test("public authentication and ordering endpoints use database rate limits", () => {
  const accessApi = read("supabase/functions/tenant-access/index.ts");
  const publicApi = read("supabase/functions/tenant-public/index.ts");
  const migration = read("supabase/migrations/20260608090000_public_api_rate_limits.sql");
  assert.match(accessApi, /consume_api_rate_limit/);
  assert.match(publicApi, /consume_api_rate_limit/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.api_rate_limits/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /GRANT EXECUTE.*service_role/);
});

test("tenant updates cannot mutate tenant ownership", () => {
  const tenantData = read("supabase/functions/tenant-data/index.ts");
  assert.match(tenantData, /function withoutTenantId/);
  assert.match(tenantData, /update\(safeUpdate\)/);
  assert.doesNotMatch(tenantData, /update\(payload\.data \|\| \{\}\)/);
});

test("customer ordering does not claim simulated payment verification", () => {
  const customerPage = read("home.html");
  const customerApp = read("script.js");
  assert.doesNotMatch(customerPage, /Simulate Payment Success/);
  assert.doesNotMatch(customerApp, /Payment Verified & Received/);
  assert.match(customerApp, /Staff will verify payment/);
});

test("dynamic customer and staff content is escaped before HTML rendering", () => {
  const customerApp = read("script.js");
  const dashboard = read("dashboard.js");
  assert.match(customerApp, /function escHtml/);
  assert.match(customerApp, /const safeName = escHtml\(item\.name\)/);
  assert.match(dashboard, /function escHtml/);
  assert.match(dashboard, /escHtml\(report\.error_message \|\| 'Unknown application error'\)/);
  assert.match(dashboard, /escHtml\(severity\)/);
});

test("deployment and Android wrappers enforce baseline security controls", () => {
  const vercel = read("vercel.json");
  const gitignore = read(".gitignore");
  const manifest = read("android-app/app/src/main/AndroidManifest.xml");
  const activity = read("android-app/app/src/main/java/com/doppiocafe/pos/MainActivity.java");
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /Strict-Transport-Security/);
  assert.match(gitignore, /\.tmp-gradle-build\//);
  assert.doesNotMatch(manifest, /<manifest[^>]*\spackage=/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
});

test("the web app is installable without caching tenant API traffic", () => {
  const manifest = read("manifest.webmanifest");
  const serviceWorker = read("service-worker.js");
  const login = read("login.html");
  assert.match(manifest, /"display": "standalone"/);
  assert.match(login, /rel="manifest"/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /request\.method !== "GET"/);
});

test("tenant approval and reset require the admin backend", () => {
  const dashboard = read("dashboard.js");
  assert.match(dashboard, /RS_API\.admin\(\{\s*action:\s*['"]update_tenant['"]/);
  assert.match(dashboard, /RS_API\.admin\(\{\s*action:\s*['"]reset_tenant_data['"]/);
});

test("production migration forces tenant RLS", () => {
  const migration = read("supabase/migrations/20260607053000_production_auth_hardening.sql");
  assert.match(migration, /ALTER TABLE public\.saas_tenants FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /tenant_id uuid REFERENCES public\.saas_tenants/);
});

test("staff identities are tenant-scoped, revocable, and protected by RLS", () => {
  const migration = read("supabase/migrations/20260608110000_tenant_staff_identity.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tenant_users/);
  assert.match(migration, /UNIQUE \(tenant_id, username_normalized\)/);
  assert.match(migration, /session_version integer NOT NULL DEFAULT 1/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tenant_audit_logs/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
});

test("staff login and session validation use authoritative account state", () => {
  const accessApi = read("supabase/functions/tenant-access/index.ts");
  assert.match(accessApi, /\.from\("tenant_users"\)/);
  assert.match(accessApi, /effectiveTabs\(staffUser\.role/);
  assert.match(accessApi, /session_version: staffUser\.session_version/);
  assert.match(accessApi, /Session was revoked/);
});

test("tenant data authorization enforces roles and records writes", () => {
  const tenantData = read("supabase/functions/tenant-data/index.ts");
  assert.match(tenantData, /ROLE_DEFAULT_TABS/);
  assert.match(tenantData, /TABLE_WRITE_ROLES/);
  assert.match(tenantData, /staffUser\.session_version/);
  assert.match(tenantData, /String\(payload\.role\) !== staffUser\.role/);
  assert.match(tenantData, /Your role has read-only access to this module/);
  assert.match(tenantData, /\.from\("tenant_audit_logs"\)\.insert/);
  assert.match(tenantData, /action: `data\.\$\{operation\}`/);
});

test("tenant administrators can manage staff without exposing password hashes", () => {
  const staffApi = read("supabase/functions/tenant-users/index.ts");
  const browserApi = read("src/dashboard/api.js");
  assert.match(staffApi, /action === "list_users"/);
  assert.match(staffApi, /action === "create_user"/);
  assert.match(staffApi, /action === "update_user"/);
  assert.match(staffApi, /action === "reset_password"/);
  assert.match(staffApi, /action === "revoke_user_sessions"/);
  assert.match(staffApi, /async function hashPassword/);
  assert.match(staffApi, /You cannot remove your own administrator access/);
  assert.doesNotMatch(staffApi, /\.select\("[^"]*password_hash[^"]*"\).*list_users/);
  assert.match(browserApi, /"tenant-users"/);
});

test("browser sessions retain staff identity fields", () => {
  const api = read("assets/doppio-api.js");
  assert.match(api, /role:\s*['"]logged_in_role['"]/);
  assert.match(api, /display:\s*['"]logged_in_display['"]/);
});

test("tenant administrators have a complete staff access dashboard", () => {
  const dashboard = read("dashboard.html");
  const manage = read("assets/features-manage.js");
  const staffUi = read("src/dashboard/staff-access.js");
  assert.match(dashboard, /id="employees-tab"/);
  assert.match(manage, /enhanceEmployees/);
  assert.match(manage, /Weekly shift roster/);
  assert.match(manage, /Today’s attendance/);
  assert.match(staffUi, /role !== "admin"/);
  assert.match(staffUi, /callStaff\("create_user"/);
  assert.match(staffUi, /callStaff\("update_user"/);
  assert.match(staffUi, /callStaff\("reset_password"/);
  assert.match(staffUi, /callStaff\("revoke_user_sessions"/);
  assert.match(staffUi, /callStaff\("audit_logs"/);
});

test("saas plan entitlements are persisted and enforced server-side", () => {
  const migration = read("supabase/migrations/20260608130000_saas_plan_entitlements.sql");
  const accessApi = read("supabase/functions/tenant-access/index.ts");
  const dataApi = read("supabase/functions/tenant-data/index.ts");
  const publicApi = read("supabase/functions/tenant-public/index.ts");
  const staffApi = read("supabase/functions/tenant-users/index.ts");
  const adminApi = read("supabase/functions/tenant-admin/index.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.saas_plans/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS plan_code/);
  assert.match(migration, /subscription_status IN \('trialing', 'active', 'past_due', 'canceled'\)/);
  assert.match(accessApi, /effectiveTenantTabs/);
  assert.match(accessApi, /plan_limits/);
  assert.match(dataApi, /Workspace subscription is not active/);
  assert.match(publicApi, /Monthly online order limit reached/);
  assert.match(staffApi, /supports up to/);
  assert.match(adminApi, /plan_code/);
  assert.match(adminApi, /subscription_status/);
});

test("plan information is visible in tenant and superadmin workflows", () => {
  const auth = read("src/dashboard/auth.js");
  const dashboard = read("dashboard.js");
  assert.match(auth, /tenant_plan_code/);
  assert.match(auth, /tenant_plan_limits/);
  assert.match(dashboard, /plan_code/);
  assert.match(dashboard, /subscription_status/);
});

test("application observability stores safe rate-limited incident reports", () => {
  const migration = read("supabase/migrations/20260608150000_app_error_reports.sql");
  const observabilityApi = read("supabase/functions/app-observability/index.ts");
  const adminApi = read("supabase/functions/tenant-admin/index.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.app_error_reports/);
  assert.match(migration, /status text NOT NULL DEFAULT 'open'/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(observabilityApi, /consume_api_rate_limit/);
  assert.match(observabilityApi, /function cleanText/);
  assert.match(observabilityApi, /\[email\]/);
  assert.match(observabilityApi, /\[number\]/);
  assert.match(adminApi, /list_error_reports/);
  assert.match(adminApi, /resolve_error_report/);
});

test("dashboard captures and displays application incidents for superadmin", () => {
  const dashboard = read("dashboard.html");
  const app = read("dashboard.js");
  const observability = read("src/dashboard/observability.js");
  const checks = read("scripts/check-project.cjs");
  assert.match(dashboard, /id="app-incidents-list"/);
  assert.match(dashboard, /src\/dashboard\/observability\.js/);
  assert.match(app, /observabilityDomain\.createReporter/);
  assert.match(app, /installGlobalHandlers/);
  assert.match(app, /list_error_reports/);
  assert.match(app, /resolve_error_report/);
  assert.match(observability, /window\.addEventListener\("error"/);
  assert.match(observability, /unhandledrejection/);
  assert.match(observability, /function redact/);
  assert.match(checks, /src\/dashboard\/observability\.js/);
});

test("visual system uses a restrained SaaS palette and consistent radius", () => {
  const dashboardCss = read("dashboard-styles.css");
  const publicCss = read("styles.css");
  assert.match(dashboardCss, /--primary-brand: #111827/);
  assert.match(dashboardCss, /--accent-caramel: #F97316/);
  assert.match(dashboardCss, /--tracking-base: 0/);
  assert.match(dashboardCss, /WORLD-CLASS SAAS UI REFINEMENT LAYER/);
  assert.match(dashboardCss, /body::before\s*\{\s*display: none;/);
  assert.match(publicCss, /--primary-brand: #111827/);
  assert.match(publicCss, /--border-radius: 8px/);
  assert.match(publicCss, /CODEARC SAAS DESIGN REFINEMENT LAYER/);
  assert.doesNotMatch(publicCss, /--primary-brand: #2C1B18/);
  assert.doesNotMatch(`${dashboardCss}\n${publicCss}`, /letter-spacing:\s*-/);
});

test("mobile and Android app shells share a professional native layout", () => {
  const dashboardCss = read("dashboard-styles.css");
  const dashboard = read("dashboard.html");
  const checks = read("scripts/check-project.cjs");
  const activity = read("android-app/app/src/main/java/com/doppiocafe/pos/MainActivity.java");
  const androidColors = read("android-app/app/src/main/res/values/colors.xml");
  const androidTheme = read("android-app/app/src/main/res/values/themes.xml");

  assert.match(dashboardCss, /MOBILE APP SHELL REFINEMENT/);
  assert.match(dashboardCss, /--mobile-topbar-height: 62px/);
  assert.match(dashboardCss, /--mobile-nav-height: 72px/);
  assert.match(dashboardCss, /env\(safe-area-inset-top\)/);
  assert.match(dashboardCss, /env\(safe-area-inset-bottom\)/);
  assert.match(dashboardCss, /min-height: 44px/);
  assert.match(dashboardCss, /#mobile-brand-title/);
  assert.match(dashboard, /Workspace Menu/);
  assert.match(checks, /dashboard-styles\.css/);
  assert.match(checks, /styles\.css/);
  assert.match(androidColors, /<color name="bg_cream">#F6F7F9<\/color>/);
  assert.match(androidColors, /<color name="accent_caramel">#F97316<\/color>/);
  assert.match(androidTheme, /android:windowLightStatusBar/);
  assert.match(androidTheme, /android:windowLightNavigationBar/);
  assert.match(activity, /setStatusBarColor\(Color\.WHITE\)/);
  assert.match(activity, /SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR/);
  assert.match(activity, /setBackgroundColor\(Color\.rgb\(246, 247, 249\)\)/);
});

test("zero-cost launch mode keeps paid add-ons optional and caps free-tier usage", () => {
  const dashboard = read("dashboard.js");
  const vercel = read("vercel.json");
  const packageJson = read("package.json");
  const tenantData = read("supabase/functions/tenant-data/index.ts");
  const tenantPublic = read("supabase/functions/tenant-public/index.ts");
  const tenantAccess = read("supabase/functions/tenant-access/index.ts");
  const notifyRegistration = read("supabase/functions/notify-registration/index.ts");
  const retention = read("supabase/migrations/20260608170000_zero_cost_retention.sql");
  const docs = read("ZERO_COST_LAUNCH.md");

  assert.match(dashboard, /zeroCostLaunchMode/);
  assert.match(dashboard, /gatewayUrl/);
  assert.doesNotMatch(vercel, /connect-src[^"]*hf\.space/);
  assert.match(packageJson, /check:free-tier/);
  assert.match(tenantData, /ZERO_COST_DEFAULT_LIMIT = 250/);
  assert.match(tenantData, /ZERO_COST_MAX_LIMIT = 500/);
  assert.match(tenantPublic, /ZERO_COST_MENU_LIMIT = 300/);
  assert.match(tenantPublic, /starter: \{ monthlyOrderLimit: 300 \}/);
  assert.match(tenantAccess, /monthlyOrderLimit: 300/);
  assert.match(notifyRegistration, /ZERO_COST_EMAILS_DISABLED/);
  assert.match(notifyRegistration, /EMAIL_WEBHOOK_SECRET/);
  assert.match(notifyRegistration, /EMAIL_RELAY_TOKEN/);
  assert.match(notifyRegistration, /registration_email_sent/);
  assert.match(notifyRegistration, /EMAIL_RELAY_URL is not configured/);
  assert.match(read("supabase/config.toml"), /\[functions\.notify-registration\][\s\S]*verify_jwt = false/);
  assert.match(read("supabase/config.toml"), /\[functions\.tenant-users\][\s\S]*verify_jwt = false/);
  assert.match(read("supabase/config.toml"), /\[functions\.app-observability\][\s\S]*verify_jwt = false/);
  assert.match(retention, /cleanup_zero_cost_operational_data/);
  assert.match(retention, /app_error_reports[\s\S]*30 days/);
  assert.match(retention, /tenant_audit_logs[\s\S]*90 days/);
  assert.match(docs, /Upgrade Triggers/);
});

test("dashboard interactions are optimized for instant feedback", () => {
  const dashboard = read("dashboard.js");
  const browserApi = read("src/dashboard/api.js");
  const dashboardCss = read("dashboard-styles.css");
  const activity = read("android-app/app/src/main/java/com/doppiocafe/pos/MainActivity.java");

  assert.match(dashboard, /const FAST_INTERACTION_MODE = true/);
  assert.match(dashboard, /const ENABLE_DEMO_TOOLS\s*=/);
  assert.match(dashboard, /employees-tab', 'growth-hub-tab'/);
  assert.match(dashboard, /document\.querySelectorAll\('\.more-sheet-link\[data-tab\]'\)/);
  assert.match(dashboard, /else if \(tabId === 'growth-hub-tab'\) \{\s*renderGrowthHub\(\)/);
  assert.match(read("dashboard-styles.css"), /\.floating-cart-bar\s*\{[\s\S]*?top: auto !important;[\s\S]*?bottom: calc\(var\(--mobile-nav-height\)/);
  assert.match(read("dashboard-styles.css"), /\.tab-content\.active\s*\{[\s\S]*?content-visibility: visible;/);
  assert.match(read("src/dashboard/onboarding.js"), /document\.body\.classList\.add\('onboarding-active'\)/);
  assert.match(read("src/dashboard/onboarding.js"), /document\.body\.classList\.remove\('onboarding-active'\)/);
  const dashboardRealtimeMigration = read("supabase/migrations/20260609090000_client_dashboard_realtime.sql");
  assert.match(dashboardRealtimeMigration, /ALTER PUBLICATION supabase_realtime ADD TABLE/);
  assert.match(dashboardRealtimeMigration, /doppio_menu_tenant_name_uidx/);
  const inventoryNotificationsRealtimeMigration = read("supabase/migrations/20260630090000_enable_inventory_notifications_realtime.sql");
  assert.match(inventoryNotificationsRealtimeMigration, /doppio_inventory/);
  assert.match(inventoryNotificationsRealtimeMigration, /doppio_notifications/);
  assert.match(dashboard, /function debounce/);
  assert.match(dashboard, /requestIdleCallback/);
  assert.match(dashboard, /vaultWriteQueue/);
  assert.match(dashboard, /frameTask\(renderBills\)/);
  assert.match(dashboard, /if \(!document\.hidden && navigator\.onLine\) syncWithSupabase\(\)/);
  assert.match(dashboard, /channel\('doppio-employees-realtime'\)/);
  assert.match(dashboard, /table: 'doppio_attendance', filter: `tenant_id=eq\.\$\{activeTenantId\}`/);
  assert.match(dashboard, /table: 'doppio_leave_requests', filter: `tenant_id=eq\.\$\{activeTenantId\}`/);
  assert.match(dashboard, /channel\('doppio-crm-realtime'\)/);
  assert.match(dashboard, /channel\(`doppio-menu-realtime-\$\{activeTenantId\}`\)/);
  assert.match(dashboard, /event: 'menu-updated'/);
  assert.match(dashboard, /broadcastMenuUpdate\(\)/);
  assert.match(dashboard, /await Promise\.all\(cloudWrites\)/);
  assert.match(dashboard, /Recipe import failed for \$\{newItem\.name\}/);
  assert.match(dashboard, /onConflict: 'tenant_id,name'/);
  assert.match(dashboard, /onConflict: 'tenant_id,item_name'/);
  assert.match(dashboard, /table: 'doppio_bills', filter: `tenant_id=eq\.\$\{activeTenantId\}`/);
  assert.match(dashboard, /table: 'doppio_pending_orders', filter: `tenant_id=eq\.\$\{activeTenantId\}`/);
  assert.doesNotMatch(dashboard, /table: 'doppio_bills' \},/);
  assert.doesNotMatch(dashboard, /table: 'doppio_pending_orders' \},/);
  assert.match(dashboard, /const belongsToActiveTenant = bills\.some/);
  assert.match(dashboard, /if \(!belongsToActiveTenant\) return/);
  assert.match(dashboard, /const scheduleTenantDataSync/);
  assert.match(read("supabase/functions/tenant-data/index.ts"), /realtime\/v1\/api\/broadcast/);
  assert.match(dashboard, /channel\(`rs-tenant-\$\{activeTenantId\}`\)/);
  assert.match(dashboard, /event:'tenant-data-changed'/);
  assert.match(dashboard, /String\(response\.payload\.tenantId\) === String\(activeTenantId\)/);
  assert.doesNotMatch(dashboard, /event: 'data-reset' \}, \(response\) => \{\s*return;/);
  assert.doesNotMatch(dashboard, /localStorage\.setItem\('doppio_pending_qr_orders', JSON\.stringify\(mock\)\)/);
  assert.match(browserApi, /READ_CACHE_TTL_MS = 1500/);
  assert.match(browserApi, /readCache\.set/);
  assert.match(browserApi, /readCache\.clear/);
  assert.match(dashboardCss, /INSTANT INTERACTION PERFORMANCE LAYER/);
  assert.match(dashboardCss, /content-visibility: hidden/);
  assert.match(dashboardCss, /touch-action: manipulation/);
  assert.match(activity, /setLayerType\(View\.LAYER_TYPE_HARDWARE, null\)/);
});

test("growth hub delivers the recommended restaurant and SaaS workflows", () => {
  const dashboard = read("dashboard.html");
  const dashboardJs = read("dashboard.js");
  const dashboardCss = read("dashboard-styles.css");
  const browserApi = read("src/dashboard/api.js");
  const tenantData = read("supabase/functions/tenant-data/index.ts");
  const tenantAccess = read("supabase/functions/tenant-access/index.ts");
  const tenantAdmin = read("supabase/functions/tenant-admin/index.ts");
  const migration = read("supabase/migrations/20260608190000_growth_hub_modules.sql");
  const growthIndex = dashboard.indexOf('id="growth-hub-tab"');
  const mainCloseIndex = dashboard.indexOf("</main>");

  assert.match(dashboard, /id="growth-hub-tab"/);
  assert.ok(growthIndex > 0 && mainCloseIndex > growthIndex, "Growth Hub should render inside the main dashboard tab container.");
  assert.match(dashboard, /id="sidebar-growth-hub-link"/);
  assert.match(dashboard, /id="growth-onboarding-list"/);
  assert.match(dashboard, /id="growth-support-form"/);
  assert.match(dashboard, /id="growth-reservation-form"/);
  assert.match(dashboard, /id="growth-procurement-form"/);
  assert.match(dashboard, /id="growth-costing-form"/);
  assert.match(dashboard, /id="growth-offer-form"/);
  assert.match(dashboard, /id="growth-refund-form"/);
  assert.match(dashboard, /id="growth-device-test-btn"/);
  assert.match(dashboard, /id="growth-outlet-form"/);
  assert.match(dashboard, /id="saas-platform-summary"/);
  assert.match(dashboardJs, /function renderGrowthHub/);
  assert.match(dashboardJs, /function renderPlatformSummary/);
  assert.match(dashboardJs, /conflictTargets/);
  assert.match(dashboardCss, /GROWTH HUB PRODUCT MODULES/);
  assert.match(browserApi, /doppio_support_tickets/);
  assert.match(tenantData, /doppio_saas_invoices/);
  assert.match(tenantAccess, /growth-hub-tab/);
  assert.match(tenantAdmin, /doppio_backup_snapshots/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.doppio_reservations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.doppio_purchase_orders/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.doppio_refund_requests/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
});

test("public launch policies are linked and mobile readable", () => {
  const home = read("index.html");
  const legalCss = read("legal.css");
  const terms = read("terms.html");
  const privacy = read("privacy.html");
  const refunds = read("refund-policy.html");

  assert.match(home, /href="terms\.html"/);
  assert.match(home, /href="privacy\.html"/);
  assert.match(home, /href="refund-policy\.html"/);
  assert.match(terms, /Terms of Service/);
  assert.match(privacy, /Privacy Policy/);
  assert.match(refunds, /Refund Policy/);
  assert.match(legalCss, /@media \(max-width: 640px\)/);
  assert.match(legalCss, /width: min\(820px/);
});

test("production launch runbooks cover deployment, QA, support, billing, backups, monitoring, and demos", () => {
  const launch = read("LAUNCH_RUNBOOK.md");
  const qa = read("PRODUCTION_QA_CHECKLIST.md");
  const support = read("SUPPORT_SOP.md");
  const billing = read("REFUND_AND_BILLING_SOP.md");
  const backup = read("BACKUP_RESTORE_SOP.md");
  const monitoring = read("MONITORING_ALERTS.md");
  const demo = read("CLIENT_DEMO_SCRIPT.md");

  assert.match(launch, /Supabase Setup/);
  assert.match(launch, /Vercel Setup/);
  assert.match(launch, /Go\/No-Go Gate/);
  assert.match(qa, /Growth Hub/);
  assert.match(qa, /Mobile and Android/);
  assert.match(support, /Priority Levels/);
  assert.match(support, /Escalation/);
  assert.match(billing, /Future Razorpay or Stripe Integration/);
  assert.match(billing, /verified webhooks/);
  assert.match(backup, /Restore Safety/);
  assert.match(backup, /Tenant Reset Safety/);
  assert.match(monitoring, /Alert Conditions/);
  assert.match(monitoring, /Supabase quota/);
  assert.match(demo, /12-Minute Demo Flow/);
  assert.match(demo, /zero-cost pilot/);
});

test("nested POS controls expose split payment and touch customization", () => {
  const dashboardJs = read("dashboard.js");
  const dashboardCss = read("dashboard-styles.css");

  assert.match(dashboardJs, /let isSplitPaymentActive = false;/);
  assert.match(dashboardJs, /class="pos-customize-btn"/);
  assert.match(dashboardJs, /openCustomizationModal\(item\)/);
  assert.match(dashboardCss, /\.pos-customize-btn/);
  assert.match(dashboardCss, /@media \(hover: none\), \(max-width: 600px\)/);
});

test("onboarding is entitlement-aware and includes a permanent setup guide", () => {
  const dashboard = read("dashboard.html");
  const onboarding = read("src/dashboard/onboarding.js");
  const dashboardCss = read("dashboard-styles.css");

  assert.match(dashboard, /id="open-product-guide-btn"/);
  assert.match(dashboard, /id="tour-action"/);
  assert.match(onboarding, /function enabledFeatures/);
  assert.match(onboarding, /sessionStorage\.getItem\('allowed_tabs'\)/);
  assert.match(onboarding, /window\.getComputedStyle\(link\)\.display !== 'none'/);
  assert.match(onboarding, /restrosuite_tour_done:\$\{tenant\}:\$\{user\}:\$\{signature\}/);
  assert.match(onboarding, /function setupTasks/);
  assert.match(onboarding, /window\.openProductGuide = openGuide/);
  assert.match(onboarding, /tabId: 'growth-hub-tab'/);
  assert.match(onboarding, /Start Feature Tour/);
  assert.match(dashboardCss, /\.product-guide-modal/);
  assert.match(dashboardCss, /\.product-guide-task-grid/);
  assert.match(dashboardCss, /@media \(max-width: 720px\)/);
});

test("credential recovery uses expiring one-time tokens and separates privileged recovery", () => {
  const login = read("login.html");
  const tenantAccess = read("supabase/functions/tenant-access/index.ts");
  const tenantAdmin = read("supabase/functions/tenant-admin/index.ts");
  const migration = read("supabase/migrations/20260609130000_secure_credential_recovery.sql");
  const guide = read("CREDENTIAL_RECOVERY.md");

  assert.match(login, /id="open-recovery-btn"/);
  assert.match(login, /id="recovery-request-form"/);
  assert.match(login, /id="recovery-reset-form"/);
  assert.match(guide, /Superadmin[\s\S]*SUPERADMIN_PASSWORD_HASH/);
  assert.match(tenantAccess, /request_recovery/);
  assert.match(tenantAccess, /reset_password/);
  assert.match(tenantAccess, /\.eq\("email", email\)/);
  assert.match(tenantAccess, /if \(slug\) query = query\.eq\("slug", slug\)/);
  assert.match(tenantAccess, /30 \* 60 \* 1000/);
  assert.match(tenantAccess, /token_hash: tokenHash/);
  assert.match(tenantAccess, /\.is\("used_at", null\)/);
  assert.match(tenantAccess, /auth_version: Number\(tenant\.auth_version \|\| 1\) \+ 1/);
  assert.match(tenantAdmin, /updates\.auth_version = Number\(currentTenant\.auth_version \|\| 1\) \+ 1/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tenant_password_resets/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(guide, /Superadmin recovery is intentionally not exposed/);
});

test("live simulation regressions keep sessions, menu saves, QR sync, and QR billing safe", () => {
  const api = read("assets/doppio-api.js");
  const db = read("assets/db.js");
  const dashboard = read("assets/dashboard.js");
  const pos = read("assets/features-pos.js");
  const login = read("login.html");
  const tenantPublic = read("supabase/functions/tenant-public/index.ts");
  const tenantAccess = read("supabase/functions/tenant-access/index.ts");
  const otpMigration = read("supabase/migrations/20260701163000_public_otp_challenges.sql");

  assert.match(api, /function ssGet\(k\)\{\s*return SS\.getItem\(k\) \|\| LS_SESS\.getItem\(k\);\s*\}/);
  assert.match(api, /function ssSet\(k, v, persist\)\{\s*SS\.setItem\(k, v\);/);
  assert.match(api, /if \(SS\.getItem\(k\) !== null\) snapshot\[k\] = \{ storage:'session'/);

  assert.match(db, /optionalCloudColumns = Object\.freeze\(\{\s*menu: \['tax_category'\]/);
  assert.match(db, /function omitUnsupportedOptionalColumns\(collection, body, err\)/);
  assert.match(db, /if \(!omitUnsupportedOptionalColumns\(c, body, err\)\) throw err;/);

  assert.match(dashboard, /async function syncPendingOrders\(options\)/);
  assert.match(dashboard, /const forceCloud = options === true \|\| !!\(options && options\.forceCloud\);/);
  assert.match(dashboard, /RS_DB\.listCloud\('pending_orders'\)/);
  assert.match(dashboard, /RS_DB\.writeLocal\('pending_orders', rows \|\| \[\]\)/);
  assert.match(dashboard, /syncPendingOrders\(\{ forceCloud: true \}\)/);
  assert.match(dashboard, /customerName: r\.customerName \|\| ''/);
  assert.match(dashboard, /customerPhone: r\.customerPhone \|\| ''/);
  assert.match(dashboard, /function openQrOrderInPos\(order\)/);
  assert.match(dashboard, /RS\.setCart\(items\)/);
  assert.match(dashboard, /new Set\(QR_ORDERS\.map\(o => o\.table\)\)\.size/);

  assert.match(pos, /r\.status === 'served'/);
  assert.match(pos, /r\.status === 'Ready'/);

  assert.match(tenantPublic, /public_otp_challenges/);
  assert.match(tenantPublic, /challenge_id: challengeId/);
  assert.match(tenantPublic, /body: JSON\.stringify\(\{ phone, message \}\)/);
  assert.doesNotMatch(login, /message: msg/);
  assert.match(login, /otp_challenge_id:_pendingRegOtpChallenge/);
  assert.match(tenantAccess, /function consumeRegistrationOtp/);
  assert.match(tenantAccess, /otp_challenge_id/);
  assert.match(tenantAccess, /phone: cleanPhone/);
  assert.match(otpMigration, /CREATE TABLE IF NOT EXISTS public\.public_otp_challenges/);
  assert.match(otpMigration, /FORCE ROW LEVEL SECURITY/);
});
