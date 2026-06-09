const test = require('node:test');
const assert = require('node:assert/strict');

const imports = require('../src/dashboard/imports.js');

test('sample workbook parses all supported sheets', () => {
  const parsed = imports.parseImportSheets(imports.TEMPLATE_SHEETS);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.menu.length, 2);
  assert.equal(parsed.inventory.length, 3);
  assert.equal(Object.keys(parsed.recipes).length, 2);
  assert.equal(parsed.employees.length, 1);
  assert.equal(parsed.customers.length, 1);
  assert.equal(parsed.recipes.cappuccino.espresso_shot, 30);
});

test('invalid rows are rejected with sheet and row details', () => {
  const parsed = imports.parseImportSheets({
    Menu: [{ Name: '', Category: 'Coffee', Price: -1 }],
    Inventory: [{ IngredientKey: 'milk', CurrentStock: -1, MaxStock: 0 }],
    Customers: [{ Name: 'Bad Phone', Phone: '123' }]
  });

  assert.equal(parsed.errors.length, 3);
  assert.match(parsed.errors[0], /Menu row 2/);
  assert.match(parsed.errors[1], /Inventory row 2/);
  assert.match(parsed.errors[2], /Customers row 2/);
});

test('CSV parser handles quoted commas and escaped quotes', () => {
  const rows = imports.parseCsv('Name,Description,Price\r\nLatte,"Milk, coffee and ""foam""",180\r\n');

  assert.deepEqual(rows, [{
    Name: 'Latte',
    Description: 'Milk, coffee and "foam"',
    Price: '180'
  }]);
});

test('recipe warnings identify missing menu and inventory references', () => {
  const parsed = imports.parseImportSheets({
    Recipes: [{ MenuItem: 'Unknown Item', IngredientKey: 'unknown_stock', Quantity: 2 }]
  });

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.warnings.length, 2);
});
