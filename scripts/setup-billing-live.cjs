/**
 * Live billing setup:
 *  1) Create Razorpay plans (Express/Serve/Command x monthly/yearly)
 *  2) Write razorpay_plan_id* into saas_plans
 *  3) Create Razorpay webhook for subscription events
 *  4) Print secrets to set via supabase CLI
 *
 * Usage: node scripts/setup-billing-live.cjs
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function loadEnv() {
  const out = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) {continue;}
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) {continue;}
      const i = line.indexOf('=');
      if (i < 1) {continue;}
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && !(k in out)) {out[k] = v;}
    }
  }
  return out;
}

const env = loadEnv();
const KEY_ID = env.RAZORPAY_KEY_ID;
const KEY_SECRET = env.RAZORPAY_KEY_SECRET;
const SUPABASE_URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
const PROJECT_REF = 'htkauiibuejetimfiavs';
const WEBHOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/razorpay-webhook`;

if (!KEY_ID || !KEY_SECRET) {
  console.error('Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');

async function rzp(method, p, body) {
  const res = await fetch(`https://api.razorpay.com${p}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(json?.error?.description || json?.error?.reason || text || res.statusText);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'GET' ? 'return=representation' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);}
  return json;
}

const PLANS = [
  { code: 'express', name: 'RestroSuite Express Monthly', period: 'monthly', amount: 49900, yearly: false },
  { code: 'serve', name: 'RestroSuite Serve Monthly', period: 'monthly', amount: 99900, yearly: false },
  { code: 'command', name: 'RestroSuite Command Monthly', period: 'monthly', amount: 249900, yearly: false },
  { code: 'express', name: 'RestroSuite Express Yearly', period: 'yearly', amount: 499900, yearly: true },
  { code: 'serve', name: 'RestroSuite Serve Yearly', period: 'yearly', amount: 999900, yearly: true },
  { code: 'command', name: 'RestroSuite Command Yearly', period: 'yearly', amount: 2499900, yearly: true },
];

async function listPlans() {
  // Razorpay paginates; fetch first 100
  const data = await rzp('GET', '/v1/plans?count=100');
  return data.items || [];
}

function findExisting(items, name, amount, period) {
  return items.find((p) =>
    p.item &&
    Number(p.item.amount) === amount &&
    String(p.period) === period &&
    String(p.item.name || '').toLowerCase().includes(String(name).toLowerCase().replace('restrosuite ', ''))
  ) || items.find((p) =>
    p.item &&
    Number(p.item.amount) === amount &&
    String(p.period) === period &&
    String(p.item.name || '').toLowerCase().includes('restrosuite')
  );
}

async function ensurePlan(def, existing) {
  const hit = existing.find((p) =>
    p.item &&
    Number(p.item.amount) === def.amount &&
    String(p.period) === def.period &&
    String(p.item.name || '') === def.name
  ) || findExisting(existing, def.name, def.amount, def.period);

  if (hit) {
    console.log(`  reuse ${def.name} -> ${hit.id}`);
    return hit.id;
  }
  const created = await rzp('POST', '/v1/plans', {
    period: def.period,
    interval: 1,
    item: {
      name: def.name,
      amount: def.amount,
      currency: 'INR',
      description: `${def.name} subscription for RestroSuite POS SaaS`,
    },
    notes: {
      plan_code: def.code,
      billing_interval: def.yearly ? 'yearly' : 'monthly',
      product: 'restrosuite',
    },
  });
  console.log(`  created ${def.name} -> ${created.id}`);
  existing.push(created);
  return created.id;
}

async function ensureWebhook() {
  let list;
  try {
    list = await rzp('GET', '/v1/webhooks?count=100');
  } catch (e) {
    console.warn('  webhook list failed (may need dashboard):', e.message);
    return { id: null, secret: null, note: 'list_failed' };
  }
  const items = list.items || [];
  const events = [
    'subscription.activated',
    'subscription.charged',
    'subscription.cancelled',
    'subscription.completed',
    'payment.failed',
    'payment.captured',
  ];
  const existing = items.find((w) => String(w.url || '') === WEBHOOK_URL);
  if (existing) {
    console.log(`  webhook already exists: ${existing.id}`);
    // secret only returned on create
    return { id: existing.id, secret: null, note: 'existing' };
  }
  try {
    const created = await rzp('POST', '/v1/webhooks', {
      url: WEBHOOK_URL,
      alert_email: env.ADMIN_ALERT_EMAIL || 'csheoganj@gmail.com',
      secret: crypto.randomBytes(20).toString('hex'),
      events: Object.fromEntries(events.map((e) => [e, true])),
    });
    console.log(`  webhook created: ${created.id}`);
    return { id: created.id, secret: created.secret || null, note: 'created' };
  } catch (e) {
    console.warn('  webhook create failed:', e.message, e.payload || '');
    return { id: null, secret: null, note: 'create_failed:' + e.message };
  }
}

async function main() {
  console.log('== Razorpay plan setup ==');
  console.log('key:', KEY_ID.slice(0, 10) + '...');
  const existing = await listPlans();
  console.log('existing plans on account:', existing.length);

  const map = { monthly: {}, yearly: {} };
  for (const def of PLANS) {
    const id = await ensurePlan(def, existing);
    if (def.yearly) {map.yearly[def.code] = id;}
    else {map.monthly[def.code] = id;}
  }

  console.log('\n== Update saas_plans ==');
  for (const code of ['express', 'serve', 'command']) {
    const patch = {
      razorpay_plan_id: map.monthly[code],
      razorpay_plan_id_yearly: map.yearly[code],
      is_public: true,
    };
    // also keep legacy aliases pointing same
    await sb('PATCH', `saas_plans?plan_code=eq.${code}`, patch);
    console.log('  updated', code, patch);
  }
  // legacy aliases
  const legacy = {
    starter: 'express',
    growth: 'serve',
    enterprise: 'command',
  };
  for (const [old, neu] of Object.entries(legacy)) {
    try {
      await sb('PATCH', `saas_plans?plan_code=eq.${old}`, {
        razorpay_plan_id: map.monthly[neu],
        razorpay_plan_id_yearly: map.yearly[neu],
      });
      console.log('  alias', old, '->', neu);
    } catch (e) {
      console.warn('  alias skip', old, e.message);
    }
  }

  console.log('\n== Razorpay webhook ==');
  const wh = await ensureWebhook();

  const billingCron = crypto.randomBytes(24).toString('hex');
  const webhookSecret = wh.secret || env.RAZORPAY_WEBHOOK_SECRET || crypto.randomBytes(20).toString('hex');

  const secrets = {
    RAZORPAY_KEY_ID: KEY_ID,
    RAZORPAY_KEY_SECRET: KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    BILLING_CRON_SECRET: billingCron,
    WHATSAPP_GATEWAY_URL: env.NGROK_GATEWAY_URL || env.WHATSAPP_GATEWAY_URL || '',
    WHATSAPP_GATEWAY_TOKEN: env.WHATSAPP_GATEWAY_TOKEN || env.GATEWAY_TOKEN || '',
    NGROK_GATEWAY_URL: env.NGROK_GATEWAY_URL || '',
    GATEWAY_TOKEN: env.GATEWAY_TOKEN || env.WHATSAPP_GATEWAY_TOKEN || '',
    ZERO_COST_EMAILS_DISABLED: 'false',
    ALLOWED_ORIGIN: 'https://restrosuite.codearc.co.in',
    INVOICE_SELLER_NAME: 'CodeArc Technologies',
    INVOICE_SELLER_EMAIL: env.ADMIN_ALERT_EMAIL || 'hello@codearc.co.in',
    INVOICE_SELLER_PHONE: '+91 99837 21179',
    INVOICE_SELLER_WEB: 'https://restrosuite.codearc.co.in',
    INVOICE_SELLER_ADDRESS: 'Sheoganj, Rajasthan, India',
    INVOICE_SELLER_STATE: 'Rajasthan',
    INVOICE_SELLER_STATE_CODE: '08',
  };

  // write secrets file for supabase CLI (local only)
  const secretsPath = path.join(process.cwd(), 'scripts', '.billing-secrets.env');
  const lines = Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(secretsPath, lines, 'utf8');
  console.log('\nWrote', secretsPath);

  // result summary for cron
  const out = {
    plans: map,
    webhook: { url: WEBHOOK_URL, ...wh },
    billingCronSecret: billingCron,
    webhookSecretSet: !!webhookSecret,
    secretsFile: secretsPath,
  };
  fs.writeFileSync(path.join(process.cwd(), 'scripts', '.billing-setup-result.json'), JSON.stringify(out, null, 2));
  console.log('\nDONE plans:', JSON.stringify(map, null, 2));
  console.log('webhook:', wh);
  console.log('billing cron secret length:', billingCron.length);
}

main().catch((e) => {
  console.error('FATAL', e.message, e.payload || '');
  process.exit(1);
});
