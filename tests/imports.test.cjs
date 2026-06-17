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

test('cleanKey normalizes various header formats', () => {
  assert.equal(imports.cleanKey('IngredientName'), 'ingredientname');
  assert.equal(imports.cleanKey('Ingredient Name'), 'ingredient_name');
  assert.equal(imports.cleanKey('IngredientName\r'), 'ingredientname');
  assert.equal(imports.cleanKey('  CurrentStock  '), 'currentstock');
  assert.equal(imports.cleanKey('UnitCost($)'), 'unitcost');
});

test('parseCsv sniffs delimiter and parses semicolons and tabs', () => {
  const semiRows = imports.parseCsv('Name;Description;Price\r\nLatte;"Milk, coffee";180\r\n');
  assert.deepEqual(semiRows, [{
    Name: 'Latte',
    Description: 'Milk, coffee',
    Price: '180'
  }]);

  const tabRows = imports.parseCsv('Name\tDescription\tPrice\r\nLatte\t"Milk, coffee"\t180\r\n');
  assert.deepEqual(tabRows, [{
    Name: 'Latte',
    Description: 'Milk, coffee',
    Price: '180'
  }]);
});

test('parseImportSheets parses localized currency and formats correctly', () => {
  const parsed = imports.parseImportSheets({
    Menu: [
      { Name: 'Cappuccino', Category: 'HOT COFFEE', Price: '₹ 180.50', Description: 'Espresso with steamed milk and foam', PrepTimeMinutes: 4, Available: 'YES', Bestseller: 'YES' },
      { Name: 'Latte', Category: 'HOT COFFEE', Price: '1,200.00', Description: 'Espresso with steamed milk', PrepTimeMinutes: 4, Available: 'YES', Bestseller: 'YES' },
      { Name: 'Espresso', Category: 'HOT COFFEE', Price: '120,50', Description: 'Straight espresso', PrepTimeMinutes: 4, Available: 'YES', Bestseller: 'YES' }
    ]
  });

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.menu[0].price, 180.5);
  assert.equal(parsed.menu[1].price, 1200);
  assert.equal(parsed.menu[2].price, 120.5);
});

test('parseImportSheets tolerates flexible headers with spaces and underscores', () => {
  const parsed = imports.parseImportSheets({
    Menu: [
      { 'Item Name': 'Cappuccino', 'Item Category': 'HOT COFFEE', 'Selling Price': '180' }
    ]
  });

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.menu.length, 1);
  assert.equal(parsed.menu[0].name, 'Cappuccino');
  assert.equal(parsed.menu[0].price, 180);
});


