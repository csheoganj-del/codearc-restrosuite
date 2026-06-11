import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://codearc-restrosuite.vercel.app";
// Exact-match origin allowlist. Add extra origins (e.g. preview deploys, custom domain)
// via ALLOWED_ORIGINS="https://app.example.com,https://preview.example.com".
// SECURITY: never use suffix matches like .endsWith(".vercel.app") — any attacker can
// host a page on *.vercel.app and make credentialed cross-origin calls from victims.
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || ALLOWED_ORIGIN)
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
ALLOWED_ORIGINS.add(ALLOWED_ORIGIN.replace(/\/+$/, ""));

function getCorsHeaders(req: Request) {
  const origin = (req.headers.get("origin") || "").replace(/\/+$/, "");
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGIN;
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
const EMAIL_RELAY_URL = Deno.env.get("EMAIL_RELAY_URL") || "";
const EMAIL_RELAY_TOKEN = Deno.env.get("EMAIL_RELAY_TOKEN") || "";
const PUBLIC_APP_URL = (Deno.env.get("PUBLIC_APP_URL") || ALLOWED_ORIGIN).replace(/\/+$/, "");
const ZERO_COST_EMAILS_DISABLED = (Deno.env.get("ZERO_COST_EMAILS_DISABLED") || "false") === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

if (!SUPERADMIN_SESSION_SECRET) {
  console.error("Missing SUPERADMIN_SESSION_SECRET environment variable. All logins will fail with HTTP 500.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_ALLOWED_TABS = [
  "pos-tab",
  "qr-orders-tab",
  "bills-tab",
  "inventory-tab",
  "reports-tab",
  "editor-tab",
  "crm-tab",
  "tax-tab",
  "online-tab",
  "kds-tab",
  "tokens-tab",
  "employees-tab",
  "growth-hub-tab",
];

const ROLE_DEFAULT_TABS: Record<string, string[]> = {
  admin: DEFAULT_ALLOWED_TABS,
  cashier: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab"],
  kitchen: ["kds-tab"],
  waiter: ["qr-orders-tab"],
  customer_display: ["tokens-tab"],
};

const PLAN_ENTITLEMENTS: Record<string, { name: string; maxStaff: number; monthlyOrderLimit: number; allowedTabs: string[] }> = {
  starter: {
    name: "Starter",
    maxStaff: 5,
    monthlyOrderLimit: 300,
    allowedTabs: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "editor-tab", "kds-tab", "tokens-tab", "employees-tab", "growth-hub-tab"],
  },
  growth: {
    name: "Growth",
    maxStaff: 15,
    monthlyOrderLimit: 8000,
    allowedTabs: DEFAULT_ALLOWED_TABS,
  },
  enterprise: {
    name: "Enterprise",
    maxStaff: 75,
    monthlyOrderLimit: 100000,
    allowedTabs: DEFAULT_ALLOWED_TABS,
  },
};

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status || "active"));
}

function planFor(code: unknown) {
  return PLAN_ENTITLEMENTS[String(code || "starter")] || PLAN_ENTITLEMENTS.starter;
}

function effectiveTenantTabs(tenantTabs: unknown, planCode: unknown) {
  const planTabs = planFor(planCode).allowedTabs;
  const requestedTabs = Array.isArray(tenantTabs) && tenantTabs.length > 0
    ? tenantTabs.map(String)
    : planTabs;
  return requestedTabs.filter((tab) => planTabs.includes(tab));
}

function effectiveTabs(role: string, userTabs: unknown, tenantTabs: unknown) {
  const roleTabs = ROLE_DEFAULT_TABS[role] || [];
  const requestedTabs = Array.isArray(userTabs) && userTabs.length > 0
    ? userTabs.map(String)
    : roleTabs;
  const enabledTenantTabs = Array.isArray(tenantTabs) ? tenantTabs.map(String) : [];
  return requestedTabs.filter((tab) => roleTabs.includes(tab) && enabledTenantTabs.includes(tab));
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

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function checkRateLimit(req: Request, action: string) {
  const rules: Record<string, { limit: number; windowSeconds: number }> = {
    check_slug: { limit: 60, windowSeconds: 60 },
    login: { limit: 10, windowSeconds: 15 * 60 },
    register: { limit: 5, windowSeconds: 60 * 60 },
    request_recovery: { limit: 5, windowSeconds: 60 * 60 },
    reset_password: { limit: 10, windowSeconds: 60 * 60 },
  };
  const rule = rules[action];
  if (!rule) return { allowed: true };

  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const clientAddress = forwardedFor.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const bucket = await sha256Hex(`tenant-access:${action}:${clientAddress}`);
  const { data, error } = await supabaseAdmin.rpc("consume_api_rate_limit", {
    p_bucket: bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    console.error("tenant-access rate limit failed:", error);
    return { allowed: false, unavailable: true };
  }
  return { allowed: data === true };
}

function randomBase64Url(byteLength = 18) {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function hashPassword(password: string) {
  const iterations = 210000;
  const salt = randomBase64Url();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations,
    },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${salt}$${encodeBase64Url(new Uint8Array(derived))}`;
}

async function verifyPassword(password: string, storedHash: string) {
  if (!storedHash.startsWith("pbkdf2$")) {
    return await sha256Hex(password) === storedHash;
  }

  const [, iterationText, salt, expected] = storedHash.split("$");
  const iterations = Number(iterationText);
  if (!iterations || !salt || !expected) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations,
    },
    key,
    256,
  );
  return encodeBase64Url(new Uint8Array(derived)) === expected;
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

async function createSignedSessionToken(payload: Record<string, unknown>) {
  if (!SUPERADMIN_SESSION_SECRET) return null;
  const payloadEncoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    ...payload,
    exp: Date.now() + (8 * 60 * 60 * 1000),
  })));
  const signature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  return `${payloadEncoded}.${signature}`;
}

async function verifySignedSessionToken(token: string) {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Session signing secret is not configured." };
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (expectedSignature !== signature) return { ok: false, error: "Invalid session token." };

  try {
    const payloadText = new TextDecoder().decode(decodeBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText);
    if (!payload.exp || Date.now() > Number(payload.exp)) return { ok: false, error: "Session expired. Please log in again." };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase();
}

function normalizeUsername(raw: string) {
  return raw.trim();
}

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendRecoveryEmail(email: string, tenant: Record<string, unknown>, token: string) {
  if (ZERO_COST_EMAILS_DISABLED || !EMAIL_RELAY_URL) {
    console.warn("Credential recovery email skipped because email delivery is not configured.");
    return false;
  }
  const resetUrl = `${PUBLIC_APP_URL}/login.html?recovery=${encodeURIComponent(token)}`;
  const response = await fetch(EMAIL_RELAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(EMAIL_RELAY_TOKEN ? { "Authorization": `Bearer ${EMAIL_RELAY_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      to: email,
      subject: "RestoSuite credential recovery",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1f2937">
          <h2>Reset your RestoSuite password</h2>
          <p>A credential recovery request was received for <strong>${escapeHtml(tenant.name || "your outlet")}</strong>.</p>
          <p><strong>Outlet ID:</strong> ${escapeHtml(tenant.slug)}<br><strong>Username:</strong> ${escapeHtml(tenant.username)}</p>
          <p><a href="${resetUrl}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Set a new password</a></p>
          <p>This link expires in 30 minutes and can be used once. If you did not request it, ignore this email.</p>
        </div>
      `,
    }),
  });
  if (!response.ok) throw new Error(`Recovery relay failed with HTTP ${response.status}.`);
  const result = await response.json().catch(() => ({}));
  if (!(result.status === "success" || result.status === "ok" || result.ok === true)) {
    throw new Error("Recovery relay rejected the message.");
  }
  return true;
}

async function handleRequestRecovery(payload: Record<string, unknown>, req: Request) {
  const slug = normalizeSlug(String(payload.slug || ""));
  const email = normalizeEmail(String(payload.email || ""));
  const generic = {
    success: true,
    message: "If the outlet ID and registered owner email match, a recovery link will be sent shortly.",
  };
  if (!email) return jsonResponse(generic, 200, req);

  let query = supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, email, status")
    .eq("email", email)
    .eq("status", "approved")
    .limit(5);
  if (slug) query = query.eq("slug", slug);
  const { data: tenants, error } = await query;
  if (error) {
    console.error("recovery lookup failed:", error);
    return jsonResponse(generic, 200, req);
  }
  if (!tenants || tenants.length === 0) {
    return jsonResponse(generic, 200, req);
  }

  const clientAddress = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
  const ipHash = await sha256Hex(clientAddress);
  await supabaseAdmin.from("tenant_password_resets").delete().lt("expires_at", new Date().toISOString());
  for (const tenant of tenants) {
    const rawToken = randomBase64Url(32);
    const tokenHash = await sha256Hex(rawToken);
    await supabaseAdmin.from("tenant_password_resets").delete().eq("tenant_id", tenant.id).is("used_at", null);
    const { error: insertError } = await supabaseAdmin.from("tenant_password_resets").insert({
      tenant_id: tenant.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      requested_ip_hash: ipHash,
    });
    if (insertError) {
      console.error("recovery token insert failed:", insertError);
      continue;
    }
    try {
      await sendRecoveryEmail(email, tenant, rawToken);
    } catch (deliveryError) {
      console.error("recovery email failed:", deliveryError);
    }
  }
  return jsonResponse(generic, 200, req);
}

async function handleResetPassword(payload: Record<string, unknown>, req: Request) {
  const token = String(payload.token || "").trim();
  const password = String(payload.password || "");
  if (!token || password.length < 10) {
    return jsonResponse({ error: "A valid recovery link and a password of at least 10 characters are required." }, 400, req);
  }
  const tokenHash = await sha256Hex(token);
  const { data: reset, error } = await supabaseAdmin
    .from("tenant_password_resets")
    .select("id, tenant_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !reset || reset.used_at || Date.now() > new Date(reset.expires_at).getTime()) {
    return jsonResponse({ error: "This recovery link is invalid or has expired." }, 400, req);
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("tenant_password_resets")
    .update({ used_at: now })
    .eq("id", reset.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return jsonResponse({ error: "This recovery link has already been used." }, 409, req);

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("saas_tenants")
    .select("auth_version, username")
    .eq("id", reset.tenant_id)
    .maybeSingle();
  if (tenantError || !tenant) {
    return jsonResponse({ error: "Password reset failed. Please request a new link." }, 500, req);
  }
  const { error: updateError } = await supabaseAdmin
    .from("saas_tenants")
    .update({
      password_hash: await hashPassword(password),
      auth_version: Number(tenant.auth_version || 1) + 1,
    })
    .eq("id", reset.tenant_id);
  if (updateError) {
    console.error("password recovery update failed:", updateError);
    return jsonResponse({ error: "Password reset failed. Please request a new link." }, 500, req);
  }
  const { data: ownerUser } = await supabaseAdmin
    .from("tenant_users")
    .select("id, session_version")
    .eq("tenant_id", reset.tenant_id)
    .eq("username_normalized", String(tenant.username || "").trim().toLowerCase())
    .eq("role", "admin")
    .maybeSingle();
  if (ownerUser) {
    const { error: ownerUpdateError } = await supabaseAdmin.from("tenant_users").update({
      password_hash: await hashPassword(password),
      session_version: Number(ownerUser.session_version || 1) + 1,
      updated_at: now,
    }).eq("id", ownerUser.id);
    if (ownerUpdateError) {
      console.error("migrated owner password recovery update failed:", ownerUpdateError);
      return jsonResponse({ error: "Password reset was incomplete. Please contact support." }, 500, req);
    }
  }
  return jsonResponse({ success: true, message: "Password updated. You can now sign in with the new password." }, 200, req);
}

async function handleCheckSlug(slug: string, req: Request) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return jsonResponse({ available: false, error: "Invalid outlet ID format." }, 400, req);
  }

  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("check_slug failed:", error);
    return jsonResponse({ available: false, error: "Availability check failed." }, 500, req);
  }

  return jsonResponse({ available: !data }, 200, req);
}

async function handleLogin(payload: Record<string, unknown>, req: Request) {
  const slug = normalizeSlug(String(payload.slug || ""));
  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");

  if (!slug || !username || !password) {
    return jsonResponse({ error: "Outlet ID, username, and password are required." }, 400);
  }

  const superadminUsername = Deno.env.get("SUPERADMIN_USERNAME") || "";
  const superadminPasswordHash = Deno.env.get("SUPERADMIN_PASSWORD_HASH") || "";

  if (
    superadminUsername &&
    superadminPasswordHash &&
    slug === "superadmin" &&
    username.toLowerCase() === superadminUsername.toLowerCase()
  ) {
    if (await verifyPassword(password, superadminPasswordHash)) {
      const adminToken = await createSignedSessionToken({
        role: "superadmin",
        username,
      });
      return jsonResponse({
        session: {
          username,
          role: "superadmin",
          tenant_id: "superadmin",
          tenant_slug: "superadmin",
          tenant_name: "SaaS Platform Owner",
          allowed_tabs: ["super-admin-tab", "gateway-monitor-tab"],
          admin_token: adminToken,
        },
      });
    }
  }

  const { data: tenant, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, password_hash, status, allowed_tabs, data_reset_at, plan_code, subscription_status, subscription_current_period_end, auth_version")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("login lookup failed:", error);
    return jsonResponse({ error: "Authentication service unavailable." }, 500);
  }

  if (!tenant) {
    return jsonResponse({ error: "Authentication Failed: Invalid Outlet ID." }, 401);
  }

  if (tenant.status === "pending") {
    return jsonResponse({ error: "Access Denied: Your registration request is pending CodeArc approval." }, 403);
  }

  if (tenant.status === "suspended") {
    return jsonResponse({ error: "Access Denied: Account suspended. Please contact CodeArc support." }, 403);
  }

  if (!activeSubscription(tenant.subscription_status)) {
    return jsonResponse({ error: "Access Denied: Subscription is not active. Please contact CodeArc support." }, 402);
  }

  const tenantTabs = effectiveTenantTabs(tenant.allowed_tabs, tenant.plan_code);
  const plan = planFor(tenant.plan_code);

  const usernameNormalized = username.toLowerCase();
  const { data: staffUser, error: staffError } = await supabaseAdmin
    .from("tenant_users")
    .select("id, username, display_name, password_hash, role, allowed_tabs, status, session_version")
    .eq("tenant_id", tenant.id)
    .eq("username_normalized", usernameNormalized)
    .maybeSingle();

  if (staffError) {
    console.error("staff login lookup failed:", staffError);
    return jsonResponse({ error: "Authentication service unavailable." }, 500);
  }

  if (staffUser) {
    if (staffUser.status !== "active") {
      return jsonResponse({ error: "Access Denied: Staff account is suspended." }, 403);
    }
    if (!await verifyPassword(password, staffUser.password_hash)) {
      return jsonResponse({ error: "Access Denied: Invalid Username or Password for this Outlet." }, 401);
    }

    if (!staffUser.password_hash.startsWith("pbkdf2$")) {
      await supabaseAdmin
        .from("tenant_users")
        .update({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() })
        .eq("id", staffUser.id);
    }

    const allowedTabs = effectiveTabs(staffUser.role, staffUser.allowed_tabs, tenantTabs);
    const sessionToken = await createSignedSessionToken({
      role: staffUser.role,
      username: staffUser.username,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      user_id: staffUser.id,
      session_version: staffUser.session_version,
    });

    if (!sessionToken) {
      return jsonResponse({ error: "Authentication service is misconfigured: session signing secret is missing. Please contact support." }, 500);
    }

    await supabaseAdmin
      .from("tenant_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", staffUser.id);

    await supabaseAdmin.from("tenant_audit_logs").insert({
      tenant_id: tenant.id,
      actor_user_id: staffUser.id,
      actor_username: staffUser.username,
      actor_role: staffUser.role,
      action: "auth.login",
      target_type: "tenant_user",
      target_id: staffUser.id,
    });

    return jsonResponse({
      session: {
        username: staffUser.username,
        display_name: staffUser.display_name,
        user_id: staffUser.id,
        role: staffUser.role,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        tenant_name: tenant.name,
        allowed_tabs: allowedTabs,
        data_reset_at: tenant.data_reset_at || null,
        plan_code: tenant.plan_code || "starter",
        plan_name: plan.name,
        subscription_status: tenant.subscription_status || "active",
        subscription_current_period_end: tenant.subscription_current_period_end || null,
        plan_limits: {
          max_staff: plan.maxStaff,
          monthly_order_limit: plan.monthlyOrderLimit,
        },
        session_token: sessionToken,
      },
    });
  }

  const usernameMatches = username === tenant.username;
  const passwordMatches = await verifyPassword(password, tenant.password_hash);

  if (!usernameMatches || !passwordMatches) {
    return jsonResponse({ error: "Access Denied: Invalid Username or Password for this Outlet." }, 401);
  }

  if (!tenant.password_hash.startsWith("pbkdf2$")) {
    const upgradedHash = await hashPassword(password);
    const { error: upgradeError } = await supabaseAdmin
      .from("saas_tenants")
      .update({ password_hash: upgradedHash })
      .eq("id", tenant.id);
    if (upgradeError) console.warn("Failed to upgrade tenant password hash:", upgradeError.message);
  }

  const sessionToken = await createSignedSessionToken({
    role: "admin",
    username,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    legacy_owner: true,
    auth_version: tenant.auth_version,
  });

  if (!sessionToken) {
    return jsonResponse({ error: "Authentication service is misconfigured: session signing secret is missing. Please contact support." }, 500);
  }

  return jsonResponse({
    session: {
      username,
      role: "admin",
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      allowed_tabs: tenantTabs,
      data_reset_at: tenant.data_reset_at || null,
      plan_code: tenant.plan_code || "starter",
      plan_name: plan.name,
      subscription_status: tenant.subscription_status || "active",
      subscription_current_period_end: tenant.subscription_current_period_end || null,
      plan_limits: {
        max_staff: plan.maxStaff,
        monthly_order_limit: plan.monthlyOrderLimit,
      },
      session_token: sessionToken,
    },
  });
}

async function handleValidateSession(payload: Record<string, unknown>, req: Request) {
  const token = String(payload.session_token || "");
  const verified = await verifySignedSessionToken(token);
  if (!verified.ok) return jsonResponse({ error: verified.error }, 401);

  const sessionPayload = verified.payload as Record<string, unknown>;
  if (sessionPayload.role === "superadmin") {
    return jsonResponse({
      session: {
        username: String(sessionPayload.username || "superadmin"),
        role: "superadmin",
        tenant_id: "superadmin",
        tenant_slug: "superadmin",
        tenant_name: "SaaS Platform Owner",
        allowed_tabs: ["super-admin-tab", "gateway-monitor-tab"],
      },
    });
  }

  const tenantId = String(sessionPayload.tenant_id || "");
  if (!tenantId) return jsonResponse({ error: "Invalid tenant session." }, 401);

  const { data: tenant, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, status, allowed_tabs, data_reset_at, plan_code, subscription_status, subscription_current_period_end, auth_version")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("validate_session lookup failed:", error);
    return jsonResponse({ error: "Failed to validate session." }, 500);
  }

  if (!tenant) return jsonResponse({ error: "Workspace no longer exists." }, 401);
  if (tenant.status !== "approved") return jsonResponse({ error: "Workspace access is not active." }, 403);
  if (!activeSubscription(tenant.subscription_status)) return jsonResponse({ error: "Workspace subscription is not active." }, 402);
  const userId = String(sessionPayload.user_id || "");
  if (!userId && Number(sessionPayload.auth_version) !== Number(tenant.auth_version)) {
    return jsonResponse({ error: "Session was revoked. Please log in again." }, 401);
  }

  const tenantTabs = effectiveTenantTabs(tenant.allowed_tabs, tenant.plan_code);
  const plan = planFor(tenant.plan_code);

  if (userId) {
    const { data: staffUser, error: staffError } = await supabaseAdmin
      .from("tenant_users")
      .select("id, username, display_name, role, allowed_tabs, status, session_version")
      .eq("id", userId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (staffError) {
      console.error("validate staff session lookup failed:", staffError);
      return jsonResponse({ error: "Failed to validate staff session." }, 500);
    }
    if (!staffUser || staffUser.status !== "active") {
      return jsonResponse({ error: "Staff account is no longer active." }, 401);
    }
    if (Number(sessionPayload.session_version) !== Number(staffUser.session_version)) {
      return jsonResponse({ error: "Session was revoked. Please log in again." }, 401);
    }

    return jsonResponse({
      session: {
        username: staffUser.username,
        display_name: staffUser.display_name,
        user_id: staffUser.id,
        role: staffUser.role,
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        tenant_name: tenant.name,
        allowed_tabs: effectiveTabs(staffUser.role, staffUser.allowed_tabs, tenantTabs),
        data_reset_at: tenant.data_reset_at || null,
        plan_code: tenant.plan_code || "starter",
        plan_name: plan.name,
        subscription_status: tenant.subscription_status || "active",
        subscription_current_period_end: tenant.subscription_current_period_end || null,
        plan_limits: {
          max_staff: plan.maxStaff,
          monthly_order_limit: plan.monthlyOrderLimit,
        },
      },
    });
  }

  return jsonResponse({
    session: {
      username: tenant.username,
      role: "admin",
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      allowed_tabs: tenantTabs,
      data_reset_at: tenant.data_reset_at || null,
      plan_code: tenant.plan_code || "starter",
      plan_name: plan.name,
      subscription_status: tenant.subscription_status || "active",
      subscription_current_period_end: tenant.subscription_current_period_end || null,
      plan_limits: {
        max_staff: plan.maxStaff,
        monthly_order_limit: plan.monthlyOrderLimit,
      },
    },
  });
}

async function handleRegister(payload: Record<string, unknown>, req: Request) {
  const name = String(payload.name || "").trim();
  const slug = normalizeSlug(String(payload.slug || ""));
  const outletType = String(payload.outlet_type || "cafe").trim().toLowerCase();
  const email = normalizeEmail(String(payload.email || ""));
  const phone = String(payload.phone || "").trim();
  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");

  if (!name || !slug || !username || !password) {
    return jsonResponse({ error: "Outlet name, outlet ID, username, and password are required." }, 400);
  }

  if (password.length < 10) {
    return jsonResponse({ error: "Password must be at least 10 characters." }, 400);
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return jsonResponse({ error: "Slug can only contain lowercase letters, numbers, and hyphens." }, 400);
  }

  const { data: existingSlug, error: slugErr } = await supabaseAdmin
    .from("saas_tenants")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (slugErr) {
    console.error("register slug check failed:", slugErr);
    return jsonResponse({ error: "Failed to validate unique slug." }, 500);
  }

  if (existingSlug) {
    return jsonResponse({ error: `The Outlet ID "${slug}" is already taken. Try another unique slug.` }, 409);
  }

  const { data: existingUsername, error: userErr } = await supabaseAdmin
    .from("saas_tenants")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (userErr) {
    console.error("register username check failed:", userErr);
    return jsonResponse({ error: "Failed to validate username uniqueness." }, 500);
  }

  if (existingUsername) {
    return jsonResponse({ error: `The username "${username}" is already in use. Choose another username.` }, 409);
  }

  const passwordHash = await hashPassword(password);
  const { error: insertErr } = await supabaseAdmin.from("saas_tenants").insert({
    name,
    slug,
    outlet_type: outletType,
    email,
    phone,
    username,
    password_hash: passwordHash,
    status: "pending",
    allowed_tabs: planFor("starter").allowedTabs,
  });

  if (insertErr) {
    console.error("register insert failed:", insertErr);
    return jsonResponse({ error: "Registration failed. Please try again." }, 500);
  }

  return jsonResponse({
    success: true,
    message: "Registration submitted successfully! Please wait for CodeArc to approve your account.",
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, req);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Backend auth function is not configured." }, 500, req);
  }

  try {
    const payload = await req.json();
    const action = String(payload?.action || "");
    const rateLimit = await checkRateLimit(req, action);
    if (!rateLimit.allowed) {
      return jsonResponse(
        { error: rateLimit.unavailable ? "Authentication protection is unavailable." : "Too many requests. Please try again later." },
        rateLimit.unavailable ? 503 : 429,
        req,
      );
    }

    if (action === "check_slug") {
      return await handleCheckSlug(normalizeSlug(String(payload.slug || "")), req);
    }

    if (action === "login") {
      return await handleLogin(payload, req);
    }

    if (action === "validate_session") {
      return await handleValidateSession(payload, req);
    }

    if (action === "register") {
      return await handleRegister(payload, req);
    }

    if (action === "request_recovery") {
      return await handleRequestRecovery(payload, req);
    }

    if (action === "reset_password") {
      return await handleResetPassword(payload, req);
    }

    return jsonResponse({ error: "Unsupported action." }, 400, req);
  } catch (error) {
    console.error("tenant-access function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
