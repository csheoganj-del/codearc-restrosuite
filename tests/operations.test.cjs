const test = require("node:test");
const assert = require("node:assert/strict");

const operations = require("../src/dashboard/operations");

test("parseCustomLocaleString parses valid dates correctly", () => {
  const result1 = operations.parseCustomLocaleString("07/06/2026, 12:05:10 AM");
  assert.ok(typeof result1 === "number");
  
  const result2 = operations.parseCustomLocaleString("07/06/2026, 6:30:00 PM");
  assert.ok(typeof result2 === "number");
});

test("parseCustomLocaleString returns null for invalid input", () => {
  assert.equal(operations.parseCustomLocaleString(null), null);
  assert.equal(operations.parseCustomLocaleString(undefined), null);
  assert.equal(operations.parseCustomLocaleString(123), null);
  assert.equal(operations.parseCustomLocaleString("invalid"), null);
  assert.equal(operations.parseCustomLocaleString("07/06/2026"), null);
});
