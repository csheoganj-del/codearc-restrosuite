import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeSlug(raw: unknown) {
  const slug = String(raw || "doppio-nagpur").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : "doppio-nagpur";
}

async function getApprovedTenant(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.status !== "approved") return null;
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Public tenant backend is not configured." }, 500);
  }

  try {
    const payload = await req.json();
    const action = String(payload?.action || "");
    const tenant = await getApprovedTenant(normalizeSlug(payload.tenant_slug));
    if (!tenant) return jsonResponse({ error: "Outlet is not available." }, 404);

    if (action === "list_menu") {
      const { data, error } = await supabaseAdmin
        .from("doppio_menu")
        .select("id, name, description, price, category, icon, bestseller, prep_time, recipe_specs")
        .eq("tenant_id", tenant.id)
        .order("id", { ascending: true });

      if (error) {
        console.error("tenant-public list_menu failed:", error);
        return jsonResponse({ error: "Failed to load menu." }, 500);
      }

      return jsonResponse({ menu: data || [] });
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
        return jsonResponse({ error: "Invalid order items." }, 400);
      }

      // Server-side price validation: fetch authoritative menu and verify item prices
      const { data: menuData, error: menuError } = await supabaseAdmin
        .from("doppio_menu")
        .select("name, price")
        .eq("tenant_id", tenant.id);

      if (menuError) {
        console.error("tenant-public price validation menu fetch failed:", menuError);
        return jsonResponse({ error: "Failed to validate order." }, 500);
      }

      const priceMap = new Map<string, number>(
        (menuData || []).map((item: { name: string; price: number }) => [
          item.name.trim().toLowerCase(),
          Number(item.price),
        ])
      );

      // Validate each item's price against the authoritative menu
      for (const rawItem of parsedItems as Array<Record<string, unknown>>) {
        const itemName = String(rawItem.name || "").trim().toLowerCase();
        const clientPrice = Number(rawItem.price || 0);
        const quantity = Number(rawItem.qty || 1);
        const serverPrice = priceMap.get(itemName);
        if (serverPrice === undefined) {
          return jsonResponse({ error: `Item not found in menu: ${String(rawItem.name || "").slice(0, 60)}` }, 400);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          return jsonResponse({ error: `Invalid quantity for item: ${String(rawItem.name || "").slice(0, 60)}` }, 400);
        }
        if (Math.abs(clientPrice - serverPrice) > 0.01) {
          return jsonResponse({ error: `Price mismatch for item: ${String(rawItem.name || "").slice(0, 60)}` }, 400);
        }
      }

      // Recalculate expected subtotal from authoritative prices
      const expectedSubtotal = (parsedItems as Array<Record<string, unknown>>).reduce((sum, item) => {
        const serverPrice = priceMap.get(String(item.name || "").trim().toLowerCase()) || 0;
        const qty = Number(item.qty || 1);
        return sum + serverPrice * qty;
      }, 0);

      const clientTotal = Number(order.total || 0);
      // Allow up to ₹1 rounding difference for discounts/GST applied client-side
      if (!Number.isFinite(clientTotal) || clientTotal <= 0 || clientTotal > 1000000) {
        return jsonResponse({ error: "Invalid order total." }, 400);
      }
      if (clientTotal < expectedSubtotal * 0.5) {
        // Total is less than 50% of item prices — likely tampered
        return jsonResponse({ error: "Order total does not match item prices." }, 400);
      }

      const safeOrder = {
        tenant_id: tenant.id,
        orderId: String(order.orderId || ""),
        customerName: String(order.customerName || "").slice(0, 120),
        customerPhone: String(order.customerPhone || "Dine-in Customer").slice(0, 40),
        dateTime: String(order.dateTime || new Date().toISOString()),
        items: JSON.stringify(parsedItems),
        subtotal: Number(order.subtotal || 0),
        discount: Number(order.discount || 0),
        gst: Number(order.gst || 0),
        total: clientTotal,
        paymentMethod: String(order.paymentMethod || "").slice(0, 80),
        orderType: String(order.orderType || "Takeaway").slice(0, 40),
        tableNumber: String(order.tableNumber || "Takeaway").slice(0, 40),
        status: "Pending Review",
      };

      if (!safeOrder.orderId || safeOrder.total <= 0) {
        return jsonResponse({ error: "Invalid order payload." }, 400);
      }

      const { error } = await supabaseAdmin.from("doppio_pending_orders").insert(safeOrder);
      if (error) {
        console.error("tenant-public create_order failed:", error);
        return jsonResponse({ error: "Failed to submit order." }, 500);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("tenant-public function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});
