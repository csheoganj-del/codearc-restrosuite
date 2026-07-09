# RestroSuite — Subscriptions, Billing & Licensing (operator guide)

How the whole money-and-lock loop fits together, what you can manage, and the
exact steps to switch it on.

## The loop (how "paid → auto-renew → stays unlocked" works)

1. A tenant picks a plan in **Settings → Plan & billing** and pays via Razorpay.
2. Razorpay charges them and fires **subscription.activated** → the webhook sets
   the tenant `active` + `plan_code` + `subscription_current_period_end` (paid-until).
3. Each month Razorpay auto-charges and fires **subscription.charged** → the
   webhook advances `subscription_current_period_end` and re-asserts `active`.
4. While the subscription is active, the **license-lease** function keeps issuing
   fresh 3-day signed leases to each device, so the apps stay unlocked with no
   action from anyone.
5. If payment stops (cancelled / final failure) → the webhook flips the tenant to
   `canceled/suspended` → the lease server refuses new leases → every device
   locks itself within ≤ 3 days, online or offline. Renewing reverses it
   automatically on the next successful charge.

## What you can manage (superadmin dashboard)

Open the superadmin dashboard (sign in as `superadmin`).

- **Per-outlet subscription** — click any workspace → the manage modal now has
  **Plan**, **Billing status** (trialing/active/past_due/canceled), and a new
  **Renews on (paid until)** date. Edit and Save to grant/extend/cut off access.
- **Licensing & Devices** (same modal) — see every device that activated a
  licence, when it last renewed, and **Revoke / Restore** any device (a revoked
  device locks within one offline window).
- **Plan pricing** — click the **Platform MRR** card on the superadmin overview
  to open the pricing editor: set each plan's **monthly price, currency,
  Razorpay plan id, and whether tenants can self-select it**. No code deploy.

## What tenants can do themselves

Settings → **Plan & billing** shows their current plan, status, renewal date, and
all public plans with prices. **Choose <plan>** opens Razorpay checkout; once paid,
the webhook activates them automatically.

## One-time setup steps

### A. Offline licensing keys (required for the lock to work)
1. `node scripts/generate-license-keys.js` (embeds the public key, prints the private key).
2. `supabase secrets set LICENSE_SIGNING_KEY="<printed private key>"`
3. `supabase secrets set LICENSE_OFFLINE_WINDOW_DAYS=3`

### B. Database
4. `supabase db push`  (adds the device registry, `saas_tenant_is_active()`, and
   plan-pricing columns).

### C. Edge functions
5. Make sure these secrets exist (most already do): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPERADMIN_SESSION_SECRET`, `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`, `ALLOWED_ORIGINS`.
6. Deploy:
   ```
   supabase functions deploy license-lease
   supabase functions deploy razorpay-route
   supabase functions deploy razorpay-webhook
   supabase functions deploy tenant-admin
   ```

### D. Razorpay (for auto-renew + self-serve checkout)
7. In the Razorpay dashboard, create a **Subscription Plan** for each paid tier
   (Growth, Enterprise) → copy each `plan_XXXX` id.
8. In the superadmin **Plan pricing** editor, paste each `plan_XXXX` id and set
   the price. (Plans without a Razorpay id still work for manual/superadmin
   assignment; tenants just see "Contact to upgrade" instead of a checkout.)
9. In Razorpay **Webhooks**, point a webhook at the `razorpay-webhook` function
   URL and enable events: `subscription.activated`, `subscription.charged`,
   `subscription.cancelled`, `subscription.completed`, `payment.failed`
   (plus `payment.captured` if you use Route for customer bills).

### E. Clients
10. Web/PWA: deploy the repo (Vercel). The bumped service-worker cache pushes the
    licence guard to all clients.
11. Desktop: run the desktop asset sync, rebuild the Electron app.
12. Android: run `sync-assets.ps1`, bump `versionCode`, rebuild (the
    `androidx.security:security-crypto` dependency was added).

## Verify
```
node scripts/generate-license-keys.js --dev
node scripts/test-license-guard.js     # 18 checks, all green
```

## Notes / choices baked in
- **Offline window: 3 days.** Change with `LICENSE_OFFLINE_WINDOW_DAYS` (server)
  and `OFFLINE_WINDOW_MS` / `BOOTSTRAP_GRACE_MS` in `assets/license-config.js`.
- **Grace on rollout.** First-ever devices get a 3-day bootstrap grace and every
  layer **fails open** on internal errors, so shipping this won't lock a paying
  outlet by surprise.
- **A payment failure does not instantly lock.** It stays active through
  Razorpay's automatic retries; only a final cancellation stops leases. Adjust in
  `razorpay-webhook` (`payment.failed`) if you want stricter dunning.
- **MRR** now counts only active/trialing tenants at their real (DB) plan price.
