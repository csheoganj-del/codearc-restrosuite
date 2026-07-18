# RestroSuite — Launch readiness (target 10/10)

**Site:** https://restrosuite.codearc.co.in  
**Install all devices:** https://restrosuite.codearc.co.in/install  
**Live status:** https://restrosuite.codearc.co.in/status  
**Support:** support@codearc.co.in  
**Binaries:** https://github.com/csheoganj-del/restrosuite-downloads/releases/tag/v2.0.4  

---

## What “10/10” means here

| Layer | Target |
|-------|--------|
| **Product core** | Login, POS, bills, shifts, menu, roles work on web + desktop + Android |
| **Every device path** | Documented + one-click install for Windows, Android, iOS PWA, browser |
| **Downloads** | Large EXEs on GitHub Releases (not blocked by Vercel Hobby) |
| **Cloud config** | `/api/config` + `/api/health` green on production |
| **Tests** | `npm test` + `npm run check:launch` green |

### Items that need *your* paid accounts (code alone cannot finish)

| Item | Why | Status after this pack |
|------|-----|-------------------------|
| Windows code-signing cert | Removes SmartScreen | Guide on `/install` — cert ~$70–400/yr |
| Google Play listing | Trust + auto-update | APK ready; needs Play Console |
| Apple App Store | Native iOS | Safari **Add to Home Screen** is the free 10/10 path |
| Always-on WhatsApp gateway | OTP + bill PDF | Env + Railway/VPS per `docs/whatsapp-gateway-deploy.md` |

---

## Device matrix (launch answer = YES)

| Device / user | How they launch | Ready |
|---------------|-----------------|-------|
| Counter Windows PC | Setup or Portable 2.0.4 | **YES** |
| Android kitchen phone/tablet | APK 2.0.4 | **YES** |
| iPhone / iPad owner | Safari → Add to Home Screen | **YES** (PWA) |
| Chrome / Edge / Firefox | Web login | **YES** |
| Chromebook | Web / PWA | **YES** |
| Shared staff device | Sign out only when switching users | **YES** (documented) |
| New self-serve registration | OTP via WhatsApp | **YES if gateway online** |

---

## Operator commands

```bash
# After any desktop/android rebuild
npm run release:binaries   # sync + GitHub release + manifest
npm run pages:build
# deploy publish-static → restrosuite-live

# Gate
npm test
npm run check:launch
```

---

## Sign-off

- [ ] `/status` shows LAUNCH CORE: GREEN  
- [ ] `/install` reviewed on phone + PC  
- [ ] One real bill + print (or PDF) on Windows  
- [ ] One real bill on Android  
- [ ] iPhone: Add to Home Screen + login  
- [ ] WhatsApp test **or** accept zero-cost mode without WA  
- [ ] Support email watched: support@codearc.co.in  

**Engineering pack complete when tests + health + install paths are green.**  
**Business 10/10** when the sign-off boxes above are ticked by a human once.
