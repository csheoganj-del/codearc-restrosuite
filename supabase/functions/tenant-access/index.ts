import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPERADMIN_SESSION_SECRET = Deno.env.get("SUPERADMIN_SESSION_SECRET") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
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
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
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

async function handleCheckSlug(slug: string) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return jsonResponse({ available: false, error: "Invalid outlet ID format." }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("check_slug failed:", error);
    return jsonResponse({ available: false, error: "Availability check failed." }, 500);
  }

  return jsonResponse({ available: !data });
}

async function handleLogin(payload: Record<string, unknown>) {
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
    .select("id, name, slug, username, password_hash, status, allowed_tabs, data_reset_at")
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
    return jsonResponse({ error: "Access Denied: Account suspended. Please contact hello@codearc.co.in" }, 403);
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
  });

  return jsonResponse({
    session: {
      username,
      role: "admin",
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      allowed_tabs: Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs : [],
      data_reset_at: tenant.data_reset_at || null,
      session_token: sessionToken,
    },
  });
}

async function handleValidateSession(payload: Record<string, unknown>) {
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
    .select("id, name, slug, username, status, allowed_tabs, data_reset_at")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("validate_session lookup failed:", error);
    return jsonResponse({ error: "Failed to validate session." }, 500);
  }

  if (!tenant) return jsonResponse({ error: "Workspace no longer exists." }, 401);
  if (tenant.status !== "approved") return jsonResponse({ error: "Workspace access is not active." }, 403);

  return jsonResponse({
    session: {
      username: tenant.username,
      role: "admin",
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      allowed_tabs: Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs : [],
      data_reset_at: tenant.data_reset_at || null,
    },
  });
}

async function handleRegister(payload: Record<string, unknown>) {
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
    allowed_tabs: DEFAULT_ALLOWED_TABS,
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
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Backend auth function is not configured." }, 500);
  }

  try {
    const payload = await req.json();
    const action = String(payload?.action || "");

    if (action === "check_slug") {
      return await handleCheckSlug(normalizeSlug(String(payload.slug || "")));
    }

    if (action === "login") {
      return await handleLogin(payload);
    }

    if (action === "validate_session") {
      return await handleValidateSession(payload);
    }

    if (action === "register") {
      return await handleRegister(payload);
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("tenant-access function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});
