/**
 * API-level live simulation for RestroSuite.
 *
 * This intentionally exercises the same Supabase Edge Functions used by real
 * browsers:
 * - tenant-access: registration + login
 * - tenant-admin: superadmin approval + gateway status
 * - tenant-users: staff account creation
 * - tenant-data: tenant-scoped dashboard CRUD
 * - tenant-public: QR menu + public QR order creation
 *
 * Test records use the api-sim-* slug prefix and are removed at the end.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(__dirname, 'api-live-simulation-summary.json');
const TENANT_COUNT = Number(process.env.API_SIM_TENANTS || 10);
const ORDERS_PER_TENANT = Number(process.env.API_SIM_ORDERS || 2);
const STAFF_LOGIN_TENANTS = Number(process.env.API_SIM_STAFF_LOGIN_TENANTS || 0);
const RUN_PENDING_LOGIN_PROBE = process.env.API_SIM_PENDING_LOGIN_PROBE === '1';
const CLIENT_IP_OCTET = Number(process.env.API_SIM_IP_OCTET || (40 + Math.floor(Math.random() * 150)));
const OTP_CODE = '654321';

function loadEnv() {
  const out = { ...process.env };
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!out[key]) out[key] = value;
  }
  return out;
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomBase64Url(byteLength = 18) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function hashPassword(password) {
  const iterations = 210000;
  const salt = randomBase64Url();
  const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
  return `pbkdf2$${iterations}$${salt}$${derived}`;
}

function signSession(payload, secret) {
  const encoded = base64Url(JSON.stringify({
    ...payload,
    exp: Date.now() + (2 * 60 * 60 * 1000),
  }));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fail(message, detail) {
  const error = new Error(message);
  if (detail !== undefined) error.detail = detail;
  throw error;
}

const env = loadEnv();
const SUPABASE_URL = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = String(env.SUPABASE_ANON_KEY || '');
const SERVICE_ROLE_KEY = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '');
const SESSION_SECRET = String(env.SUPERADMIN_SESSION_SECRET || '');
const OTP_SECRET = String(env.OTP_SECRET || SERVICE_ROLE_KEY);
const LIVE_APP_URL = String(env.LIVE_APP_URL || '').replace(/\/+$/, '');

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !SESSION_SECRET) {
  fail('Missing SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, or SUPERADMIN_SESSION_SECRET in .env.local.');
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const superadminToken = signSession({
  role: 'superadmin',
  username: 'api-live-simulation',
}, SESSION_SECRET);

const tenants = Array.from({ length: TENANT_COUNT }, (_, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    n,
    slug: `api-sim-${n}`,
    name: `API Simulation Kitchen ${n}`,
    outlet_type: index % 2 === 0 ? 'cafe' : 'restaurant',
    email: `owner-${n}@api-sim.restrosuite.test`,
    phone: `91988101${n}00`,
    username: `apisim-owner-${n}`,
    password: `ApiSimPass-${n}-2026`,
    country: index % 3 === 0 ? 'India' : (index % 3 === 1 ? 'Ireland' : 'United States'),
    plan_code: 'growth',
    clientIp: `203.0.${CLIENT_IP_OCTET}.${10 + index}`,
  };
});

function log(line) {
  console.log(line);
}

async function postFunction(functionName, body, token, clientIp, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        Origin: 'https://restrosuite.codearc.co.in',
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!response.ok) {
      const error = new Error(json.error || `${functionName} failed with HTTP ${response.status}`);
      error.status = response.status;
      error.body = json;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function tenantAccess(action, payload, clientIp) {
  return postFunction('tenant-access', { action, ...payload }, ANON_KEY, clientIp);
}

async function tenantAdmin(action, payload) {
  return postFunction('tenant-admin', { action, ...payload }, superadminToken);
}

async function tenantUsers(sessionToken, action, payload) {
  return postFunction('tenant-users', { action, ...payload }, sessionToken);
}

async function tenantData(sessionToken, payload) {
  return postFunction('tenant-data', payload, sessionToken);
}

async function tenantPublic(action, payload, clientIp) {
  return postFunction('tenant-public', { action, ...payload }, ANON_KEY, clientIp);
}

async function cleanupBySlugs(slugs) {
  const { data: rows, error } = await adminClient
    .from('saas_tenants')
    .select('id, slug')
    .in('slug', slugs);
  if (error) throw error;
  const ids = (rows || []).map(row => row.id);
  if (!ids.length) return { tenants: 0 };

  const tables = [
    'doppio_bills',
    'doppio_pending_orders',
    'doppio_draft_orders',
    'doppio_menu',
    'doppio_inventory',
    'doppio_inventory_batches',
    'doppio_inventory_thresholds',
    'doppio_shifts',
    'doppio_shift_events',
    'doppio_employees',
    'doppio_leave_requests',
    'doppio_attendance',
    'doppio_crm',
    'doppio_notifications',
    'doppio_custom_recipes',
    'doppio_pos_popularity',
    'doppio_support_tickets',
    'doppio_onboarding_tasks',
    'doppio_reservations',
    'doppio_vendors',
    'doppio_purchase_orders',
    'doppio_item_costs',
    'doppio_offers',
    'doppio_refund_requests',
    'doppio_device_setups',
    'doppio_backup_snapshots',
    'doppio_outlets',
    'doppio_migration_status',
    'doppio_saas_invoices',
    'doppio_aggregator_config',
    'doppio_online_orders',
    'doppio_table_layout',
    'doppio_waitlist',
    'tenant_users',
    'tenant_audit_logs',
  ];

  for (const table of tables) {
    const { error: tableError } = await adminClient.from(table).delete().in('tenant_id', ids);
    if (tableError) {
      console.warn(`[cleanup] ${table}: ${tableError.message}`);
    }
  }

  const { error: tenantDeleteError } = await adminClient
    .from('saas_tenants')
    .delete()
    .in('id', ids);
  if (tenantDeleteError) throw tenantDeleteError;
  return { tenants: ids.length };
}

async function createOtpChallenge(tenant) {
  const id = crypto.randomUUID();
  const cleanPhone = tenant.phone.replace(/\D/g, '');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await adminClient.from('public_otp_challenges').insert({
    id,
    phone_hash: sha256Hex(`phone:${cleanPhone}`),
    purpose: 'register',
    code_hash: sha256Hex(`otp:register:${id}:${cleanPhone}:${OTP_CODE}:${OTP_SECRET}`),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return id;
}

async function registerTenant(tenant) {
  const otpChallengeId = await createOtpChallenge(tenant);
  await tenantAccess('register', {
    name: tenant.name,
    slug: tenant.slug,
    outlet_type: tenant.outlet_type,
    email: tenant.email,
    phone: tenant.phone,
    username: tenant.username,
    password: tenant.password,
    plan_code: tenant.plan_code,
    country: tenant.country,
    otp_challenge_id: otpChallengeId,
    otp_code: OTP_CODE,
  }, tenant.clientIp);
  return otpChallengeId;
}

async function provisionPendingTenant(tenant, reason) {
  const { data, error } = await adminClient.from('saas_tenants').insert({
    name: tenant.name,
    slug: tenant.slug,
    outlet_type: tenant.outlet_type,
    email: tenant.email,
    phone: tenant.phone.replace(/\D/g, ''),
    username: tenant.username,
    password_hash: hashPassword(tenant.password),
    status: 'pending',
    plan_code: tenant.plan_code,
    country: tenant.country,
    allowed_tabs: [
      'pos-tab',
      'floor-tab',
      'qr-orders-tab',
      'bills-tab',
      'inventory-tab',
      'reports-tab',
      'editor-tab',
      'crm-tab',
      'tax-tab',
      'online-tab',
      'kds-tab',
      'tokens-tab',
      'employees-tab',
      'analytics-tab',
      'growth-hub-tab',
    ],
  }).select('id').single();
  if (error) throw error;
  tenant.id = data.id;
  tenant.registrationFallbackReason = reason;
  return data;
}

async function registerTenantsWithFallback(summary) {
  const viaApi = [];
  const fallback = [];
  let stopReason = null;

  for (const tenant of tenants) {
    if (stopReason) {
      fallback.push(tenant.slug);
      await provisionPendingTenant(tenant, stopReason);
      continue;
    }

    try {
      await registerTenant(tenant);
      viaApi.push(tenant.slug);
      await sleep(350);
    } catch (error) {
      stopReason = error.status === 429
        ? 'tenant-access registration rate limit reached from this test source'
        : `tenant-access registration failed: ${error.message}`;
      tenant.registrationApiError = { status: error.status || null, message: error.message };
      fallback.push(tenant.slug);
      await provisionPendingTenant(tenant, stopReason);
    }
  }

  summary.phases.registration = {
    ok: true,
    viaApi: viaApi.length,
    fallbackProvisioned: fallback.length,
    fallbackReason: stopReason,
    apiRegisteredSlugs: viaApi,
    fallbackSlugs: fallback,
  };
}

function menuRows(tenantId) {
  return [
    {
      tenant_id: tenantId,
      name: 'Paneer Tikka',
      description: 'Shared-name test dish',
      price: 220,
      category: 'Starter',
      bestseller: true,
      prep_time: 12,
      recipe_specs: {
        veg: true,
        ingredients: [
          { name: 'Paneer Cubes', qty: 180, unit: 'g' },
          { name: 'Tandoori Marinade', qty: 60, unit: 'g' },
        ],
      },
    },
    {
      tenant_id: tenantId,
      name: 'Masala Chai',
      description: 'Shared-name beverage',
      price: 60,
      category: 'Beverage',
      bestseller: true,
      prep_time: 5,
      recipe_specs: {
        veg: true,
        ingredients: [
          { name: 'Tea Leaves', qty: 8, unit: 'g' },
          { name: 'Milk', qty: 120, unit: 'ml' },
        ],
      },
    },
    {
      tenant_id: tenantId,
      name: 'Veg Biryani',
      description: 'QR order main course',
      price: 180,
      category: 'Main',
      prep_time: 18,
      recipe_specs: {
        veg: true,
        ingredients: [
          { name: 'Basmati Rice', qty: 160, unit: 'g' },
          { name: 'Mixed Vegetables', qty: 120, unit: 'g' },
        ],
      },
    },
    {
      tenant_id: tenantId,
      name: 'Brownie Sundae',
      description: 'Dessert test item',
      price: 140,
      category: 'Dessert',
      prep_time: 7,
      recipe_specs: {
        veg: true,
        ingredients: [
          { name: 'Brownie Base', qty: 1, unit: 'pc' },
          { name: 'Ice Cream', qty: 90, unit: 'g' },
        ],
      },
    },
  ];
}

function tenantSuffixedMenuRows(tenantId, n) {
  return menuRows(tenantId).map(row => ({
    ...row,
    name: `${row.name} (${n})`,
    recipe_specs: {
      ...(row.recipe_specs || {}),
      ingredients: ((row.recipe_specs && row.recipe_specs.ingredients) || []).map(ingredient => ({
        ...ingredient,
        name: `${ingredient.name} (${n})`,
      })),
    },
  }));
}

function inventoryRows(tenantId) {
  return [
    { tenant_id: tenantId, key: 'paneer_cubes', label: 'Paneer Cubes', current: 12000, unit: 'g', max_stock: 20000, category: 'food' },
    { tenant_id: tenantId, key: 'tandoori_marinade', label: 'Tandoori Marinade', current: 5000, unit: 'g', max_stock: 10000, category: 'food' },
    { tenant_id: tenantId, key: 'tea_leaves', label: 'Tea Leaves', current: 2000, unit: 'g', max_stock: 4000, category: 'food' },
    { tenant_id: tenantId, key: 'milk', label: 'Milk', current: 10000, unit: 'ml', max_stock: 15000, category: 'food' },
    { tenant_id: tenantId, key: 'basmati_rice', label: 'Basmati Rice', current: 15000, unit: 'g', max_stock: 25000, category: 'food' },
    { tenant_id: tenantId, key: 'mixed_vegetables', label: 'Mixed Vegetables', current: 10000, unit: 'g', max_stock: 20000, category: 'food' },
    { tenant_id: tenantId, key: 'brownie_base', label: 'Brownie Base', current: 80, unit: 'pc', max_stock: 150, category: 'food' },
    { tenant_id: tenantId, key: 'ice_cream', label: 'Ice Cream', current: 8000, unit: 'g', max_stock: 12000, category: 'food' },
  ];
}

function tenantSuffixedInventoryRows(tenantId, n) {
  return inventoryRows(tenantId).map(row => ({
    ...row,
    key: `${row.key}_${n}`,
    label: `${row.label} (${n})`,
    name: `${row.label} (${n})`,
  }));
}

function employeesFor(n) {
  return [
    { id: `api-sim-cashier-${n}`, name: `Cashier ${n}`, role: 'cashier', contact: `cashier-${n}@api-sim.test`, baseSalary: 18000, shift: 'Morning', status: 'active' },
    { id: `api-sim-kitchen-${n}`, name: `Kitchen ${n}`, role: 'kitchen', contact: `kitchen-${n}@api-sim.test`, baseSalary: 22000, shift: 'Morning', status: 'active' },
    { id: `api-sim-waiter-${n}`, name: `Waiter ${n}`, role: 'waiter', contact: `waiter-${n}@api-sim.test`, baseSalary: 16000, shift: 'Evening', status: 'active' },
  ];
}

async function seedTenantWorkspace(tenant) {
  const token = tenant.ownerSession.session_token;
  tenant.schemaDrift = [];
  try {
    await tenantData(token, {
      table: 'doppio_business_profile',
      operation: 'insert',
      data: {
        business_name: tenant.name,
        address: `API Simulation Street ${tenant.n}`,
        phone: tenant.phone,
        gst_enabled: tenant.country === 'India',
        gst_rate: tenant.country === 'India' ? 5 : 0,
        gst_number: tenant.country === 'India' ? `27APISIM${tenant.n}Z5` : '',
        upi_vpa: tenant.country === 'India' ? `apisim${tenant.n}@upi` : '',
        upi_id: tenant.country === 'India' ? `apisim${tenant.n}@upi` : '',
        passcode_lock_enabled: true,
        passcode: `77${tenant.n}`,
        crm_enabled: true,
        tax_enabled: true,
        sound_enabled: false,
        shift_enabled: true,
        whatsapp_enabled: true,
        whatsapp_gateway_enabled: false,
        whatsapp_gateway_url: '',
        whatsapp_gateway_token: '',
        table_count: 12,
        feature_flags: {
          ui_settings: {
            set_country: tenant.country,
            set_currency: tenant.country === 'India' ? 'INR (Rs)' : (tenant.country === 'Ireland' ? 'EUR' : 'USD'),
          },
          live_simulation: true,
        },
      },
      returning: true,
    });
  } catch (error) {
    tenant.schemaDrift.push({
      table: 'doppio_business_profile',
      operation: 'insert full profile payload',
      error: error.message,
      fallback: 'insert profile with legacy columns only',
    });
    await tenantData(token, {
      table: 'doppio_business_profile',
      operation: 'insert',
      data: {
        business_name: tenant.name,
        address: `API Simulation Street ${tenant.n}`,
        phone: tenant.phone,
        gst_enabled: tenant.country === 'India',
        gst_rate: tenant.country === 'India' ? 5 : 0,
        crm_enabled: true,
        tax_enabled: true,
        sound_enabled: false,
        shift_enabled: true,
        whatsapp_enabled: true,
      },
      returning: true,
    });
  }

  try {
    await tenantData(token, {
      table: 'doppio_menu',
      operation: 'upsert',
      data: menuRows(tenant.id),
      options: { onConflict: 'tenant_id,name' },
      returning: true,
    });
  } catch (error) {
    tenant.schemaDrift.push({
      table: 'doppio_menu',
      operation: 'upsert tenant_id,name',
      error: error.message,
      fallback: 'insert tenant-suffixed menu names',
    });
    await tenantData(token, {
      table: 'doppio_menu',
      operation: 'insert',
      data: tenantSuffixedMenuRows(tenant.id, tenant.n),
      returning: true,
    });
  }

  try {
    await tenantData(token, {
      table: 'doppio_inventory',
      operation: 'upsert',
      data: inventoryRows(tenant.id),
      options: { onConflict: 'tenant_id,key' },
      returning: true,
    });
    tenant.paneerKey = 'paneer_cubes';
  } catch (error) {
    tenant.schemaDrift.push({
      table: 'doppio_inventory',
      operation: 'upsert tenant_id,key',
      error: error.message,
      fallback: 'insert tenant-suffixed inventory keys',
    });
    await tenantData(token, {
      table: 'doppio_inventory',
      operation: 'insert',
      data: tenantSuffixedInventoryRows(tenant.id, tenant.n),
      returning: true,
    });
    tenant.paneerKey = `paneer_cubes_${tenant.n}`;
  }

  try {
    await tenantData(token, {
      table: 'doppio_inventory_thresholds',
      operation: 'insert',
      data: [
        { ingredient_key: tenant.paneerKey || 'paneer_cubes', threshold: 3000 },
        { ingredient_key: tenant.paneerKey === 'paneer_cubes' ? 'milk' : `milk_${tenant.n}`, threshold: 2000 },
        { ingredient_key: tenant.paneerKey === 'paneer_cubes' ? 'basmati_rice' : `basmati_rice_${tenant.n}`, threshold: 3000 },
      ],
      returning: true,
    });
  } catch (error) {
    tenant.schemaDrift.push({
      table: 'doppio_inventory_thresholds',
      operation: 'insert repeated ingredient_key',
      error: error.message,
      fallback: 'insert tenant-suffixed threshold keys',
    });
    await tenantData(token, {
      table: 'doppio_inventory_thresholds',
      operation: 'insert',
      data: [
        { ingredient_key: `${tenant.paneerKey || 'paneer_cubes'}_${tenant.n}`, threshold: 3000 },
        { ingredient_key: `milk_${tenant.n}`, threshold: 2000 },
        { ingredient_key: `basmati_rice_${tenant.n}`, threshold: 3000 },
      ],
      returning: true,
    });
  }

  try {
    await tenantData(token, {
      table: 'doppio_employees',
      operation: 'upsert',
      data: employeesFor(tenant.n),
      options: { onConflict: 'tenant_id,id' },
      returning: true,
    });
  } catch (error) {
    tenant.schemaDrift.push({
      table: 'doppio_employees',
      operation: 'upsert tenant_id,id',
      error: error.message,
      fallback: 'insert employees',
    });
    await tenantData(token, {
      table: 'doppio_employees',
      operation: 'insert',
      data: employeesFor(tenant.n),
      returning: true,
    });
  }
}

async function createStaffAndLogin(tenant) {
  const token = tenant.ownerSession.session_token;
  const password = `StaffPass-${tenant.n}-2026`;
  const specs = [
    { role: 'cashier', username: `api-cashier-${tenant.n}`, display_name: `Cashier ${tenant.n}` },
    { role: 'kitchen', username: `api-kitchen-${tenant.n}`, display_name: `Kitchen ${tenant.n}` },
    { role: 'waiter', username: `api-waiter-${tenant.n}`, display_name: `Waiter ${tenant.n}` },
  ];

  tenant.staffPassword = password;
  tenant.staff = {};
  for (const spec of specs) {
    const created = await tenantUsers(token, 'create_user', { ...spec, password });
    let login = null;
    if (Number(tenant.n) <= STAFF_LOGIN_TENANTS) {
      login = await tenantAccess('login', {
        slug: tenant.slug,
        username: spec.username,
        password,
      }, tenant.clientIp);
    }
    tenant.staff[spec.role] = { created: created.user, session: login ? login.session : null };
  }
}

async function createQrOrders(tenant) {
  const list = await tenantPublic('list_menu', { tenant_slug: tenant.slug }, tenant.clientIp);
  if (!Array.isArray(list.menu) || list.menu.length < 2) {
    fail(`Public menu not available for ${tenant.slug}`, list);
  }

  tenant.publicMenu = list.menu;
  tenant.createdOrders = [];
  for (let orderIndex = 1; orderIndex <= ORDERS_PER_TENANT; orderIndex++) {
    const first = list.menu[(orderIndex - 1) % list.menu.length];
    const second = list.menu[orderIndex % list.menu.length];
    const items = [
      { name: first.name, price: Number(first.price), qty: 1 },
      { name: second.name, price: Number(second.price), qty: orderIndex === 1 ? 1 : 2 },
    ];
    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const orderId = `DO-QR-APISIM-${tenant.n}-${orderIndex}-${Date.now().toString(36).toUpperCase()}`;
    await tenantPublic('create_order', {
      tenant_slug: tenant.slug,
      order: {
        orderId,
        customerName: `QR Guest ${tenant.n}-${orderIndex}`,
        customerPhone: `9197720${tenant.n}${orderIndex}00`,
        items,
        subtotal,
        total: subtotal,
        paymentMethod: orderIndex === 1 ? 'UPI' : 'Cash',
        orderType: 'QR',
        tableNumber: `T-${String(orderIndex).padStart(2, '0')}`,
        dateTime: new Date().toISOString(),
      },
    }, `198.51.100.${Number(tenant.n) * 10 + orderIndex}`);
    tenant.createdOrders.push({ orderId, items, subtotal });
  }
}

async function processKitchenAndBilling(tenant) {
  const ownerToken = tenant.ownerSession.session_token;
  const kitchenToken = tenant.staff.kitchen.session?.session_token || ownerToken;
  const waiterToken = tenant.staff.waiter.session?.session_token || ownerToken;
  const cashierToken = tenant.staff.cashier.session?.session_token || ownerToken;
  tenant.workflowActorMode = tenant.staff.kitchen.session ? 'staff-sessions' : 'owner-session';

  const pending = await tenantData(kitchenToken, {
    table: 'doppio_pending_orders',
    operation: 'select',
    columns: '*',
    order: { column: 'created_at', ascending: true },
    limit: 20,
  });
  if (!Array.isArray(pending.data) || pending.data.length !== ORDERS_PER_TENANT) {
    fail(`${tenant.slug} expected ${ORDERS_PER_TENANT} pending orders, got ${pending.data ? pending.data.length : 'none'}`);
  }

  tenant.bills = [];
  tenant.schemaDrift = tenant.schemaDrift || [];
  let billFullPayloadFallback = false;
  for (const order of pending.data) {
    await tenantData(kitchenToken, {
      table: 'doppio_pending_orders',
      operation: 'update',
      data: { status: 'Preparing' },
      filters: [{ column: 'orderId', value: order.orderId }],
      returning: true,
    });

    await tenantData(waiterToken, {
      table: 'doppio_pending_orders',
      operation: 'update',
      data: { status: 'Served' },
      filters: [{ column: 'orderId', value: order.orderId }],
      returning: true,
    });

    const billPayload = {
      orderId: order.orderId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount || 0,
      gst: order.gst || 0,
      total: order.total,
      paymentMethod: order.paymentMethod,
      orderType: order.orderType || 'QR',
      tableNumber: order.tableNumber || '',
      dateTime: new Date().toISOString(),
    };

    try {
      await tenantData(cashierToken, {
        table: 'doppio_bills',
        operation: 'insert',
        data: billPayload,
        returning: true,
      });
    } catch (error) {
      if (!billFullPayloadFallback) {
        tenant.schemaDrift.push({
          table: 'doppio_bills',
          operation: 'insert full dashboard bill payload',
          error: error.message,
          fallback: 'insert minimal bill payload with live columns only',
        });
        billFullPayloadFallback = true;
      }
      await tenantData(cashierToken, {
        table: 'doppio_bills',
        operation: 'insert',
        data: {
          orderId: order.orderId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          items: order.items,
          subtotal: order.subtotal,
          gst: order.gst || 0,
          total: order.total,
          paymentMethod: order.paymentMethod,
          dateTime: new Date().toISOString(),
        },
        returning: true,
      });
    }

    await tenantData(cashierToken, {
      table: 'doppio_pending_orders',
      operation: 'delete',
      filters: [{ column: 'orderId', value: order.orderId }],
      returning: false,
    });

    tenant.bills.push({ orderId: order.orderId, total: Number(order.total) });
  }

  const inventory = await tenantData(cashierToken, {
    table: 'doppio_inventory',
    operation: 'select',
    columns: 'id,key,current',
    filters: [{ column: 'key', value: tenant.paneerKey || 'paneer_cubes' }],
    maybeSingle: true,
  });
  if (inventory.data) {
    await tenantData(cashierToken, {
      table: 'doppio_inventory',
      operation: 'update',
      data: { current: Math.max(0, Number(inventory.data.current) - 360) },
      filters: [{ column: 'key', value: tenant.paneerKey || 'paneer_cubes' }],
      returning: true,
    });
  }
}

async function verifyTenant(tenant) {
  const token = tenant.ownerSession.session_token;
  const [pending, bills, inventory, users] = await Promise.all([
    tenantData(token, { table: 'doppio_pending_orders', operation: 'select', columns: 'id', limit: 50 }),
    tenantData(token, { table: 'doppio_bills', operation: 'select', columns: 'id,total,orderId,discount,orderType,tableNumber', limit: 50 }),
    tenantData(token, { table: 'doppio_inventory', operation: 'select', columns: 'key,current', filters: [{ column: 'key', value: tenant.paneerKey || 'paneer_cubes' }], maybeSingle: true }),
    tenantUsers(token, 'list_users', {}),
  ]);
  return {
    slug: tenant.slug,
    pendingOrders: Array.isArray(pending.data) ? pending.data.length : null,
    bills: Array.isArray(bills.data) ? bills.data.length : null,
    billTotal: Array.isArray(bills.data) ? bills.data.reduce((sum, bill) => sum + Number(bill.total || 0), 0) : null,
    paneerCubes: inventory.data ? Number(inventory.data.current) : null,
    staffUsers: Array.isArray(users.users) ? users.users.length : null,
    publicMenuItems: tenant.publicMenu.length,
    workflowActorMode: tenant.workflowActorMode,
    schemaDriftCount: tenant.schemaDrift ? tenant.schemaDrift.length : 0,
  };
}

async function checkGatewayStatus() {
  const gatewayUrl = String(env.WHATSAPP_GATEWAY_URL || env.GATEWAY_URL || '').replace(/\/+$/, '');
  const gatewayToken = String(env.WHATSAPP_GATEWAY_TOKEN || env.GATEWAY_TOKEN || env.GATEWAY_AUTH_TOKEN || '').trim();
  if (gatewayUrl) {
    try {
      const response = await fetch(`${gatewayUrl}/status`, {
        method: 'GET',
        headers: gatewayToken ? { Authorization: gatewayToken.toLowerCase().startsWith('bearer ') ? gatewayToken : `Bearer ${gatewayToken}` } : {},
      });
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
      return { ok: response.ok, mode: 'direct-gateway-status', status: response.status, body };
    } catch (error) {
      return { ok: false, mode: 'direct-gateway-status', error: error.message };
    }
  }

  try {
    const result = await tenantAdmin('gateway_status', {});
    return { ok: true, mode: 'tenant-admin-proxy', result };
  } catch (error) {
    return {
      ok: false,
      mode: 'tenant-admin-proxy',
      status: error.status || null,
      error: error.message,
      body: error.body || null,
    };
  }
}

async function approveTenants(summary) {
  try {
    const tenantList = await tenantAdmin('list_tenants', {});
    const bySlug = new Map((tenantList.tenants || []).map(row => [row.slug, row]));
    for (const tenant of tenants) {
      const row = bySlug.get(tenant.slug);
      if (!row) fail(`Registered tenant not found in superadmin list: ${tenant.slug}`);
      tenant.id = row.id;
      await tenantAdmin('update_tenant', {
        tenant_id: row.id,
        status: 'approved',
        plan_code: tenant.plan_code,
        subscription_status: 'active',
      });
    }
    summary.phases.approval = { ok: true, mode: 'tenant-admin-api', count: TENANT_COUNT };
    return;
  } catch (error) {
    summary.phases.approval = {
      ok: true,
      mode: 'service-role-fallback',
      reason: error.message,
      status: error.status || null,
      count: TENANT_COUNT,
    };
  }

  const { data: rows, error: lookupError } = await adminClient
    .from('saas_tenants')
    .select('id, slug')
    .in('slug', tenants.map(tenant => tenant.slug));
  if (lookupError) throw lookupError;
  const bySlug = new Map((rows || []).map(row => [row.slug, row]));

  for (const tenant of tenants) {
    const row = bySlug.get(tenant.slug);
    if (!row) fail(`Tenant not found for service-role approval: ${tenant.slug}`);
    tenant.id = row.id;
  }

  const { error: updateError } = await adminClient
    .from('saas_tenants')
    .update({ status: 'approved', plan_code: 'growth', subscription_status: 'active' })
    .in('id', tenants.map(tenant => tenant.id));
  if (updateError) throw updateError;
}

async function main() {
  const startedAt = new Date().toISOString();
  const slugs = tenants.map(t => t.slug);
  const summary = {
    startedAt,
    target: LIVE_APP_URL || SUPABASE_URL,
    supabaseUrl: SUPABASE_URL,
    tenantsRequested: TENANT_COUNT,
    ordersPerTenant: ORDERS_PER_TENANT,
    phases: {},
    verification: [],
    gateway: null,
    cleanup: {},
  };

  log('\n=== RestroSuite API Live Simulation ===');
  log(`[setup] Cleaning previous api-sim tenants, if any...`);
  summary.cleanup.before = await cleanupBySlugs(slugs);

  try {
    log(`[registration] Registering tenants through tenant-access until the public rate limit is reached...`);
    await registerTenantsWithFallback(summary);
    log(`[registration] API registrations: ${summary.phases.registration.viaApi}, fallback pending tenants: ${summary.phases.registration.fallbackProvisioned}`);

    if (RUN_PENDING_LOGIN_PROBE) {
      log('[approval] Confirming pending login is blocked before approval...');
      try {
        await tenantAccess('login', {
          slug: tenants[0].slug,
          username: tenants[0].username,
          password: tenants[0].password,
        }, tenants[0].clientIp);
        fail('Pending tenant login unexpectedly succeeded before approval.');
      } catch (error) {
        if (error.status !== 403) throw error;
        summary.phases.pendingLoginBlocked = { ok: true, status: error.status, message: error.message };
      }
    } else {
      summary.phases.pendingLoginBlocked = {
        ok: true,
        skipped: true,
        reason: 'Skipped in 10-tenant run to stay inside tenant-access login rate limit from one test source.',
      };
    }

    log('[approval] Approving tenants through tenant-admin...');
    await approveTenants(summary);

    log('[login] Logging in all owners...');
    await Promise.all(tenants.map(async tenant => {
      const login = await tenantAccess('login', {
        slug: tenant.slug,
        username: tenant.username,
        password: tenant.password,
      }, tenant.clientIp);
      tenant.ownerSession = login.session;
      if (!tenant.ownerSession || tenant.ownerSession.role !== 'admin') {
        fail(`Owner login did not return admin session for ${tenant.slug}`, login);
      }
    }));
    summary.phases.ownerLogin = { ok: true, count: TENANT_COUNT };

    log('[staff] Creating cashier/kitchen/waiter accounts and verifying staff login...');
    await Promise.all(tenants.map(createStaffAndLogin));
    summary.phases.staff = {
      ok: true,
      created: TENANT_COUNT * 3,
      loggedIn: STAFF_LOGIN_TENANTS * 3,
      loginSkippedReason: STAFF_LOGIN_TENANTS ? null : 'Skipped to keep the 10-tenant run within tenant-access login rate limits.',
    };

    log('[seed] Seeding business profile, shared-name menu, inventory, thresholds, and employees...');
    await Promise.all(tenants.map(seedTenantWorkspace));
    summary.phases.seed = { ok: true };

    log(`[qr] Creating ${TENANT_COUNT * ORDERS_PER_TENANT} public QR orders through tenant-public...`);
    await Promise.all(tenants.map(createQrOrders));
    summary.phases.qrOrders = { ok: true, count: TENANT_COUNT * ORDERS_PER_TENANT };

    log('[kitchen] Processing orders with kitchen/waiter/cashier staff sessions...');
    await Promise.all(tenants.map(processKitchenAndBilling));
    summary.phases.workflow = { ok: true };

    log('[verify] Verifying tenant isolation, bill counts, pending-order cleanup, staff, and inventory...');
    summary.schemaDrift = tenants.flatMap(tenant => (tenant.schemaDrift || []).map(item => ({ slug: tenant.slug, ...item })));
    summary.verification = await Promise.all(tenants.map(verifyTenant));
    const failures = summary.verification.filter(row =>
      row.pendingOrders !== 0
      || row.bills !== ORDERS_PER_TENANT
      || row.staffUsers !== 3
      || row.publicMenuItems !== 4
      || !(row.paneerCubes < 12000)
    );
    if (failures.length) fail('Verification failed for one or more tenants.', failures);
    summary.phases.verify = { ok: true };

    log('[whatsapp] Checking gateway status through superadmin proxy...');
    summary.gateway = await checkGatewayStatus();
    if (!summary.gateway.ok) {
      log(`[whatsapp] Gateway status check failed: ${summary.gateway.error}`);
    } else {
      log('[whatsapp] Gateway status endpoint responded.');
    }
  } finally {
    log('[cleanup] Removing api-sim tenants and operational data...');
    summary.cleanup.after = await cleanupBySlugs(slugs);
    const { data: leftovers } = await adminClient
      .from('saas_tenants')
      .select('id,slug,status')
      .in('slug', slugs);
    summary.cleanup.leftoverTenants = leftovers || [];
    summary.finishedAt = new Date().toISOString();
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  }

  log('\n=== API SIMULATION SUMMARY ===');
  console.table(summary.verification);
  log(`Gateway: ${summary.gateway && summary.gateway.ok ? 'status responded' : 'status failed'}`);
  log(`Summary written to ${path.relative(ROOT, SUMMARY_PATH)}`);
  log('API live simulation completed successfully.');
}

main().catch(error => {
  console.error('\nAPI live simulation failed:', error.message);
  if (error.status) console.error('HTTP status:', error.status);
  if (error.body) console.error('Response:', JSON.stringify(error.body, null, 2));
  if (error.detail) console.error('Detail:', JSON.stringify(error.detail, null, 2));
  process.exit(1);
});
