/* ============================================================
   Recipe · servings · units — shared math for Menu ↔ Recipe ↔ Stock
   ============================================================ */
(function (global) {
  'use strict';

  var SERVE_UNITS = [
    { id: 'plate', label: 'Plate' },
    { id: 'bowl', label: 'Bowl' },
    { id: 'glass', label: 'Glass / cup' },
    { id: 'piece', label: 'Piece' },
    { id: 'portion', label: 'Portion' },
    { id: 'pack', label: 'Pack / box' },
    { id: 'serve', label: 'Serve' },
  ];

  /** Canonical stock / recipe units (display labels). */
  var STOCK_UNITS = ['kg', 'gm', 'ltr', 'ml'];

  /**
   * Normalize to internal keys for math: kg | g | l | ml
   * Accepts aliases: gm/g, ltr/L/litre, etc.
   */
  function normUnit(u) {
    var s = String(u == null ? '' : u)
      .trim()
      .toLowerCase()
      .replace(/\./g, '');
    if (!s) return 'kg';
    if (s === 'l' || s === 'ltr' || s === 'lt' || s === 'liter' || s === 'litre' || s === 'liters' || s === 'litres')
      return 'l';
    if (s === 'ml' || s === 'milliliter' || s === 'millilitre' || s === 'milliliters' || s === 'millilitres')
      return 'ml';
    if (s === 'kg' || s === 'kgs' || s === 'kilogram' || s === 'kilograms') return 'kg';
    if (s === 'g' || s === 'gm' || s === 'gms' || s === 'gram' || s === 'grams') return 'g';
    // legacy count units — no mass/volume conversion
    if (s === 'pc' || s === 'pcs' || s === 'piece' || s === 'pieces' || s === 'unit' || s === 'pack' || s === 'box')
      return s === 'pc' || s === 'piece' || s === 'pieces' ? 'pcs' : s;
    return s;
  }

  /** Display label: always kg | gm | ltr | ml when possible */
  function displayUnit(u) {
    var n = normUnit(u);
    if (n === 'kg') return 'kg';
    if (n === 'g') return 'gm';
    if (n === 'l') return 'ltr';
    if (n === 'ml') return 'ml';
    // legacy leftover
    if (n === 'pcs' || n === 'pack' || n === 'box' || n === 'unit') return n;
    return String(u || 'kg');
  }

  /**
   * Convert qty from one unit to another when same dimension (mass / volume).
   * Returns null if conversion is not possible (caller should use raw qty).
   * Supports kg ↔ gm and ltr ↔ ml.
   */
  function convertQty(qty, fromUnit, toUnit) {
    var q = Number(qty);
    if (!isFinite(q)) return null;
    var f = normUnit(fromUnit);
    var t = normUnit(toUnit);
    if (f === t) return q;

    // mass → kg base (gm stored as g)
    var mass = { kg: 1, g: 0.001 };
    if (mass[f] != null && mass[t] != null) {
      return (q * mass[f]) / mass[t];
    }
    // volume → ltr base (ltr stored as l)
    var vol = { l: 1, ml: 0.001 };
    if (vol[f] != null && vol[t] != null) {
      return (q * vol[f]) / vol[t];
    }
    return null;
  }

  function unitSelectHtml(selected, id, attrs) {
    var cur = displayUnit(selected || 'kg');
    var opts = STOCK_UNITS.map(function (u) {
      return (
        '<option value="' +
        u +
        '"' +
        (u === cur || normUnit(u) === normUnit(selected) ? ' selected' : '') +
        '>' +
        u +
        '</option>'
      );
    }).join('');
    // Keep rare legacy value visible if still stored
    if (selected && STOCK_UNITS.indexOf(cur) === -1 && STOCK_UNITS.indexOf(String(selected)) === -1) {
      opts +=
        '<option value="' +
        String(selected).replace(/"/g, '') +
        '" selected>' +
        String(selected) +
        ' (old)</option>';
    }
    return (
      '<select class="form-input" id="' +
      (id || '') +
      '" ' +
      (attrs || '') +
      '>' +
      opts +
      '</select>'
    );
  }

  function recipeServingsOf(m) {
    var n = Number(m && (m.recipeServings != null ? m.recipeServings : m.servings));
    if (!isFinite(n) || n <= 0) n = 1;
    return n;
  }

  function serveUnitOf(m) {
    var u = (m && (m.serveUnit || m.serve_unit || m.unit)) || 'plate';
    return String(u).trim() || 'plate';
  }

  function serveUnitLabel(id) {
    var hit = SERVE_UNITS.find(function (x) {
      return x.id === String(id || '').toLowerCase();
    });
    return hit ? hit.label : id || 'plate';
  }

  /**
   * How many "recipe bases" one sold line represents.
   * soldQty (cart) × optional line servings ÷ recipeServings (what the recipe was written for).
   */
  function sellFactor(menuItem, soldQty, lineServings) {
    var base = recipeServingsOf(menuItem);
    var sold = Number(soldQty);
    if (!isFinite(sold) || sold <= 0) sold = 1;
    var ls = Number(lineServings);
    if (!isFinite(ls) || ls <= 0) ls = 1;
    return (sold * ls) / base;
  }

  function findInventory(ing, inventory) {
    var list = inventory || (global.RS && RS.INVENTORY) || [];
    var name = String((ing && (ing.name || ing.key)) || '').toLowerCase();
    var key = String((ing && (ing.key || ing.name)) || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return (
      list.find(function (x) {
        return (
          (x.name && String(x.name).toLowerCase() === name) ||
          (x.key && String(x.key).toLowerCase() === key) ||
          (x.id && ing && String(x.id) === String(ing.invId || ''))
        );
      }) || null
    );
  }

  /**
   * Qty to deduct from stock for one ingredient line after selling.
   * Converts recipe unit → inventory unit when possible (g↔kg, ml↔L).
   */
  function deductQtyForIngredient(ing, menuItem, soldQty, lineServings, inventory) {
    var factor = sellFactor(menuItem, soldQty, lineServings);
    var raw = (Number(ing && ing.qty) || 0) * factor;
    if (raw <= 0) return 0;
    var inv = findInventory(ing, inventory);
    var recipeUnit = (ing && ing.unit) || 'unit';
    var invUnit = (inv && inv.unit) || recipeUnit;
    var converted = convertQty(raw, recipeUnit, invUnit);
    if (converted != null && isFinite(converted)) return converted;
    return raw;
  }

  /** Plate cost for ONE customer order (1 × serve unit), not the full recipe batch. */
  function plateCost(menuItem, inventory) {
    var ings = (menuItem && menuItem.ingredients) || [];
    var base = recipeServingsOf(menuItem);
    var sum = 0;
    ings.forEach(function (g) {
      var inv = findInventory(g, inventory);
      var unitCost = inv ? Number(inv.cost) || 0 : 0;
      // cost is per inventory unit; convert recipe qty to inv unit for costing
      var q = Number(g.qty) || 0;
      if (inv && inv.unit) {
        var c = convertQty(q, g.unit || inv.unit, inv.unit);
        if (c != null) q = c;
      }
      sum += q * unitCost;
    });
    return sum / base;
  }

  /**
   * Build aggregated deduction lines for a bill.
   * Returns { lines: [{key,name,qty,unit}], noRecipeCount }
   */
  function buildDeductLines(items, menuList, inventory) {
    var MENU = menuList || (global.RS && RS.MENU) || [];
    var INV = inventory || (global.RS && RS.INVENTORY) || [];
    var noRecipeCount = 0;
    var map = {};

    (items || []).forEach(function (it) {
      var menuItem =
        MENU.find(function (m) {
          return String(m.id) === String(it.id);
        }) ||
        MENU.find(function (m) {
          return m.name && it.name && String(m.name).toLowerCase() === String(it.name).toLowerCase();
        });
      if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {
        noRecipeCount++;
        return;
      }
      var soldQty = Number(it.qty) || 1;
      var lineServings = it.servings != null ? it.servings : it.serveCount;
      menuItem.ingredients.forEach(function (ing) {
        var qty = deductQtyForIngredient(ing, menuItem, soldQty, lineServings, INV);
        if (qty <= 0) return;
        var key = String(ing.key || ing.name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        var inv = findInventory(ing, INV);
        var unit = (inv && inv.unit) || ing.unit || 'unit';
        if (!map[key]) {
          map[key] = { key: key, name: ing.name || key, qty: 0, unit: unit };
        }
        map[key].qty += qty;
      });
    });

    var lines = Object.keys(map).map(function (k) {
      return map[k];
    });
    return { lines: lines, noRecipeCount: noRecipeCount };
  }

  function servingsSelectHtml(selected, id) {
    var sel = Number(selected);
    if (!isFinite(sel) || sel <= 0) sel = 1;
    var presets = [1, 2, 3, 4, 5, 6, 8, 10, 12];
    var opts = presets
      .map(function (n) {
        return (
          '<option value="' +
          n +
          '"' +
          (n === sel ? ' selected' : '') +
          '>' +
          n +
          ' serving' +
          (n === 1 ? '' : 's') +
          '</option>'
        );
      })
      .join('');
    if (presets.indexOf(sel) === -1) {
      opts +=
        '<option value="' + sel + '" selected>' + sel + ' servings (custom)</option>';
    }
    opts += '<option value="__custom__">Custom number…</option>';
    return (
      '<select class="form-input" id="' +
      (id || 'recipe-servings') +
      '">' +
      opts +
      '</select>'
    );
  }

  function serveUnitSelectHtml(selected, id) {
    var cur = String(selected || 'plate').toLowerCase();
    var opts = SERVE_UNITS.map(function (u) {
      return (
        '<option value="' +
        u.id +
        '"' +
        (u.id === cur ? ' selected' : '') +
        '>' +
        u.label +
        '</option>'
      );
    }).join('');
    return (
      '<select class="form-input" id="' +
      (id || 'recipe-serve-unit') +
      '">' +
      opts +
      '</select>'
    );
  }

  /**
   * Weighted average unit cost after receiving stock.
   * newAvg = (oldQty * oldCost + addQty * buyCost) / (oldQty + addQty)
   */
  function weightedAverageCost(oldQty, oldCost, addQty, buyCost) {
    var oq = Math.max(0, Number(oldQty) || 0);
    var oc = Math.max(0, Number(oldCost) || 0);
    var aq = Math.max(0, Number(addQty) || 0);
    var bc = Math.max(0, Number(buyCost) || 0);
    if (aq <= 0) return oc;
    if (bc <= 0) return oc;
    if (oq <= 0 || oc <= 0) return bc;
    return Math.round(((oq * oc + aq * bc) / (oq + aq)) * 10000) / 10000;
  }

  /**
   * Theoretical stock used from paid bills (recipe-based), for variance.
   */
  function theoreticalUsageFromBills(bills, menuList, inventory) {
    var map = {};
    (bills || []).forEach(function (b) {
      var st = String(b.status || 'paid').toLowerCase();
      if (st === 'refunded' || st === 'void' || st === 'cancelled') return;
      var items = b._items || b.items;
      if (!Array.isArray(items)) return;
      // bills sometimes store count as number
      if (typeof items === 'number') return;
      var built = buildDeductLines(items, menuList, inventory);
      (built.lines || []).forEach(function (l) {
        var k = String(l.name || l.key || '').toLowerCase();
        if (!k) return;
        if (!map[k]) map[k] = { name: l.name || l.key, qty: 0, unit: l.unit || 'kg' };
        map[k].qty += Number(l.qty) || 0;
        if (l.unit) map[k].unit = l.unit;
      });
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  /** Recipe health for a menu item */
  function recipeHealth(menuItem, inventory) {
    var m = menuItem || {};
    var ings = Array.isArray(m.ingredients) ? m.ingredients : [];
    if (!ings.length) return { ok: false, code: 'no_recipe', label: 'No recipe' };
    var missing = [];
    var noCost = [];
    ings.forEach(function (g) {
      var inv = findInventory(g, inventory);
      if (!inv) missing.push(g.name);
      else if (!(Number(inv.cost) > 0)) noCost.push(g.name);
    });
    if (missing.length) return { ok: false, code: 'missing_stock', label: 'Stock missing', missing: missing };
    if (noCost.length) return { ok: false, code: 'no_cost', label: 'Cost missing', noCost: noCost };
    return { ok: true, code: 'ok', label: 'Ready' };
  }

  global.RSRecipeUnits = {
    SERVE_UNITS: SERVE_UNITS,
    STOCK_UNITS: STOCK_UNITS,
    normUnit: normUnit,
    displayUnit: displayUnit,
    convertQty: convertQty,
    unitSelectHtml: unitSelectHtml,
    recipeServingsOf: recipeServingsOf,
    serveUnitOf: serveUnitOf,
    serveUnitLabel: serveUnitLabel,
    sellFactor: sellFactor,
    findInventory: findInventory,
    deductQtyForIngredient: deductQtyForIngredient,
    plateCost: plateCost,
    buildDeductLines: buildDeductLines,
    servingsSelectHtml: servingsSelectHtml,
    serveUnitSelectHtml: serveUnitSelectHtml,
    weightedAverageCost: weightedAverageCost,
    theoreticalUsageFromBills: theoreticalUsageFromBills,
    recipeHealth: recipeHealth,
  };
})(typeof window !== 'undefined' ? window : globalThis);
