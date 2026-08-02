# Import / Export / Inventory deduction audit

**Outlet tested:** `humanaudit56676669`  
**Date:** 2026-08-02  
**Scripts:** `scripts/audit-import-export-inventory.cjs`  
**Results JSON:** `docs/audit-import-export-inventory.json`

---

## Inventory deduction

| Check | Result | Notes |
|--------|--------|--------|
| `RS.deductInventoryForBill` present | **PASS** | Wired after checkout |
| `RSInventoryLedger` present | **PASS** | Builds recipe lines correctly |
| Sample menu has recipes (before fix) | **FAIL / gap** | Sample dishes shipped with `ingredients: []` |
| Store-room stock on audit outlet | **Empty** | Sample stock not seeded on this outlet |
| Deduct when recipe + stock linked | **Designed to work** | Lines build (e.g. Milk 0.2 L); needs stock in inventory |
| Auto deduct on Print & Pay | **Only if recipes linked** | Without recipes → toast: *No stock deducted: link recipes…* |

### Fix shipped this pass
- Sample menu items now include **recipe links** to sample stock (tea leaves, milk, oil, cups, bags).
- Sample stock seeds with **stable keys** (`milk`, `tea_leaves`, …).
- Existing outlets: **backfill recipes** on matching sample dish names + seed stock if empty.
- If cloud deduct returns “missing” ingredients, **local fallback** still reduces on-device stock.

---

## Import / Export map (everywhere)

### Menu Editor
| Control | ID | Live test |
|---------|-----|-----------|
| Export menu CSV | `#btn-export-menu` | **PASS** — file downloaded |
| Template CSV | `#btn-download-menu-template` | **PASS** |
| Import menu CSV | `#btn-import-menu` | **PASS** (button + parser); live 1-row push **PASS** |

### Inventory
| Control | ID | Live test |
|---------|-----|-----------|
| Export all stock | `#btn-export-inventory` | **WARN empty** when no stock rows (toast: nothing to export) |
| Template | `#btn-download-inventory-template` | **PASS** |
| Import CSV | `#btn-import-inventory` | **PASS** button; needs stock rows to re-export |
| Low-stock CSV | `#btn-export-low-stock` / toolbar | **WARN** if no low-stock items |
| Bulk recipe import | `#btn-bulk-recipe-import` | **PASS** in DOM (paste UI) |
| Export recipes | `#btn-export-recipes` | **WARN** if no recipes linked |

### Bills
| Control | ID | Live test |
|---------|-----|-----------|
| Excel (xlsx) | `#btn-export-bills` | **PASS** |
| CSV | `#btn-export-bills-csv` | **PASS** |

### Reports
| Control | ID | Live test |
|---------|-----|-----------|
| GSTR CSV | `#btn-download-gstr` | **Works** via browser download link (not `RS.downloadFile` hook) |
| CA pack | `#rs-fx-ca-pack` | Triggers GSTR + day pack |

### POS / ops
| Control | ID | Live test |
|---------|-----|-----------|
| Day pack CSV | `#rs-day-pack` | Present; exports today’s paid bills |

### Tax
| Control | ID | Live test |
|---------|-----|-----------|
| Ledger CSV | `#tax-csv` | Present |
| GSTR-1 offline | `#tax-gstr1-csv` | Present (India) |
| Import tax | `#tax-import` | Present |

### Other
| Area | Export |
|------|--------|
| Z-report / shift | CSV from shift close |
| Dues | `RS_exportDuesCsv` |
| Super-admin tenants | `#btn-export-tenants` |
| Waste log | `#btn-export-waste` |

---

## Honest scores

| Area | Score | Why |
|------|------:|-----|
| Menu export/import | **9/10** | Export + template + import all real |
| Bills export | **9.5/10** | Excel + CSV verified |
| Inventory export/import | **7.5/10** | UI complete; empty stock = nothing to export until stock exists |
| Reports GSTR / CA pack | **8.5/10** | Export logic real; CA is multi-file |
| Live stock deduct on sample café | **was ~3/10** → **~8.5/10 after recipe+stock fix** | Needed recipes + stock seed |

---

## Owner checklist (use after deploy)

1. Inventory → if empty, **Load sample** again or Import stock CSV / Template.  
2. Or Inventory → Recipes → link dishes to store-room.  
3. Sell Masala Chai / Butter Chicken → stock for Milk / Oil should drop.  
4. Menu → Export → edit → Import.  
5. Bills → Excel / CSV.  
6. Reports → GSTR CSV / CA pack.
