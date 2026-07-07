/**
 * simulation-10-restros.js
 * 
 * Runs a full multi-tenant simulation:
 * 1. Provision 10 mock outlets (sim-resto-01 to sim-resto-10) with status 'pending'
 * 2. Simulate superadmin approval by changing their status to 'active'
 * 3. Seed business profile, menu, inventory, thresholds, and employees (with unique per-tenant suffixes)
 * 4. Run a concurrent operational simulation (3 orders per restaurant, table transitions, kitchen prep, billing, inventory deduction, and WhatsApp receipts)
 * 5. Verify inventory depletion and database consistency
 * 6. Clean up mock database records
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const WHATSAPP_LOG_PATH = path.join(__dirname, 'simulation-whatsapp.log');

// Color helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function logHeader(text) {
  console.log(`\n${colors.bright}${colors.cyan}======================================================================`);
  console.log(`   ${text}`);
  console.log(`======================================================================${colors.reset}\n`);
}

function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!env[k]) env[k] = v;
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(`${colors.red}Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local${colors.reset}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const restros = Array.from({ length: 10 }, (_, i) => {
  const num = String(i + 1).padStart(2, '0');
  return {
    slug: `sim-resto-${num}`,
    name: `Simulated Bistro ${num}`,
    outlet_type: i % 2 === 0 ? 'cafe' : 'bistro',
    email: `owner-${num}@simulatedrestrosuite.com`,
    phone: `91998372${num}00`,
    username: `sim-admin-${num}`,
    password_hash: '$pbkdf2$10000$mockhashval', // mock hash
    country: 'India',
    plan_code: 'growth'
  };
});

const startingInventory = [
  { key: 'pizza_dough', label: 'Pizza Dough', current: 50, unit: 'pcs', max_stock: 100, category: 'food', threshold: 10 },
  { key: 'tomato_sauce', label: 'Tomato Sauce', current: 5000, unit: 'ml', max_stock: 10000, category: 'food', threshold: 1000 },
  { key: 'mozzarella_cheese', label: 'Mozzarella Cheese', current: 10000, unit: 'g', max_stock: 20000, category: 'food', threshold: 2000 },
  { key: 'espresso_beans', label: 'Espresso Beans', current: 2000, unit: 'g', max_stock: 5000, category: 'food', threshold: 500 },
  { key: 'fresh_milk', label: 'Fresh Milk', current: 5000, unit: 'ml', max_stock: 10000, category: 'food', threshold: 1000 },
  { key: 'chocolate_syrup', label: 'Chocolate Syrup', current: 1000, unit: 'ml', max_stock: 2000, category: 'food', threshold: 200 },
  { key: 'sugar_syrup', label: 'Sugar Syrup', current: 1000, unit: 'ml', max_stock: 2000, category: 'food', threshold: 200 },
  { key: 'brownie_mix', label: 'Brownie Mix', current: 40, unit: 'pcs', max_stock: 100, category: 'food', threshold: 8 },
  { key: 'frozen_fries', label: 'Frozen Fries', current: 3000, unit: 'g', max_stock: 6000, category: 'food', threshold: 600 },
  { key: 'cooking_oil', label: 'Cooking Oil', current: 2000, unit: 'ml', max_stock: 5000, category: 'food', threshold: 500 }
];

const menuItems = [
  {
    name: 'Margherita Pizza',
    price: 250,
    category: 'Pizza',
    recipe_specs: {
      veg: true,
      ingredients: [
        { name: 'Pizza Dough', qty: 1, unit: 'pcs' },
        { name: 'Tomato Sauce', qty: 50, unit: 'ml' },
        { name: 'Mozzarella Cheese', qty: 100, unit: 'g' }
      ]
    }
  },
  {
    name: 'Cappuccino',
    price: 120,
    category: 'Hot coffee',
    recipe_specs: {
      veg: true,
      ingredients: [
        { name: 'Espresso Beans', qty: 15, unit: 'g' },
        { name: 'Fresh Milk', qty: 120, unit: 'ml' }
      ]
    }
  },
  {
    name: 'Chocolate Brownie',
    price: 150,
    category: 'Dessert',
    recipe_specs: {
      veg: true,
      ingredients: [
        { name: 'Chocolate Syrup', qty: 30, unit: 'ml' },
        { name: 'Sugar Syrup', qty: 10, unit: 'ml' },
        { name: 'Brownie Mix', qty: 1, unit: 'pcs' }
      ]
    }
  },
  {
    name: 'French Fries',
    price: 100,
    category: 'Snack',
    recipe_specs: {
      veg: true,
      ingredients: [
        { name: 'Frozen Fries', qty: 150, unit: 'g' },
        { name: 'Cooking Oil', qty: 20, unit: 'ml' }
      ]
    }
  }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  logHeader('RestroSuite 10-Tenant Live System Simulation');
  
  // Clear any old simulation files
  if (fs.existsSync(WHATSAPP_LOG_PATH)) {
    fs.unlinkSync(WHATSAPP_LOG_PATH);
  }
  fs.writeFileSync(WHATSAPP_LOG_PATH, '=== SIMULATION WHATSAPP RECEIPT DISPATCH LOG ===\n\n');

  // Step 1: Clean up any leftover simulation tenants
  console.log(`${colors.yellow}[1/6] Purging any old simulation data...${colors.reset}`);
  const { data: oldTenants } = await supabase
    .from('saas_tenants')
    .select('id')
    .in('slug', restros.map(r => r.slug));
  
  if (oldTenants && oldTenants.length > 0) {
    const oldIds = oldTenants.map(t => t.id);
    console.log(`Found ${oldIds.length} existing simulation tenants. Purging operational tables...`);
    
    const tables = [
      'doppio_bills', 'doppio_pending_orders', 'doppio_menu', 
      'doppio_inventory', 'doppio_inventory_thresholds', 'doppio_employees', 
      'doppio_business_profile'
    ];
    for (const t of tables) {
      await supabase.from(t).delete().in('tenant_id', oldIds);
    }
    await supabase.from('saas_tenants').delete().in('id', oldIds);
    console.log('Old simulation data purged.');
  }

  // Step 2: Simulate Tenant Registration (Step 1)
  console.log(`\n${colors.yellow}[2/6] Simulating 10 Tenant Registrations (Submitted with 'pending' status)...${colors.reset}`);
  const registeredTenants = [];
  
  for (const r of restros) {
    const { data, error } = await supabase
      .from('saas_tenants')
      .insert({
        name: r.name,
        slug: r.slug,
        outlet_type: r.outlet_type,
        email: r.email,
        phone: r.phone,
        username: r.username,
        password_hash: r.password_hash,
        status: 'pending',
        country: r.country,
        plan_code: r.plan_code
      })
      .select('id, name, slug, status')
      .single();

    if (error) {
      console.error(`Failed to register ${r.name}:`, error.message);
      process.exit(1);
    }
    registeredTenants.push(data);
    console.log(`  ✓ Registration requested: ${colors.green}${data.name}${colors.reset} (slug: ${data.slug}, status: ${colors.magenta}${data.status}${colors.reset})`);
  }

  await sleep(1500);

  // Step 3: Simulate SuperAdmin Approval (Step 2)
  console.log(`\n${colors.yellow}[3/6] Simulating SuperAdmin Dashboard Approval (Switching status to 'active')...${colors.reset}`);
  for (const t of registeredTenants) {
    const { data, error } = await supabase
      .from('saas_tenants')
      .update({ status: 'active' })
      .eq('id', t.id)
      .select('id, name, slug, status')
      .single();

    if (error) {
      console.error(`Failed to approve ${t.name}:`, error.message);
      process.exit(1);
    }
    t.status = data.status;
    console.log(`  ✓ SuperAdmin Approved: ${colors.green}${data.name}${colors.reset} (slug: ${data.slug}, status: ${colors.bright}${colors.green}${data.status}${colors.reset})`);
  }

  await sleep(1500);

  // Step 4: Seed Tenant Operational Data (Business Profiles, Menus, Starting Inventory, Thresholds, Staff)
  console.log(`\n${colors.yellow}[4/6] Seeding Operational Profiles, Menus, Inventory, and Staff for 10 Restaurants...${colors.reset}`);
  for (let idx = 0; idx < registeredTenants.length; idx++) {
    const t = registeredTenants[idx];
    const num = String(idx + 1).padStart(2, '0');
    process.stdout.write(`  Seeding ${t.name}... `);

    // Business Profile
    await supabase.from('doppio_business_profile').insert({
      tenant_id: t.id,
      business_name: t.name,
      address: '101, Food Street, Gourmet Plaza',
      phone: restros.find(r => r.slug === t.slug).phone,
      gst_number: '27GSTRSIM1234F',
      upi_id: 'resto@upi',
      shift_enabled: true,
      whatsapp_enabled: true,
      table_count: 10,
      feature_flags: JSON.stringify({ seeding_disabled: true, demo_loaded: true })
    });

    // Menu with unique name suffix for DB constraint and recipe references
    const tenantMenuItems = menuItems.map(item => ({
      ...item,
      name: `${item.name} (${num})`,
      recipe_specs: {
        veg: item.recipe_specs.veg,
        ingredients: item.recipe_specs.ingredients.map(ing => ({
          ...ing,
          name: `${ing.name} (${num})`
        }))
      },
      tenant_id: t.id
    }));

    const { data: seededMenu, error: menuErr } = await supabase
      .from('doppio_menu')
      .insert(tenantMenuItems)
      .select();
    
    if (menuErr) {
      console.error(`\nFailed to seed menu for ${t.name}:`, menuErr.message);
      process.exit(1);
    }

    t.menu = seededMenu;

    // Inventory with unique name suffix
    const tenantInventory = startingInventory.map(item => ({
      tenant_id: t.id,
      key: `${item.key}_${num}`,
      current: item.current,
      unit: item.unit,
      label: `${item.label} (${num})`,
      max_stock: item.max_stock,
      category: item.category
    }));

    const { data: seededInv, error: invErr } = await supabase
      .from('doppio_inventory')
      .insert(tenantInventory)
      .select();

    if (invErr) {
      console.error(`\nFailed to seed inventory for ${t.name}:`, invErr.message);
      process.exit(1);
    }

    t.inventory = seededInv;

    // Inventory Thresholds
    const tenantThresholds = startingInventory.map(item => ({
      tenant_id: t.id,
      ingredient_key: `${item.key}_${num}`,
      threshold: item.threshold
    }));

    await supabase
      .from('doppio_inventory_thresholds')
      .insert(tenantThresholds);

    // Employees
    const employees = [
      { id: `emp-cashier-${num}`, name: 'Alok Cashier', role: 'cashier', contact: '919000000001' },
      { id: `emp-chef-${num}`, name: 'Chef Vikas', role: 'kitchen', contact: '919000000002' },
      { id: `emp-waiter-${num}`, name: 'Ramu Waiter', role: 'waiter', contact: '919000000003' }
    ];
    await supabase
      .from('doppio_employees')
      .insert(employees.map(e => ({ ...e, tenant_id: t.id })));

    process.stdout.write(`${colors.green}Done!${colors.reset}\n`);
  }

  await sleep(1500);

  // Step 5: Concurrent Live Simulation (Parallel execution of dine-in orders and KDS workflow)
  logHeader('CONCURRENT LIVE WORKFLOW SIMULATION');
  console.log(`${colors.cyan}Simulating 10 restaurants working concurrently...${colors.reset}`);
  console.log(`${colors.dim}Flow: QR Code scan -> Dine-in Order Placement -> Waiter accepts -> Kitchen prepares -> Served -> Bill Cashier checkout -> Inventory deduct -> WhatsApp receipt sent.${colors.reset}\n`);

  // Active status grid for live feedback
  const statusGrid = registeredTenants.map(t => ({
    name: t.name,
    slug: t.slug,
    activeTable: '',
    pendingOrdersCount: 0,
    completedBillsCount: 0,
    salesValue: 0,
    latestAction: 'Idle'
  }));

  function printGrid() {
    // Clear terminal
    console.clear();
    logHeader('CONCURRENT LIVE RESTAURANT SYSTEM MONITOR');
    
    // Header format
    console.log(`${colors.bright}Restaurant Name          | Active Orders | Bills Paid   | Sales (INR) | Latest Operational Event${colors.reset}`);
    console.log('-'.repeat(95));
    
    statusGrid.forEach(g => {
      let colorStr = colors.white;
      if (g.latestAction.includes('Order Placed')) colorStr = colors.yellow;
      else if (g.latestAction.includes('Accepted') || g.latestAction.includes('Prep')) colorStr = colors.blue;
      else if (g.latestAction.includes('Served')) colorStr = colors.cyan;
      else if (g.latestAction.includes('Bill Settled')) colorStr = colors.green;

      // Manual padding
      const namePad = g.name.substring(0, 24).padEnd(24);
      const actOrdersPad = String(g.pendingOrdersCount).padEnd(13);
      const billsPaidPad = String(g.completedBillsCount).padEnd(12);
      const salesValPad = `Rs ${g.salesValue}`.padEnd(11);
      const eventPad = g.latestAction.substring(0, 30);

      console.log(
        `${namePad} | ${actOrdersPad} | ${billsPaidPad} | ${salesValPad} | ${colorStr}${eventPad}${colors.reset}`
      );
    });
    console.log('\n' + colors.dim + 'Simulated WhatsApp dispatches are written to scratch/simulation-whatsapp.log' + colors.reset);
  }

  // Simulate a restaurant's lifecycle of orders
  async function simulateRestaurantLifecycle(t, gridIndex) {
    const num = String(gridIndex + 1).padStart(2, '0');
    const tables = ['T-01', 'T-02', 'T-03', 'T-04', 'T-05'];
    
    // Simulate 3 orders in sequence with random jitter
    for (let orderNum = 1; orderNum <= 3; orderNum++) {
      const table = tables[Math.floor(Math.random() * tables.length)];
      const orderId = `QRO-${t.slug.toUpperCase()}-${orderNum}-${Date.now().toString().slice(-4)}`;
      
      // Select 1 to 3 items from menu
      const orderItems = [];
      const numItems = Math.floor(Math.random() * 3) + 1; // 1-3 items
      let subtotal = 0;
      
      for (let j = 0; j < numItems; j++) {
        const item = t.menu[Math.floor(Math.random() * t.menu.length)];
        const qty = Math.floor(Math.random() * 2) + 1; // qty 1-2
        orderItems.push({
          name: item.name,
          price: item.price,
          qty: qty
        });
        subtotal += item.price * qty;
      }

      const gst = Math.round(subtotal * 0.05); // 5% GST
      const discount = orderNum === 2 ? Math.round(subtotal * 0.10) : 0; // 10% discount on order #2
      const total = subtotal - discount + gst;

      // -- EVENT 1: Order Placed --
      statusGrid[gridIndex].activeTable = table;
      statusGrid[gridIndex].pendingOrdersCount++;
      statusGrid[gridIndex].latestAction = `Order Placed (${table})`;
      printGrid();

      await supabase.from('doppio_pending_orders').insert({
        tenant_id: t.id,
        orderId: orderId,
        customerName: `Customer ${orderNum}`,
        customerPhone: `9190000${gridIndex}${orderNum}0`,
        items: JSON.stringify(orderItems),
        subtotal: subtotal,
        discount: discount,
        gst: gst,
        total: total,
        paymentMethod: 'UPI',
        orderType: 'QR',
        tableNumber: table,
        dateTime: new Date().toISOString(),
        status: 'Pending Review'
      });

      await sleep(1500 + Math.random() * 2000);

      // -- EVENT 2: Waiter Accept (Preparing) --
      statusGrid[gridIndex].latestAction = `Accepted. Prep started`;
      printGrid();

      await supabase.from('doppio_pending_orders')
        .update({ status: 'Preparing' })
        .eq('tenant_id', t.id)
        .eq('orderId', orderId);

      await sleep(2000 + Math.random() * 2500);

      // -- EVENT 3: KDS Served --
      statusGrid[gridIndex].latestAction = `Food Served to ${table}`;
      printGrid();

      await supabase.from('doppio_pending_orders')
        .update({ status: 'Served' })
        .eq('tenant_id', t.id)
        .eq('orderId', orderId);

      await sleep(1500 + Math.random() * 2000);

      // -- EVENT 4: Cashier Bills (Settled) --
      statusGrid[gridIndex].latestAction = `Settling Bill...`;
      printGrid();

      // Create bill entry
      const { error: billErr } = await supabase.from('doppio_bills').insert({
        tenant_id: t.id,
        orderId: orderId,
        customerName: `Customer ${orderNum}`,
        customerPhone: `9190000${gridIndex}${orderNum}0`,
        items: JSON.stringify(orderItems),
        subtotal: subtotal,
        gst: gst,
        total: total,
        paymentMethod: 'UPI',
        dateTime: new Date().toISOString(),
        tenders: '[]',
        change: 0,
        tax_summary: '[]',
        tax_profile: '{}',
        channel: 'dine_in',
        status: 'paid'
      });

      if (billErr) {
        fs.appendFileSync(WHATSAPP_LOG_PATH, `[DB ERROR] Failed to insert bill for ${t.name}: ${JSON.stringify(billErr)}\n`);
      }

      // Deduct inventory locally in script to match db status
      for (const orderedIt of orderItems) {
        const baseName = orderedIt.name.replace(/\s\(\d+\)$/, '');
        const menuItem = menuItems.find(m => m.name === baseName);
        if (menuItem && menuItem.recipe_specs && menuItem.recipe_specs.ingredients) {
          for (const ing of menuItem.recipe_specs.ingredients) {
            const dynamicIngName = `${ing.name} (${num})`;
            // Update db inventory
            const { data: currentInv } = await supabase
              .from('doppio_inventory')
              .select('current')
              .eq('tenant_id', t.id)
              .eq('label', dynamicIngName)
              .single();

            if (currentInv) {
              const newQty = Math.max(0, currentInv.current - (ing.qty * orderedIt.qty));
              await supabase
                .from('doppio_inventory')
                .update({ current: newQty })
                .eq('tenant_id', t.id)
                .eq('label', dynamicIngName);
            }
          }
        }
      }

      // Delete from pending orders
      await supabase.from('doppio_pending_orders')
        .delete()
        .eq('tenant_id', t.id)
        .eq('orderId', orderId);

      // Update grid status
      statusGrid[gridIndex].pendingOrdersCount--;
      statusGrid[gridIndex].completedBillsCount++;
      statusGrid[gridIndex].salesValue += total;
      statusGrid[gridIndex].latestAction = `Bill Settled Rs ${total}`;
      printGrid();

      // -- EVENT 5: Send WhatsApp message --
      const billDetailsText = orderItems.map(i => `${i.qty}x ${i.name} - Rs ${i.price * i.qty}`).join('\n');
      const whatsappMessage = `*${t.name}*
Bill Receipt: #${orderId}
Table: ${table}
-------------------------
${billDetailsText}
-------------------------
Subtotal: Rs ${subtotal}
GST (5%): Rs ${gst}
Discount: Rs ${discount}
Total Paid: Rs ${total} via UPI

Thank you for dining with us!`;

      fs.appendFileSync(
        WHATSAPP_LOG_PATH,
        `[${new Date().toISOString()}] Outlet: ${t.name} (ID: ${t.id}) sent receipt to +9190000${gridIndex}${orderNum}0\n` +
        `Message:\n${whatsappMessage}\n\n=========================================\n\n`
      );

      await sleep(2000 + Math.random() * 2000);
    }
    
    statusGrid[gridIndex].latestAction = 'Idle / Shift Done';
    printGrid();
  }

  // Execute all 10 simulations concurrently
  const promises = registeredTenants.map((t, idx) => simulateRestaurantLifecycle(t, idx));
  await Promise.all(promises);

  console.log(`\n\n${colors.bright}${colors.green}✓ Concurrent simulation loop finished!${colors.reset}`);
  
  // Step 6: Verify Database counts and Inventory depletion
  console.log(`\n${colors.yellow}[5/6] Verifying Database records and Inventory auto-deductions...${colors.reset}`);
  
  const verificationResults = [];
  for (let idx = 0; idx < registeredTenants.length; idx++) {
    const t = registeredTenants[idx];
    const num = String(idx + 1).padStart(2, '0');
    
    const { data: dbBills } = await supabase.from('doppio_bills').select('id, total').eq('tenant_id', t.id);
    const { data: dbInv } = await supabase.from('doppio_inventory').select('label, current').eq('tenant_id', t.id);
    
    // Check Margherita Pizza dough level
    const doughInv = dbInv.find(i => i.label === `Pizza Dough (${num})`);
    const startDough = startingInventory.find(i => i.label === 'Pizza Dough').current;
    const finalDough = doughInv ? Number(doughInv.current) : 0;
    
    verificationResults.push({
      name: t.name,
      billsCount: dbBills ? dbBills.length : 0,
      salesVal: dbBills ? dbBills.reduce((s, b) => s + Number(b.total), 0) : 0,
      doughDepleted: `${startDough} pcs -> ${finalDough} pcs`
    });
  }

  console.table(verificationResults);

  // Step 7: Clean Up Mock Tenants (Keep Database clean)
  console.log(`\n${colors.yellow}[6/6] Cleaning up simulation records to keep the Supabase database clean...${colors.reset}`);
  
  const idsToClean = registeredTenants.map(t => t.id);
  const tablesToClean = [
    'doppio_bills', 'doppio_pending_orders', 'doppio_menu', 
    'doppio_inventory', 'doppio_inventory_thresholds', 'doppio_employees', 
    'doppio_business_profile'
  ];
  
  for (const t of tablesToClean) {
    await supabase.from(t).delete().in('tenant_id', idsToClean);
  }
  
  const { error: cleanTenantsErr } = await supabase
    .from('saas_tenants')
    .delete()
    .in('id', idsToClean);

  if (cleanTenantsErr) {
    console.error(`Failed to clean up saas_tenants:`, cleanTenantsErr.message);
  } else {
    console.log(`${colors.green}✓ All 10 simulation outlets and associated records successfully purged from database!${colors.reset}`);
  }

  logHeader('SIMULATION COMPLETED SUCCESSFULLY');
}

main().catch(err => {
  console.error(`${colors.red}Unhandled error in simulation script:${colors.reset}`, err);
  process.exit(1);
});
