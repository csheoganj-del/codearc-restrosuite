# RestroSuite — Mobile & Tablet Optimization Audit
**Date:** June 2026  
**Repo:** github.com/csheoganj-del/codearc-restrosuite  
**Live:** restrosuite.codearc.co.in

---

## Summary

The codebase has solid foundational setup (PWA meta, correct viewport tag, touch press feedback on buttons) but has **7 significant gaps** that will cause broken or painful experiences on phones (≤600px) and tablets (601px–1024px). The POS dashboard is the most affected area.

---

## Issue 1 — CRITICAL: Sidebar Is Touch-Inaccessible on Tablet

**File:** `dashboard-styles.css` · Lines 147–184

**What's happening:**  
The sidebar defaults to `transform: translateX(-95%)` — collapsed, showing only a ~12px sliver. It expands on `:hover`. On desktop (≥1025px) it's always visible. But on tablets (601–1024px) the sidebar is permanently collapsed and can only "open" via hover — **which doesn't work on touchscreens**. There's no hamburger toggle button in CSS.

**Fix — add a hamburger toggle and overlay:**

```css
/* In dashboard-styles.css */

/* 1. Show hamburger toggle on touch/tablet */
.sidebar-hamburger {
  display: none;
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 200;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--white);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  color: var(--text-dark);
}

@media (max-width: 1024px) {
  .sidebar-hamburger {
    display: flex;
  }
  /* Backdrop overlay when sidebar is open */
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 140;
  }
  .sidebar.reveal + .sidebar-overlay,
  .sidebar-overlay.active {
    display: block;
  }
}
```

```html
<!-- Add to dashboard.html, just before .sidebar div -->
<button class="sidebar-hamburger" id="sidebarToggle" aria-label="Open menu">
  <i class="fa fa-bars"></i>
</button>
<div class="sidebar-overlay" id="sidebarOverlay"></div>
```

```js
// Add to dashboard.js
const toggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebarOverlay');
toggle?.addEventListener('click', () => {
  sidebar.classList.toggle('reveal');
  overlay.classList.toggle('active');
});
overlay?.addEventListener('click', () => {
  sidebar.classList.remove('reveal');
  overlay.classList.remove('active');
});
```

---

## Issue 2 — CRITICAL: POS Layout Breaks on Tablet

**File:** `dashboard-styles.css` · Line 1366–1372

**What's happening:**  
```css
.pos-layout {
  grid-template-columns: 1fr 380px; /* Fixed 380px cart panel */
}
```
On a tablet in portrait (768px wide), the usable content area is ~754px (mobile mode: 768-14px). A fixed 380px cart takes **50%+ of the screen**, leaving only ~374px for the entire menu grid. On phones it's completely broken — the 380px panel itself overflows the viewport.

**Fix:**

```css
/* In dashboard-styles.css — add after existing .pos-layout rule */

@media (max-width: 1024px) {
  .pos-layout {
    grid-template-columns: 1fr 320px; /* Narrower cart on tablet */
  }
}

@media (max-width: 768px) {
  .pos-layout {
    grid-template-columns: 1fr; /* Stack vertically on phone */
    grid-template-rows: 1fr auto;
  }
  .pos-cart-side {
    max-height: 45vh;
    overflow-y: auto;
  }
  /* Or use a slide-up drawer for cart on mobile */
}
```

---

## Issue 3 — HIGH: Touch Targets Too Small

**Files:** `dashboard-styles.css`, `styles.css`

Multiple interactive elements are below the 44×44px minimum recommended touch target:

| Element | Current Size | Fix |
|---------|-------------|-----|
| `.pos-customize-btn` | 30×30px (40px only at ≤600px) | Set to 44×44px at all sizes ≤1024px |
| `.pos-cat-btn` | 34px height | Increase to min 44px on mobile |
| `.pos-search-bar input` | 32px height | Increase to 44px on mobile |
| `.cust-qty-btn` (self-order) | 26×26px | Increase to 40–44px |

**Fix:**

```css
@media (max-width: 1024px) {
  .pos-cat-btn {
    height: 44px;
    padding: 0 18px;
  }
  .pos-search-bar input {
    height: 44px;
    font-size: 16px; /* Prevents iOS zoom on focus */
    padding: 0 14px 0 36px;
  }
  .pos-customize-btn {
    width: 40px;
    height: 40px;
    opacity: 1; /* Always visible on touch, not just hover */
  }
  .cust-qty-btn {
    width: 40px;
    height: 40px;
  }
}
```

---

## Issue 4 — HIGH: Input Font-Size Triggers iOS Zoom

**Files:** `dashboard-styles.css`, `styles.css`

Any `<input>` with `font-size` below 16px causes iOS Safari to auto-zoom in on focus. The following inputs have sub-16px font sizes:

- `.pos-search-bar input` — `font-size: 12px`
- `.login-input` — `font-size: 15px`

You've suppressed this with `maximum-scale=1.0, user-scalable=no` on the viewport (see Issue 5), which is the wrong approach.

**Fix:** Set all inputs to `font-size: 16px` on mobile:

```css
@media (max-width: 768px) {
  input, select, textarea {
    font-size: 16px !important;
  }
}
```

---

## Issue 5 — MEDIUM: `user-scalable=no` Breaks Accessibility

**Files:** `login.html` · Line 2, `dashboard.html` · Line 2

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, 
  maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

`user-scalable=no` prevents users from pinching to zoom. This is a WCAG 2.1 AA violation (Success Criterion 1.4.4) and causes real problems for users with visual impairment. iOS 10+ ignores this flag, but Android browsers still respect it.

The reason it was added is likely to prevent the iOS double-tap zoom glitch. The correct fix is to remove `user-scalable=no` and instead handle zoom via CSS.

**Fix:**

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

Then fix the underlying zoom causes (input font sizes ≥16px, no double-tap links).

---

## Issue 6 — MEDIUM: Dashboard Header Overflows on Narrow Screens

**File:** `dashboard-styles.css` · Line ~503

```css
.dashboard-header {
  padding: 18px 32px;
  grid-template-columns: auto 1fr auto;
}
```

No responsive breakpoint exists for the header. On tablets/phones the 32px horizontal padding wastes space, and the 3-column grid can squeeze the title area.

**Fix:**

```css
@media (max-width: 768px) {
  .dashboard-header {
    padding: 12px 16px;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
  }
  /* Hide less-critical header items on small screens */
  .header-meta, .header-date {
    display: none;
  }
}
```

---

## Issue 7 — MEDIUM: Missing Tablet Breakpoint Gap (768px–1024px)

**All CSS files**

The dashboard CSS has only two main breakpoints: `min-width: 1025px` (desktop) and `max-width: 640px` / `max-width: 600px` (phone). There is **no 768px tablet breakpoint** for: KDS view, Order Management, Reports, Staff screen, or Settings.

This means tablets in portrait mode (768px) get neither the full desktop layout nor a compact mobile layout — they get whatever the 14px sidebar-sliver mode renders, which is the worst of both worlds.

**Recommended breakpoint strategy:**

```css
/* Phone */
@media (max-width: 640px) { ... }

/* Tablet portrait — ADD THIS */
@media (min-width: 641px) and (max-width: 1024px) { ... }

/* Desktop */
@media (min-width: 1025px) { ... }
```

---

## Issue 8 — LOW: Landing Page Footer Cramps at Tablet Width

**File:** `styles.css`

```css
.footer-grid {
  grid-template-columns: 1.5fr 1fr 1fr 1.2fr; /* 4 columns */
}
@media (max-width: 768px) {
  .footer-grid { grid-template-columns: 1fr; }
}
```

At exactly 768px (iPad portrait) the footer grid is still 4 columns, which is cramped. The breakpoint fires at `max-width: 768px` but needs to cover tablets too.

**Fix:**

```css
@media (max-width: 1024px) {
  .footer-grid {
    grid-template-columns: 1fr 1fr; /* 2 columns on tablet */
    gap: 32px;
  }
}
@media (max-width: 640px) {
  .footer-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## What's Already Done Well ✅

- Viewport meta tag is present on all pages
- PWA manifest, apple-touch-icon, theme-color all set up properly
- `.pos-items-grid` uses `auto-fill, minmax(115px, 1fr)` — will auto-adapt to screen width
- `.pos-cat-btn` categories are horizontally scrollable (`overflow-x: auto`) — good for mobile
- `clamp()` used on hero/section title font sizes — responsive typography
- `active` state on `.pos-item-card` gives tactile press feedback on touch
- `@media (hover: none)` used for `.pos-customize-btn` — partial awareness of touch devices
- Customer QR self-ordering cart is a full-screen drawer — good mobile UX pattern
- `overflow-x: hidden` on body prevents horizontal scrolling

---

## Priority Order for Fixes

1. **Issue 1** — Sidebar hamburger toggle (blocks all tablet navigation)
2. **Issue 2** — POS layout responsive grid (breaks core workflow on tablet)
3. **Issue 3** — Touch target sizes (affects every interaction)
4. **Issue 4** — Input font size ≥16px (iOS zoom issue)
5. **Issue 5** — Remove `user-scalable=no`
6. **Issue 6** — Header padding on mobile
7. **Issue 7** — Add 768px tablet breakpoint across dashboard views
8. **Issue 8** — Footer grid on tablet
