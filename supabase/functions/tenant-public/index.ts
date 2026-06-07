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

      const total = Number(order.total || 0);
      if (!Number.isFinite(total) || total <= 0 || total > 1000000) {
        return jsonResponse({ error: "Invalid order total." }, 400);
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
        total,
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
