# Connecting RestroSuite to YOUR existing Supabase (Doppio backend)

This app is wired to talk to **your existing Supabase project** through the
Edge Functions you already have — **`tenant-access`** (login/registration) and
**`tenant-data`** (all reads/writes, tenant-scoped). It does **not** create any
new tables; it uses your real `doppio_*` tables.

Until you add your keys it runs in **Local (demo)** mode — data lives in the
browser. The topbar badge shows **Local** or **Cloud**.

---

## Step 1 — Add your project keys
Open **`assets/supabase-config.js`** and fill in:

```js
window.RS_SUPABASE = {
  url:     "https://htkauiibuejetimfiavs.supabase.co",   // your Project URL
  anonKey: "eyJhbGciOiJIUzI1NiI...your anon public key..."
};
```
*(Settings → API in your Supabase dashboard. Use the **anon public** key, never the service_role key.)*

## Step 2 — Allow this app's web address (CRITICAL)
Your Edge Functions only accept calls from approved origins (good security).
You must add wherever you host this app to that allow-list, or every call is
blocked by the browser (CORS).

In Supabase → **Edge Functions → Secrets** (or your env config), set:
```
ALLOWED_ORIGINS = https://your-app-domain.com,https://codearc-restrosuite.vercel.app
```
Add every domain you open the app from (your live site, and a localhost origin
for testing if you run it locally). Re-deploy the functions if your platform
requires it. **No origin added = nothing loads.**

## Step 3 — Sign in
- Open **login.html**. Sign in with your **Outlet ID** (the tenant *slug*),
  **username**, and **password** — exactly what your `tenant-access` function
  expects.
- The dashboard then loads **your real menu, inventory, staff, and bills** for
  that tenant. The badge reads **Cloud**.

## Registration & approval
- "Register outlet" calls `tenant-access` → creates a tenant with
  **status = pending**. Per your backend, a pending outlet **cannot log in until
  it is approved** (via your `tenant-admin` / superadmin flow). So after
  registering, the app sends the user to the sign-in tab with a "pending
  approval" message — it does **not** drop them into the dashboard.
- The login username for a new outlet is set to the **owner email**.

---

## What's mapped to your tables
| App area | Your table | Notes |
|---|---|---|
| POS menu (read/add/edit/delete/availability) | `doppio_menu` | see field gaps ↓ |
| Bills (checkout writes a real invoice) | `doppio_bills` | items, subtotal, gst, cgst/sgst, total, paymentMethod |
| Inventory | `doppio_inventory` | current/threshold/max/unit/category |
| Customers / CRM | `doppio_crm` | name, phone, visits, total_spend, email |
| Employees | `doppio_employees` | name, role, contact, baseSalary, shift |
| Held orders | `doppio_draft_orders` | draftId, items, totals |
| Settings | `doppio_business_profile` | business_name, address, phone, gst |

Tenant isolation is automatic — `tenant_id` is enforced **server-side** by
`tenant-data` from your session token. The app never sends it.

## Field gaps I must flag (no matching column — as you asked)
1. **Menu "veg / non-veg":** `doppio_menu` has no veg column. I store it inside
   the existing **`recipe_specs`** JSONB as `{ "veg": true|false }`. If you'd
   rather have a real column, add `is_veg boolean` and I'll map to it.
2. **Menu stock state:** `doppio_menu` has only `available` (boolean), not the
   3-state ok/low/out. I map **out → available=false**; "low" shows as available.
   Granular stock lives in `doppio_inventory`.
3. **Inventory cost:** `doppio_inventory` has no `cost` column (your costs live
   in `doppio_item_costs`). Item cost from the UI is **not** persisted to
   `doppio_inventory`. Tell me if you want me to wire `doppio_item_costs`.
4. **Bill table number:** `doppio_bills` has no table column (table lives on
   `doppio_pending_orders`). The dine-in table isn't stored on the bill.
5. **Register address:** `saas_tenants` has no address column, so the address
   entered at registration isn't saved there — set it later in Settings
   (`doppio_business_profile.address`).

## Not yet wired to cloud (still demo data) — say the word and I'll do these
- **Live KOT / active orders & KDS / QR orders** → `doppio_pending_orders`
- **Online orders (Zomato/Swiggy/ONDC)** → `doppio_online_orders` (+ `doppio_aggregator_config`)
- **Floor & tables** → `doppio_table_layout`
- **Shifts & cash drawer** → `doppio_shifts` / `doppio_shift_events`
- **Payroll / attendance / leave**, **reservations**, **offers**, **purchase orders / vendors**, **support tickets**

## Testing checklist (on your deployment, since I can't reach your backend)
1. Keys in `supabase-config.js`, your origin in `ALLOWED_ORIGINS`.
2. Open `login.html` → sign in with a real approved outlet → lands on dashboard, badge = **Cloud**.
3. POS shows your real menu; take a payment → check a new row appears in `doppio_bills`.
4. Edit a menu item → confirm the change in `doppio_menu`.
5. If anything is blocked, open the browser console — a clear error (CORS / 401 / column) tells us exactly what to adjust.
