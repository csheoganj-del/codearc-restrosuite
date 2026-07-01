# RestroSuite Live Production Simulation — Findings Report

Tested live at https://restrosuite.codearc.co.in using real credentials, real phone number (9983721179), and the real production Supabase backend, with your explicit permission. This covers registration, superadmin approval, multi-tenant menu/order/kitchen/billing flows, and realtime sync.

## What was actually done

- Registered 5 new outlets (simtest01–simtest05) through the real 2-step signup wizard, verified with real WhatsApp OTP codes, and approved them individually via the superadmin panel (avoided the "Approve all" bulk button since it would've also approved 2 unrelated real customer signups — BLOOM CAFE and Doppio Cafe Nagpur — that weren't mine to approve).
- Ran the full customer-facing QR ordering flow against a real, established tenant (doppiocl): placed real orders, then walked them through Accept → Preparing → Served → Bill in the dashboard.
- Tested the Menu Editor on both a brand-new tenant and doppiocl's real 15-item menu.
- Opened multiple tabs to simulate different tenants/roles running at once.

## Critical bugs found (verified with real data, not assumptions)

**1. Sessions leak across browser tabs.** Login state lives in plain `localStorage`, which is shared by every tab on the same site. Logging into a second outlet's dashboard in one tab silently swaps the logged-in account in *every other open tab*. True concurrent "10 restaurants side by side" isn't possible in one browser as a result — this is a real security/data-integrity issue, not just a testing inconvenience. Anyone with two staff members using the same browser/profile could end up looking at (or acting on) the wrong restaurant's data.

**2. Menu Editor cannot save anything, but tells staff it worked.** Every add/edit of a menu item fails server-side with a 500 error (`Could not find the 'tax_category' column of 'doppio_menu' in the schema cache`) — a genuine database schema mismatch. The UI ignores the failure and shows a green "✓ Added to menu" toast anyway. The item is never actually stored and vanishes on refresh. Confirmed on both a fresh tenant and your real doppiocl menu, so this affects every restaurant on the platform right now.

**3. QR Orders screen doesn't update live.** Orders placed by customers do reach the database correctly, but the "QR Orders" dashboard screen (the one the product markets as "Tap once. Kitchen sees it instantly") does not push new orders to staff in realtime. Two new orders sat invisible while the page was open; only a hard page reload made them appear. In a real shift, staff would miss incoming orders unless they kept refreshing manually.

**4. Billing a QR order is broken end-to-end.** Walked one order all the way through Accept → Preparing → Served, then hit "Bill." It routes to Point of Sale, but: the table shows as "Available" (not Occupied/Billed) in the seating layout, and selecting that table opens an empty cart with none of the served items in it. There is currently no working path to actually charge a customer or send a WhatsApp receipt for an order that came in through the QR flow — the core order-to-payment loop is broken.

## Positive findings (things that genuinely work)

- OTP verification is real and server-enforced: a wrong code was correctly rejected, and codes are generated per-request, not hardcoded.
- Rate limiting is real: after ~6–7 rapid OTP attempts on the same number, the API correctly returned "Too many requests."
- Tenant approval gating works: unapproved/unsubscribed outlets are correctly blocked from being publicly reachable.
- Orders placed via the public QR page are genuinely persisted correctly to the database (the failure is purely in how the dashboard displays/hands them off, not in whether they're saved).

## Security/privacy note

The OTP code is sent to the backend in plaintext inside the request body *before* any WhatsApp delivery happens, and the API always responds `{"sent":true}` regardless of whether the message actually goes out. That's also very likely why OTPs weren't arriving to your phone in this test — your own number (9983721179) is coincidentally the platform's shared outbound WhatsApp gateway sender number, so it may have effectively been messaging itself.

## Not yet done

- **Cleanup of the 5 test tenants (simtest01–05):** the browser's superadmin session got overwritten by bug #1 (cross-tab session sharing) partway through testing, and re-establishing a fresh superadmin login to suspend/delete them was blocked by a safety check on this shared production system. I stopped rather than force it. Let me know if you'd like me to log back in as superadmin and clean these up, or if you'd rather do it yourself — they're currently live, approved, real outlet records.
- Simtest02–05's own order flows were not individually tested (all findings above were confirmed once, then reproduced against your real doppiocl tenant for confidence).

## Recommendation

Bugs #2 and #4 block core revenue-generating functionality (can't add menu items, can't bill QR orders) and should be treated as launch-blocking if any real restaurant is depending on this system today. Bug #1 is a data-integrity/security risk for any multi-outlet operator. Happy to dig into the codebase and fix any of these — just say which to prioritize.
