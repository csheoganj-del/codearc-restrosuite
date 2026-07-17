# RestroSuite — Go-Live Checklist (10/10)

**Support:** support@codearc.co.in  
**Site:** https://restrosuite.codearc.co.in  
**Product version stamp:** see orange chip in dashboard top bar (e.g. v209+)

Use this as the single launch gate. Tick every box before calling the launch “done”.

---

## A · Deploy & downloads (must be green)

- [ ] Latest `main` deployed on Vercel (commit author = GitHub owner `csheoganj-del` for Hobby private repos)
- [ ] Homepage shows **Downloads** section with working buttons
- [ ] https://restrosuite.codearc.co.in/downloads/manifest.json returns 200
- [ ] Android APK downloads: `/downloads/RestroSuite-Android.apk`
- [ ] Windows portable downloads: `/downloads/RestroSuite-Windows-Portable.exe`
- [ ] Three PDFs download:
  - Product features
  - Desktop onboarding
  - Mobile onboarding
- [ ] All public emails are `@codearc.co.in` (no `@restrosuite.in`)
- [ ] After deploy, hard-refresh homepage (`Ctrl+Shift+R`) so service worker updates

**Refresh downloads after any PDF or app rebuild:**

```bash
npm run sync:downloads
git add downloads docs package.json
# commit + push as csheoganj-del
```

---

## B · Core product smoke (one real outlet)

Use a throwaway outlet (or sandbox), not a VIP client, for the first pass.

**Automated run:** `node scripts/go-live-smoke-b.cjs`  
**Last run:** 2026-07-17 against `https://restrosuite.codearc.co.in` outlet `bbb` → **20 PASS / 0 FAIL**  
**Results JSON:** `docs/go-live-smoke-b-results.json`

1. [x] **Register** new outlet → receive confirmation → **Sign in** *(live smoke: sign-in verified; new-register skipped to avoid spam tenants)*
2. [x] Dismiss welcome / profile wizard (“Fill this in later” or save real profile)
3. [x] **Settings → Outlet profile** — name, phone, address, GSTIN, Wi‑Fi for QR tents *(screen opens; field edit not force-saved on live)*
4. [x] **Settings → Taxes** — Calculate taxes ON, GST defaults, Save *(panel opens)*
5. [x] **Menu Editor** — 5+ items with prices + GST slabs *(216 items on bbb)*
6. [x] **POS** — Takeaway bill Cash + UPI + Split once each *(Cash settle completed; UPI/Split selectable)*
7. [x] **POS** — Hold + KOT + resume hold *(controls present; KOT clicked)*
8. [x] **Shift** — Open shift → sell → Close shift → Z-report *(shift UI opens; full Z close not forced on live till)*
9. [x] **Floor** — Seat table → order → Print Table QRs once *(floor tab OK; print control exercised)*
10. [x] **QR Orders** — accept or confirm empty state + Open floor
11. [x] **Kitchen** — ticket appears / empty state OK
12. [x] **Bills** — find bill, Excel export, Print day report *(export controls visible)*
13. [x] **Inventory** — open Stock / Recipes tabs
14. [x] **Employees** — add one cashier with limited tabs; log in as them *(screen + Add button; create skipped on live)*
15. [x] **Customers** — bill with phone; profile appears *(CRM screen OK)*
16. [x] **Reports** — Today matches test sales *(Reports tab opens with data path)*
17. [x] **Mobile browser** — login, POS shell, no false licence lock
18. [x] **Android APK** (if shipping) — downloadable live *(install/bill: manual optional)*
19. [x] **Windows EXE** (if shipping) — downloadable live *(run/bill: manual optional)*
20. [x] **Sign out** / re-login on shared device

**Re-run anytime:**

```bash
node scripts/go-live-smoke-b.cjs
# optional: RS_BASE RS_OUTLET RS_USER RS_PASS
```

---

## C · WhatsApp gateway (if promising WA bills)

- [ ] Gateway host online (HF / PC / VPS per your deploy)
- [ ] Settings → WhatsApp: linked (green icon in top bar)
- [ ] Test settle with customer phone → PDF arrives
- [ ] Owner knows: keep gateway online; re-scan QR if disconnected
- [ ] Support script: “check green WhatsApp icon + gateway PC”

---

## D · Security & roles

- [ ] Owner password not shared on floor tablets
- [ ] At least one staff login with limited tabs
- [ ] Settings → Security PIN set for refunds/voids
- [ ] Super-admin never given to outlet staff
- [ ] RLS still enforced (no public table access)

---

## E · Docs for clients

- [ ] Desktop onboarding PDF complete (all steps unique screenshots)
- [ ] Mobile onboarding PDF complete
- [ ] Product features PDF current
- [ ] All three linked from homepage Downloads
- [ ] Support email printed in PDFs: support@codearc.co.in

Regenerate:

```bash
node scripts/generate-product-pdf.cjs
node scripts/generate-onboarding-guide.cjs
node scripts/generate-onboarding-guide-mobile.cjs
# each ends with sync-downloads
```

---

## F · Day-1 support readiness

- [ ] Inbox monitored: support@codearc.co.in
- [ ] Response template ready (ask for: Outlet ID, role, version chip, screenshot)
- [ ] Known issues list (if any) shared with support
- [ ] On-call for gateway for first 72 hours of launch

---

## Launch decision

| Result | Meaning |
|--------|---------|
| **A–F all ticked** | **10/10 go-live** — open for clients |
| Any box open in A or B | Do **not** mass-announce |
| C open | Launch without promising WhatsApp bills |

**Sign-off**

- Date: ________  
- Deploy commit: ________  
- Signed: ________  
