import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://codearc-restrosuite.vercel.app";
// Exact-match origin allowlist (see tenant-access for rationale). Configure extra
// origins via ALLOWED_ORIGINS="https://a.com,https://b.com". Never suffix-match.
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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGIN }), "Content-Type": "application/json; charset=utf-8" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{10,}\b/g, "[number]")
    .slice(0, maxLength);
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(req: Request, tenantSlug: string) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const clientAddress = forwardedFor.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const bucket = await sha256Hex(`app-observability:${tenantSlug}:${clientAddress}`);
  const { data, error } = await supabaseAdmin.rpc("consume_api_rate_limit", {
    p_bucket: bucket,
    p_limit: 30,
    p_window_seconds: 60,
  });
  if (error) {
    console.error("app-observability rate limit failed:", error);
    return { allowed: false, unavailable: true };
  }
  return { allowed: data === true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, req);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Observability backend is not configured." }, 500, req);
  }

  try {
    const payload = await req.json();
    const tenantSlug = cleanText(payload.tenant_slug || "unknown", 80).toLowerCase();
    const rateLimit = await checkRateLimit(req, tenantSlug);
    if (!rateLimit.allowed) {
      return jsonResponse(
        { error: rateLimit.unavailable ? "Observability protection is unavailable." : "Too many reports." },
        rateLimit.unavailable ? 503 : 429,
        req,
      );
    }

    let tenantId: string | null = null;
    if (tenantSlug && tenantSlug !== "unknown") {
      const { data: tenant } = await supabaseAdmin
        .from("saas_tenants").select("id").eq("slug", tenantSlug).maybeSingle();
      tenantId = tenant?.id || null;
    }

    const severity = ["info", "warning", "error", "critical"].includes(String(payload.severity))
      ? String(payload.severity) : "error";
    const source = ["dashboard", "customer", "login", "android", "gateway"].includes(String(payload.source))
      ? String(payload.source) : "dashboard";
    const message = cleanText(payload.message, 500);
    if (!message) return jsonResponse({ error: "Report message is required." }, 400, req);

    const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
      ? payload.metadata : {};

    const { error } = await supabaseAdmin.from("app_error_reports").insert({
      tenant_id: tenantId,
      tenant_slug: tenantSlug === "unknown" ? null : tenantSlug,
      severity, source, message,
      stack: cleanText(payload.stack, 1800),
      url_path: cleanText(payload.url_path, 240),
      app_version: cleanText(payload.app_version, 40),
      user_agent: cleanText(payload.user_agent, 300),
      metadata,
    });
    if (error) {
      console.error("app-observability insert failed:", error);
      return jsonResponse({ error: "Failed to record report." }, 500, req);
    }

    return jsonResponse({ success: true }, 200, req);
  } catch (error) {
    console.error("app-observability function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
