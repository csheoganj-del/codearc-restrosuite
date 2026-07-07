# QR Live Features - E2E Harness

Tests the REAL `tenant-public` edge function code (transpiled from TS, run against an
in-memory Supabase fake) plus the REAL `qr-order.html` tracker UI and
`assets/service-alerts.js` staff alert module in jsdom.

Covers: table-based order tracking (QR + waiter KOT), table-number normalization
(5 / 05 / T5 / Table 5), live status polling, checkout totals, waiter-call
creation, 45s dedupe, client cooldown, rate limiting, staff alert render + acknowledge sync.

Run:
    npm i -D esbuild jsdom        (one time)
    node tests/qr-live-harness/run.js
