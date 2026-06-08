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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PLAN_LIMITS: Record<string, { monthlyOrderLimit: number }> = {
  starter: { monthlyOrderLimit: 300 },
  growth: { monthlyOrderLimit: 8000 },
  enterprise: { monthlyOrderLimit: 100000 },
};

const ZERO_COST_MENU_LIMIT = 300;

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status || "active"));
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
  const slug = String(raw || "doppio-nagpur").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : "doppio-nagpur";
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function checkRateLimit(req: Request, action: string, tenantSlug: string) {
  const rules: Record<string, { limit: number; windowSeconds: number }> = {
    list_menu: { limit: 120, windowSeconds: 60 },
    create_order: { limit: 20, windowSeconds: 5 * 60 },
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

async function getApprovedTenant(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, status, plan_code, subscription_status")
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
    const action = String(payload?.action || "");
    const tenantSlug = normalizeSlug(payload.tenant_slug);
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
        return jsonResponse({ error: "Failed to load menu." }, 500);
      }

      return jsonResponse({ menu: data || [] }, 200, req);
    }

    if (action === "create_order") {
      const order = payload.order && typeof payload.order === "object" ? payload.order as Record<string, unknown> : {};
      let parsedItems: unknown;
      try {
        parsedItems = typeof order.items === "string"
          ? JSON.parse(order.items)
          : order.items;
      } catch {
        return jsonResponse({ error: "Invalid order items." }, 400);
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

      const orderId = String(order.orderId || "").trim();
      if (!/^DO-QR-[A-Z0-9-]{8,64}$/i.test(orderId)) {
        return jsonResponse({ error: "Invalid order identifier." }, 400, req);
      }

      const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
        .from("doppio_pending_orders")
        .select("orderId")
        .eq("tenant_id", tenant.id)
        .eq("orderId", orderId)
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
        .gte("dateTime", monthStart.toISOString());
      if (orderLimitError) {
        console.error("tenant-public monthly order limit check failed:", orderLimitError);
        return jsonResponse({ error: "Failed to validate order capacity." }, 500, req);
      }
      if ((monthlyOrders || 0) >= planLimit) {
        return jsonResponse({ error: "Monthly online order limit reached for this workspace." }, 402, req);
      }

      const safeOrder = {
        tenant_id: tenant.id,
        orderId,
        customerName: String(order.customerName || "").slice(0, 120),
        customerPhone: String(order.customerPhone || "Dine-in Customer").slice(0, 40),
        dateTime: String(order.dateTime || new Date().toISOString()),
        items: JSON.stringify(safeItems),
        subtotal: expectedSubtotal,
        discount: 0,
        gst: 0,
        total: expectedSubtotal,
        paymentMethod,
        orderType: String(order.orderType || "Takeaway").slice(0, 40),
        tableNumber: String(order.tableNumber || "Takeaway").slice(0, 40),
        status: "Pending Review",
      };

      if (safeOrder.total <= 0) {
        return jsonResponse({ error: "Invalid order payload." }, 400);
      }

      const { error } = await supabaseAdmin.from("doppio_pending_orders").insert(safeOrder);
      if (error) {
        console.error("tenant-public create_order failed:", error);
        return jsonResponse({ error: "Failed to submit order." }, 500, req);
      }

      return jsonResponse({ success: true }, 200, req);
    }

    return jsonResponse({ error: "Unsupported action." }, 400, req);
  } catch (error) {
    console.error("tenant-public function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
