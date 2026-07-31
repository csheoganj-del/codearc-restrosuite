/* ============================================================
   RestroSuite — Growth Hub shell tiles (Wave 12)
   Full screens live in features-growth.js (RS.openGrowthHubScreen).
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel) {
    return document.querySelector(sel);
  }
  function $$(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  // Neutral meta — no vanity fake counts. Live modules open via openGrowthHubScreen.
  const HUB = [
    { ic: 'fa-calendar-check', bg: 'bg-o', t: 'Reservations', d: 'Manage table bookings & waitlist', m: 'Open' },
    { ic: 'fa-headset', bg: 'bg-v', t: 'Support Tickets', d: 'Customer queries & complaints', m: 'Open' },
    { ic: 'fa-truck-ramp-box', bg: 'bg-t', t: 'Purchase Orders', d: 'Raise & track supplier POs', m: 'Open' },
    { ic: 'fa-flask-vial', bg: 'bg-g', t: 'Recipe Costing', d: 'Plate cost & margin calculator', m: 'Open' },
    { ic: 'fa-tags', bg: 'bg-a', t: 'Offers & Coupons', d: 'Build promos & festival deals', m: 'Open' },
    { ic: 'fa-bullhorn', bg: 'bg-o', t: 'WhatsApp Campaigns', d: 'Broadcast to your customer list', m: 'Open' },
    { ic: 'fa-star', bg: 'bg-v', t: 'Feedback & Reviews', d: 'Collect & respond to ratings', m: 'Open' },
    { ic: 'fa-gift', bg: 'bg-g', t: 'Loyalty Program', d: 'Points, tiers & rewards', m: 'Open' },
    { ic: 'fa-graduation-cap', bg: 'bg-a', t: 'Learning Center', d: 'PDFs, videos & training for your team', m: 'Open' },
  ];

  function liveMeta(title) {
    try {
      if (title === 'Reservations' && global.RS_DB) {return null;} // async paint later
      if (title === 'Offers & Coupons' && global.RS && Array.isArray(RS.OFFERS)) {
        const n = RS.OFFERS.filter((o) => !o.status || o.status === 'active').length;
        return n ? n + ' live' : 'Open';
      }
      if (title === 'Loyalty Program' && global.RS && Array.isArray(RS.CUSTOMERS)) {
        return RS.CUSTOMERS.length ? RS.CUSTOMERS.length + ' members' : 'Open';
      }
    } catch (_) {}
    return null;
  }

  function renderHub() {
    const grid = $('#hub-grid');
    if (!grid) {return;}
    grid.innerHTML = HUB.map((h) => {
      const meta = liveMeta(h.t) || h.m;
      return `
      <div class="hub-card" role="button" tabindex="0" data-hub="${_e(h.t)}">
        <div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div>
        <h4>${_e(h.t)}</h4><p>${_e(h.d)}</p>
        <span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${_e(meta)}</span>
      </div>`;
    }).join('');
    $$('#hub-grid .hub-card').forEach((c) => {
      const open = () => {
        const screen = c.dataset.hub || c.querySelector('h4')?.textContent || '';
        if (global.RS && typeof RS.openGrowthHubScreen === 'function') {
          RS.openGrowthHubScreen(screen);
          return;
        }
        toast('Growth Hub module is still loading. Try again in a moment.', 'fa-arrow-up-right-from-square');
      };
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function renderGrowthHub() {
    return renderHub();
  }

  global.RSGrowthHubShell = { renderHub, renderGrowthHub, HUB };

  function attach() {
    if (!global.RS) {return;}
    global.RS.renderGrowthHub = renderGrowthHub;
  }
  if (global.RS) {attach();}
  document.addEventListener('rs:ready', attach);
})(typeof window !== 'undefined' ? window : globalThis);
