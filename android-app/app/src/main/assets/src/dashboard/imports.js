(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.imports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TEMPLATE_SHEETS = {
    Menu: [
      { Name: "Cappuccino", Category: "HOT COFFEE", Price: 180, Description: "Espresso with steamed milk and foam", PrepTimeMinutes: 4, Available: "YES", Bestseller: "YES" },
      { Name: "Veg Grilled Sandwich", Category: "SANDWICHES", Price: 220, Description: "Grilled vegetable and cheese sandwich", PrepTimeMinutes: 8, Available: "YES", Bestseller: "NO" }
    ],
    Inventory: [
      { IngredientKey: "espresso_shot", IngredientName: "Espresso Shot", Category: "drinks", CurrentStock: 3000, MaxStock: 6000, Unit: "ml", ReorderLevelPercent: 20, ExpiryDate: "" },
      { IngredientKey: "milk", IngredientName: "Milk", Category: "drinks", CurrentStock: 6000, MaxStock: 10000, Unit: "ml", ReorderLevelPercent: 25, ExpiryDate: "2026-06-16" },
      { IngredientKey: "bread", IngredientName: "Bread", Category: "food", CurrentStock: 60, MaxStock: 100, Unit: "slices", ReorderLevelPercent: 20, ExpiryDate: "2026-06-13" }
    ],
    Recipes: [
      { MenuItem: "Cappuccino", IngredientKey: "espresso_shot", Quantity: 30, Unit: "ml" },
      { MenuItem: "Cappuccino", IngredientKey: "milk", Quantity: 180, Unit: "ml" },
      { MenuItem: "Veg Grilled Sandwich", IngredientKey: "bread", Quantity: 2, Unit: "slices" }
    ],
    Employees: [
      { EmployeeId: "emp_001", Name: "Sample Cashier", Role: "cashier", Contact: "9876543210", BaseSalary: 24000, Shift: "Morning Shift", CasualLeaveBalance: 15, SickLeaveBalance: 10 }
    ],
    Customers: [
      { Name: "Sample Customer", Phone: "9876500001", Visits: 4, TotalSpend: 2450, LoyaltyPoints: 245, Notes: "Template example row" }
    ]
  };

  function cleanKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizedRow(row) {
    const result = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      result[cleanKey(key)] = typeof value === "string" ? value.trim() : value;
    });
    return result;
  }

  function value(row, aliases) {
    for (const alias of aliases) {
      const candidate = row[cleanKey(alias)];
      if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
    }
    return "";
  }

  function numberValue(input, fallback = 0) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function booleanValue(input, fallback = true) {
    if (typeof input === "boolean") return input;
    const normalized = String(input || "").trim().toLowerCase();
    if (["yes", "true", "1", "active", "available"].includes(normalized)) return true;
    if (["no", "false", "0", "inactive", "unavailable"].includes(normalized)) return false;
    return fallback;
  }

  function sheetRows(sheets, name) {
    const key = Object.keys(sheets || {}).find((candidate) => cleanKey(candidate) === cleanKey(name));
    return key && Array.isArray(sheets[key]) ? sheets[key] : [];
  }

  function parseImportSheets(sheets) {
    const result = {
      menu: [],
      inventory: [],
      recipes: {},
      employees: [],
      customers: [],
      errors: [],
      warnings: []
    };

    sheetRows(sheets, "Menu").forEach((source, index) => {
      const row = normalizedRow(source);
      const name = String(value(row, ["Name", "ItemName", "MenuItem"])).trim();
      const category = String(value(row, ["Category"])).trim();
      const price = numberValue(value(row, ["Price", "SellingPrice"]), NaN);
      if (!name || !category || !Number.isFinite(price) || price <= 0) {
        result.errors.push(`Menu row ${index + 2}: Name, Category and a positive Price are required.`);
        return;
      }
      result.menu.push({
        name,
        category: category.toUpperCase(),
        price,
        description: String(value(row, ["Description"])).trim(),
        prepTime: Math.max(1, Math.round(numberValue(value(row, ["PrepTimeMinutes", "PrepTime"]), 5))),
        available: booleanValue(value(row, ["Available"]), true),
        bestseller: booleanValue(value(row, ["Bestseller"]), false),
        icon: "&#9733;"
      });
    });

    sheetRows(sheets, "Inventory").forEach((source, index) => {
      const row = normalizedRow(source);
      const key = cleanKey(value(row, ["IngredientKey", "Key", "IngredientName"]));
      const label = String(value(row, ["IngredientName", "Name", "IngredientKey"])).trim();
      const current = numberValue(value(row, ["CurrentStock", "Current", "Stock"]), NaN);
      const max = numberValue(value(row, ["MaxStock", "Capacity", "Maximum"]), NaN);
      if (!key || !Number.isFinite(current) || current < 0 || !Number.isFinite(max) || max <= 0) {
        result.errors.push(`Inventory row ${index + 2}: IngredientKey, non-negative CurrentStock and positive MaxStock are required.`);
        return;
      }
      result.inventory.push({
        key,
        label: label || key.replaceAll("_", " "),
        current,
        max,
        unit: String(value(row, ["Unit"])).trim() || "unit",
        category: cleanKey(value(row, ["Category"])) === "drinks" ? "drinks" : "food",
        threshold: Math.min(100, Math.max(0, numberValue(value(row, ["ReorderLevelPercent", "Threshold"]), 15))),
        expiryDate: String(value(row, ["ExpiryDate"])).trim()
      });
    });

    sheetRows(sheets, "Recipes").forEach((source, index) => {
      const row = normalizedRow(source);
      const menuItem = String(value(row, ["MenuItem", "ItemName", "Name"])).trim().toLowerCase();
      const ingredientKey = cleanKey(value(row, ["IngredientKey", "Ingredient"]));
      const quantity = numberValue(value(row, ["Quantity", "Qty", "Amount"]), NaN);
      if (!menuItem || !ingredientKey || !Number.isFinite(quantity) || quantity <= 0) {
        result.errors.push(`Recipes row ${index + 2}: MenuItem, IngredientKey and a positive Quantity are required.`);
        return;
      }
      result.recipes[menuItem] = result.recipes[menuItem] || {};
      result.recipes[menuItem][ingredientKey] = quantity;
    });

    sheetRows(sheets, "Employees").forEach((source, index) => {
      const row = normalizedRow(source);
      const name = String(value(row, ["Name", "EmployeeName"])).trim();
      if (!name) {
        result.errors.push(`Employees row ${index + 2}: Name is required.`);
        return;
      }
      result.employees.push({
        id: cleanKey(value(row, ["EmployeeId", "Id"])) || `emp_${index + 1}`,
        name,
        role: cleanKey(value(row, ["Role"])) || "cashier",
        contact: String(value(row, ["Contact", "Phone"])).trim(),
        baseSalary: Math.max(0, numberValue(value(row, ["BaseSalary", "Salary"]), 0)),
        shift: String(value(row, ["Shift"])).trim() || "Morning Shift",
        leaves: {
          casual: Math.max(0, numberValue(value(row, ["CasualLeaveBalance"]), 15)),
          sick: Math.max(0, numberValue(value(row, ["SickLeaveBalance"]), 10))
        }
      });
    });

    sheetRows(sheets, "Customers").forEach((source, index) => {
      const row = normalizedRow(source);
      const phone = String(value(row, ["Phone", "Mobile"])).replace(/\D/g, "").slice(-10);
      const name = String(value(row, ["Name", "CustomerName"])).trim();
      if (!name || phone.length !== 10) {
        result.errors.push(`Customers row ${index + 2}: Name and a valid 10-digit Phone are required.`);
        return;
      }
      result.customers.push({
        name,
        phone,
        visits: Math.max(0, Math.round(numberValue(value(row, ["Visits"]), 0))),
        total_spend: Math.max(0, numberValue(value(row, ["TotalSpend"]), 0)),
        loyalty_points: Math.max(0, Math.round(numberValue(value(row, ["LoyaltyPoints"]), 0))),
        notes: String(value(row, ["Notes"])).trim(),
        last_visit: new Date().toISOString()
      });
    });

    const menuNames = new Set(result.menu.map((item) => item.name.toLowerCase()));
    Object.keys(result.recipes).forEach((name) => {
      if (!menuNames.has(name)) result.warnings.push(`Recipe "${name}" has no matching row in the Menu sheet.`);
    });
    const inventoryKeys = new Set(result.inventory.map((item) => item.key));
    Object.entries(result.recipes).forEach(([name, ingredients]) => {
      Object.keys(ingredients).forEach((key) => {
        if (!inventoryKeys.has(key)) result.warnings.push(`Recipe "${name}" uses "${key}", which is not in the Inventory sheet.`);
      });
    });

    return result;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === '"') {
        if (quoted && source[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && source[index + 1] === "\n") index++;
        row.push(cell);
        if (row.some((value) => String(value).trim() !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((value) => String(value).trim() !== "")) rows.push(row);
    const headers = rows.shift() || [];
    return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }

  return { TEMPLATE_SHEETS, cleanKey, parseCsv, parseImportSheets };
});
