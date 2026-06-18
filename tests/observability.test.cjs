const test = require("node:test");
const assert = require("node:assert/strict");

const observability = require("../src/dashboard/observability");

test("redact replaces email addresses with [email]", () => {
  const input = "Contact me at test@example.com";
  const result = observability.redact(input);
  assert.equal(result, "Contact me at [email]");
});

test("redact replaces phone numbers with [number]", () => {
  const input = "Call me at 1234567890";
  const result = observability.redact(input);
  assert.equal(result, "Call me at [number]");
});

test("redact handles multiple sensitive values", () => {
  const input = "test@example.com and 9876543210";
  const result = observability.redact(input);
  assert.ok(result.includes("[email]"));
  assert.ok(result.includes("[number]"));
});

test("redact truncates long strings", () => {
  const longInput = "x".repeat(2000);
  const result = observability.redact(longInput);
  assert.ok(result.length <= 1800);
});
