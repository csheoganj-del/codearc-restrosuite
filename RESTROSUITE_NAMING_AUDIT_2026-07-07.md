# RestroSuite — Naming Consistency Audit (Code ↔ Database)

**Date:** 7 July 2026
**Question answered:** Do the names in the code match the database exactly, or are there mismatches (camelCase vs snake_case, multiple names for the same thing) that stop features working?

**Short answer: No — several do not match, and it is causing real breakage.** The same root cause that broke QR ordering (a column called `tableNumber` in code but referenced as `table_number`) exists in several other features. Below is every mismatch found, grouped by how badly it breaks things.

**Method:** The database migrations in `supabase/migrations` were parsed into an authoritative column list per table, then compared against the client's read/write contract (the `MAP` in `assets/db.js`) and the database triggers. One important caveat is stated at the end: your **live** production database may have drifted from the migrations, so a few "soft" items need a 30-second live check to confirm (a ready-to-run query is provided).

---

## How the breakage happens (plain language)

When you are logged in, the app saves each record to the cloud by sending the database a set of named fields. **If even one field name doesn't exist as a real column, the database rejects the whole record.** The app then quietly keeps that record only on the local device — so it looks saved on that screen but never syncs, doesn't appear on other devices, and is lost if the cache clears. The app only knows how to "forgive" one specific field (`menu.tax_category`); for every other table, a wrong field name means the cloud save fails silently.

---

## 1. Hard-broken features (cloud save fails every time)

These have required (`NOT NULL`) columns that the code never sends, because the code uses different field names. These records cannot save to the cloud at all.

**Reservations** — table `doppio_reservations`
| Code sends | Real column | 
|---|---|
| `guestName` | `guest_name` (required) |
| `guestPhone` | `phone` |
| `pax` | `party_size` (required) |
| `tableNumber` | `table_number` |
| `time` + `date` | `reserved_for` (one timestamp, required) |

Nothing but `status` lines up, and three required columns are never filled → every reservation save is rejected.

**Offers / promo codes** — table `doppio_offers`
| Code sends | Real column |
|---|---|
| `description` | `title` (required) — never sent |
| `usageCount` | *(no such column)* |

`title` is required and never sent → offer creation is rejected.

**Purchase Orders** — table `doppio_purchase_orders`
| Code sends | Real column |
|---|---|
| `poNumber` | *(no such column)* |
| `supplier` | `vendor_name` (required) |
| `items` | `item_name` (required) |
| `value` | `expected_cost` |
| `date` | `due_date` |

`vendor_name` and `item_name` are required and never sent → purchase orders can't save.

---

## 2. Soft-broken (record saves, but some fields are silently dropped or the whole save fails depending on live drift)

**Vendors** — `doppio_vendors`: code sends `contact`, `terms`, `rating`, `itemsCount`; real columns are `phone`, `email`, `gst_number`, `category`. `contact` should be `phone`. The extra fields are dropped.

**Customers / CRM** — `doppio_crm`: code sends `email`, `dues`, `marketing_opt_in`; none exist in the migrations. Customer email and outstanding dues are not stored (and if the live table lacks these columns, the whole customer save fails and stays local-only).

**Bills** — `doppio_bills`: code sends `cgst`, `sgst`, `igst`, `transaction_type`; the migrations don't define them. Since bills *did* save in the live QA test, your production `doppio_bills` has almost certainly drifted to include these columns — a sign the live DB and the migrations are out of sync. Worth confirming.

**Inventory** — `doppio_inventory`: code sends `name` and `threshold`, but the real column is `label` (not `name`) and the minimum-stock `threshold` actually lives in a separate table `doppio_inventory_thresholds`. Min-stock levels saved this way don't stick.

**Support tickets** — `doppio_support_tickets`: code sends `ticketNumber` and `customerName`, neither of which are columns; `subject` saves fine.

**Minor / negligible:** `doppio_employees` gets a `daily_rate` that isn't a column; `doppio_pending_orders` gets a `priority` that isn't a column. Core function still works.

---

## 3. The underlying pattern: mixed camelCase and snake_case

The database itself is inconsistent, which is what makes this so error-prone:

- Some tables use **camelCase** columns that must always be written in quotes: `doppio_pending_orders`, `doppio_bills`, `doppio_shifts`, `doppio_shift_events`, `doppio_attendance`, `doppio_draft_orders`, `doppio_leave_requests`, `doppio_notifications` (e.g. `"tableNumber"`, `"orderId"`, `"customerName"`, `"dateTime"`, `"paymentMethod"`, `"shiftId"`, `"isRead"`).
- Most other tables use **snake_case** (`table_number`, `session_token`, `guest_name`, `created_at`).
- The **same concept has two names**: "table number" is `"tableNumber"` in orders/bills but `table_number` in table sessions, table layout, and reservations. This exact split is what caused the QR trigger to fail (it read `table_number` from a table whose column is `"tableNumber"`).

There are no cases of one table having two different physical names, and the table allowlists in the browser adapter and the two Edge Functions are consistent with each other (the automated `database-contract` test enforces that). The problem is **column** names, not table names.

---

## Recommendation

1. **Confirm the live truth first.** Run `scripts/dump-live-schema.sql` in Supabase → SQL Editor and share the output. Because the live DB has clearly drifted from the migrations (bills prove it), we should reconcile the code against the *actual* columns, not assumptions. This takes about 30 seconds.
2. **Then fix the client mapping** (`assets/db.js` `MAP`) so each feature's field names match the real columns — starting with the three hard-broken features (Reservations, Offers, Purchase Orders), which are unambiguous.
3. **Longer term**, pick one convention (snake_case is the Postgres norm) and migrate the camelCase columns, so this class of bug stops recurring. That's a larger, planned change — not required for launch, but it's the permanent cure.

I can do step 2 as soon as you send the live-schema output from step 1.
