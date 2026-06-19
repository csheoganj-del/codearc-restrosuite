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
  * Block dues checkouts if no customer is selected.
  * Increment the customer's dues balance in the database by the order total when checking out with "Due" payment.
  * Reset the customer selector upon successful checkout or draft parking, and restore selection when resuming drafts.

### 3. CRM & Settlements
* Replaced the duplicate "Loyalty members" statistics card in the Customers tab with a **"Total Outstanding Dues"** card in [assets/features-growth.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/assets/features-growth.js).
* Added a dynamic outstanding dues badge to customer cards in the CRM grid.
* Added a **"Settle Dues"** banner and footer button inside the customer details modal.
* Implemented the **`showSettleDuesModal()`** popup to pay off outstanding dues (Cash/UPI/Card), update their credit balance, and record the settlement payment in the bill ledger.

---

## Table QR Code Printing

* Added a **"Print Table QRs"** button in the Floor & Tables toolbar and a **"View QR"** button in individual table modals.
* Implemented preview rendering and high-quality standalone tabletop card printing for individual tables and a batch of all tables.

---

## Onboarding Feature Tour & Releases

* Created a **Release History** list in [src/dashboard/onboarding.js](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/src/dashboard/onboarding.js) tracking system updates and versions.
* Added a **"What's New"** history button to the Help & Setup guide modal toolbar.
* Created a step-by-step **Guided Spotlight Tour** for the Customer Dues update that highlights:
  1. POS Customer Dropdown
  2. "Due" Payment Option
  3. Customers CRM Tab
  4. Outstanding Dues and Settlement flow
* Configured the tour coordinator to automatically display the "What's New" version update modal and prompt for the tour on dashboard load, and persist the seen state in `localStorage` so it does not repeat.
* Linked `onboarding.js` script tag in [dashboard.html](file:///c:/Users/MASTER%20PC/Downloads/restrosuite/dashboard.html).

---

## Code Synchronization
* Ran `sync-assets.ps1` to fully copy all modified files, directories, and configuration settings to the Android app assets folder (`android-app/app/src/main/assets/`).
