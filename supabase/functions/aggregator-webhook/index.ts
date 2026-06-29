/**
 * Supabase Edge Function: aggregator-webhook
 *
 * Receives online order webhook events from platforms like Zomato, Swiggy, or ONDC,
 * parses the payload, and inserts the order into the tenant's `doppio_pending_orders` table.
 *
 * Deploy:
 *   supabase functions deploy aggregator-webhook
 *
 * Required secrets (set via `supabase secrets set KEY=value`):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   AGGREGATOR_WEBHOOK_SECRET
 *
 * Webhook URL:
 *   https://<project-ref>.supabase.co/functions/v1/aggregator-webhook?tenant_id=<tenant_id>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("AGGREGATOR_WEBHOOK_SECRET") || "";

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!WEBHOOK_SECRET) {
    console.error("AGGREGATOR_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // 1. Authorize the Webhook Request
  const authHeader = req.headers.get("Authorization");
  const url = new URL(req.url);

  // Validate authorization token. Keep the shared secret out of URLs and logs.
  const isAuthorized = authHeader === `Bearer ${WEBHOOK_SECRET}`;

  if (!isAuthorized) {
    console.error("Unauthorized webhook ingestion attempt");
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  // 2. Retrieve the Tenant ID
  const tenantId = url.searchParams.get("tenant_id");
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "Missing tenant_id parameter" }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  // 3. Parse Webhook Body
  let payload: any;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  console.log(`Received order webhook for tenant ${tenantId}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    // 4. Map the Aggregator Payload to RestroSuite Schema
    const platform = String(payload.platform || "Zomato").toLowerCase(); // zomato, swiggy, ondc
    const extOrderId = String(payload.order_id || Date.now());
    const customerName = String(payload.customer_name || "Aggregator Customer");
    const customerPhone = payload.customer_phone ? String(payload.customer_phone) : null;
    
    // Parse order items list
    const incomingItems = Array.isArray(payload.items) ? payload.items : [];
    const items = incomingItems.map((item: any) => ({
      name: String(item.name || "Item"),
      qty: Number(item.qty || item.quantity || 1),
      price: Number(item.price || 0)
    }));

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const gst = Math.round(subtotal * 0.05 * 100) / 100; // 5% GST default
    const total = Number(payload.total_amount || payload.net_amount || (subtotal + gst));

    // Prefix order ID for clarity in KDS/POS
    const prefix = platform === "swiggy" ? "SWI-" : platform === "ondc" ? "OND-" : "ZOM-";
    const orderId = `${prefix}${extOrderId.slice(-6)}`;

    // Build the pending order row
    const pendingOrderRow = {
      tenant_id: tenantId,
      orderId,
      customerName,
      customerPhone,
      items: JSON.stringify(items),
      subtotal,
      discount: Number(payload.discount || 0),
      gst,
      total,
      paymentMethod: String(payload.payment_method || "UPI"),
      orderType: "Delivery",
      tableNumber: `Online (${platform.toUpperCase()})`,
      status: "Pending Review", // Stays in Pending Review until staff accepts
      priority: "normal",
      dateTime: new Date().toISOString()
    };

    // 5. Insert order into doppio_pending_orders table
    const { data, error } = await supabase
      .from("doppio_pending_orders")
      .insert(pendingOrderRow)
      .select();

    if (error) {
      console.error("Failed to insert pending order:", error.message);
      throw error;
    }

    console.log("Online order ingested successfully:", JSON.stringify(data));

    return new Response(JSON.stringify({ 
      status: "success", 
      orderId: orderId,
      inserted: data 
    }), { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (err: any) {
    console.error("Ingestion handler error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
