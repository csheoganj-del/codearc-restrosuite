import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ROLE_DEFAULT_TABS,
  planFor,
  effectiveTenantTabs,
  effectiveTabs,
  ALL_MODULE_TABS,
} from "../_shared/role-defaults.ts";
import {
  issueAndDeliverInvoice,
  makeInvoiceNumber,
  planDisplayName,
} from "../_shared/billing-invoice.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://restrosuite.codearc.co.in";
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
// Built-in product hosts (always allow even if secret not updated yet)
for (const o of [
  "https://restrosuite.codearc.co.in",
  "https://restrosuite-live.vercel.app",
  "https://codearc-restrosuite.vercel.app",
  // Android WebViewAssetLoader offline shell
  "https://appassets.androidplatform.net",
  // Electron desktop local server
  "http://localhost:8001",
  "http://127.0.0.1:8001",
]) {
  ALLOWED_ORIGINS.add(o);
}

function getCorsHeaders(req: Request) {
  const origin = (req.headers.get("origin") || "").replace(/\/+$/, "");
  // No Origin header (some WebViews / same-origin tooling) — reflect default app host
  const allowed = !origin
    ? ALLOWED_ORIGIN
    : (ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGIN);
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

const DEFAULT_ALLOWED_TABS = ALL_MODULE_TABS;

function activeSubscription(status: unknown) {
  // past_due = soft renew fail while days may still remain (handled with period check)
  return ["active", "trialing", "past_due"].includes(String(status || "active").toLowerCase());
}

/** True when period end is still in the future (or missing → treat as open). */
function periodStillOpen(endIso: string | null | undefined): boolean {
  if (!endIso) return true;
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(endMs)) return true;
  return Date.now() <= endMs;
}

/**
 * Safety net: never lock a tenant that still has paid/trial days because a
 * Razorpay subscription was cancelled (mandate abandon, admin cancel, etc.).
 * Returns healed row fields to use for the rest of the request.
 */
async function healFalseSuspendIfNeeded(tenant: {
  id: string;
  status?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
}): Promise<{
  status: string;
  subscription_status: string;
  healed: boolean;
}> {
  const status = String(tenant.status || "");
  const sub = String(tenant.subscription_status || "active").toLowerCase();
  const open = periodStillOpen(tenant.subscription_current_period_end);
  const falseLock =
    open &&
    (status === "suspended" ||
      status === "payment_failed" ||
      sub === "canceled" ||
      sub === "cancelled");

  if (!falseLock) {
    return {
      status: status || "approved",
      subscription_status: sub || "active",
      healed: false,
    };
  }

  const nextStatus = "approved";
  const nextSub = "active";
  try {
    await supabaseAdmin
      .from("saas_tenants")
      .update({
        status: nextStatus,
        subscription_status: nextSub,
        // leave period end and plan alone
      })
      .eq("id", tenant.id);
    console.log(
      `[healFalseSuspend] tenant ${tenant.id} restored (status=${status} sub=${sub} → approved/active)`,
    );
  } catch (e) {
    console.error("[healFalseSuspend] failed", e);
  }
  return { status: nextStatus, subscription_status: nextSub, healed: true };
}

/** No grace: access ends the moment subscription_current_period_end is past. */
function subscriptionAllowsAccess(tenant: {
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
  status?: string | null;
}): { ok: true } | { ok: false; code: string; error: string } {
  // Hard lock only when truly suspended AND period is over (or no period).
  // Paid-period false locks are healed before this runs.
  if (tenant.status === "suspended" || tenant.status === "payment_failed") {
    return {
      ok: false,
      code: "subscription_inactive",
      error:
        "Access Denied: Account suspended. Open Plan & billing to renew, or contact RestroSuite support.",
    };
  }
  const sub = String(tenant.subscription_status || "active").toLowerCase();
  // canceled + still in period is allowed (auto-renew off, days remaining)
  if (sub === "canceled" || sub === "cancelled") {
    if (periodStillOpen(tenant.subscription_current_period_end)) {
      return { ok: true };
    }
    return {
      ok: false,
      code: "subscription_expired",
      error: "Access Denied: Your plan period has ended. Renew now to reopen POS.",
    };
  }
  if (!activeSubscription(tenant.subscription_status)) {
    return {
      ok: false,
      code: "subscription_inactive",
      error: "Access Denied: Subscription is not active. Please renew your plan to continue.",
    };
  }
  const endIso = tenant.subscription_current_period_end;
  if (endIso) {
    const endMs = new Date(endIso).getTime();
    if (Number.isFinite(endMs) && Date.now() > endMs) {
      return {
        ok: false,
        code: "subscription_expired",
        error: "Access Denied: Your plan period has ended. Renew now to reopen POS.",
      };
    }
  }
  return { ok: true };
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

async function otpCodeHash(challengeId: string, phone: string, code: string, purpose: string) {
  return sha256Hex(`otp:${purpose}:${challengeId}:${phone}:${code}:${OTP_SECRET}`);
}

async function phoneHash(phone: string) {
  return sha256Hex(`phone:${phone}`);
}

async function checkRateLimit(req: Request, action: string) {
  const rules: Record<string, { limit: number; windowSeconds: number }> = {
    check_slug: { limit: 60, windowSeconds: 60 },
    login: { limit: 10, windowSeconds: 15 * 60 },
    register: { limit: 5, windowSeconds: 60 * 60 },
    request_recovery: { limit: 5, windowSeconds: 60 * 60 },
    verify_recovery_otp: { limit: 20, windowSeconds: 60 * 60 },
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

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhoneDigits(raw: string) {
  return String(raw || "").replace(/\D/g, "");
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
    // Legacy SHA-256 hashes — compared constant-time, but note SHA-256 alone
    // is unsalted and only kept for backward compatibility during login upgrade.
    return timingSafeEqualString(await sha256Hex(password), storedHash);
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
  return timingSafeEqualString(encodeBase64Url(new Uint8Array(derived)), expected);
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
// HMAC signature and password-derivation comparisons. A naive ===
// short-circuits on the first mismatched byte, leaking information about the
// expected value one byte at a time. Always scans every byte.
function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

// Offline-first POS: long-lived device sessions (not bank-style 8h tabs).
// Keep-me-signed-in + sliding validate_session refresh = no daily password re-entry.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// After hard exp, still allow one validate_session refresh for this window so older
// 8-hour tokens and brief offline periods do not force a password prompt.
const SESSION_STALE_REFRESH_MS = 14 * 24 * 60 * 60 * 1000; // 14 days past exp

async function createSignedSessionToken(payload: Record<string, unknown>, ttlMs = SESSION_TTL_MS) {
  if (!SUPERADMIN_SESSION_SECRET) return null;
  const clean: Record<string, unknown> = { ...payload };
  delete clean.exp;
  delete clean.iat;
  const payloadEncoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    ...clean,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
  })));
  const signature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  return `${payloadEncoded}.${signature}`;
}

async function verifySignedSessionToken(token: string, opts?: { allowStale?: boolean }) {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Session signing secret is not configured." };
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (!timingSafeEqualString(expectedSignature, signature)) return { ok: false, error: "Invalid session token." };

  try {
    const payloadText = new TextDecoder().decode(decodeBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText);
    const exp = Number(payload.exp || 0);
    if (!exp) return { ok: false, error: "Session expired. Please log in again.", code: "session_expired" };
    if (Date.now() > exp) {
      // Sliding / migration refresh path for validate_session only
      if (opts?.allowStale && Date.now() <= exp + SESSION_STALE_REFRESH_MS) {
        return { ok: true, payload, stale: true };
      }
      return { ok: false, error: "Session expired. Please log in again.", code: "session_expired" };
    }
    return { ok: true, payload, stale: false };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

/** Mint a fresh token from verified claims (sliding keep-me-signed-in). */
async function refreshSignedSessionToken(sessionPayload: Record<string, unknown>) {
  const claims: Record<string, unknown> = { ...sessionPayload };
  delete claims.exp;
  delete claims.iat;
  return createSignedSessionToken(claims);
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

async function sendRecoveryEmail(email: string, tenant: Record<string, unknown>, token: string, otpCode: string) {
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
      subject: "RestroSuite password reset code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1f2937">
          <h2>Reset your RestroSuite password</h2>
          <p>A credential recovery request was received for <strong>${escapeHtml(tenant.name || "your outlet")}</strong>.</p>
          <p><strong>Outlet ID:</strong> ${escapeHtml(tenant.slug)}<br><strong>Username:</strong> ${escapeHtml(tenant.username)}</p>
          <p style="font-size:28px;letter-spacing:8px;font-weight:800;margin:24px 0">${escapeHtml(otpCode)}</p>
          <p>Enter this same code in the app (email or WhatsApp — one code works for both). Valid for 10 minutes.</p>
          <p>Or use this one-time link:<br>
            <a href="${resetUrl}" style="display:inline-block;background:#FF4F00;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Set a new password</a>
          </p>
          <p>If you did not request it, ignore this email.</p>
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

async function sendRecoveryWhatsApp(phone: string, otpCode: string) {
  const gatewayUrl = (Deno.env.get("WHATSAPP_GATEWAY_URL") || Deno.env.get("NGROK_GATEWAY_URL") || "").replace(/\/+$/, "");
  const gatewayToken = Deno.env.get("WHATSAPP_GATEWAY_TOKEN") || Deno.env.get("GATEWAY_TOKEN") || "";
  if (!gatewayUrl || !gatewayToken) {
    console.warn("Credential recovery WhatsApp skipped — gateway not configured.");
    return false;
  }
  const message = [
    "*RestroSuite*",
    "Password reset code",
    "",
    `Your code is: *${otpCode}*`,
    "",
    "Same code works for email and WhatsApp.",
    "Valid for 10 minutes.",
    "Never share this code. RestroSuite staff will never ask for it.",
    "",
    "— CodeArc Tech Labs",
  ].join("\n");
  const gwRes = await fetch(`${gatewayUrl}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${gatewayToken}` },
    body: JSON.stringify({ phone, message }),
  });
  if (!gwRes.ok) {
    const gwErr = await gwRes.text();
    throw new Error(`WhatsApp gateway failed: ${gwErr.slice(0, 200)}`);
  }
  return true;
}

async function handleRequestRecovery(payload: Record<string, unknown>, req: Request) {
  const slug = normalizeSlug(String(payload.slug || ""));
  const email = normalizeEmail(String(payload.email || ""));
  const phone = normalizePhoneDigits(String(payload.phone || ""));
  const challengeId = crypto.randomUUID();
  const generic = {
    success: true,
    challenge_id: challengeId,
    message: "If the details match a registered owner account, the same OTP was sent to email and/or WhatsApp.",
  };
  if (!email && phone.length < 10) {
    return jsonResponse(generic, 200, req);
  }

  let query = supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, email, phone, status")
    .eq("status", "approved")
    .limit(20);
  if (slug) {
    query = query.eq("slug", slug);
  } else if (email) {
    query = query.eq("email", email);
  } else if (phone.length >= 10) {
    query = query.ilike("phone", `%${phone.slice(-10)}%`);
  } else {
    return jsonResponse(generic, 200, req);
  }

  const { data: candidates, error } = await query;
  if (error) {
    console.error("recovery lookup failed:", error);
    return jsonResponse(generic, 200, req);
  }

  const tenants = (candidates || []).filter((tenant) => {
    const tenantEmail = normalizeEmail(String(tenant.email || ""));
    const tenantPhone = normalizePhoneDigits(String(tenant.phone || ""));
    const emailOk = email ? tenantEmail === email : true;
    const phoneOk = phone.length >= 10
      ? (tenantPhone === phone || tenantPhone.endsWith(phone) || phone.endsWith(tenantPhone))
      : true;
    if (email && phone.length >= 10) return emailOk || phoneOk;
    if (email) return emailOk;
    return phoneOk;
  });

  if (!tenants.length) {
    return jsonResponse(generic, 200, req);
  }

  const clientAddress = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
  const ipHash = await sha256Hex(clientAddress);
  await supabaseAdmin.from("tenant_password_resets").delete().lt("expires_at", new Date().toISOString());

  // One shared OTP for the first matched outlet (usually unique by email/phone).
  const tenant = tenants[0];
  const otpCode = randomOtp();
  const rawToken = randomBase64Url(32);
  const tokenHash = await sha256Hex(rawToken);
  const otpHash = await otpCodeHash(challengeId, String(tenant.id), otpCode, "recovery");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin.from("tenant_password_resets").delete().eq("tenant_id", tenant.id).is("used_at", null);
  const deliverEmailTo = email || normalizeEmail(String(tenant.email || ""));
  const deliverPhoneTo = phone.length >= 10
    ? phone
    : normalizePhoneDigits(String(tenant.phone || ""));

  let deliveredEmail = false;
  let deliveredWhatsapp = false;

  const { error: insertError } = await supabaseAdmin.from("tenant_password_resets").insert({
    tenant_id: tenant.id,
    token_hash: tokenHash,
    challenge_id: challengeId,
    otp_hash: otpHash,
    otp_attempts: 0,
    expires_at: expiresAt,
    requested_ip_hash: ipHash,
    delivered_email: false,
    delivered_whatsapp: false,
  });
  if (insertError) {
    console.error("recovery token insert failed:", insertError);
    return jsonResponse(generic, 200, req);
  }

  if (deliverEmailTo) {
    try {
      deliveredEmail = await sendRecoveryEmail(deliverEmailTo, tenant, rawToken, otpCode);
    } catch (deliveryError) {
      console.error("recovery email failed:", deliveryError);
    }
  }
  if (deliverPhoneTo.length >= 10) {
    try {
      deliveredWhatsapp = await sendRecoveryWhatsApp(deliverPhoneTo, otpCode);
    } catch (deliveryError) {
      console.error("recovery WhatsApp failed:", deliveryError);
    }
  }

  await supabaseAdmin.from("tenant_password_resets").update({
    delivered_email: deliveredEmail,
    delivered_whatsapp: deliveredWhatsapp,
  }).eq("challenge_id", challengeId);

  return jsonResponse({
    ...generic,
    channels: {
      email: deliveredEmail,
      whatsapp: deliveredWhatsapp,
    },
  }, 200, req);
}

async function handleVerifyRecoveryOtp(payload: Record<string, unknown>, req: Request) {
  const challengeId = String(payload.challenge_id || "").trim();
  const code = String(payload.otp_code || payload.code || "").replace(/\D/g, "");
  if (!challengeId || code.length !== 6) {
    return jsonResponse({ error: "Enter the 6-digit code from email or WhatsApp." }, 400, req);
  }

  const { data: reset, error } = await supabaseAdmin
    .from("tenant_password_resets")
    .select("id, tenant_id, token_hash, otp_hash, otp_attempts, expires_at, used_at")
    .eq("challenge_id", challengeId)
    .maybeSingle();

  if (error || !reset || reset.used_at || !reset.otp_hash || Date.now() > new Date(reset.expires_at).getTime()) {
    return jsonResponse({ error: "This code is invalid or has expired. Request a new one." }, 400, req);
  }
  if (Number(reset.otp_attempts || 0) >= 5) {
    return jsonResponse({ error: "Too many incorrect attempts. Request a new code." }, 429, req);
  }

  const expected = await otpCodeHash(challengeId, String(reset.tenant_id), code, "recovery");
  if (!timingSafeEqualString(expected, String(reset.otp_hash))) {
    await supabaseAdmin.from("tenant_password_resets")
      .update({ otp_attempts: Number(reset.otp_attempts || 0) + 1 })
      .eq("id", reset.id);
    return jsonResponse({ error: "Incorrect code. Check email or WhatsApp and try again." }, 400, req);
  }

  // Issue a one-time reset token (raw). Store only the hash we already have —
  // return a fresh token by rotating token_hash so the raw value is known once.
  const rawToken = randomBase64Url(32);
  const tokenHash = await sha256Hex(rawToken);
  const { error: rotateError } = await supabaseAdmin.from("tenant_password_resets")
    .update({ token_hash: tokenHash, otp_attempts: 0 })
    .eq("id", reset.id)
    .is("used_at", null);
  if (rotateError) {
    console.error("recovery otp token rotate failed:", rotateError);
    return jsonResponse({ error: "Could not verify code. Please request a new one." }, 500, req);
  }

  return jsonResponse({
    success: true,
    reset_token: rawToken,
    message: "Code verified. Set your new password.",
  }, 200, req);
}

async function handleResetPassword(payload: Record<string, unknown>, req: Request) {
  const token = String(payload.token || "").trim();
  const password = String(payload.password || "");
  if (!token || password.length < 10) {
    return jsonResponse({ error: "A valid recovery code/link and a password of at least 10 characters are required." }, 400, req);
  }
  const tokenHash = await sha256Hex(token);
  const { data: reset, error } = await supabaseAdmin
    .from("tenant_password_resets")
    .select("id, tenant_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !reset || reset.used_at || Date.now() > new Date(reset.expires_at).getTime()) {
    return jsonResponse({ error: "This recovery session is invalid or has expired." }, 400, req);
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("tenant_password_resets")
    .update({ used_at: now })
    .eq("id", reset.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return jsonResponse({ error: "This recovery code has already been used." }, 409, req);

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("saas_tenants")
    .select("auth_version, username")
    .eq("id", reset.tenant_id)
    .maybeSingle();
  if (tenantError || !tenant) {
    return jsonResponse({ error: "Password reset failed. Please request a new code." }, 500, req);
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
    return jsonResponse({ error: "Password reset failed. Please request a new code." }, 500, req);
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
    return jsonResponse({ error: "Outlet ID, username, and password are required." }, 400, req);
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
      }, 200, req);
    }
  }

  const { data: tenant, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, password_hash, status, allowed_tabs, data_reset_at, plan_code, subscription_status, subscription_current_period_end, auth_version")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("login lookup failed:", error);
    return jsonResponse({ error: "Authentication service unavailable." }, 500, req);
  }

  if (!tenant) {
    return jsonResponse({ error: "Authentication Failed: Invalid Outlet ID." }, 401, req);
  }

  if (tenant.status === "pending") {
    return jsonResponse({ error: "Access Denied: Your registration request is pending CodeArc approval." }, 403, req);
  }

  // Auto-heal false suspends (e.g. Razorpay cancel webhook while paid days remain)
  const healed = await healFalseSuspendIfNeeded(tenant);
  tenant.status = healed.status;
  tenant.subscription_status = healed.subscription_status;

  if (tenant.status === "suspended") {
    return jsonResponse({
      error:
        "Access Denied: Account suspended. Open Plan & billing to renew, or contact RestroSuite support.",
    }, 403, req);
  }

  const subGate = subscriptionAllowsAccess(tenant);
  if (!subGate.ok) {
    // Mark expired so reminders / admin dashboards stay accurate (no grace).
    if (subGate.code === "subscription_expired") {
      try {
        await supabaseAdmin
          .from("saas_tenants")
          .update({ subscription_status: "expired" })
          .eq("id", tenant.id)
          .in("subscription_status", ["trialing", "active", "past_due", "canceled", "cancelled"]);
      } catch (_) { /* best-effort */ }
    }
    return jsonResponse({ error: subGate.error, code: subGate.code }, 402, req);
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
    return jsonResponse({ error: "Authentication service unavailable." }, 500, req);
  }

  if (staffUser) {
    if (staffUser.status !== "active") {
      return jsonResponse({ error: "Access Denied: Staff account is suspended." }, 403, req);
    }
    if (!await verifyPassword(password, staffUser.password_hash)) {
      return jsonResponse({ error: "Access Denied: Invalid Username or Password for this Outlet." }, 401, req);
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
      return jsonResponse({ error: "Authentication service is misconfigured: session signing secret is missing. Please contact support." }, 500, req);
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
    }, 200, req);
  }

  const usernameMatches = username === tenant.username;
  const passwordMatches = await verifyPassword(password, tenant.password_hash);

  if (!usernameMatches || !passwordMatches) {
    return jsonResponse({ error: "Access Denied: Invalid Username or Password for this Outlet." }, 401, req);
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
    return jsonResponse({ error: "Authentication service is misconfigured: session signing secret is missing. Please contact support." }, 500, req);
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
  }, 200, req);
}

async function handleValidateSession(payload: Record<string, unknown>, req: Request) {
  const token = String(payload.session_token || "");
  // allowStale: revive recently expired tokens and always re-issue a fresh 30d token
  // so Keep me signed in does not force password every 8 hours.
  const verified = await verifySignedSessionToken(token, { allowStale: true });
  if (!verified.ok) {
    return jsonResponse(
      { error: verified.error, code: (verified as { code?: string }).code || "session_expired" },
      401,
      req,
    );
  }

  const sessionPayload = verified.payload as Record<string, unknown>;
  if (sessionPayload.role === "superadmin") {
    const freshToken = await refreshSignedSessionToken(sessionPayload);
    return jsonResponse({
      session: {
        username: String(sessionPayload.username || "superadmin"),
        role: "superadmin",
        tenant_id: "superadmin",
        tenant_slug: "superadmin",
        tenant_name: "SaaS Platform Owner",
        allowed_tabs: ["super-admin-tab", "gateway-monitor-tab"],
        session_token: freshToken || token,
        admin_token: freshToken || token,
      },
    }, 200, req);
  }

  const tenantId = String(sessionPayload.tenant_id || "");
  if (!tenantId) return jsonResponse({ error: "Invalid tenant session." }, 401, req);

  const { data: tenant, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, status, allowed_tabs, data_reset_at, plan_code, subscription_status, subscription_current_period_end, auth_version")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("validate_session lookup failed:", error);
    return jsonResponse({ error: "Failed to validate session." }, 500, req);
  }

  if (!tenant) return jsonResponse({ error: "Workspace no longer exists.", code: "session_revoked" }, 401, req);
  const healedSession = await healFalseSuspendIfNeeded(tenant);
  tenant.status = healedSession.status;
  tenant.subscription_status = healedSession.subscription_status;
  if (tenant.status !== "approved") {
    return jsonResponse({ error: "Workspace access is not active.", code: "session_revoked" }, 403, req);
  }
  const subGateV = subscriptionAllowsAccess(tenant);
  if (!subGateV.ok) {
    if (subGateV.code === "subscription_expired") {
      try {
        await supabaseAdmin
          .from("saas_tenants")
          .update({ subscription_status: "expired" })
          .eq("id", tenant.id)
          .in("subscription_status", ["trialing", "active", "past_due", "canceled", "cancelled"]);
      } catch (_) { /* best-effort */ }
    }
    return jsonResponse({ error: subGateV.error, code: subGateV.code }, 402, req);
  }
  const userId = String(sessionPayload.user_id || "");
  if (!userId && Number(sessionPayload.auth_version) !== Number(tenant.auth_version)) {
    return jsonResponse({ error: "Session was revoked. Please log in again.", code: "session_revoked" }, 401, req);
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
      return jsonResponse({ error: "Failed to validate staff session." }, 500, req);
    }
    if (!staffUser || staffUser.status !== "active") {
      return jsonResponse({ error: "Staff account is no longer active.", code: "session_revoked" }, 401, req);
    }
    if (Number(sessionPayload.session_version) !== Number(staffUser.session_version)) {
      return jsonResponse({ error: "Session was revoked. Please log in again.", code: "session_revoked" }, 401, req);
    }

    const freshToken = await createSignedSessionToken({
      role: staffUser.role,
      username: staffUser.username,
      user_id: staffUser.id,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      session_version: staffUser.session_version,
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
        session_token: freshToken || token,
      },
    }, 200, req);
  }

  const freshToken = await createSignedSessionToken({
    role: "admin",
    username: String(sessionPayload.username || tenant.username || ""),
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    legacy_owner: true,
    auth_version: tenant.auth_version,
  });

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
      session_token: freshToken || token,
    },
  }, 200, req);
}

async function consumeRegistrationOtp(payload: Record<string, unknown>, phone: string, req: Request) {
  const challengeId = String(payload.otp_challenge_id || "").trim();
  const code = String(payload.otp_code || "").replace(/\D/g, "");
  const cleanPhone = String(phone || "").replace(/\D/g, "");

  if (!challengeId || code.length !== 6 || cleanPhone.length < 10) {
    return { ok: false, response: jsonResponse({ error: "Please verify your WhatsApp OTP before registering." }, 400, req) };
  }

  const { data: challenge, error } = await supabaseAdmin
    .from("public_otp_challenges")
    .select("id, phone_hash, purpose, code_hash, expires_at, attempts, used_at")
    .eq("id", challengeId)
    .maybeSingle();

  if (error) {
    console.error("registration OTP lookup failed:", error);
    return { ok: false, response: jsonResponse({ error: "OTP verification is unavailable. Please try again." }, 500, req) };
  }

  if (
    !challenge
    || challenge.purpose !== "register"
    || challenge.used_at
    || Date.now() > new Date(challenge.expires_at).getTime()
  ) {
    return { ok: false, response: jsonResponse({ error: "OTP expired or invalid. Please request a new code." }, 400, req) };
  }

  const attempts = Number(challenge.attempts || 0);
  if (attempts >= 5) {
    return { ok: false, response: jsonResponse({ error: "Too many incorrect OTP attempts. Please request a new code." }, 429, req) };
  }

  const expectedPhoneHash = await phoneHash(cleanPhone);
  const expectedCodeHash = await otpCodeHash(challengeId, cleanPhone, code, "register");
  if (
    !timingSafeEqualString(String(challenge.phone_hash || ""), expectedPhoneHash)
    || !timingSafeEqualString(String(challenge.code_hash || ""), expectedCodeHash)
  ) {
    await supabaseAdmin
      .from("public_otp_challenges")
      .update({ attempts: attempts + 1 })
      .eq("id", challengeId)
      .is("used_at", null);
    return { ok: false, response: jsonResponse({ error: "Incorrect OTP. Check the code sent to WhatsApp." }, 400, req) };
  }

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("public_otp_challenges")
    .update({ used_at: new Date().toISOString(), attempts: attempts + 1 })
    .eq("id", challengeId)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    console.error("registration OTP consume failed:", claimError);
    return { ok: false, response: jsonResponse({ error: "OTP was already used. Please request a new code." }, 409, req) };
  }

  return { ok: true };
}

async function handleRegister(payload: Record<string, unknown>, req: Request) {
  const name = String(payload.name || "").trim();
  const slug = normalizeSlug(String(payload.slug || ""));
  const outletType = String(payload.outlet_type || "cafe").trim().toLowerCase();
  const email = normalizeEmail(String(payload.email || ""));
  const phone = String(payload.phone || "").trim();
  const username = normalizeUsername(String(payload.username || ""));
  const password = String(payload.password || "");
  // New outlets always start on Serve with a 30-day free trial (no card).
  const planCode = "serve";
  const country = String(payload.country || "India").trim();

  if (!name || !slug || !username || !password) {
    return jsonResponse({ error: "Outlet name, outlet ID, username, and password are required." }, 400, req);
  }

  // Input length limits — prevent oversized payloads and database abuse
  if (name.length > 100) return jsonResponse({ error: "Outlet name must be 100 characters or fewer." }, 400, req);
  if (slug.length > 40)  return jsonResponse({ error: "Outlet ID must be 40 characters or fewer." }, 400, req);
  if (username.length > 40) return jsonResponse({ error: "Username must be 40 characters or fewer." }, 400, req);
  if (password.length > 128) return jsonResponse({ error: "Password must be 128 characters or fewer." }, 400, req);
  if (email.length > 254)    return jsonResponse({ error: "Email address is too long." }, 400, req);
  if (phone.length > 20)     return jsonResponse({ error: "Phone number is too long." }, 400, req);

  // Email format validation
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonResponse({ error: "Please enter a valid email address." }, 400, req);
  }

  if (password.length < 10) {
    return jsonResponse({ error: "Password must be at least 10 characters." }, 400, req);
  }
 
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return jsonResponse({ error: "Slug can only contain lowercase letters, numbers, and hyphens." }, 400, req);
  }

  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return jsonResponse({ error: "A verified WhatsApp phone number is required." }, 400, req);
  }
 
  const { data: existingSlug, error: slugErr } = await supabaseAdmin
    .from("saas_tenants")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();
 
  if (slugErr) {
    console.error("register slug check failed:", slugErr);
    return jsonResponse({ error: "Failed to validate unique slug." }, 500, req);
  }
 
  if (existingSlug) {
    return jsonResponse({ error: `The Outlet ID "${slug}" is already taken. Try another unique slug.` }, 409, req);
  }
 
  const { data: existingUsername, error: userErr } = await supabaseAdmin
    .from("saas_tenants")
    .select("username")
    .eq("username", username)
    .maybeSingle();
 
  if (userErr) {
    console.error("register username check failed:", userErr);
    return jsonResponse({ error: "Failed to validate username uniqueness." }, 500, req);
  }
 
  if (existingUsername) {
    return jsonResponse({ error: `The username "${username}" is already in use. Choose another username.` }, 409, req);
  }

  const otpCheck = await consumeRegistrationOtp(payload, cleanPhone, req);
  if (!otpCheck.ok) return otpCheck.response;

  // One free trial per WhatsApp number (prevents re-register abuse).
  const { data: priorTrial } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, slug, trial_started_at")
    .eq("phone", cleanPhone)
    .not("trial_started_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (priorTrial) {
    return jsonResponse({
      error: "A free trial was already used with this WhatsApp number. Sign in to your existing outlet or contact support to renew.",
      code: "trial_already_used",
    }, 409, req);
  }

  const passwordHash = await hashPassword(password);
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const plan = planFor(planCode);

  const { data: inserted, error: insertErr } = await supabaseAdmin.from("saas_tenants").insert({
    name,
    slug,
    outlet_type: outletType,
    email,
    phone: cleanPhone,
    username,
    password_hash: passwordHash,
    // Trial starts immediately — no pending approval gate for new outlets.
    status: "approved",
    plan_code: planCode,
    allowed_tabs: plan.allowedTabs,
    country,
    subscription_status: "trialing",
    subscription_current_period_end: trialEnd.toISOString(),
    trial_started_at: trialStart.toISOString(),
    billing_interval: "monthly",
  }).select("id").maybeSingle();

  if (insertErr) {
    console.error("register insert failed:", insertErr);
    return jsonResponse({ error: "Registration failed. Please try again." }, 500, req);
  }

  const tenantId = inserted?.id || null;
  // Pre-allocate invoice number so client can reference it; PDF/email/WA go in background
  // so OTP "Creating…" does not block 20–40s on gateway/email.
  const invoiceNumber = makeInvoiceNumber("trial");
  const buyerAddress = String(payload.address || country || "").trim() || null;

  // Quick billing event (must not wait on PDF/gateway)
  try {
    await supabaseAdmin.from("saas_billing_events").insert({
      tenant_id: tenantId,
      event_type: "trial_started",
      channel: "system",
      payload: {
        slug,
        plan_code: planCode,
        trial_ends_at: trialEnd.toISOString(),
        phone: cleanPhone,
        email,
        invoice_number: invoiceNumber,
        pdf_status: "queued",
      },
    });
  } catch (evErr) {
    console.error("trial_started event insert failed:", evErr);
  }

  // Background: build PDF + deliver email/WhatsApp + store invoice row
  const deliverTrialPdf = async () => {
    try {
      const delivered = await issueAndDeliverInvoice({
        kind: "trial",
        invoiceNumber,
        invoiceDate: trialStart,
        buyerName: name,
        buyerSlug: slug,
        buyerEmail: email,
        buyerPhone: cleanPhone,
        buyerAddress,
        planCode,
        planName: planDisplayName(planCode) + " (Trial)",
        billingInterval: "trial",
        periodStart: trialStart.toISOString(),
        periodEnd: trialEnd.toISOString(),
        amountTotal: 0,
        currency: "INR",
        paymentMethod: "Trial — no charge",
        notes:
          "30-day Serve trial. Sign in immediately. No approval wait. PDF is your official confirmation.",
      });
      if (tenantId) {
        await supabaseAdmin.from("saas_invoices").insert({
          tenant_id: tenantId,
          invoice_number: invoiceNumber,
          kind: "trial",
          plan_code: planCode,
          billing_interval: "trial",
          currency: "INR",
          amount_subtotal: 0,
          amount_tax: 0,
          amount_total: 0,
          period_start: trialStart.toISOString(),
          period_end: trialEnd.toISOString(),
          buyer_name: name,
          buyer_email: email,
          buyer_phone: cleanPhone,
          buyer_slug: slug,
          status: "issued",
          pdf_sent_email: delivered.email,
          pdf_sent_whatsapp: delivered.whatsapp,
          meta: { type: "trial_confirmation" },
        });
      }
      await supabaseAdmin.from("saas_billing_events").insert({
        tenant_id: tenantId,
        event_type: "trial_pdf_delivered",
        channel: "system",
        payload: {
          slug,
          invoice_number: invoiceNumber,
          pdf_email: delivered.email,
          pdf_whatsapp: delivered.whatsapp,
        },
      });
    } catch (invErr) {
      console.error("trial invoice delivery failed (background):", invErr);
      try {
        await supabaseAdmin.from("saas_billing_events").insert({
          tenant_id: tenantId,
          event_type: "trial_pdf_failed",
          channel: "system",
          payload: {
            slug,
            invoice_number: invoiceNumber,
            invoice_error: String(invErr),
          },
        });
      } catch (_) { /* ignore */ }
    }
  };

  // Prefer EdgeRuntime.waitUntil so the isolate stays alive after response.
  // Fall back to fire-and-forget (still much faster for the client).
  try {
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(deliverTrialPdf());
    } else {
      void deliverTrialPdf();
    }
  } catch (_) {
    void deliverTrialPdf();
  }

  return jsonResponse({
    success: true,
    trial: true,
    plan_code: planCode,
    plan_name: plan.name,
    subscription_status: "trialing",
    subscription_current_period_end: trialEnd.toISOString(),
    invoice_number: invoiceNumber,
    message:
      "Welcome! Your 30-day Serve trial is active — sign in now (no approval). A confirmation PDF is on its way to your email and WhatsApp.",
  }, 200, req);
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

    if (action === "verify_recovery_otp") {
      return await handleVerifyRecoveryOtp(payload, req);
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
