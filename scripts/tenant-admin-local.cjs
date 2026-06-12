const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPERADMIN_SESSION_SECRET = process.env.SUPERADMIN_SESSION_SECRET || "";

const TABLES_TO_RESET = [
  "doppio_bills",
  "doppio_pending_orders",
  "doppio_draft_orders",
  "doppio_menu",
  "doppio_inventory",
  "doppio_inventory_batches",
  "doppio_inventory_thresholds",
  "doppio_shifts",
  "doppio_shift_events",
  "doppio_employees",
  "doppio_leave_requests",
  "doppio_attendance",
  "doppio_crm",
  "doppio_notifications",
  "doppio_custom_recipes",
  "doppio_pos_popularity",
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
];

async function signValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function verifySuperadminToken(token) {
  if (!token) {
    return { ok: false, error: "Missing superadmin session token." };
  }

  const parts = token.split(".");
  const payloadEncoded = parts[0];
  const signature = parts[1];
  if (!payloadEncoded) {
    return { ok: false, error: "Invalid session token format." };
  }

  if (!SUPERADMIN_SESSION_SECRET) {
    // Local dev mode fallback: decode and validate payload without signature verification
    try {
      const payloadText = Buffer.from(payloadEncoded, "base64").toString("utf8");
      const payload = JSON.parse(payloadText);
      if (payload.role !== "superadmin") {
        return { ok: false, error: "Insufficient privileges." };
      }
      if (!payload.exp || Date.now() > Number(payload.exp)) {
        return { ok: false, error: "Session expired. Please log in again." };
      }
      return { ok: true, payload };
    } catch (err) {
      return { ok: false, error: "Invalid session token payload." };
    }
  }

  if (!signature) {
    return { ok: false, error: "Invalid session token signature format." };
  }

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (expectedSignature !== signature) {
    return { ok: false, error: "Invalid session token signature." };
  }

  try {
    const payloadText = Buffer.from(payloadEncoded, "base64").toString("utf8");
    const payload = JSON.parse(payloadText);
    if (payload.role !== "superadmin") {
      return { ok: false, error: "Insufficient privileges." };
    }
    if (!payload.exp || Date.now() > Number(payload.exp)) {
      return { ok: false, error: "Session expired. Please log in again." };
    }
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, error: "Invalid session token payload." };
  }
}

async function resetTenantData(supabaseAdmin, tenantId) {
  const errors = [];
  for (const table of TABLES_TO_RESET) {
    const { error } = await supabaseAdmin.from(table).delete().eq("tenant_id", tenantId);
    if (error) {
      console.error(`Failed to reset table ${table}:`, error.message);
      errors.push(table);
    }
  }

  let existingFlags = {};
  try {
    const { data: existingProfile } = await supabaseAdmin
      .from("doppio_business_profile")
      .select("feature_flags")
      .eq("tenant_id", tenantId)
      .single();

    if (existingProfile && existingProfile.feature_flags) {
      existingFlags = typeof existingProfile.feature_flags === "string"
        ? JSON.parse(existingProfile.feature_flags)
        : existingProfile.feature_flags;
    }
  } catch (err) {
    existingFlags = {};
  }

  existingFlags.seeding_disabled = true;

  const { error: profileError } = await supabaseAdmin
    .from("doppio_business_profile")
    .update({
      business_name: "",
      address: "",
      phone: "",
      gst_number: "",
      upi_id: "",
      logo_base64: null,
      shift_enabled: false,
      whatsapp_enabled: false,
      table_count: 10,
      feature_flags: JSON.stringify(existingFlags),
    })
    .eq("tenant_id", tenantId);

  if (profileError) {
    console.error("Failed to reset business profile:", profileError.message);
    errors.push("doppio_business_profile");
  }

  const resetAt = new Date().toISOString();
  const { error: markerError } = await supabaseAdmin
    .from("saas_tenants")
    .update({ data_reset_at: resetAt })
    .eq("id", tenantId);

  if (markerError) {
    console.error("Failed to update tenant reset marker:", markerError.message);
    errors.push("saas_tenants.data_reset_at");
  }

  return { success: errors.length === 0, errors, data_reset_at: resetAt };
}

async function seedTenantData(supabaseAdmin, tenantId) {
  // 1. Check if tenant exists
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    return { error: "Client workspace was not found." };
  }

  // 2. Clear existing operational data first
  const resetRes = await resetTenantData(supabaseAdmin, tenantId);

  // 3. Seed doppio_business_profile
  await supabaseAdmin.from("doppio_business_profile").insert({
    tenant_id: tenantId,
    business_name: tenant.name,
    address: "12, Commercial Road, Nagpur",
    phone: "919983721179",
    gst_number: "27AAAAA1111A1Z1",
    upi_id: "doppio@upi",
    shift_enabled: true,
    whatsapp_enabled: false,
    table_count: 12,
    feature_flags: JSON.stringify({ seeding_disabled: true, demo_loaded: true })
  });

  // 4. Seed doppio_menu
  const menuItems = [
    { name: "Doppio", price: 120, category: "Hot coffee", available: true, popularity: 45 },
    { name: "Espresso", price: 100, category: "Hot coffee", available: true, popularity: 30 },
    { name: "Cappuccino", price: 150, category: "Hot coffee", available: true, popularity: 85 },
    { name: "Cafe Latte", price: 160, category: "Hot coffee", available: true, popularity: 70 },
    { name: "Iced Americano", price: 140, category: "Iced coffee", available: true, popularity: 50 },
    { name: "Chocolate Brownie", price: 180, category: "Dessert", available: true, popularity: 90 }
  ];
  
  const { data: menuData, error: menuErr } = await supabaseAdmin
    .from("doppio_menu")
    .insert(menuItems.map(({ popularity, ...item }) => ({ ...item, tenant_id: tenantId })))
    .select();

  if (menuErr) {
    console.error("Seeding menu failed:", menuErr);
    return { error: "Failed to seed menu items: " + menuErr.message };
  }

  // 5. Seed doppio_inventory
  const stockItems = [
    { key: "espresso_coffee_beans", label: "Espresso Coffee Beans", unit: "g", current: 5000, max_stock: 10000, category: "food" },
    { key: "fresh_milk", label: "Fresh Milk", unit: "ml", current: 10000, max_stock: 20000, category: "food" },
    { key: "chocolate_syrup", label: "Chocolate Syrup", unit: "ml", current: 2000, max_stock: 5000, category: "food" },
    { key: "sugar_syrup", label: "Sugar Syrup", unit: "ml", current: 3000, max_stock: 5000, category: "food" },
    { key: "paper_cups_250ml", label: "Paper Cups 250ml", unit: "pcs", current: 500, max_stock: 1000, category: "packaging" }
  ];

  const { data: invData, error: invErr } = await supabaseAdmin
    .from("doppio_inventory")
    .insert(stockItems.map(item => ({ ...item, tenant_id: tenantId })))
    .select();

  if (invErr) {
    console.error("Seeding inventory failed:", invErr);
    return { error: "Failed to seed inventory: " + invErr.message };
  }

  // Seed doppio_inventory_thresholds
  const thresholds = [
    { ingredient_key: "espresso_coffee_beans", threshold: 1000 },
    { ingredient_key: "fresh_milk", threshold: 2000 },
    { ingredient_key: "chocolate_syrup", threshold: 500 },
    { ingredient_key: "sugar_syrup", threshold: 500 },
    { ingredient_key: "paper_cups_250ml", threshold: 100 }
  ];
  await supabaseAdmin.from("doppio_inventory_thresholds").insert(thresholds.map(t => ({ ...t, tenant_id: tenantId })));

  // 6. Seed doppio_inventory_batches (for FEFO and batch costing)
  let batchIds = [];
  const batchInserts = stockItems.map(item => ({
    id: "batch_" + item.key + "_" + Math.floor(1000 + Math.random() * 9000),
    tenant_id: tenantId,
    ingredient_key: item.key,
    qty: item.current,
    expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    receivedDate: new Date().toISOString().split('T')[0]
  }));
  const { data: batchData, error: batchErr } = await supabaseAdmin.from("doppio_inventory_batches").insert(batchInserts).select();
  if (batchErr) {
    console.warn("Seeding inventory batches failed:", batchErr);
  }
  batchIds = batchData ? batchData.map(r => r.id) : [];

  // 7. Seed doppio_custom_recipes
  let recipeIds = [];
  const recipes = [
    {
      item_name: "Doppio",
      ingredients: { espresso_coffee_beans: 18, paper_cups_250ml: 1 }
    },
    {
      item_name: "Espresso",
      ingredients: { espresso_coffee_beans: 9, paper_cups_250ml: 1 }
    },
    {
      item_name: "Cappuccino",
      ingredients: { espresso_coffee_beans: 9, fresh_milk: 150, paper_cups_250ml: 1 }
    },
    {
      item_name: "Cafe Latte",
      ingredients: { espresso_coffee_beans: 9, fresh_milk: 200, paper_cups_250ml: 1 }
    }
  ];
  const { data: recipeData, error: recipeErr } = await supabaseAdmin.from("doppio_custom_recipes").insert(recipes.map(r => ({
    tenant_id: tenantId,
    item_name: r.item_name,
    ingredients: r.ingredients
  }))).select();
  if (recipeErr) {
    console.warn("Seeding custom recipes failed:", recipeErr);
  }
  recipeIds = recipeData ? recipeData.map(r => r.id) : [];

  // 8. Seed doppio_employees
  const employees = [
    { name: "Amit Sharma", role: "cashier", salary: 15000, shift: "Morning Shift (09:00 - 17:00)", status: "active" },
    { name: "Rajesh Verma", role: "kitchen", salary: 22000, shift: "Morning Shift (09:00 - 17:00)", status: "active" },
    { name: "Pooja Patel", role: "waiter", salary: 12000, shift: "Evening Shift (17:00 - 01:00)", status: "active" }
  ];
  const { data: empData } = await supabaseAdmin.from("doppio_employees").insert(employees.map(e => ({ ...e, tenant_id: tenantId }))).select();
  const employeeIds = empData ? empData.map(r => r.id) : [];

  // 9. Seed doppio_bills
  let billIds = [];
  if (menuData) {
    const bills = [];
    const paymentModes = ["Cash", "UPI", "Card"];
    for (let i = 7; i >= 1; i--) {
      const count = Math.floor(2 + Math.random() * 2);
      for (let j = 0; j < count; j++) {
        const item1 = menuData[Math.floor(Math.random() * menuData.length)];
        const item2 = menuData[Math.floor(Math.random() * menuData.length)];
        const qty1 = Math.floor(1 + Math.random() * 2);
        const qty2 = Math.floor(1 + Math.random() * 2);

        const itemsSold = [
          { name: item1.name, price: item1.price, quantity: qty1, subtotal: item1.price * qty1 },
          { name: item2.name, price: item2.price, quantity: qty2, subtotal: item2.price * qty2 }
        ];
        const subtotal = (item1.price * qty1) + (item2.price * qty2);
        const gst = Math.round(subtotal * 0.05);
        const grandTotal = subtotal + gst;

        const billDate = new Date(Date.now() - i * 24 * 60 * 60 * 1000 + j * 2 * 60 * 60 * 1000);

        bills.push({
          tenant_id: tenantId,
          bill_date: billDate.toISOString(),
          items: JSON.stringify(itemsSold),
          subtotal,
          discount: 0,
          gst,
          grand_total: grandTotal,
          payment_mode: paymentModes[Math.floor(Math.random() * paymentModes.length)],
          table_number: String(Math.floor(1 + Math.random() * 10)),
          order_type: Math.random() > 0.3 ? "dine-in" : "takeaway",
          settled: true
        });
      }
    }
    const { data: billData } = await supabaseAdmin.from("doppio_bills").insert(bills).select();
    billIds = billData ? billData.map(r => r.id) : [];
  }

  // 10. Update doppio_business_profile feature_flags with the list of seeded record IDs
  const demoDataIds = {
    menu: menuData ? menuData.map(r => r.id) : [],
    inventory: invData ? invData.map(r => r.id) : [],
    inventory_batches: batchIds,
    recipes: recipeIds,
    employees: employeeIds,
    bills: billIds
  };

  await supabaseAdmin
    .from("doppio_business_profile")
    .update({
      feature_flags: JSON.stringify({
        seeding_disabled: true,
        demo_loaded: true,
        demo_data_ids: demoDataIds
      })
    })
    .eq("tenant_id", tenantId);

  return { success: true };
}

async function purgeTenantDemoData(supabaseAdmin, tenantId) {
  // 1. Fetch feature flags from doppio_business_profile
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("doppio_business_profile")
    .select("feature_flags")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (profileErr || !profile) {
    return { error: "Client business profile was not found." };
  }

  let flags = {};
  try {
    flags = typeof profile.feature_flags === "string"
      ? JSON.parse(profile.feature_flags)
      : profile.feature_flags || {};
  } catch (err) {
    flags = {};
  }

  const demoDataIds = flags.demo_data_ids;
  if (!demoDataIds) {
    return { error: "No recorded demo data found to remove. Use 'Reset data' to fully reset the workspace." };
  }

  const errors = [];

  // Delete from all tables based on IDs
  if (Array.isArray(demoDataIds.bills) && demoDataIds.bills.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_bills").delete().in("id", demoDataIds.bills);
    if (error) errors.push("doppio_bills");
  }
  if (Array.isArray(demoDataIds.recipes) && demoDataIds.recipes.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_custom_recipes").delete().in("id", demoDataIds.recipes);
    if (error) errors.push("doppio_custom_recipes");
  }
  if (Array.isArray(demoDataIds.inventory_batches) && demoDataIds.inventory_batches.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_inventory_batches").delete().in("id", demoDataIds.inventory_batches);
    if (error) errors.push("doppio_inventory_batches");
  }
  if (Array.isArray(demoDataIds.inventory) && demoDataIds.inventory.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_inventory").delete().in("id", demoDataIds.inventory);
    if (error) errors.push("doppio_inventory");
  }
  if (Array.isArray(demoDataIds.employees) && demoDataIds.employees.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_employees").delete().in("id", demoDataIds.employees);
    if (error) errors.push("doppio_employees");
  }
  if (Array.isArray(demoDataIds.menu) && demoDataIds.menu.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_menu").delete().in("id", demoDataIds.menu);
    if (error) errors.push("doppio_menu");
  }

  // Update profile feature flags
  delete flags.demo_data_ids;
  flags.demo_loaded = false;

  const { error: updateProfileErr } = await supabaseAdmin
    .from("doppio_business_profile")
    .update({ feature_flags: JSON.stringify(flags) })
    .eq("tenant_id", tenantId);

  if (updateProfileErr) {
    errors.push("doppio_business_profile");
  }

  if (errors.length > 0) {
    return { error: "Failed to purge demo data from tables: " + errors.join(", ") };
  }

  return { success: true };
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const action = args[0];
    const payloadStr = args[1] || "{}";
    const authHeader = args[2] || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log(JSON.stringify({ error: "Supabase local proxy config is incomplete." }));
      process.exit(1);
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const verified = await verifySuperadminToken(token);
    if (!verified.ok) {
      console.log(JSON.stringify({ error: verified.error }));
      process.exit(1);
    }

    const payload = JSON.parse(payloadStr);
    const tenantId = String(payload.tenant_id || "").trim();

    if (!tenantId) {
      console.log(JSON.stringify({ error: "Tenant ID is required." }));
      process.exit(1);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "seed_tenant_data") {
      const result = await seedTenantData(supabaseAdmin, tenantId);
      console.log(JSON.stringify(result));
    } else if (action === "reset_tenant_data") {
      const result = await resetTenantData(supabaseAdmin, tenantId);
      console.log(JSON.stringify(result));
    } else if (action === "purge_demo_data") {
      const result = await purgeTenantDemoData(supabaseAdmin, tenantId);
      console.log(JSON.stringify(result));
    } else {
      console.log(JSON.stringify({ error: "Unsupported local action: " + action }));
    }
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
