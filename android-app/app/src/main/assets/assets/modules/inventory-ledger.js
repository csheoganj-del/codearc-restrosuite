/* ============================================================
   RestroSuite — Inventory ledger (Wave 5 remaining / code-split)
   Extracted from dashboard.js — attaches to window.RS when ready.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }

  function getMenu() {
    return (global.RS && RS.MENU) || [];
  }
  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }

  function markDeducted(deductKey) {
    if (!deductKey) {return;}
    if (!global.__rsInvDeducted) {global.__rsInvDeducted = new Set();}
    global.__rsInvDeducted.add(deductKey);
    try {
      const dayKey = 'rs_inv_deducted:' + new Date().toISOString().slice(0, 10);
      const stored = JSON.parse(localStorage.getItem(dayKey) || '[]');
      if (stored.indexOf(deductKey) === -1) {
        stored.push(deductKey);
        while (stored.length > 500) {stored.shift();}
        localStorage.setItem(dayKey, JSON.stringify(stored));
      }
    } catch (_) {}
  }

  function alreadyDeducted(deductKey) {
    if (!deductKey) {return false;}
    if (!global.__rsInvDeducted) {global.__rsInvDeducted = new Set();}
    try {
      const dayKey = 'rs_inv_deducted:' + new Date().toISOString().slice(0, 10);
      const stored = JSON.parse(localStorage.getItem(dayKey) || '[]');
      stored.forEach((k) => global.__rsInvDeducted.add(String(k)));
    } catch (_) {}
    return global.__rsInvDeducted.has(deductKey);
  }

  function buildLines(items, MENU) {
    // Serving-aware + unit-aware path (recipe servings, g/kg, ml/L)
    if (global.RSRecipeUnits && typeof RSRecipeUnits.buildDeductLines === 'function') {
      return RSRecipeUnits.buildDeductLines(items, MENU, getInventory());
    }
    let noRecipeCount = 0;
    const lines = [];
    (items || []).forEach((it) => {
      const menuItem =
        MENU.find((m) => String(m.id) === String(it.id)) ||
        MENU.find((m) => m.name === it.name);
      if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {
        noRecipeCount++;
        return;
      }
      const orderedQty = Number(it.qty) || 1;
      const base = Math.max(1, Number(menuItem.recipeServings) || 1);
      const factor = orderedQty / base;
      menuItem.ingredients.forEach((ing) => {
        const qty = (Number(ing.qty) || 0) * factor;
        if (qty <= 0) {return;}
        const key = String(ing.key || ing.name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        lines.push({ key, name: ing.name || key, qty, unit: ing.unit || 'unit' });
      });
    });
    return { lines, noRecipeCount };
  }

  /**
   * Takeaway / Delivery order-level packaging — NOT cart lines.
   * One pack per order when channel is takeaway or delivery.
   * Config: RS_SETTINGS.set_takeaway_pack or localStorage rs_takeaway_pack
   *   { enabled: true, items: [{ name, qty, unit }], applyDelivery: true }
   */
  function loadTakeawayPackConfig() {
    try {
      const s = (global.RS_SETTINGS || global.RS && RS.getSettings && null) || global.RS_SETTINGS || {};
      let cfg = s.set_takeaway_pack;
      if (typeof cfg === 'string') {
        try {
          cfg = JSON.parse(cfg);
        } catch (_) {
          cfg = null;
        }
      }
      if (!cfg || typeof cfg !== 'object') {
        const raw = global.localStorage && localStorage.getItem('rs_takeaway_pack');
        if (raw) {cfg = JSON.parse(raw);}
      }
      if (!cfg || typeof cfg !== 'object') {return { enabled: false, items: [], applyDelivery: true };}
      return {
        enabled: cfg.enabled !== false && Array.isArray(cfg.items) && cfg.items.length > 0,
        items: Array.isArray(cfg.items) ? cfg.items : [],
        applyDelivery: cfg.applyDelivery !== false,
      };
    } catch (_) {
      return { enabled: false, items: [], applyDelivery: true };
    }
  }

  function isParcelChannel(billRow) {
    const ch = String(
      (billRow && (billRow.channel || billRow.orderType || billRow.order_type || billRow.table)) || ''
    ).toLowerCase();
    if (ch.includes('dine')) {return false;}
    if (ch.includes('take') || ch.includes('parcel') || ch.includes('carry')) {return true;}
    if (ch.includes('deliv')) {return true;}
    // walk-in takeaway tables often labeled this way
    if (ch.includes('walk') && ch.includes('take')) {return true;}
    return false;
  }

  function isDeliveryChannel(billRow) {
    const ch = String((billRow && (billRow.channel || billRow.orderType || '')) || '').toLowerCase();
    return ch.includes('deliv');
  }

  /** Merge order-level packaging lines into food recipe lines (once per bill). */
  function appendTakeawayPackLines(lines, billRow) {
    const cfg = loadTakeawayPackConfig();
    if (!cfg.enabled || !cfg.items.length) {return { lines: lines || [], packCount: 0 };}
    const parcel = isParcelChannel(billRow);
    if (!parcel) {return { lines: lines || [], packCount: 0 };}
    if (isDeliveryChannel(billRow) && cfg.applyDelivery === false) {
      return { lines: lines || [], packCount: 0 };
    }
    const inv = getInventory();
    const out = (lines || []).slice();
    let packCount = 0;
    cfg.items.forEach((it) => {
      const name = String(it.name || '').trim();
      const qty = Number(it.qty) || 0;
      if (!name || qty <= 0) {return;}
      const stock = inv.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
      const unit = (stock && stock.unit) || it.unit || 'gm';
      const key = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      // merge with existing line if recipe already uses same pack item
      const existing = out.find(
        (l) =>
          (l.name && String(l.name).toLowerCase() === name.toLowerCase()) ||
          (l.key && l.key === key)
      );
      if (existing) {
        existing.qty = (Number(existing.qty) || 0) + qty;
      } else {
        out.push({ key, name, qty, unit, pack: true });
      }
      packCount++;
    });
    return { lines: out, packCount };
  }

  async function deductInventoryForBill(billRow) {
    const MENU = getMenu();
    const INVENTORY = getInventory();
    const items = (billRow && billRow._items) || [];
    if (!items.length) {return;}
    const deductKey = String(
      (billRow && (billRow.idempotencyKey || billRow.no || billRow.orderId || billRow.id)) || ''
    );
    if (alreadyDeducted(deductKey)) {
      console.info('[Inventory] Skip duplicate deduction for', deductKey);
      return;
    }

    const built = buildLines(items, MENU);
    let lines = built.lines;
    const noRecipeCount = built.noRecipeCount;
    const packMerge = appendTakeawayPackLines(lines, billRow);
    lines = packMerge.lines;
    const packCount = packMerge.packCount || 0;

    if (!lines.length) {
      if (noRecipeCount === items.length) {
        toast('No stock deducted: link recipes under Inventory > Recipes', 'fa-triangle-exclamation');
      }
      return;
    }

    // Server atomic path
    try {
      if (global.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
        const res = await Promise.race([
          RS_API.data({
            operation: 'deduct_inventory',
            bill_key: deductKey,
            order_id: billRow.no || billRow.orderId || '',
            lines,
          }),
          new Promise((_, rej) => { setTimeout(() => rej(new Error('deduct_inventory timeout')), 8000); }),
        ]);
        const payload = res && res.results != null ? res : (res && res.data) || res;
        if (payload && (payload.ok || payload.duplicate || Array.isArray(payload.results))) {
          markDeducted(deductKey);
          const results = Array.isArray(payload.results) ? payload.results : [];
          results.forEach((r) => {
            if (!r || r.status !== 'ok') {return;}
            const invItem = INVENTORY.find(
              (x) =>
                String(x.id) === String(r.id) ||
                (x.key && r.key && String(x.key).toLowerCase() === String(r.key).toLowerCase()) ||
                (x.name && r.name && String(x.name).toLowerCase() === String(r.name).toLowerCase())
            );
            if (invItem && r.stock_after != null) {invItem.stock = Number(r.stock_after);}
          });
          if (global.RS_DB && RS_DB.writeLocal) {
            try {
              const _w = RS_DB.writeLocal('inventory', INVENTORY);
              if (_w && _w.catch) {_w.catch(() => {});}
            } catch (e) {}
          }
          const deductedCount = Number(payload.deducted) || results.filter((r) => r && r.status === 'ok').length;
          const missing = Array.isArray(payload.missing) ? payload.missing : [];
          const lowStock = Array.isArray(payload.low_stock) ? payload.low_stock : [];
          if (payload.duplicate) {
            console.info('[Inventory] Server reported duplicate deduction for', deductKey);
          } else if (deductedCount > 0) {
            toast(
              'Stock updated: ' +
                deductedCount +
                ' item' +
                (deductedCount === 1 ? '' : 's') +
                ' deducted' +
                (packCount ? ' · incl. takeaway pack' : ''),
              'fa-boxes-stacked'
            );
          }
          if (missing.length) {
            setTimeout(
              () =>
                toast(
                  'Recipe ingredient not in stock: ' +
                    missing.slice(0, 3).join(', ') +
                    (missing.length > 3 ? '…' : ''),
                  'fa-triangle-exclamation'
                ),
              1200
            );
          }
          if (lowStock.length) {
            setTimeout(
              () =>
                toast(
                  'Low stock: ' + lowStock.slice(0, 3).join(', ') + (lowStock.length > 3 ? '…' : ''),
                  'fa-triangle-exclamation'
                ),
              2200
            );
          }
          if (noRecipeCount) {
            setTimeout(
              () =>
                toast(
                  noRecipeCount +
                    ' sold item' +
                    (noRecipeCount === 1 ? '' : 's') +
                    ' skipped: no recipe linked',
                  'fa-triangle-exclamation'
                ),
              1600
            );
          }
          if (document.querySelector('#inventory-tab.active') && global.RS && RS.render) {RS.render('inventory-tab');}
          // If server ok but deducted nothing while we still have lines, fall through to local
          if (deductedCount > 0 || payload.duplicate) {return;}
          if (!missing.length) {return;}
          console.info('[Inventory] server missing ingredients — local fallback for', missing.join(', '));
        }
      }
    } catch (e) {
      console.warn('[Inventory] server deduct failed, using local fallback:', e && e.message);
    }

    // Local fallback (+ FEFO batch consumption when available)
    let changed = false;
    let deductedCount = 0;
    const lowStock = [];
    const missingIngredients = [];
    const nearAfter = [];
    const Batches = global.RSInventoryBatches;
    const runLines = async () => {
      for (const line of lines) {
        const invItem = INVENTORY.find(
          (x) =>
            (x.name && line.name && String(x.name).toLowerCase() === String(line.name).toLowerCase()) ||
            (x.key && line.key && String(x.key).toLowerCase() === String(line.key).toLowerCase())
        );
        if (!invItem) {
          if (line.name && missingIngredients.indexOf(line.name) === -1) {missingIngredients.push(line.name);}
          continue;
        }
        const q = Number(line.qty) || 0;
        invItem.stock = Math.max(0, (Number(invItem.stock) || 0) - q);
        if (Batches && typeof Batches.deductFefo === 'function') {
          try {
            await Batches.deductFefo(invItem, q);
            const sum = Batches.summarizeItem(invItem);
            if (sum.status === 'near' || sum.status === 'expired') {
              if (nearAfter.indexOf(invItem.name) === -1) {nearAfter.push(invItem.name);}
            }
          } catch (e) {
            console.warn('[Inventory] FEFO deduct failed', e);
          }
        }
        changed = true;
        deductedCount++;
        const minLevel = Number(invItem.min != null ? invItem.min : invItem.minStock || 0);
        if (minLevel && invItem.stock <= minLevel && lowStock.indexOf(invItem.name) === -1) {
          lowStock.push(invItem.name);
        }
      }
    };
    // deductInventoryForBill is async — await FEFO loop
    await runLines();
    if (changed) {
      markDeducted(deductKey);
      if (global.RS_DB && RS_DB.writeLocal) {
        try {
          const _w = RS_DB.writeLocal('inventory', INVENTORY);
          if (_w && _w.catch) {_w.catch(() => {});}
        } catch (e) {}
      }
      try {
        if (global.RS && RS.save) {
          const saveResult = RS.save('inventory');
          if (saveResult && typeof saveResult.catch === 'function') {
            saveResult.catch((err) => {
              console.warn('Inventory cloud sync failed', err);
              toast('Inventory saved locally. Cloud sync pending.', 'fa-cloud-arrow-up');
            });
          }
        }
      } catch (e) {
        console.warn('Inventory save failed', e);
      }
      if (document.querySelector('#inventory-tab.active') && global.RS && RS.render) {RS.render('inventory-tab');}
      toast(
        'Stock updated: ' +
          deductedCount +
          ' item' +
          (deductedCount === 1 ? '' : 's') +
          ' deducted' +
          (packCount ? ' · incl. takeaway pack' : ''),
        'fa-boxes-stacked'
      );
      if (noRecipeCount) {
        setTimeout(
          () =>
            toast(
              noRecipeCount + ' sold item' + (noRecipeCount === 1 ? '' : 's') + ' skipped: no recipe linked',
              'fa-triangle-exclamation'
            ),
          1400
        );
      }
      if (missingIngredients.length) {
        setTimeout(
          () =>
            toast(
              'Recipe ingredient not in stock: ' +
                missingIngredients.slice(0, 3).join(', ') +
                (missingIngredients.length > 3 ? '...' : ''),
              'fa-triangle-exclamation'
            ),
          noRecipeCount ? 2600 : 1400
        );
      }
      if (lowStock.length) {
        setTimeout(
          () =>
            toast(
              'Low stock: ' + lowStock.slice(0, 3).join(', ') + (lowStock.length > 3 ? '...' : ''),
              'fa-triangle-exclamation'
            ),
          missingIngredients.length || noRecipeCount ? 3800 : 2600
        );
      }
      if (nearAfter.length) {
        setTimeout(
          () =>
            toast(
              'Use first (near expiry): ' +
                nearAfter.slice(0, 3).join(', ') +
                (nearAfter.length > 3 ? '…' : ''),
              'fa-clock'
            ),
          3200
        );
      }
    } else if (noRecipeCount === items.length) {
      toast('No stock deducted: link recipes under Inventory > Recipes', 'fa-triangle-exclamation');
    } else if (missingIngredients.length) {
      toast(
        'No stock deducted: missing inventory item ' + missingIngredients.slice(0, 2).join(', '),
        'fa-triangle-exclamation'
      );
    }
  }

  function restoreInventoryForBill(billRow) {
    const MENU = getMenu();
    const INVENTORY = getInventory();
    const items = (billRow && billRow._items) || [];
    if (!items.length) {return;}
    let changed = false;
    items.forEach((it) => {
      const menuItem = MENU.find((m) => m.name === it.name);
      if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {return;}
      const orderedQty = Number(it.qty) || 1;
      menuItem.ingredients.forEach((ing) => {
        const invItem = INVENTORY.find((x) => x.name === ing.name);
        if (!invItem) {return;}
        invItem.stock = (Number(invItem.stock) || 0) + (Number(ing.qty) || 0) * orderedQty;
        changed = true;
      });
    });
    if (changed) {
      if (global.RS_DB && RS_DB.writeLocal) {
        try {
          const _w = RS_DB.writeLocal('inventory', INVENTORY);
          if (_w && _w.catch) {_w.catch(() => {});}
        } catch (e) {}
      }
      try {
        if (global.RS && RS.save) {RS.save('inventory');}
      } catch (_) {}
      if (document.querySelector('#inventory-tab.active') && global.RS && RS.render) {RS.render('inventory-tab');}
    }
  }

  global.RSInventoryLedger = {
    deductInventoryForBill,
    restoreInventoryForBill,
    buildLines,
    loadTakeawayPackConfig,
    appendTakeawayPackLines,
    isParcelChannel,
  };

  function attach() {
    if (!global.RS) {
      setTimeout(attach, 40);
      return;
    }
    global.RS.deductInventoryForBill = deductInventoryForBill;
    global.RS.restoreInventoryForBill = restoreInventoryForBill;
  }
  attach();
})(typeof window !== 'undefined' ? window : globalThis);
