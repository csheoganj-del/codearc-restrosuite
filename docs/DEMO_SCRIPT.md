# RestroSuite — 15-minute demo script

Use outlet **`bbb`** (or a seeded demo tenant). Hard-refresh after deploys (`v62+`).

## Goal

Show: **login → sell → print/WhatsApp → bills → shift Z-report → inventory/reports**.

---

### 0:00 — Login (1 min)

1. Open production: `https://codearc-restrosuite.vercel.app/login.html`
2. Outlet slug / username / password for the demo tenant
3. Land on **POS** (Takeaway active by default)

**Talk track:** “Cloud SaaS POS — multi-station ready, works offline then syncs.”

---

### 1:00 — Station + shift (2 min)

1. Note **station chip** (top/ops bar) — rename if useful (“Counter 1”)
2. **Open shift** with float (e.g. ₹2000)
3. Toggle **This station / All stations** for Z-report scope
4. Point out **owner strip** (today sales, shift total) + **Day pack / Keys / Demo** buttons

**Talk track:** “Each counter has an identity; Z-report can reconcile this station or the whole floor. Day pack is today’s sales CSV in one click.”

---

### 2:00 — Full sale (4 min)

1. Tap 1–2 menu items  
2. Optional: customer name + phone (for WhatsApp)  
3. Payment **UPI** or **Cash** (exact)  
4. **Print & Pay**  
5. On **Bill settled**: show receipt preview  
6. Tap **WhatsApp** if phone set + gateway linked  

**Talk track:** “PDF matches this exact preview when gateway is linked; otherwise text fallback + WhatsApp Web.”

---

### 6:00 — Bills history (2 min)

1. Open **Bills**  
2. Search by bill no / phone  
3. Reprint + show refund gate (PIN if configured) — **cancel** (don’t destroy demo data unless intended)

**Talk track:** “Search spans local cache and server (`search_bills`) for older history.”

---

### 8:00 — Kitchen / QR (optional 2 min)

1. **QR Orders** or **KDS** if demo data has pending tickets  
2. Or skip if empty — mention QR table ordering + KDS

---

### 10:00 — Reports + export (2 min)

1. **Reports** → period **Today**  
2. Download **GSTR-ready CSV** (rich columns + totals row)  
3. Settings / export **Bills CSV** (station, shift, cashier, tenders)

---

### 12:00 — Close shift / Z-report (2 min)

1. **Preview Z** (open shift)  
2. **Close shift** → enter actual cash  
3. Show modal: **Print** + **CSV**  
4. Variance highlighted if mismatch  

**Talk track:** “Cashier reconciliation in under a minute — multi-station aware.”

---

### 14:00 — Help & next steps (1 min)

1. Click **Demo** on POS (or right-click **Help & Setup**) for the checklist  
2. Super-admin (if logging in as SA): tenants, gateway monitor  

---

## Demo checklist (print)

- [ ] Login  
- [ ] Open shift + station label  
- [ ] Complete 1 bill  
- [ ] Receipt preview  
- [ ] WhatsApp (or explain gateway)  
- [ ] Bills search  
- [ ] Reports / GSTR CSV  
- [ ] Z-report close + CSV  

## Recovery

| Issue | Fix |
|--------|-----|
| Stale UI | Hard refresh / `?appv=v61-…` |
| No menu | Load demo data (super-admin) or wait for cloud hydrate |
| WA PDF fails | Check Gateway monitor; text fallback still works |
| Auth errors | Confirm slug/user/pass; rate limit wait |

## Related docs

- `docs/DASHBOARD_SPLIT_MAP.md` — module architecture  
- `docs/USB_THERMAL_PRINTING.md` — silent/thermal print  
- `docs/whatsapp-gateway-deploy.md` — WA gateway  
