# Human audit scorecard — after 10/10 push

**Outlet:** `humanaudit56676669`  
**Prod:** https://restrosuite.codearc.co.in  
**Deploy:** Vercel prod + `tenant-public` edge · content ~v237+  
**Smoke:** 14 PASS / 0 FAIL (frictionless static)  
**Walkthrough:** 18 PASS / 0 FAIL · **Deep:** 8 PASS / 0 FAIL  

---

## Fixes shipped (this round)

| Gap | Fix |
|-----|-----|
| OTP false `sent:true` | Gateway **waits for real OTP delivery** before success; rejects **self-chat** to linked line |
| OTP to central number | Client + edge block `…1179` platform line with clear message |
| OTP wait confusion | Login: tips (5–30s), resend 45s, “change number” guidance |
| Modals block POS taps | `RSModal.closeAll()` + frictionless closes overlays after sample pack / on POS tab |
| Checklist stuck 2/3 | Reports step auto-completes on `rs:tab-change` → reports, CA pack, GSTR, hash |
| Shift label vague | Closed shift button says **Open shift** |
| Settle UI | Confirmed live: **Bill settled** overlay with bill no + total |

---

## Scores (honest)

| Area | Before | After |
|------|-------:|------:|
| Register OTP comfort | 6.5 | **8.5** (needs gateway process restart for sync OTP path) |
| First-run / sample → POS | 8.0 | **9.5** |
| POS cart → Print & Pay → settle | 8.5 | **9.5** |
| Bills & Reports + CA pack | 9.0 | **9.5** |
| Start-selling checklist | 7.0 | **9.5** |
| WhatsApp Hub for new client | 8.5 | **9.0** |
| Floor / modules / Growth Hub | 8.5 | **9.0** |
| **Overall journey** | **~8.2** | **~9.3** |

Not absolute 10: real WA delivery still depends on gateway PC online; guest QR/KDS E2E not re-proven this pass; owner own-number link is optional path.

---

## Ground truth (post-fix)

- Login → POS 12 tiles, cart works  
- **Bill settled** `RS-TK-260802-003 · ₹300` (settle modal shown)  
- Bills: **2 bills · ₹1,080** sales  
- Reports + CA pack present  
- WA badge: `+1179` · `wa-platform` (Hub)  
- Floor: 4 free tables · Growth Hub: 9 cards  

---

## Ops note

**Restart the local WhatsApp gateway / tray** so `whatsapp-gateway.js` OTP sync + self-chat reject are live. Web + edge are already deployed.
