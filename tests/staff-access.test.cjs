const test = require("node:test");
const assert = require("node:assert/strict");

const staffAccess = require("../src/dashboard/staff-access");

test("ROLE_TABS contains all expected roles", () => {
  assert.ok(staffAccess.ROLE_TABS.admin);
  assert.ok(staffAccess.ROLE_TABS.cashier);
  assert.ok(staffAccess.ROLE_TABS.kitchen);
  assert.ok(staffAccess.ROLE_TABS.waiter);
  assert.ok(staffAccess.ROLE_TABS.customer_display);
});

test("admin role has access to all tabs", () => {
  const adminTabs = staffAccess.ROLE_TABS.admin;
  assert.ok(adminTabs.includes("pos-tab"));
  assert.ok(adminTabs.includes("bills-tab"));
  assert.ok(adminTabs.includes("inventory-tab"));
  assert.ok(adminTabs.includes("employees-tab"));
});
