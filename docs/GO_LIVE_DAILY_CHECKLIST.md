# Go-live / daily open checklist (owners & staff)

**Time:** ~5–10 minutes  
**Goal:** Prove login, POS, print, and WhatsApp before the lunch rush.  
**Rule:** No engineer language. Green = sell. Red = fix before peak.

---

## Every morning (or first open of the day)

| # | Check | How | Pass looks like |
|---|--------|-----|-----------------|
| 1 | **Sign in** | Open RestroSuite (desktop or browser) → login | Your outlet name in the sidebar |
| 2 | **App version** | Top bar version chip | Desktop: `App 2.0.x · Features v###` · Web: `v###` |
| 3 | **Printer** | Top bar printer chip → POS58 (or your thermal) | Chip shows printer name, not empty |
| 4 | **Print mode** | Settings → Printers → Receipt print mode | **HTML + QR** (pretty) or **Thermal text** (fast) — pick one |
| 5 | **Test print** | Sell one item → Pay → Print | Paper has items + total (and QR if HTML mode). **Not** solid black. **Not** only “Printing…” |
| 6 | **WhatsApp** | Green WhatsApp icon in top bar | Tooltip: **WhatsApp linked · OK** (or “WhatsApp working · OK”) |
| 7 | **Open checklist** | Sidebar **Open checklist** (or Help area) | All required items green → **Start selling** |

If any required item fails, fix it **before** peak service.

---

## Weekly burn-in (quality week)

Run the morning table **once per day for 7 days**. Log results:

| Day | Date | Login | Print | WhatsApp | Notes |
|-----|------|-------|-------|----------|-------|
| 1 | | ☐ | ☐ | ☐ | |
| 2 | | ☐ | ☐ | ☐ | |
| 3 | | ☐ | ☐ | ☐ | |
| 4 | | ☐ | ☐ | ☐ | |
| 5 | | ☐ | ☐ | ☐ | |
| 6 | | ☐ | ☐ | ☐ | |
| 7 | | ☐ | ☐ | ☐ | |

**Pass criterion for “10/10 confidence”:** 7/7 days with zero black/garbled receipts and WhatsApp status understood by staff.

---

## Print troubleshooting (owner language)

| Problem | Fix |
|---------|-----|
| Solid black paper | Update desktop App to latest; use **HTML + QR** or switch to **Thermal text** |
| No paper / wrong printer | Top bar → choose POS58; check USB cable |
| Chrome opens every time | Normal for HTML mode — should auto-print; if not, press Print once |
| Want no Chrome flash | Settings → Receipt print mode → **Thermal text (fast)** |

---

## WhatsApp troubleshooting (owner language)

| Problem | Fix |
|---------|-----|
| Icon says **Off** | Settings → WhatsApp → scan QR with restaurant phone |
| Icon spinning | Wait 30s; if stuck, Settings → WhatsApp → refresh |
| Bills not arriving | Customer phone must include country code (e.g. 91…) |

---

## Support

Email: **support@codearc.co.in**  
When writing, include the top-bar version text (click the version chip to copy).
