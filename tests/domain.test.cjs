const test = require("node:test");
const assert = require("node:assert/strict");

const billing = require("../src/dashboard/billing.js");
const inventory = require("../src/dashboard/inventory.js");
const api = require("../src/dashboard/api.js");
const auth = require("../src/dashboard/auth.js");
const bills = require("../src/dashboard/bills.js");
const operations = require("../src/dashboard/operations.js");
const people = require("../src/dashboard/people.js");
const pos = require("../src/dashboard/pos.js");
const superadmin = require("../src/dashboard/superadmin.js");
const whatsapp = require("../src/dashboard/whatsapp.js");

test("billing applies loyalty before GST", () => {
  const result = billing.calculateCartTotals({
    cart: [{ price: 100, qty: 2 }],
    businessProfile: {
      gstEnabled: true,
      gstRate: 18,
      loyaltyEnabled: true,
      loyaltyRate: 10
    },
    customers: [{ name: "Asha", phone: "999", visits: 2 }],
    customerName: "Asha",
    customerPhone: "999"
  });

  assert.deepEqual(
    {
      subtotal: result.subtotal,
      discount: result.loyaltyDiscount,
      taxable: result.taxableAmount,
      gst: result.gst,
      total: result.total
    },
    { subtotal: 200, discount: 20, taxable: 180, gst: 32, total: 212 }
  );
});

test("billing supports GST and loyalty being disabled", () => {
  const result = billing.calculateCartTotals({
    cart: [{ price: 249, qty: 2 }],
    businessProfile: { gstEnabled: false, loyaltyEnabled: false }
  });

  assert.equal(result.subtotal, 498);
  assert.equal(result.gst, 0);
  assert.equal(result.total, 498);
});

test("order ingredient deductions are aggregated", () => {
  const deductions = billing.aggregateDeductions(
    [{ name: "Latte", qty: 2 }, { name: "Latte", qty: 1 }],
    () => ({ milk: 150, coffee: 18 })
  );

  assert.deepEqual(deductions, { milk: 450, coffee: 54 });
});

test("FEFO consumes the earliest expiry batch first", () => {
  const result = inventory.deductFefo([
    { id: "late", qty: 10, expiryDate: "2026-08-01" },
    { id: "early", qty: 5, expiryDate: "2026-07-01" }
  ], 7);

  assert.deepEqual(result.batches, [
    { id: "late", qty: 8, expiryDate: "2026-08-01" }
  ]);
  assert.equal(result.total, 8);
});

test("FEFO reports a shortfall without exposing negative stock totals", () => {
  const result = inventory.deductFefo([], 4, (remaining) => ({
    id: "fallback",
    expiryDate: "2026-07-01",
    receivedDate: "2026-06-07",
    requested: remaining
  }));

  assert.equal(result.shortfall, 4);
  assert.equal(result.total, 0);
  assert.equal(result.batches[0].qty, -4);
});

test("tenant data adapter serializes protected not-in filters", async () => {
  let request;
  const tenantApi = api.createTenantApi({
    baseUrl: "https://example.test",
    anonKey: "anon",
    getTenantToken: () => "tenant-token",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] })
      };
    }
  });
  const nativeClient = {
    from() {
      throw new Error("Tenant table escaped the protected adapter.");
    }
  };

  await tenantApi.createTenantDataClient(nativeClient)
    .from("doppio_inventory_batches")
    .delete()
    .eq("ingredient_key", "milk")
    .not("id", "in", "(batch-1,batch-2)");

  assert.equal(request.url, "https://example.test/functions/v1/tenant-data");
  assert.equal(request.options.headers.Authorization, "Bearer tenant-token");
  assert.deepEqual(request.body.filters[1], {
    operator: "not",
    comparisonOperator: "in",
    column: "id",
    value: "(batch-1,batch-2)"
  });
});

test("admin API clears invalid admin sessions", async () => {
  let cleared = false;
  const tenantApi = api.createTenantApi({
    baseUrl: "https://example.test",
    anonKey: "anon",
    getAdminToken: () => "expired-token",
    onAdminUnauthorized: () => { cleared = true; },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Expired" })
    })
  });

  await assert.rejects(() => tenantApi.admin("list_tenants"), /Expired/);
  assert.equal(cleared, true);
});

test("Indian bill dates parse with AM and PM correctly", () => {
  const morning = bills.parseBillDate("07/06/2026, 12:05:10 AM");
  const evening = bills.parseBillDate("07/06/2026, 6:30:00 PM");

  assert.equal(morning.getFullYear(), 2026);
  assert.equal(morning.getMonth(), 5);
  assert.equal(morning.getDate(), 7);
  assert.equal(morning.getHours(), 0);
  assert.equal(evening.getHours(), 18);
});

test("bill CSV export escapes quotes and serializes items", () => {
  const csv = bills.convertToCSV([{
    orderId: "DO-1",
    customerName: 'A "quoted" guest',
    items: [{ name: "Latte", qty: 1 }],
    total: 249
  }]);

  assert.match(csv, /"A ""quoted"" guest"/);
  assert.match(csv, /Latte/);
});

test("loyalty tiers use stable spend thresholds", () => {
  assert.equal(people.getLoyaltyTier(999), "Bronze");
  assert.equal(people.getLoyaltyTier(1000), "Silver");
  assert.equal(people.getLoyaltyTier(2500), "Gold");
  assert.equal(people.getLoyaltyTier(5000), "Platinum");
});

test("KDS locale timestamps reject malformed values", () => {
  assert.equal(operations.parseCustomLocaleString("not-a-date"), null);
  assert.equal(
    typeof operations.parseCustomLocaleString("2/6/2026, 6:50:28 AM"),
    "number"
  );
});

test("session validation persists authoritative tenant permissions", async () => {
  const values = new Map([
    ["logged_in_role", "admin"],
    ["tenant_session_token", "signed-token"],
    ["tenant_data_reset_at", "old-reset"]
  ]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const manager = auth.createSessionManager({
    storage,
    validateSession: async (token) => {
      assert.equal(token, "signed-token");
      return {
        session: {
          username: "manager",
          role: "admin",
          tenant_id: "tenant-1",
          tenant_slug: "doppio",
          tenant_name: "Doppio",
          allowed_tabs: ["pos-tab", "bills-tab"],
          data_reset_at: "new-reset"
        }
      };
    }
  });

  await manager.validateStoredSession();
  assert.equal(values.get("tenant_id"), "tenant-1");
  assert.equal(values.get("tenant_data_reset_pending"), "true");
  assert.deepEqual(JSON.parse(values.get("allowed_tabs")), ["pos-tab", "bills-tab"]);
});

test("split payments require an exact balance", () => {
  assert.deepEqual(
    pos.evaluateSplitPayment(500, { upi: 200, cash: 200, card: 100 }),
    {
      total: 500,
      paid: 500,
      remaining: 0,
      status: "balanced",
      isBalanced: true
    }
  );
  assert.equal(
    pos.evaluateSplitPayment(500, { upi: 600 }).status,
    "overpaid"
  );
});

test("payroll calculation applies LOP, PF, PT, and TDS consistently", () => {
  const payroll = people.calculatePayroll(90000, 3);
  assert.equal(payroll.gross, 81000);
  assert.equal(payroll.basic, 40500);
  assert.equal(payroll.hra, 16200);
  assert.equal(payroll.pf, 4860);
  assert.equal(payroll.pt, 200);
  assert.ok(payroll.tds > 0);
  assert.equal(payroll.net, payroll.gross - payroll.deductions);
});

test("WhatsApp phone and gateway normalization is deterministic", () => {
  assert.equal(whatsapp.normalizeIndianPhone("91300 03177"), "919130003177");
  assert.equal(whatsapp.normalizeIndianPhone("123"), null);
  assert.equal(
    whatsapp.resolveGatewaySendUrl("https://gateway.example/"),
    "https://gateway.example/send"
  );
});

test("superadmin selection and status views are derived consistently", () => {
  assert.deepEqual(superadmin.getSelectionState(3, 1), {
    checked: false,
    indeterminate: true,
    showBulkDelete: true
  });
  assert.equal(
    superadmin.getTenantStatusPresentation("suspended").text,
    "Suspended"
  );
});
