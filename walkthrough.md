# Walkthrough - RestroSuite Multi-Outlet Chain & Brand Dashboard (June 20, 2026)

We have successfully implemented the Multi-Outlet Chain features, allowing corporate brand administrators to centrally manage menus, analyze cross-store inventory, and coordinate stock transfers.

---

## 1. Database Migrations
* Created the [supabase_chain_migration.sql](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/supabase_chain_migration.sql) migration script.
* Created the parent brand configuration `saas_brands` and corporate user profiling `doppio_brand_users`.
* Modified the core outlet directory `saas_tenants` to link to their respective corporate brands.
* Created the `doppio_master_menu` table for brand-wide recipe catalogs, and updated local outlet menu tables to support regional pricing overrides and local special additions.
* Created the inter-store inventory transshipment table `doppio_stock_transfers` and items table `doppio_stock_transfer_items`.

## 2. Brand Dashboard Front-End Layout
* Injected a new **Chain Management** sidebar section and a **Chain Dashboard** tab panel into [dashboard.html](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/dashboard.html).
* Designed dynamic widgets:
  * **Brand Performance Metrics**: Live totals for total brand revenue, order counts, average ticket value, and alerting outlets.
  * **Revenue Trend Chart**: High-fidelity SVG-based smooth area curve visualizing daily sales trends across the entire outlet network.
  * **Top Performing Outlets**: Rankings table showing real-time revenues and growth margins per branch.
  * **Cross-Outlet Inventory Heatmap**: Color-coded status table indicating which ingredients are OK, low, or critically out of stock at each outlet location.
  * **Inter-Outlet Stock Transfers Manager**: Request new stock movements or approve pending transfers between branches on-the-fly.
  * **Central Master Menu Catalog**: Allows corporate to manage the central item list, SKU associations, categories, and default pricing.

## 3. JavaScript Controller Logic
* Created the modular controller [src/dashboard/chain.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/src/dashboard/chain.js) to manage the rendering logic, simulation states (mock local stores), and action handlers for adding master catalog items and managing stock transfers.
* Integrated the module in the main controller [assets/dashboard.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/dashboard.js), specifying security route locks so only `brand_admin` users can load or interact with this view.
* Updated local login simulations in [assets/doppio-api.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/doppio-api.js) to support logging in with the slug `brand-admin` to test the entire workflow.

---

# Walkthrough - RestroSuite Customer Dues, Table QRs, and Onboarding Tour

We have successfully implemented:
1. Outstanding dues/credit management for registered customers.
2. Table-specific QR code previewing and batch printing.
3. Persistent POS draft orders.
4. Versioned update release logs and a step-by-step onboarding feature tour.

All changes are optimized, styled to match the RestroSuite design system, and synchronized between the web workspace and Android app assets.

---

## Dues & Credit Management

### 1. Database Schema
* Added the numeric `dues` column to the `doppio_crm` table in [supabase_migration.sql](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/supabase_migration.sql) with a default of `0`.
* Configured read/write database mapping for the `dues` field in [assets/db.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/db.js).

### 2. POS Interface & Cart Logic
* Added a **Customer Selector** (`#cart-customer-sel`) dropdown next to the table selector in the POS sidebar cart in [dashboard.html](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/dashboard.html).
* Added a **"Due"** payment method button next to Cash/UPI/Card in the POS cart.
* Updated `getCustomer()` in [assets/dashboard.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/dashboard.js) to retrieve details from the customer selector.
* Updated the `checkout()` method in [assets/features-pos.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/features-pos.js) to:
  * Open an interactive **Quick Customer Registration Modal** if a "Due" credit checkout is triggered without selecting a customer. This lets cashiers input a Name & Phone on-the-fly, register the profile in `RS_DB`, select them in the cart dropdown, and complete the sale in one action.
  * Increment the customer's dues balance in the database by the order total when checking out with "Due" payment.
  * Reset the customer selector upon successful checkout or draft parking, and restore selection when resuming drafts.

### 3. CRM & Settlements
* Replaced the duplicate "Loyalty members" statistics card in the Customers tab with a **"Total Outstanding Dues"** card in [assets/features-growth.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/features-growth.js).
* Added a dynamic outstanding dues badge to customer cards in the CRM grid.
* Added a **"Settle Dues"** banner and footer button inside the customer details modal.
* Implemented the **`showSettleDuesModal()`** popup to pay off outstanding dues (Cash/UPI/Card), update their credit balance, and record the settlement payment in the bill ledger. 
* Integrated the **`RSReceipt`** modal to automatically trigger upon successful dues settlement, offering cashiers and customers options to print a formal settlement receipt or share it directly over WhatsApp.

---

## Table QR Code Printing

* Added a **"Print Table QRs"** button in the Floor & Tables toolbar and a **"View QR"** button in individual table modals.
* Implemented preview rendering and high-quality standalone tabletop card printing for individual tables and a batch of all tables.

---

## Onboarding & Product Guide UI Layout Fixes (June 19, 2026)
* **Fixed Unstyled & Transparent Elements**: Added missing layout, overlay, spotlight, and tooltip card CSS styles to [assets/dashboard.css](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/dashboard.css).
* **CSS Variable Refactoring**: Replaced old theme variables (like `var(--bg-card)`, `var(--text-dark)`, `var(--text-muted)`, `var(--accent-caramel)`) with active design system tokens (like `var(--panel-solid)`, `var(--text)`, `var(--text-soft)`, `var(--orange)`) from `assets/restrosuite.css` to fix transparent panel overlays and ensure full dark/light mode compatibility.
* **Guide Modal Backdrop Blur**: Implemented a blurred overlay (`backdrop-filter: blur(12px)`) on `.product-guide-backdrop` to cover and isolate the POS screen in the background when the Workspace Guide is open.
* **Button & Icon Styling**: Styled `#tour-prev-btn`, `#tour-next-btn`, close buttons, and checklist items inside the guide modal to fit the luxe restaurant theme.
* **Android Sync & Commit**: Ran `sync-assets.ps1` to mirror all styling changes to the Android app assets folder and successfully pushed the changes to the `main` branch.

## Onboarding Feature Tour & Releases
* **Dynamic Release Notes Sync**: Refactored [src/dashboard/onboarding.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/src/dashboard/onboarding.js) to fetch `app-update.json` on boot and dynamically prepend the latest release details to the top of the history list if not already present. This ensures release logs are never generic.
* **Release Modal Variable Fixes**: Refactored `showUpdateDialog` in [assets/dashboard.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/dashboard.js) to prioritize actual `releaseInfo` attributes over generic fallback labels.
* **Auto-Trigger Tour Post-Update**: Configured the tour system to detect an applied update (via `rs_update_applied_at` flag) on page load and automatically open the **"What's New"** modal with a personalized sprinkles banner prompting users to take the guided tour.
* **Versioned Tour Seen Flags**: Replaced hardcoded tour seen flags in `localStorage` with a dynamic key mapped to `window.__RESTROSUITE_ASSET_VERSION__` (e.g., `restrosuite_update_tour_seen:2026.06.19-dues`) to ensure a tour is shown once for every new version release.
* **Date-Wise Dues Bill Numbers**: Formatted dues settlement bill numbers inside [assets/features-growth.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/features-growth.js) as `RS-SETTLE-YYYYMMDD-HHMMSS` (e.g. `RS-SETTLE-20260619-200218`) for easy chronological indexing and lookup.
* Linked `onboarding.js` script tag in [dashboard.html](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/dashboard.html).

---

## Code Synchronization
* Ran `sync-assets.ps1` to fully copy all modified files, directories, and configuration settings to the Android app assets folder (`android-app/app/src/main/assets/`).
