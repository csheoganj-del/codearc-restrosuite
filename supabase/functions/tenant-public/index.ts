import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://codearc-restrosuite.vercel.app";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  // tenant-public also needs to allow QR scan from any browser (no Origin in some cases)
  // Allow all origins but with a strict rate limit enforced server-side
  return {
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OTP_SECRET = Deno.env.get("OTP_SECRET") || SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function generateTableSessionToken(tenantSlug: string, tableNumber: string, dbToken: string) {
  const valueToSign = `${tenantSlug}:${normalizeTableKey(tableNumber)}:${dbToken}`;
  const signature = await signValue(valueToSign, OTP_SECRET);
  return `${valueToSign}:${signature}`;
}

async function verifyTableSessionToken(token: string, tenantSlug: string, tableNumber: string) {
  if (!token) return { ok: false, error: "Missing session token." };
  const parts = token.split(":");
  if (parts.length !== 4) return { ok: false, error: "Invalid session token format." };
  const [slug, table, dbToken, signature] = parts;
  if (slug !== tenantSlug || normalizeTableKey(table) !== normalizeTableKey(tableNumber)) {
    return { ok: false, error: "Token table or tenant mismatch." };
  }
  const valueToSign = `${slug}:${normalizeTableKey(table)}:${dbToken}`;
  const expectedSignature = await signValue(valueToSign, OTP_SECRET);
  if (!timingSafeEqualString(expectedSignature, signature)) {
    return { ok: false, error: "Invalid session token signature." };
  }
  return { ok: true, dbToken };
}

async function validateActiveSession(tenantId: string, tenantSlug: string, tableRaw: string, token: string, isOrder = false) {
  const tableKey = normalizeTableKey(tableRaw);
  if (!tableKey) return { allowed: false, error: "Invalid table." };

  if (["takeaway", "walk-in"].includes(tableKey.toLowerCase())) {
    return { allowed: true, tableKey };
  }

  const verification = await verifyTableSessionToken(token, tenantSlug, tableKey);
  if (!verification.ok) {
    return { allowed: false, error: "This table session is closed or invalid. Please scan the table QR again." };
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from("doppio_table_sessions")
    .select("session_token, status, last_order_at")
    .eq("tenant_id", tenantId)
    .eq("table_number", tableKey)
    .maybeSingle();

  if (sessionError || !sessionData) {
    return { allowed: false, error: "Table session not found or closed." };
  }

  if (sessionData.status === "closed") {
    return { allowed: false, error: "This table session has been closed. Please call staff to re-open." };
  }

  if (sessionData.status === "paused") {
    return { allowed: false, error: "QR ordering is temporarily paused for this table. Please call staff." };
  }

  if (sessionData.session_token !== verification.dbToken) {
    return { allowed: false, error: "This table session has expired. Please scan the new table QR code." };
  }

  if (isOrder && sessionData.last_order_at) {
    const elapsedSeconds = (Date.now() - new Date(sessionData.last_order_at).getTime()) / 1000;
    if (elapsedSeconds < 15) {
      return { allowed: false, error: `Please wait ${Math.ceil(15 - elapsedSeconds)}s before placing another order.` };
    }
  }

  return { allowed: true, tableKey };
}

const PLAN_LIMITS: Record<string, { monthlyOrderLimit: number }> = {
  free: { monthlyOrderLimit: 50 },
  starter: { monthlyOrderLimit: 300 },
  growth: { monthlyOrderLimit: 8000 },
  enterprise: { monthlyOrderLimit: 100000 },
};

const ZERO_COST_MENU_LIMIT = 300;

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status || "active"));
}

// Mirrors the VAT/GST/Sales-Tax fallback used by the internal dashboard's
// RS_getTenantTaxProfile() (assets/dashboard.js) so the public QR ordering page shows the
// same tax label as the tenant's own POS instead of always defaulting to "GST". Previously
// this edge function only checked uiSettings.set_tax_label, which most tenants (including
// non-Indian ones onboarded via the reset/reseed flow) never have explicitly set -- so a
// tenant in e.g. Ireland fell straight through to the "GST" default even though their
// dashboard correctly shows VAT based on set_country.
const VAT_COUNTRIES = new Set([
  "ireland", "uk", "united kingdom", "great britain", "germany", "austria", "belgium",
  "france", "italy", "spain", "netherlands", "portugal", "finland", "greece", "denmark",
  "sweden", "norway", "saudi arabia", "united arab emirates", "uae", "south africa",
  "kenya", "nigeria", "ghana", "philippines", "thailand", "indonesia",
]);
const SALES_TAX_COUNTRIES = new Set(["united states", "us", "usa"]);
const GST_COUNTRIES = new Set(["india", "australia", "new zealand", "singapore", "canada"]);

function deriveTaxLabel(uiSettings: Record<string, any>): string {
  if (uiSettings?.set_tax_label) return String(uiSettings.set_tax_label);
  const country = String(uiSettings?.set_country || "India").trim().toLowerCase();
  if (VAT_COUNTRIES.has(country)) return "VAT";
  if (SALES_TAX_COUNTRIES.has(country)) return "Sales Tax";
  if (GST_COUNTRIES.has(country)) return "GST";
  return "GST";
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

function normalizeSlug(raw: unknown) {
  const slug = String(raw || "").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : "";
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomOtp() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000));
}

async function otpCodeHash(challengeId: string, phone: string, code: string, purpose: string) {
  return sha256Hex(`otp:${purpose}:${challengeId}:${phone}:${code}:${OTP_SECRET}`);
}

async function phoneHash(phone: string) {
  return sha256Hex(`phone:${phone}`);
}

async function checkRateLimit(req: Request, action: string, tenantSlug: string) {
  const rules: Record<string, { limit: number; windowSeconds: number }> = {
    list_menu: { limit: 120, windowSeconds: 60 },
    create_order: { limit: 20, windowSeconds: 5 * 60 },
    amend_order: { limit: 30, windowSeconds: 5 * 60 },
    get_table_orders: { limit: 90, windowSeconds: 60 },
    create_notification: { limit: 12, windowSeconds: 60 },
    submit_review: { limit: 8, windowSeconds: 60 },
    list_homepage_reviews: { limit: 60, windowSeconds: 60 },
  };
  const rule = rules[action];
  if (!rule) return { allowed: true };

  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const clientAddress = forwardedFor.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const bucket = await sha256Hex(`tenant-public:${tenantSlug}:${action}:${clientAddress}`);
  const { data, error } = await supabaseAdmin.rpc("consume_api_rate_limit", {
    p_bucket: bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    console.error("tenant-public rate limit failed:", error);
    return { allowed: false, unavailable: true };
  }
  return { allowed: data === true };
}

// Normalizes table identifiers so "Table 05", "T5", "table-5" and "5" all
// match. QR links carry the raw ?table= value while the POS stores labels
// like "Table 5", so both sides must be compared through this key.
function normalizeTableKey(raw: unknown): string {
  let key = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!key) return "";
  key = key.replace(/\btable\b|\btbl\b/g, "").replace(/[^a-z0-9]/g, "");
  // "t5" -> "5" (single leading t used as table shorthand)
  if (/^t\d+$/.test(key)) key = key.slice(1);
  // strip leading zeros on pure numbers: "05" -> "5"
  if (/^\d+$/.test(key)) key = String(parseInt(key, 10));
  return key;
}

async function getApprovedTenant(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, status, plan_code, subscription_status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.status !== "approved" || !activeSubscription(data.subscription_status)) return null;
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, req);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Public tenant backend is not configured." }, 500, req);
  }

  try {
    const payload = await req.json();
    // Normalize action + slug aliases (legacy clients / QR links)
    let action = String(payload?.action || "");
    if (action === "get_menu" || action === "menu" || action === "get_public_menu") action = "list_menu";
    if (payload && typeof payload === "object" && !payload.tenant_slug && (payload.slug || payload.outlet)) {
      payload.tenant_slug = payload.slug || payload.outlet;
    }

    // ── Public OTP send (no tenant/session required) ──────────────────────────
    if (action === "send_otp") {
      const phone = String(payload.phone || "").replace(/\D/g, "");
      const purpose = String(payload.purpose || "register").trim().toLowerCase();
      if (!phone || phone.length < 10 || !["register", "recovery"].includes(purpose)) {
        return jsonResponse({ error: "Invalid OTP request." }, 400, req);
      }
      // Rate limit: 5 OTPs per phone per 10 minutes
      const otpBucket = await sha256Hex(`otp:${phone}`);
      const { data: rlData, error: rlErr } = await supabaseAdmin.rpc("consume_api_rate_limit", {
        p_bucket: otpBucket,
        p_limit: 5,
        p_window_seconds: 600,
      });
      if (rlErr || !rlData) {
        return jsonResponse({ error: "Too many OTP requests. Please wait before trying again." }, 429, req);
      }
      const gatewayUrl = (Deno.env.get("WHATSAPP_GATEWAY_URL") || Deno.env.get("NGROK_GATEWAY_URL") || "https://goldsmith-finalist-guise.ngrok-free.dev").replace(/\/+$/, "");
      const gatewayToken = Deno.env.get("WHATSAPP_GATEWAY_TOKEN") || Deno.env.get("GATEWAY_TOKEN") || "";
      if (!gatewayToken) {
        return jsonResponse({ error: "WhatsApp gateway is not configured." }, 503, req);
      }
      const code = randomOtp();
      const challengeId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const message = `Your RestroSuite ${purpose === "recovery" ? "password reset" : "verification"} code is: *${code}*\n\nValid for 10 minutes. Never share this code.`;
      const { error: challengeError } = await supabaseAdmin.from("public_otp_challenges").insert({
        id: challengeId,
        phone_hash: await phoneHash(phone),
        purpose,
        code_hash: await otpCodeHash(challengeId, phone, code, purpose),
        expires_at: expiresAt,
      });
      if (challengeError) {
        console.error("send_otp challenge insert failed:", challengeError);
        return jsonResponse({ error: "Failed to create OTP challenge." }, 500, req);
      }
      try {
        const gwRes = await fetch(`${gatewayUrl}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${gatewayToken}` },
          body: JSON.stringify({ phone, message }),
        });
        if (!gwRes.ok) {
          const gwErr = await gwRes.text();
          console.error("send_otp gateway error:", gwErr);
          await supabaseAdmin.from("public_otp_challenges").update({ used_at: new Date().toISOString() }).eq("id", challengeId);
          return jsonResponse({ error: "Failed to send OTP via WhatsApp." }, 502, req);
        }
        return jsonResponse({ sent: true, challenge_id: challengeId, expires_at: expiresAt }, 200, req);
      } catch (e) {
        console.error("send_otp fetch error:", e);
        await supabaseAdmin.from("public_otp_challenges").update({ used_at: new Date().toISOString() }).eq("id", challengeId);
        return jsonResponse({ error: "Failed to reach WhatsApp gateway." }, 502, req);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const tenantSlug = normalizeSlug(payload.tenant_slug || payload.slug || payload.outlet || "");
    const rateLimit = await checkRateLimit(req, action, tenantSlug);
    if (!rateLimit.allowed) {
      return jsonResponse(
        { error: rateLimit.unavailable ? "Ordering protection is unavailable." : "Too many requests. Please try again later." },
        rateLimit.unavailable ? 503 : 429,
        req,
      );
    }
    const tenant = await getApprovedTenant(tenantSlug);
    if (!tenant) return jsonResponse({ error: "Outlet is not available." }, 404, req);

    if (action === "list_menu") {
      const { data, error } = await supabaseAdmin
        .from("doppio_menu")
        .select("id, name, description, price, category, icon, bestseller, prep_time, recipe_specs")
        .eq("tenant_id", tenant.id)
        .order("id", { ascending: true })
        .limit(ZERO_COST_MENU_LIMIT);

      if (error) {
        console.error("tenant-public list_menu failed:", error);
        return jsonResponse({ error: "Failed to load menu." }, 500, req);
      }

      const { data: profileData } = await supabaseAdmin
        .from("doppio_business_profile")
        .select("business_name, address, phone, upi_vpa, feature_flags")
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      let currencySymbol = "₹";
      let taxLabel = "GST";
      let countryName = "India";
      let featureFlags = {};
      if (profileData?.feature_flags) {
        try {
          featureFlags = typeof profileData.feature_flags === "string"
            ? JSON.parse(profileData.feature_flags)
            : profileData.feature_flags;
          const uiSettings = (featureFlags as Record<string, any>).ui_settings || {};
          const currencyVal = uiSettings.set_currency || "INR (₹)";
          const match = currencyVal.match(/\(([^)]+)\)/);
          if (match) currencySymbol = match[1];
          countryName = uiSettings.set_country || "India";
          taxLabel = deriveTaxLabel(uiSettings);
        } catch (e) {
          console.warn("Failed to parse feature flags for currency:", e);
        }
      }

      return jsonResponse({
        menu: data || [],
        tenantName: profileData?.business_name || tenant.name || "Doppio Cafe",
        tenantAddress: profileData?.address || "",
        tenantPhone: profileData?.phone || "",
        upiVpa: profileData?.upi_vpa || "",
        currencySymbol,
        taxLabel,
        country: countryName,
        feature_flags: featureFlags,
        stripeEnabled: (tenant as any).stripe_enabled || false,
        stripeAccountId: (tenant as any).stripe_account_id || null
      }, 200, req);
    }

    if (action === "create_order") {
      const order = payload.order && typeof payload.order === "object" ? payload.order as Record<string, unknown> : {};
      
      const orderId = String(order.orderId || "").trim();
      if (!/^DO-QR-[A-Z0-9-]{8,64}$/i.test(orderId)) {
        return jsonResponse({ error: "Invalid order identifier." }, 400, req);
      }

      const tableNumber = String(order.tableNumber || "Takeaway").trim();
      const sessionToken = String(payload.session_token || payload.token || "").trim();
      const sessionCheck = await validateActiveSession(tenant.id, tenantSlug, tableNumber, sessionToken, true);
      if (!sessionCheck.allowed) {
        return jsonResponse({ error: sessionCheck.error }, 403, req);
      }

      let parsedItems: unknown;
      try {
        parsedItems = typeof order.items === "string"
          ? JSON.parse(order.items)
          : order.items;
      } catch {
        return jsonResponse({ error: "Invalid order items." }, 400, req);
      }
      if (!Array.isArray(parsedItems) || parsedItems.length === 0 || parsedItems.length > 100) {
        return jsonResponse({ error: "Invalid order items." }, 400, req);
      }

      // Server-side price validation: fetch authoritative menu and verify item prices
      const { data: menuData, error: menuError } = await supabaseAdmin
        .from("doppio_menu")
        .select("name, price")
        .eq("tenant_id", tenant.id);

      if (menuError) {
        console.error("tenant-public price validation menu fetch failed:", menuError);
        return jsonResponse({ error: "Failed to validate order." }, 500, req);
      }

      const priceMap = new Map<string, number>(
        (menuData || []).map((item: { name: string; price: number }) => [
          item.name.trim().toLowerCase(),
          Number(item.price),
        ])
      );

      const safeItems: Array<Record<string, unknown>> = [];
      for (const rawItem of parsedItems as Array<Record<string, unknown>>) {
        const itemName = String(rawItem.name || "").trim().toLowerCase();
        const clientPrice = Number(rawItem.price || 0);
        const quantity = Number(rawItem.qty || 1);
        const serverPrice = priceMap.get(itemName);
        if (serverPrice === undefined) {
          return jsonResponse({ error: `Item not found in menu: ${String(rawItem.name || "").slice(0, 60)}` }, 400, req);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          return jsonResponse({ error: `Invalid quantity for item: ${String(rawItem.name || "").slice(0, 60)}` }, 400, req);
        }
        if (Math.abs(clientPrice - serverPrice) > 0.01) {
          return jsonResponse({ error: `Price mismatch for item: ${String(rawItem.name || "").slice(0, 60)}` }, 400, req);
        }
        safeItems.push({
          name: String(rawItem.name || "").trim().slice(0, 120),
          price: serverPrice,
          qty: quantity,
          notes: String(rawItem.notes || "").trim().slice(0, 240),
        });
      }

      const expectedSubtotal = safeItems.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.qty),
        0,
      );

      const clientSubtotal = Number(order.subtotal || 0);
      const clientTotal = Number(order.total || 0);
      // Allow up to ₹1 rounding difference for discounts/GST applied client-side
      if (
        !Number.isFinite(clientSubtotal)
        || !Number.isFinite(clientTotal)
        || clientSubtotal <= 0
        || clientTotal <= 0
        || clientTotal > 1000000
      ) {
        return jsonResponse({ error: "Invalid order total." }, 400, req);
      }
      if (
        Math.abs(clientSubtotal - expectedSubtotal) > 0.01
        || Math.abs(clientTotal - expectedSubtotal) > 0.01
      ) {
        return jsonResponse({ error: "Order total does not match item prices." }, 400, req);
      }

      const requestedPaymentMethod = String(order.paymentMethod || "").trim();
      const paymentMethod = requestedPaymentMethod.toLowerCase() === "upi"
        ? "UPI - Pending Verification"
        : requestedPaymentMethod.slice(0, 80);

      const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
        .from("doppio_pending_orders")
        .select("order_id")
        .eq("tenant_id", tenant.id)
        .eq("order_id", orderId)
        .maybeSingle();

      if (existingOrderError) {
        console.error("tenant-public order idempotency check failed:", existingOrderError);
        return jsonResponse({ error: "Failed to validate order identifier." }, 500, req);
      }
      if (existingOrder) {
        return jsonResponse({ error: "This order was already submitted." }, 409, req);
      }

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const planLimit = (PLAN_LIMITS[tenant.plan_code || "starter"] || PLAN_LIMITS.starter).monthlyOrderLimit;
      const { count: monthlyOrders, error: orderLimitError } = await supabaseAdmin
        .from("doppio_pending_orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .gte("date_time", monthStart.toISOString());
      if (orderLimitError) {
        console.error("tenant-public monthly order limit check failed:", orderLimitError);
        return jsonResponse({ error: "Failed to validate order capacity." }, 500, req);
      }
      if ((monthlyOrders || 0) >= planLimit) {
        return jsonResponse({ error: "Monthly online order limit reached for this workspace." }, 402, req);
      }

      const safeOrder = {
        tenant_id: tenant.id,
        order_id: orderId,
        customer_name: String(order.customerName || "").slice(0, 120),
        customer_phone: String(order.customerPhone || "Dine-in Customer").slice(0, 40),
        date_time: String(order.dateTime || new Date().toISOString()),
        items: JSON.stringify(safeItems),
        subtotal: expectedSubtotal,
        discount: 0,
        gst: 0,
        total: expectedSubtotal,
        payment_method: paymentMethod,
        order_type: String(order.orderType || "Takeaway").slice(0, 40),
        table_number: String(order.tableNumber || "Takeaway").slice(0, 40),
        status: "Pending Review",
      };

      if (safeOrder.total <= 0) {
        return jsonResponse({ error: "Invalid order payload." }, 400, req);
      }

      const { error } = await supabaseAdmin.from("doppio_pending_orders").insert(safeOrder);
      if (error) {
        console.error("tenant-public create_order failed:", error);
        return jsonResponse({ error: "Failed to submit order." }, 500, req);
      }

      // Update last_order_at timestamp for table cooldown
      await supabaseAdmin
        .from("doppio_table_sessions")
        .update({ last_order_at: new Date().toISOString() })
        .eq("tenant_id", tenant.id)
        .eq("table_number", sessionCheck.tableKey);

      return jsonResponse({ success: true }, 200, req);
    }

    // ── Amend shared table order (guest QR + waiter) ─────────────────────────
    // Rules: only while status is Pending Review / pending / new.
    // Preparing / ready / paid / cancelled → reject with clear reason.
    if (action === "amend_order") {
      const orderId = String(payload.order_id || payload.orderId || "").trim();
      if (!orderId || orderId.length > 80) {
        return jsonResponse({ error: "Invalid order ID." }, 400, req);
      }
      const tableRaw = String(payload.table || payload.tableNumber || "").trim().slice(0, 40);
      const sessionToken = String(payload.session_token || payload.token || "").trim();
      const sessionCheck = await validateActiveSession(tenant.id, tenantSlug, tableRaw, sessionToken, true);
      if (!sessionCheck.allowed) {
        return jsonResponse({ error: sessionCheck.error }, 403, req);
      }
      const byRole = String(payload.by || payload.actor || "guest").trim().slice(0, 40) || "guest";
      const covers = Math.max(0, Math.min(99, Number(payload.covers || payload.pax) || 0));

      // Load existing order (try snake + camel column names)
      let existing: Record<string, unknown> | null = null;
      {
        const { data: d1 } = await supabaseAdmin
          .from("doppio_pending_orders")
          .select("*")
          .eq("tenant_id", tenant.id)
          .eq("order_id", orderId)
          .maybeSingle();
        existing = d1 as Record<string, unknown> | null;
      }
      if (!existing) {
        const { data: d2 } = await supabaseAdmin
          .from("doppio_pending_orders")
          .select("*")
          .eq("tenant_id", tenant.id)
          .eq("orderId", orderId)
          .maybeSingle();
        existing = d2 as Record<string, unknown> | null;
      }
      if (!existing) {
        return jsonResponse({ error: "Order not found." }, 404, req);
      }

      const status = String(existing.status || "").toLowerCase();
      const locked =
        /prepar|ready|serv|paid|settled|complet|cancel|reject|picked|deliver|cook|kitchen|accepted/i.test(status) &&
        !/^pending/i.test(status) &&
        status !== "pending review" &&
        status !== "new" &&
        status !== "pending";
      // Explicit allow list for amendable statuses
      const amendable =
        /^(pending review|pending|new|hold|draft)$/i.test(String(existing.status || "").trim()) ||
        status === "pending review" ||
        status === "pending" ||
        status === "new";
      if (!amendable || locked) {
        return jsonResponse({
          error: "Order is already in kitchen / prepared — cannot delete or fully rewrite items.",
          reason: "status_locked",
          status: existing.status,
          canAmend: false,
        }, 409, req);
      }

      const tableOfOrder = String(existing.table_number || existing.tableNumber || "").trim();
      if (normalizeTableKey(tableOfOrder) !== sessionCheck.tableKey) {
        return jsonResponse({ error: "Order does not belong to this table session." }, 403, req);
      }

      let parsedItems: unknown;
      try {
        parsedItems = typeof payload.items === "string"
          ? JSON.parse(payload.items)
          : (payload.items ||
            (payload.order && typeof payload.order === "object"
              ? (payload.order as Record<string, unknown>).items
              : null));
      } catch {
        return jsonResponse({ error: "Invalid order items." }, 400, req);
      }
      if (!Array.isArray(parsedItems) || parsedItems.length === 0 || parsedItems.length > 100) {
        return jsonResponse({ error: "Invalid order items." }, 400, req);
      }

      const { data: menuData, error: menuError } = await supabaseAdmin
        .from("doppio_menu")
        .select("name, price")
        .eq("tenant_id", tenant.id);
      if (menuError) {
        return jsonResponse({ error: "Failed to validate order." }, 500, req);
      }
      const priceMap = new Map<string, number>(
        (menuData || []).map((item: { name: string; price: number }) => [
          item.name.trim().toLowerCase(),
          Number(item.price),
        ])
      );
      const safeItems: Array<Record<string, unknown>> = [];
      for (const rawItem of parsedItems as Array<Record<string, unknown>>) {
        const itemName = String(rawItem.name || "").trim().toLowerCase();
        const quantity = Number(rawItem.qty || 1);
        const serverPrice = priceMap.get(itemName);
        if (serverPrice === undefined) {
          return jsonResponse({ error: `Item not found in menu: ${String(rawItem.name || "").slice(0, 60)}` }, 400, req);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          return jsonResponse({ error: `Invalid quantity for item: ${String(rawItem.name || "").slice(0, 60)}` }, 400, req);
        }
        safeItems.push({
          name: String(rawItem.name || "").trim().slice(0, 120),
          price: serverPrice,
          qty: quantity,
          notes: String(rawItem.notes || rawItem.note || "").trim().slice(0, 240),
        });
      }
      const expectedSubtotal = safeItems.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.qty),
        0,
      );

      // Prefer snake_case update (matches create_order insert); fall back to camelCase
      const patchSnake = {
        items: JSON.stringify(safeItems),
        subtotal: expectedSubtotal,
        total: expectedSubtotal,
        gst: 0,
        discount: 0,
      };
      let updErr: { message?: string } | null = null;
      {
        const { error } = await supabaseAdmin
          .from("doppio_pending_orders")
          .update(patchSnake)
          .eq("tenant_id", tenant.id)
          .eq("order_id", orderId);
        updErr = error;
      }
      if (updErr) {
        const patchCamel = {
          items: safeItems,
          subtotal: expectedSubtotal,
          total: expectedSubtotal,
          gst: 0,
          discount: 0,
        };
        const { error } = await supabaseAdmin
          .from("doppio_pending_orders")
          .update(patchCamel)
          .eq("tenant_id", tenant.id)
          .eq("orderId", orderId);
        if (error) {
          console.error("tenant-public amend_order failed:", error);
          return jsonResponse({ error: "Failed to amend order." }, 500, req);
        }
      }

      // Notify staff / kitchen / other party
      const notifId = "amd_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const tableLabel = sessionCheck.tableKey || tableRaw || "table";
      await supabaseAdmin.from("doppio_notifications").insert({
        id: notifId,
        tenant_id: tenant.id,
        title: `Order amended · Table ${tableLabel}`,
        message: `${byRole} updated ${orderId.slice(0, 24)} · ${safeItems.length} lines · ₹${Math.round(expectedSubtotal)}${covers ? " · " + covers + " guests" : ""}`.slice(0, 240),
        type: "order_amended",
        role: "staff",
        is_read: false,
        timestamp: new Date().toISOString(),
      }).then(() => {}).catch((e: unknown) => console.warn("amend_order notif:", e));

      return jsonResponse({
        success: true,
        orderId,
        total: expectedSubtotal,
        items: safeItems,
        canAmend: true,
        covers: covers || null,
        by: byRole,
      }, 200, req);
    }

    if (action === "get_order_status") {
      const orderId = String(payload.order_id || payload.orderId || "").trim();
      if (!orderId) {
        return jsonResponse({ error: "Invalid order ID." }, 400, req);
      }
      const { data, error } = await supabaseAdmin
        .from("doppio_pending_orders")
        .select("status, items, total, tableNumber:table_number, paymentMethod:payment_method, prepMinutes:prep_minutes, prepStartedAt:prep_started_at")
        .eq("tenant_id", tenant.id)
        .eq("order_id", orderId)
        .maybeSingle();

      if (error) {
        console.error("tenant-public get_order_status failed:", error);
        return jsonResponse({ error: "Failed to fetch order status." }, 500, req);
      }
      if (!data) {
        // Check if it has moved to bills (completed/paid)
        const { data: billData, error: billError } = await supabaseAdmin
          .from("doppio_bills")
          .select("total, tableNumber:table_number, paymentMethod:payment_method")
          .eq("tenant_id", tenant.id)
          .eq("order_id", orderId)
          .maybeSingle();
        if (billError) {
          console.error("tenant-public get_order_status bill search failed:", billError);
        }
        if (billData) {
          return jsonResponse({ order: { status: "Paid", items: "[]", total: billData.total, tableNumber: billData.tableNumber, paymentMethod: billData.paymentMethod } }, 200, req);
        }
        return jsonResponse({ error: "Order not found." }, 404, req);
      }

      return jsonResponse({ order: data }, 200, req);
    }

    // ── Table-based live order tracking ─────────────────────────────────────
    // Returns every active order for a table (QR self-orders AND waiter-taken
    // KOTs both land in doppio_pending_orders with a tableNumber), plus bills
    // settled in the last 2 hours so guests see "Paid" after checkout.
    if (action === "get_table_orders") {
      const tableRaw = String(payload.table || "").trim().slice(0, 40);
      const sessionToken = String(payload.session_token || payload.token || "").trim();
      const sessionCheck = await validateActiveSession(tenant.id, tenantSlug, tableRaw, sessionToken, false);
      if (!sessionCheck.allowed) {
        return jsonResponse({ error: sessionCheck.error }, 403, req);
      }
      const tableKey = sessionCheck.tableKey;

      const sessionWindowStart = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: pendingRows, error: pendingError } = await supabaseAdmin
        .from("doppio_pending_orders")
        .select('orderId:order_id, status, items, total, subtotal, tableNumber:table_number, orderType:order_type, paymentMethod:payment_method, dateTime:date_time, created_at, prep_minutes, prep_started_at')
        .eq("tenant_id", tenant.id)
        .gte("created_at", sessionWindowStart)
        .order("created_at", { ascending: false })
        .limit(120);

      if (pendingError) {
        console.error("tenant-public get_table_orders failed:", pendingError);
        return jsonResponse({ error: "Failed to fetch table orders." }, 500, req);
      }

      const parseItems = (raw: unknown): Array<Record<string, unknown>> => {
        try {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!Array.isArray(parsed)) return [];
          return parsed.slice(0, 100).map((it: Record<string, unknown>) => ({
            name: String(it?.name || "").slice(0, 120),
            qty: Number(it?.qty || 1) || 1,
            price: Number(it?.price || 0) || 0,
          }));
        } catch {
          return [];
        }
      };

      const orders = (pendingRows || [])
        .filter((row: Record<string, unknown>) => normalizeTableKey(row.tableNumber) === tableKey)
        .map((row: Record<string, unknown>) => {
          const st = String(row.status || "Pending Review");
          const stL = st.toLowerCase();
          const canAmend =
            /^(pending review|pending|new|hold|draft)$/i.test(st.trim()) ||
            stL === "pending review" ||
            stL === "pending" ||
            stL === "new";
          return {
            orderId: String(row.orderId || ""),
            status: st,
            items: parseItems(row.items),
            total: Number(row.total || 0),
            orderType: String(row.orderType || ""),
            paymentMethod: String(row.paymentMethod || ""),
            dateTime: String(row.dateTime || row.created_at || ""),
            prepMinutes: row.prep_minutes != null ? Number(row.prep_minutes) : null,
            prepStartedAt: row.prep_started_at || null,
            source: /^DO-QR-/i.test(String(row.orderId || "")) ? "qr" : "staff",
            canAmend,
            lockReason: canAmend
              ? null
              : "In kitchen or already prepared — ask staff if you need a change",
          };
        });

      // Recently settled bills for this table -> show as Paid
      const billWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: billRows, error: billError } = await supabaseAdmin
        .from("doppio_bills")
        .select('orderId:order_id, table:table_number, items, total, paymentMethod:payment_method, dateTime:date_time')
        .eq("tenant_id", tenant.id)
        .gte("date_time", billWindowStart)
        .order("date_time", { ascending: false })
        .limit(60);

      if (billError) {
        console.error("tenant-public get_table_orders bill fetch failed:", billError);
      }

      const pendingIds = new Set(orders.map((o) => o.orderId));
      const paidOrders = (billRows || [])
        .filter((row: Record<string, unknown>) =>
          normalizeTableKey(row.table) === tableKey && !pendingIds.has(String(row.orderId || "")))
        .map((row: Record<string, unknown>) => ({
          orderId: String(row.orderId || ""),
          status: "Paid",
          items: parseItems(row.items),
          total: Number(row.total || 0),
          orderType: "Dine-in",
          paymentMethod: String(row.paymentMethod || ""),
          dateTime: String(row.dateTime || ""),
          source: /^DO-QR-/i.test(String(row.orderId || "")) ? "qr" : "staff",
        }));

      return jsonResponse({
        table: tableRaw,
        orders: [...orders, ...paidOrders].slice(0, 40),
        serverTime: new Date().toISOString(),
      }, 200, req);
    }

    // Public guest feedback (no table session required — used from digital bill / QR feedback link)
    if (action === "submit_review") {
      const rating = Math.max(1, Math.min(5, Number(payload.rating) || 0));
      if (!rating) return jsonResponse({ error: "Rating 1–5 is required." }, 400, req);
      const guestName = String(payload.guest_name || payload.guestName || "Guest").trim().slice(0, 80) || "Guest";
      const comment = String(payload.comment || payload.message || "").trim().slice(0, 500);
      const source = String(payload.source || "qr").trim().slice(0, 40) || "qr";
      const tableRaw = String(payload.table || payload.table_number || "").trim().slice(0, 40);
      const billNo = String(payload.bill_no || payload.billNo || "").trim().slice(0, 64);

      // Soft anti-spam: same IP/tenant limited by checkRateLimit above
      const row = {
        tenant_id: tenant.id,
        guest_name: guestName,
        rating,
        comment,
        source,
        table_number: tableRaw || null,
        bill_no: billNo || null,
        status: "pending",
        homepage_approved: false,
      };

      let reviewId: string | null = null;
      const { data: inserted, error: revErr } = await supabaseAdmin
        .from("doppio_guest_reviews")
        .insert(row)
        .select("id")
        .maybeSingle();

      if (revErr) {
        // Table may not exist on older deploys — fall through to notification-only
        console.warn("tenant-public submit_review insert:", revErr.message || revErr);
      } else if (inserted && (inserted as { id?: string }).id) {
        reviewId = String((inserted as { id: string }).id);
      }

      const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
      const notifId = "rev_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      await supabaseAdmin.from("doppio_notifications").insert({
        id: notifId,
        tenant_id: tenant.id,
        title: `Guest review ${stars}`,
        message: `${guestName}${tableRaw ? " · Table " + tableRaw : ""}${billNo ? " · Bill " + billNo : ""}: ${comment || "(no comment)"}`.slice(0, 240),
        type: "guest_review",
        role: "staff",
        is_read: false,
        timestamp: new Date().toISOString(),
      }).then(() => {}).catch((e: unknown) => console.warn("submit_review notif:", e));

      return jsonResponse({ success: true, id: reviewId || notifId, rating }, 200, req);
    }

    // Public approved reviews for marketing homepage (no secrets)
    if (action === "list_homepage_reviews") {
      const limit = Math.min(20, Math.max(1, Number(payload.limit) || 6));
      const { data: rows, error: listErr } = await supabaseAdmin
        .from("doppio_guest_reviews")
        .select("guest_name, rating, comment, created_at, source")
        .eq("tenant_id", tenant.id)
        .eq("homepage_approved", true)
        .gte("rating", 4)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (listErr) {
        console.warn("tenant-public list_homepage_reviews:", listErr.message || listErr);
        return jsonResponse({ success: true, reviews: [], avg: null, count: 0 }, 200, req);
      }
      const reviews = (rows || []).map((r: Record<string, unknown>) => ({
        guestName: String(r.guest_name || "Guest"),
        rating: Number(r.rating) || 5,
        comment: String(r.comment || "").slice(0, 280),
        createdAt: r.created_at || null,
        source: r.source || "guest",
      }));
      const avg = reviews.length
        ? Math.round((reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / reviews.length) * 10) / 10
        : null;
      return jsonResponse({ success: true, reviews, avg, count: reviews.length }, 200, req);
    }

    if (action === "create_notification") {
      const title = String(payload.title || "Service Alert").trim().slice(0, 120);
      const message = String(payload.message || "").trim().slice(0, 240);
      const type = String(payload.type || "info").trim().slice(0, 40);
      const tableRaw = String(payload.table || "").trim().slice(0, 40);

      const sessionToken = String(payload.session_token || payload.token || "").trim();
      const sessionCheck = await validateActiveSession(tenant.id, tenantSlug, tableRaw, sessionToken, false);
      if (!sessionCheck.allowed) {
        return jsonResponse({ error: sessionCheck.error }, 403, req);
      }

      // Anti-spam: ignore duplicate unread waiter calls from the same table
      // within 45 seconds (guest tapping the button repeatedly).
      if (type === "waiter_call") {
        const dedupeWindowStart = new Date(Date.now() - 45 * 1000).toISOString();
        const { data: recentCalls, error: dedupeError } = await supabaseAdmin
          .from("doppio_notifications")
          .select("id, title, message")
          .eq("tenant_id", tenant.id)
          .eq("type", "waiter_call")
          .eq("is_read", false)
          .gte("created_at", dedupeWindowStart)
          .limit(20);
        if (!dedupeError && Array.isArray(recentCalls)) {
          // A guest double-tapping the same button produces an identical
          // title + message pair -- exact match is the safest dedupe key.
          const duplicate = recentCalls.some((n: Record<string, unknown>) =>
            String(n.title || "") === title && String(n.message || "") === message);
          if (duplicate) {
            return jsonResponse({ success: true, deduped: true }, 200, req);
          }
        }
      }

      const notifId = (type === "waiter_call" ? "wcall_" : "notif_")
        + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

      const { error } = await supabaseAdmin
        .from("doppio_notifications")
        .insert({
          id: notifId,
          tenant_id: tenant.id,
          title,
          message,
          type,
          role: "staff",
          is_read: false,
          timestamp: new Date().toISOString()
        });

      if (error) {
        console.error("tenant-public create_notification failed:", error);
        return jsonResponse({ error: "Failed to send notification." }, 500, req);
      }

      return jsonResponse({ success: true, id: notifId }, 200, req);
    }

    if (action === "get_public_bill") {
      const billNo = String(payload.bill_no || "").trim();
      if (!billNo) {
        return jsonResponse({ error: "Invalid bill number." }, 400, req);
      }

      // Fetch the bill from the tenant's outlet bills
      const { data: billData, error: billError } = await supabaseAdmin
        .from("doppio_bills")
        .select("id, orderId:order_id, dateTime:date_time, table:table_number, items, subtotal, discount, serviceChargeAmount:service_charge_amount, gst, cgst, sgst, total, paymentMethod:payment_method, tenders, change, customerName:customer_name, customerPhone:customer_phone")
        .eq("tenant_id", tenant.id)
        .or(`order_id.eq."${billNo}",id.eq."${billNo}"`)
        .maybeSingle();

      if (billError) {
        console.error("tenant-public get_public_bill failed:", billError);
        return jsonResponse({ error: "Failed to fetch bill details." }, 500, req);
      }
      if (!billData) {
        return jsonResponse({ error: "Bill not found." }, 404, req);
      }

      // Fetch outlet business profile for tax label / address etc.
      const { data: profileData } = await supabaseAdmin
        .from("doppio_business_profile")
        .select("business_name, address, phone, gst_number, feature_flags")
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      let taxLabel = "GST";
      let currencySymbol = "₹";
      let currencyVal = "INR (₹)";
      let countryName = "India";
      let locale = "en-IN";
      if (profileData?.feature_flags) {
        try {
          const featureFlags = typeof profileData.feature_flags === "string"
            ? JSON.parse(profileData.feature_flags)
            : profileData.feature_flags;
          const uiSettings = featureFlags.ui_settings || {};
          taxLabel = deriveTaxLabel(uiSettings);
          currencyVal = uiSettings.set_currency || "INR (₹)";
          const match = currencyVal.match(/\(([^)]+)\)/);
          if (match) currencySymbol = match[1];
          countryName = uiSettings.set_country || "India";
          
          const countryLower = countryName.toLowerCase();
          if (countryLower.includes("ireland") || countryLower.includes("eu") || countryLower === "ie") {
            locale = "en-IE";
          }
        } catch (e) {
          console.warn("Failed to parse profile config flags:", e);
        }
      }

      // Format items array if stored as JSON in database
      let parsedItems = [];
      try {
        parsedItems = typeof billData.items === "string"
          ? JSON.parse(billData.items)
          : (billData.items || []);
      } catch {
        parsedItems = [];
      }

      const formattedBill = {
        no: billData.orderId || billData.id || "Invoice",
        time: billData.dateTime ? new Date(billData.dateTime).toLocaleString(locale, { hour: 'numeric', minute: '2-digit', hour12: true, day: '2-digit', month: 'short' }) : "",
        tableNumber: billData.table || "Walk-in",
        items: parsedItems,
        subtotal: Number(billData.subtotal || 0),
        discount: Number(billData.discount || 0),
        serviceChargeAmount: Number(billData.serviceChargeAmount || 0),
        gst: Number(billData.gst || 0),
        total: Number(billData.total || 0),
        paymentMethod: billData.paymentMethod || "Cash",
        customerName: billData.customerName || "Walk-in",
        customerPhone: billData.customerPhone || ""
      };

      return jsonResponse({
        bill: formattedBill,
        profile: {
          name: profileData?.business_name || tenant.name || "Doppio Cafe",
          address: profileData?.address || "",
          phone: profileData?.phone || "",
          tax_registration_no: profileData?.gst_number || "",
          tax_label: taxLabel
        },
        country: countryName,
        locale,
        currency: currencyVal
      }, 200, req);
    }

    if (action === "get_active_session") {
      const tableRaw = String(payload.table || "").trim().slice(0, 40);
      const tableKey = normalizeTableKey(tableRaw);
      if (!tableKey) {
        return jsonResponse({ error: "Invalid table." }, 400, req);
      }

      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from("doppio_table_sessions")
        .select("session_token, status")
        .eq("tenant_id", tenant.id)
        .eq("table_number", tableKey)
        .maybeSingle();

      if (sessionError) {
        console.error("Failed to query table session:", sessionError);
        return jsonResponse({ error: "Failed to verify table session." }, 500, req);
      }

      if (!sessionData || sessionData.status === "closed") {
        return jsonResponse({ active: false, status: "closed" }, 200, req);
      }

      if (sessionData.status === "paused") {
        return jsonResponse({ active: true, status: "paused" }, 200, req);
      }

      const signedToken = await generateTableSessionToken(tenantSlug, tableKey, sessionData.session_token);
      return jsonResponse({ active: true, status: "active", session_token: signedToken }, 200, req);
    }

    return jsonResponse({ error: "Unsupported action." }, 400, req);
  } catch (error) {
    console.error("tenant-public function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
