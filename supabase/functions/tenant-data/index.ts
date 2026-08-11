import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ROLE_DEFAULT_TABS,
  planFor as sharedPlanFor,
  effectiveTenantTabs,
  effectiveTabs,
} from "../_shared/role-defaults.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://restrosuite.codearc.co.in";
// Exact-match origin allowlist (see tenant-access for rationale). Configure extra
// origins via ALLOWED_ORIGINS="https://a.com,https://b.com". Never suffix-match.
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || ALLOWED_ORIGIN)
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
ALLOWED_ORIGINS.add(ALLOWED_ORIGIN.replace(/\/+$/, ""));
for (const o of [
  "https://restrosuite.codearc.co.in",
  "https://restrosuite-live.vercel.app",
  "https://codearc-restrosuite.vercel.app",
  "https://appassets.androidplatform.net",
  "http://localhost:8001",
  "http://127.0.0.1:8001",
]) {
  ALLOWED_ORIGINS.add(o);
}

function getCorsHeaders(req: Request) {
  const origin = (req.headers.get("origin") || "").replace(/\/+$/, "");
  const allowed = !origin ? ALLOWED_ORIGIN : (ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGIN);
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPERADMIN_SESSION_SECRET = Deno.env.get("SUPERADMIN_SESSION_SECRET") || "";
const OTP_SECRET = Deno.env.get("OTP_SECRET") || SUPABASE_SERVICE_ROLE_KEY;
const PIN_RESET_CODE_HASH = Deno.env.get("PIN_RESET_CODE_HASH")
  || Deno.env.get("MASTER_PIN_RESET_HASH")
  || "";
const EMAIL_RELAY_URL = (Deno.env.get("EMAIL_RELAY_URL") || Deno.env.get("ZERO_COST_EMAIL_RELAY_URL") || "").trim();
const EMAIL_RELAY_TOKEN = (
  Deno.env.get("EMAIL_RELAY_TOKEN")
  || Deno.env.get("ZERO_COST_EMAIL_RELAY_TOKEN")
  || Deno.env.get("GATEWAY_TOKEN")
  || ""
).trim();
const ZERO_COST_EMAILS_DISABLED = String(Deno.env.get("ZERO_COST_EMAILS_DISABLED") || "").toLowerCase() === "true";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_TABLES = new Set([
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
  "doppio_aggregator_config",
  "doppio_online_orders",
  "doppio_table_layout",
  "doppio_waitlist",
  "doppio_tax_rates",
  "doppio_table_sessions",
]);

/**
 * Operation-level module ACL.
 * - read: SELECT
 * - write: INSERT / UPDATE / UPSERT / DELETE (still combined with TABLE_WRITE_ROLES for staff)
 *
 * POS must be able to SELL without full history dumps:
 * bills write includes pos-tab; bills read does NOT (only bills/reports/tax modules).
 */
type TableAccess = { read: string[]; write: string[] };
const TABLE_ACCESS: Record<string, TableAccess> = {
  doppio_aggregator_config: {
    read: ["editor-tab", "online-tab", "aggregator-tab", "growth-hub-tab"],
    write: ["editor-tab", "aggregator-tab", "growth-hub-tab"],
  },
  doppio_online_orders: {
    read: ["pos-tab", "online-tab", "aggregator-tab", "growth-hub-tab", "qr-orders-tab"],
    write: ["pos-tab", "online-tab", "aggregator-tab", "qr-orders-tab"],
  },
  doppio_table_layout: {
    read: ["pos-tab", "floor-tab", "growth-hub-tab"],
    write: ["floor-tab", "growth-hub-tab"],
  },
  doppio_table_sessions: {
    read: ["pos-tab", "floor-tab", "growth-hub-tab"],
    write: ["pos-tab", "floor-tab"],
  },
  doppio_business_profile: {
    // POS needs tax/settings snapshot to bill; writes stay admin-only below
    read: ["pos-tab", "editor-tab", "employees-tab", "reports-tab", "tax-tab"],
    write: ["editor-tab", "employees-tab"],
  },
  doppio_waitlist: {
    read: ["pos-tab", "crm-tab", "customers-tab", "growth-hub-tab", "floor-tab"],
    write: ["pos-tab", "customers-tab", "growth-hub-tab", "floor-tab"],
  },
  doppio_menu: {
    read: ["pos-tab", "editor-tab", "kds-tab", "floor-tab", "online-tab", "aggregator-tab", "qr-orders-tab", "tokens-tab"],
    write: ["editor-tab"],
  },
  // Inventory READ is module-only; POS still deducts via deduct_inventory RPC
  doppio_inventory: {
    read: ["inventory-tab", "editor-tab"],
    write: ["inventory-tab", "editor-tab", "pos-tab"],
  },
  doppio_inventory_batches: {
    read: ["inventory-tab"],
    write: ["inventory-tab", "pos-tab"],
  },
  doppio_inventory_thresholds: {
    read: ["inventory-tab"],
    write: ["inventory-tab"],
  },
  // CRITICAL split: pos-tab may CREATE bills, not dump full history
  doppio_bills: {
    read: ["bills-tab", "reports-tab", "tax-tab"],
    write: ["pos-tab", "bills-tab"],
  },
  doppio_pending_orders: {
    read: ["pos-tab", "qr-orders-tab", "kds-tab", "tokens-tab", "online-tab", "aggregator-tab", "floor-tab"],
    write: ["pos-tab", "qr-orders-tab", "kds-tab", "floor-tab", "online-tab", "aggregator-tab"],
  },
  doppio_shifts: {
    read: ["pos-tab", "employees-tab", "reports-tab"],
    write: ["pos-tab", "employees-tab"],
  },
  doppio_shift_events: {
    read: ["pos-tab", "employees-tab"],
    write: ["pos-tab", "employees-tab"],
  },
  doppio_employees: {
    read: ["employees-tab"],
    write: ["employees-tab"],
  },
  doppio_leave_requests: {
    read: ["employees-tab"],
    write: ["employees-tab"],
  },
  doppio_attendance: {
    read: ["employees-tab"],
    write: ["employees-tab", "pos-tab"],
  },
  // CRM directory is customers module; POS may only write walk-in touch
  doppio_crm: {
    read: ["crm-tab", "customers-tab"],
    write: ["pos-tab", "crm-tab", "customers-tab"],
  },
  doppio_notifications: {
    read: ["pos-tab", "qr-orders-tab", "inventory-tab", "employees-tab", "kds-tab"],
    write: ["pos-tab", "qr-orders-tab", "inventory-tab", "employees-tab", "kds-tab"],
  },
  doppio_custom_recipes: {
    read: ["editor-tab", "inventory-tab", "pos-tab"],
    write: ["editor-tab", "inventory-tab"],
  },
  doppio_pos_popularity: {
    read: ["pos-tab", "reports-tab"],
    write: ["pos-tab"],
  },
  doppio_draft_orders: {
    read: ["pos-tab", "floor-tab"],
    write: ["pos-tab", "floor-tab"],
  },
  doppio_support_tickets: {
    read: ["growth-hub-tab"],
    write: ["growth-hub-tab", "pos-tab"],
  },
  doppio_onboarding_tasks: {
    read: ["growth-hub-tab"],
    write: ["growth-hub-tab"],
  },
  doppio_reservations: {
    read: ["growth-hub-tab", "qr-orders-tab", "floor-tab", "pos-tab"],
    write: ["growth-hub-tab", "qr-orders-tab", "floor-tab", "pos-tab"],
  },
  doppio_vendors: {
    read: ["growth-hub-tab", "inventory-tab"],
    write: ["growth-hub-tab", "inventory-tab"],
  },
  doppio_purchase_orders: {
    read: ["growth-hub-tab", "inventory-tab"],
    write: ["growth-hub-tab", "inventory-tab"],
  },
  doppio_item_costs: {
    read: ["growth-hub-tab", "inventory-tab", "reports-tab", "editor-tab"],
    write: ["growth-hub-tab", "inventory-tab", "editor-tab"],
  },
  doppio_offers: {
    read: ["growth-hub-tab", "crm-tab", "customers-tab", "pos-tab"],
    write: ["growth-hub-tab", "crm-tab"],
  },
  doppio_refund_requests: {
    read: ["growth-hub-tab", "bills-tab"],
    write: ["growth-hub-tab", "bills-tab", "pos-tab"],
  },
  doppio_device_setups: {
    read: ["growth-hub-tab"],
    write: ["growth-hub-tab"],
  },
  doppio_backup_snapshots: {
    read: ["growth-hub-tab"],
    write: ["growth-hub-tab"],
  },
  doppio_outlets: {
    read: ["growth-hub-tab", "reports-tab"],
    write: ["growth-hub-tab"],
  },
  doppio_migration_status: {
    read: ["growth-hub-tab"],
    write: ["growth-hub-tab"],
  },
  doppio_saas_invoices: {
    read: ["growth-hub-tab"],
    write: ["growth-hub-tab"],
  },
  doppio_tax_rates: {
    read: ["pos-tab", "tax-tab", "editor-tab"],
    write: ["tax-tab", "editor-tab"],
  },
};

// Legacy alias used by ROLE_DEFAULT_TABS admin flatten
const TABLE_TAB_ACCESS: Record<string, string[]> = Object.fromEntries(
  Object.entries(TABLE_ACCESS).map(([k, v]) => [k, [...new Set([...v.read, ...v.write])]]),
);

/** Non-admin roles allowed to mutate each table (admin/manager always can write). */
const TABLE_WRITE_ROLES: Record<string, string[]> = {
  doppio_menu: ["inventory"],
  doppio_inventory: ["cashier", "inventory", "waiter", "captain"],
  doppio_inventory_batches: ["cashier", "inventory"],
  doppio_inventory_thresholds: ["inventory"],
  doppio_bills: ["cashier", "waiter", "captain"],
  doppio_pending_orders: ["cashier", "kitchen", "waiter", "captain"],
  doppio_shifts: ["cashier", "waiter", "captain"],
  doppio_shift_events: ["cashier", "waiter", "captain"],
  doppio_crm: ["cashier", "waiter", "captain"],
  doppio_notifications: ["cashier", "kitchen", "waiter", "captain"],
  doppio_pos_popularity: ["cashier", "waiter", "captain"],
  doppio_draft_orders: ["cashier", "waiter", "captain"],
  doppio_support_tickets: ["cashier", "kitchen", "waiter", "captain"],
  doppio_reservations: ["cashier", "waiter", "captain"],
  doppio_table_sessions: ["cashier", "waiter", "captain"],
  doppio_table_layout: ["waiter", "captain", "cashier"],
  doppio_attendance: ["cashier", "waiter"],
  doppio_refund_requests: ["cashier"],
  doppio_offers: [],
  doppio_custom_recipes: ["inventory"],
};

function tabsAllow(userTabs: string[], need: string[]): boolean {
  if (!need || !need.length) return false;
  return need.some((t) => userTabs.includes(t));
}

/** Strip PIN / reset secrets from settings payload for cashiers, waiters, kitchen, etc. */
function scrubFeatureFlags(flags: unknown): Record<string, unknown> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof flags === "string"
      ? (JSON.parse(flags) || {})
      : (flags && typeof flags === "object" ? { ...(flags as Record<string, unknown>) } : {});
  } catch {
    parsed = {};
  }
  delete parsed.pin_reset_code_hash;
  delete parsed.master_pin_reset_hash;
  delete parsed.admin_pin_hash;
  delete parsed.admin_pin;
  if (parsed.ui_settings && typeof parsed.ui_settings === "object") {
    const ui = { ...(parsed.ui_settings as Record<string, unknown>) };
    const hadPin = !!(ui.admin_pin_hash || ui.admin_pin);
    delete ui.admin_pin_hash;
    delete ui.admin_pin;
    delete ui.pin_reset_code_hash;
    delete ui.master_pin_reset_hash;
    // Signal that a PIN exists without leaking the hash (offline admin devices bank hash only when admin)
    if (hadPin) ui.admin_pin_configured = true;
    parsed.ui_settings = ui;
  }
  return parsed;
}

function sanitizeBusinessProfileForStaff(data: unknown): unknown {
  if (data == null) return data;
  const scrubOne = (row: Record<string, unknown>) => {
    const next = { ...row };
    if (next.feature_flags != null) {
      next.feature_flags = scrubFeatureFlags(next.feature_flags);
    }
    // Hard-delete any top-level secret-ish fields if present on older schemas
    delete next.admin_pin_hash;
    delete next.admin_pin;
    delete next.pin_reset_code_hash;
    delete next.master_pin_reset_hash;
    return next;
  };
  if (Array.isArray(data)) {
    return data.map((row) =>
      row && typeof row === "object" ? scrubOne(row as Record<string, unknown>) : row
    );
  }
  if (typeof data === "object") {
    return scrubOne(data as Record<string, unknown>);
  }
  return data;
}

function canAccessTableOp(
  table: string,
  operation: string,
  userTabs: string[],
  actorRole: string,
): { ok: boolean; error?: string } {
  const access = TABLE_ACCESS[table];
  // Tables without an ACL entry: deny by default (was open before)
  if (!access) {
    if (actorRole === "admin" || actorRole === "manager" || actorRole === "owner") {
      return { ok: true };
    }
    return { ok: false, error: "You do not have permission to access this module." };
  }
  const isMutate = operation !== "select";
  const need = isMutate ? access.write : access.read;
  if (!tabsAllow(userTabs, need)) {
    return {
      ok: false,
      error: isMutate
        ? "Your role cannot change this data."
        : "You do not have permission to view this module.",
    };
  }
  return { ok: true };
}

// Wave 2: raise caps so multi-month outlets don't silently truncate bills/CRM.
// Still capped to protect free-tier egress; use sales_summary for full aggregates.
const ZERO_COST_DEFAULT_LIMIT = 250;
const ZERO_COST_MAX_LIMIT = 500;

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status || "active"));
}

function planFor(code: unknown) {
  return sharedPlanFor(code);
}

function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGIN }),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function broadcastTenantDataChange(tenantId: string, table: string, operation: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const topic = `rs-tenant-${tenantId}`;
  try {
    const response = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, "")}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/tenant-data-changed`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ table, operation, at: new Date().toISOString() }),
      },
    );
    if (!response.ok) {
      console.error("tenant-data realtime broadcast failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("tenant-data realtime broadcast error:", error);
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split("").map((char) => char.charCodeAt(0)));
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

// Constant-time string comparison — prevents timing side-channel attacks on
// HMAC signature comparison. A naive !== short-circuits on the first
// mismatched byte, leaking the expected signature one byte at a time.
function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomOtp() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000));
}

function normalizePhoneDigits(raw: string) {
  return String(raw || "").replace(/\D/g, "");
}

function normalizeEmail(raw: string) {
  return String(raw || "").trim().toLowerCase();
}

function maskPhone(phone: string) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 4) return "****";
  return `***${digits.slice(-4)}`;
}

function maskEmail(email: string) {
  const e = normalizeEmail(email);
  const at = e.indexOf("@");
  if (at < 1) return e ? "***" : "";
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}***@${domain}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** OTP hash — subject is tenantId for pin reset (binds challenge to outlet). */
async function otpCodeHash(challengeId: string, subject: string, code: string, purpose: string) {
  return sha256Hex(`otp:${purpose}:${challengeId}:${subject}:${code}:${OTP_SECRET}`);
}

async function phoneHash(phone: string) {
  return sha256Hex(`phone:${phone}`);
}

async function getTenantPinResetHash(tenantId: string) {
  if (PIN_RESET_CODE_HASH) return PIN_RESET_CODE_HASH;

  const { data, error } = await supabaseAdmin
    .from("doppio_business_profile")
    .select("feature_flags")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("tenant-data PIN reset hash lookup failed:", error);
    return "";
  }

  try {
    const flags = typeof data?.feature_flags === "string"
      ? JSON.parse(data.feature_flags)
      : (data?.feature_flags || {});
    return String(
      flags.pin_reset_code_hash
      || flags.master_pin_reset_hash
      || flags.master_pin_hash
      || "",
    );
  } catch {
    return "";
  }
}

async function loadTenantOwnerContacts(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, email, phone")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("tenant-data owner contact lookup failed:", error);
    return null;
  }
  if (!data) return null;
  return {
    id: String(data.id),
    name: String(data.name || "your outlet"),
    slug: String(data.slug || ""),
    email: normalizeEmail(String(data.email || "")),
    phone: normalizePhoneDigits(String(data.phone || "")),
  };
}

async function sendAdminPinResetWhatsApp(phone: string, otpCode: string, outletName: string) {
  const { url, token } = getGatewayUrlAndToken();
  if (!url || !token) {
    console.warn("Admin PIN reset WhatsApp skipped — gateway not configured.");
    return false;
  }
  const message = [
    "*RestroSuite*",
    "Admin PIN reset code",
    "",
    `Outlet: *${outletName}*`,
    `Your code is: *${otpCode}*`,
    "",
    "Valid for 10 minutes.",
    "Never share this code. RestroSuite staff will never ask for it.",
    "",
    "— CodeArc Tech Labs",
  ].join("\n");
  const gwController = new AbortController();
  const gwTimer = setTimeout(() => gwController.abort(), 45000);
  try {
    const gwRes = await fetch(`${url}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Tenant-Id": "system",
      },
      body: JSON.stringify({ phone, message }),
      signal: gwController.signal,
    });
    if (!gwRes.ok) {
      const gwErr = await gwRes.text().catch(() => "");
      console.error("Admin PIN reset WhatsApp failed:", gwRes.status, gwErr.slice(0, 200));
      return false;
    }
    return true;
  } finally {
    clearTimeout(gwTimer);
  }
}

async function sendAdminPinResetEmail(email: string, otpCode: string, outletName: string) {
  if (ZERO_COST_EMAILS_DISABLED || !EMAIL_RELAY_URL) {
    console.warn("Admin PIN reset email skipped — email relay not configured.");
    return false;
  }
  try {
    const response = await fetch(EMAIL_RELAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(EMAIL_RELAY_TOKEN ? { "Authorization": `Bearer ${EMAIL_RELAY_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        to: email,
        subject: "RestroSuite Admin PIN reset code",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1f2937">
            <h2>Reset your Admin PIN</h2>
            <p>A PIN reset was requested for <strong>${escapeHtml(outletName)}</strong>.</p>
            <p style="font-size:28px;letter-spacing:8px;font-weight:800;margin:24px 0">${escapeHtml(otpCode)}</p>
            <p>Enter this code in the RestroSuite Console. Valid for 10 minutes.</p>
            <p>If you did not request it, ignore this email — your PIN is unchanged.</p>
          </div>
        `,
      }),
    });
    if (!response.ok) {
      console.error("Admin PIN reset email relay failed:", response.status);
      return false;
    }
    const result = await response.json().catch(() => ({} as Record<string, unknown>));
    return result.status === "success" || result.status === "ok" || result.ok === true;
  } catch (e) {
    console.error("Admin PIN reset email error:", e);
    return false;
  }
}

function getGatewayUrlAndToken() {
  let url = Deno.env.get("WHATSAPP_GATEWAY_URL") || Deno.env.get("GATEWAY_URL") || "";
  const token = Deno.env.get("WHATSAPP_GATEWAY_TOKEN") || Deno.env.get("GATEWAY_TOKEN") || Deno.env.get("GATEWAY_AUTH_TOKEN") || Deno.env.get("EMAIL_RELAY_TOKEN") || "";
  // Optional public tunnel from secrets only — never hardcode free ngrok hosts
  // (they expire). Set WHATSAPP_GATEWAY_URL or NGROK_GATEWAY_URL in Supabase.
  const publicTunnel = (Deno.env.get("NGROK_GATEWAY_URL") || "").trim().replace(/\/+$/, "");

  // Prefer production host from secrets (local PC gateway is primary when set).
  if (!url && publicTunnel) {
    url = publicTunnel;
  }

  url = url.trim().replace(/\/+$/, "");

  // Edge runs in the cloud — localhost / 127.0.0.1 can never reach the PC gateway.
  // Rewrite private URLs to the configured public tunnel when available.
  try {
    if (!url) return { url: "", token: token.trim() };
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local")) {
      if (publicTunnel) {
        console.warn(`[gateway] Rejecting private URL ${url}; using public tunnel ${publicTunnel}`);
        url = publicTunnel;
      } else {
        console.warn(`[gateway] Rejecting private URL ${url}; set WHATSAPP_GATEWAY_URL or NGROK_GATEWAY_URL`);
        url = "";
      }
    }
  } catch (_) {
    url = publicTunnel || "";
  }

  return { url, token: token.trim() };
}

async function proxyGatewayRequest(path: string, method: "GET" | "POST", req: Request, bodyData?: Record<string, unknown>, tenantId?: string) {
  const { url, token } = getGatewayUrlAndToken();
  if (!url) {
    return jsonResponse({ error: "WhatsApp gateway URL is not configured (set WHATSAPP_GATEWAY_URL / NGROK_GATEWAY_URL)." }, 503, req);
  }
  const targetUrl = `${url}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Free ngrok interstitials break JSON fetch from Edge — skip the browser warning page.
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "RestroSuite-Edge-GatewayProxy/1.0",
  };
  if (token) {
    headers["Authorization"] = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  }
  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }

  try {
    const controller = new AbortController();
    // PDF sends need headroom; status polls should not hang the UI.
    const timeoutMs = path.startsWith("/send") ? 45000 : 12000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // ngrok HTML interstitial or non-JSON error body
      const snippet = String(text || "").replace(/\s+/g, " ").slice(0, 180);
      return jsonResponse({
        error: `Gateway returned non-JSON (HTTP ${response.status}). Is ngrok pointing at the PC gateway? ${snippet}`,
      }, 502, req);
    }

    if (!response.ok) {
      return jsonResponse({ error: (json as { error?: string }).error || `Gateway returned status ${response.status}` , gateway: json }, response.status, req);
    }

    return jsonResponse({ data: json }, 200, req);
  } catch (err: any) {
    console.error(`Gateway proxy error for ${targetUrl}:`, err);
    return jsonResponse({ error: `Failed to connect to gateway: ${err.message || err}` }, 502, req);
  }
}


async function verifyTenantSession(req: Request) {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Session signing secret is not configured." };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { ok: false, error: "Missing tenant session token." };

  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (!timingSafeEqualString(expectedSignature, signature)) return { ok: false, error: "Invalid session token." };

  try {
    const payloadText = new TextDecoder().decode(decodeBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText);
    if (!Object.hasOwn(ROLE_DEFAULT_TABS, String(payload.role || ""))) {
      return { ok: false, error: "Tenant session required." };
    }
    if (!payload.exp || Date.now() > Number(payload.exp)) return { ok: false, error: "Session expired. Please log in again." };

    const { data: tenant, error } = await supabaseAdmin
      .from("saas_tenants")
      .select("id, status, allowed_tabs, plan_code, subscription_status, auth_version")
      .eq("id", String(payload.tenant_id || ""))
      .maybeSingle();

    if (error) {
      console.error("tenant-data session lookup failed:", error);
      return { ok: false, error: "Failed to validate tenant session." };
    }

    if (!tenant) return { ok: false, error: "Workspace no longer exists." };
    if (tenant.status !== "approved") return { ok: false, error: "Workspace access is not active." };
    if (!activeSubscription(tenant.subscription_status)) return { ok: false, error: "Workspace subscription is not active." };

    const tenantTabs = effectiveTenantTabs(tenant.allowed_tabs, tenant.plan_code);

    const userId = String(payload.user_id || "");
    if (userId) {
      const { data: staffUser, error: staffError } = await supabaseAdmin
        .from("tenant_users")
        .select("id, username, role, allowed_tabs, status, session_version")
        .eq("id", userId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (staffError) {
        console.error("tenant-data staff session lookup failed:", staffError);
        return { ok: false, error: "Failed to validate staff session." };
      }
      if (!staffUser || staffUser.status !== "active") {
        return { ok: false, error: "Staff account is no longer active." };
      }
      if (
        Number(payload.session_version) !== Number(staffUser.session_version)
        || String(payload.role) !== staffUser.role
      ) {
        return { ok: false, error: "Session was revoked. Please log in again." };
      }

      return {
        ok: true,
        tenantId: tenant.id,
        allowedTabs: effectiveTabs(staffUser.role, staffUser.allowed_tabs, tenantTabs),
        actorUserId: staffUser.id,
        actorUsername: staffUser.username,
        actorRole: staffUser.role,
      };
    }

    if (payload.role !== "admin" || payload.legacy_owner !== true) {
      return { ok: false, error: "Invalid tenant session." };
    }
    if (Number(payload.auth_version) !== Number(tenant.auth_version)) {
      return { ok: false, error: "Session was revoked. Please log in again." };
    }

    return {
      ok: true,
      tenantId: tenant.id,
      allowedTabs: tenantTabs,
      actorUserId: null,
      actorUsername: String(payload.username || "owner"),
      actorRole: "admin",
    };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

// Shared catalog tables that are not tenant-scoped on live (legacy shape).
// Select returns global rows; writes do not force tenant_id.
const GLOBAL_TABLES = new Set<string>([
  "doppio_tax_rates",
]);

function withTenantId(input: unknown, tenantId: string, table?: string) {
  if (table && GLOBAL_TABLES.has(table)) {
    if (Array.isArray(input)) {
      return input.map((row) => ({ ...(row && typeof row === "object" ? row : {}) }));
    }
    return { ...(input && typeof input === "object" ? input as Record<string, unknown> : {}) };
  }
  if (Array.isArray(input)) {
    return input.map((row) => ({ ...(row && typeof row === "object" ? row : {}), tenant_id: tenantId }));
  }
  return { ...(input && typeof input === "object" ? input as Record<string, unknown> : {}), tenant_id: tenantId };
}

function withoutTenantId(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const { tenant_id: _ignoredTenantId, ...safeInput } = input as Record<string, unknown>;
  return safeInput;
}

function applyFilters(query: any, filters: unknown[], tenantId: string, table?: string) {
  let nextQuery = (table && GLOBAL_TABLES.has(table)) ? query : query.eq("tenant_id", tenantId);
  for (const filter of filters) {
    if (!filter || typeof filter !== "object") continue;
    const typed = filter as Record<string, unknown>;
    const column = String(typed.column || "");
    if (!column || column === "tenant_id") continue;
    if (typed.operator === "in" && Array.isArray(typed.value)) {
      nextQuery = nextQuery.in(column, typed.value);
    } else if (
      typed.operator === "not"
      && typed.comparisonOperator === "in"
      && typeof typed.value === "string"
    ) {
      nextQuery = nextQuery.not(column, "in", typed.value);
    } else {
      nextQuery = nextQuery.eq(column, typed.value);
    }
  }
  return nextQuery;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, req);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Tenant data backend is not configured." }, 500, req);
  }

  const verified = await verifyTenantSession(req);
  if (!verified.ok) return jsonResponse({ error: verified.error as string }, 401, req);

  try {
    const payload = await req.json();
    const table = String(payload.table || "");
    const operation = String(payload.operation || "");

    const actorRole = String(verified.actorRole || "").toLowerCase();
    const isOutletAdmin = actorRole === "admin" || actorRole === "manager" || actorRole === "owner";
    const tabsForOps = (verified.allowedTabs as string[]) || [];

    // WhatsApp gateway control is owner/manager only — never waiter/kitchen tokens
    if (
      operation === "gateway_status" ||
      operation === "gateway_logout" ||
      operation === "gateway_reset" ||
      operation === "gateway_logs"
    ) {
      if (!isOutletAdmin) {
        return jsonResponse({ error: "Only outlet admins can manage the WhatsApp gateway." }, 403, req);
      }
      if (operation === "gateway_status") {
        return await proxyGatewayRequest("/status", "GET", req, undefined, verified.tenantId);
      }
      if (operation === "gateway_logout") {
        return await proxyGatewayRequest("/logout", "POST", req, undefined, verified.tenantId);
      }
      if (operation === "gateway_reset") {
        return await proxyGatewayRequest("/reset", "POST", req, undefined, verified.tenantId);
      }
      return await proxyGatewayRequest(
        "/debug-logs?tenantId=" + encodeURIComponent(String(verified.tenantId)),
        "GET",
        req,
        undefined,
        verified.tenantId,
      );
    }
    if (operation === "gateway_send") {
      // Receipts from POS need send; destructive gateway_reset above is admin-only.
      // Super-admin / brand_admin: platform ads & ops via central WhatsApp line (system).
      const isPlatformAdmin =
        actorRole === "superadmin" ||
        actorRole === "super_admin" ||
        actorRole === "brand_admin" ||
        actorRole === "brandadmin";
      const canSend =
        isPlatformAdmin ||
        isOutletAdmin ||
        tabsForOps.includes("pos-tab") ||
        tabsForOps.includes("bills-tab") ||
        actorRole === "cashier";
      if (!canSend) {
        return jsonResponse({ error: "Your role cannot send WhatsApp messages." }, 403, req);
      }
      const phone = String(payload.phone || "");
      const message = String(payload.message || "");
      const caption = payload.caption != null ? String(payload.caption) : undefined;
      const orderId = String(payload.orderId || "");
      const pdfData = payload.pdfData ? String(payload.pdfData) : undefined;
      const filename = payload.filename ? String(payload.filename) : undefined;
      const imageData = payload.imageData ? String(payload.imageData) : undefined;
      const imageMime = payload.imageMime ? String(payload.imageMime) : undefined;
      const imageFilename = payload.imageFilename ? String(payload.imageFilename) : undefined;
      if (!phone || (!message && !pdfData && !caption && !imageData)) {
        return jsonResponse({ error: "Missing phone or message/media data." }, 400, req);
      }
      // Ads / platform blasts always go through the central system WhatsApp line.
      const forceSystem = payload.via_platform === true || payload.via_system === true || isPlatformAdmin;
      const sendAsTenantId = forceSystem ? "system" : verified.tenantId;
      return await proxyGatewayRequest(
        "/send",
        "POST",
        req,
        { phone, message, caption, orderId, pdfData, filename, imageData, imageMime, imageFilename },
        sendAsTenantId,
      );
    }

    // Wave 7: server-side bill search (history beyond client cache cap)
    if (operation === "search_bills") {
      const tabs = tabsForOps;
      // Not every POS user — bills/reports modules or billing roles only
      const canSearch = tabs.includes("bills-tab")
        || tabs.includes("reports-tab")
        || verified.actorRole === "admin"
        || verified.actorRole === "manager"
        || verified.actorRole === "cashier"
        || verified.actorRole === "owner";
      if (!canSearch) {
        return jsonResponse({ error: "Your role cannot search bills." }, 403, req);
      }
      const rawQ = String(payload.q || payload.query || "").trim().slice(0, 80);
      const limit = Math.min(100, Math.max(1, Number(payload.limit) || 50));
      // Strip PostgREST wildcard / filter metacharacters from user input
      const safe = rawQ.replace(/[%_,.*()]/g, " ").replace(/\s+/g, " ").trim();
      let query = supabaseAdmin
        .from("doppio_bills")
        .select("*")
        .eq("tenant_id", verified.tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (safe.length >= 1) {
        // Quote patterns so spaces/special chars are safe for PostgREST filters
        const pat = `"%${safe.replace(/"/g, "")}%"`;
        query = query.or(
          [
            `"orderId".ilike.${pat}`,
            `"customerName".ilike.${pat}`,
            `"customerPhone".ilike.${pat}`,
            `"tableNumber".ilike.${pat}`,
            `"paymentMethod".ilike.${pat}`,
          ].join(","),
        );
      }
      const { data, error } = await query;
      if (error) {
        console.error("search_bills failed:", error);
        return jsonResponse({ error: error.message || "Could not search bills." }, 500, req);
      }
      return jsonResponse({ data: { rows: data || [], q: safe, limit } }, 200, req);
    }

    // Wave 2: server-side sales aggregates (reports without loading every bill)
    if (operation === "sales_summary") {
      const canSummary =
        isOutletAdmin ||
        tabsForOps.includes("reports-tab") ||
        tabsForOps.includes("analytics-tab") ||
        tabsForOps.includes("bills-tab");
      if (!canSummary) {
        return jsonResponse({ error: "Your role cannot view sales summaries." }, 403, req);
      }
      const days = Math.max(1, Math.min(365, Number(payload.days) || 30));
      const { data, error } = await supabaseAdmin.rpc("rs_sales_summary", {
        p_tenant_id: verified.tenantId,
        p_days: days,
      });
      if (error) {
        console.error("sales_summary rpc failed:", error);
        return jsonResponse({ error: error.message || "Could not load sales summary." }, 500, req);
      }
      return jsonResponse({ data }, 200, req);
    }

    // Wave 2: multi-device bill sequence (atomic counter in Postgres)
    if (operation === "next_bill_no") {
      const canBillNo =
        isOutletAdmin ||
        tabsForOps.includes("pos-tab") ||
        tabsForOps.includes("bills-tab") ||
        actorRole === "cashier" ||
        actorRole === "waiter" ||
        actorRole === "captain";
      if (!canBillNo) {
        return jsonResponse({ error: "Your role cannot allocate bill numbers." }, 403, req);
      }
      const day = payload.day != null ? String(payload.day) : null;
      const { data, error } = await supabaseAdmin.rpc("rs_next_bill_no", {
        p_tenant_id: verified.tenantId,
        p_day: day,
      });
      if (error) {
        console.error("next_bill_no rpc failed:", error);
        return jsonResponse({ error: error.message || "Could not allocate bill number." }, 500, req);
      }
      return jsonResponse({ data: { no: data, order_id: data } }, 200, req);
    }

    // Wave 2: atomic, idempotent inventory deduction by bill_key
    if (operation === "deduct_inventory") {
      const tabs = (verified.allowedTabs as string[]) || [];
      const canBill = tabs.includes("pos-tab")
        || tabs.includes("bills-tab")
        || verified.actorRole === "admin"
        || verified.actorRole === "manager"
        || verified.actorRole === "cashier"
        || verified.actorRole === "owner";
      if (!canBill) {
        return jsonResponse({ error: "Your role cannot deduct inventory." }, 403, req);
      }
      const billKey = String(payload.bill_key || payload.billKey || payload.idempotencyKey || "").trim();
      const orderId = String(payload.order_id || payload.orderId || payload.no || "").trim();
      const lines = Array.isArray(payload.lines) ? payload.lines : [];
      if (!billKey) {
        return jsonResponse({ error: "Missing bill_key for inventory deduction." }, 400, req);
      }
      const { data, error } = await supabaseAdmin.rpc("rs_deduct_inventory", {
        p_tenant_id: verified.tenantId,
        p_bill_key: billKey,
        p_lines: lines,
        p_order_id: orderId,
      });
      if (error) {
        console.error("deduct_inventory rpc failed:", error);
        return jsonResponse({ error: error.message || "Inventory deduction failed." }, 500, req);
      }
      try {
        await broadcastTenantDataChange(verified.tenantId as string, "doppio_inventory", "update");
      } catch (_) { /* non-fatal */ }
      return jsonResponse({ data }, 200, req);
    }

    // ── Admin PIN reset via OTP (WhatsApp / email to owner contact on file) ──
    if (operation === "request_pin_reset_otp") {
      if (!isOutletAdmin) {
        return jsonResponse({ error: "Only outlet admins or managers can reset the Admin PIN." }, 403, req);
      }
      const tenantId = String(verified.tenantId || "");
      if (!tenantId) {
        return jsonResponse({ error: "Outlet session is missing." }, 400, req);
      }

      // Rate limit: 5 OTP sends per tenant per 10 minutes
      const otpBucket = await sha256Hex(`admin_pin_reset_otp:${tenantId}`);
      const { data: rlData, error: rlErr } = await supabaseAdmin.rpc("consume_api_rate_limit", {
        p_bucket: otpBucket,
        p_limit: 5,
        p_window_seconds: 600,
      });
      if (rlErr || !rlData) {
        return jsonResponse({ error: "Too many PIN reset requests. Wait a few minutes and try again." }, 429, req);
      }

      const tenant = await loadTenantOwnerContacts(tenantId);
      if (!tenant) {
        return jsonResponse({ error: "Could not load outlet contact details." }, 500, req);
      }
      const phone = tenant.phone;
      const email = tenant.email;
      if (phone.length < 10 && !email) {
        return jsonResponse({
          error: "No owner WhatsApp or email is on file for this outlet. Update the registration phone/email or contact RestroSuite support.",
          code: "NO_OWNER_CONTACT",
        }, 400, req);
      }

      const code = randomOtp();
      const challengeId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      // Bind OTP to this tenant so a code cannot unlock another outlet
      const codeHash = await otpCodeHash(challengeId, tenantId, code, "admin_pin_reset");
      const pHash = phone.length >= 10
        ? await phoneHash(phone)
        : await sha256Hex(`tenant:${tenantId}:admin_pin_reset`);

      const { error: challengeError } = await supabaseAdmin.from("public_otp_challenges").insert({
        id: challengeId,
        phone_hash: pHash,
        purpose: "admin_pin_reset",
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      if (challengeError) {
        console.error("request_pin_reset_otp challenge insert failed:", challengeError);
        // Common cause: purpose check constraint not migrated yet
        const hint = /purpose|check constraint|violates/i.test(String(challengeError.message || ""))
          ? " Database migration for admin_pin_reset OTP is required."
          : "";
        return jsonResponse({ error: `Failed to create PIN reset code.${hint}` }, 500, req);
      }

      let deliveredWhatsapp = false;
      let deliveredEmail = false;
      if (phone.length >= 10) {
        deliveredWhatsapp = await sendAdminPinResetWhatsApp(phone, code, tenant.name);
      }
      if (email) {
        deliveredEmail = await sendAdminPinResetEmail(email, code, tenant.name);
      }

      if (!deliveredWhatsapp && !deliveredEmail) {
        await supabaseAdmin.from("public_otp_challenges")
          .update({ used_at: new Date().toISOString() })
          .eq("id", challengeId);
        return jsonResponse({
          error: phone.length >= 10
            ? "Could not send the code via WhatsApp or email. Check the gateway is online and try again."
            : "Could not send the code by email. Configure email delivery or add a WhatsApp number to this outlet.",
          code: "DELIVERY_FAILED",
        }, 502, req);
      }

      try {
        await supabaseAdmin.from("tenant_audit_logs").insert({
          tenant_id: tenantId,
          actor_user_id: verified.actorUserId,
          actor_username: verified.actorUsername,
          actor_role: verified.actorRole,
          action: "security.pin_reset_otp_sent",
          target_type: "doppio_business_profile",
          metadata: {
            channels: { whatsapp: deliveredWhatsapp, email: deliveredEmail },
            masked_phone: phone.length >= 10 ? maskPhone(phone) : null,
            masked_email: email ? maskEmail(email) : null,
          },
        });
      } catch (_) { /* non-fatal */ }

      return jsonResponse({
        data: {
          sent: true,
          challenge_id: challengeId,
          expires_at: expiresAt,
          masked_phone: phone.length >= 10 ? maskPhone(phone) : null,
          masked_email: email ? maskEmail(email) : null,
          channels: { whatsapp: deliveredWhatsapp, email: deliveredEmail },
          message: deliveredWhatsapp && deliveredEmail
            ? "Code sent to WhatsApp and email on file."
            : deliveredWhatsapp
              ? "Code sent to the owner WhatsApp on file."
              : "Code sent to the owner email on file.",
        },
      }, 200, req);
    }

    if (operation === "verify_pin_reset_otp") {
      if (!isOutletAdmin) {
        return jsonResponse({ error: "Only outlet admins or managers can reset the Admin PIN." }, 403, req);
      }
      const tenantId = String(verified.tenantId || "");
      const challengeId = String(payload.challenge_id || "").trim();
      const code = String(payload.otp_code || payload.code || "").replace(/\D/g, "");
      if (!challengeId || code.length !== 6) {
        return jsonResponse({ error: "Enter the 6-digit code from WhatsApp or email." }, 400, req);
      }

      const { data: challenge, error: chErr } = await supabaseAdmin
        .from("public_otp_challenges")
        .select("id, purpose, code_hash, expires_at, attempts, used_at")
        .eq("id", challengeId)
        .maybeSingle();

      if (chErr) {
        console.error("verify_pin_reset_otp lookup failed:", chErr);
        return jsonResponse({ error: "PIN reset verification is unavailable. Try again." }, 500, req);
      }
      if (
        !challenge
        || challenge.purpose !== "admin_pin_reset"
        || challenge.used_at
        || Date.now() > new Date(challenge.expires_at).getTime()
      ) {
        return jsonResponse({ error: "This code is invalid or has expired. Request a new one." }, 400, req);
      }

      const attempts = Number(challenge.attempts || 0);
      if (attempts >= 5) {
        return jsonResponse({ error: "Too many incorrect attempts. Request a new code." }, 429, req);
      }

      const expected = await otpCodeHash(challengeId, tenantId, code, "admin_pin_reset");
      if (!timingSafeEqualString(expected, String(challenge.code_hash || ""))) {
        await supabaseAdmin.from("public_otp_challenges")
          .update({ attempts: attempts + 1 })
          .eq("id", challengeId)
          .is("used_at", null);
        return jsonResponse({ error: "Incorrect code. Check WhatsApp or email and try again." }, 400, req);
      }

      const { data: claimed, error: claimError } = await supabaseAdmin
        .from("public_otp_challenges")
        .update({ used_at: new Date().toISOString(), attempts: attempts + 1 })
        .eq("id", challengeId)
        .is("used_at", null)
        .select("id")
        .maybeSingle();

      if (claimError || !claimed) {
        return jsonResponse({ error: "This code was already used. Request a new one." }, 409, req);
      }

      const { error: auditError } = await supabaseAdmin.from("tenant_audit_logs").insert({
        tenant_id: tenantId,
        actor_user_id: verified.actorUserId,
        actor_username: verified.actorUsername,
        actor_role: verified.actorRole,
        action: "security.pin_reset_otp_verified",
        target_type: "doppio_business_profile",
      });
      if (auditError) console.error("tenant-data PIN reset OTP audit log failed:", auditError);

      // Client clears admin_pin_hash and prompts setup after valid:true
      return jsonResponse({ data: { valid: true } }, 200, req);
    }

    // Legacy static reset code (optional back-door if PIN_RESET_CODE_HASH / feature_flags set)
    if (operation === "verify_pin_reset_code") {
      if (!isOutletAdmin) {
        return jsonResponse({ error: "Only outlet admins can use PIN reset codes." }, 403, req);
      }
      const code = String(payload.code || "").trim();
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) {
        return jsonResponse({ error: "Invalid reset code." }, 400, req);
      }

      const expectedHash = await getTenantPinResetHash(verified.tenantId as string);
      if (!expectedHash) {
        return jsonResponse({
          error: "Static PIN reset codes are not used. Use Forgot PIN to receive an OTP on WhatsApp/email.",
          code: "USE_OTP_RESET",
        }, 503, req);
      }

      const providedHash = await sha256Hex(code);
      if (!timingSafeEqualString(providedHash, expectedHash)) {
        return jsonResponse({ error: "Invalid reset code." }, 403, req);
      }

      const { error: auditError } = await supabaseAdmin.from("tenant_audit_logs").insert({
        tenant_id: verified.tenantId,
        actor_user_id: verified.actorUserId,
        actor_username: verified.actorUsername,
        actor_role: verified.actorRole,
        action: "security.pin_reset_verified",
        target_type: "doppio_business_profile",
      });
      if (auditError) console.error("tenant-data PIN reset audit log failed:", auditError);

      return jsonResponse({ data: { valid: true } }, 200, req);
    }

    if (!TENANT_TABLES.has(table)) return jsonResponse({ error: "Table is not available through tenant data API." }, 400, req);

    const filters = Array.isArray(payload.filters) ? payload.filters : [];
    const columns = typeof payload.columns === "string" && payload.columns.trim() ? payload.columns : "*";

    // Operation-level ACL (POS write ≠ full module read)
    const userTabs = (verified.allowedTabs as string[]) || [];
    if (isOutletAdmin) {
      // admins pass tab check
    } else {
      const access = canAccessTableOp(table, operation, userTabs, actorRole);
      if (!access.ok) {
        return jsonResponse({ error: access.error || "Permission denied." }, 403, req);
      }
    }
    // Outlet settings / PIN material: only admins may write
    if (
      table === "doppio_business_profile" &&
      operation !== "select" &&
      actorRole !== "admin" &&
      actorRole !== "manager" &&
      actorRole !== "owner"
    ) {
      return jsonResponse({ error: "Only outlet admins can change business settings." }, 403, req);
    }
    if (
      operation !== "select"
      && verified.actorRole !== "admin"
      && verified.actorRole !== "manager"
      && verified.actorRole !== "owner"
      && !(TABLE_WRITE_ROLES[table] || []).includes(verified.actorRole as string)
    ) {
      return jsonResponse({ error: "Your role has read-only access to this module." }, 403, req);
    }

    let query: any;
    if (operation === "select") {
      query = applyFilters(supabaseAdmin.from(table).select(columns), filters, verified.tenantId as string, table);
      if (payload.order && typeof payload.order === "object") {
        const order = payload.order as Record<string, unknown>;
        query = query.order(String(order.column || "id"), { ascending: order.ascending !== false });
      }
      const requestedLimit = payload.limit !== null && payload.limit !== undefined ? Number(payload.limit) : NaN;
      // Full history only for bills/CRM module holders; POS never needs 1000-row dumps
      const hasHistoryModule =
        userTabs.includes("bills-tab") ||
        userTabs.includes("reports-tab") ||
        userTabs.includes("customers-tab") ||
        userTabs.includes("crm-tab") ||
        isOutletAdmin;
      const tableDefault = (table === "doppio_bills" || table === "doppio_crm")
        ? (hasHistoryModule ? Math.min(1000, ZERO_COST_MAX_LIMIT) : Math.min(50, ZERO_COST_DEFAULT_LIMIT))
        : ZERO_COST_DEFAULT_LIMIT;
      const safeLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, ZERO_COST_MAX_LIMIT)
        : tableDefault;
      const offset = payload.offset !== null && payload.offset !== undefined ? Number(payload.offset) : 0;
      if (Number.isFinite(offset) && offset > 0) {
        query = query.range(offset, offset + safeLimit - 1);
      } else {
        query = query.limit(safeLimit);
      }
      if (payload.single === true) query = query.single();
      if (payload.maybeSingle === true) query = query.maybeSingle();
    } else if (operation === "insert") {
      query = supabaseAdmin.from(table).insert(withTenantId(payload.data, verified.tenantId as string, table));
      if (payload.returning) query = query.select(columns);
    } else if (operation === "upsert") {
      const options = payload.options && typeof payload.options === "object" ? payload.options : {};
      const conflictColumns = String((options as Record<string, unknown>).onConflict || "")
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);
      if (!GLOBAL_TABLES.has(table) && !conflictColumns.includes("tenant_id")) {
        return jsonResponse({ error: "Tenant upserts must use a tenant-scoped conflict key." }, 400, req);
      }
      query = supabaseAdmin.from(table).upsert(withTenantId(payload.data, verified.tenantId as string, table), options);
      if (payload.returning) query = query.select(columns);
    } else if (operation === "update") {
      const safeUpdate = withoutTenantId(payload.data);
      if (Object.keys(safeUpdate).length === 0) {
        return jsonResponse({ error: "No valid fields were provided for update." }, 400, req);
      }
      query = applyFilters(supabaseAdmin.from(table).update(safeUpdate), filters, verified.tenantId as string, table);
      if (payload.returning) query = query.select(columns);
    } else if (operation === "delete") {
      query = applyFilters(supabaseAdmin.from(table).delete(), filters, verified.tenantId as string, table);
    } else {
      return jsonResponse({ error: "Unsupported data operation." }, 400, req);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`tenant-data ${operation} failed for ${table}:`, error);
      return jsonResponse({ error: error.message || "Tenant data operation failed." }, 500, req);
    }

    if (operation !== "select") {
      const { error: auditError } = await supabaseAdmin.from("tenant_audit_logs").insert({
        tenant_id: verified.tenantId,
        actor_user_id: verified.actorUserId,
        actor_username: verified.actorUsername,
        actor_role: verified.actorRole,
        action: `data.${operation}`,
        target_type: table,
        metadata: {
          filters,
          returning: payload.returning === true,
        },
      });
      if (auditError) console.error("tenant-data audit log failed:", auditError);
      await broadcastTenantDataChange(verified.tenantId as string, table, operation);
    }

    // Never send PIN hashes / reset secrets to non-admin staff (POS still gets tax UI flags)
    let safeData = data;
    if (table === "doppio_business_profile" && !isOutletAdmin) {
      safeData = sanitizeBusinessProfileForStaff(data);
    }

    return jsonResponse({ data: safeData }, 200, req);
  } catch (error) {
    console.error("tenant-data function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
